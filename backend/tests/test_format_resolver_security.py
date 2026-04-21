"""Plan 10a — untrusted StyleRule values must be sanitised.

References: security-core.md §"Security Coding Rules" (normalize Unicode,
validate at startup, config values are untrusted input).
"""
import pytest

from vizql.format_resolver import FormatResolver, ResolverError
from vizql.format_sanitiser import sanitise_color, sanitise_rule
from vizql.formatting_types import MarkSelector, StyleProp, StyleRule, WorkbookSelector


# --- Color sanitisation -------------------------------------------------

@pytest.mark.parametrize("good", [
    "#fff", "#FFFFFF", "#abcdef", "#12345678",
    "rgb(1,2,3)", "rgb(1, 2, 3)", "rgba(1,2,3,0.5)",
    "red", "black", "cornflowerblue", "transparent",
])
def test_sanitise_color_accepts(good):
    assert sanitise_color(good) == good


@pytest.mark.parametrize("bad", [
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "url(http://evil.example/x.svg)",
    "expression(1)",
    "</style><script>alert(1)</script>",
    "data:image/png;base64,AAA",
    "vbscript:msgbox",
    "",
    "   ",
])
def test_sanitise_color_rejects(bad):
    with pytest.raises(ResolverError):
        sanitise_color(bad)


def test_sanitise_color_unicode_normalised():
    # Fullwidth "javascript:" should also reject.
    with pytest.raises(ResolverError):
        sanitise_color("\uff4aavascript:alert(1)")


# --- Rule-level sanitisation -------------------------------------------

def test_sanitise_rule_coerces_and_strips():
    rule = StyleRule(MarkSelector(mark_id="m1"), {
        StyleProp.COLOR: " #ff0000 ",  # trim
        StyleProp.FONT_SIZE: 14,
    })
    cleaned = sanitise_rule(rule)
    assert cleaned.properties[StyleProp.COLOR] == "#ff0000"
    assert cleaned.properties[StyleProp.FONT_SIZE] == 14


def test_sanitise_rule_rejects_oversized_string():
    with pytest.raises(ResolverError):
        sanitise_rule(StyleRule(WorkbookSelector(), {StyleProp.FONT_FAMILY: "x" * 10_001}))


def test_sanitise_rule_rejects_non_primitive():
    with pytest.raises(ResolverError):
        sanitise_rule(StyleRule(WorkbookSelector(), {StyleProp.COLOR: object()}))


# --- Resolver uses sanitiser on ingest ---------------------------------

def test_resolver_rejects_malicious_color():
    with pytest.raises(ResolverError):
        FormatResolver([StyleRule(WorkbookSelector(), {StyleProp.COLOR: "javascript:alert(1)"})])


def test_resolver_rejects_duplicate_workbook_loops():
    # "Circular" here = resolver fed a list whose selectors all expand the same
    # layer into contradictory infinite loops. The resolver accepts any
    # flat list, but with validate_max_rules it caps ingest to prevent
    # pathological amplification (security rule: validate at boundary).
    rules = [StyleRule(WorkbookSelector(), {StyleProp.COLOR: "#000000"}) for _ in range(10_001)]
    with pytest.raises(ResolverError):
        FormatResolver(rules, max_rules=10_000)
