"""DBType → BaseDialect singleton map. Unknown engines fall back to
DuckDB with a single-shot WARNING log."""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from config import DBType

if TYPE_CHECKING:
    from ..dialect_base import BaseDialect

_log = logging.getLogger(__name__)
_warned: set[DBType] = set()
_cache: dict[type, "BaseDialect"] = {}


def _load() -> dict[DBType, "BaseDialect"]:
    from .duckdb import DuckDBDialect
    from .postgres import PostgresDialect
    from .bigquery import BigQueryDialect
    from .snowflake import SnowflakeDialect

    def _mk(cls):
        if cls not in _cache:
            _cache[cls] = cls()
        return _cache[cls]

    return {
        DBType.DUCKDB: _mk(DuckDBDialect),
        DBType.POSTGRESQL: _mk(PostgresDialect),
        DBType.COCKROACHDB: _mk(PostgresDialect),  # Postgres wire-compat
        DBType.REDSHIFT: _mk(PostgresDialect),      # Postgres-dialect family
        DBType.BIGQUERY: _mk(BigQueryDialect),
        DBType.SNOWFLAKE: _mk(SnowflakeDialect),
    }


def get_dialect(db_type: DBType) -> "BaseDialect":
    table = _load()
    if db_type in table:
        return table[db_type]
    if db_type not in _warned:
        _log.warning(
            "VizQL: no dialect emitter for %s; falling back to DuckDB. "
            "(Plan 7d only ships duckdb/postgres/bigquery/snowflake; "
            "others are roadmap Phase 4 follow-up.)",
            db_type.value,
        )
        _warned.add(db_type)
    return table[DBType.DUCKDB]


__all__ = ["get_dialect"]
