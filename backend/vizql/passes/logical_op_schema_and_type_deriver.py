"""SchemaAndTypeDeriver — propagate column types through every subquery."""
from __future__ import annotations
import dataclasses
from dataclasses import dataclass
from typing import Mapping
from .. import sql_ast as sa


@dataclass(frozen=True)
class SchemaAndTypeDeriverPass:
    schemas: Mapping[str, Mapping[str, str]]

    def run(self, qf: sa.SQLQueryFunction) -> sa.SQLQueryFunction:
        tbl_types = self._from_types(qf.from_)
        new_projs = tuple(dataclasses.replace(
            p, expression=self._annotate(p.expression, tbl_types))
            for p in qf.projections)
        return dataclasses.replace(qf, projections=new_projs)

    def _from_types(self, src: sa.FromSource) -> dict[str, str]:
        if isinstance(src, sa.TableRef):
            return dict(self.schemas.get(src.name, {}))
        if isinstance(src, sa.JoinNode):
            d = self._from_types(src.left); d.update(self._from_types(src.right)); return d
        if isinstance(src, sa.SubqueryRef):
            return {p.alias: getattr(p.expression, "resolved_type", "unknown")
                    for p in src.query.projections}
        return {}

    def _annotate(self, e: sa.SQLQueryExpression, types: dict[str, str]) -> sa.SQLQueryExpression:
        if isinstance(e, sa.Column):
            return dataclasses.replace(e, resolved_type=types.get(e.name, "unknown"))
        if isinstance(e, sa.BinaryOp):
            return dataclasses.replace(
                e, left=self._annotate(e.left, types),
                right=self._annotate(e.right, types))
        if isinstance(e, sa.FnCall):
            return dataclasses.replace(
                e, args=tuple(self._annotate(a, types) for a in e.args))
        if isinstance(e, sa.Case):
            whens = tuple((self._annotate(c, types), self._annotate(v, types))
                          for c, v in e.whens)
            els = self._annotate(e.else_, types) if e.else_ is not None else None
            return dataclasses.replace(e, whens=whens, else_=els)
        if isinstance(e, sa.Cast):
            return dataclasses.replace(e, expr=self._annotate(e.expr, types))
        if isinstance(e, sa.Window):
            return dataclasses.replace(e, expr=self._annotate(e.expr, types))
        return e
