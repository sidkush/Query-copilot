"""Snowflake dialect — case-sensitive quoted idents, unquoted datediff part."""
from __future__ import annotations

import logging

from ..dialect_base import BaseDialect
from .. import sql_ast as sa
from .duckdb import DuckDBDialect


_log = logging.getLogger(__name__)
_warned_idents: set[str] = set()


class SnowflakeDialect(DuckDBDialect):
    name = "snowflake"

    def format_identifier(self, ident: str) -> str:
        if ident == "*":
            return "*"
        if ident.islower() and ident not in _warned_idents:
            _log.warning(
                "Snowflake identifier %r is all-lowercase; Snowflake quotes are "
                "case-sensitive — callers must match the exact casing.", ident)
            _warned_idents.add(ident)
        return '"' + ident.replace('"', '""') + '"'

    def format_cast(self, c: sa.Cast) -> str:
        return f"{self._emit_expr(c.expr)}::{c.target_type.upper()}"

    def format_int64_attribute(self, v: int) -> str:
        return f"{int(v)}::NUMBER(38,0)"

    def format_date_trunc(self, part: str, expr: str) -> str:
        return f"DATE_TRUNC('{part.upper()}', {expr})"

    def format_datediff(self, part: str, a: str, b: str) -> str:
        return f"DATEDIFF({part.upper()}, {a}, {b})"

    def format_current_timestamp(self) -> str:
        return "CURRENT_TIMESTAMP"

    def format_interval(self, part: str, n: int) -> str:
        return f"INTERVAL '{int(n)} {part.upper()}'"

    def format_set_isolation_level(self, level: str) -> str:
        return f"-- SNOWFLAKE SESSION ISOLATION IS FIXED — {level}"
