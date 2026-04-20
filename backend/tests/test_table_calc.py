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


@pytest.mark.parametrize("fn,sql_fn", [
    ("RANK", "RANK"),                  # ties skip
    ("RANK_DENSE", "DENSE_RANK"),       # ties no-skip
    ("RANK_MODIFIED", "RANK"),          # alias of RANK in SQL; UI offset diff
    ("RANK_UNIQUE", "ROW_NUMBER"),      # always unique
    ("RANK_PERCENTILE", "PERCENT_RANK"),
])
def test_rank_family_emits_correct_sql_fn(fn, sql_fn):
    spec = TableCalcSpec(calc_id="c1", function=fn, arg_field="Sales",
                         addressing=("Sales",), sort="desc")
    out = compile_table_calc(spec, _ctx())
    assert isinstance(out, ServerSideCalc)
    assert sql_fn in str(out.plan.expressions)
    # rank uses arg_field as ORDER BY column, descending
    assert out.plan.order_by == (("Sales", False),)


def test_index_emits_row_number():
    spec = TableCalcSpec(calc_id="c1", function="INDEX", arg_field="",
                         addressing=("Year",))
    out = compile_table_calc(spec, _ctx())
    assert isinstance(out, ServerSideCalc)
    assert "ROW_NUMBER" in str(out.plan.expressions)


def test_first_last_size_use_dedicated_sql():
    f = compile_table_calc(TableCalcSpec(calc_id="c", function="FIRST",
                                         arg_field="", addressing=("Year",)),
                           _ctx())
    assert "ROW_NUMBER" in str(f.plan.expressions)
    s = compile_table_calc(TableCalcSpec(calc_id="c", function="SIZE",
                                         arg_field="", addressing=("Year",)),
                           _ctx())
    assert "COUNT" in str(s.plan.expressions)


def test_total_uses_unbounded_to_unbounded_frame():
    spec = TableCalcSpec(calc_id="c1", function="TOTAL", arg_field="Sales",
                         addressing=("Year",))
    out = compile_table_calc(spec, _ctx())
    assert isinstance(out, ServerSideCalc)
    assert out.plan.frame is not None
    assert out.plan.frame.start == ("UNBOUNDED", 0)
    assert out.plan.frame.end == ("UNBOUNDED", 0)
    assert "SUM" in str(out.plan.expressions)


def test_pct_total_divides_by_window_sum():
    spec = TableCalcSpec(calc_id="c1", function="PCT_TOTAL", arg_field="Sales",
                         addressing=("Year",))
    out = compile_table_calc(spec, _ctx())
    body = str(out.plan.expressions)
    assert "/" in body and "SUM" in body


@pytest.mark.parametrize("fn", ["LOOKUP", "PREVIOUS_VALUE", "DIFF",
                                "IS_DISTINCT", "IS_STACKED"])
def test_client_side_routes_return_clientsidecalc(fn):
    spec = TableCalcSpec(calc_id="c1", function=fn, arg_field="Sales",
                         offset=-1)
    out = compile_table_calc(spec, _ctx())
    assert isinstance(out, ClientSideCalc)
    assert out.spec.function == fn
