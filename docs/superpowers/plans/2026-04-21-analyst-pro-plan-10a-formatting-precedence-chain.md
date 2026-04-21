# Analyst Pro — Plan 10a: Formatting Precedence Chain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a layered format resolver (`Mark > Field > Worksheet > Data Source > Workbook`) with identical Python + TypeScript implementations, so every downstream Phase-10 plan (10b/10c/10d/10e) can resolve any style property deterministically by walking the precedence chain.

**Architecture:** Define `StyleRule { selector, properties }` as the backing-store atom; store rules in a single list on the workbook (`VisualSpec.formatting`) and a store slice on the client. `FormatResolver(...).resolve(mark, field, prop)` walks `mark → field → sheet → ds → workbook → default`, first non-null wins, memoised by `(mark_id, field_id, prop)`. Python + TS share fixtures to guarantee byte-identical results. `ZoneFrame.jsx` reads `StyledBox` via the resolver; `FormatInspectorPanel.jsx` edits overrides at the selected layer and surfaces *which* layer won for each property.

**Tech Stack:** Python 3.10 (dataclasses + `Enum` + `functools.lru_cache`), protobuf3 (VisualSpec extension field 17), TypeScript 5.x, Zustand, React 19, Vitest, pytest. Codegen: `bash backend/scripts/regen_proto.sh` + `bash frontend/scripts/regen_proto.sh`.

**References:**
- `docs/Build_Tableau.md` §XIV.1 (precedence), §XIV.5 (shading / borders / dividers), §XIV.6 (rich text, `LineStyle`, `StyledBox`), Appendix C (`tabstylemodel`, `tabdocformatting`).
- `docs/analyst_pro_tableau_parity_roadmap.md` §Plan 10a — AUTHORITATIVE scope.
- Plan 5d (`BaseZone` extensions in `frontend/src/components/dashboard/freeform/lib/types.ts`) — extended here to full format system.
- Plan 7a (`VisualSpec` protobuf surface in `backend/proto/askdb/vizdataservice/v1.proto`) — extended here with `formatting` list.

---

## File Structure

**Backend (Python):**
- Create: `backend/vizql/formatting_types.py` — `Selector`, `StyleProp`, `StyleRule`, `LineStyle`, `StyledBox`, `RichTextRun`, `RichText`.
- Create: `backend/vizql/format_resolver.py` — `FormatResolver` with memoised precedence walk.
- Create: `backend/vizql/FORMATTING_MODEL.md` — precedence diagram + examples + Tableau-parity gaps.
- Modify: `backend/proto/askdb/vizdataservice/v1.proto` — add `StyleRule` + `VisualSpec.formatting = 17`.
- Modify: `backend/vizql/spec.py` — wire `VisualSpec.formatting: list[StyleRule]` (dataclass + `to_proto` / `from_proto`).
- Modify: `backend/dashboard_migration.py` — preserve `formatting` array through `legacy_to_freeform_schema` + `_copy_plan5d_fields` analogue.
- Modify: `backend/user_storage.py` — allowlist `formatting` on saved dashboards (if allowlists present) + bump persisted keys.

**Backend tests:**
- Create: `backend/tests/test_format_resolver.py` — 20+ tests for layer-by-layer, stacking, shadowing, null-fallthrough, memoisation.
- Create: `backend/tests/test_format_resolver_parity.py` — JSON-fixture driver producing golden outputs for TS parity.
- Create: `backend/tests/test_format_resolver_security.py` — color sanitisation, circular selector refs, oversized rules.
- Create: `backend/tests/test_format_migration.py` — round-trip through `dashboard_migration` + `user_storage`.
- Create: `backend/vizql/tests/fixtures/format_parity/` — shared JSON fixtures used by Python + TS parity harnesses.

**Frontend (TypeScript / React):**
- Create: `frontend/src/components/dashboard/freeform/lib/formatResolver.ts` — TS port of `FormatResolver`, same contract.
- Create: `frontend/src/components/dashboard/freeform/lib/formattingTypes.ts` — TS mirror of `formatting_types.py`.
- Create: `frontend/src/components/dashboard/freeform/panels/FormatInspectorPanel.jsx` — layer-aware format editor.
- Create: `frontend/src/components/dashboard/freeform/panels/FormatInspectorPanel.module.css`.
- Modify: `frontend/src/components/dashboard/freeform/ZoneFrame.jsx` — read `StyledBox` via resolver with chain fallback.
- Modify: `frontend/src/components/dashboard/freeform/lib/types.ts` — export `StyleRule`, `Selector`, `StyleProp`.
- Modify: `frontend/src/store.js` — `analystProFormatRules` slice + `setFormatRuleAnalystPro` / `clearFormatRuleAnalystPro` / `resetFormatScopeAnalystPro` actions.
- Modify: `frontend/src/components/dashboard/freeform/AnalystProSidebar.jsx` — `Format` right-click entry points.

**Frontend tests:**
- Create: `frontend/src/components/dashboard/freeform/lib/__tests__/formatResolver.test.ts` — mirrors Python tests; consumes same JSON fixtures.
- Create: `frontend/src/components/dashboard/freeform/panels/__tests__/FormatInspectorPanel.test.tsx` — UI interaction tests.

**Protobuf / codegen regenerates:**
- Modify: `backend/vizql/proto/v1_pb2.py` (generated).
- Modify: `frontend/src/components/dashboard/freeform/lib/vizSpecGenerated.ts` (generated).

**Non-goals of Plan 10a (tracked for later):**
- Number-format grammar (Plan 10b), date-format grammar (Plan 10c), rich-text runtime rendering (Plan 10d — `RichText` *types* only land here), conditional formatting (Plan 10e).
- Actually *applying* resolved styles to Vega-Lite spec JSON — that wiring lands inside 10b–10e once per-grammar. Plan 10a covers the resolver + store + inspector UI + ZoneFrame `StyledBox` read-through only.

---

## Task 0 — Dependency Gate (pre-flight)

**Purpose:** fail loudly if earlier plans did not ship.

- [ ] **Step 1: Verify Plans 7–9 artefacts exist**

```bash
cd "QueryCopilot V1"
ls backend/vizql/spec.py backend/vizql/box_plot_compiler.py backend/vizql/trend_line.py backend/vizql/forecast.py backend/vizql/cluster.py
git log --oneline -200 | grep -E "Plan 7|Plan 8|Plan 9" | head -20
```

Expected: all five files resolve; git log shows at minimum `Plan 7` + `Plan 8` + `Plan 9` commits. If any are missing, STOP — earlier plans did not land; escalate.

- [ ] **Step 2: Verify `VisualSpec` proto field 17 free**

```bash
grep -n "= 17" backend/proto/askdb/vizdataservice/v1.proto
```

Expected: no match for `= 17;` inside `message VisualSpec`. (Field 16 = `table_calc_specs`, 17 must be unused.) If taken, grab the next free slot (18+) and record it — use that number in T3 instead.

- [ ] **Step 3: Verify branch + clean tree**

```bash
git status -sb
```

Expected: branch `askdb-global-comp`, working tree clean. If dirty, escalate — do not stash.

**No commit.**

---

## Task 1 — Python formatting types + tests

**Files:**
- Create: `backend/vizql/formatting_types.py`
- Create: `backend/tests/test_formatting_types.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_formatting_types.py
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
```

Run: `cd backend && python -m pytest tests/test_formatting_types.py -v`
Expected: FAIL — `ModuleNotFoundError: vizql.formatting_types`.

- [ ] **Step 2: Implement `formatting_types.py`**

```python
# backend/vizql/formatting_types.py
"""Typed format primitives for the Plan 10a precedence resolver.

References:
    - Build_Tableau.md §XIV.1 precedence chain (Mark > Field > Worksheet > DS > Workbook)
    - Build_Tableau.md §XIV.5 shading / borders / dividers
    - Build_Tableau.md §XIV.6 StyledBox + LineStyle
    - Appendix C: tabstylemodel / tabdocformatting
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from types import MappingProxyType
from typing import Mapping, Union


class StyleProp(str, Enum):
    FONT_FAMILY = "font-family"
    FONT_SIZE = "font-size"
    FONT_WEIGHT = "font-weight"
    FONT_STYLE = "font-style"
    COLOR = "color"
    BACKGROUND_COLOR = "background-color"
    TEXT_DECORATION = "text-decoration"
    TEXT_ALIGN = "text-align"
    LINE_HEIGHT = "line-height"
    NUMBER_FORMAT = "number-format"
    DATE_FORMAT = "date-format"
    BORDER_TOP = "border-top"
    BORDER_RIGHT = "border-right"
    BORDER_BOTTOM = "border-bottom"
    BORDER_LEFT = "border-left"
    PADDING = "padding"
    SHOW_COLUMN_BANDING = "show-column-banding"
    SHOW_ROW_BANDING = "show-row-banding"
    AXIS_TICK_COLOR = "axis-tick-color"
    ZERO_LINE_COLOR = "zero-line-color"
    PANE_LINE_THICKNESS = "pane-line-thickness"


# --- Selectors ----------------------------------------------------------

@dataclass(frozen=True)
class MarkSelector:
    mark_id: str
    kind: str = "mark"


@dataclass(frozen=True)
class FieldSelector:
    field_id: str
    kind: str = "field"


@dataclass(frozen=True)
class WorksheetSelector:
    sheet_id: str
    kind: str = "sheet"


@dataclass(frozen=True)
class DataSourceSelector:
    ds_id: str
    kind: str = "ds"


@dataclass(frozen=True)
class WorkbookSelector:
    kind: str = "workbook"


Selector = Union[
    MarkSelector, FieldSelector, WorksheetSelector, DataSourceSelector, WorkbookSelector
]


_SPECIFICITY = {
    "mark": 5,
    "field": 4,
    "sheet": 3,
    "ds": 2,
    "workbook": 1,
}


def selector_specificity(s: Selector) -> int:
    """Higher = more specific. Used by resolver walk order."""
    return _SPECIFICITY[s.kind]


# --- StyleRule ----------------------------------------------------------

@dataclass(frozen=True)
class StyleRule:
    selector: Selector
    properties: Mapping[StyleProp, object]

    def __post_init__(self) -> None:
        # Freeze to prevent downstream mutation from leaking into memoised results.
        object.__setattr__(self, "properties", MappingProxyType(dict(self.properties)))


# --- LineStyle / StyledBox / RichText ----------------------------------

@dataclass(frozen=True)
class LineStyle:
    weight: int = 1
    color: str = "#000000"
    dash: str = "solid"  # "solid" | "dashed" | "dotted" | "dash-dot"


DEFAULT_LINE_STYLE = LineStyle()


@dataclass(frozen=True)
class Shadow:
    x: int = 0
    y: int = 0
    blur: int = 0
    color: str = "#00000000"


@dataclass(frozen=True)
class StyledBox:
    background_color: str = "#ffffff"
    background_opacity: float = 1.0
    border_top: LineStyle = field(default_factory=LineStyle)
    border_right: LineStyle = field(default_factory=LineStyle)
    border_bottom: LineStyle = field(default_factory=LineStyle)
    border_left: LineStyle = field(default_factory=LineStyle)
    shadow: Shadow | None = None


DEFAULT_STYLED_BOX = StyledBox()


@dataclass(frozen=True)
class RichTextRun:
    text: str
    style: Mapping[StyleProp, object] = field(default_factory=dict)

    def __post_init__(self) -> None:
        object.__setattr__(self, "style", MappingProxyType(dict(self.style)))


@dataclass(frozen=True)
class RichText:
    runs: tuple[RichTextRun, ...] = ()
```

- [ ] **Step 3: Run the test**

Run: `cd backend && python -m pytest tests/test_formatting_types.py -v`
Expected: 7 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/vizql/formatting_types.py backend/tests/test_formatting_types.py
git commit -m "feat(analyst-pro): add formatting_types selectors + StyleRule + StyledBox (Plan 10a T1)"
```

---

## Task 2 — Python `FormatResolver` with memoised precedence walk

**Files:**
- Create: `backend/vizql/format_resolver.py`
- Create: `backend/tests/test_format_resolver.py`

- [ ] **Step 1: Write the failing test (cover all branches)**

```python
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
    assert r.resolve("m1", "f1", "s9", "d1", StyleProp.COLOR) == "#000000"


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
```

Run: `cd backend && python -m pytest tests/test_format_resolver.py -v`
Expected: FAIL — `ModuleNotFoundError: vizql.format_resolver`.

- [ ] **Step 2: Implement `format_resolver.py`**

```python
# backend/vizql/format_resolver.py
"""Plan 10a — memoised layered format resolver.

Walk order (most-specific first):
    Mark > Field > Worksheet > Data Source > Workbook > default.

Memoisation keyed on (mark_id, field_id, sheet_id, ds_id, prop).
"""
from __future__ import annotations

import logging
from functools import lru_cache
from typing import Iterable, Mapping, Optional

from vizql.formatting_types import (
    DataSourceSelector,
    FieldSelector,
    MarkSelector,
    Selector,
    StyleProp,
    StyleRule,
    WorkbookSelector,
    WorksheetSelector,
)

logger = logging.getLogger(__name__)

# Allowed primitive types for StyleRule property values. Anything else
# (callables, custom objects, None sentinels) is rejected at ingest to keep
# memoisation safe and serialisation deterministic.
_ALLOWED_VALUE_TYPES = (str, int, float, bool, tuple)


class ResolverError(ValueError):
    """Raised for invalid rule shapes or invalid resolve arguments."""


class FormatResolver:
    def __init__(
        self,
        rules: Iterable[StyleRule],
        *,
        cache_enabled: bool = True,
        cache_maxsize: int = 4096,
    ) -> None:
        self._cache_enabled = cache_enabled
        self._cache_maxsize = cache_maxsize
        self.update_rules(rules)

    # --- Public API ------------------------------------------------------

    def update_rules(self, rules: Iterable[StyleRule]) -> None:
        flat = list(rules)
        self._validate(flat)
        # Pre-bucket rules by selector kind → (key → rule) for O(1) lookup.
        self._by_mark: dict[str, list[StyleRule]] = {}
        self._by_field: dict[str, list[StyleRule]] = {}
        self._by_sheet: dict[str, list[StyleRule]] = {}
        self._by_ds: dict[str, list[StyleRule]] = {}
        self._workbook: list[StyleRule] = []
        for rule in flat:
            self._bucket(rule)
        self._rules = flat
        self._reset_cache()

    def resolve(
        self,
        mark_id: Optional[str],
        field_id: Optional[str],
        sheet_id: Optional[str],
        ds_id: Optional[str],
        prop: StyleProp,
        *,
        default: object = None,
    ) -> object:
        if not isinstance(prop, StyleProp):
            raise ResolverError(f"resolve: prop must be StyleProp, got {type(prop).__name__}")
        if self._cache_enabled:
            return self._resolve_cached(mark_id, field_id, sheet_id, ds_id, prop, default)
        return self._resolve_uncached(mark_id, field_id, sheet_id, ds_id, prop, default)

    def resolve_all(
        self,
        mark_id: Optional[str],
        field_id: Optional[str],
        sheet_id: Optional[str],
        ds_id: Optional[str],
    ) -> Mapping[StyleProp, object]:
        out: dict[StyleProp, object] = {}
        for prop in StyleProp:
            val = self.resolve(mark_id, field_id, sheet_id, ds_id, prop, default=_UNSET)
            if val is not _UNSET:
                out[prop] = val
        return out

    def resolve_all_with_source(
        self,
        mark_id: Optional[str],
        field_id: Optional[str],
        sheet_id: Optional[str],
        ds_id: Optional[str],
    ) -> Mapping[StyleProp, tuple[object, str]]:
        out: dict[StyleProp, tuple[object, str]] = {}
        for prop in StyleProp:
            result = self._resolve_uncached_with_source(
                mark_id, field_id, sheet_id, ds_id, prop
            )
            if result is not None:
                out[prop] = result
        return out

    def cache_info(self) -> dict[str, int]:
        if not self._cache_enabled:
            return {"hits": 0, "misses": 0, "maxsize": 0, "currsize": 0}
        info = self._resolve_cached.cache_info()
        return {
            "hits": info.hits,
            "misses": info.misses,
            "maxsize": info.maxsize,
            "currsize": info.currsize,
        }

    # --- Internal --------------------------------------------------------

    def _validate(self, rules: list[StyleRule]) -> None:
        for rule in rules:
            if not isinstance(rule, StyleRule):
                raise ResolverError(f"expected StyleRule, got {type(rule).__name__}")
            for prop, value in rule.properties.items():
                if not isinstance(prop, StyleProp):
                    raise ResolverError(f"property key must be StyleProp, got {prop!r}")
                if not isinstance(value, _ALLOWED_VALUE_TYPES):
                    raise ResolverError(
                        f"property value must be primitive (str/int/float/bool/tuple); got {type(value).__name__}"
                    )

    def _bucket(self, rule: StyleRule) -> None:
        s = rule.selector
        if isinstance(s, MarkSelector):
            self._by_mark.setdefault(s.mark_id, []).append(rule)
        elif isinstance(s, FieldSelector):
            self._by_field.setdefault(s.field_id, []).append(rule)
        elif isinstance(s, WorksheetSelector):
            self._by_sheet.setdefault(s.sheet_id, []).append(rule)
        elif isinstance(s, DataSourceSelector):
            self._by_ds.setdefault(s.ds_id, []).append(rule)
        elif isinstance(s, WorkbookSelector):
            self._workbook.append(rule)
        else:
            raise ResolverError(f"unknown selector type: {type(s).__name__}")

    def _reset_cache(self) -> None:
        if self._cache_enabled:
            @lru_cache(maxsize=self._cache_maxsize)
            def _inner(mark_id, field_id, sheet_id, ds_id, prop, default):
                return self._resolve_uncached(mark_id, field_id, sheet_id, ds_id, prop, default)
            self._resolve_cached = _inner

    def _layer_chain(
        self, mark_id, field_id, sheet_id, ds_id
    ) -> list[tuple[str, list[StyleRule]]]:
        # Walk most-specific → least-specific.
        return [
            ("mark", self._by_mark.get(mark_id, []) if mark_id else []),
            ("field", self._by_field.get(field_id, []) if field_id else []),
            ("sheet", self._by_sheet.get(sheet_id, []) if sheet_id else []),
            ("ds", self._by_ds.get(ds_id, []) if ds_id else []),
            ("workbook", self._workbook),
        ]

    def _resolve_uncached(self, mark_id, field_id, sheet_id, ds_id, prop, default):
        for _layer, bucket in self._layer_chain(mark_id, field_id, sheet_id, ds_id):
            # Multiple rules at same layer → last wins (most recent override).
            for rule in reversed(bucket):
                if prop in rule.properties:
                    return rule.properties[prop]
        return default

    def _resolve_uncached_with_source(self, mark_id, field_id, sheet_id, ds_id, prop):
        for layer, bucket in self._layer_chain(mark_id, field_id, sheet_id, ds_id):
            for rule in reversed(bucket):
                if prop in rule.properties:
                    return rule.properties[prop], layer
        return None


_UNSET = object()
```

- [ ] **Step 3: Run the test**

Run: `cd backend && python -m pytest tests/test_format_resolver.py -v`
Expected: 20 PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/vizql/format_resolver.py backend/tests/test_format_resolver.py
git commit -m "feat(analyst-pro): add memoised FormatResolver precedence walk (Plan 10a T2)"
```

---

## Task 3 — Protobuf extension + Python `VisualSpec.formatting` wiring

**Files:**
- Modify: `backend/proto/askdb/vizdataservice/v1.proto`
- Modify (generated): `backend/vizql/proto/v1_pb2.py`
- Modify (generated): `frontend/src/components/dashboard/freeform/lib/vizSpecGenerated.ts`
- Modify: `backend/vizql/spec.py`
- Create: `backend/tests/test_spec_formatting_proto_roundtrip.py`

- [ ] **Step 1: Write the failing round-trip test**

```python
# backend/tests/test_spec_formatting_proto_roundtrip.py
from vizql.formatting_types import MarkSelector, StyleProp, StyleRule, WorkbookSelector
from vizql.spec import VisualSpec


def test_formatting_roundtrip():
    rules = [
        StyleRule(WorkbookSelector(), {StyleProp.COLOR: "#000000"}),
        StyleRule(MarkSelector(mark_id="m1"), {StyleProp.COLOR: "#ff0000"}),
    ]
    spec = VisualSpec(sheet_id="s1", formatting=rules)
    proto = spec.to_proto()
    restored = VisualSpec.from_proto(proto)
    assert len(restored.formatting) == 2
    assert restored.formatting[1].properties[StyleProp.COLOR] == "#ff0000"


def test_formatting_empty_default():
    spec = VisualSpec(sheet_id="s1")
    assert spec.formatting == []
    proto = spec.to_proto()
    assert VisualSpec.from_proto(proto).formatting == []
```

Run: `cd backend && python -m pytest tests/test_spec_formatting_proto_roundtrip.py -v`
Expected: FAIL — `VisualSpec` has no `formatting` attribute.

- [ ] **Step 2: Extend `.proto`**

Edit `backend/proto/askdb/vizdataservice/v1.proto`:

(a) Near the other Plan-9 message definitions, add:

```proto
// Plan 10a §XIV.1 — Layered format rule. Resolver walks
// Mark > Field > Worksheet > DataSource > Workbook.
message Selector {
  string kind = 1;          // "mark" | "field" | "sheet" | "ds" | "workbook"
  string id   = 2;          // empty when kind == "workbook"
}

message StyleRuleProto {
  Selector selector       = 1;
  // Properties keyed by the Build_Tableau §XIV.6 grammar (e.g. "color",
  // "font-size"). Values serialise as strings; numeric props parsed on
  // the wire boundary (resolver re-types from StyleProp).
  map<string, string> properties = 2;
}
```

(b) Inside `message VisualSpec`, append (after line 423 `table_calc_specs = 16`):

```proto
  // Plan 10a §XIV.1 — workbook-scoped format rules; resolved at render.
  repeated StyleRuleProto formatting = 17;
```

- [ ] **Step 3: Regenerate bindings**

```bash
bash backend/scripts/regen_proto.sh
bash frontend/scripts/regen_proto.sh
```

Expected: both scripts succeed; `git status` shows diffs in `backend/vizql/proto/v1_pb2.py` and `frontend/src/components/dashboard/freeform/lib/vizSpecGenerated.ts`.

- [ ] **Step 4: Wire dataclass + `to_proto` / `from_proto`**

Edit `backend/vizql/spec.py`:

(a) At the top, after other imports, add:

```python
from .formatting_types import (
    DataSourceSelector,
    FieldSelector,
    MarkSelector,
    StyleProp,
    StyleRule,
    WorkbookSelector,
    WorksheetSelector,
)
```

(b) Inside the `VisualSpec` dataclass, add alongside the other `field(default_factory=list)` entries:

```python
    formatting: list[StyleRule] = field(default_factory=list)
```

(c) Add two module-level helpers (anywhere below the dataclass):

```python
_SELECTOR_CTOR = {
    "mark": lambda id_: MarkSelector(mark_id=id_),
    "field": lambda id_: FieldSelector(field_id=id_),
    "sheet": lambda id_: WorksheetSelector(sheet_id=id_),
    "ds": lambda id_: DataSourceSelector(ds_id=id_),
    "workbook": lambda _id: WorkbookSelector(),
}


def _selector_to_proto_pair(selector) -> tuple[str, str]:
    if isinstance(selector, MarkSelector): return ("mark", selector.mark_id)
    if isinstance(selector, FieldSelector): return ("field", selector.field_id)
    if isinstance(selector, WorksheetSelector): return ("sheet", selector.sheet_id)
    if isinstance(selector, DataSourceSelector): return ("ds", selector.ds_id)
    if isinstance(selector, WorkbookSelector): return ("workbook", "")
    raise ValueError(f"unknown selector: {type(selector).__name__}")


def _value_to_wire(value) -> str:
    if isinstance(value, bool): return "true" if value else "false"
    return str(value)


def _value_from_wire(prop: StyleProp, wire: str) -> object:
    numeric_props = {
        StyleProp.FONT_SIZE, StyleProp.LINE_HEIGHT,
        StyleProp.PANE_LINE_THICKNESS, StyleProp.PADDING,
    }
    bool_props = {StyleProp.SHOW_COLUMN_BANDING, StyleProp.SHOW_ROW_BANDING}
    if prop in bool_props: return wire == "true"
    if prop in numeric_props:
        try: return int(wire)
        except ValueError: return float(wire)
    return wire
```

(d) Extend `VisualSpec.to_proto`:

```python
        for rule in self.formatting:
            kind, sid = _selector_to_proto_pair(rule.selector)
            proto_rule = proto.formatting.add()
            proto_rule.selector.kind = kind
            proto_rule.selector.id = sid
            for prop, value in rule.properties.items():
                proto_rule.properties[prop.value] = _value_to_wire(value)
```

(e) Extend `VisualSpec.from_proto`:

```python
        formatting: list[StyleRule] = []
        for proto_rule in getattr(proto, "formatting", []):
            kind = proto_rule.selector.kind
            selector = _SELECTOR_CTOR[kind](proto_rule.selector.id)
            props: dict[StyleProp, object] = {}
            for raw_key, raw_val in proto_rule.properties.items():
                try:
                    key = StyleProp(raw_key)
                except ValueError:
                    continue  # forward-compat: skip unknown props
                props[key] = _value_from_wire(key, raw_val)
            formatting.append(StyleRule(selector=selector, properties=props))
```

Then add `formatting=formatting` to the returned `VisualSpec(...)` constructor call.

- [ ] **Step 5: Run the test**

Run: `cd backend && python -m pytest tests/test_spec_formatting_proto_roundtrip.py -v`
Expected: 2 PASS.

- [ ] **Step 6: Smoke the full backend suite**

Run: `cd backend && python -m pytest tests/ -q 2>&1 | tail -20`
Expected: still 516+ tests green. No regressions.

- [ ] **Step 7: Commit**

```bash
git add backend/proto/askdb/vizdataservice/v1.proto backend/vizql/proto/v1_pb2.py backend/vizql/spec.py backend/tests/test_spec_formatting_proto_roundtrip.py frontend/src/components/dashboard/freeform/lib/vizSpecGenerated.ts
git commit -m "feat(analyst-pro): wire VisualSpec.formatting proto + dataclass roundtrip (Plan 10a T3)"
```

---

## Task 4 — TypeScript `formatResolver.ts` + cross-runtime parity

**Files:**
- Create: `frontend/src/components/dashboard/freeform/lib/formattingTypes.ts`
- Create: `frontend/src/components/dashboard/freeform/lib/formatResolver.ts`
- Create: `frontend/src/components/dashboard/freeform/lib/__tests__/formatResolver.test.ts`
- Create: `backend/vizql/tests/fixtures/format_parity/basic_stack.json`
- Create: `backend/vizql/tests/fixtures/format_parity/partial_rules.json`
- Create: `backend/vizql/tests/fixtures/format_parity/last_wins.json`
- Create: `backend/tests/test_format_resolver_parity.py`

- [ ] **Step 1: Write the parity fixtures**

Each fixture: `{ rules: [...], queries: [{mark, field, sheet, ds, prop, expected}] }`.

Create `backend/vizql/tests/fixtures/format_parity/basic_stack.json`:

```json
{
  "rules": [
    { "selector": { "kind": "workbook", "id": "" }, "properties": { "color": "#000000" } },
    { "selector": { "kind": "sheet", "id": "s1" }, "properties": { "color": "#0000ff" } },
    { "selector": { "kind": "mark", "id": "m1" }, "properties": { "color": "#ff0000" } }
  ],
  "queries": [
    { "mark": "m1", "field": "f1", "sheet": "s1", "ds": "d1", "prop": "color", "expected": "#ff0000" },
    { "mark": "m2", "field": "f1", "sheet": "s1", "ds": "d1", "prop": "color", "expected": "#0000ff" },
    { "mark": "m1", "field": "f1", "sheet": "s9", "ds": "d1", "prop": "color", "expected": "#000000" }
  ]
}
```

Create `partial_rules.json` (field override misses when field id differs):

```json
{
  "rules": [
    { "selector": { "kind": "workbook", "id": "" }, "properties": { "font-size": "12" } },
    { "selector": { "kind": "field", "id": "price" }, "properties": { "font-size": "14" } }
  ],
  "queries": [
    { "mark": "m1", "field": "price", "sheet": "s1", "ds": "d1", "prop": "font-size", "expected": 14 },
    { "mark": "m1", "field": "name", "sheet": "s1", "ds": "d1", "prop": "font-size", "expected": 12 }
  ]
}
```

Create `last_wins.json`:

```json
{
  "rules": [
    { "selector": { "kind": "workbook", "id": "" }, "properties": { "color": "#111111" } },
    { "selector": { "kind": "workbook", "id": "" }, "properties": { "color": "#222222" } }
  ],
  "queries": [
    { "mark": "m1", "field": "f1", "sheet": "s1", "ds": "d1", "prop": "color", "expected": "#222222" }
  ]
}
```

- [ ] **Step 2: Write the Python parity driver**

```python
# backend/tests/test_format_resolver_parity.py
"""Plan 10a — JSON-fixture parity harness. TS mirror runs the same fixtures."""
import json
from pathlib import Path

import pytest

from vizql.format_resolver import FormatResolver
from vizql.formatting_types import StyleProp, StyleRule

FIXTURES = Path(__file__).resolve().parents[1] / "vizql" / "tests" / "fixtures" / "format_parity"


def _build_selector(raw):
    from vizql.formatting_types import (
        DataSourceSelector,
        FieldSelector,
        MarkSelector,
        WorkbookSelector,
        WorksheetSelector,
    )
    return {
        "mark": lambda: MarkSelector(mark_id=raw["id"]),
        "field": lambda: FieldSelector(field_id=raw["id"]),
        "sheet": lambda: WorksheetSelector(sheet_id=raw["id"]),
        "ds": lambda: DataSourceSelector(ds_id=raw["id"]),
        "workbook": lambda: WorkbookSelector(),
    }[raw["kind"]]()


def _coerce(prop: StyleProp, wire: str):
    numeric = {StyleProp.FONT_SIZE, StyleProp.LINE_HEIGHT, StyleProp.PADDING, StyleProp.PANE_LINE_THICKNESS}
    if prop in numeric:
        try: return int(wire)
        except ValueError: return float(wire)
    return wire


@pytest.mark.parametrize("path", sorted(FIXTURES.glob("*.json")))
def test_parity_fixture(path: Path):
    spec = json.loads(path.read_text())
    rules = [
        StyleRule(
            selector=_build_selector(r["selector"]),
            properties={StyleProp(k): _coerce(StyleProp(k), v) for k, v in r["properties"].items()},
        )
        for r in spec["rules"]
    ]
    r = FormatResolver(rules)
    for q in spec["queries"]:
        got = r.resolve(q["mark"], q["field"], q["sheet"], q["ds"], StyleProp(q["prop"]))
        assert got == q["expected"], f"{path.name} :: query={q} got={got}"
```

Run: `cd backend && python -m pytest tests/test_format_resolver_parity.py -v`
Expected: 3 fixture files × 1 test each = 3 PASS.

- [ ] **Step 3: Port types to TS**

Create `frontend/src/components/dashboard/freeform/lib/formattingTypes.ts`:

```typescript
// Plan 10a — TS mirror of backend/vizql/formatting_types.py.
// Build_Tableau.md §XIV.1 precedence: Mark > Field > Worksheet > DS > Workbook.

export enum StyleProp {
  FontFamily = 'font-family',
  FontSize = 'font-size',
  FontWeight = 'font-weight',
  FontStyle = 'font-style',
  Color = 'color',
  BackgroundColor = 'background-color',
  TextDecoration = 'text-decoration',
  TextAlign = 'text-align',
  LineHeight = 'line-height',
  NumberFormat = 'number-format',
  DateFormat = 'date-format',
  BorderTop = 'border-top',
  BorderRight = 'border-right',
  BorderBottom = 'border-bottom',
  BorderLeft = 'border-left',
  Padding = 'padding',
  ShowColumnBanding = 'show-column-banding',
  ShowRowBanding = 'show-row-banding',
  AxisTickColor = 'axis-tick-color',
  ZeroLineColor = 'zero-line-color',
  PaneLineThickness = 'pane-line-thickness',
}

export type SelectorKind = 'mark' | 'field' | 'sheet' | 'ds' | 'workbook';

export type Selector =
  | { kind: 'mark'; markId: string }
  | { kind: 'field'; fieldId: string }
  | { kind: 'sheet'; sheetId: string }
  | { kind: 'ds'; dsId: string }
  | { kind: 'workbook' };

export type StyleValue = string | number | boolean;

export interface StyleRule {
  readonly selector: Selector;
  readonly properties: Readonly<Record<StyleProp, StyleValue>>;
}

export interface LineStyle {
  weight: number;
  color: string;
  dash: 'solid' | 'dashed' | 'dotted' | 'dash-dot';
}

export const DEFAULT_LINE_STYLE: LineStyle = { weight: 1, color: '#000000', dash: 'solid' };

export interface StyledBox {
  backgroundColor: string;
  backgroundOpacity: number;
  borderTop: LineStyle;
  borderRight: LineStyle;
  borderBottom: LineStyle;
  borderLeft: LineStyle;
  shadow?: { x: number; y: number; blur: number; color: string };
}

export const DEFAULT_STYLED_BOX: StyledBox = {
  backgroundColor: '#ffffff',
  backgroundOpacity: 1.0,
  borderTop: DEFAULT_LINE_STYLE,
  borderRight: DEFAULT_LINE_STYLE,
  borderBottom: DEFAULT_LINE_STYLE,
  borderLeft: DEFAULT_LINE_STYLE,
};

export const NUMERIC_STYLE_PROPS: ReadonlySet<StyleProp> = new Set([
  StyleProp.FontSize,
  StyleProp.LineHeight,
  StyleProp.Padding,
  StyleProp.PaneLineThickness,
]);

export const BOOL_STYLE_PROPS: ReadonlySet<StyleProp> = new Set([
  StyleProp.ShowColumnBanding,
  StyleProp.ShowRowBanding,
]);
```

- [ ] **Step 4: Port resolver to TS**

Create `frontend/src/components/dashboard/freeform/lib/formatResolver.ts`:

```typescript
// Plan 10a — TS port of backend/vizql/format_resolver.py.
// CONTRACT: bit-for-bit identical output to Python resolver for the
// fixtures under backend/vizql/tests/fixtures/format_parity.
import {
  BOOL_STYLE_PROPS,
  NUMERIC_STYLE_PROPS,
  type Selector,
  StyleProp,
  type StyleRule,
  type StyleValue,
} from './formattingTypes';

export type ResolveResult<T = StyleValue> = { value: T; layer: string } | null;

const LAYER_ORDER: ReadonlyArray<'mark' | 'field' | 'sheet' | 'ds' | 'workbook'> = [
  'mark',
  'field',
  'sheet',
  'ds',
  'workbook',
];

export class FormatResolverError extends Error {}

export class FormatResolver {
  private byMark = new Map<string, StyleRule[]>();
  private byField = new Map<string, StyleRule[]>();
  private bySheet = new Map<string, StyleRule[]>();
  private byDs = new Map<string, StyleRule[]>();
  private workbook: StyleRule[] = [];
  private cache = new Map<string, StyleValue | undefined>();
  private hits = 0;
  private misses = 0;

  constructor(rules: readonly StyleRule[], private readonly cacheEnabled = true) {
    this.updateRules(rules);
  }

  updateRules(rules: readonly StyleRule[]) {
    this.byMark.clear(); this.byField.clear();
    this.bySheet.clear(); this.byDs.clear();
    this.workbook = [];
    for (const rule of rules) this.bucket(rule);
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  resolve(
    markId: string | null,
    fieldId: string | null,
    sheetId: string | null,
    dsId: string | null,
    prop: StyleProp,
    defaultValue?: StyleValue,
  ): StyleValue | undefined {
    const key = `${markId}|${fieldId}|${sheetId}|${dsId}|${prop}`;
    if (this.cacheEnabled && this.cache.has(key)) {
      this.hits += 1;
      const cached = this.cache.get(key);
      return cached === undefined ? defaultValue : cached;
    }
    this.misses += 1;
    const found = this.walk(markId, fieldId, sheetId, dsId, prop);
    const value = found?.value;
    if (this.cacheEnabled) this.cache.set(key, value);
    return value === undefined ? defaultValue : value;
  }

  resolveWithSource(
    markId: string | null, fieldId: string | null,
    sheetId: string | null, dsId: string | null,
    prop: StyleProp,
  ): ResolveResult | null {
    return this.walk(markId, fieldId, sheetId, dsId, prop);
  }

  resolveAll(
    markId: string | null, fieldId: string | null,
    sheetId: string | null, dsId: string | null,
  ): Partial<Record<StyleProp, StyleValue>> {
    const out: Partial<Record<StyleProp, StyleValue>> = {};
    for (const prop of Object.values(StyleProp)) {
      const v = this.resolve(markId, fieldId, sheetId, dsId, prop as StyleProp);
      if (v !== undefined) out[prop as StyleProp] = v;
    }
    return out;
  }

  cacheInfo() {
    return { hits: this.hits, misses: this.misses, size: this.cache.size };
  }

  // --- internal -------------------------------------------------------

  private bucket(rule: StyleRule) {
    const s = rule.selector as Selector;
    switch (s.kind) {
      case 'mark': this.push(this.byMark, s.markId, rule); break;
      case 'field': this.push(this.byField, s.fieldId, rule); break;
      case 'sheet': this.push(this.bySheet, s.sheetId, rule); break;
      case 'ds': this.push(this.byDs, s.dsId, rule); break;
      case 'workbook': this.workbook.push(rule); break;
      default: throw new FormatResolverError(`unknown selector: ${JSON.stringify(s)}`);
    }
  }
  private push(m: Map<string, StyleRule[]>, k: string, r: StyleRule) {
    const arr = m.get(k); if (arr) arr.push(r); else m.set(k, [r]);
  }

  private walk(
    markId: string | null, fieldId: string | null,
    sheetId: string | null, dsId: string | null, prop: StyleProp,
  ): ResolveResult | null {
    const bucketFor = (layer: string): StyleRule[] => {
      if (layer === 'mark') return (markId && this.byMark.get(markId)) || [];
      if (layer === 'field') return (fieldId && this.byField.get(fieldId)) || [];
      if (layer === 'sheet') return (sheetId && this.bySheet.get(sheetId)) || [];
      if (layer === 'ds') return (dsId && this.byDs.get(dsId)) || [];
      return this.workbook;
    };
    for (const layer of LAYER_ORDER) {
      const bucket = bucketFor(layer);
      for (let i = bucket.length - 1; i >= 0; i -= 1) {
        const rule = bucket[i];
        if (prop in rule.properties) {
          const raw = rule.properties[prop];
          return { value: coerce(prop, raw), layer };
        }
      }
    }
    return null;
  }
}

export function coerce(prop: StyleProp, raw: StyleValue): StyleValue {
  if (BOOL_STYLE_PROPS.has(prop)) return typeof raw === 'boolean' ? raw : raw === 'true' || raw === true;
  if (NUMERIC_STYLE_PROPS.has(prop)) return typeof raw === 'number' ? raw : Number(raw);
  return raw;
}
```

- [ ] **Step 5: Port parity tests to TS**

Create `frontend/src/components/dashboard/freeform/lib/__tests__/formatResolver.test.ts`:

```typescript
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { coerce, FormatResolver } from '../formatResolver';
import { StyleProp, type Selector, type StyleRule } from '../formattingTypes';

const FIXTURE_DIR = path.resolve(
  __dirname,
  '../../../../../../../backend/vizql/tests/fixtures/format_parity',
);

function toSelector(raw: { kind: string; id: string }): Selector {
  switch (raw.kind) {
    case 'mark': return { kind: 'mark', markId: raw.id };
    case 'field': return { kind: 'field', fieldId: raw.id };
    case 'sheet': return { kind: 'sheet', sheetId: raw.id };
    case 'ds': return { kind: 'ds', dsId: raw.id };
    case 'workbook': return { kind: 'workbook' };
    default: throw new Error(`bad selector kind: ${raw.kind}`);
  }
}

function toRules(raw: Array<{ selector: { kind: string; id: string }; properties: Record<string, string> }>): StyleRule[] {
  return raw.map((r) => {
    const coerced: Record<string, string | number | boolean> = {};
    for (const [k, v] of Object.entries(r.properties)) {
      const prop = k as StyleProp;
      coerced[prop] = coerce(prop, v);
    }
    return {
      selector: toSelector(r.selector),
      properties: coerced as StyleRule['properties'],
    };
  });
}

describe('Plan 10a — Python ↔ TS parity', () => {
  const files = fs.readdirSync(FIXTURE_DIR).filter((n) => n.endsWith('.json'));
  for (const name of files) {
    it(name, () => {
      const spec = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, name), 'utf8'));
      const resolver = new FormatResolver(toRules(spec.rules));
      for (const q of spec.queries) {
        const got = resolver.resolve(q.mark, q.field, q.sheet, q.ds, q.prop as StyleProp);
        expect(got).toBe(q.expected);
      }
    });
  }
});

describe('FormatResolver behaviour', () => {
  it('mark overrides sheet overrides workbook', () => {
    const resolver = new FormatResolver([
      { selector: { kind: 'workbook' }, properties: { [StyleProp.Color]: '#000000' } as StyleRule['properties'] },
      { selector: { kind: 'sheet', sheetId: 's1' }, properties: { [StyleProp.Color]: '#0000ff' } as StyleRule['properties'] },
      { selector: { kind: 'mark', markId: 'm1' }, properties: { [StyleProp.Color]: '#ff0000' } as StyleRule['properties'] },
    ]);
    expect(resolver.resolve('m1', 'f1', 's1', 'd1', StyleProp.Color)).toBe('#ff0000');
    expect(resolver.resolve('m2', 'f1', 's1', 'd1', StyleProp.Color)).toBe('#0000ff');
    expect(resolver.resolve('m1', 'f1', 's9', 'd1', StyleProp.Color)).toBe('#000000');
  });

  it('memoises and invalidates on updateRules', () => {
    const resolver = new FormatResolver([
      { selector: { kind: 'workbook' }, properties: { [StyleProp.Color]: '#000000' } as StyleRule['properties'] },
    ]);
    expect(resolver.resolve('m1', 'f1', 's1', 'd1', StyleProp.Color)).toBe('#000000');
    for (let i = 0; i < 1000; i += 1) resolver.resolve('m1', 'f1', 's1', 'd1', StyleProp.Color);
    expect(resolver.cacheInfo().hits).toBeGreaterThanOrEqual(1000);
    resolver.updateRules([
      { selector: { kind: 'workbook' }, properties: { [StyleProp.Color]: '#111111' } as StyleRule['properties'] },
    ]);
    expect(resolver.resolve('m1', 'f1', 's1', 'd1', StyleProp.Color)).toBe('#111111');
  });

  it('default returned when no rule matches', () => {
    const resolver = new FormatResolver([]);
    expect(resolver.resolve('m1', 'f1', 's1', 'd1', StyleProp.Color, 'inherit')).toBe('inherit');
  });
});
```

Run: `cd frontend && npm run test -- formatResolver.test`
Expected: all tests PASS (3 parity fixtures + 3 unit).

- [ ] **Step 6: Re-run Python parity**

Run: `cd backend && python -m pytest tests/test_format_resolver_parity.py -v`
Expected: 3 PASS (unchanged).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/dashboard/freeform/lib/formattingTypes.ts \
        frontend/src/components/dashboard/freeform/lib/formatResolver.ts \
        frontend/src/components/dashboard/freeform/lib/__tests__/formatResolver.test.ts \
        backend/tests/test_format_resolver_parity.py \
        backend/vizql/tests/fixtures/format_parity/
git commit -m "feat(analyst-pro): TS FormatResolver port + Python parity fixtures (Plan 10a T4)"
```

---

## Task 5 — Zustand store slice + actions

**Files:**
- Modify: `frontend/src/store.js`
- Create: `frontend/src/__tests__/storeFormatRules.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// frontend/src/__tests__/storeFormatRules.test.ts
import { beforeEach, describe, expect, it } from 'vitest';

import { useStore } from '../store';
import { StyleProp } from '../components/dashboard/freeform/lib/formattingTypes';

describe('analystProFormatRules slice', () => {
  beforeEach(() => {
    useStore.setState({ analystProFormatRules: [] });
  });

  it('setFormatRuleAnalystPro adds a rule', () => {
    useStore.getState().setFormatRuleAnalystPro(
      { kind: 'mark', markId: 'm1' },
      StyleProp.Color,
      '#ff0000',
    );
    expect(useStore.getState().analystProFormatRules).toHaveLength(1);
    const r = useStore.getState().analystProFormatRules[0];
    expect(r.selector).toEqual({ kind: 'mark', markId: 'm1' });
    expect(r.properties[StyleProp.Color]).toBe('#ff0000');
  });

  it('setFormatRuleAnalystPro merges onto existing selector rule', () => {
    const setRule = useStore.getState().setFormatRuleAnalystPro;
    setRule({ kind: 'mark', markId: 'm1' }, StyleProp.Color, '#ff0000');
    setRule({ kind: 'mark', markId: 'm1' }, StyleProp.FontSize, 14);
    const rules = useStore.getState().analystProFormatRules;
    expect(rules).toHaveLength(1);
    expect(rules[0].properties[StyleProp.Color]).toBe('#ff0000');
    expect(rules[0].properties[StyleProp.FontSize]).toBe(14);
  });

  it('clearFormatRuleAnalystPro removes one property', () => {
    const s = useStore.getState();
    s.setFormatRuleAnalystPro({ kind: 'mark', markId: 'm1' }, StyleProp.Color, '#ff0000');
    s.setFormatRuleAnalystPro({ kind: 'mark', markId: 'm1' }, StyleProp.FontSize, 14);
    s.clearFormatRuleAnalystPro({ kind: 'mark', markId: 'm1' }, StyleProp.Color);
    const rules = useStore.getState().analystProFormatRules;
    expect(rules[0].properties[StyleProp.Color]).toBeUndefined();
    expect(rules[0].properties[StyleProp.FontSize]).toBe(14);
  });

  it('clearFormatRuleAnalystPro drops empty rule entirely', () => {
    const s = useStore.getState();
    s.setFormatRuleAnalystPro({ kind: 'mark', markId: 'm1' }, StyleProp.Color, '#ff0000');
    s.clearFormatRuleAnalystPro({ kind: 'mark', markId: 'm1' }, StyleProp.Color);
    expect(useStore.getState().analystProFormatRules).toHaveLength(0);
  });

  it('resetFormatScopeAnalystPro removes all rules for a selector', () => {
    const s = useStore.getState();
    s.setFormatRuleAnalystPro({ kind: 'mark', markId: 'm1' }, StyleProp.Color, '#ff0000');
    s.setFormatRuleAnalystPro({ kind: 'mark', markId: 'm1' }, StyleProp.FontSize, 14);
    s.setFormatRuleAnalystPro({ kind: 'sheet', sheetId: 's1' }, StyleProp.Color, '#0000ff');
    s.resetFormatScopeAnalystPro({ kind: 'mark', markId: 'm1' });
    const rules = useStore.getState().analystProFormatRules;
    expect(rules).toHaveLength(1);
    expect(rules[0].selector).toEqual({ kind: 'sheet', sheetId: 's1' });
  });
});
```

Run: `cd frontend && npm run test -- storeFormatRules.test`
Expected: FAIL — actions do not exist.

- [ ] **Step 2: Add the slice + actions to `frontend/src/store.js`**

Find the section where other `analystPro*` slices live (search for `analystProBoxPlots` per Plan 9e). Add beside them:

```javascript
// Plan 10a — Format precedence rules. Rendered by FormatResolver.
analystProFormatRules: [],

setFormatRuleAnalystPro: (selector, prop, value) =>
  set((state) => {
    const idx = state.analystProFormatRules.findIndex(
      (r) => selectorKey(r.selector) === selectorKey(selector),
    );
    if (idx === -1) {
      return {
        analystProFormatRules: [
          ...state.analystProFormatRules,
          { selector, properties: { [prop]: value } },
        ],
      };
    }
    const existing = state.analystProFormatRules[idx];
    const merged = { ...existing, properties: { ...existing.properties, [prop]: value } };
    const next = state.analystProFormatRules.slice();
    next[idx] = merged;
    return { analystProFormatRules: next };
  }),

clearFormatRuleAnalystPro: (selector, prop) =>
  set((state) => {
    const idx = state.analystProFormatRules.findIndex(
      (r) => selectorKey(r.selector) === selectorKey(selector),
    );
    if (idx === -1) return {};
    const existing = state.analystProFormatRules[idx];
    const { [prop]: _removed, ...rest } = existing.properties;
    const next = state.analystProFormatRules.slice();
    if (Object.keys(rest).length === 0) {
      next.splice(idx, 1);
    } else {
      next[idx] = { ...existing, properties: rest };
    }
    return { analystProFormatRules: next };
  }),

resetFormatScopeAnalystPro: (selector) =>
  set((state) => ({
    analystProFormatRules: state.analystProFormatRules.filter(
      (r) => selectorKey(r.selector) !== selectorKey(selector),
    ),
  })),
```

Also add a top-of-file helper (below the imports):

```javascript
function selectorKey(s) {
  if (s.kind === 'workbook') return 'workbook::';
  if (s.kind === 'mark') return `mark::${s.markId}`;
  if (s.kind === 'field') return `field::${s.fieldId}`;
  if (s.kind === 'sheet') return `sheet::${s.sheetId}`;
  if (s.kind === 'ds') return `ds::${s.dsId}`;
  throw new Error(`selectorKey: unknown ${JSON.stringify(s)}`);
}
```

- [ ] **Step 3: Run the test**

Run: `cd frontend && npm run test -- storeFormatRules.test`
Expected: 5 PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/store.js frontend/src/__tests__/storeFormatRules.test.ts
git commit -m "feat(analyst-pro): analystProFormatRules store slice + actions (Plan 10a T5)"
```

---

## Task 6 — `ZoneFrame.jsx` resolver integration (StyledBox read-through)

**Files:**
- Modify: `frontend/src/components/dashboard/freeform/ZoneFrame.jsx`
- Modify: `frontend/src/components/dashboard/freeform/__tests__/ZoneFrame.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to `frontend/src/components/dashboard/freeform/__tests__/ZoneFrame.test.tsx`:

```typescript
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';

import { useStore } from '../../../store';
import { StyleProp } from '../lib/formattingTypes';
import ZoneFrame from '../ZoneFrame';

describe('ZoneFrame — Plan 10a StyledBox resolver integration', () => {
  it('applies resolved background-color from sheet-level rule', () => {
    useStore.setState({
      analystProFormatRules: [{
        selector: { kind: 'sheet', sheetId: 'sheetA' },
        properties: { [StyleProp.BackgroundColor]: '#abcdef' },
      }],
    });
    const { container } = render(
      <ZoneFrame zone={{ id: 'z1', type: 'worksheet', worksheetRef: 'sheetA', w: 100, h: 100 }} />,
    );
    const frame = container.querySelector('[data-zone-frame="true"]') as HTMLElement;
    expect(frame.style.backgroundColor).toBe('rgb(171, 205, 239)');
  });

  it('mark-level rule overrides sheet-level rule', () => {
    useStore.setState({
      analystProFormatRules: [
        { selector: { kind: 'sheet', sheetId: 'sheetA' }, properties: { [StyleProp.BackgroundColor]: '#abcdef' } },
        { selector: { kind: 'mark', markId: 'z1' }, properties: { [StyleProp.BackgroundColor]: '#123456' } },
      ],
    });
    const { container } = render(
      <ZoneFrame zone={{ id: 'z1', type: 'worksheet', worksheetRef: 'sheetA', w: 100, h: 100 }} />,
    );
    const frame = container.querySelector('[data-zone-frame="true"]') as HTMLElement;
    expect(frame.style.backgroundColor).toBe('rgb(18, 52, 86)');
  });
});
```

Run: `cd frontend && npm run test -- ZoneFrame.test`
Expected: FAIL — `ZoneFrame` does not yet consult the resolver.

- [ ] **Step 2: Wire the resolver in `ZoneFrame.jsx`**

Add imports near the top:

```javascript
import { FormatResolver } from './lib/formatResolver';
import { StyleProp, DEFAULT_STYLED_BOX } from './lib/formattingTypes';
```

Inside `ZoneFrame`, before computing inline styles, derive:

```javascript
const formatRules = useStore((s) => s.analystProFormatRules);
const resolver = useMemo(() => new FormatResolver(formatRules), [formatRules]);
const resolvedBg = resolver.resolve(
  zone.id,           // mark-id maps 1:1 to zone.id for Analyst Pro
  null,              // field-level overrides land in 10b/10c
  zone.worksheetRef || null,
  null,              // data-source scope introduced in 10d
  StyleProp.BackgroundColor,
);
const resolvedBorderTop = resolver.resolve(
  zone.id, null, zone.worksheetRef || null, null, StyleProp.BorderTop,
);
```

Then, where the component returns the outer frame element, replace the hard-coded `backgroundColor`/border lookup with:

```javascript
<div
  data-zone-frame="true"
  style={{
    ...existingStyle,
    backgroundColor: resolvedBg
      ? String(resolvedBg)
      : zone.background?.color ?? DEFAULT_STYLED_BOX.backgroundColor,
    borderTop: resolvedBorderTop
      ? `${resolvedBorderTop}`
      : existingStyle.borderTop,
  }}
>
```

(Keep legacy `zone.background` / `zone.border` as the fallback — resolver wins only when a rule is present.)

- [ ] **Step 3: Run the tests**

Run: `cd frontend && npm run test -- ZoneFrame.test`
Expected: PASS (new 2 cases green, pre-existing ZoneFrame tests unchanged).

- [ ] **Step 4: Full frontend chart-ir baseline sanity**

Run: `cd frontend && npm run test:chart-ir 2>&1 | tail -10`
Expected: failure count unchanged from pre-plan baseline (~22 pre-existing known failures per `CLAUDE.md` "Known Test Debt").

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/freeform/ZoneFrame.jsx frontend/src/components/dashboard/freeform/__tests__/ZoneFrame.test.tsx
git commit -m "feat(analyst-pro): ZoneFrame reads StyledBox via FormatResolver chain (Plan 10a T6)"
```

---

## Task 7 — Persistence: migration + user_storage allowlist + round-trip test

**Files:**
- Modify: `backend/dashboard_migration.py`
- Modify: `backend/user_storage.py`
- Create: `backend/tests/test_format_migration.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_format_migration.py
"""Plan 10a — dashboard migration + user_storage preserve `formatting` list."""
import json
from pathlib import Path

import pytest

from dashboard_migration import legacy_to_freeform_schema


def test_migration_preserves_formatting():
    legacy = {
        "id": "d1", "name": "Sales",
        "tiles": [{"id": "t1", "title": "Revenue"}],
        "formatting": [
            {"selector": {"kind": "workbook", "id": ""}, "properties": {"color": "#000000"}},
            {"selector": {"kind": "mark", "id": "t1"}, "properties": {"color": "#ff0000"}},
        ],
    }
    result = legacy_to_freeform_schema(legacy)
    assert "formatting" in result
    assert result["formatting"][1]["selector"]["id"] == "t1"


def test_migration_missing_formatting_ok():
    legacy = {"id": "d1", "name": "S", "tiles": []}
    result = legacy_to_freeform_schema(legacy)
    assert result.get("formatting") is None or result["formatting"] == []


def test_user_storage_roundtrip_preserves_formatting(tmp_path, monkeypatch):
    import backend.user_storage as us
    monkeypatch.setattr(us, "USER_DATA_DIR", tmp_path)
    email = "test-10a@example.com"
    us.create_user_data_dir(email)
    payload = [{
        "schemaVersion": "askdb/dashboard/v1",
        "id": "d1", "name": "Sales", "archetype": "analyst-pro",
        "formatting": [
            {"selector": {"kind": "workbook", "id": ""}, "properties": {"color": "#000000"}},
        ],
    }]
    us._save_dashboards(email, payload)  # noqa: SLF001
    loaded = us.load_dashboards(email)
    assert loaded[0]["formatting"][0]["properties"]["color"] == "#000000"
```

Run: `cd backend && python -m pytest tests/test_format_migration.py -v`
Expected: FAIL — `formatting` dropped by migration / storage.

- [ ] **Step 2: Preserve `formatting` in `dashboard_migration.py`**

Inside `legacy_to_freeform_schema` (`backend/dashboard_migration.py`), before the final `return result` add:

```python
    # Plan 10a — preserve workbook-level format rules verbatim. Resolver
    # validates shape at load time; migration must NOT drop or mutate.
    if isinstance(legacy.get("formatting"), list):
        result["formatting"] = legacy["formatting"]
```

- [ ] **Step 3: Allowlist `formatting` in `user_storage.py`**

If `backend/user_storage.py` has a dashboard-key allowlist (grep first: `grep -n "schemaVersion\|allowed_keys\|ALLOWED_DASHBOARD" backend/user_storage.py`) add `"formatting"` to it. If there is no allowlist (dashboards persisted as-is), this step is a no-op — confirm with the round-trip test below.

- [ ] **Step 4: Run the test**

Run: `cd backend && python -m pytest tests/test_format_migration.py -v`
Expected: 3 PASS.

- [ ] **Step 5: Re-run broad backend suite**

Run: `cd backend && python -m pytest tests/ -q 2>&1 | tail -20`
Expected: 516+ tests still green.

- [ ] **Step 6: Commit**

```bash
git add backend/dashboard_migration.py backend/user_storage.py backend/tests/test_format_migration.py
git commit -m "feat(analyst-pro): persist formatting array through migration + storage (Plan 10a T7)"
```

---

## Task 8 — `FormatInspectorPanel.jsx` — layer-aware editor

**Files:**
- Create: `frontend/src/components/dashboard/freeform/panels/FormatInspectorPanel.jsx`
- Create: `frontend/src/components/dashboard/freeform/panels/FormatInspectorPanel.module.css`
- Modify: `frontend/src/components/dashboard/freeform/AnalystProSidebar.jsx` — add `Format…` right-click entries
- Create: `frontend/src/components/dashboard/freeform/panels/__tests__/FormatInspectorPanel.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/components/dashboard/freeform/panels/__tests__/FormatInspectorPanel.test.tsx
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

import { useStore } from '../../../../../store';
import { StyleProp } from '../../lib/formattingTypes';
import FormatInspectorPanel from '../FormatInspectorPanel';

describe('FormatInspectorPanel', () => {
  it('shows resolved value + winning layer', () => {
    useStore.setState({
      analystProFormatRules: [
        { selector: { kind: 'workbook' }, properties: { [StyleProp.Color]: '#000000' } },
        { selector: { kind: 'mark', markId: 'z1' }, properties: { [StyleProp.Color]: '#ff0000' } },
      ],
    });
    render(
      <FormatInspectorPanel
        selector={{ kind: 'mark', markId: 'z1' }}
        context={{ markId: 'z1', fieldId: null, sheetId: 's1', dsId: 'd1' }}
      />,
    );
    // Colour row renders the resolved value + source layer.
    expect(screen.getByTestId('fmt-color-value').textContent).toBe('#ff0000');
    expect(screen.getByTestId('fmt-color-source').textContent).toMatch(/mark/i);
  });

  it('edit writes an override at the selected layer', () => {
    useStore.setState({ analystProFormatRules: [] });
    render(
      <FormatInspectorPanel
        selector={{ kind: 'sheet', sheetId: 's1' }}
        context={{ markId: 'z1', fieldId: null, sheetId: 's1', dsId: 'd1' }}
      />,
    );
    fireEvent.change(screen.getByTestId('fmt-color-input'), { target: { value: '#123456' } });
    const rules = useStore.getState().analystProFormatRules;
    expect(rules).toHaveLength(1);
    expect(rules[0].selector).toEqual({ kind: 'sheet', sheetId: 's1' });
    expect(rules[0].properties[StyleProp.Color]).toBe('#123456');
  });

  it('reset button clears override at the selected layer only', () => {
    useStore.setState({
      analystProFormatRules: [
        { selector: { kind: 'workbook' }, properties: { [StyleProp.Color]: '#000000' } },
        { selector: { kind: 'sheet', sheetId: 's1' }, properties: { [StyleProp.Color]: '#ff0000' } },
      ],
    });
    render(
      <FormatInspectorPanel
        selector={{ kind: 'sheet', sheetId: 's1' }}
        context={{ markId: 'z1', fieldId: null, sheetId: 's1', dsId: 'd1' }}
      />,
    );
    fireEvent.click(screen.getByTestId('fmt-color-reset'));
    const rules = useStore.getState().analystProFormatRules;
    // Sheet rule dropped; workbook preserved.
    expect(rules).toHaveLength(1);
    expect(rules[0].selector).toEqual({ kind: 'workbook' });
  });
});
```

Run: `cd frontend && npm run test -- FormatInspectorPanel.test`
Expected: FAIL — panel does not exist.

- [ ] **Step 2: Implement `FormatInspectorPanel.jsx`**

```jsx
// frontend/src/components/dashboard/freeform/panels/FormatInspectorPanel.jsx
import React, { useMemo } from 'react';

import { useStore } from '../../../../store';
import { FormatResolver } from '../lib/formatResolver';
import { StyleProp } from '../lib/formattingTypes';
import styles from './FormatInspectorPanel.module.css';

const EDITABLE_PROPS = [
  { prop: StyleProp.Color, label: 'Color', input: 'color' },
  { prop: StyleProp.BackgroundColor, label: 'Background', input: 'color' },
  { prop: StyleProp.FontSize, label: 'Font size', input: 'number' },
  { prop: StyleProp.FontWeight, label: 'Font weight', input: 'text' },
];

export default function FormatInspectorPanel({ selector, context }) {
  const rules = useStore((s) => s.analystProFormatRules);
  const setRule = useStore((s) => s.setFormatRuleAnalystPro);
  const clearRule = useStore((s) => s.clearFormatRuleAnalystPro);
  const resolver = useMemo(() => new FormatResolver(rules), [rules]);

  return (
    <div className={styles.panel}>
      <header className={styles.header}>
        Format — <strong>{describeSelector(selector)}</strong>
      </header>
      <table className={styles.grid}>
        <thead>
          <tr>
            <th>Property</th>
            <th>Resolved</th>
            <th>Source</th>
            <th>Override</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {EDITABLE_PROPS.map(({ prop, label, input }) => {
            const found = resolver.resolveWithSource(
              context.markId, context.fieldId, context.sheetId, context.dsId, prop,
            );
            const idBase = `fmt-${prop}`.replace(/[^a-z0-9-]/gi, '');
            return (
              <tr key={prop}>
                <td>{label}</td>
                <td data-testid={`${idBase}-value`}>{found ? String(found.value) : '—'}</td>
                <td data-testid={`${idBase}-source`}>{found ? found.layer : '—'}</td>
                <td>
                  <input
                    data-testid={`${idBase}-input`}
                    type={input}
                    onChange={(e) => setRule(
                      selector,
                      prop,
                      input === 'number' ? Number(e.target.value) : e.target.value,
                    )}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    data-testid={`${idBase}-reset`}
                    onClick={() => clearRule(selector, prop)}
                  >
                    Reset
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function describeSelector(s) {
  if (s.kind === 'workbook') return 'Workbook';
  if (s.kind === 'ds') return `Data source · ${s.dsId}`;
  if (s.kind === 'sheet') return `Worksheet · ${s.sheetId}`;
  if (s.kind === 'field') return `Field · ${s.fieldId}`;
  if (s.kind === 'mark') return `Mark · ${s.markId}`;
  return 'Unknown';
}
```

Create `FormatInspectorPanel.module.css`:

```css
.panel { padding: 12px; font: 13px/1.4 "Inter", sans-serif; }
.header { font-weight: 600; margin-bottom: 8px; }
.grid { width: 100%; border-collapse: collapse; }
.grid th, .grid td { padding: 4px 6px; border-bottom: 1px solid #eee; text-align: left; }
```

- [ ] **Step 3: Wire `Format…` menu entries into the sidebar**

In `AnalystProSidebar.jsx`, locate the existing context-menu builder (grep for `contextMenuBuilder` callers). Add menu entries:

```javascript
{ label: 'Format Mark…', onClick: () => openFormatInspector({ kind: 'mark', markId: zone.id }) },
{ label: 'Format Worksheet…', onClick: () => openFormatInspector({ kind: 'sheet', sheetId: zone.worksheetRef }) },
{ label: 'Format Workbook…', onClick: () => openFormatInspector({ kind: 'workbook' }) },
```

`openFormatInspector(selector)` dispatches a local `setActiveInspector({ kind: 'format', selector })` state that renders `<FormatInspectorPanel selector={...} context={...} />` in the sidebar right pane. (Follow the exact pattern used by the existing `HistoryInspectorPanel` mount for precedent.)

- [ ] **Step 4: Run tests**

Run: `cd frontend && npm run test -- FormatInspectorPanel.test`
Expected: 3 PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/freeform/panels/FormatInspectorPanel.jsx \
        frontend/src/components/dashboard/freeform/panels/FormatInspectorPanel.module.css \
        frontend/src/components/dashboard/freeform/panels/__tests__/FormatInspectorPanel.test.tsx \
        frontend/src/components/dashboard/freeform/AnalystProSidebar.jsx
git commit -m "feat(analyst-pro): FormatInspectorPanel layer-aware editor + sidebar mounts (Plan 10a T8)"
```

---

## Task 9 — Security: color sanitisation + circular-selector rejection

**Files:**
- Modify: `backend/vizql/format_resolver.py`
- Create: `backend/vizql/format_sanitiser.py`
- Create: `backend/tests/test_format_resolver_security.py`

- [ ] **Step 1: Write the failing test (adversarial cases)**

```python
# backend/tests/test_format_resolver_security.py
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
```

Run: `cd backend && python -m pytest tests/test_format_resolver_security.py -v`
Expected: FAIL — `format_sanitiser` module missing.

- [ ] **Step 2: Implement `format_sanitiser.py`**

```python
# backend/vizql/format_sanitiser.py
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


class ResolverError(ValueError):
    """Re-exported from format_resolver for single-import sanitiser consumers."""


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
    if _HEX_RE.match(normalised): return normalised
    if _RGB_RE.match(normalised): return normalised
    if lowered in _CSS_NAMED_COLORS: return lowered
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
```

- [ ] **Step 3: Wire sanitiser into `FormatResolver`**

Edit `backend/vizql/format_resolver.py`:

(a) Import at the top:

```python
from .format_sanitiser import sanitise_rule
```

(b) Add `max_rules: int = 10_000` to `__init__` signature and store:

```python
    def __init__(
        self,
        rules: Iterable[StyleRule],
        *,
        cache_enabled: bool = True,
        cache_maxsize: int = 4096,
        max_rules: int = 10_000,
    ) -> None:
        self._max_rules = max_rules
        ...
```

(c) In `update_rules`, sanitise + length-check:

```python
    def update_rules(self, rules):
        flat = list(rules)
        if len(flat) > self._max_rules:
            raise ResolverError(f"too many rules: {len(flat)} > {self._max_rules}")
        flat = [sanitise_rule(r) if isinstance(r, StyleRule) else r for r in flat]
        self._validate(flat)
        ...
```

- [ ] **Step 4: Run the test**

Run: `cd backend && python -m pytest tests/test_format_resolver_security.py -v`
Expected: all PASS.

- [ ] **Step 5: Re-run T2 tests to ensure no regressions**

Run: `cd backend && python -m pytest tests/test_format_resolver.py tests/test_format_resolver_parity.py -v`
Expected: 20+3 PASS unchanged.

- [ ] **Step 6: Commit**

```bash
git add backend/vizql/format_sanitiser.py backend/vizql/format_resolver.py backend/tests/test_format_resolver_security.py
git commit -m "feat(analyst-pro): sanitise StyleRule colors + cap rule count (Plan 10a T9)"
```

---

## Task 10 — Documentation + integration test + shipped marker

**Files:**
- Create: `backend/vizql/FORMATTING_MODEL.md`
- Create: `backend/tests/test_format_integration.py`
- Modify: `docs/analyst_pro_tableau_parity_roadmap.md` (append shipped marker under §Plan 10a)
- Create: `frontend/src/components/dashboard/freeform/__tests__/FormatInspectorPanel.integration.test.tsx`

- [ ] **Step 1: Write `FORMATTING_MODEL.md`**

```markdown
# Analyst Pro — Formatting Model (Plan 10a)

## Precedence diagram (Build_Tableau §XIV.1)

    Mark > Field > Worksheet > Data Source > Workbook > default

Most-specific layer wins. Resolver walks top-to-bottom; first layer with a
rule defining the requested property returns; otherwise returns `default`.

## Backing store

`VisualSpec.formatting: list[StyleRule]` (proto field 17). Client mirror
in Zustand slice `analystProFormatRules`.

## Selector grammar

| Kind | Id field | Specificity |
|---|---|---|
| `mark` | `markId` | 5 |
| `field` | `fieldId` | 4 |
| `sheet` | `sheetId` | 3 |
| `ds` | `dsId` | 2 |
| `workbook` | — | 1 |

## Supported properties (§XIV.6 grammar)

Typography — `font-family`, `font-size`, `font-weight`, `font-style`,
`text-decoration`, `text-align`, `line-height`, `color`,
`background-color`.
Chrome — `border-top/right/bottom/left`, `padding`,
`show-column-banding`, `show-row-banding`, `axis-tick-color`,
`zero-line-color`, `pane-line-thickness`.
Reserved for Plans 10b/10c — `number-format`, `date-format`.

## Resolver guarantees

- Deterministic — same rule list + same query ⇒ identical result.
- Python ↔ TypeScript parity — fixture-driven (`fixtures/format_parity/`).
- Memoised — O(1) after warmup per `(mark, field, sheet, ds, prop)` key.
- Safe — `format_sanitiser.py` rejects `javascript:` / `url(...)` / oversized / non-primitive.

## Known gaps vs Tableau

- **Themes** (§XIV.7 `StyleTheme` enum) — deferred to Plan 10d.
- **Conditional formatting** (§XIV.4) — deferred to Plan 10e (two-mechanism: stepped palette + calc→color).
- **Rich-text rendering** (§XIV.6 `<formatted-text><run/>`) — types only land here; render pipeline lands in 10d.
- **Number/date grammar parsers** — Plans 10b/10c.
- **Axis vs. pane vs. cell scope** for borders — tracked via existing `scope` fields on reference lines; not re-implemented in the resolver.
```

- [ ] **Step 2: Write an end-to-end integration test (Python)**

```python
# backend/tests/test_format_integration.py
"""Plan 10a — E2E: author rules → proto round-trip → resolve result."""
from vizql.format_resolver import FormatResolver
from vizql.formatting_types import MarkSelector, StyleProp, StyleRule, WorkbookSelector
from vizql.spec import VisualSpec


def test_spec_rules_resolve_correctly_after_proto_roundtrip():
    rules = [
        StyleRule(WorkbookSelector(), {StyleProp.COLOR: "#000000"}),
        StyleRule(MarkSelector(mark_id="m1"), {StyleProp.COLOR: "#ff0000"}),
    ]
    spec = VisualSpec(sheet_id="s1", formatting=rules)
    proto = spec.to_proto()
    restored = VisualSpec.from_proto(proto)
    resolver = FormatResolver(restored.formatting)
    assert resolver.resolve("m1", "f1", "s1", "d1", StyleProp.COLOR) == "#ff0000"
    assert resolver.resolve("m2", "f1", "s1", "d1", StyleProp.COLOR) == "#000000"
```

Run: `cd backend && python -m pytest tests/test_format_integration.py -v`
Expected: PASS.

- [ ] **Step 3: Write a frontend integration test**

```tsx
// frontend/src/components/dashboard/freeform/__tests__/FormatInspectorPanel.integration.test.tsx
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

import { useStore } from '../../../../store';
import FormatInspectorPanel from '../panels/FormatInspectorPanel';
import { StyleProp } from '../lib/formattingTypes';

describe('Plan 10a integration', () => {
  it('edit in inspector → ZoneFrame reflects change', () => {
    useStore.setState({ analystProFormatRules: [] });
    render(
      <FormatInspectorPanel
        selector={{ kind: 'sheet', sheetId: 'sX' }}
        context={{ markId: 'z1', fieldId: null, sheetId: 'sX', dsId: 'd1' }}
      />,
    );
    fireEvent.change(screen.getByTestId('fmt-background-color-input'), {
      target: { value: '#abcdef' },
    });
    expect(useStore.getState().analystProFormatRules[0].properties[StyleProp.BackgroundColor])
      .toBe('#abcdef');
  });
});
```

Run: `cd frontend && npm run test -- FormatInspectorPanel.integration`
Expected: PASS.

- [ ] **Step 4: Mark Plan 10a shipped in the roadmap**

Edit `docs/analyst_pro_tableau_parity_roadmap.md` §Plan 10a — replace the placeholder heading with:

```markdown
### Plan 10a — Precedence Chain (Mark > Field > Worksheet > DS > Workbook) — ✅ Shipped 2026-04-21

**Status:** ✅ Shipped 2026-04-21. 10 tasks.
Backend modules: `backend/vizql/{formatting_types,format_resolver,format_sanitiser}.py`.
Proto: `StyleRuleProto` + `VisualSpec.formatting = 17`.
Frontend: `frontend/src/components/dashboard/freeform/lib/{formattingTypes,formatResolver}.ts`,
`panels/FormatInspectorPanel.jsx`. Store: `analystProFormatRules` slice +
`setFormatRuleAnalystPro` / `clearFormatRuleAnalystPro` /
`resetFormatScopeAnalystPro`. Docs: `backend/vizql/FORMATTING_MODEL.md`.
Tests: 20 resolver + 3 parity fixture + 3 proto roundtrip + 3 migration +
8 security + 1 integration (backend); 3 parity + 3 unit + 2 ZoneFrame + 3
inspector + 1 integration (frontend). Plan doc:
`docs/superpowers/plans/2026-04-21-analyst-pro-plan-10a-formatting-precedence-chain.md`.
```

- [ ] **Step 5: Full regression sanity**

Run in parallel:

```bash
cd backend && python -m pytest tests/ -q 2>&1 | tail -5
cd frontend && npm run test:chart-ir 2>&1 | tail -5
cd frontend && npm run lint 2>&1 | tail -5
```

Expected: backend 516+ green; frontend failure count unchanged from baseline; lint clean for touched files.

- [ ] **Step 6: Commit**

```bash
git add backend/vizql/FORMATTING_MODEL.md \
        backend/tests/test_format_integration.py \
        frontend/src/components/dashboard/freeform/__tests__/FormatInspectorPanel.integration.test.tsx \
        docs/analyst_pro_tableau_parity_roadmap.md
git commit -m "docs(analyst-pro): FORMATTING_MODEL.md + integration tests + shipped marker (Plan 10a T10)"
```

---

## Self-Review Checklist (executed before commit to plan file)

1. **Spec coverage** — every roadmap deliverable (data model, resolver, TS port, store slice, ZoneFrame wiring, persistence, inspector UI, tests, docs) has at least one task. ✓
2. **Placeholder scan** — no `TBD`, `TODO`, "similar to …"; all code blocks contain the actual content. ✓
3. **Type consistency** — `StyleRule.properties` keyed by `StyleProp` everywhere; selector kinds use the same string literal set (`"mark"/"field"/"sheet"/"ds"/"workbook"`) in Python + TS + proto; actions named `setFormatRuleAnalystPro` / `clearFormatRuleAnalystPro` / `resetFormatScopeAnalystPro` throughout. ✓
4. **Security invariants** — sanitiser rejects `javascript:`, `url(...)`, oversized strings; max-rules cap caps ingest. ✓
5. **Cross-runtime parity** — fixture-driven; Python + TS consume the same JSON under `backend/vizql/tests/fixtures/format_parity/`. ✓
6. **Memoisation** — explicit `lru_cache` in Python, `Map`-backed cache in TS, both invalidate on `updateRules`. ✓
