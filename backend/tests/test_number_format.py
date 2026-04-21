"""Plan 10b — Excel-style number format grammar tests."""
from decimal import Decimal

import pytest

from vizql.number_format import (
    DecimalSpec,
    ExponentSpec,
    FormatSection,
    IntegerSpec,
    Literal,
    NumberFormatAST,
    NumberFormatError,
    TokenKind,
)


def test_token_kind_covers_required_tokens():
    required = {
        "DIGIT_OPTIONAL", "DIGIT_REQUIRED", "THOUSANDS_SEP",
        "DECIMAL_POINT", "PERCENT", "PER_MILLE", "EXPONENT",
        "LITERAL", "CURRENCY", "BRACKETED_CURRENCY",
        "SECTION_SEP", "QUOTED_LITERAL",
    }
    actual = {t.name for t in TokenKind}
    assert required <= actual, f"Missing tokens: {required - actual}"


def test_integer_spec_defaults():
    spec = IntegerSpec(min_digits=1, thousands_separator=True)
    assert spec.min_digits == 1
    assert spec.thousands_separator is True


def test_format_section_shape():
    section = FormatSection(
        integer_part=IntegerSpec(min_digits=1, thousands_separator=True),
        decimal_part=DecimalSpec(min_digits=2, max_digits=2),
        exponent_part=None,
        prefix=(Literal("$"),),
        suffix=(),
        scale=1.0,
        negative_style="minus",
    )
    assert section.scale == 1.0
    assert section.negative_style == "minus"
    assert section.prefix[0].text == "$"


def test_number_format_ast_sections_immutable():
    ast = NumberFormatAST(sections=(
        FormatSection(
            integer_part=IntegerSpec(min_digits=1, thousands_separator=False),
            decimal_part=None, exponent_part=None,
            prefix=(), suffix=(), scale=1.0, negative_style="minus",
        ),
    ))
    with pytest.raises((AttributeError, TypeError)):
        ast.sections = ()  # type: ignore[misc]


def test_number_format_error_is_exception():
    err = NumberFormatError("bad", column=3)
    assert isinstance(err, Exception)
    assert err.column == 3
    assert "column 3" in str(err)


from vizql.number_format import parse_number_format


class TestParser:
    def test_integer_with_thousands(self):
        ast = parse_number_format("#,##0")
        assert len(ast.sections) == 1
        sec = ast.sections[0]
        assert sec.integer_part.thousands_separator is True
        assert sec.integer_part.min_digits == 1
        assert sec.decimal_part is None
        assert sec.scale == 1.0

    def test_fixed_two_decimals(self):
        ast = parse_number_format("#,##0.00")
        sec = ast.sections[0]
        assert sec.decimal_part == DecimalSpec(min_digits=2, max_digits=2)

    def test_percent_scales_by_100(self):
        ast = parse_number_format("0.0%")
        sec = ast.sections[0]
        assert sec.scale == 100.0
        assert sec.decimal_part == DecimalSpec(min_digits=1, max_digits=1)
        assert sec.suffix[-1].text == "%"

    def test_scientific(self):
        ast = parse_number_format("0.##E+00")
        sec = ast.sections[0]
        assert sec.exponent_part == ExponentSpec(min_digits=2, plus_sign=True)
        assert sec.decimal_part == DecimalSpec(min_digits=0, max_digits=2)

    def test_currency_literal(self):
        ast = parse_number_format("$#,##0")
        sec = ast.sections[0]
        assert sec.prefix[0].text == "$"

    def test_bracketed_currency(self):
        ast = parse_number_format("[USD]#,##0.00")
        sec = ast.sections[0]
        assert sec.prefix[0].text == "USD"

    def test_two_sections_parens_negative(self):
        ast = parse_number_format("$#,##0;($#,##0)")
        assert len(ast.sections) == 2
        neg = ast.sections[1]
        assert neg.negative_style == "parens"
        assert neg.prefix[0].text == "("
        assert neg.suffix[-1].text == ")"

    def test_quoted_literal(self):
        ast = parse_number_format('#,##0 "items"')
        sec = ast.sections[0]
        assert any(lit.text == "items" for lit in sec.suffix)

    def test_four_sections(self):
        ast = parse_number_format('#,##0;-#,##0;"zero";@')
        assert len(ast.sections) == 4

    def test_rejects_five_sections(self):
        with pytest.raises(NumberFormatError) as exc:
            parse_number_format("0;0;0;0;0")
        assert exc.value.column >= 1

    def test_rejects_unmatched_quote(self):
        with pytest.raises(NumberFormatError) as exc:
            parse_number_format('0 "unterminated')
        assert "quote" in str(exc.value).lower()

    def test_rejects_invalid_scientific(self):
        with pytest.raises(NumberFormatError):
            parse_number_format("0E")  # exponent needs digit spec

    def test_empty_pattern_rejected(self):
        with pytest.raises(NumberFormatError):
            parse_number_format("")
