"""
AgentEngine — Claude Tool Use agent loop wrapping QueryEngine.

Provides a 6-tool agent that can explore schemas, generate/fix SQL,
execute queries, suggest charts, and interact with users. Uses session
memory with auto-compaction at ~8K tokens.
"""

import json
import time
import logging
from dataclasses import dataclass, field
from typing import Any, Optional

import anthropic

from config import settings

_logger = logging.getLogger(__name__)

# ── Tool Definitions (Anthropic format) ──────────────────────────

TOOL_DEFINITIONS = [
    {
        "name": "find_relevant_tables",
        "description": (
            "Search the schema metadata via vector similarity to find tables "
            "relevant to the user's question. Returns table names and DDL summaries. "
            "Use this FIRST to discover which tables might answer the question."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "question": {
                    "type": "string",
                    "description": "The user's natural-language question to match against table descriptions.",
                }
            },
            "required": ["question"],
        },
    },
    {
        "name": "inspect_schema",
        "description": (
            "Get full DDL and 5 sample rows for a specific table. "
            "Use after find_relevant_tables to understand column types, "
            "relationships, and actual data values before writing SQL."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "table_name": {
                    "type": "string",
                    "description": "Exact table name to inspect.",
                }
            },
            "required": ["table_name"],
        },
    },
    {
        "name": "run_sql",
        "description": (
            "Validate and execute a SELECT SQL query against the user's database. "
            "The query is validated for safety (read-only, no dangerous keywords) "
            "and results are PII-masked. Returns columns, rows (max 100 preview), "
            "and total row count. Use this to test and run your generated SQL."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "sql": {
                    "type": "string",
                    "description": "The SELECT SQL query to execute.",
                }
            },
            "required": ["sql"],
        },
    },
    {
        "name": "suggest_chart",
        "description": (
            "Given query result columns and sample rows, suggest the best "
            "chart type and configuration for visualization. Returns a JSON "
            "object with chart_type and axis mappings."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "columns": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Column names from the query result.",
                },
                "sample_rows": {
                    "type": "array",
                    "items": {"type": "array"},
                    "description": "First 5-10 rows of data as arrays.",
                },
            },
            "required": ["columns", "sample_rows"],
        },
    },
    {
        "name": "ask_user",
        "description": (
            "Ask the user a clarifying question when the query is ambiguous "
            "or you need more information. Optionally provide clickable options. "
            "The agent loop pauses until the user responds."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "question": {
                    "type": "string",
                    "description": "The question to ask the user.",
                },
                "options": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Optional list of suggested answers the user can click.",
                },
            },
            "required": ["question"],
        },
    },
    {
        "name": "summarize_results",
        "description": (
            "Generate a concise natural-language summary of query results. "
            "Use after run_sql to explain what the data shows."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "question": {
                    "type": "string",
                    "description": "The original user question.",
                },
                "data_preview": {
                    "type": "string",
                    "description": "A text preview of the query results (columns + first rows).",
                },
            },
            "required": ["question", "data_preview"],
        },
    },
]


# ── Data Classes ─────────────────────────────────────────────────

@dataclass
class AgentStep:
    """A single step in the agent's execution."""
    type: str  # "thinking", "tool_call", "ask_user", "result", "error"
    content: str = ""
    tool_name: str = ""
    tool_input: Any = None
    tool_result: Any = None

    def to_dict(self) -> dict:
        return {
            "type": self.type,
            "content": self.content,
            "tool_name": self.tool_name,
            "tool_input": self.tool_input,
            "tool_result": self.tool_result,
        }


@dataclass
class AgentResult:
    """Final result of an agent run."""
    steps: list = field(default_factory=list)
    final_answer: str = ""
    sql: str = ""
    columns: list = field(default_factory=list)
    rows: list = field(default_factory=list)
    chart_suggestion: Optional[dict] = None
    error: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "steps": [s.to_dict() if isinstance(s, AgentStep) else s for s in self.steps],
            "final_answer": self.final_answer,
            "sql": self.sql,
            "columns": self.columns,
            "rows": self.rows,
            "chart_suggestion": self.chart_suggestion,
            "error": self.error,
        }


# ── Session Memory ───────────────────────────────────────────────

class SessionMemory:
    """Conversation memory scoped to a chat_id with auto-compaction."""

    TOKEN_LIMIT = 8000  # Approximate token limit before compaction

    def __init__(self, chat_id: str):
        self.chat_id = chat_id
        self._messages: list[dict] = []
        self.last_used: float = time.monotonic()
        self._user_response: Optional[str] = None

    def add_turn(self, role: str, content: str):
        self._messages.append({"role": role, "content": content})
        self.last_used = time.monotonic()

    def get_messages(self) -> list[dict]:
        return list(self._messages)

    def compact(self):
        """Summarize old messages when estimated tokens exceed limit."""
        raw = json.dumps(self._messages)
        estimated_tokens = len(raw) // 4
        if estimated_tokens <= self.TOKEN_LIMIT or len(self._messages) <= 2:
            return

        # Keep last 2 messages, summarize the rest
        to_summarize = self._messages[:-2]
        keep = self._messages[-2:]

        summary_text = self._summarize_messages(to_summarize)
        self._messages = [
            {"role": "user", "content": f"[Previous conversation summary]: {summary_text}"},
        ] + keep
        _logger.info("Compacted session %s: %d messages → %d",
                      self.chat_id, len(to_summarize) + len(keep), len(self._messages))

    def _summarize_messages(self, messages: list[dict]) -> str:
        """Summarize a list of messages via Haiku."""
        try:
            client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
            convo_text = "\n".join(
                f"{m['role']}: {m['content'][:500]}" for m in messages
            )
            response = client.messages.create(
                model=settings.PRIMARY_MODEL,
                max_tokens=300,
                messages=[{
                    "role": "user",
                    "content": (
                        "Summarize this conversation concisely, preserving key facts, "
                        "decisions, SQL queries, table names, and user preferences:\n\n"
                        f"{convo_text}"
                    ),
                }],
            )
            return response.content[0].text
        except Exception as e:
            _logger.warning("Memory compaction failed: %s", e)
            # Fallback: just truncate
            return "; ".join(
                f"{m['role']}: {m['content'][:100]}" for m in messages[:5]
            )


# ── Agent Engine ─────────────────────────────────────────────────

class AgentEngine:
    """Claude Tool Use agent loop wrapping QueryEngine."""

    MAX_TOOL_CALLS = 6
    WALL_CLOCK_LIMIT = 30  # seconds
    MAX_SQL_RETRIES = 3

    SYSTEM_PROMPT = (
        "You are QueryCopilot, an AI data analyst agent. You help users explore "
        "databases and answer questions using SQL.\n\n"
        "WORKFLOW:\n"
        "1. Use find_relevant_tables to discover which tables might answer the question\n"
        "2. Use inspect_schema to understand table structure and sample data\n"
        "3. Write and run SQL using run_sql\n"
        "4. If SQL fails, analyze the error and retry with a corrected query\n"
        "5. Use summarize_results to explain what the data shows\n"
        "6. Use suggest_chart if the data would benefit from visualization\n"
        "7. Use ask_user only when the question is genuinely ambiguous\n\n"
        "RULES:\n"
        "- Only generate SELECT queries (read-only)\n"
        "- Always use LIMIT (max 5000) unless the user specifically needs all rows\n"
        "- If a query fails, fix the SQL based on the error — don't just retry the same query\n"
        "- Be concise in your responses\n"
        "- When you have enough information, provide your final answer directly\n"
    )

    def __init__(self, engine, email: str, connection_entry, memory: SessionMemory,
                 auto_execute: bool = True):
        self.engine = engine
        self.email = email
        self.connection_entry = connection_entry
        self.memory = memory
        self.auto_execute = auto_execute

        self.client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        self.primary_model = settings.PRIMARY_MODEL
        self.fallback_model = settings.FALLBACK_MODEL

        # Per-run state
        self._tool_calls = 0
        self._sql_retries = 0
        self._max_tool_calls = self.MAX_TOOL_CALLS
        self._waiting_for_user = False
        self._pending_question: Optional[str] = None
        self._pending_options: Optional[list] = None
        self._schema_cache: dict[str, str] = {}
        self._start_time: float = 0

        # Collected during run
        self._steps: list[AgentStep] = []
        self._result = AgentResult()

    def _check_guardrails(self):
        """Raise if any guardrail is exceeded."""
        if self._tool_calls >= self._max_tool_calls:
            raise AgentGuardrailError(
                f"Maximum tool calls ({self._max_tool_calls}) exceeded"
            )
        elapsed = time.monotonic() - self._start_time
        if elapsed > self.WALL_CLOCK_LIMIT:
            raise AgentGuardrailError(
                f"Wall-clock timeout ({self.WALL_CLOCK_LIMIT}s) exceeded"
            )

    def _dispatch_tool(self, name: str, tool_input: dict) -> str:
        """Dispatch a tool call by name. Returns result as string."""
        self._tool_calls += 1
        dispatch = {
            "find_relevant_tables": self._tool_find_relevant_tables,
            "inspect_schema": self._tool_inspect_schema,
            "run_sql": self._tool_run_sql,
            "suggest_chart": self._tool_suggest_chart,
            "ask_user": self._tool_ask_user,
            "summarize_results": self._tool_summarize_results,
        }
        handler = dispatch.get(name)
        if not handler:
            return json.dumps({"error": f"Unknown tool: {name}"})
        try:
            return handler(**tool_input)
        except NotImplementedError:
            return json.dumps({"error": f"Tool {name} not yet implemented"})
        except Exception as e:
            _logger.exception("Tool %s failed", name)
            return json.dumps({"error": str(e)})

    def run(self, question: str):
        """
        Run the agent loop for a given question.
        Yields AgentStep objects as the agent progresses.
        Returns AgentResult when complete.
        """
        self._start_time = time.monotonic()
        self._steps = []
        self._result = AgentResult()

        # Compact memory before starting
        self.memory.compact()

        # Add user question to memory
        self.memory.add_turn("user", question)

        # Build messages for Claude
        messages = self.memory.get_messages()
        model = self.primary_model
        escalated = False

        try:
            while True:
                self._check_guardrails()

                step = AgentStep(type="thinking", content="Analyzing...")
                self._steps.append(step)
                yield step

                try:
                    response = self.client.messages.create(
                        model=model,
                        max_tokens=settings.MAX_TOKENS,
                        system=self.SYSTEM_PROMPT,
                        tools=TOOL_DEFINITIONS,
                        messages=messages,
                    )
                except anthropic.APIError as e:
                    if not escalated:
                        _logger.warning("Primary model failed, escalating to %s: %s",
                                        self.fallback_model, e)
                        model = self.fallback_model
                        escalated = True
                        continue
                    raise

                # Process response content blocks
                has_tool_use = False
                assistant_content = response.content

                for block in assistant_content:
                    if block.type == "text" and block.text.strip():
                        # Final text response from Claude
                        self._result.final_answer = block.text.strip()

                    elif block.type == "tool_use":
                        has_tool_use = True
                        tool_name = block.name
                        tool_input = block.input

                        step = AgentStep(
                            type="tool_call",
                            tool_name=tool_name,
                            tool_input=tool_input,
                        )
                        self._steps.append(step)
                        yield step

                        # Execute the tool
                        tool_result = self._dispatch_tool(tool_name, tool_input)
                        step.tool_result = tool_result

                        # Check if agent is waiting for user
                        if self._waiting_for_user:
                            ask_step = AgentStep(
                                type="ask_user",
                                content=self._pending_question or "",
                                tool_input=self._pending_options,
                            )
                            self._steps.append(ask_step)
                            yield ask_step
                            # The caller must set memory._user_response and
                            # call resume() to continue
                            self._result.steps = self._steps
                            return self._result

                # Append assistant message
                messages.append({"role": "assistant", "content": assistant_content})

                if has_tool_use:
                    # Append tool results
                    tool_results_content = []
                    for block in assistant_content:
                        if block.type == "tool_use":
                            tool_result = None
                            for s in self._steps:
                                if s.tool_name == block.name and s.tool_input == block.input:
                                    tool_result = s.tool_result
                                    break
                            tool_results_content.append({
                                "type": "tool_result",
                                "tool_use_id": block.id,
                                "content": str(tool_result) if tool_result else "",
                            })
                    messages.append({"role": "user", "content": tool_results_content})
                else:
                    # No tool use — Claude is done
                    break

                if response.stop_reason == "end_turn":
                    break

        except AgentGuardrailError as e:
            err_step = AgentStep(type="error", content=str(e))
            self._steps.append(err_step)
            yield err_step
            self._result.error = str(e)
        except Exception as e:
            _logger.exception("Agent run failed")
            err_step = AgentStep(type="error", content=f"Agent error: {e}")
            self._steps.append(err_step)
            yield err_step
            self._result.error = str(e)

        # Add final answer to memory
        if self._result.final_answer:
            self.memory.add_turn("assistant", self._result.final_answer)

        # Emit final result step
        result_step = AgentStep(type="result", content=self._result.final_answer)
        self._steps.append(result_step)
        yield result_step

        self._result.steps = self._steps
        return self._result

    # ── Schema Tools (Task 2a) ──────────────────────────────────

    def _tool_find_relevant_tables(self, question: str) -> str:
        """Query ChromaDB for tables relevant to the user's question."""
        try:
            results = self.engine.schema_collection.query(
                query_texts=[question], n_results=8
            )
            tables = []
            if results and results.get("documents"):
                for doc_list in results["documents"]:
                    for doc in doc_list:
                        # Each doc is "Table: name\nDescription: ...\nColumns: ..."
                        lines = doc.split("\n")
                        table_name = ""
                        for line in lines:
                            if line.startswith("Table:"):
                                table_name = line.replace("Table:", "").strip()
                                break
                        tables.append({
                            "table": table_name,
                            "summary": doc[:500],
                        })
            return json.dumps({"tables": tables, "count": len(tables)})
        except Exception as e:
            _logger.exception("find_relevant_tables failed")
            return json.dumps({"error": str(e), "tables": []})

    def _tool_inspect_schema(self, table_name: str) -> str:
        """Get DDL + 5 sample rows for a table. Caches results."""
        if table_name in self._schema_cache:
            return self._schema_cache[table_name]

        try:
            schema_info = self.engine.db.get_schema_info()
            if table_name not in schema_info:
                return json.dumps({"error": f"Table '{table_name}' not found"})

            info = schema_info[table_name]
            ddl_lines = [f"Table: {table_name}"]
            ddl_lines.append("Columns:")
            for col in info["columns"]:
                nullable = "NULL" if col.get("nullable", True) else "NOT NULL"
                ddl_lines.append(f"  {col['name']} {col['type']} {nullable}")
            if info.get("primary_key"):
                ddl_lines.append(f"Primary Key: {', '.join(info['primary_key'])}")
            if info.get("foreign_keys"):
                for fk in info["foreign_keys"]:
                    ddl_lines.append(
                        f"FK: {', '.join(fk['columns'])} -> "
                        f"{fk['referred_table']}({', '.join(fk['referred_columns'])})"
                    )

            # Fetch 5 sample rows
            sample_rows = []
            try:
                # Quote table name to prevent injection
                quoted = f'"{table_name}"'
                is_valid, clean_sql, err = self.engine.validator.validate(
                    f"SELECT * FROM {quoted} LIMIT 5"
                )
                if is_valid:
                    df = self.engine.db.execute_query(clean_sql)
                    from pii_masking import mask_dataframe
                    df = mask_dataframe(df)
                    sample_rows = df.values.tolist()[:5]
                    ddl_lines.append(f"\nSample rows ({len(sample_rows)}):")
                    ddl_lines.append(f"Columns: {list(df.columns)}")
                    for row in sample_rows:
                        ddl_lines.append(f"  {row}")
            except Exception as e:
                ddl_lines.append(f"\n(Sample rows unavailable: {e})")

            result = "\n".join(ddl_lines)
            self._schema_cache[table_name] = result
            return result
        except Exception as e:
            _logger.exception("inspect_schema failed for %s", table_name)
            return json.dumps({"error": str(e)})

    # ── Execution & Analysis Tools (Task 2b) ─────────────────────

    def _tool_run_sql(self, sql: str) -> str:
        """Validate, execute, PII-mask, and return query results."""
        if self._sql_retries >= self.MAX_SQL_RETRIES:
            return json.dumps({
                "error": f"Maximum SQL retries ({self.MAX_SQL_RETRIES}) exceeded",
                "columns": [], "rows": [], "row_count": 0,
            })

        # Check auto-execute
        if not self.auto_execute:
            self._waiting_for_user = True
            self._pending_question = f"Execute this SQL?\n```sql\n{sql}\n```"
            self._pending_options = ["Yes, execute", "No, skip"]
            return json.dumps({"status": "awaiting_approval", "sql": sql})

        try:
            is_valid, clean_sql, error = self.engine.validator.validate(sql)
            if not is_valid:
                self._sql_retries += 1
                return json.dumps({
                    "error": f"SQL validation failed: {error}",
                    "columns": [], "rows": [], "row_count": 0,
                })

            df = self.engine.db.execute_query(clean_sql)
            from pii_masking import mask_dataframe
            df = mask_dataframe(df)

            columns = list(df.columns)
            rows = df.values.tolist()
            row_count = len(rows)

            # Store in result for final output
            self._result.sql = clean_sql
            self._result.columns = columns
            self._result.rows = rows[:5000]  # Cap for transport

            return json.dumps({
                "columns": columns,
                "rows": rows[:100],  # Preview
                "row_count": row_count,
                "error": None,
            })
        except Exception as e:
            self._sql_retries += 1
            _logger.warning("run_sql failed (retry %d): %s", self._sql_retries, e)
            return json.dumps({
                "error": str(e),
                "columns": [], "rows": [], "row_count": 0,
            })

    def _tool_suggest_chart(self, columns: list, sample_rows: list) -> str:
        """Ask Haiku for chart type + config given columns and sample data."""
        try:
            prompt = (
                "Given these query result columns and sample data, suggest the best "
                "chart type and configuration.\n\n"
                f"Columns: {columns}\n"
                f"Sample rows (first 5): {sample_rows[:5]}\n\n"
                "Respond with ONLY a JSON object: "
                '{"chart_type": "bar|line|pie|scatter|area|table", '
                '"x_axis": "column_name", "y_axis": "column_name", '
                '"reason": "brief explanation"}'
            )
            response = self.client.messages.create(
                model=self.primary_model,
                max_tokens=300,
                messages=[{"role": "user", "content": prompt}],
            )
            text = response.content[0].text.strip()
            # Try to parse as JSON
            try:
                chart = json.loads(text)
                self._result.chart_suggestion = chart
                return json.dumps(chart)
            except json.JSONDecodeError:
                # Extract JSON from markdown code block if present
                if "```" in text:
                    text = text.split("```")[1]
                    if text.startswith("json"):
                        text = text[4:]
                    text = text.strip()
                    chart = json.loads(text)
                    self._result.chart_suggestion = chart
                    return json.dumps(chart)
                return json.dumps({"chart_type": "table", "reason": "Could not determine chart type"})
        except Exception as e:
            _logger.warning("suggest_chart failed: %s", e)
            return json.dumps({"chart_type": "table", "reason": str(e)})

    def _tool_ask_user(self, question: str, options: list = None) -> str:
        """Pause the agent loop to ask the user a question."""
        self._waiting_for_user = True
        self._pending_question = question
        self._pending_options = options
        return json.dumps({"status": "waiting_for_user", "question": question, "options": options})

    def _tool_summarize_results(self, question: str, data_preview: str) -> str:
        """Generate a concise NL summary of query results."""
        try:
            prompt = (
                "Summarize these query results concisely in 1-2 sentences. "
                "Focus on the key insight.\n\n"
                f"Question: {question}\n"
                f"Data:\n{data_preview[:2000]}"
            )
            response = self.client.messages.create(
                model=self.primary_model,
                max_tokens=200,
                messages=[{"role": "user", "content": prompt}],
            )
            summary = response.content[0].text.strip()
            return summary
        except Exception as e:
            _logger.warning("summarize_results failed: %s", e)
            return f"Query executed successfully for: {question}"


# ── Exceptions ───────────────────────────────────────────────────

class AgentGuardrailError(Exception):
    """Raised when an agent guardrail limit is exceeded."""
    pass
