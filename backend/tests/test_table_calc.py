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
