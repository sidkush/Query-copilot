"""
sql_filter_injector.py — safe WHERE-clause injection for Analyst Pro.

Wraps an incoming SELECT query in an outer
``SELECT * FROM (<sql>) AS _askdb_filtered WHERE …`` before it is handed
to SQLValidator. Only equality predicates are supported in Plan 4a.
Field names must be plain SQL identifiers; values must be
``str`` / ``int`` / ``float`` / ``bool`` / ``None``.

This module performs no execution — it returns a new SQL string.
"""

from __future__ import annotations

import re
from typing import Any, Iterable, Optional


_IDENT_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
_SUPPORTED_OPS = frozenset({"eq", "in", "notIn"})


class FilterInjectionError(ValueError):
    """Raised when a filter dict fails validation."""


def _render_value(value: Any) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, (int, float)):
        return repr(value)
    if isinstance(value, str):
        escaped = value.replace("'", "''")
        return f"'{escaped}'"
    raise FilterInjectionError(
        f"Unsupported filter value type: {type(value).__name__}"
    )


def _render_predicate(field: str, op: str, entry: dict) -> str:
    if not _IDENT_RE.match(field):
        raise FilterInjectionError(f"Invalid filter field name: {field!r}")
    if op not in _SUPPORTED_OPS:
        raise FilterInjectionError(f"Unsupported filter op: {op!r}")

    if op in ("in", "notIn"):
        values = entry.get("values")
        if not isinstance(values, list) or len(values) == 0:
            raise FilterInjectionError(
                f"{op!r} filter requires a non-empty 'values' list: {field!r}"
            )
        rendered = []
        for v in values:
            if isinstance(v, (str, int, float, bool)) or v is None:
                rendered.append(_render_value(v))
            else:
                raise FilterInjectionError(
                    f"Unsupported filter value type in {op!r} list: {type(v).__name__}"
                )
        sql_op = "IN" if op == "in" else "NOT IN"
        return f'"{field}" {sql_op} ({", ".join(rendered)})'

    # eq
    value = entry.get("value")
    if value is None:
        return f'"{field}" IS NULL'
    return f'"{field}" = {_render_value(value)}'


def inject_additional_filters(
    sql: str,
    filters: Optional[Iterable[dict]],
) -> str:
    """
    Wrap *sql* in an outer SELECT that applies the given equality filters.

    Parameters
    ----------
    sql : str
        The user-approved SQL (already SELECT-only by the time this runs).
    filters : iterable of dict or None
        Each dict: ``{"field": str, "op": "eq", "value": str|int|float|bool|None}``.
        Empty or ``None`` leaves the SQL untouched.

    Returns
    -------
    str
        The (possibly) wrapped SQL.

    Raises
    ------
    FilterInjectionError
        On invalid field, op, or value.
    """
    filters_list = list(filters) if filters else []
    if not filters_list:
        return sql

    predicates = [
        _render_predicate(f["field"], f.get("op", "eq"), f)
        for f in filters_list
    ]

    base = sql.rstrip().rstrip(";").rstrip()
    where = " AND ".join(predicates)
    return f"SELECT * FROM ({base}) AS _askdb_filtered WHERE {where}"
