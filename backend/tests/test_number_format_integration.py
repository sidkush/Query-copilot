"""Plan 10b — integration: resolver + formatter end-to-end."""
from vizql.format_resolver import FormatResolver
from vizql.formatting_types import (
    FieldSelector,
    StyleProp,
    StyleRule,
    WorkbookSelector,
)
from vizql.number_format import format_number, parse_number_format


def test_field_number_format_wins_over_workbook():
    rules = (
        StyleRule(
            selector=WorkbookSelector(),
            properties={StyleProp.NUMBER_FORMAT: "#,##0"},
        ),
        StyleRule(
            selector=FieldSelector(field_id="sales"),
            properties={StyleProp.NUMBER_FORMAT: "$#,##0.00;($#,##0.00)"},
        ),
    )
    resolver = FormatResolver(rules)
    pattern = resolver.resolve(
        mark_id=None,
        field_id="sales",
        sheet_id=None,
        ds_id=None,
        prop=StyleProp.NUMBER_FORMAT,
    )
    assert pattern == "$#,##0.00;($#,##0.00)"
    ast = parse_number_format(str(pattern))
    assert format_number(-1234.5, ast) == "($1,234.50)"


def test_workbook_fallback_when_no_field_rule():
    rules = (
        StyleRule(
            selector=WorkbookSelector(),
            properties={StyleProp.NUMBER_FORMAT: "#,##0"},
        ),
    )
    resolver = FormatResolver(rules)
    pattern = resolver.resolve(
        mark_id=None,
        field_id="sales",
        sheet_id=None,
        ds_id=None,
        prop=StyleProp.NUMBER_FORMAT,
    )
    assert pattern == "#,##0"
    # ROUND_HALF_UP (see NUMBER_FORMAT_GRAMMAR.md): 1234.5 → 1,235.
    assert format_number(1234.5, parse_number_format(str(pattern))) == "1,235"


def test_unformatted_field_returns_raw_repr_path():
    resolver = FormatResolver(())
    pattern = resolver.resolve(
        mark_id=None,
        field_id="x",
        sheet_id=None,
        ds_id=None,
        prop=StyleProp.NUMBER_FORMAT,
    )
    assert pattern is None  # no default — consumer chooses fallback string repr
