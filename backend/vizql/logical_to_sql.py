"""LogicalOp -> SQLQueryFunction compiler (Build_Tableau.md §IV.4 — the
``LogicalExpToSQLQueryExpression`` pass).

One ``_compile_<kind>`` per LogicalOp kind; one ``_expr`` per logical
Expression kind. Output is always a ``SQLQueryFunction`` — simple ops
project the base relation, compound ops wrap inner compiles as CTEs or
SubqueryRefs.
"""
from __future__ import annotations

import dataclasses
from typing import Any, Callable, Optional

from . import logical as lg
from . import sql_ast as sa


def compile_logical_to_sql(plan: Any) -> sa.SQLQueryFunction:
    return _Compiler()._compile(plan)


class _Compiler:
    def __init__(self) -> None:
        self._alias_counter: int = 0

    def _compile(self, op: Any) -> sa.SQLQueryFunction:
        fn: Optional[Callable[[Any], sa.SQLQueryFunction]] = getattr(
            self, f"_compile_{type(op).__name__}", None)
        if fn is None:
            raise NotImplementedError(f"no compile rule for {type(op).__name__}")
        qf = fn(op)
        qf.validate_structure()
        return qf

    # ---- per-op ----

    def _compile_LogicalOpRelation(self, op: lg.LogicalOpRelation) -> sa.SQLQueryFunction:
        alias = self._alias()
        return sa.SQLQueryFunction(
            projections=(sa.Projection(alias="*",
                                        expression=sa.Column(name="*", table_alias="")),),
            from_=sa.TableRef(name=op.table, alias=alias, schema=op.schema),
        )

    def _compile_LogicalOpProject(self, op: lg.LogicalOpProject) -> sa.SQLQueryFunction:
        inner = self._compile(op.input)
        projs: list[sa.Projection] = []
        for name, expr in op.expressions.entries:
            projs.append(sa.Projection(alias=name, expression=self._expr(expr)))
        for new_name, expr2 in op.calculated_column:
            projs.append(sa.Projection(alias=new_name, expression=self._expr(expr2)))
        # rename pass — lift from input schema
        return _with(inner, projections=tuple(projs) if projs else inner.projections)

    def _compile_LogicalOpSelect(self, op: lg.LogicalOpSelect) -> sa.SQLQueryFunction:
        inner = self._compile(op.input)
        pred = self._expr(op.predicate)
        return _with(inner, where=_and(inner.where, pred))

    def _compile_LogicalOpFilter(self, op: lg.LogicalOpFilter) -> sa.SQLQueryFunction:
        inner = self._compile(op.input)
        pred = self._expr(op.predicate)
        return _with(inner, having=_and(inner.having, pred))

    def _compile_LogicalOpAggregate(self, op: lg.LogicalOpAggregate) -> sa.SQLQueryFunction:
        inner = self._compile(op.input)
        group_exprs: tuple[sa.SQLQueryExpression, ...] = tuple(
            sa.Column(name=f.id, table_alias="") for f in op.group_bys)
        projs: list[sa.Projection] = [
            sa.Projection(alias=f.id, expression=sa.Column(name=f.id, table_alias=""))
            for f in op.group_bys
        ]
        for ae in op.aggregations:
            projs.append(sa.Projection(
                alias=ae.name,
                expression=sa.FnCall(name=ae.agg.upper(),
                                      args=(self._expr(ae.expr),))))
        return _with(inner, projections=tuple(projs), group_by=group_exprs)

    def _compile_LogicalOpOrder(self, op: lg.LogicalOpOrder) -> sa.SQLQueryFunction:
        inner = self._compile(op.input)
        ob: tuple[tuple[sa.SQLQueryExpression, bool], ...] = tuple(
            (self._expr(o.identifier_exp), o.is_ascending) for o in op.order_by)
        return _with(inner, order_by=ob)

    def _compile_LogicalOpTop(self, op: lg.LogicalOpTop) -> sa.SQLQueryFunction:
        inner = self._compile(op.input)
        return _with(inner, limit=op.limit)

    def _compile_LogicalOpOver(self, op: lg.LogicalOpOver) -> sa.SQLQueryFunction:
        inner = self._compile(op.input)
        partition: tuple[sa.SQLQueryExpression, ...] = tuple(
            sa.Column(name=f.id, table_alias="") for f in op.partition_bys.fields)
        order: tuple[tuple[sa.SQLQueryExpression, bool], ...] = tuple(
            (self._expr(o.identifier_exp), o.is_ascending) for o in op.order_by)
        frame = sa.FrameClause(kind=op.frame.frame_type.value.upper(),
                                start=(op.frame.start.kind, op.frame.start.offset),
                                end=(op.frame.end.kind, op.frame.end.offset))
        new_projs: list[sa.Projection] = list(inner.projections)
        for name, expr in op.expressions.entries:
            new_projs.append(sa.Projection(
                alias=name,
                expression=sa.Window(expr=self._expr(expr),
                                      partition_by=partition,
                                      order_by=order,
                                      frame=frame)))
        return _with(inner, projections=tuple(new_projs))

    def _compile_LogicalOpLookup(self, op: lg.LogicalOpLookup) -> sa.SQLQueryFunction:
        inner = self._compile(op.input)
        if op.offset == 0:
            # FIXED LOD: correlated subquery. The inner is already a
            # GROUP-BY'd aggregate over the fixed dims. Wrap as Subquery
            # with correlation on the fixed-dim keys.
            correl: tuple[tuple[str, str], ...] = tuple(
                (f.id, f.id) for f in _fixed_group_keys(op.input))
            sub = sa.Subquery(query=inner, correlated_on=correl)
            alias = self._alias()
            outer = sa.SQLQueryFunction(
                projections=(sa.Projection(
                    alias="fixed_total",
                    expression=sub),),
                from_=sa.TableRef(name="__fixed_outer", alias=alias),
                diagnostics=(
                    f"fixed_lod: correlated on {[c for c, _ in correl]}",
                    "fixed_lod: WARNING expensive on high-cardinality dims",
                ),
            )
            return outer
        # offset != 0 → LAG/LEAD (Task 3 behaviour)
        fn = sa.FnCall(name="LAG" if op.offset > 0 else "LEAD",
                       args=(self._expr(op.lookup_field),
                             sa.Literal(value=abs(op.offset), data_type="int")))
        new_projs: list[sa.Projection] = list(inner.projections) + [
            sa.Projection(alias="lookup",
                          expression=sa.Window(expr=fn, partition_by=(), order_by=()))]
        return _with(inner, projections=tuple(new_projs))

    def _compile_LogicalOpUnpivot(self, op: lg.LogicalOpUnpivot) -> sa.SQLQueryFunction:
        # Emit as two projections + FnCall("UNPIVOT", …) marker — dialect
        # emitter (Plan 7d) rewrites per-engine.
        inner = self._compile(op.input)
        name_proj = sa.Projection(alias=op.name_col,
                                    expression=sa.FnCall(name="UNPIVOT_NAME", args=()))
        val_proj = sa.Projection(alias=op.value_col,
                                   expression=sa.FnCall(name="UNPIVOT_VALUE", args=()))
        return _with(inner, projections=(name_proj, val_proj))

    def _compile_LogicalOpValuestoColumns(self, op: lg.LogicalOpValuestoColumns) -> sa.SQLQueryFunction:
        inner = self._compile(op.input)
        marker = sa.FnCall(name="PIVOT",
                            args=(self._expr(op.pivot_col), self._expr(op.agg_col)))
        return _with(inner, projections=(sa.Projection(alias="pivoted", expression=marker),))

    def _compile_LogicalOpDomain(self, op: lg.LogicalOpDomain) -> sa.SQLQueryFunction:
        inner = self._compile(op.input)
        if op.domain is lg.DomainType.SEPARATE:
            return inner
        # SNOWFLAKE: materialise cartesian CTE of (row-dim × col-dim)
        cte = sa.CTE(name=f"snowflake_{self._alias()}", query=inner)
        alias = self._alias()
        return sa.SQLQueryFunction(
            projections=inner.projections,
            from_=sa.JoinNode(
                kind="CROSS",
                left=sa.SubqueryRef(query=inner, alias=alias),
                right=sa.SubqueryRef(query=inner, alias=self._alias()),
                on=sa.Literal(value=True, data_type="bool")),
            ctes=(cte,),
        )

    def _compile_LogicalOpUnion(self, op: lg.LogicalOpUnion) -> sa.SQLQueryFunction:
        l = self._compile(op.left)
        r = self._compile(op.right)
        setop = sa.SetOp(kind="UNION", left=l, right=r, all=False)
        return _with(l, set_op=setop)

    def _compile_LogicalOpIntersect(self, op: lg.LogicalOpIntersect) -> sa.SQLQueryFunction:
        l = self._compile(op.left)
        r = self._compile(op.right)
        setop = sa.SetOp(kind="INTERSECT", left=l, right=r, all=False)
        return _with(l, set_op=setop)

    # ---- expression dispatch ----

    def _expr(self, e: Any) -> sa.SQLQueryExpression:
        if isinstance(e, lg.Column):
            return sa.Column(name=e.field_id, table_alias="")
        if isinstance(e, lg.Literal):
            return sa.Literal(value=e.value, data_type=e.data_type)
        if isinstance(e, lg.BinaryOp):
            return sa.BinaryOp(op=e.op, left=self._expr(e.left),
                                right=self._expr(e.right))
        if isinstance(e, lg.FnCall):
            return sa.FnCall(name=e.name.upper(),
                              args=tuple(self._expr(a) for a in e.args))
        raise AssertionError(f"unknown logical expr {e!r}")

    # ---- utils ----

    def _alias(self) -> str:
        self._alias_counter += 1
        return f"t{self._alias_counter}"


def _with(qf: sa.SQLQueryFunction, **kw: Any) -> sa.SQLQueryFunction:
    return dataclasses.replace(qf, **kw)


def _and(a: Optional[sa.SQLQueryExpression],
         b: Optional[sa.SQLQueryExpression]) -> Optional[sa.SQLQueryExpression]:
    if a is None:
        return b
    if b is None:
        return a
    return sa.BinaryOp(op="AND", left=a, right=b)


def _fixed_group_keys(op: Any) -> tuple[lg.Field, ...]:
    if isinstance(op, lg.LogicalOpAggregate):
        return op.group_bys
    if hasattr(op, "input"):
        return _fixed_group_keys(op.input)
    return ()


__all__ = ["compile_logical_to_sql"]
