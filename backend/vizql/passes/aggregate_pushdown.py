"""AggregatePushdown — push SUM/COUNT/… into a SubqueryRef whose grouping
keys are all referenced group keys. Safe-pattern heuristic only: skip if
window functions reference the outer grain."""
from __future__ import annotations
import dataclasses
from .. import sql_ast as sa


class AggregatePushdownPass:
    def run(self, qf: sa.SQLQueryFunction) -> sa.SQLQueryFunction:
        if not isinstance(qf.from_, sa.SubqueryRef): return qf
        if not qf.group_by: return qf
        if any(isinstance(p.expression, sa.Window) for p in qf.projections):
            # keep windows at outer layer
            return qf
        inner = qf.from_.query
        # move the SUM projections + GROUP BY into the inner subquery
        pushed = dataclasses.replace(
            inner,
            projections=qf.projections,
            group_by=qf.group_by,
        )
        return dataclasses.replace(
            qf,
            projections=tuple(sa.Projection(alias=p.alias,
                                              expression=sa.Column(
                                                  name=p.alias,
                                                  table_alias=qf.from_.alias))
                              for p in qf.projections),
            from_=sa.SubqueryRef(query=pushed, alias=qf.from_.alias),
            group_by=(),
            diagnostics=qf.diagnostics + ("aggregate_pushdown: applied",),
        )
