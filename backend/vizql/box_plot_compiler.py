"""Plan 9e — compile a BoxPlotSpec into a list of SQLQueryFunctions.

Composition rule (Build_Tableau §XIII.1):
  Every box plot is a ReferenceDistributionSpec preset producing five
  aggregated rows — q1 / median / q3 + whisker_low / whisker_high — plus an
  optional detail-level outlier query when show_outliers is True.

Whisker methods:
  - tukey      — q1/q3 emitted as percentiles; MIN + MAX emitted alongside
                 so the endpoint can clamp [q1-1.5*iqr, q3+1.5*iqr] to the
                 actual data without a second round trip.
  - min-max    — whisker_low = MIN, whisker_high = MAX.
  - percentile — whisker_low / whisker_high = PERCENTILE_CONT(lo/100),
                 PERCENTILE_CONT(hi/100).

Outlier query (when enabled) joins the base subquery to a 1-row bounds
subquery carrying inline PERCENTILE_CONT expressions for the thresholds.
``sql_ast`` has no dedicated CROSS-JOIN node, so we emit INNER JOIN ON
(1=1) — semantically a cross-product, dialect-portable, and accepted by
SQLValidator round-trip.
"""
from __future__ import annotations

from typing import Sequence

from . import analytics_compiler as ac
from . import analytics_types as at
from . import logical as lg
from . import sql_ast as sa
from .box_plot import BoxPlotSpec
from .logical_to_sql import compile_logical_to_sql


def _percentile_line(axis: str, p: int, scope: str) -> at.ReferenceLineSpec:
    return at.ReferenceLineSpec(
        axis=axis, aggregation="percentile", value=None,
        percentile=p, scope=scope, label="value", custom_label="",
        line_style="solid", color="#000000", show_marker=False,
    )


def _agg_line(axis: str, agg: str, scope: str) -> at.ReferenceLineSpec:
    return at.ReferenceLineSpec(
        axis=axis, aggregation=agg, value=None,
        percentile=None, scope=scope, label="value", custom_label="",
        line_style="solid", color="#000000", show_marker=False,
    )


def _outlier_query(
    base_plan: lg.LogicalOp,
    measure_alias: str,
    spec: BoxPlotSpec,
) -> sa.SQLQueryFunction:
    """Detail-level outlier query. Uses inline PERCENTILE_CONT sub-exprs
    for the low/high bounds + a joined 1-row bounds subquery so the
    predicate references lo/hi as plain columns. Dialect-portable.

    ``sql_ast.JoinNode`` with ``kind='CROSS'`` renders as CROSS JOIN ... ON
    (expr), which DuckDB rejects (CROSS JOIN forbids ON). Fall back to
    INNER JOIN ON (1=1), which is semantically a cross-product and
    accepted by every dialect SQLValidator exercises.
    """
    inner_col = sa.Column(name=measure_alias, table_alias="")

    def _pct(frac: float) -> sa.SQLQueryExpression:
        return sa.FnCall(
            name="PERCENTILE_CONT",
            args=(sa.Literal(value=frac, data_type="float"),),
            within_group=((inner_col, True),),
        )

    if spec.whisker_method == "percentile":
        assert spec.whisker_percentile is not None  # validate() enforces
        lo_expr = _pct(spec.whisker_percentile[0] / 100.0)
        hi_expr = _pct(spec.whisker_percentile[1] / 100.0)
    else:  # tukey
        q1 = _pct(0.25)
        q3 = _pct(0.75)
        iqr = sa.BinaryOp(op="-", left=q3, right=q1)
        coef = sa.Literal(value=1.5, data_type="float")
        adj = sa.BinaryOp(op="*", left=coef, right=iqr)
        lo_expr = sa.BinaryOp(op="-", left=q1, right=adj)
        hi_expr = sa.BinaryOp(op="+", left=q3, right=adj)

    bounds_cte_derived = sa.SubqueryRef(
        query=compile_logical_to_sql(base_plan), alias="_t0",
    )
    bounds_cte = sa.SQLQueryFunction(
        projections=(
            sa.Projection(alias="__lo__", expression=lo_expr),
            sa.Projection(alias="__hi__", expression=hi_expr),
        ),
        from_=bounds_cte_derived,
        limit=1,
    )
    bounds_ref = sa.SubqueryRef(query=bounds_cte, alias="_b")
    detail_base = sa.SubqueryRef(
        query=compile_logical_to_sql(base_plan), alias="_d",
    )

    always_true = sa.BinaryOp(
        op="=",
        left=sa.Literal(value=1, data_type="int"),
        right=sa.Literal(value=1, data_type="int"),
    )
    join = sa.JoinNode(
        kind="INNER", left=detail_base, right=bounds_ref, on=always_true,
    )

    predicate = sa.BinaryOp(
        op="OR",
        left=sa.BinaryOp(
            op="<", left=sa.Column(name=measure_alias, table_alias="_d"),
            right=sa.Column(name="__lo__", table_alias="_b"),
        ),
        right=sa.BinaryOp(
            op=">", left=sa.Column(name=measure_alias, table_alias="_d"),
            right=sa.Column(name="__hi__", table_alias="_b"),
        ),
    )
    return sa.SQLQueryFunction(
        projections=(
            sa.Projection(
                alias=measure_alias,
                expression=sa.Column(name=measure_alias, table_alias="_d"),
            ),
        ),
        from_=join,
        where=predicate,
    )


def compile_box_plot(
    *,
    spec: BoxPlotSpec,
    base_plan: lg.LogicalOp,
    measure_alias: str,
    pane_dims: Sequence[str] = (),
) -> list[sa.SQLQueryFunction]:
    """Compile BoxPlotSpec into [q1, median, q3, whisker_low, whisker_high]
    + optional outliers. Order is load-bearing — the endpoint uses index
    positions to assemble the wire envelope."""
    spec.validate()
    out: list[sa.SQLQueryFunction] = []

    for p in (25, 50, 75):
        out.append(ac.compile_reference_line(
            spec=_percentile_line(spec.axis, p, spec.scope),
            base_plan=base_plan, measure_alias=measure_alias, pane_dims=pane_dims,
        ))

    if spec.whisker_method == "min-max":
        out.append(ac.compile_reference_line(
            spec=_agg_line(spec.axis, "min", spec.scope),
            base_plan=base_plan, measure_alias=measure_alias, pane_dims=pane_dims,
        ))
        out.append(ac.compile_reference_line(
            spec=_agg_line(spec.axis, "max", spec.scope),
            base_plan=base_plan, measure_alias=measure_alias, pane_dims=pane_dims,
        ))
    elif spec.whisker_method == "percentile":
        lo, hi = spec.whisker_percentile  # type: ignore[misc]
        out.append(ac.compile_reference_line(
            spec=_percentile_line(spec.axis, lo, spec.scope),
            base_plan=base_plan, measure_alias=measure_alias, pane_dims=pane_dims,
        ))
        out.append(ac.compile_reference_line(
            spec=_percentile_line(spec.axis, hi, spec.scope),
            base_plan=base_plan, measure_alias=measure_alias, pane_dims=pane_dims,
        ))
    else:  # tukey — emit MIN + MAX so endpoint can clamp
        out.append(ac.compile_reference_line(
            spec=_agg_line(spec.axis, "min", spec.scope),
            base_plan=base_plan, measure_alias=measure_alias, pane_dims=pane_dims,
        ))
        out.append(ac.compile_reference_line(
            spec=_agg_line(spec.axis, "max", spec.scope),
            base_plan=base_plan, measure_alias=measure_alias, pane_dims=pane_dims,
        ))

    if spec.show_outliers:
        out.append(_outlier_query(base_plan, measure_alias, spec))

    return out


__all__ = ["compile_box_plot"]
