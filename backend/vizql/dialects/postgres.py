"""Postgres dialect — canonical SQL. Postgres-family DBs (CockroachDB,
Redshift) also route here (see registry.py)."""
from __future__ import annotations

from ..dialect_base import BaseDialect
from .. import sql_ast as sa
from .duckdb import DuckDBDialect


class PostgresDialect(DuckDBDialect):
    """Inherit generic-SQL overrides from DuckDB, change the pieces that
    actually differ from Postgres: cast syntax, int64 literals, DATE_DIFF,
    DROP COLUMN syntax."""
    name = "postgres"

    def format_cast(self, c: sa.Cast) -> str:
        return f"({self._emit_expr(c.expr)})::{c.target_type.upper()}"

    def format_int64_attribute(self, v: int) -> str:
        return f"{int(v)}::BIGINT"

    def format_datediff(self, part: str, a: str, b: str) -> str:
        # Postgres: AGE(b, a) → interval, or EXTRACT(EPOCH FROM ...)/86400.
        return f"(EXTRACT('{part}' FROM {b}) - EXTRACT('{part}' FROM {a}))"

    def format_top_clause(self, n: int) -> str:
        return f"LIMIT {int(n)}"

    def format_interval(self, part: str, n: int) -> str:
        return f"INTERVAL '{int(n)} {part.lower()}'"

    def format_drop_column(self, table: str, column: str) -> str:
        return (f"ALTER TABLE {self.format_identifier(table)} "
                f"DROP COLUMN {self.format_identifier(column)}")

    def format_set_isolation_level(self, level: str) -> str:
        return f"SET TRANSACTION ISOLATION LEVEL {level.upper()}"
