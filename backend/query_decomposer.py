"""
QueryDecomposer — decomposes complex SQL queries into parallel sub-queries for
streaming execution.

A query is decomposable when its first GROUP BY column has low cardinality
(<= 20 distinct values) or is a date/timestamp column.  Each sub-query is a
self-contained SELECT that filters on one partition value via a WHERE clause.

Invariant-1: Every sub-query produced here MUST be validated as SELECT-only by
             the caller (via sql_validator.SQLValidator) before execution.
             This module never executes SQL itself.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date
from typing import Any, Dict, List, Optional

import sqlglot
from sqlglot import exp

logger = logging.getLogger(__name__)

# Maximum number of sub-queries produced by a single decomposition.
MAX_SUB_QUERIES = 10

# Cardinality threshold: only decompose on columns with <= this many distinct
# values.
LOW_CARDINALITY_THRESHOLD = 20

# SQL type tokens considered "date-like" for the date-splitting strategy.
_DATE_TYPE_TOKENS = frozenset(
    {
        "date",
        "datetime",
        "timestamp",
        "timestamptz",
        "timestamp with time zone",
        "timestamp without time zone",
        "datetime2",  # MSSQL
        "smalldatetime",  # MSSQL
    }
)


# ---------------------------------------------------------------------------
# Public dataclass
# ---------------------------------------------------------------------------


@dataclass
class SubQuery:
    """One partition-scoped SELECT produced by the decomposer."""

    sql: str
    """The complete, ready-to-execute SQL text (with WHERE clause injected)."""

    partition_value: str
    """The value this sub-query filters on, e.g. 'North America' or '2024-01'."""

    estimated_rows: int
    """Estimated row count for this partition (0 when unknown)."""

    index: int
    """0-based position within the decomposition."""

    total: int
    """Total number of sub-queries in this decomposition."""


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------


def _parse_group_by_columns(sql: str) -> List[str]:
    """
    Return the column names listed in the first GROUP BY clause found in *sql*.

    Only bare column names (possibly qualified) are returned; expressions that
    are not simple column references (function calls, literals, etc.) are
    skipped.

    Returns an empty list when the SQL cannot be parsed or contains no GROUP BY.
    """
    try:
        statements = sqlglot.parse(sql)
    except sqlglot.errors.ParseError as exc:
        logger.debug("_parse_group_by_columns: parse error — %s", exc)
        return []

    if not statements:
        return []

    stmt = statements[0]
    group = stmt.find(exp.Group)
    if group is None:
        return []

    columns: List[str] = []
    for expr in group.expressions:
        if isinstance(expr, exp.Column):
            # Use the unqualified column name so it can be matched against the
            # schema profile without needing to resolve table aliases.
            columns.append(expr.name)
        elif isinstance(expr, exp.Alias):
            # GROUP BY alias — unwrap
            inner = expr.this
            if isinstance(inner, exp.Column):
                columns.append(inner.name)
    return columns


def _get_column_cardinality(
    column_name: str,
    table_name: str,
    schema_profile: Any,
) -> int:
    """
    Return the distinct-value count for *column_name* in *table_name* as
    stored in *schema_profile*.

    The profile is expected to be a ``SchemaProfile`` (from
    ``schema_intelligence.py``) whose ``tables`` attribute is a list of
    ``TableProfile`` objects.  Each ``TableProfile.columns`` entry is a dict
    with at least ``{"name": str, ...}``; the optional key
    ``"cardinality"`` carries the pre-computed distinct-value count.

    Returns -1 when the column or its cardinality information cannot be found.
    """
    if schema_profile is None:
        return -1

    col_lower = column_name.lower()
    tbl_lower = table_name.lower() if table_name else ""

    # Iterate tables — use the first match when table_name is unknown ("").
    for table in getattr(schema_profile, "tables", []):
        tbl_name = getattr(table, "name", "").lower()
        if tbl_lower and tbl_name != tbl_lower:
            continue
        for col in getattr(table, "columns", []):
            if isinstance(col, dict) and col.get("name", "").lower() == col_lower:
                card = col.get("cardinality")
                if card is not None:
                    try:
                        return int(card)
                    except (TypeError, ValueError):
                        pass
                # Column found but no cardinality info.
                return -1
    return -1


def _get_distinct_values(
    column_name: str,
    table_name: str,
    schema_profile: Any,
) -> Optional[List[Any]]:
    """
    Return the known distinct values for *column_name* from *schema_profile*,
    or ``None`` when they are not available.

    Each column dict may optionally carry a ``"distinct_values"`` key
    (a list of scalar values) populated by schema profiling tooling.
    """
    if schema_profile is None:
        return None

    col_lower = column_name.lower()
    tbl_lower = table_name.lower() if table_name else ""

    for table in getattr(schema_profile, "tables", []):
        tbl_name = getattr(table, "name", "").lower()
        if tbl_lower and tbl_name != tbl_lower:
            continue
        for col in getattr(table, "columns", []):
            if isinstance(col, dict) and col.get("name", "").lower() == col_lower:
                vals = col.get("distinct_values")
                if isinstance(vals, list):
                    return vals
    return None


def _is_date_column(column_name: str, schema_profile: Any) -> bool:
    """
    Return True if *column_name* is typed as a date or timestamp in any table
    found in *schema_profile*.

    Matches are case-insensitive; the type string is normalised (stripped,
    lowercased, parenthesised precision removed, e.g. ``TIMESTAMP(6)`` becomes
    ``timestamp``).
    """
    if schema_profile is None:
        return False

    col_lower = column_name.lower()

    for table in getattr(schema_profile, "tables", []):
        for col in getattr(table, "columns", []):
            if not isinstance(col, dict):
                continue
            if col.get("name", "").lower() != col_lower:
                continue
            raw_type = col.get("type", "")
            if not isinstance(raw_type, str):
                continue
            # Strip precision/scale suffix, e.g. "timestamp(6)" → "timestamp"
            normalised = raw_type.strip().lower().split("(")[0].strip()
            if normalised in _DATE_TYPE_TOKENS:
                return True
    return False


def _add_where_clause(sql: str, column: str, value: str) -> str:
    """
    Return a new SQL string that is identical to *sql* but with an additional
    ``WHERE <column> = '<value>'`` condition (ANDed with any existing WHERE
    clause).

    Uses sqlglot for safe, AST-level rewriting so that the result is always
    syntactically valid.  Falls back to string-level injection only when the
    AST rewrite fails, in which case a warning is logged.

    *value* is treated as a string literal; numeric injection is intentionally
    avoided to prevent SQL-injection via the partition value (callers must quote
    or parameterise as appropriate for their dialect).
    """
    try:
        statements = sqlglot.parse(sql)
        if not statements:
            raise ValueError("No statements parsed")

        stmt = statements[0]

        # Build the equality condition using sqlglot expression types.
        condition = exp.EQ(
            this=exp.Column(this=exp.Identifier(this=column)),
            expression=exp.Literal.string(value),
        )

        existing_where = stmt.find(exp.Where)
        if existing_where is not None:
            # AND the new condition onto the existing WHERE.
            new_where = exp.Where(
                this=exp.And(
                    this=existing_where.this,
                    expression=condition,
                )
            )
            existing_where.replace(new_where)
        else:
            # Append a fresh WHERE clause to the SELECT statement.
            stmt.set("where", exp.Where(this=condition))

        return stmt.sql()

    except Exception as exc:
        logger.warning(
            "_add_where_clause: AST rewrite failed (%s); falling back to "
            "string injection.",
            exc,
        )
        # Fallback: naive string injection.  The caller is responsible for
        # validating the result before execution (Invariant-1).
        escaped_value = value.replace("'", "''")
        col_clause = f"{column} = '{escaped_value}'"
        sql_upper = sql.upper().strip()
        if "WHERE" in sql_upper:
            return f"{sql} AND {col_clause}"
        # Insert before ORDER BY / GROUP BY / HAVING / LIMIT if present.
        for keyword in ("ORDER BY", "GROUP BY", "HAVING", "LIMIT"):
            idx = sql_upper.find(keyword)
            if idx != -1:
                return f"{sql[:idx].rstrip()} WHERE {col_clause} {sql[idx:]}"
        return f"{sql} WHERE {col_clause}"


def _extract_primary_table(sql: str) -> str:
    """
    Best-effort extraction of the primary (first FROM) table name from *sql*.

    Returns an empty string when it cannot be determined.
    """
    try:
        statements = sqlglot.parse(sql)
        if not statements:
            return ""
        stmt = statements[0]
        from_clause = stmt.find(exp.From)
        if from_clause is None:
            return ""
        first_table = from_clause.find(exp.Table)
        if first_table is not None:
            return first_table.name or ""
    except Exception:
        pass
    return ""


def _count_joins(sql: str) -> int:
    """Return the number of explicit JOIN clauses in *sql* using sqlglot AST."""
    try:
        statements = sqlglot.parse(sql)
        if not statements:
            return 0
        stmt = statements[0]
        return len(list(stmt.find_all(exp.Join)))
    except Exception:
        return 0


# ---------------------------------------------------------------------------
# QueryDecomposer
# ---------------------------------------------------------------------------


class QueryDecomposer:
    """
    Decomposes a GROUP BY SELECT query into parallel, partition-scoped
    sub-queries.

    Usage
    -----
    ::

        decomposer = QueryDecomposer()
        if decomposer.can_decompose(sql, schema_profile):
            sub_queries = decomposer.decompose(sql, schema_profile)
            # ... stream-execute each sub_query.sql (after caller validation)
            results = decomposer.merge_results([sub_result1, sub_result2, ...])

    All produced sub-query SQL strings are SELECT-only by construction, but
    callers MUST independently validate them via ``sql_validator.SQLValidator``
    before executing (Invariant-1).
    """

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def can_decompose(self, sql: str, schema_profile: Any) -> bool:
        """
        Return True when *sql* is a good candidate for parallel decomposition.

        Decomposition is possible when:
        - *schema_profile* is not None.
        - The query has a GROUP BY clause.
        - The first GROUP BY column has cardinality <= 20, OR is a date/timestamp
          column (enabling month/quarter splitting).

        Decomposition is *not* possible when the query contains:
        - Window functions (OVER clause)
        - CTEs (WITH clause)
        - Nested sub-queries inside FROM / WHERE
        - A HAVING clause
        - More than 2 tables (complex multi-way JOINs)
        - sqlglot parse errors

        Returns False on any unexpected exception so the caller can proceed with
        the original query unmodified.
        """
        if schema_profile is None:
            return False

        try:
            statements = sqlglot.parse(sql)
        except sqlglot.errors.ParseError as exc:
            logger.debug("can_decompose: parse error — %s", exc)
            return False

        if not statements:
            return False

        stmt = statements[0]

        # Must be a SELECT.
        if not isinstance(stmt, (exp.Select, exp.Union)):
            return False

        # Reject CTEs.
        if stmt.find(exp.With) is not None:
            return False

        # Reject HAVING.
        if stmt.find(exp.Having) is not None:
            return False

        # Reject window functions.
        if stmt.find(exp.Window) is not None:
            return False

        # Reject sub-queries in FROM or WHERE.
        for node in stmt.walk():
            if isinstance(node, exp.Subquery):
                return False

        # Reject complex multi-table JOINs (> 2 tables).
        if _count_joins(sql) >= 2:
            return False

        # Must have a GROUP BY.
        group = stmt.find(exp.Group)
        if group is None:
            return False

        # Inspect the first decomposable GROUP BY column.
        group_cols = _parse_group_by_columns(sql)
        if not group_cols:
            return False

        primary_table = _extract_primary_table(sql)
        first_col = group_cols[0]

        # Date column — always decomposable (month splitting).
        if _is_date_column(first_col, schema_profile):
            return True

        # Categorical column — decomposable when cardinality is known and small.
        cardinality = _get_column_cardinality(first_col, primary_table, schema_profile)
        if cardinality < 0:
            # No cardinality info available — cannot decompose.
            logger.debug(
                "can_decompose: no cardinality info for column '%s'; skipping.",
                first_col,
            )
            return False

        if cardinality <= LOW_CARDINALITY_THRESHOLD:
            return True

        logger.debug(
            "can_decompose: column '%s' has cardinality %d > %d; skipping.",
            first_col,
            cardinality,
            LOW_CARDINALITY_THRESHOLD,
        )
        return False

    def decompose(self, sql: str, schema_profile: Any) -> List[SubQuery]:
        """
        Decompose *sql* into at most ``MAX_SUB_QUERIES`` partition-scoped
        sub-queries and return them as a list of :class:`SubQuery` objects.

        The decomposition strategy is chosen automatically:

        - **Categorical** — when the first GROUP BY column has known distinct
          values in *schema_profile*, one sub-query per value is produced.
        - **Date** — when the column is a date/timestamp type, sub-queries are
          produced for consecutive month ranges covering all data in the table's
          ``row_count_estimate`` period (best-effort).

        If neither strategy can produce any sub-queries (e.g. no distinct values
        and column is not date-typed), an empty list is returned; callers should
        execute the original query unmodified.

        Invariant: all returned ``SubQuery.sql`` values are SELECT-only by
        construction.  Callers must still validate before executing.
        """
        if not self.can_decompose(sql, schema_profile):
            return []

        group_cols = _parse_group_by_columns(sql)
        if not group_cols:
            return []

        primary_table = _extract_primary_table(sql)
        first_col = group_cols[0]

        # --- Strategy 1: categorical ------------------------------------------
        if not _is_date_column(first_col, schema_profile):
            return self._decompose_categorical(sql, first_col, primary_table, schema_profile)

        # --- Strategy 2: date / timestamp -------------------------------------
        return self._decompose_date(sql, first_col, primary_table, schema_profile)

    def merge_results(self, sub_results: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Merge a list of sub-query result dicts into a single combined result.

        Each item in *sub_results* is expected to be a dict with:
        - ``"columns"`` — list of column name strings
        - ``"rows"``    — list of row tuples/lists

        Missing or malformed entries are skipped with a warning.

        Returns::

            {
                "columns": list[str],  # deduplicated, order from first result
                "rows":    list,       # all rows concatenated
                "row_count": int,      # len(rows)
            }
        """
        if not sub_results:
            return {"columns": [], "rows": [], "row_count": 0}

        # Determine canonical column order from the first valid result.
        columns: List[str] = []
        for result in sub_results:
            if isinstance(result, dict) and result.get("columns"):
                columns = list(result["columns"])
                break

        all_rows: List[Any] = []
        for i, result in enumerate(sub_results):
            if not isinstance(result, dict):
                logger.warning("merge_results: sub_result[%d] is not a dict; skipping.", i)
                continue
            rows = result.get("rows")
            if not isinstance(rows, list):
                logger.warning(
                    "merge_results: sub_result[%d] has no 'rows' list; skipping.", i
                )
                continue
            all_rows.extend(rows)

        return {
            "columns": columns,
            "rows": all_rows,
            "row_count": len(all_rows),
        }

    # ------------------------------------------------------------------
    # Private decomposition strategies
    # ------------------------------------------------------------------

    def _decompose_categorical(
        self,
        sql: str,
        column: str,
        table_name: str,
        schema_profile: Any,
    ) -> List[SubQuery]:
        """
        One sub-query per distinct value of *column*.

        When the profile carries fewer than ``MAX_SUB_QUERIES`` distinct values,
        each gets its own sub-query.  When there are more, values are grouped
        into at most ``MAX_SUB_QUERIES`` buckets using IN-clause batching.

        Returns an empty list when no distinct values are available.
        """
        distinct_values = _get_distinct_values(column, table_name, schema_profile)
        if not distinct_values:
            logger.debug(
                "_decompose_categorical: no distinct_values for column '%s'.", column
            )
            return []

        # Estimate row count per partition (uniform assumption).
        total_row_estimate = _estimate_total_rows(table_name, schema_profile)
        per_partition_estimate = (
            max(1, total_row_estimate // len(distinct_values))
            if total_row_estimate > 0
            else 0
        )

        if len(distinct_values) <= MAX_SUB_QUERIES:
            # One sub-query per value.
            sub_queries: List[SubQuery] = []
            total = len(distinct_values)
            for idx, value in enumerate(distinct_values):
                str_value = str(value) if value is not None else "NULL"
                rewritten = _add_where_clause(sql, column, str_value)
                sub_queries.append(
                    SubQuery(
                        sql=rewritten,
                        partition_value=str_value,
                        estimated_rows=per_partition_estimate,
                        index=idx,
                        total=total,
                    )
                )
            return sub_queries

        # More values than MAX_SUB_QUERIES — batch them into IN-clauses.
        return self._batch_categorical(
            sql, column, distinct_values, per_partition_estimate
        )

    def _batch_categorical(
        self,
        sql: str,
        column: str,
        distinct_values: List[Any],
        per_partition_estimate: int,
    ) -> List[SubQuery]:
        """
        Group *distinct_values* into at most ``MAX_SUB_QUERIES`` buckets and
        rewrite *sql* with ``WHERE column IN (...)`` for each bucket.
        """
        n = len(distinct_values)
        bucket_size = max(1, -(-n // MAX_SUB_QUERIES))  # ceiling division
        buckets: List[List[Any]] = [
            distinct_values[i : i + bucket_size]
            for i in range(0, n, bucket_size)
        ]
        buckets = buckets[:MAX_SUB_QUERIES]

        sub_queries: List[SubQuery] = []
        total = len(buckets)
        for idx, bucket in enumerate(buckets):
            str_vals = [str(v) if v is not None else "NULL" for v in bucket]
            partition_label = f"{str_vals[0]}…{str_vals[-1]}" if len(str_vals) > 1 else str_vals[0]
            rewritten = _add_in_clause(sql, column, str_vals)
            sub_queries.append(
                SubQuery(
                    sql=rewritten,
                    partition_value=partition_label,
                    estimated_rows=per_partition_estimate * len(bucket),
                    index=idx,
                    total=total,
                )
            )
        return sub_queries

    def _decompose_date(
        self,
        sql: str,
        column: str,
        table_name: str,
        schema_profile: Any,
    ) -> List[SubQuery]:
        """
        Split *sql* into monthly date-range sub-queries.

        The date range is inferred from ``distinct_values`` (if present as date
        objects or ISO strings) or falls back to a 12-month window ending today.
        At most ``MAX_SUB_QUERIES`` months are produced; when the range exceeds
        that, quarters are used instead (up to 10 quarters, ~2.5 years).
        """
        from datetime import date, timedelta
        import calendar

        distinct_values = _get_distinct_values(column, table_name, schema_profile)
        today = date.today()

        if distinct_values:
            parsed_dates = _parse_date_values(distinct_values)
        else:
            parsed_dates = []

        if parsed_dates:
            min_date = min(parsed_dates)
            max_date = max(parsed_dates)
        else:
            # Default: 12-month rolling window ending this month.
            max_date = today.replace(day=1)
            min_date = date(max_date.year - 1, max_date.month, 1)

        # Build month buckets.
        months: List[tuple] = []  # (start_date, end_date) inclusive month ranges
        cur = min_date.replace(day=1)
        while cur <= max_date:
            last_day = calendar.monthrange(cur.year, cur.month)[1]
            end = cur.replace(day=last_day)
            months.append((cur, end))
            # Advance to next month.
            if cur.month == 12:
                cur = cur.replace(year=cur.year + 1, month=1, day=1)
            else:
                cur = cur.replace(month=cur.month + 1, day=1)

        # If too many months, collapse to quarters.
        if len(months) > MAX_SUB_QUERIES:
            months = _collapse_to_quarters(months, MAX_SUB_QUERIES)

        if not months:
            return []

        total_row_estimate = _estimate_total_rows(table_name, schema_profile)
        per_partition_estimate = (
            max(1, total_row_estimate // len(months)) if total_row_estimate > 0 else 0
        )

        sub_queries: List[SubQuery] = []
        total = len(months)
        for idx, (start, end) in enumerate(months):
            start_str = start.isoformat()
            end_str = end.isoformat()
            partition_label = f"{start_str}/{end_str}"
            rewritten = _add_date_range_clause(sql, column, start_str, end_str)
            sub_queries.append(
                SubQuery(
                    sql=rewritten,
                    partition_value=partition_label,
                    estimated_rows=per_partition_estimate,
                    index=idx,
                    total=total,
                )
            )

        return sub_queries


# ---------------------------------------------------------------------------
# Internal utilities used by the decomposition strategies
# ---------------------------------------------------------------------------


def _estimate_total_rows(table_name: str, schema_profile: Any) -> int:
    """
    Look up the row-count estimate for *table_name* from *schema_profile*.
    Returns 0 when not available.
    """
    if schema_profile is None or not table_name:
        return 0
    tbl_lower = table_name.lower()
    for table in getattr(schema_profile, "tables", []):
        if getattr(table, "name", "").lower() == tbl_lower:
            est = getattr(table, "row_count_estimate", -1)
            return max(0, int(est)) if est is not None else 0
    return 0


def _add_in_clause(sql: str, column: str, values: List[str]) -> str:
    """
    Rewrite *sql* to add ``WHERE column IN ('v1', 'v2', ...)`` using sqlglot.
    Falls back to string injection on parse failure.
    """
    try:
        statements = sqlglot.parse(sql)
        if not statements:
            raise ValueError("No statements parsed")
        stmt = statements[0]

        in_expr = exp.In(
            this=exp.Column(this=exp.Identifier(this=column)),
            expressions=[exp.Literal.string(v) for v in values],
        )

        existing_where = stmt.find(exp.Where)
        if existing_where is not None:
            new_where = exp.Where(
                this=exp.And(this=existing_where.this, expression=in_expr)
            )
            existing_where.replace(new_where)
        else:
            stmt.set("where", exp.Where(this=in_expr))

        return stmt.sql()

    except Exception as exc:
        logger.warning("_add_in_clause: AST rewrite failed (%s); falling back.", exc)
        escaped = ", ".join(f"'{v.replace(chr(39), chr(39)*2)}'" for v in values)
        clause = f"{column} IN ({escaped})"
        sql_upper = sql.upper().strip()
        if "WHERE" in sql_upper:
            return f"{sql} AND {clause}"
        for keyword in ("ORDER BY", "GROUP BY", "HAVING", "LIMIT"):
            idx = sql_upper.find(keyword)
            if idx != -1:
                return f"{sql[:idx].rstrip()} WHERE {clause} {sql[idx:]}"
        return f"{sql} WHERE {clause}"


def _add_date_range_clause(sql: str, column: str, start: str, end: str) -> str:
    """
    Rewrite *sql* to add ``WHERE column >= 'start' AND column <= 'end'``
    using sqlglot.  Falls back to string injection on parse failure.
    """
    try:
        statements = sqlglot.parse(sql)
        if not statements:
            raise ValueError("No statements parsed")
        stmt = statements[0]

        col = exp.Column(this=exp.Identifier(this=column))
        range_cond = exp.And(
            this=exp.GTE(this=col.copy(), expression=exp.Literal.string(start)),
            expression=exp.LTE(this=col.copy(), expression=exp.Literal.string(end)),
        )

        existing_where = stmt.find(exp.Where)
        if existing_where is not None:
            new_where = exp.Where(
                this=exp.And(this=existing_where.this, expression=range_cond)
            )
            existing_where.replace(new_where)
        else:
            stmt.set("where", exp.Where(this=range_cond))

        return stmt.sql()

    except Exception as exc:
        logger.warning(
            "_add_date_range_clause: AST rewrite failed (%s); falling back.", exc
        )
        clause = f"{column} >= '{start}' AND {column} <= '{end}'"
        sql_upper = sql.upper().strip()
        if "WHERE" in sql_upper:
            return f"{sql} AND {clause}"
        for keyword in ("ORDER BY", "GROUP BY", "HAVING", "LIMIT"):
            idx = sql_upper.find(keyword)
            if idx != -1:
                return f"{sql[:idx].rstrip()} WHERE {clause} {sql[idx:]}"
        return f"{sql} WHERE {clause}"


def _parse_date_values(values: List[Any]) -> List[date]:
    """
    Convert a mixed list of date objects, datetime objects, and ISO-8601
    strings to a list of ``datetime.date`` objects.  Invalid entries are
    silently skipped.
    """
    from datetime import datetime as _dt

    result: List[date] = []
    for v in values:
        if isinstance(v, date) and not isinstance(v, _dt):
            result.append(v)
        elif isinstance(v, _dt):
            result.append(v.date())
        elif isinstance(v, str):
            try:
                result.append(date.fromisoformat(v[:10]))
            except (ValueError, TypeError):
                pass
    return result


def _collapse_to_quarters(
    months: List[tuple], max_buckets: int
) -> List[tuple]:
    """
    Aggregate a list of (start, end) month tuples into quarters and return at
    most *max_buckets* of them.

    Each quarter spans January–March, April–June, July–September, or
    October–December.  The returned tuples use (quarter_start, quarter_end)
    inclusive dates.
    """
    quarters: Dict[tuple, List[tuple]] = {}
    for start, end in months:
        q = ((start.year, (start.month - 1) // 3 + 1))
        quarters.setdefault(q, []).append((start, end))

    result: List[tuple] = []
    for (year, qnum), mths in sorted(quarters.items()):
        q_start = min(s for s, _ in mths)
        q_end = max(e for _, e in mths)
        result.append((q_start, q_end))

    return result[:max_buckets]
