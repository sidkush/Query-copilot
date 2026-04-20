"""BigQuery dialect — argument-swapped DATE_TRUNC, backtick idents,
SAFE_CAST, TIMESTAMP_DIFF. Mirrors BigQuerySQLDialect (§IV.5)."""
from __future__ import annotations

from ..dialect_base import BaseDialect
from .. import sql_ast as sa
from .duckdb import DuckDBDialect


class BigQueryDialect(DuckDBDialect):
    name = "bigquery"

    def format_identifier(self, ident: str) -> str:
        if ident == "*":
            return "*"
        return "`" + ident.replace("`", "``") + "`"

    def format_cast(self, c: sa.Cast) -> str:
        return f"SAFE_CAST({self._emit_expr(c.expr)} AS {c.target_type.upper()})"

    def format_int64_attribute(self, v: int) -> str:
        return f"CAST({int(v)} AS INT64)"

    def format_date_trunc(self, part: str, expr: str) -> str:
        return f"DATE_TRUNC({expr}, {part.upper()})"

    def format_datediff(self, part: str, a: str, b: str) -> str:
        return f"TIMESTAMP_DIFF({b}, {a}, {part.upper()})"

    def format_current_timestamp(self) -> str:
        return "CURRENT_TIMESTAMP()"

    def format_interval(self, part: str, n: int) -> str:
        return f"INTERVAL {int(n)} {part.upper()}"

    def format_set_isolation_level(self, level: str) -> str:
        # BigQuery has no session isolation — comment out.
        return f"-- BIGQUERY IGNORES ISOLATION LEVEL {level}"
