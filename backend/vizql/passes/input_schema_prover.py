"""InputSchemaProver — §IV.4.

Walks the AST bottom-up. Every Column reference must resolve against an
upstream TableRef / CTE / Subquery schema. Fails loudly: the error
message names both the column and the visible schema aliases.
"""
from __future__ import annotations
from dataclasses import dataclass
from typing import Mapping
from .. import sql_ast as sa


class InputSchemaError(Exception): ...


@dataclass(frozen=True)
class InputSchemaProverPass:
    schemas: Mapping[str, Mapping[str, str]]  # table → { col → type }

    def run(self, qf: sa.SQLQueryFunction) -> sa.SQLQueryFunction:
        visible = self._visible_cols(qf)
        for p in qf.projections:
            self._check_expr(p.expression, visible)
        if qf.where is not None: self._check_expr(qf.where, visible)
        if qf.having is not None: self._check_expr(qf.having, visible)
        for g in qf.group_by: self._check_expr(g, visible)
        for cte in qf.ctes: self.run(cte.query)
        return qf

    def _visible_cols(self, qf: sa.SQLQueryFunction) -> set[str]:
        cols: set[str] = set()
        self._walk_from(qf.from_, cols)
        for cte in qf.ctes:
            for p in cte.query.projections:
                cols.add(p.alias)
        return cols

    def _walk_from(self, src: sa.FromSource, out: set[str]) -> None:
        if isinstance(src, sa.TableRef):
            schema = self.schemas.get(src.name)
            if schema is None:
                raise InputSchemaError(f"unknown table {src.name!r}")
            out.update(schema.keys())
            return
        if isinstance(src, sa.JoinNode):
            self._walk_from(src.left, out); self._walk_from(src.right, out); return
        if isinstance(src, sa.SubqueryRef):
            for p in src.query.projections: out.add(p.alias)
            return

    def _check_expr(self, e: sa.SQLQueryExpression, visible: set[str]) -> None:
        if isinstance(e, sa.Column):
            if e.name == "*": return
            if e.name not in visible:
                raise InputSchemaError(
                    f"column {e.name!r} not in visible schema "
                    f"(have: {sorted(visible)[:10]})")
            return
        if isinstance(e, sa.Literal): return
        if isinstance(e, sa.BinaryOp):
            self._check_expr(e.left, visible); self._check_expr(e.right, visible); return
        if isinstance(e, sa.FnCall):
            for a in e.args: self._check_expr(a, visible)
            if e.filter_clause is not None: self._check_expr(e.filter_clause, visible)
            return
        if isinstance(e, sa.Case):
            for c, v in e.whens:
                self._check_expr(c, visible); self._check_expr(v, visible)
            if e.else_ is not None: self._check_expr(e.else_, visible)
            return
        if isinstance(e, sa.Cast):
            self._check_expr(e.expr, visible); return
        if isinstance(e, sa.Window):
            self._check_expr(e.expr, visible)
            for p in e.partition_by: self._check_expr(p, visible)
            for ex, _ in e.order_by: self._check_expr(ex, visible)
            return
        if isinstance(e, sa.Subquery):
            # inner sq is already validated when the compiler emits it;
            # re-prove to stay idempotent.
            self.run(e.query); return
        raise InputSchemaError(f"unknown expr {e!r}")
