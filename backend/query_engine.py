"""
QueryEngine — NL-to-SQL engine using Claude + ChromaDB RAG.

Pipeline:
1. User question -> embed -> search ChromaDB for relevant schema + examples
2. Build prompt with schema context + few-shot examples + business rules
3. Call Claude API to generate SQL
4. Validate SQL through SQLValidator
5. Return SQL for human-in-the-loop approval (no auto-execution)
6. On approval, execute against database
7. Generate NL summary of results
"""

import anthropic
import chromadb
import hashlib
import time
import logging
import pandas as pd
from datetime import datetime
from typing import Optional, Dict, List, Any, Tuple
from dataclasses import dataclass

from config import settings, DBType
from sql_validator import SQLValidator
from db_connector import DatabaseConnector
from pii_masking import mask_dataframe

logger = logging.getLogger(__name__)


@dataclass
class QueryResult:
    question: str
    sql: str
    formatted_sql: str = ""
    data: Any = None
    columns: List[str] = None
    summary: str = ""
    error: Optional[str] = None
    model_used: str = ""
    latency_ms: float = 0
    row_count: int = 0
    retries: int = 0

    def to_dict(self) -> dict:
        result = {
            "question": self.question,
            "sql": self.sql,
            "formatted_sql": self.formatted_sql,
            "summary": self.summary,
            "error": self.error,
            "model_used": self.model_used,
            "latency_ms": round(self.latency_ms, 1),
            "row_count": self.row_count,
            "retries": self.retries,
        }
        if self.data is not None:
            result["columns"] = self.columns or []
            if hasattr(self.data, "to_dict"):
                # Coerce Decimal/numeric-object columns to native float so
                # JSON serializes them as numbers, not strings.  Without this,
                # PostgreSQL NUMERIC columns arrive as Python Decimal objects
                # which get serialized as strings, breaking frontend charts.
                df = self.data.copy()
                for col in df.columns:
                    if df[col].dtype == object:
                        converted = pd.to_numeric(df[col], errors="coerce")
                        # Only replace if most non-null values converted successfully
                        if converted.notna().sum() >= df[col].notna().sum() * 0.5:
                            non_null_orig = df[col].notna().sum()
                            non_null_conv = converted.notna().sum()
                            if non_null_conv >= non_null_orig * 0.8:
                                df[col] = converted
                result["rows"] = df.to_dict(orient="records")
            else:
                result["rows"] = []
        return result


class QueryEngine:
    SYSTEM_PROMPT = """You are an expert SQL analyst. Your job is to convert natural language
questions into precise, efficient SQL queries.

RULES:
1. Generate ONLY a single SELECT statement. Never use INSERT, UPDATE, DELETE, DROP, or any DDL.
2. Use only tables and columns from the provided schema context.
3. Always qualify column names with table aliases to avoid ambiguity.
4. Use appropriate JOINs based on foreign key relationships.
5. Handle date/time filters correctly for the database dialect.
6. Add reasonable LIMIT clauses for queries that could return many rows.
7. Use aggregate functions (COUNT, SUM, AVG, etc.) when the question implies summarization.
8. If the question is ambiguous, make reasonable assumptions and note them.
9. Do NOT wrap SQL in markdown code blocks. Return raw SQL only.

RESPONSE FORMAT:
Return ONLY the SQL query. No explanations, no markdown, no code fences.

{business_rules}"""

    def __init__(self, db_connector: DatabaseConnector, namespace: str = "default"):
        self.db = db_connector
        self.primary_model = settings.PRIMARY_MODEL
        self.fallback_model = settings.FALLBACK_MODEL
        self.client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        self.validator = SQLValidator(dialect=db_connector.db_type.value)

        self.chroma_client = chromadb.PersistentClient(
            path=settings.CHROMA_PERSIST_DIR,
        )
        self.schema_collection = self.chroma_client.get_or_create_collection(
            name=f"schema_context_{namespace}",
            metadata={"description": "Table and column descriptions"}
        )
        self.examples_collection = self.chroma_client.get_or_create_collection(
            name=f"query_examples_{namespace}",
            metadata={"description": "Question-SQL training pairs"}
        )
        self._business_rules: List[str] = []
        self._cache: Dict[str, dict] = {}

    # ── Training ──────────────────────────────────────────────────

    def train_schema(self, descriptions: Optional[Dict[str, str]] = None) -> int:
        descriptions = descriptions or {}
        ddl_statements = self.db.get_ddl()
        schema_info = self.db.get_schema_info()

        documents, ids, metadatas = [], [], []

        for i, (table_name, info) in enumerate(schema_info.items()):
            col_descriptions = []
            for col in info["columns"]:
                col_key = f"{table_name}.{col['name']}"
                desc = descriptions.get(col_key, "")
                col_descriptions.append(
                    f"  - {col['name']} ({col['type']}): {desc}"
                    if desc else f"  - {col['name']} ({col['type']})"
                )

            table_desc = descriptions.get(table_name, f"Table: {table_name}")
            doc = (
                f"Table: {table_name}\n"
                f"Description: {table_desc}\n"
                f"Columns:\n" + "\n".join(col_descriptions)
            )
            if i < len(ddl_statements):
                doc += f"\n\nDDL:\n{ddl_statements[i]}"

            documents.append(doc)
            ids.append(f"schema_{table_name}")
            metadatas.append({"type": "schema", "table": table_name, "column_count": len(info["columns"])})

        if documents:
            self.schema_collection.upsert(documents=documents, ids=ids, metadatas=metadatas)

        logger.info(f"Trained schema: {len(documents)} tables indexed")
        return len(documents)

    def add_example(self, question: str, sql: str, description: str = "") -> None:
        doc_id = f"example_{hashlib.md5(question.encode()).hexdigest()[:12]}"
        self.examples_collection.upsert(
            documents=[f"Question: {question}\nSQL: {sql}"],
            ids=[doc_id],
            metadatas=[{"type": "example", "question": question, "sql": sql, "description": description}]
        )

    def add_business_rule(self, rule: str) -> None:
        self._business_rules.append(rule)

    # ── Generate SQL (no auto-execute — human-in-the-loop) ────────

    def generate_sql(self, question: str) -> QueryResult:
        """Generate SQL from a natural language question. Does NOT execute it."""
        start_time = time.time()

        schema_context = self._retrieve_schema(question)
        example_context = self._retrieve_examples(question)
        user_prompt = self._build_prompt(question, schema_context, example_context)

        sql, model_used, retries = self._generate_sql(user_prompt)
        is_valid, clean_sql, error = self.validator.validate(sql)

        if not is_valid:
            return QueryResult(
                question=question,
                sql=sql,
                error=f"SQL validation failed: {error}",
                model_used=model_used,
                latency_ms=(time.time() - start_time) * 1000,
                retries=retries,
            )

        formatted = self.validator.format_sql(clean_sql)

        return QueryResult(
            question=question,
            sql=clean_sql,
            formatted_sql=formatted,
            model_used=model_used,
            latency_ms=(time.time() - start_time) * 1000,
            retries=retries,
        )

    # ── Execute approved SQL ──────────────────────────────────────

    def execute_sql(self, sql: str, question: str = "") -> QueryResult:
        """Execute a user-approved SQL query."""
        start_time = time.time()

        is_valid, clean_sql, error = self.validator.validate(sql)
        if not is_valid:
            return QueryResult(question=question, sql=sql, error=f"Validation failed: {error}")

        try:
            # ── Big data: estimate result size first ──────
            estimated_rows = self.db.estimate_result_size(clean_sql)
            size_warning = ""
            if estimated_rows is not None and estimated_rows > settings.MAX_ROWS:
                size_warning = (
                    f"Note: This query scans ~{estimated_rows:,} rows. "
                    f"Results are capped at {settings.MAX_ROWS} rows. "
                    f"Consider adding filters to narrow the result set."
                )

            df = self.db.execute_query(clean_sql)
            masked_df = mask_dataframe(df)
            summary = self._generate_summary(question, masked_df) if question and not masked_df.empty else ""
            if size_warning:
                summary = f"{size_warning}\n\n{summary}" if summary else size_warning

            return QueryResult(
                question=question,
                sql=clean_sql,
                formatted_sql=self.validator.format_sql(clean_sql),
                data=masked_df,
                columns=list(masked_df.columns) if masked_df is not None else [],
                summary=summary,
                row_count=len(masked_df),
                latency_ms=(time.time() - start_time) * 1000,
            )
        except RuntimeError as e:
            return QueryResult(question=question, sql=clean_sql, error=str(e),
                               latency_ms=(time.time() - start_time) * 1000)

    # ── Dashboard generation ────────────────────────────────────────

    DASHBOARD_PROMPT = """You are a dashboard architect. Given a user request and database schema, generate a professional analytics dashboard.

Return a JSON object with this structure:
{
  "tabs": [
    {
      "name": "Tab Name",
      "sections": [
        {
          "name": "Section Name",
          "tiles": [
            {
              "title": "Tile Title",
              "subtitle": "Optional subtitle",
              "question": "Natural language question this tile answers",
              "sql": "SELECT ...",
              "chartType": "bar|line|area|pie|donut|table|kpi|stacked_bar|horizontal_bar|radar|scatter|treemap"
            }
          ]
        }
      ]
    }
  ]
}

Guidelines:
- Create 2-3 tabs for different analytical perspectives
- Each tab has 1-3 sections grouping related metrics
- First section of first tab should be KPI cards (chartType: "kpi") — 3-4 single-value metrics
- Use chartType "kpi" for single aggregate values (COUNT, SUM, AVG)
- Use "line" or "area" for time-series data
- Use "bar" or "horizontal_bar" for category comparisons
- Use "pie" or "donut" for proportions (max 5-6 categories)
- Use "table" for detailed breakdowns
- Use "stacked_bar" for multi-measure comparisons
- SQL must be SELECT-only, use table aliases, add LIMIT (max 50 for breakdowns)
- Use ONLY tables and columns from the provided schema
- Respect the user's focus area and audience level
- Return ONLY the JSON object, no markdown fences or explanation
"""

    def generate_dashboard(self, request: str, preferences: dict = None) -> dict:
        """Generate a complete dashboard with tabs/sections/tiles from natural language."""
        import json as _json
        import decimal

        preferences = preferences or {}
        focus = preferences.get("focus", "")
        time_range = preferences.get("timeRange", "")
        audience = preferences.get("audience", "")

        # Build enhanced request with preferences
        enhanced_request = request
        if focus:
            enhanced_request += f"\nFocus area: {focus}"
        if time_range:
            enhanced_request += f"\nTime range: {time_range}"
        if audience:
            enhanced_request += f"\nAudience: {audience}"

        schema_context = self._retrieve_schema(enhanced_request, top_k=15)
        dialect = self.db.db_type.value if self.db else "postgresql"

        system_prompt = (
            "You are an expert dashboard architect. "
            "Return ONLY valid JSON objects. No markdown, no explanations."
        )
        user_prompt = f"""User request: {enhanced_request}

Database dialect: {dialect}
Available schema:
{schema_context}

{self.DASHBOARD_PROMPT}

Generate the dashboard JSON now."""

        # Generate — try fallback (smarter) model first
        try:
            raw = self._call_claude(system_prompt, user_prompt, self.fallback_model)
        except RuntimeError:
            raw = self._call_claude(system_prompt, user_prompt, self.primary_model)

        raw = raw.strip()
        # Strip markdown fences if present
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
            if raw.endswith("```"):
                raw = raw[:-3]
            raw = raw.strip()

        try:
            result = _json.loads(raw)
        except _json.JSONDecodeError:
            # Fallback: find JSON object
            start = raw.find("{")
            end = raw.rfind("}") + 1
            if start >= 0 and end > start:
                result = _json.loads(raw[start:end])
            else:
                return {"tabs": []}

        if not isinstance(result, dict) or "tabs" not in result:
            # Legacy: if AI returned a flat array, wrap it
            if isinstance(result, list):
                result = {
                    "tabs": [{
                        "name": "Overview",
                        "sections": [{
                            "name": "General",
                            "tiles": result[:8]
                        }]
                    }]
                }
            else:
                return {"tabs": []}

        # Execute each tile's SQL
        for tab in result.get("tabs", []):
            for section in tab.get("sections", []):
                executed_tiles = []
                for tile in section.get("tiles", [])[:8]:
                    sql = tile.get("sql", "")
                    is_valid, clean_sql, error = self.validator.validate(sql)
                    if not is_valid:
                        continue
                    try:
                        df = self.db.execute_query(clean_sql)
                        masked_df = mask_dataframe(df)
                        rows = masked_df.head(100).to_dict(orient="records")
                        for row in rows:
                            for k, v in row.items():
                                if isinstance(v, decimal.Decimal):
                                    row[k] = float(v)
                                elif hasattr(v, "isoformat"):
                                    row[k] = v.isoformat()
                        tile["columns"] = list(masked_df.columns)
                        tile["rows"] = rows
                        tile["rowCount"] = len(masked_df)
                        tile["sql"] = clean_sql
                        executed_tiles.append(tile)
                    except Exception as e:
                        logger.warning(f"Dashboard tile failed: {e}")
                        continue
                section["tiles"] = executed_tiles

        return result

    # ── Feedback ──────────────────────────────────────────────────

    def record_feedback(self, question: str, sql: str, is_correct: bool) -> None:
        if is_correct:
            self.add_example(question=question, sql=sql, description="User-confirmed correct query")

    # ── Stats ─────────────────────────────────────────────────────

    def get_stats(self) -> Dict[str, int]:
        return {
            "schema_items": self.schema_collection.count(),
            "example_pairs": self.examples_collection.count(),
            "business_rules": len(self._business_rules),
        }

    # ── Private methods ───────────────────────────────────────────

    def _retrieve_schema(self, question: str, top_k: int = 8) -> str:
        try:
            results = self.schema_collection.query(
                query_texts=[question],
                n_results=min(top_k, self.schema_collection.count() or 1)
            )
            if results and results["documents"]:
                return "\n\n".join(results["documents"][0])
        except Exception as e:
            logger.warning(f"Schema retrieval failed: {e}")
        return "No schema context available."

    def _retrieve_examples(self, question: str, top_k: int = 5) -> str:
        try:
            count = self.examples_collection.count()
            if count == 0:
                return ""
            results = self.examples_collection.query(
                query_texts=[question], n_results=min(top_k, count)
            )
            if results and results["documents"]:
                return "\n\n".join(results["documents"][0])
        except Exception as e:
            logger.warning(f"Example retrieval failed: {e}")
        return ""

    def _build_prompt(self, question: str, schema: str, examples: str) -> str:
        parts = [
            "=== DATABASE SCHEMA (relevant tables) ===",
            schema,
        ]
        if examples:
            parts.append("\n=== SIMILAR QUERY EXAMPLES ===")
            parts.append(examples)
        parts.append(f"\n=== USER QUESTION ===")
        parts.append(question)
        parts.append(
            f"\n=== INSTRUCTIONS ===\n"
            f"Generate a SQL query for the above question. "
            f"Target dialect: {self.db.db_type.value}. "
            f"Today's date: {datetime.now().strftime('%Y-%m-%d')}. "
            f"Return ONLY the raw SQL, no explanations."
        )
        return "\n".join(parts)

    BIG_DATA_RULES = """
BIG DATA OPTIMIZATION RULES (this is a large-scale data warehouse — efficiency is critical):
- ALWAYS include a LIMIT clause (max 1000 rows). Never return unbounded results.
- Prefer aggregations (COUNT, SUM, AVG, MIN, MAX, GROUP BY) over raw row selection.
- Use approximate functions when exact counts are not required:
  * BigQuery: APPROX_COUNT_DISTINCT()
  * Snowflake: APPROX_COUNT_DISTINCT()
  * Redshift: APPROXIMATE COUNT(DISTINCT ...)
  * ClickHouse: uniqHLL12()
  * Trino: approx_distinct()
- ALWAYS add date/time filters to narrow the scan range (e.g. WHERE created_at >= CURRENT_DATE - INTERVAL '30' DAY).
- NEVER use SELECT * — specify only the columns you need.
- For partitioned tables, always include the partition column in WHERE clauses.
- Prefer CTEs (WITH ... AS) over deeply nested subqueries for readability.
- Avoid ORDER BY on non-indexed columns with large datasets unless paired with LIMIT.
- Use TABLESAMPLE or random sampling for exploratory queries on very large tables."""

    def _get_system_prompt(self) -> str:
        rules_text = ""
        if self._business_rules:
            rules_text = "\n\nBUSINESS RULES:\n" + "\n".join(f"- {rule}" for rule in self._business_rules)
        # Inject big data optimization rules for warehouse engines
        if self.db.is_big_data_engine():
            rules_text += "\n\n" + self.BIG_DATA_RULES
        return self.SYSTEM_PROMPT.format(business_rules=rules_text)

    def _generate_sql(self, user_prompt: str) -> Tuple[str, str, int]:
        system_prompt = self._get_system_prompt()
        retries = 0

        sql = self._call_claude(system_prompt, user_prompt, self.primary_model)
        sql = self._clean_sql_response(sql)

        is_valid, _, _ = self.validator.validate(sql)
        if is_valid:
            return sql, self.primary_model, retries

        retries += 1
        sql = self._call_claude(system_prompt, user_prompt, self.fallback_model)
        sql = self._clean_sql_response(sql)
        return sql, self.fallback_model, retries

    def _call_claude(self, system_prompt: str, user_prompt: str, model: str) -> str:
        try:
            response = self.client.messages.create(
                model=model,
                max_tokens=settings.MAX_TOKENS,
                system=[{
                    "type": "text",
                    "text": system_prompt,
                    "cache_control": {"type": "ephemeral"}
                }],
                messages=[{"role": "user", "content": user_prompt}]
            )
            return response.content[0].text
        except anthropic.APIError as e:
            raise RuntimeError(f"AI service error: {str(e)}")

    def _clean_sql_response(self, response: str) -> str:
        sql = response.strip()
        if sql.startswith("```"):
            lines = sql.split("\n")
            lines = [l for l in lines if not l.strip().startswith("```")]
            sql = "\n".join(lines).strip()
        return sql

    def _generate_summary(self, question: str, data: Any) -> str:
        if len(data) <= 10:
            data_preview = data.to_string(index=False)
        else:
            data_preview = (
                f"Shape: {data.shape[0]} rows x {data.shape[1]} columns\n"
                f"First 5 rows:\n{data.head().to_string(index=False)}"
            )

        try:
            response = self.client.messages.create(
                model=self.primary_model,
                max_tokens=200,
                messages=[{"role": "user", "content": (
                    f'The user asked: "{question}"\n\n'
                    f"Query results:\n{data_preview}\n\n"
                    f"Write a 1-2 sentence natural language answer. Be specific with numbers."
                )}]
            )
            return response.content[0].text.strip()
        except Exception:
            return ""
