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
