"""Plan 8a: calc-language parser tests.

NOTE: Tests use `from vizql.calc_parser import ...` rather than the
plan's `from backend.vizql.calc_parser import ...` because existing
backend tests put `backend/` on sys.path (see e.g.
`test_actions_fire.py`). Run from `backend/` via `python -m pytest`.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest


def test_calc_ast_module_imports():
    from vizql import calc_ast as ca

    # Frozen dataclasses, all expected node types exist.
    assert ca.Literal(value=1, data_type="integer").data_type == "integer"
    assert ca.FieldRef(field_name="Sales").field_name == "Sales"
    assert ca.ParamRef(param_name="Region").param_name == "Region"
    assert ca.FnCall(name="SUM", args=(ca.FieldRef("Sales"),)).name == "SUM"
    assert ca.BinaryOp(op="+", lhs=ca.Literal(1, "integer"), rhs=ca.Literal(2, "integer")).op == "+"
    assert ca.UnaryOp(op="-", operand=ca.Literal(1, "integer")).op == "-"
    assert ca.IfExpr(
        cond=ca.Literal(True, "boolean"),
        then_=ca.Literal(1, "integer"),
        elifs=(),
        else_=None,
    ).cond.value is True
    assert ca.CaseExpr(scrutinee=None, whens=(), else_=None).whens == ()
    assert ca.LodExpr(
        kind="FIXED",
        dims=(ca.FieldRef("Region"),),
        body=ca.FnCall("SUM", (ca.FieldRef("Sales"),)),
    ).kind == "FIXED"
