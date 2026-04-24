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
    if source.lower() == target.lower():
        return sql
    try:
        return sqlglot.transpile(
            sql,
            read=source,
            write=target,
            error_level=sqlglot.ErrorLevel.WARN,
        )[0]
    except Exception as exc:
        logger.warning(
            "dialect_bridge transpile %s->%s failed (%s); returning source SQL",
            source, target, type(exc).__name__,
        )
        return sql
