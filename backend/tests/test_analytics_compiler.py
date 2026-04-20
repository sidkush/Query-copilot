"""Plan 9a T2+T3+T4 — analytics compiler structural tests.

Per CORRECTIONS doc C1/C2/C7: structural assertions only (no golden SQL
fixtures), real sql_ast API (no WithinGroup/FromSubquery classes),
constant reference lines emit SELECT CAST(value AS DOUBLE) FROM (base) _t0 LIMIT 1.
"""
from __future__ import annotations

import pytest

from sql_validator import SQLValidator
from vizql import analytics_compiler as ac
from vizql import analytics_types as at
from vizql import logical as lg


# --------------------------------------------------------------------- fixtures

def _field(fid: str, role: str = "dimension", dtype: str = "string") -> lg.Field:
    return lg.Field(
        id=fid, data_type=dtype, role=role, aggregation="none",
        semantic_role="", is_disagg=False,
    )


def _base_plan_bar_by_region() -> lg.LogicalOp:
    """SELECT region, SUM(sales) FROM orders GROUP BY region."""
    rel = lg.LogicalOpRelation(table="orders")
    region = _field("region", "dimension")
    return lg.LogicalOpAggregate(
        input=rel,
        group_bys=(region,),
        aggregations=(lg.AggExp(
            name="sum_sales", agg="sum",
            expr=lg.Column(field_id="sales"),
        ),),
    )


def _base_plan_bar_region_x_category() -> lg.LogicalOp:
    rel = lg.LogicalOpRelation(table="orders")
    return lg.LogicalOpAggregate(
        input=rel,
        group_bys=(_field("region"), _field("category")),
        aggregations=(lg.AggExp(
            name="sum_sales", agg="sum",
            expr=lg.Column(field_id="sales"),
        ),),
    )


# --------------------------------------------------------------------- T2 tests

def test_refline_mean_entire_scope_full_aggregate():
    spec = at.ReferenceLineSpec(
        axis="y", aggregation="mean", value=None, percentile=None,
        scope="entire", label="computation", custom_label="",
        line_style="solid", color="#4C78A8", show_marker=True,
    )
    fn = ac.compile_reference_line(
        spec=spec, base_plan=_base_plan_bar_by_region(),
        measure_alias="sum_sales",
    )
    sql = fn.to_sql_generic()
    up = sql.upper()
    assert "AVG(" in up
    assert "__reference_value__" in sql
    # SubqueryRef of the base plan must appear.
    assert "FROM (SELECT" in up
    assert "SUM(SALES)" in up


def test_refline_mean_pane_scope_groups_by_pane_dims():
    spec = at.ReferenceLineSpec(
        axis="y", aggregation="mean", value=None, percentile=None,
        scope="pane", label="computation", custom_label="",
        line_style="solid", color="#4C78A8", show_marker=False,
    )
    fn = ac.compile_reference_line(
        spec=spec, base_plan=_base_plan_bar_by_region(),
        measure_alias="sum_sales", pane_dims=("region",),
    )
    sql = fn.to_sql_generic()
    up = sql.upper()
    assert "AVG(SUM_SALES)" in up
    assert "GROUP BY REGION" in up
    assert "__reference_value__" in sql


def test_refline_percentile_uses_within_group_order_by():
    spec = at.ReferenceLineSpec(
        axis="y", aggregation="percentile", value=None, percentile=95,
        scope="entire", label="value", custom_label="",
        line_style="dashed", color="#d62728", show_marker=True,
    )
    fn = ac.compile_reference_line(
        spec=spec, base_plan=_base_plan_bar_by_region(),
        measure_alias="sum_sales",
    )
    sql = fn.to_sql_generic()
    up = sql.upper()
    assert "PERCENTILE_CONT" in up
    assert "WITHIN GROUP" in up
    assert "0.95" in sql
    assert "__reference_value__" in sql


def test_refline_constant_emits_cast_literal():
    spec = at.ReferenceLineSpec(
        axis="y", aggregation="constant", value=100.0, percentile=None,
        scope="entire", label="custom", custom_label="Goal",
        line_style="dotted", color="#2ca02c", show_marker=False,
    )
    fn = ac.compile_reference_line(
        spec=spec, base_plan=_base_plan_bar_by_region(),
        measure_alias="sum_sales",
    )
    sql = fn.to_sql_generic()
    up = sql.upper()
    assert "CAST(" in up
    assert "100" in sql
    assert "__reference_value__" in sql
    assert "LIMIT 1" in up


def test_refline_cell_scope_emits_window():
    spec = at.ReferenceLineSpec(
        axis="y", aggregation="mean", value=None, percentile=None,
        scope="cell", label="value", custom_label="",
        line_style="solid", color="#888", show_marker=False,
    )
    fn = ac.compile_reference_line(
        spec=spec, base_plan=_base_plan_bar_by_region(),
        measure_alias="sum_sales", pane_dims=("region",),
    )
    sql = fn.to_sql_generic()
    up = sql.upper()
    assert "OVER (PARTITION BY" in up
    assert "__reference_value__" in sql


def test_refline_rejects_unknown_scope():
    spec = at.ReferenceLineSpec(
        axis="y", aggregation="mean", value=None, percentile=None,
        scope="entire", label="value", custom_label="",
        line_style="solid", color="#888", show_marker=False,
    )
    with pytest.raises(ValueError, match="scope"):
        ac.compile_reference_line(
            spec=spec, base_plan=_base_plan_bar_by_region(),
            measure_alias="sum_sales", scope_override="galaxy",
        )


# --------------------------------------------------------------------- T3 tests

def test_reference_band_iqr_entire_emits_two_queries():
    p25 = at.ReferenceLineSpec(
        axis="y", aggregation="percentile", value=None, percentile=25,
        scope="entire", label="value", custom_label="",
        line_style="solid", color="#888", show_marker=False,
    )
    p75 = at.ReferenceLineSpec(
        axis="y", aggregation="percentile", value=None, percentile=75,
        scope="entire", label="value", custom_label="",
        line_style="solid", color="#888", show_marker=False,
    )
    band = at.ReferenceBandSpec(
        axis="y", from_spec=p25, to_spec=p75,
        fill="#cccccc", fill_opacity=0.25,
    )
    fns = ac.compile_reference_band(
        spec=band, base_plan=_base_plan_bar_by_region(),
        measure_alias="sum_sales",
    )
    assert len(fns) == 2
    for fn in fns:
        assert "PERCENTILE_CONT" in fn.to_sql_generic().upper()
    assert "0.25" in fns[0].to_sql_generic()
    assert "0.75" in fns[1].to_sql_generic()


def test_reference_distribution_quantile_emits_one_per_percentile():
    dist = at.ReferenceDistributionSpec(
        axis="y", percentiles=[10, 50, 90],
        scope="entire", style="quantile", color="#888888",
    )
    fns = ac.compile_reference_distribution(
        spec=dist, base_plan=_base_plan_bar_by_region(),
        measure_alias="sum_sales",
    )
    assert len(fns) == 3
    fracs = ["0.1", "0.5", "0.9"]
    for fn, frac in zip(fns, fracs):
        sql = fn.to_sql_generic()
        assert "PERCENTILE_CONT" in sql.upper()
        assert frac in sql


def test_reference_distribution_stddev_emits_three():
    dist = at.ReferenceDistributionSpec(
        axis="y", percentiles=[1],  # ignored for stddev
        scope="entire", style="stddev", color="#888888",
    )
    fns = ac.compile_reference_distribution(
        spec=dist, base_plan=_base_plan_bar_by_region(),
        measure_alias="sum_sales",
    )
    assert len(fns) == 3
    joined = " | ".join(f.to_sql_generic() for f in fns).upper()
    assert "STDDEV" in joined
    assert "AVG(SUM_SALES)" in joined


def test_reference_distribution_stddev_pane_scope_raises():
    dist = at.ReferenceDistributionSpec(
        axis="y", percentiles=[1],
        scope="pane", style="stddev", color="#888888",
    )
    with pytest.raises(ValueError):
        ac.compile_reference_distribution(
            spec=dist, base_plan=_base_plan_bar_by_region(),
            measure_alias="sum_sales", pane_dims=("region",),
        )


# --------------------------------------------------------------------- T4 tests

def test_totals_grand_total_removes_all_dims():
    totals = at.TotalsSpec(
        kind="grand_total", axis="both", aggregation="sum",
        position="after", should_affect_totals=True,
    )
    fns = ac.compile_totals(
        spec=totals, base_plan=_base_plan_bar_region_x_category(),
        measure_alias="sum_sales", pane_dims=("region", "category"),
    )
    assert len(fns) == 1
    sql = fns[0].to_sql_generic()
    up = sql.upper()
    assert "__total_value__" in sql
    assert "GROUP BY" not in up
    assert "SUM(SALES)" in up


def test_totals_subtotal_row_dim():
    totals = at.TotalsSpec(
        kind="subtotal", axis="row", aggregation="sum",
        position="after", should_affect_totals=True,
    )
    fns = ac.compile_totals(
        spec=totals, base_plan=_base_plan_bar_region_x_category(),
        measure_alias="sum_sales",
        pane_dims=("region", "category"),
        row_dims=("region",), column_dims=("category",),
    )
    assert len(fns) == 1
    sql = fns[0].to_sql_generic()
    up = sql.upper()
    assert "__subtotal_value__" in sql
    assert "GROUP BY REGION" in up


def test_totals_both_emits_grand_plus_per_dim():
    totals = at.TotalsSpec(
        kind="both", axis="both", aggregation="sum",
        position="after", should_affect_totals=True,
    )
    fns = ac.compile_totals(
        spec=totals, base_plan=_base_plan_bar_region_x_category(),
        measure_alias="sum_sales",
        pane_dims=("region", "category"),
        row_dims=("region",), column_dims=("category",),
    )
    # 1 grand + 2 subtotals (one per dim).
    assert len(fns) == 3
    first_sql = fns[0].to_sql_generic()
    assert "__total_value__" in first_sql
    for sub in fns[1:]:
        assert "__subtotal_value__" in sub.to_sql_generic()


def test_totals_respects_should_affect_totals_false():
    """With should_affect_totals=False and a dimension-stage filter on the
    base plan, the emitted totals SQL must NOT contain WHERE."""
    rel = lg.LogicalOpRelation(table="orders")
    filtered = lg.LogicalOpSelect(
        input=rel,
        predicate=lg.BinaryOp(
            op="=",
            left=lg.Column(field_id="region"),
            right=lg.Literal(value="West", data_type="string"),
        ),
        filter_stage="dimension",
    )
    agg = lg.LogicalOpAggregate(
        input=filtered,
        group_bys=(_field("region"), _field("category")),
        aggregations=(lg.AggExp(
            name="sum_sales", agg="sum",
            expr=lg.Column(field_id="sales"),
        ),),
    )
    totals = at.TotalsSpec(
        kind="grand_total", axis="both", aggregation="sum",
        position="after", should_affect_totals=False,
    )
    fns = ac.compile_totals(
        spec=totals, base_plan=agg,
        measure_alias="sum_sales", pane_dims=("region", "category"),
    )
    assert len(fns) == 1
    sql = fns[0].to_sql_generic()
    assert "WHERE" not in sql.upper(), f"dimension filter leaked: {sql}"


# --------------------------------------------------------------- validator gate

def test_every_emitted_sql_passes_sql_validator():
    """Acceptance gate: every SQLQueryFunction produced by the compiler
    must round-trip through SQLValidator.validate()."""
    base_single = _base_plan_bar_by_region()
    base_two = _base_plan_bar_region_x_category()

    fns = []

    # reference lines — one per aggregation variant we care about
    for agg_kind, percentile, scope, pane_dims in [
        ("mean", None, "entire", ()),
        ("mean", None, "pane", ("region",)),
        ("mean", None, "cell", ("region",)),
        ("median", None, "entire", ()),
        ("sum", None, "entire", ()),
        ("min", None, "entire", ()),
        ("max", None, "entire", ()),
        ("percentile", 95, "entire", ()),
    ]:
        spec = at.ReferenceLineSpec(
            axis="y", aggregation=agg_kind, value=None, percentile=percentile,
            scope=scope, label="value", custom_label="",
            line_style="solid", color="#888", show_marker=False,
        )
        fns.append(ac.compile_reference_line(
            spec=spec, base_plan=base_single,
            measure_alias="sum_sales", pane_dims=pane_dims,
        ))

    # constant
    const_spec = at.ReferenceLineSpec(
        axis="y", aggregation="constant", value=100.0, percentile=None,
        scope="entire", label="custom", custom_label="Goal",
        line_style="dotted", color="#2ca02c", show_marker=False,
    )
    fns.append(ac.compile_reference_line(
        spec=const_spec, base_plan=base_single, measure_alias="sum_sales",
    ))

    # band
    p25 = at.ReferenceLineSpec(
        axis="y", aggregation="percentile", value=None, percentile=25,
        scope="entire", label="value", custom_label="",
        line_style="solid", color="#888", show_marker=False,
    )
    p75 = at.ReferenceLineSpec(
        axis="y", aggregation="percentile", value=None, percentile=75,
        scope="entire", label="value", custom_label="",
        line_style="solid", color="#888", show_marker=False,
    )
    band = at.ReferenceBandSpec(
        axis="y", from_spec=p25, to_spec=p75,
        fill="#cccccc", fill_opacity=0.25,
    )
    fns.extend(ac.compile_reference_band(
        spec=band, base_plan=base_single, measure_alias="sum_sales",
    ))

    # distribution (quantile + stddev)
    dist_q = at.ReferenceDistributionSpec(
        axis="y", percentiles=[10, 50, 90], scope="entire",
        style="quantile", color="#888888",
    )
    fns.extend(ac.compile_reference_distribution(
        spec=dist_q, base_plan=base_single, measure_alias="sum_sales",
    ))
    dist_s = at.ReferenceDistributionSpec(
        axis="y", percentiles=[1], scope="entire",
        style="stddev", color="#888888",
    )
    fns.extend(ac.compile_reference_distribution(
        spec=dist_s, base_plan=base_single, measure_alias="sum_sales",
    ))

    # totals (grand, subtotal row, both)
    totals_grand = at.TotalsSpec(
        kind="grand_total", axis="both", aggregation="sum",
        position="after", should_affect_totals=True,
    )
    fns.extend(ac.compile_totals(
        spec=totals_grand, base_plan=base_two,
        measure_alias="sum_sales", pane_dims=("region", "category"),
    ))
    totals_sub = at.TotalsSpec(
        kind="subtotal", axis="row", aggregation="sum",
        position="after", should_affect_totals=True,
    )
    fns.extend(ac.compile_totals(
        spec=totals_sub, base_plan=base_two,
        measure_alias="sum_sales", pane_dims=("region", "category"),
        row_dims=("region",), column_dims=("category",),
    ))
    totals_both = at.TotalsSpec(
        kind="both", axis="both", aggregation="sum",
        position="after", should_affect_totals=True,
    )
    fns.extend(ac.compile_totals(
        spec=totals_both, base_plan=base_two,
        measure_alias="sum_sales", pane_dims=("region", "category"),
        row_dims=("region",), column_dims=("category",),
    ))

    v = SQLValidator()
    failures = []
    for fn in fns:
        sql = fn.to_sql_generic()
        ok, _, err = v.validate(sql)
        if not ok:
            failures.append((err, sql))
    assert not failures, f"SQLValidator rejected {len(failures)} queries: {failures[:3]}"
