"""Plan 8a T10: CalcExpr → sql_ast compiler tests.

Imports adjusted per plan-8a-compile deviations:
  - `from vizql...` (not `from backend.vizql...`) since backend/ is on sys.path.
  - `Dialect` imported from `vizql.calc_functions` (catalogue owns it).
Run from `backend/` via `python -m pytest tests/test_calc_compile.py -v`.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest


def _schema():
    return {"Sales": "number", "Region": "string", "OrderDate": "date"}


def test_compile_field_ref_to_column():
    from vizql.calc_parser import parse
    from vizql.calc_to_expression import compile_calc
    from vizql import sql_ast as sa
    from vizql.calc_functions import Dialect

    out = compile_calc(parse("[Sales]"), Dialect.DUCKDB, _schema(), table_alias="t0")
    assert isinstance(out, sa.Column) and out.name == "Sales" and out.table_alias == "t0"


def test_compile_aggregate_emits_fn_call():
    from vizql.calc_parser import parse
    from vizql.calc_to_expression import compile_calc
    from vizql import sql_ast as sa
    from vizql.calc_functions import Dialect

    out = compile_calc(parse("SUM([Sales])"), Dialect.DUCKDB, _schema(), table_alias="t0")
    assert isinstance(out, sa.FnCall) and out.name == "SUM"
    assert isinstance(out.args[0], sa.Column) and out.args[0].name == "Sales"


def test_compile_binary_op():
    from vizql.calc_parser import parse
    from vizql.calc_to_expression import compile_calc
    from vizql import sql_ast as sa
    from vizql.calc_functions import Dialect

    out = compile_calc(parse("[Sales] + 1"), Dialect.DUCKDB, _schema(), table_alias="t0")
    assert isinstance(out, sa.BinaryOp) and out.op == "+"
    assert isinstance(out.left, sa.Column) and isinstance(out.right, sa.Literal)


def test_compile_param_ref_substitutes_via_format_as_literal():
    from vizql.calc_parser import parse
    from vizql.calc_to_expression import compile_calc
    from vizql import sql_ast as sa
    from vizql.calc_functions import Dialect

    out = compile_calc(
        parse("<Parameters.Threshold>"),
        Dialect.DUCKDB, _schema(),
        params={"Threshold": {"type": "number", "value": 100}},
        table_alias="t0",
    )
    # _render_literal renders number via repr(); repr(100) == "100".
    assert isinstance(out, sa.Literal) and out.value == "100"


def test_compile_rawsql_blocked_when_feature_disabled():
    from vizql.calc_parser import parse
    from vizql.calc_to_expression import compile_calc, CompileError
    from vizql.calc_functions import Dialect

    with pytest.raises(CompileError):
        compile_calc(parse("RAWSQL_INT('1')"), Dialect.DUCKDB, _schema(), table_alias="t0")


def test_compile_lod_emits_window_marker():
    from vizql.calc_parser import parse
    from vizql.calc_to_expression import compile_calc
    from vizql import sql_ast as sa
    from vizql.calc_functions import Dialect

    out = compile_calc(
        parse("{ INCLUDE [Region] : SUM([Sales]) }"),
        Dialect.DUCKDB, _schema(), table_alias="t0",
    )
    # LOD lowering for INCLUDE → Window over SUM. Plan 8b finalised FIXED;
    # INCLUDE partition = viz_granularity ∪ include_dims. With no viz passed
    # (default empty frozenset), partition = {Region} only.
    assert isinstance(out, sa.Window)
    names = {p.name for p in out.partition_by if isinstance(p, sa.Column)}
    assert names == {"Region"}


def test_compile_fixed_lod_emits_subquery():
    """Plan 8b T5 — FIXED LOD now compiles (was deferred in Plan 8a)."""
    from vizql import calc_ast as ca
    from vizql import calc_to_expression as c2e
    from vizql import sql_ast as sa
    from vizql.calc_functions import Dialect

    expr = ca.LodExpr(
        kind="FIXED",
        dims=(ca.FieldRef(field_name="Region"),),
        body=ca.FnCall(name="SUM", args=(ca.FieldRef(field_name="Sales"),)),
    )
    out = c2e.compile_calc(
        expr,
        dialect=Dialect.DUCKDB,
        schema={"Sales": "number", "Region": "string"},
    )
    assert isinstance(out, sa.Subquery)


def test_format_as_literal_quotes_string_safely():
    from param_substitution import format_as_literal

    assert format_as_literal("o'brien", "string") == "'o''brien'"
    assert format_as_literal(42, "integer") == "42"
    assert format_as_literal(True, "boolean") == "TRUE"
