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


# ------------------------------------------------------------------
# Task 2 — Lexer
# ------------------------------------------------------------------


def test_lexer_tokenises_literals_and_idents():
    from vizql.calc_parser import CalcLexer, TokenKind

    toks = list(CalcLexer("SUM([Sales]) + 1.5").tokens())
    kinds = [t.kind for t in toks]
    assert kinds == [
        TokenKind.IDENT, TokenKind.LPAREN, TokenKind.LBRACKET,
        TokenKind.IDENT, TokenKind.RBRACKET, TokenKind.RPAREN,
        TokenKind.OP, TokenKind.NUMBER, TokenKind.EOF,
    ]


def test_lexer_handles_string_escapes_and_comments():
    from vizql.calc_parser import CalcLexer, TokenKind

    src = """// header
    "hello \\"world\\"" -- trailing
    'single'"""
    toks = [t for t in CalcLexer(src).tokens() if t.kind != TokenKind.EOF]
    assert toks[0].kind == TokenKind.STRING and toks[0].value == 'hello "world"'
    assert toks[1].kind == TokenKind.STRING and toks[1].value == "single"


def test_lexer_recognises_keywords_case_insensitive():
    from vizql.calc_parser import CalcLexer, TokenKind

    toks = list(CalcLexer("if x THEN 1 elseif y then 2 else 3 end").tokens())
    keyword_values = [t.value for t in toks if t.kind == TokenKind.KEYWORD]
    assert keyword_values == ["IF", "THEN", "ELSEIF", "THEN", "ELSE", "END"]


def test_lexer_rejects_unterminated_string():
    from vizql.calc_parser import CalcLexer, LexError

    with pytest.raises(LexError):
        list(CalcLexer('"open').tokens())


# ------------------------------------------------------------------
# Task 3 — Parser core (literals, refs, function calls)
# ------------------------------------------------------------------


def test_parse_literal_and_field_ref():
    from vizql.calc_parser import parse
    from vizql import calc_ast as ca

    assert parse("123") == ca.Literal(123, "integer", pos=ca.Position(1, 1))
    assert parse("'hi'").value == "hi"
    assert parse("[Sales]").field_name == "Sales"
    assert parse("[Order Date]").field_name == "Order Date"  # bracketed names with spaces


def test_parse_param_ref_both_grammars():
    from vizql.calc_parser import parse
    from vizql import calc_ast as ca

    angle = parse("<Parameters.Region>")
    assert isinstance(angle, ca.ParamRef) and angle.param_name == "Region"

    bracketed = parse("[Parameters].[Region]")
    assert isinstance(bracketed, ca.ParamRef) and bracketed.param_name == "Region"


def test_parse_function_call_with_multiple_args():
    from vizql.calc_parser import parse
    from vizql import calc_ast as ca

    expr = parse("DATEDIFF('day', [Start], [End])")
    assert isinstance(expr, ca.FnCall) and expr.name == "DATEDIFF"
    assert len(expr.args) == 3
    assert expr.args[0].value == "day"
    assert expr.args[1].field_name == "Start"


def test_parse_error_includes_position():
    from vizql.calc_parser import parse, ParseError

    with pytest.raises(ParseError) as excinfo:
        parse("SUM(")
    assert "line 1" in str(excinfo.value) and "expected" in str(excinfo.value).lower()
