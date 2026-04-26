"""Phase M-alt — sqlglot dialect bridge.

Pure transpile function. No class, no dataclass, no state.

Contract:
- `transpile(sql, *, source, target) -> str`
- Same-dialect pass-through (case-insensitive).
- ErrorLevel.WARN lets sqlglot continue on minor issues.
- Exception path: log warning, return source SQL unchanged.
  Ring 3 (ScopeValidator) runs next and catches any semantic drift.

Telemetry is the call-site's job, not this function's. See
`waterfall_router.py` for the `transpile_failure` alert dispatch.

Adversarial folds (A13/A20):
- DB_TYPE_TO_SQLGLOT explicit map: AskDB's DBType enum diverges from
  sqlglot's Dialects names (mssql -> tsql, postgresql -> postgres,
  ibm_db2 -> db2, sap_hana -> hana, supabase -> postgres). Without
  this map, calling sqlglot.transpile(..., read='supabase') raises
  ValueError('Unknown dialect') and fail-open returns source SQL —
  which then executes as wrong-dialect on target.
- normalize_dialect() validates against sqlglot.Dialects at import
  time: typo'd db_type fails fast, not silently at first transpile.
"""
from __future__ import annotations

import logging
from typing import Optional

import sqlglot

logger = logging.getLogger(__name__)


# A13/A20 fold — explicit DB type → sqlglot dialect mapping.
# AskDB DBType enum (config.py) values on the LEFT, sqlglot canonical
# dialect ID on the RIGHT. Verified against `sqlglot.Dialects` enum.
#
# IDENTITY ENTRIES (final A20 fold): waterfall_router._transpile_for_live_tier
# pre-normalizes via its own _SQLGLOT_DIALECT_ALIAS map BEFORE calling
# transpile_checked. So this map MUST also accept already-normalized
# sqlglot canonical names ("postgres", "tsql", "hana", "db2"); without
# these identity rows, every postgres / mssql / hana / db2 LiveTier
# query would fail-closed (failed=True) and execute on source dialect.
DB_TYPE_TO_SQLGLOT: dict[str, str] = {
    # Direct (1:1) — same name on both sides.
    "bigquery": "bigquery",
    "snowflake": "snowflake",
    "redshift": "redshift",
    "databricks": "databricks",
    "clickhouse": "clickhouse",
    "duckdb": "duckdb",
    "trino": "trino",
    "oracle": "oracle",
    "sqlite": "sqlite",
    "mysql": "mysql",
    # Renamed in sqlglot.
    "postgresql": "postgres",
    "mssql": "tsql",
    # Compatible-via-wire-protocol or compatible-syntax:
    "mariadb": "mysql",        # MariaDB ≈ MySQL syntax
    "cockroachdb": "postgres", # Wire-compatible with Postgres
    "supabase": "postgres",    # Supabase = managed Postgres
    "sap_hana": "hana",        # sqlglot uses 'hana'
    "ibm_db2": "db2",          # sqlglot uses 'db2'
    # Identity entries — accept already-normalized sqlglot IDs.
    "postgres": "postgres",
    "tsql": "tsql",
    "hana": "hana",
    "db2": "db2",
    "presto": "presto",
}


def _validate_dialect_map() -> None:
    """A13 fold — assert every value in DB_TYPE_TO_SQLGLOT is a valid
    sqlglot dialect at import time. If a future sqlglot upgrade renames
    one of these IDs, fail loud at boot rather than silently fail-closed
    on first transpile.

    D28-final fold — narrow except so AttributeError (signaling a sqlglot
    rename like Dialects→Dialect — the exact failure this validator was
    added to detect) surfaces as a warning instead of being swallowed.
    """
    try:
        valid = {d.value for d in sqlglot.Dialects}
    except (ImportError, AttributeError) as exc:
        logger.warning(
            "dialect_bridge: cannot enumerate sqlglot.Dialects (%s: %s) — "
            "validator skipped. Likely sqlglot API rename; pin or update.",
            type(exc).__name__, exc,
        )
        return
    bad = {v for v in DB_TYPE_TO_SQLGLOT.values() if v and v not in valid}
    if bad:
        logger.error(
            "dialect_bridge: DB_TYPE_TO_SQLGLOT references unknown sqlglot "
            "dialects %s — backend may execute wrong-dialect SQL silently. "
            "Update the map or pin sqlglot version.",
            sorted(bad),
        )


_validate_dialect_map()


def normalize_dialect(db_type: Optional[str]) -> str:
    """Map AskDB db_type string to sqlglot dialect canonical name.

    Defaults to "" (no dialect) for unknown values — caller decides
    whether to block or proceed. NEVER fail open into wrong-dialect
    execution: the caller (transpile_checked) treats unknown source
    or target as a transpile failure rather than silently returning
    source SQL.
    """
    if not db_type:
        return ""
    s = str(db_type).strip().lower()
    return DB_TYPE_TO_SQLGLOT.get(s, "")


def transpile(sql: str, *, source: str, target: str) -> str:
    out, _ = transpile_checked(sql, source=source, target=target)
    return out


def transpile_checked(sql: str, *, source: str, target: str) -> tuple[str, bool]:
    """Return (result_sql, failed).

    ``failed=True`` means sqlglot raised, returned empty, or one of the
    dialect names is unknown to sqlglot (A13 fold). The result_sql is
    the original input in failure cases. ``failed=False`` on same-dialect
    pass-through too (no conversion needed ≠ failure).

    Callers should check `failed` before executing the returned SQL
    against the target engine — a `failed=True` return means the SQL
    is in `source` dialect, not `target`, and may produce syntax errors
    or worse, semantic drift (`||` concat vs `+`).
    """
    # A6/A11 fold — pre-parse size guard mirrors scope_validator.
    try:
        from config import settings as _cfg
        _max_bytes = int(getattr(_cfg, "SQL_MAX_LEN_BYTES", 100_000))
    except Exception:
        _max_bytes = 100_000
    if isinstance(sql, str) and len(sql.encode("utf-8", errors="ignore")) > _max_bytes:
        logger.warning(
            "dialect_bridge: SQL exceeds %d-byte cap, refusing transpile",
            _max_bytes,
        )
        return sql, True

    src_norm = normalize_dialect(source)
    tgt_norm = normalize_dialect(target)
    # A13 fold — unknown dialect ID is FAILURE, not pass-through. The
    # caller (waterfall_router._transpile_for_live_tier) honors the
    # `failed` bool; with this we no longer silently execute source
    # SQL on a target whose dialect we don't recognize.
    if not src_norm or not tgt_norm:
        logger.warning(
            "dialect_bridge: unknown dialect (source=%r tgt=%r) — refused transpile",
            source, target,
        )
        return sql, True
    if src_norm == tgt_norm:
        return sql, False
    try:
        results = sqlglot.transpile(
            sql,
            read=src_norm,
            write=tgt_norm,
            error_level=sqlglot.ErrorLevel.WARN,
        )
        return (results[0] if results else sql), not results
    except RecursionError:
        # A6/A11 fold — explicit RecursionError catch.
        logger.warning(
            "dialect_bridge transpile %s->%s hit recursion limit",
            src_norm, tgt_norm,
        )
        return sql, True
    except Exception as exc:
        logger.warning(
            "dialect_bridge transpile %s->%s failed (%s); returning source SQL",
            src_norm, tgt_norm, type(exc).__name__,
        )
        return sql, True
