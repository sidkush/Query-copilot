"""Plan 8a T9: calc-language typechecker tests.

NOTE: Tests use `from vizql.calc_typecheck import ...` rather than the
plan's `from backend.vizql.calc_typecheck import ...` because existing
backend tests put `backend/` on sys.path (see e.g. test_calc_parser.py).
Run from `backend/` via `python -m pytest`.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest


def _schema():
    # Map field_name → type kind string. Mirrors the tiny shape typecheck()
    # consumes (a Mapping[str, str]).
    return {
        "Sales": "number",
        "Region": "string",
        "OrderDate": "date",
        "Profit": "number",
    }


def test_sum_numeric_inferred_number():
    from vizql.calc_parser import parse
    from vizql.calc_typecheck import typecheck, TypeKind

    expr = parse("SUM([Sales])")
    assert typecheck(expr, _schema()).kind is TypeKind.NUMBER


def test_sum_on_string_rejected():
    from vizql.calc_parser import parse
    from vizql.calc_typecheck import typecheck, TypeError as CalcTypeError

    expr = parse("SUM([Region])")
    with pytest.raises(CalcTypeError) as excinfo:
        typecheck(expr, _schema())
    assert "SUM" in str(excinfo.value)


def test_unknown_function_rejected():
    from vizql.calc_parser import parse
    from vizql.calc_typecheck import typecheck, TypeError as CalcTypeError

    expr = parse("WAT([Sales])")
    with pytest.raises(CalcTypeError) as excinfo:
        typecheck(expr, _schema())
    assert "unknown function" in str(excinfo.value).lower()


def test_aggregate_mixed_with_non_aggregate_rejected():
    from vizql.calc_parser import parse
    from vizql.calc_typecheck import typecheck, TypeError as CalcTypeError

    # SUM([Sales]) + [Sales] mixes aggregate + row-level.
    expr = parse("SUM([Sales]) + [Sales]")
    with pytest.raises(CalcTypeError) as excinfo:
        typecheck(expr, _schema())
    assert "aggregate" in str(excinfo.value).lower()


def test_lod_wraps_aggregate_so_outer_can_be_row_level():
    from vizql.calc_parser import parse
    from vizql.calc_typecheck import typecheck, TypeKind

    # { FIXED [Region] : SUM([Sales]) } / [Sales]  is allowed: LOD result is
    # a row-level value at outer scope.
    expr = parse("{ FIXED [Region] : SUM([Sales]) } / [Sales]")
    assert typecheck(expr, _schema()).kind is TypeKind.NUMBER


def test_if_branches_must_have_compatible_types():
    from vizql.calc_parser import parse
    from vizql.calc_typecheck import typecheck, TypeError as CalcTypeError

    expr = parse("IF [Sales] > 0 THEN 'pos' ELSE 1 END")
    with pytest.raises(CalcTypeError) as excinfo:
        typecheck(expr, _schema())
    assert "branch" in str(excinfo.value).lower() or "type" in str(excinfo.value).lower()
