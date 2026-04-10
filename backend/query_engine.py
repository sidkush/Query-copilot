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

import chromadb
from chromadb import EmbeddingFunction, Documents, Embeddings
import hashlib
import json
import math
import time
import logging
from datetime import datetime
from typing import Optional, Dict, List, Any, Tuple
from dataclasses import dataclass

from config import settings, DBType
from sql_validator import SQLValidator
from db_connector import DatabaseConnector
from pii_masking import mask_dataframe
from model_provider import ModelProvider

logger = logging.getLogger(__name__)


class _HashEmbeddingFunction(EmbeddingFunction[Documents]):
    """Pure-Python character n-gram embedding — no onnxruntime or torch required.
    Produces 384-dim vectors consistent with the default ChromaDB collection dimension."""

    DIM = 384

    def __init__(self):
        pass

    def __call__(self, input: Documents) -> Embeddings:
        result = []
        for text in input:
            text = text.lower()
            vec = [0.0] * self.DIM
            # Word unigrams (weighted 2×)
            for word in text.split():
                h = int(hashlib.md5(word.encode()).hexdigest(), 16)
                vec[h % self.DIM] += 2.0
            # Character trigrams
            for i in range(len(text) - 2):
                gram = text[i:i + 3]
                h = int(hashlib.md5(gram.encode()).hexdigest(), 16)
                vec[h % self.DIM] += 1.0
            # L2-normalize
            norm = math.sqrt(sum(x * x for x in vec)) or 1.0
            result.append([x / norm for x in vec])
        return result


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
    confidence: Optional[dict] = None  # { score: 0-100, caveats: [str] }

    def to_dict(self) -> dict:
        import pandas as pd  # Lazy import: avoids native DLL conflict with ChromaDB on Windows
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
            "confidence": self.confidence,
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

ADVANCED SQL PATTERNS — use these when the question implies them:
- "running total", "cumulative" → SUM(...) OVER (ORDER BY ...)
- "moving average", "rolling" → AVG(...) OVER (ORDER BY ... ROWS BETWEEN N PRECEDING AND CURRENT ROW)
- "rank", "top N per group" → ROW_NUMBER() / RANK() / DENSE_RANK() OVER (PARTITION BY ... ORDER BY ...)
- "percent of total", "share" → value / SUM(value) OVER () * 100
- "year over year", "period comparison" → LAG(..., 1) OVER (ORDER BY period)
- "growth rate", "change" → (current - LAG(current)) / NULLIF(LAG(current), 0) * 100
- For LOD-style calculations, use CTEs with GROUP BY at the desired granularity, then JOIN back.
- For forecasting/trend keywords ("predict", "forecast", "trend"), compute a simple linear slope using:
  (N * SUM(x*y) - SUM(x) * SUM(y)) / NULLIF(N * SUM(x*x) - SUM(x) * SUM(x), 0)

RESPONSE FORMAT:
Return ONLY the SQL query. No explanations, no markdown, no code fences.

{business_rules}"""

    def __init__(self, db_connector: DatabaseConnector, namespace: str = "default", *, provider: ModelProvider):
        self.db = db_connector
        self._namespace = namespace
        self.provider = provider
        self.primary_model = provider.default_model
        self.fallback_model = provider.fallback_model
        self.validator = SQLValidator(dialect=db_connector.db_type.value)

        self.chroma_client = chromadb.PersistentClient(
            path=settings.CHROMA_PERSIST_DIR,
        )
        _ef = _HashEmbeddingFunction()
        self.schema_collection = self.chroma_client.get_or_create_collection(
            name=f"schema_context_{namespace}",
            metadata={"description": "Table and column descriptions"},
            embedding_function=_ef,
        )
        self.examples_collection = self.chroma_client.get_or_create_collection(
            name=f"query_examples_{namespace}",
            metadata={"description": "Question-SQL training pairs"},
            embedding_function=_ef,
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

        # ── Confidence scoring — quick self-critique ──
        confidence = self._score_confidence(question, clean_sql, schema_context)

        return QueryResult(
            question=question,
            sql=clean_sql,
            formatted_sql=formatted,
            model_used=model_used,
            latency_ms=(time.time() - start_time) * 1000,
            retries=retries,
            confidence=confidence,
        )

    # ── Execute approved SQL ──────────────────────────────────────

    def _cache_key(self, sql: str, params: Optional[Dict] = None) -> str:
        """Generate a deterministic cache key from SQL + optional parameters."""
        raw = sql.strip().lower() + (str(sorted(params.items())) if params else "")
        return hashlib.sha256(raw.encode()).hexdigest()

    def _redis_cache_key(self, key: str) -> str:
        return f"qc:cache:{self._namespace}:{key}"

    def _get_cached(self, key: str) -> Optional[dict]:
        """Return cached result — tries Redis first, then in-memory fallback."""
        if not settings.CACHE_ENABLED:
            return None
        # Try Redis
        try:
            from redis_client import get_redis
            r = get_redis()
            if r:
                raw = r.get(self._redis_cache_key(key))
                if raw:
                    return json.loads(raw)
        except Exception:
            pass
        # Fallback to in-memory
        entry = self._cache.get(key)
        if entry and (time.time() - entry["ts"]) < settings.CACHE_TTL_SECONDS:
            return entry
        if entry:
            del self._cache[key]
        return None

    def _set_cached(self, key: str, columns: list, rows: list, summary: str, formatted_sql: str):
        """Store a query result — tries Redis first, always stores in-memory as fallback."""
        if not settings.CACHE_ENABLED:
            return
        entry = {
            "ts": time.time(),
            "columns": columns,
            "rows": rows,
            "summary": summary,
            "formatted_sql": formatted_sql,
        }
        # Try Redis with native TTL
        try:
            from redis_client import get_redis
            r = get_redis()
            if r:
                r.setex(self._redis_cache_key(key), settings.CACHE_TTL_SECONDS, json.dumps(entry, default=str))
        except Exception:
            pass
        # Always store in-memory as fallback
        self._cache[key] = entry
        if len(self._cache) > 200:
            oldest_key = min(self._cache, key=lambda k: self._cache[k]["ts"])
            del self._cache[oldest_key]

    def clear_cache(self):
        """Flush the query result cache (both Redis and in-memory)."""
        self._cache.clear()
        try:
            from redis_client import get_redis
            r = get_redis()
            if r:
                prefix = f"qc:cache:{self._namespace}:*"
                cursor = 0
                while True:
                    cursor, keys = r.scan(cursor, match=prefix, count=100)
                    if keys:
                        r.delete(*keys)
                    if cursor == 0:
                        break
        except Exception:
            pass

    def execute_sql(self, sql: str, question: str = "") -> QueryResult:
        """Execute a user-approved SQL query."""
        start_time = time.time()

        is_valid, clean_sql, error = self.validator.validate(sql)
        if not is_valid:
            return QueryResult(question=question, sql=sql, error=f"Validation failed: {error}")

        # ── Check cache ──
        cache_key = self._cache_key(clean_sql)
        cached = self._get_cached(cache_key)
        if cached:
            import pandas as pd
            logger.info(f"Cache hit for query: {clean_sql[:80]}...")
            df = pd.DataFrame(cached["rows"], columns=cached["columns"])
            return QueryResult(
                question=question,
                sql=clean_sql,
                formatted_sql=cached["formatted_sql"],
                data=df,
                columns=cached["columns"],
                summary=cached["summary"],
                row_count=len(cached["rows"]),
                latency_ms=(time.time() - start_time) * 1000,
            )

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

            exec_sql = self.validator.apply_limit(clean_sql)
            df = self.db.execute_query(exec_sql)
            masked_df = mask_dataframe(df)
            summary = self._generate_summary(question, masked_df) if question and not masked_df.empty else ""
            if size_warning:
                summary = f"{size_warning}\n\n{summary}" if summary else size_warning

            formatted_sql = self.validator.format_sql(clean_sql)

            # ── Store in cache ──
            self._set_cached(
                cache_key,
                columns=list(masked_df.columns) if masked_df is not None else [],
                rows=masked_df.head(5000).to_dict("records") if masked_df is not None else [],
                summary=summary,
                formatted_sql=formatted_sql,
            )

            return QueryResult(
                question=question,
                sql=clean_sql,
                formatted_sql=formatted_sql,
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
              "chartType": "bar|line|area|pie|donut|table|kpi|stacked_bar|bar_h|radar|scatter|treemap"
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
- Use "bar" or "bar_h" for category comparisons
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
        import re

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
            "Return ONLY valid JSON objects. No markdown, no explanations, no trailing commas, no comments. "
            "Every string value must use double quotes. Ensure the JSON is strictly RFC 8259 compliant."
        )
        user_prompt = f"""User request: {enhanced_request}

Database dialect: {dialect}
Available schema:
{schema_context}

{self.DASHBOARD_PROMPT}

CRITICAL: Return ONLY the raw JSON object. No markdown code fences, no explanations before or after.
Do NOT use trailing commas. Do NOT use single quotes. Ensure all strings are double-quoted.

Generate the dashboard JSON now."""

        # Generate — try fallback (smarter) model first, with higher token limit for dashboards
        original_max = settings.MAX_TOKENS
        try:
            raw = self._call_claude_dashboard(system_prompt, user_prompt, self.fallback_model)
        except RuntimeError:
            raw = self._call_claude_dashboard(system_prompt, user_prompt, self.primary_model)

        result = self._parse_dashboard_json(raw)

        # If parsing failed, retry once with a repair prompt
        if result is None:
            logger.warning("Dashboard JSON parse failed, retrying with repair prompt...")
            repair_prompt = (
                f"The following JSON is malformed. Fix it so it is valid JSON and return ONLY the corrected JSON:\n\n{raw[:8000]}"
            )
            try:
                raw2 = self._call_claude_dashboard(system_prompt, repair_prompt, self.primary_model)
                result = self._parse_dashboard_json(raw2)
            except Exception:
                pass

        if result is None:
            raise ValueError("Dashboard generation failed: AI returned invalid JSON that could not be repaired")

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

    def _call_claude_dashboard(self, system_prompt: str, user_prompt: str, model: str) -> str:
        """Call Claude with a higher token limit for dashboard generation."""
        response = self.provider.complete(
            model=model,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
            max_tokens=16384,
        )
        if response.stop_reason == "max_tokens":
            logger.warning(f"Dashboard response was TRUNCATED (hit max_tokens). Length: {len(response.text)} chars")
        return response.text

    @staticmethod
    def _repair_json(raw: str) -> str:
        """Attempt to repair common JSON issues from AI model output."""
        import re
        s = raw.strip()

        # Strip markdown code fences
        if s.startswith("```"):
            s = s.split("\n", 1)[1] if "\n" in s else s[3:]
            if s.endswith("```"):
                s = s[:-3]
            s = s.strip()
        # Remove leading "json" label if present
        if s.lower().startswith("json"):
            s = s[4:].strip()

        # Remove single-line comments (// ...)
        s = re.sub(r'//[^\n]*', '', s)
        # Remove multi-line comments (/* ... */)
        s = re.sub(r'/\*.*?\*/', '', s, flags=re.DOTALL)

        # Fix trailing commas before } or ]
        s = re.sub(r',\s*([\]}])', r'\1', s)

        # Replace single quotes with double quotes (but not inside already double-quoted strings)
        # Simple heuristic: if no double quotes are found, replace all single quotes
        if '"' not in s:
            s = s.replace("'", '"')

        # Fix unescaped newlines inside string values
        s = re.sub(r'(?<=: ")(.*?)(?=")', lambda m: m.group(0).replace('\n', '\\n'), s)

        # ── Handle truncated JSON (model hit token limit mid-output) ──
        # Strip any trailing incomplete key-value pair or string
        # e.g. '..."sql": "SELECT' -> remove the dangling pair
        s = re.sub(r',\s*"[^"]*"\s*:\s*"[^"]*$', '', s)  # trailing incomplete string value
        s = re.sub(r',\s*"[^"]*"\s*:\s*$', '', s)         # trailing key with no value
        s = re.sub(r',\s*"[^"]*$', '', s)                  # trailing incomplete key
        s = re.sub(r',\s*$', '', s)                        # trailing comma

        # Count unclosed brackets and braces and close them
        open_braces = 0
        open_brackets = 0
        in_string = False
        escape_next = False
        for ch in s:
            if escape_next:
                escape_next = False
                continue
            if ch == '\\':
                escape_next = True
                continue
            if ch == '"':
                in_string = not in_string
                continue
            if in_string:
                continue
            if ch == '{':
                open_braces += 1
            elif ch == '}':
                open_braces -= 1
            elif ch == '[':
                open_brackets += 1
            elif ch == ']':
                open_brackets -= 1

        # Close any unclosed structures
        s += ']' * max(0, open_brackets)
        s += '}' * max(0, open_braces)

        # One more pass to fix trailing commas introduced by truncation
        s = re.sub(r',\s*([\]}])', r'\1', s)

        return s

    @staticmethod
    def _parse_dashboard_json(raw: str) -> dict:
        """Parse AI-generated JSON with multiple fallback strategies."""
        import json as _json

        if not raw or not raw.strip():
            return None

        raw = raw.strip()

        # Strategy 1: direct parse
        try:
            return _json.loads(raw)
        except _json.JSONDecodeError:
            pass

        # Strategy 2: strip markdown fences and try again
        repaired = QueryEngine._repair_json(raw)
        try:
            return _json.loads(repaired)
        except _json.JSONDecodeError:
            pass

        # Strategy 3: extract the outermost JSON object
        start = repaired.find("{")
        end = repaired.rfind("}") + 1
        if start >= 0 and end > start:
            try:
                return _json.loads(repaired[start:end])
            except _json.JSONDecodeError:
                pass

        # Strategy 4: Extract using brace matching
        if start >= 0:
            depth = 0
            in_string = False
            escape_next = False
            for i in range(start, len(repaired)):
                ch = repaired[i]
                if escape_next:
                    escape_next = False
                    continue
                if ch == '\\':
                    escape_next = True
                    continue
                if ch == '"':
                    in_string = not in_string
                    continue
                if in_string:
                    continue
                if ch == '{':
                    depth += 1
                elif ch == '}':
                    depth -= 1
                    if depth == 0:
                        try:
                            candidate = repaired[start:i + 1]
                            # One more repair pass on the extracted chunk
                            import re
                            candidate = re.sub(r',\s*([\]}])', r'\1', candidate)
                            return _json.loads(candidate)
                        except _json.JSONDecodeError:
                            break

        logger.error(f"All JSON parse strategies failed. Raw (first 500 chars): {raw[:500]}")
        return None

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
            f"CRITICAL: Never use percent-sign format strings (%F, %T, etc.) in SQL — they get double-escaped by the driver. "
            f"For BigQuery timestamps: use DATE(col), EXTRACT(), TIMESTAMP_TRUNC() instead of PARSE_TIMESTAMP with format strings. "
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
        response = self.provider.complete(
            model=model,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
            max_tokens=settings.MAX_TOKENS,
        )
        return response.text

    def generate_sql_stream(self, question: str):
        """Stream SQL generation tokens via a generator. Yields partial text chunks."""
        schema_context = self._retrieve_schema(question)
        example_context = self._retrieve_examples(question)
        user_prompt = self._build_prompt(question, schema_context, example_context)
        system_prompt = self._get_system_prompt()

        try:
            stream = self.provider.complete_stream(
                model=self.primary_model,
                system=system_prompt,
                messages=[{"role": "user", "content": user_prompt}],
                max_tokens=settings.MAX_TOKENS,
            )
            full_text = ""
            for text in stream:
                full_text += text
                yield text
            # After streaming completes, validate
            sql = self._clean_sql_response(full_text)
            is_valid, clean_sql, error = self.validator.validate(sql)
            if is_valid:
                yield f"\n__VALID__:{clean_sql}"
            else:
                yield f"\n__ERROR__:{error}"
        except Exception as e:
            yield f"\n__ERROR__:{str(e)}"

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
            response = self.provider.complete(
                model=self.primary_model,
                system="",
                messages=[{"role": "user", "content": (
                    f'The user asked: "{question}"\n\n'
                    f"Query results:\n{data_preview}\n\n"
                    f"Write a 1-2 sentence natural language answer. Be specific with numbers."
                )}],
                max_tokens=200,
            )
            return response.text.strip()
        except Exception:
            return ""

    # ── Drill-down [ADV-FIX H7] ────────────────────────────────
    def drill_down(self, parent_sql: str, dimension: str, value: str) -> QueryResult:
        """Generate a scoped child query filtering by the clicked dimension value."""
        start_time = time.time()
        schema_context = self._retrieve_schema(f"drill down into {dimension} = {value}")

        system_prompt = (
            "You are an expert SQL analyst. Given a parent query and a filter condition, "
            "generate a drill-down query that shows detail rows for the filtered value. "
            "RULES: 1) Generate ONLY a SELECT statement. 2) Use the parent query as a subquery or CTE if needed. "
            "3) Filter WHERE the specified dimension equals the specified value. "
            "4) Show relevant detail columns. 5) Add LIMIT 100. "
            "6) Return raw SQL only, no markdown."
        )
        user_prompt = (
            f"Parent query:\n{parent_sql}\n\n"
            f"Drill into: {dimension} = '{value}'\n\n"
            f"Schema context:\n{schema_context}\n\n"
            f"Generate a drill-down query that filters to this value and shows row-level detail."
        )

        sql, model_used, retries = self._generate_sql(
            f"{system_prompt}\n\n{user_prompt}"
        )
        is_valid, clean_sql, error = self.validator.validate(sql)
        if not is_valid:
            return QueryResult(
                question=f"Drill: {dimension}={value}",
                sql=sql, error=f"Validation failed: {error}",
                model_used=model_used,
                latency_ms=(time.time() - start_time) * 1000,
            )

        # Execute the drill-down query
        try:
            df = self.db.execute_query(clean_sql)
            masked_df = mask_dataframe(df)
            return QueryResult(
                question=f"Drill: {dimension}={value}",
                sql=clean_sql,
                formatted_sql=self.validator.format_sql(clean_sql),
                data=masked_df,
                columns=list(masked_df.columns) if masked_df is not None else [],
                row_count=len(masked_df),
                model_used=model_used,
                latency_ms=(time.time() - start_time) * 1000,
            )
        except RuntimeError as e:
            return QueryResult(
                question=f"Drill: {dimension}={value}",
                sql=clean_sql, error=str(e),
                latency_ms=(time.time() - start_time) * 1000,
            )

    # ── Confidence scoring ─────────────────────────────────────
    def _score_confidence(self, question: str, sql: str, schema_context: str) -> Optional[dict]:
        """Quick self-critique: return {score: 0-100, caveats: [str]}."""
        import json as _json
        try:
            response = self.provider.complete(
                model=self.primary_model,
                system=(
                    "You are a SQL quality auditor. Given a question, generated SQL, and schema context, "
                    "rate the SQL quality 0-100 and list up to 3 brief caveats. "
                    "Return ONLY a JSON object: {\"score\": N, \"caveats\": [\"...\"]}"
                ),
                messages=[{"role": "user", "content": (
                    f"Question: {question}\n\nSQL: {sql}\n\nSchema:\n{schema_context[:2000]}\n\n"
                    "Rate this SQL. Return ONLY the JSON."
                )}],
                max_tokens=200,
            )
            raw = response.text.strip()
            if raw.startswith("```"):
                raw = raw.split("\n", 1)[-1].rsplit("```", 1)[0]
            result = _json.loads(raw)
            return {
                "score": max(0, min(100, int(result.get("score", 50)))),
                "caveats": [str(c) for c in result.get("caveats", [])][:3],
            }
        except Exception as e:
            logger.warning(f"Confidence scoring failed: {e}")
            return None

    # ── Conversational tile editing [ADV-FIX C8] ────────────────
    TILE_EDIT_ALLOWLIST = {
        "chartType", "title", "subtitle", "palette", "activeMeasures",
        "selectedMeasure", "visualConfig",
    }

    def edit_tile_from_nl(self, instruction: str, tile_state: dict) -> dict:
        """Parse a natural-language editing instruction into a safe JSON patch.
        Only fields in TILE_EDIT_ALLOWLIST are returned.
        sql, columns, rows are NEVER patchable."""
        import json as _json

        safe_state = {
            "title": tile_state.get("title"),
            "subtitle": tile_state.get("subtitle"),
            "chartType": tile_state.get("chartType"),
            "palette": tile_state.get("palette"),
            "activeMeasures": tile_state.get("activeMeasures"),
            "selectedMeasure": tile_state.get("selectedMeasure"),
            "columns": tile_state.get("columns", []),
        }

        system_prompt = (
            "You are a dashboard tile editor. Given a tile's current state and a user instruction, "
            "return a JSON object with ONLY the fields that should change. "
            "Allowed fields: chartType, title, subtitle, palette, activeMeasures, selectedMeasure, visualConfig. "
            "NEVER include: sql, columns, rows, id, annotations, question. "
            "Valid chartType values: bar, line, area, pie, donut, table, kpi, stacked_bar, bar_h, scatter. "
            "Valid palette values: default, ocean, sunset, forest, mono, colorblind. "
            "Return ONLY the JSON patch. No markdown, no explanation."
        )

        user_prompt = (
            f"Current tile state:\n{_json.dumps(safe_state, default=str)}\n\n"
            f"User instruction: {instruction}\n\n"
            f"Return ONLY the JSON patch object."
        )

        try:
            response = self.provider.complete(
                model=self.primary_model,
                system=system_prompt,
                messages=[{"role": "user", "content": user_prompt}],
                max_tokens=300,
            )
            raw = response.text.strip()
            # Strip markdown fences if present
            if raw.startswith("```"):
                raw = raw.split("\n", 1)[-1].rsplit("```", 1)[0]

            patch = _json.loads(raw)

            # Filter to allowlist only [ADV-FIX C8]
            safe_patch = {k: v for k, v in patch.items() if k in self.TILE_EDIT_ALLOWLIST}
            return safe_patch
        except Exception as e:
            logger.error(f"edit_tile_from_nl failed: {e}")
            raise RuntimeError(f"Could not parse editing instruction: {e}")
