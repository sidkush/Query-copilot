"""Plan 9a — compile analytics specs into SQLQueryFunctions.

Each analytics spec (reference line / band / distribution / totals) is
materialised as one or more SEPARATE SQL queries issued alongside the
base viz plan. Scope semantics (Build_Tableau §XIII.1) map as follows:

    entire → SELECT agg(measure)      FROM (base) _t0
    pane   → SELECT dims, agg(measure) FROM (base) _t0 GROUP BY dims
    cell   → SELECT dims, agg(measure) OVER (PARTITION BY dims) FROM (base) _t0

Totals (§IV.7 step 9) are a separate kind: rebuild the base plan with
dimensions removed (grand) or all-but-one kept (subtotal), optionally
stripping dimension / measure / table_calc filters when
``should_affect_totals`` is False.

Per CORRECTIONS C1: sql_ast uses real field names — ``Cast.target_type``,
``Window.expr``, ``FnCall.within_group``, ``SubqueryRef`` (not FromSubquery).
Per CORRECTIONS C7: constant reference lines wrap the base plan as a
SubqueryRef and emit ``SELECT CAST(value AS DOUBLE) AS __reference_value__
FROM (base) _t0 LIMIT 1``; the endpoint short-circuits execution.
"""
from __future__ import annotations

from typing import Optional, Sequence

from . import analytics_types as at
from . import logical as lg
from . import sql_ast as sa
from .logical_to_sql import compile_logical_to_sql


_REFERENCE_VALUE_COL = "__reference_value__"
_TOTAL_COL = "__total_value__"
_SUBTOTAL_COL = "__subtotal_value__"

_VALID_SCOPES = {"entire", "pane", "cell"}
_STRIPPED_FILTER_STAGES = frozenset({"dimension", "measure", "table_calc"})


# --------------------------------------------------------------------- helpers

def _base_subquery_ref(base_plan: lg.LogicalOp, alias: str = "_t0") -> sa.SubqueryRef:
    """Compile ``base_plan`` and wrap it as a SubqueryRef with the given alias."""
    inner = compile_logical_to_sql(base_plan)
    return sa.SubqueryRef(query=inner, alias=alias)


def _col(name: str) -> sa.Column:
    return sa.Column(name=name, table_alias="")


def _agg_expr(aggregation: str, measure_col: str,
              percentile: Optional[int]) -> sa.SQLQueryExpression:
    """Build the analytic aggregate expression over the base subquery."""
    c = _col(measure_col)
    if aggregation == "mean":
        return sa.FnCall(name="AVG", args=(c,))
    if aggregation == "median":
        return sa.FnCall(name="MEDIAN", args=(c,))
    if aggregation == "sum":
        return sa.FnCall(name="SUM", args=(c,))
    if aggregation == "min":
        return sa.FnCall(name="MIN", args=(c,))
    if aggregation == "max":
        return sa.FnCall(name="MAX", args=(c,))
    if aggregation == "percentile":
        if percentile is None:
            raise ValueError("percentile aggregation requires a percentile value")
        frac = percentile / 100.0
        return sa.FnCall(
            name="PERCENTILE_CONT",
            args=(sa.Literal(value=frac, data_type="float"),),
            within_group=((c, True),),
        )
    raise ValueError(f"unsupported aggregation: {aggregation!r}")


# ----------------------------------------------------- compile_reference_line

def compile_reference_line(
    *,
    spec: at.ReferenceLineSpec,
    base_plan: lg.LogicalOp,
    measure_alias: str,
    pane_dims: Sequence[str] = (),
    scope_override: Optional[str] = None,
) -> sa.SQLQueryFunction:
    """Compile a ReferenceLineSpec into a single SQLQueryFunction.

    Scope ``entire`` emits a full-aggregate; ``pane`` groups by
    ``pane_dims``; ``cell`` emits a window aggregate partitioned by
    ``pane_dims``. Constant aggregation wraps the base plan as a
    SubqueryRef and emits a literal cast — the endpoint short-circuits
    execution (CORRECTIONS C7) so the SQL is never run, but remains
    valid for SQLValidator round-trip.
    """
    spec.validate()
    scope = scope_override or spec.scope
    if scope not in _VALID_SCOPES:
        raise ValueError(f"unknown scope: {scope!r}")

    # Constant — literal value travels back via endpoint short-circuit.
    # SQLQueryFunction.from_ is not Optional, so we still wrap the base
    # plan as a SubqueryRef (any FROM source) and emit LIMIT 1.
    if spec.aggregation == "constant":
        return sa.SQLQueryFunction(
            projections=(sa.Projection(
                alias=_REFERENCE_VALUE_COL,
                expression=sa.Cast(
                    expr=sa.Literal(value=spec.value, data_type="float"),
                    target_type="DOUBLE",
                ),
            ),),
            from_=_base_subquery_ref(base_plan, alias="_t0"),
            limit=1,
        )

    derived = _base_subquery_ref(base_plan, alias="_t0")
    agg = _agg_expr(spec.aggregation, measure_alias, spec.percentile)

    if scope == "entire":
        return sa.SQLQueryFunction(
            projections=(sa.Projection(alias=_REFERENCE_VALUE_COL, expression=agg),),
            from_=derived,
        )

    if scope == "pane":
        projs: list[sa.Projection] = [
            sa.Projection(alias=d, expression=_col(d)) for d in pane_dims
        ]
        projs.append(sa.Projection(alias=_REFERENCE_VALUE_COL, expression=agg))
        group_by: tuple[sa.SQLQueryExpression, ...] = tuple(_col(d) for d in pane_dims)
        return sa.SQLQueryFunction(
            projections=tuple(projs), from_=derived, group_by=group_by,
        )

    # scope == "cell"
    partition: tuple[sa.SQLQueryExpression, ...] = tuple(_col(d) for d in pane_dims)
    window = sa.Window(expr=agg, partition_by=partition, order_by=(), frame=None)
    projs_cell: list[sa.Projection] = [
        sa.Projection(alias=d, expression=_col(d)) for d in pane_dims
    ]
    projs_cell.append(sa.Projection(alias=_REFERENCE_VALUE_COL, expression=window))
    return sa.SQLQueryFunction(projections=tuple(projs_cell), from_=derived)


# ------------------------------------------------------ compile_reference_band

def compile_reference_band(
    *,
    spec: at.ReferenceBandSpec,
    base_plan: lg.LogicalOp,
    measure_alias: str,
    pane_dims: Sequence[str] = (),
) -> list[sa.SQLQueryFunction]:
    """Band = two reference lines (from + to). Metadata (fill, opacity)
    travels back via the endpoint envelope, not inside the SQL."""
    spec.validate()
    return [
        compile_reference_line(
            spec=spec.from_spec, base_plan=base_plan,
            measure_alias=measure_alias, pane_dims=pane_dims,
        ),
        compile_reference_line(
            spec=spec.to_spec, base_plan=base_plan,
            measure_alias=measure_alias, pane_dims=pane_dims,
        ),
    ]


# ---------------------------------------------- compile_reference_distribution

def _stddev_plans(
    base_plan: lg.LogicalOp,
    measure_alias: str,
    pane_dims: Sequence[str],
    scope: str,
) -> list[sa.SQLQueryFunction]:
    """mean−σ, mean+σ, mean as three separate SQLQueryFunctions. Scope
    ``entire`` only — pane/cell not supported in Plan 9a."""
    if scope != "entire":
        raise ValueError(
            "stddev distribution supported only for scope='entire' in Plan 9a",
        )
    derived = _base_subquery_ref(base_plan, alias="_t0")
    col = _col(measure_alias)
    avg = sa.FnCall(name="AVG", args=(col,))
    sd = sa.FnCall(name="STDDEV", args=(col,))

    def _q(expr: sa.SQLQueryExpression) -> sa.SQLQueryFunction:
        return sa.SQLQueryFunction(
            projections=(sa.Projection(alias=_REFERENCE_VALUE_COL, expression=expr),),
            from_=derived,
        )

    return [
        _q(sa.BinaryOp(op="-", left=avg, right=sd)),
        _q(sa.BinaryOp(op="+", left=avg, right=sd)),
        _q(avg),
    ]


def compile_reference_distribution(
    *,
    spec: at.ReferenceDistributionSpec,
    base_plan: lg.LogicalOp,
    measure_alias: str,
    pane_dims: Sequence[str] = (),
) -> list[sa.SQLQueryFunction]:
    """Distribution = N queries. quantile/confidence emit one reference
    line per percentile; stddev emits mean−σ, mean+σ, mean."""
    spec.validate()
    if spec.style == "stddev":
        return _stddev_plans(base_plan, measure_alias, pane_dims, spec.scope)

    out: list[sa.SQLQueryFunction] = []
    for p in spec.percentiles:
        line = at.ReferenceLineSpec(
            axis=spec.axis, aggregation="percentile", value=None,
            percentile=p, scope=spec.scope, label="value", custom_label="",
            line_style="solid", color=spec.color, show_marker=False,
        )
        out.append(compile_reference_line(
            spec=line, base_plan=base_plan,
            measure_alias=measure_alias, pane_dims=pane_dims,
        ))
    return out


# ---------------------------------------------------------- compile_totals

def _strip_filters_for_totals(plan: lg.LogicalOp) -> lg.LogicalOp:
    """Remove Select/Filter nodes whose filter_stage is in
    {dimension, measure, table_calc}. Keep context/extract/datasource/…
    — they always affect totals."""
    if isinstance(plan, lg.LogicalOpAggregate):
        return lg.LogicalOpAggregate(
            input=_strip_filters_for_totals(plan.input),
            group_bys=plan.group_bys,
            aggregations=plan.aggregations,
        )
    if isinstance(plan, (lg.LogicalOpSelect, lg.LogicalOpFilter)):
        stage = plan.filter_stage or ""
        if stage in _STRIPPED_FILTER_STAGES:
            return _strip_filters_for_totals(plan.input)
        cls = type(plan)
        return cls(
            input=_strip_filters_for_totals(plan.input),
            predicate=plan.predicate,
            filter_stage=stage,
        )
    # Terminal nodes (e.g. LogicalOpRelation) — nothing to strip below.
    return plan


def _find_base_aggregate(plan: lg.LogicalOp) -> Optional[lg.LogicalOpAggregate]:
    cur: object = plan
    while cur is not None and not isinstance(cur, lg.LogicalOpAggregate):
        cur = getattr(cur, "input", None)
    return cur if isinstance(cur, lg.LogicalOpAggregate) else None


def _aggregate_without_dims(
    plan: lg.LogicalOp, measure_alias: str, aggregation: str,
    kept_dims: Sequence[str],
) -> lg.LogicalOp:
    """Rewrite ``plan``'s LogicalOpAggregate to group only on ``kept_dims``
    and to produce a single aggregation aliased as ``__total_value__``
    (grand) or ``__subtotal_value__`` (subtotal)."""
    agg = _find_base_aggregate(plan)
    if agg is None:
        raise ValueError("base_plan has no LogicalOpAggregate to rewrite")

    existing = next((a for a in agg.aggregations if a.name == measure_alias), None)
    if existing is None:
        raise ValueError(
            f"measure alias {measure_alias!r} not found in base_plan aggregations",
        )

    kept = tuple(f for f in agg.group_bys if f.id in set(kept_dims))
    new_name = _TOTAL_COL if not kept_dims else _SUBTOTAL_COL
    new_agg = lg.AggExp(name=new_name, agg=aggregation, expr=existing.expr)
    return lg.LogicalOpAggregate(
        input=agg.input, group_bys=kept, aggregations=(new_agg,),
    )


def compile_totals(
    *,
    spec: at.TotalsSpec,
    base_plan: lg.LogicalOp,
    measure_alias: str,
    pane_dims: Sequence[str],
    row_dims: Sequence[str] = (),
    column_dims: Sequence[str] = (),
) -> list[sa.SQLQueryFunction]:
    """Compile a TotalsSpec into one or more SQLQueryFunctions per
    Build_Tableau §IV.7 step 9.

    - grand_total: 1 query grouping by no dimensions.
    - subtotal:    1 query per dimension on the configured axis.
    - both:        grand_total + per-dim subtotals across row+column.
    """
    spec.validate()
    plan = base_plan
    if not spec.should_affect_totals:
        plan = _strip_filters_for_totals(plan)

    out: list[sa.SQLQueryFunction] = []

    if spec.kind in {"grand_total", "both"}:
        grand_plan = _aggregate_without_dims(
            plan, measure_alias, spec.aggregation, kept_dims=(),
        )
        out.append(compile_logical_to_sql(grand_plan))

    if spec.kind in {"subtotal", "both"}:
        if spec.axis == "row":
            target_dims: tuple[str, ...] = tuple(row_dims)
        elif spec.axis == "column":
            target_dims = tuple(column_dims)
        else:  # "both"
            target_dims = tuple(row_dims) + tuple(column_dims)
        for d in target_dims:
            sub_plan = _aggregate_without_dims(
                plan, measure_alias, spec.aggregation, kept_dims=(d,),
            )
            out.append(compile_logical_to_sql(sub_plan))

    return out


__all__ = [
    "compile_reference_line",
    "compile_reference_band",
    "compile_reference_distribution",
    "compile_totals",
]
