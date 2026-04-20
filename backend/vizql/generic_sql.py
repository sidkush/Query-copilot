"""ANSI-SQL stringifier for debugging + validator round-trip.

NOT a dialect emitter (Plan 7d owns that). Emits enough SQL for
``sqlglot.parse_one(… dialect='postgres')`` to accept and for
``sql_validator.SQLValidator.validate()`` to run its 6-layer check.
"""
from __future__ import annotations
from typing import TYPE_CHECKING
if TYPE_CHECKING:
    from . import sql_ast as sa


def render_generic(qf: "sa.SQLQueryFunction") -> str:
    from . import sql_ast as sa
    parts: list[str] = []
    if qf.ctes:
        heads = ["RECURSIVE " if qf.ctes[0].recursive else ""]
        parts.append("WITH " + heads[0] + ", ".join(
            f"{c.name} AS ({render_generic(c.query)})" for c in qf.ctes))
    parts.append("SELECT " + ", ".join(
        f"{_expr(p.expression)} AS {p.alias}" for p in qf.projections))
    parts.append("FROM " + _from(qf.from_))
    if qf.where is not None: parts.append("WHERE " + _expr(qf.where))
    if qf.group_by:
        parts.append("GROUP BY " + ", ".join(_expr(g) for g in qf.group_by))
    if qf.having is not None: parts.append("HAVING " + _expr(qf.having))
    if qf.order_by:
        parts.append("ORDER BY " + ", ".join(
            f"{_expr(e)} {'ASC' if asc else 'DESC'}" for e, asc in qf.order_by))
    if qf.limit is not None: parts.append(f"LIMIT {qf.limit}")
    return " ".join(parts)


def _from(src: object) -> str:
    from . import sql_ast as sa
    if isinstance(src, sa.TableRef):
        return f'{src.name} AS {src.alias}' if src.alias else src.name
    if isinstance(src, sa.JoinNode):
        j = "" if src.kind == "INNER" else src.kind + " "
        return (f"{_from(src.left)} {j}JOIN {_from(src.right)} ON "
                f"{_expr(src.on)}")
    if isinstance(src, sa.SubqueryRef):
        lat = "LATERAL " if src.lateral else ""
        return f"{lat}({render_generic(src.query)}) AS {src.alias}"
    raise AssertionError(f"unknown FROM source {src!r}")


def _expr(e: object) -> str:  # noqa: C901 — dispatch on kind
    from . import sql_ast as sa
    if isinstance(e, sa.Column):
        return f"{e.table_alias}.{e.name}" if e.table_alias else e.name
    if isinstance(e, sa.Literal):
        if isinstance(e.value, str): return "'" + e.value.replace("'", "''") + "'"
        if isinstance(e.value, bool): return "TRUE" if e.value else "FALSE"
        return str(e.value)
    if isinstance(e, sa.BinaryOp):
        return f"({_expr(e.left)} {e.op} {_expr(e.right)})"
    if isinstance(e, sa.FnCall):
        d = "DISTINCT " if e.distinct else ""
        args = ", ".join(_expr(a) for a in e.args)
        call = f"{e.name}({d}{args})"
        if e.within_group:
            call += " WITHIN GROUP (ORDER BY " + ", ".join(
                f"{_expr(x)} {'ASC' if asc else 'DESC'}"
                for x, asc in e.within_group) + ")"
        if e.filter_clause is not None:
            call += f" FILTER (WHERE {_expr(e.filter_clause)})"
        return call
    if isinstance(e, sa.Case):
        whens = " ".join(f"WHEN {_expr(c)} THEN {_expr(v)}" for c, v in e.whens)
        els = f" ELSE {_expr(e.else_)}" if e.else_ is not None else ""
        return f"CASE {whens}{els} END"
    if isinstance(e, sa.Cast):
        return f"CAST({_expr(e.expr)} AS {e.target_type.upper()})"
    if isinstance(e, sa.Window):
        parts = []
        if e.partition_by:
            parts.append("PARTITION BY " + ", ".join(_expr(p) for p in e.partition_by))
        if e.order_by:
            parts.append("ORDER BY " + ", ".join(
                f"{_expr(x)} {'ASC' if asc else 'DESC'}" for x, asc in e.order_by))
        if e.frame is not None:
            parts.append(f"{e.frame.kind} BETWEEN "
                         f"{e.frame.start[1] or ''} {e.frame.start[0]} AND "
                         f"{e.frame.end[1] or ''} {e.frame.end[0]}".strip())
        return f"{_expr(e.expr)} OVER ({' '.join(parts)})"
    if isinstance(e, sa.Subquery):
        return f"({render_generic(e.query)})"
    raise AssertionError(f"unknown expr {e!r}")
