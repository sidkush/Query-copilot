"""Plan 10a — sanitise untrusted StyleRule values.

Allowed colours:
    * `#rgb` / `#rgba` / `#rrggbb` / `#rrggbbaa`
    * `rgb(r,g,b)` / `rgba(r,g,b,a)` with decimal components only
    * CSS named colours (subset in `_CSS_NAMED_COLORS`)
    * the literal `transparent`

Rejected:
    * Any `url(...)`
    * Any `javascript:` / `data:` / `vbscript:` / `expression(...)`
    * HTML / SVG / script fragments (`<`, `>`, `</`, `script`, `style`)
    * Non-ASCII after NFKC normalisation that still maps to rejected forms

Numeric / bool coercion is delegated to resolver wire decode.
"""
from __future__ import annotations

import re
import unicodedata

from vizql.format_resolver import ResolverError
from vizql.formatting_types import StyleProp, StyleRule

_MAX_STRING_LEN = 10_000
_HEX_RE = re.compile(r"^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$")
_RGB_RE = re.compile(
    r"^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$"
)
_FORBIDDEN_SUBSTR = (
    "javascript:", "data:", "vbscript:", "expression(",
    "url(", "</", "<script", "<style", "onerror", "onload",
)
_CSS_NAMED_COLORS = frozenset({
    "transparent", "currentcolor", "inherit",
    "black", "white", "red", "green", "blue", "yellow", "cyan", "magenta",
    "grey", "gray", "darkgray", "lightgray",
    "orange", "purple", "pink", "brown", "navy", "teal", "olive", "silver", "gold",
    "cornflowerblue", "tomato", "coral", "salmon", "khaki", "indigo", "violet",
})


def sanitise_color(raw: object) -> str:
    if not isinstance(raw, str):
        raise ResolverError(f"color must be string, got {type(raw).__name__}")
    # NFKC normalise first to defeat fullwidth / homoglyph bypass.
    normalised = unicodedata.normalize("NFKC", raw).strip()
    if not normalised:
        raise ResolverError("color empty after strip")
    lowered = normalised.lower()
    for banned in _FORBIDDEN_SUBSTR:
        if banned in lowered:
            raise ResolverError(f"color contains forbidden substring: {banned!r}")
    if _HEX_RE.match(normalised):
        return normalised
    if _RGB_RE.match(normalised):
        return normalised
    if lowered in _CSS_NAMED_COLORS:
        return lowered
    raise ResolverError(f"color not an allowed form: {raw!r}")


_COLOR_PROPS = {
    StyleProp.COLOR, StyleProp.BACKGROUND_COLOR,
    StyleProp.AXIS_TICK_COLOR, StyleProp.ZERO_LINE_COLOR,
}


def sanitise_rule(rule: StyleRule) -> StyleRule:
    if not isinstance(rule, StyleRule):
        raise ResolverError("expected StyleRule instance")
    cleaned: dict[StyleProp, object] = {}
    for prop, value in rule.properties.items():
        if not isinstance(prop, StyleProp):
            raise ResolverError(f"bad property key: {prop!r}")
        if isinstance(value, str):
            if len(value) > _MAX_STRING_LEN:
                raise ResolverError(f"value too long for {prop.value}")
            if prop in _COLOR_PROPS:
                cleaned[prop] = sanitise_color(value)
            else:
                cleaned[prop] = value.strip()
        elif isinstance(value, (int, float, bool)):
            cleaned[prop] = value
        else:
            raise ResolverError(
                f"value for {prop.value} must be primitive; got {type(value).__name__}"
            )
    return StyleRule(selector=rule.selector, properties=cleaned)
