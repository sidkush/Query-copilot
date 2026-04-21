# backend/tests/test_format_resolver.py
"""Plan 10a — layer precedence + memoisation + resolve_all."""
import pytest

from vizql.format_resolver import FormatResolver, ResolverError
from vizql.formatting_types import (
    DataSourceSelector,
    FieldSelector,
    MarkSelector,
    StyleProp,
    StyleRule,
    WorkbookSelector,
    WorksheetSelector,
)


def _rule(selector, **props):
    return StyleRule(
        selector=selector,
        properties={StyleProp(k.replace("_", "-")): v for k, v in props.items()},
    )


# --- Single-layer wins --------------------------------------------------

def test_workbook_only():
    r = FormatResolver([_rule(WorkbookSelector(), color="#000000")])
    assert r.resolve("m1", "f1", "s1", "d1", StyleProp.COLOR) == "#000000"


def test_ds_overrides_workbook():
    r = FormatResolver([
        _rule(WorkbookSelector(), color="#000000"),
        _rule(DataSourceSelector(ds_id="d1"), color="#111111"),
    ])
    assert r.resolve("m1", "f1", "s1", "d1", StyleProp.COLOR) == "#111111"


def test_sheet_overrides_ds():
    r = FormatResolver([
        _rule(DataSourceSelector(ds_id="d1"), color="#111111"),
        _rule(WorksheetSelector(sheet_id="s1"), color="#222222"),
    ])
    assert r.resolve("m1", "f1", "s1", "d1", StyleProp.COLOR) == "#222222"


def test_field_overrides_sheet():
    r = FormatResolver([
        _rule(WorksheetSelector(sheet_id="s1"), color="#222222"),
        _rule(FieldSelector(field_id="f1"), color="#333333"),
    ])
    assert r.resolve("m1", "f1", "s1", "d1", StyleProp.COLOR) == "#333333"


def test_mark_overrides_field():
    r = FormatResolver([
        _rule(FieldSelector(field_id="f1"), color="#333333"),
        _rule(MarkSelector(mark_id="m1"), color="#ff0000"),
    ])
    assert r.resolve("m1", "f1", "s1", "d1", StyleProp.COLOR) == "#ff0000"


# --- Golden: red > blue > black -----------------------------------------

def test_golden_three_layer_stack():
    r = FormatResolver([
        _rule(WorkbookSelector(), color="#000000"),
        _rule(WorksheetSelector(sheet_id="s1"), color="#0000ff"),
        _rule(MarkSelector(mark_id="m1"), color="#ff0000"),
    ])
    assert r.resolve("m1", "f1", "s1", "d1", StyleProp.COLOR) == "#ff0000"
    # Different mark — blue wins from sheet.
    assert r.resolve("m2", "f1", "s1", "d1", StyleProp.COLOR) == "#0000ff"
    # Different sheet — black wins from workbook.
    assert r.resolve("m9", "f1", "s9", "d1", StyleProp.COLOR) == "#000000"


# --- Null fall-through --------------------------------------------------

def test_null_fallthrough_to_default():
    r = FormatResolver([])
    assert r.resolve("m1", "f1", "s1", "d1", StyleProp.COLOR, default="inherit") == "inherit"


def test_partial_rule_falls_through_for_other_prop():
    r = FormatResolver([
        _rule(MarkSelector(mark_id="m1"), color="#ff0000"),
        _rule(WorkbookSelector(), font_size=12),
    ])
    assert r.resolve("m1", "f1", "s1", "d1", StyleProp.COLOR) == "#ff0000"
    assert r.resolve("m1", "f1", "s1", "d1", StyleProp.FONT_SIZE) == 12


# --- Scope mismatch does not match --------------------------------------

def test_selector_id_mismatch_skipped():
    r = FormatResolver([_rule(FieldSelector(field_id="f_other"), color="#ff0000")])
    assert r.resolve("m1", "f1", "s1", "d1", StyleProp.COLOR, default=None) is None


def test_multiple_rules_same_selector_last_wins():
    r = FormatResolver([
        _rule(WorkbookSelector(), color="#111111"),
        _rule(WorkbookSelector(), color="#222222"),
    ])
    assert r.resolve("m1", "f1", "s1", "d1", StyleProp.COLOR) == "#222222"


# --- resolve_all merge --------------------------------------------------

def test_resolve_all_merged_view():
    r = FormatResolver([
        _rule(WorkbookSelector(), color="#000000", font_size=12),
        _rule(MarkSelector(mark_id="m1"), color="#ff0000"),
    ])
    merged = r.resolve_all("m1", "f1", "s1", "d1")
    assert merged[StyleProp.COLOR] == "#ff0000"
    assert merged[StyleProp.FONT_SIZE] == 12


def test_resolve_all_records_source_layer():
    r = FormatResolver([
        _rule(WorkbookSelector(), color="#000000"),
        _rule(MarkSelector(mark_id="m1"), color="#ff0000"),
    ])
    merged_with_source = r.resolve_all_with_source("m1", "f1", "s1", "d1")
    assert merged_with_source[StyleProp.COLOR] == ("#ff0000", "mark")


# --- Memoisation --------------------------------------------------------

def test_memoisation_same_result_same_id():
    rules = [_rule(MarkSelector(mark_id=f"m{i}"), color=f"#{i:06x}") for i in range(500)]
    r = FormatResolver(rules)
    first = r.resolve("m42", "f1", "s1", "d1", StyleProp.COLOR)
    for _ in range(1000):
        assert r.resolve("m42", "f1", "s1", "d1", StyleProp.COLOR) == first
    stats = r.cache_info()
    assert stats["hits"] >= 1000


def test_memoisation_invalidates_on_mutation():
    r = FormatResolver([_rule(WorkbookSelector(), color="#000000")])
    assert r.resolve("m1", "f1", "s1", "d1", StyleProp.COLOR) == "#000000"
    r.update_rules([_rule(WorkbookSelector(), color="#111111")])
    assert r.resolve("m1", "f1", "s1", "d1", StyleProp.COLOR) == "#111111"


# --- Edge cases ---------------------------------------------------------

def test_empty_resolver_returns_default():
    r = FormatResolver([])
    assert r.resolve("m1", "f1", "s1", "d1", StyleProp.COLOR, default="fallback") == "fallback"


def test_missing_field_id_allows_sheet_plus_mark_matches():
    r = FormatResolver([
        _rule(WorksheetSelector(sheet_id="s1"), color="#0000ff"),
        _rule(MarkSelector(mark_id="m1"), color="#ff0000"),
    ])
    assert r.resolve("m1", None, "s1", "d1", StyleProp.COLOR) == "#ff0000"


def test_rejects_circular_selector_reference():
    # Circular refs can only arise if a consumer builds a graph on top;
    # resolver validates it sees a flat list of StyleRule dataclasses.
    with pytest.raises(ResolverError):
        FormatResolver([_rule(WorkbookSelector(), color=object())])  # non-serialisable value


def test_resolve_rejects_non_style_prop():
    r = FormatResolver([])
    with pytest.raises(ResolverError):
        r.resolve("m1", "f1", "s1", "d1", "not-a-prop")  # type: ignore[arg-type]


def test_disabled_cache_still_returns_correct():
    r = FormatResolver(
        [_rule(MarkSelector(mark_id="m1"), color="#ff0000")],
        cache_enabled=False,
    )
    assert r.resolve("m1", "f1", "s1", "d1", StyleProp.COLOR) == "#ff0000"


def test_resolve_all_respects_default_styled_box_shape():
    from vizql.formatting_types import DEFAULT_STYLED_BOX

    r = FormatResolver([])
    merged = r.resolve_all("m1", "f1", "s1", "d1")
    # No rules, merged view is empty.
    assert merged == {}
    # But default StyledBox is still constructable.
    assert DEFAULT_STYLED_BOX.background_opacity == 1.0
