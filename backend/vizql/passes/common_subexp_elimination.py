"""CommonSubexpressionElimination — ExpressionCounter + promotion.

Count hashable expressions across the SELECT list + WHERE + HAVING.
Any expression counted ≥ 2 with cost > Column-access is hoisted to a
named alias in the projection list; subsequent references swap in a
Column pointing at the alias.
"""
from __future__ import annotations
import dataclasses
from collections import Counter
from .. import sql_ast as sa


class CommonSubexpElimPass:
    def run(self, qf: sa.SQLQueryFunction) -> sa.SQLQueryFunction:
        counts: Counter[sa.SQLQueryExpression] = Counter()
        for p in qf.projections: _count(p.expression, counts)
        if qf.where is not None: _count(qf.where, counts)
        if qf.having is not None: _count(qf.having, counts)
        shared = [e for e, n in counts.items() if n >= 2 and _cost(e) > 0]
        if not shared: return qf
        alias_map: dict[sa.SQLQueryExpression, str] = {}
        new_projs = list(qf.projections)
        for i, e in enumerate(shared):
            alias = f"__cse_{i}"
            alias_map[e] = alias
            new_projs.append(sa.Projection(alias=alias, expression=e))
        rebuilt = tuple(dataclasses.replace(p, expression=_rewrite(p.expression, alias_map))
                         for p in new_projs)
        return dataclasses.replace(
            qf,
            projections=rebuilt,
            diagnostics=qf.diagnostics + (f"cse: {len(shared)} shared",),
        )


def _count(e: sa.SQLQueryExpression, out: "Counter[sa.SQLQueryExpression]") -> None:
    out[e] += 1
    if isinstance(e, sa.BinaryOp): _count(e.left, out); _count(e.right, out)
    elif isinstance(e, sa.FnCall):
        for a in e.args: _count(a, out)
    elif isinstance(e, sa.Case):
        for c, v in e.whens: _count(c, out); _count(v, out)
        if e.else_ is not None: _count(e.else_, out)


def _cost(e: sa.SQLQueryExpression) -> int:
    if isinstance(e, (sa.Column, sa.Literal)): return 0
    if isinstance(e, sa.BinaryOp): return 1 + _cost(e.left) + _cost(e.right)
    if isinstance(e, sa.FnCall): return 2 + sum(_cost(a) for a in e.args)
    return 1


def _rewrite(e: sa.SQLQueryExpression, alias_map: dict[sa.SQLQueryExpression, str]) -> sa.SQLQueryExpression:
    if e in alias_map: return sa.Column(name=alias_map[e], table_alias="")
    if isinstance(e, sa.BinaryOp):
        return dataclasses.replace(e, left=_rewrite(e.left, alias_map),
                                     right=_rewrite(e.right, alias_map))
    if isinstance(e, sa.FnCall):
        return dataclasses.replace(
            e, args=tuple(_rewrite(a, alias_map) for a in e.args))
    return e
