"""Unit tests for Plan 10a formatting_types dataclasses and selectors."""
import pytest

from vizql.formatting_types import (
    DEFAULT_LINE_STYLE,
    DEFAULT_STYLED_BOX,
    DataSourceSelector,
    FieldSelector,
    LineStyle,
    MarkSelector,
    RichText,
    RichTextRun,
    StyleProp,
    StyleRule,
    StyledBox,
    WorkbookSelector,
    WorksheetSelector,
    selector_specificity,
)


def test_style_prop_enum_covers_xiv_grammar():
    required = {
        "font-family", "font-size", "font-weight", "font-style",
        "color", "background-color", "text-decoration", "text-align",
        "line-height", "number-format", "date-format",
        "border-top", "border-right", "border-bottom", "border-left",
        "padding", "show-column-banding", "show-row-banding",
        "axis-tick-color", "zero-line-color", "pane-line-thickness",
    }
    actual = {p.value for p in StyleProp}
    assert required.issubset(actual), required - actual


def test_selector_specificity_order():
    mark = MarkSelector(mark_id="m1")
    field = FieldSelector(field_id="f1")
    sheet = WorksheetSelector(sheet_id="s1")
    ds = DataSourceSelector(ds_id="d1")
    wb = WorkbookSelector()
    ranked = sorted(
        [wb, ds, sheet, field, mark],
        key=selector_specificity,
        reverse=True,
    )
    assert ranked == [mark, field, sheet, ds, wb]


def test_style_rule_frozen():
    rule = StyleRule(
        selector=MarkSelector(mark_id="m1"),
        properties={StyleProp.COLOR: "#ff0000"},
    )
    with pytest.raises(Exception):
        rule.properties[StyleProp.COLOR] = "#000000"  # MappingProxyType rejects writes


def test_line_style_default():
    assert DEFAULT_LINE_STYLE == LineStyle(weight=1, color="#000000", dash="solid")


def test_styled_box_default_has_four_borders():
    box = DEFAULT_STYLED_BOX
    assert box.border_top == DEFAULT_LINE_STYLE
    assert box.border_right == DEFAULT_LINE_STYLE
    assert box.border_bottom == DEFAULT_LINE_STYLE
    assert box.border_left == DEFAULT_LINE_STYLE


def test_rich_text_runs_roundtrip():
    rt = RichText(runs=(
        RichTextRun(text="Hello ", style={StyleProp.FONT_WEIGHT: "700"}),
        RichTextRun(text="world", style={StyleProp.COLOR: "#ff0000"}),
    ))
    assert len(rt.runs) == 2
    assert rt.runs[0].style[StyleProp.FONT_WEIGHT] == "700"


def test_selector_equality_by_value():
    a = MarkSelector(mark_id="m1")
    b = MarkSelector(mark_id="m1")
    assert a == b and hash(a) == hash(b)
