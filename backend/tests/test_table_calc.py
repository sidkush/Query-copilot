"""Plan 8c — table_calc compiler tests.

Build_Tableau.md §V.1 (function list) + §V.3 (addressing/partitioning).
"""
from __future__ import annotations

import pytest

from vizql.table_calc import (
    TableCalcSpec, ClientSideCalc, ServerSideCalc,
    TableCalcCtx, TableCalcCompileError, compile_table_calc,
)


def test_spec_defaults_match_v3_pane_unordered():
    """Default addressing per §V.3 = IDS_TABLECALC_ORD_PANEUNORDERED."""
    spec = TableCalcSpec(calc_id="c1", function="RUNNING_SUM",
                         arg_field="Sales")
    assert spec.addressing == ()
    assert spec.partitioning == ()
    assert spec.direction == "table"
    assert spec.sort is None
    assert spec.offset is None


def test_dispatch_unknown_function_raises():
    spec = TableCalcSpec(calc_id="c1", function="NOT_A_FN", arg_field="x")
    ctx = TableCalcCtx(viz_granularity=frozenset({"Year"}),
                       table_alias="t")
    with pytest.raises(TableCalcCompileError, match="unknown table-calc"):
        compile_table_calc(spec, ctx)


from vizql import sql_ast as sa
from vizql.table_calc import LogicalOpOver


def _ctx() -> TableCalcCtx:
    return TableCalcCtx(viz_granularity=frozenset({"Year", "Region"}),
                        table_alias="t")


@pytest.mark.parametrize("fn,sql_agg", [
    ("WINDOW_SUM", "SUM"), ("WINDOW_AVG", "AVG"),
    ("WINDOW_MIN", "MIN"), ("WINDOW_MAX", "MAX"),
    ("WINDOW_MEDIAN", "MEDIAN"), ("WINDOW_STDEV", "STDDEV"),
    ("WINDOW_VAR", "VARIANCE"),
])
def test_window_family_emits_logical_over(fn, sql_agg):
    spec = TableCalcSpec(calc_id="c1", function=fn, arg_field="Sales",
                         addressing=("Year",), partitioning=("Region",),
                         sort="asc")
    out = compile_table_calc(spec, _ctx())
    assert isinstance(out, ServerSideCalc)
    assert isinstance(out.plan, LogicalOpOver)
    assert out.plan.partition_bys == ("Region",)
    # order_by stored as ((field, asc_bool), …)
    assert out.plan.order_by == (("Year", True),)
    # the aggregate function name lives in the named expression body
    assert sql_agg in str(out.plan.expressions)


def test_window_percentile_uses_pct_arg():
    spec = TableCalcSpec(calc_id="c2", function="WINDOW_PERCENTILE",
                         arg_field="Sales", addressing=("Month",),
                         offset=95)  # repurpose .offset for pct
    out = compile_table_calc(spec, _ctx())
    assert isinstance(out, ServerSideCalc)
    assert "PERCENTILE_CONT" in str(out.plan.expressions)
    assert "95" in str(out.plan.expressions)


@pytest.mark.parametrize("fn,sql_agg", [
    ("RUNNING_SUM", "SUM"), ("RUNNING_AVG", "AVG"),
    ("RUNNING_MIN", "MIN"), ("RUNNING_MAX", "MAX"),
    ("RUNNING_COUNT", "COUNT"),
])
def test_running_family_uses_unbounded_preceding_frame(fn, sql_agg):
    spec = TableCalcSpec(calc_id="c1", function=fn, arg_field="Sales",
                         addressing=("Year",), partitioning=())
    out = compile_table_calc(spec, _ctx())
    assert isinstance(out, ServerSideCalc)
    assert out.plan.frame is not None
    assert out.plan.frame.kind == "ROWS"
    assert out.plan.frame.start == ("UNBOUNDED", 0)
    assert out.plan.frame.end == ("CURRENT_ROW", 0)
    assert sql_agg in str(out.plan.expressions)
