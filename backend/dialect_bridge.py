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
"""
from __future__ import annotations

import logging

import sqlglot

logger = logging.getLogger(__name__)


def transpile(sql: str, *, source: str, target: str) -> str:
    out, _ = transpile_checked(sql, source=source, target=target)
    return out


def transpile_checked(sql: str, *, source: str, target: str) -> tuple[str, bool]:
    """Return (result_sql, failed).

    ``failed=True`` means sqlglot raised or returned empty; the result_sql
    is the original input. ``failed=False`` on same-dialect pass-through too
    (no conversion needed ≠ failure). Use this instead of ``out == sql``
    to avoid false-positive failure detection when identical SQL is valid output.
    """
    if source.lower() == target.lower():
        return sql, False
    try:
        results = sqlglot.transpile(
            sql,
            read=source,
            write=target,
            error_level=sqlglot.ErrorLevel.WARN,
        )
        return (results[0] if results else sql), not results
    except Exception as exc:
        logger.warning(
            "dialect_bridge transpile %s->%s failed (%s); returning source SQL",
            source, target, type(exc).__name__,
        )
        return sql, True
