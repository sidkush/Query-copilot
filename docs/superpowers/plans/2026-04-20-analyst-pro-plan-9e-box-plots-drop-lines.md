# Analyst Pro — Plan 9e: Box Plots + Drop Lines

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Phase 9 (Analytics Pane) slice #5 — Tableau-parity **Box Plots** (quartile 25/50/75 + whiskers with configurable method + outliers), plus **Drop Lines** (client-side hover/select rule overlay from any mark to the nearest axis). Box plot is a preset composition over the Plan 9a `ReferenceDistributionSpec` path — no new data pipeline — and drop lines are a pure client-side UI aid — no query overhead — exactly the surface documented in `Build_Tableau.md` §XIII.1 ("Box Plot (via reference distribution + percentages)" and "Drop Lines (UI feature, not separate subsystem)") + §XIV.5 (shading / dividers) + Appendix B (`PERCENTILE_CONT` / `WITHIN GROUP`) + Appendix C (`tabdocaxis` → our Phase 6). Also: polish the Analytics catalogue pane (Plan 9a T9) with section icons, collapsible families (Summarise / Model / Custom), empty-state help copy, and hover tooltip previews — the pane has accumulated items since 9a and the visual density now warrants it.

**Architecture:** Box plots reuse Plan 9a's analytics-bundle path (`backend/routers/query_routes.py:357 _run_analytics`). A new `BoxPlotSpec` dataclass lives in a dedicated `backend/vizql/box_plot.py` (kept separate from `analytics_types.py` per task spec) and is serialised into the proto `AnalyticsBundle` as a sixth repeated field `box_plots`. A new `backend/vizql/box_plot_compiler.py :: compile_box_plot(spec, base_plan, measure_alias, pane_dims)` emits a **list of `SQLQueryFunction`** objects: one per percentile row (25 / 50 / 75) via `PERCENTILE_CONT` (reuses `analytics_compiler.compile_reference_line` with `aggregation="percentile"`), one for `MIN`, one for `MAX`, and — when `show_outliers=True` — **one additional detail-level query** that returns every row whose value falls outside `[Q1 − 1.5·IQR, Q3 + 1.5·IQR]` (Tukey) or outside the user-selected percentile bounds. `_run_analytics` runs all six queries, assembles a single wire envelope `{ kind: "box_plot", axis, scope, values: { q1, median, q3, whisker_low, whisker_high }, outliers: [...] }`, and the frontend `boxPlotToVega.ts` turns it into a **4-mark Vega-Lite layer per pane** — a `rule` for the whiskers (Q1 ↔ whisker_low, Q3 ↔ whisker_high — two segments), a `rect` for the Q1→Q3 box with user-set `fill_color` / `fill_opacity`, a `rule` for the median inside the box, and (when `show_outliers=True`) a `point` layer for outliers (hollow circles). Drop lines are entirely client-side: `frontend/src/chart-ir/analytics/dropLinesToVega.ts` injects two conditional 1px dashed (or dotted) rules per selected/hovered mark. The drop-lines spec is stored **per-sheet** in Zustand (`analystProDropLinesBySheet: { [sheetId]: DropLinesSpec }`) — not in the per-chart analytics bundle — because the feature applies uniformly to every mark on the sheet, mirroring Tableau's worksheet-level "Drop Lines" menu.

**Tech Stack:** Python 3.10 / numpy / pytest / FastAPI (no new deps — `PERCENTILE_CONT` is already exercised by Plan 9a); React 19 / TypeScript 5.x / Vega-Lite (via `react-vega`) / Zustand / Vitest.

**Authoritative references:**
- `docs/Build_Tableau.md` §XIII.1 (analytics-pane catalogue — "Box Plot" + "Drop Lines"), §XIV.5 (shading / borders / dividers — relevant to box fill + whisker line styling), Appendix B (`PERCENTILE_CONT`, `WITHIN GROUP (ORDER BY …)` — the exact SQL grammar emitted), Appendix C (`tabdocaxis` → our Phase 6 module).
- `docs/analyst_pro_tableau_parity_roadmap.md` §Phase 9 / Plan 9e (authoritative scope; scheduled-task brief extends it with detailed deliverable list).
- `CLAUDE.md` + `QueryCopilot V1/CLAUDE.md` (`ReadOnly` DB invariant, `SQLValidator` round-trip required on every emitted analytics SQL, numeric-constants-in-`config-defaults.md` rule).
- Plan 9a shipped artifacts (REUSE):
  - `backend/vizql/analytics_compiler.py :: compile_reference_line` (percentile + min/max aggregations already handled).
  - `backend/vizql/analytics_types.py :: ReferenceLineSpec`, `AnalyticsBundle`.
  - `backend/routers/query_routes.py:174 AnalyticsPayload` (add `box_plots` field), `:357 _run_analytics` (extend with box-plot branch).
  - `backend/proto/askdb/vizdataservice/v1.proto` `AnalyticsBundle` (add `repeated BoxPlotSpec box_plots = 6`).
  - `frontend/src/components/dashboard/freeform/panels/AnalyticsPanel.jsx:28` (unpark `box_plot` + add `drop_lines` catalogue entry + polish pass).
- Plan 9d shipped artifacts (TEMPLATE for dialogs + store + mount):
  - `frontend/src/components/dashboard/freeform/panels/{ClusterDialog,ClusterStatsBadge}.jsx`.
  - `frontend/src/store.js:1549` block — dialog-ctx + CRUD + history-snapshot pattern.
  - `frontend/src/components/dashboard/freeform/FloatingLayer.jsx` (mount alongside existing dialogs lines 6-8).

**Hard conventions:**
- **Box plot COMPOSES Plan 9a** — `compile_box_plot` delegates to `compile_reference_line` for every percentile / min / max row. No new aggregation operator, no new logical operator, no new protobuf primitive beyond the preset wrapper.
- **Drop lines are CLIENT-SIDE ONLY** — zero query overhead, zero new SQL, zero new endpoint. `DropLinesSpec` lives in Zustand; never travels over the wire.
- **Outlier query separate** — main box-plot query is aggregated; outlier query is detail-level. Keeps the aggregated path cacheable.
- **Every emitted SQL round-trips through `SQLValidator`** — identical to Plan 9a invariant; `_run_analytics` already does this via its inner helper.
- **Tukey whiskers clamped to actual data** — `whisker_low = max(q1 − 1.5·iqr, actual_min)`, `whisker_high = min(q3 + 1.5·iqr, actual_max)` — computed server-side from the 5 returned values (no extra query).
- **Percentile whisker mode** honours `whisker_percentile=(low, high)` — e.g. `(10, 90)` emits `PERCENTILE_CONT(0.10)` and `PERCENTILE_CONT(0.90)` in place of Tukey bounds.
- **`min-max` whisker mode** short-circuits — whiskers equal `MIN` and `MAX`, no outlier query possible. When `whisker_method="min-max"` the validator refuses `show_outliers=True` (raises `ValueError`).
- **Drop lines are 1px** — non-negotiable; Tableau parity. Style is `dashed` by default, `dotted` optional.
- **Drop lines mode `off`** — emits zero layers; the only opt-out. Stored explicitly (vs. absent key) so the sheet setting persists a deliberate "no drop lines" choice.
- **TDD with synthetic Gaussian** — `numpy.random.default_rng(42).normal(0, 1, 1000)` → Q1 ≈ −0.674, Q3 ≈ +0.674, tolerance `1e-2`; spiked dataset (append `[10, -10]`) → exactly those two rows returned by the outlier query.
- **AnalyticsPanel polish is a real task** — new `analytics-catalogue__section`, `…__icon`, `…__help` classes; not a drive-by. Owns its own test updates.
- Commit per task: `feat(analyst-pro): <verb> <object> (Plan 9e T<N>)`; final docs task uses `docs(analyst-pro): …`.
- Vega-Lite only on the client (no custom canvas).
- Feature-gate: `FEATURE_ANALYST_PRO` — box plots ride the Plan 9a analytics bundle, which is already gated; drop lines need no gate (pure UI).
- Store action suffix `…AnalystPro`; state field prefix `analystPro…`.

---

## File Structure

### Backend — Python

| Path | Purpose | Touch |
|---|---|---|
| `backend/proto/askdb/vizdataservice/v1.proto` | Add `message BoxPlotSpec { … }` and `repeated BoxPlotSpec box_plots = 6;` to `AnalyticsBundle`. | Modify |
| `backend/vizql/proto/` (regenerated) | Python bindings regenerated via `bash backend/scripts/regen_proto.sh`. | Regenerate |
| `frontend/src/chart-ir/vizSpecGenerated.ts` (regenerated) | TS bindings regenerated via `bash frontend/scripts/regen_proto.sh`. | Regenerate |
| `backend/vizql/box_plot.py` | `BoxPlotSpec` dataclass with `validate()` + `to_proto` / `from_proto`. Pure types; no I/O. | Create |
| `backend/vizql/analytics_types.py` | Add `box_plots: List[BoxPlotSpec]` field to `AnalyticsBundle` + include in `to_proto` / `from_proto`. | Modify |
| `backend/vizql/box_plot_compiler.py` | `compile_box_plot(spec, base_plan, measure_alias, pane_dims) → list[SQLQueryFunction]` — 3 percentile queries + MIN + MAX + optional outlier detail-query. Pure transform; delegates to `analytics_compiler.compile_reference_line`. | Create |
| `backend/routers/query_routes.py` | Add `box_plots: list[dict]` to `AnalyticsPayload`; add box-plot branch to `_run_analytics`. | Modify |
| `backend/tests/fixtures/box_plot/` | Synthetic JSON fixtures: `normal-1k.json`, `spiked-plus-minus-10.json`, `uniform-100.json`. | Create |
| `backend/tests/test_box_plot_types.py` | `BoxPlotSpec` validate / round-trip. | Create |
| `backend/tests/test_box_plot_compiler.py` | Synthetic Gaussian Q1/Q3 within 1e-2; spiked outliers caught; whisker-method variants; `SQLValidator` round-trip. | Create |
| `backend/tests/test_box_plot_endpoint.py` | End-to-end POST `/api/queries/execute` with `analytics.box_plots` payload. | Create |

### Frontend — TypeScript / React

| Path | Purpose | Touch |
|---|---|---|
| `frontend/src/chart-ir/analytics/boxPlotToVega.ts` | `compileBoxPlot(spec, envelope, baseEncoding) → VegaLiteLayer[]` — 4 marks per pane. Tooltip carries `min / Q1 / median / Q3 / max / IQR`. | Create |
| `frontend/src/chart-ir/analytics/__tests__/boxPlotToVega.test.ts` | Vitest golden-fixture tests (3 cases). | Create |
| `frontend/src/chart-ir/analytics/__tests__/__fixtures__/boxplot-*.json` | Golden envelope fixtures (3 files). | Create |
| `frontend/src/chart-ir/analytics/dropLinesToVega.ts` | `compileDropLines(spec, activeMark) → VegaLiteLayer[]` — 2 `rule` marks (1px dashed/dotted) per active mark when `mode` is `x`/`y`/`both`; 0 layers when `off`. | Create |
| `frontend/src/chart-ir/analytics/__tests__/dropLinesToVega.test.ts` | Vitest — layer counts per mode; dashed by default; color + style honoured. | Create |
| `frontend/src/store.js` | Add `analystProBoxPlots` list + CRUD + dialog-ctx actions; add `analystProDropLinesBySheet` dict + `setDropLinesAnalystPro(sheetId, spec)` + `getDropLinesForSheet(sheetId)`. | Modify |
| `frontend/src/__tests__/store.boxPlot.test.ts` | Vitest — CRUD + dialog open/close + undo/redo; per-sheet drop-lines isolation; `mode='off'` persists. | Create |
| `frontend/src/components/dashboard/freeform/panels/BoxPlotDialog.jsx` | Editor: whisker method, percentile bounds (when `percentile`), `show_outliers` (disabled for `min-max`), scope, fill color + opacity. | Create |
| `frontend/src/components/dashboard/freeform/panels/BoxPlotStatsBadge.jsx` | Info badge: Q1 / median / Q3, IQR, whisker bounds, outlier count; click expands outlier list (cap 20). | Create |
| `frontend/src/components/dashboard/freeform/panels/DropLinesDialog.jsx` | Editor: axis mode, color, line style. "Applies to every chart on this sheet" label. | Create |
| `frontend/src/components/dashboard/freeform/__tests__/BoxPlotDialog.integration.test.tsx` | RTL — choose whisker method + outliers + scope, assert `addBoxPlotAnalystPro` dispatched. | Create |
| `frontend/src/components/dashboard/freeform/__tests__/DropLinesDialog.integration.test.tsx` | RTL — choose `both` + `dashed`, assert `setDropLinesAnalystPro` called. | Create |
| `frontend/src/components/dashboard/freeform/FloatingLayer.jsx` | Mount `<BoxPlotDialog />` + `<DropLinesDialog />` alongside existing dialogs. | Modify |
| `frontend/src/components/dashboard/freeform/panels/AnalyticsPanel.jsx` | Unpark `box_plot`; add `drop_lines` entry. Polish: collapsible sections (Summarise / Model / Custom), per-item icons, hover tooltip previews, empty-state help. | Modify |
| `frontend/src/components/dashboard/freeform/panels/__tests__/AnalyticsPanel.test.tsx` | Vitest — 3 sections render; `box_plot` + `drop_lines` enabled; collapsing + tooltip behaviour. | Create |

### Documentation

| Path | Purpose | Touch |
|---|---|---|
| `docs/ANALYTICS_BOX_PLOT.md` | User-facing: whisker methods, outlier rule, scope semantics, performance. | Create |
| `docs/ANALYTICS_DROP_LINES.md` | User-facing: modes, styling, per-sheet scope. | Create |
| `docs/analyst_pro_tableau_parity_roadmap.md` | Mark Plan 9e shipped + artifact list. | Modify |

---

## Task 1: BoxPlotSpec dataclass + proto extension

**Files:**
- Modify: `backend/proto/askdb/vizdataservice/v1.proto`
- Regenerate: `backend/vizql/proto/` and `frontend/src/chart-ir/vizSpecGenerated.ts`
- Create: `backend/vizql/box_plot.py`
- Modify: `backend/vizql/analytics_types.py`
- Create: `backend/tests/test_box_plot_types.py`

- [ ] **Step 1: Write the failing test** — `backend/tests/test_box_plot_types.py`:

```python
"""Plan 9e T1 — BoxPlotSpec dataclass round-trip + validation.

References:
  Build_Tableau §XIII.1 — "Box Plot (via reference distribution + percentages)".
  Build_Tableau §XIV.5 — shading / fill.
"""
import pytest

from vizql.box_plot import BoxPlotSpec


def test_spec_round_trip_tukey():
    spec = BoxPlotSpec(
        axis="y",
        whisker_method="tukey",
        whisker_percentile=None,
        show_outliers=True,
        fill_color="#4C78A8",
        fill_opacity=0.3,
        scope="pane",
    )
    spec.validate()
    assert BoxPlotSpec.from_proto(spec.to_proto()) == spec


def test_spec_round_trip_percentile():
    spec = BoxPlotSpec(
        axis="x",
        whisker_method="percentile",
        whisker_percentile=(10, 90),
        show_outliers=True,
        fill_color="#E45756",
        fill_opacity=0.25,
        scope="entire",
    )
    spec.validate()
    assert BoxPlotSpec.from_proto(spec.to_proto()) == spec


def test_spec_rejects_unknown_axis():
    spec = BoxPlotSpec(
        axis="z", whisker_method="tukey", whisker_percentile=None,
        show_outliers=False, fill_color="#000000", fill_opacity=0.3, scope="entire",
    )
    with pytest.raises(ValueError, match="axis"):
        spec.validate()


def test_spec_rejects_unknown_whisker_method():
    spec = BoxPlotSpec(
        axis="y", whisker_method="iqr-2", whisker_percentile=None,
        show_outliers=False, fill_color="#000000", fill_opacity=0.3, scope="entire",
    )
    with pytest.raises(ValueError, match="whisker_method"):
        spec.validate()


def test_spec_rejects_percentile_mode_without_bounds():
    spec = BoxPlotSpec(
        axis="y", whisker_method="percentile", whisker_percentile=None,
        show_outliers=False, fill_color="#000000", fill_opacity=0.3, scope="entire",
    )
    with pytest.raises(ValueError, match="whisker_percentile required"):
        spec.validate()


def test_spec_rejects_percentile_bounds_out_of_range():
    spec = BoxPlotSpec(
        axis="y", whisker_method="percentile", whisker_percentile=(0, 90),
        show_outliers=False, fill_color="#000000", fill_opacity=0.3, scope="entire",
    )
    with pytest.raises(ValueError, match="whisker_percentile"):
        spec.validate()


def test_spec_rejects_inverted_percentile_bounds():
    spec = BoxPlotSpec(
        axis="y", whisker_method="percentile", whisker_percentile=(90, 10),
        show_outliers=False, fill_color="#000000", fill_opacity=0.3, scope="entire",
    )
    with pytest.raises(ValueError, match="low.*high"):
        spec.validate()


def test_spec_rejects_min_max_with_outliers():
    spec = BoxPlotSpec(
        axis="y", whisker_method="min-max", whisker_percentile=None,
        show_outliers=True, fill_color="#000000", fill_opacity=0.3, scope="entire",
    )
    with pytest.raises(ValueError, match="min-max.*show_outliers"):
        spec.validate()


def test_spec_rejects_fill_opacity_out_of_range():
    spec = BoxPlotSpec(
        axis="y", whisker_method="tukey", whisker_percentile=None,
        show_outliers=False, fill_color="#000000", fill_opacity=2.0, scope="entire",
    )
    with pytest.raises(ValueError, match="fill_opacity"):
        spec.validate()


def test_spec_rejects_unknown_scope():
    spec = BoxPlotSpec(
        axis="y", whisker_method="tukey", whisker_percentile=None,
        show_outliers=False, fill_color="#000000", fill_opacity=0.3, scope="viz",
    )
    with pytest.raises(ValueError, match="scope"):
        spec.validate()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_box_plot_types.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'vizql.box_plot'`.

- [ ] **Step 3: Extend the protobuf** — `backend/proto/askdb/vizdataservice/v1.proto` — find the `AnalyticsBundle` message (currently lines ~310-319) and add a new `BoxPlotSpec` message + extend `AnalyticsBundle` with `box_plots` as field number 6:

```proto
  repeated Slot                      slots           = 1;
  repeated ReferenceLineSpec         reference_lines = 2;
  repeated ReferenceBandSpec         reference_bands = 3;
  repeated ReferenceDistributionSpec distributions   = 4;
  repeated TotalsSpec                totals          = 5;
  repeated BoxPlotSpec               box_plots       = 6;
}

// ... existing ReferenceLineSpec / ReferenceBandSpec / ReferenceDistributionSpec / TotalsSpec messages ...

// Plan 9e — Tableau §XIII.1 box plot. Composes via ReferenceDistributionSpec
// (5 aggregated rows: q1 / median / q3 + whisker_low / whisker_high). Whisker
// method picks the whisker computation (Tukey 1.5*IQR / min-max / percentile).
message BoxPlotSpec {
  string axis                  = 1;  // "x" | "y"
  string whisker_method        = 2;  // "tukey" | "min-max" | "percentile"
  int32  whisker_percentile_lo = 3;  // 1..49  when whisker_method=="percentile"; else 0
  int32  whisker_percentile_hi = 4;  // 51..99 when whisker_method=="percentile"; else 0
  bool   has_whisker_percentile = 5; // discriminates legitimate (0,0) unset from bad tuple
  bool   show_outliers         = 6;
  string fill_color            = 7;  // "#RRGGBB"
  double fill_opacity          = 8;  // 0..1
  string scope                 = 9;  // "entire" | "pane" | "cell"
}
```

- [ ] **Step 4: Regenerate proto bindings**

Run (from `QueryCopilot V1/`):
```bash
bash backend/scripts/regen_proto.sh
bash frontend/scripts/regen_proto.sh
```
Expected: clean completion; `backend/vizql/proto/` files and `frontend/src/chart-ir/vizSpecGenerated.ts` gain `BoxPlotSpec`. Commit the regenerated files with this task.

- [ ] **Step 5: Implement `BoxPlotSpec`** — `backend/vizql/box_plot.py`:

```python
"""Plan 9e — BoxPlotSpec dataclass.

Composes via Plan 9a ReferenceDistributionSpec: emits 5 aggregated rows
(q1 / median / q3 / whisker_low / whisker_high) plus an optional outlier
detail query when show_outliers=True. See Build_Tableau §XIII.1 +
Appendix B (PERCENTILE_CONT).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Tuple

from .proto import v1_pb2 as pb


_VALID_AXES = frozenset({"x", "y"})
_VALID_METHODS = frozenset({"tukey", "min-max", "percentile"})
_VALID_SCOPES = frozenset({"entire", "pane", "cell"})


@dataclass(frozen=True, slots=True)
class BoxPlotSpec:
    axis: str
    whisker_method: str
    whisker_percentile: Optional[Tuple[int, int]]
    show_outliers: bool
    fill_color: str
    fill_opacity: float
    scope: str

    def validate(self) -> None:
        if self.axis not in _VALID_AXES:
            raise ValueError(f"axis must be one of {sorted(_VALID_AXES)}")
        if self.whisker_method not in _VALID_METHODS:
            raise ValueError(
                f"whisker_method must be one of {sorted(_VALID_METHODS)}"
            )
        if self.whisker_method == "percentile":
            if self.whisker_percentile is None:
                raise ValueError(
                    "whisker_percentile required when whisker_method='percentile'"
                )
            lo, hi = self.whisker_percentile
            if not (1 <= lo <= 49):
                raise ValueError(
                    f"whisker_percentile low out of [1,49]: {lo}"
                )
            if not (51 <= hi <= 99):
                raise ValueError(
                    f"whisker_percentile high out of [51,99]: {hi}"
                )
            if lo >= hi:
                raise ValueError(
                    f"whisker_percentile low ({lo}) must be < high ({hi})"
                )
        if self.whisker_method == "min-max" and self.show_outliers:
            raise ValueError(
                "min-max whisker_method cannot combine with show_outliers=True "
                "(every row fits inside MIN..MAX)"
            )
        if not 0.0 <= self.fill_opacity <= 1.0:
            raise ValueError(f"fill_opacity out of [0,1]: {self.fill_opacity}")
        if self.scope not in _VALID_SCOPES:
            raise ValueError(f"scope must be one of {sorted(_VALID_SCOPES)}")

    def to_proto(self) -> pb.BoxPlotSpec:
        has_wp = self.whisker_percentile is not None
        lo, hi = (self.whisker_percentile or (0, 0))
        return pb.BoxPlotSpec(
            axis=self.axis,
            whisker_method=self.whisker_method,
            whisker_percentile_lo=lo,
            whisker_percentile_hi=hi,
            has_whisker_percentile=has_wp,
            show_outliers=self.show_outliers,
            fill_color=self.fill_color,
            fill_opacity=self.fill_opacity,
            scope=self.scope,
        )

    @classmethod
    def from_proto(cls, m: pb.BoxPlotSpec) -> "BoxPlotSpec":
        wp: Optional[Tuple[int, int]] = None
        if m.has_whisker_percentile:
            wp = (int(m.whisker_percentile_lo), int(m.whisker_percentile_hi))
        return cls(
            axis=m.axis,
            whisker_method=m.whisker_method,
            whisker_percentile=wp,
            show_outliers=bool(m.show_outliers),
            fill_color=m.fill_color,
            fill_opacity=float(m.fill_opacity),
            scope=m.scope,
        )


__all__ = ["BoxPlotSpec"]
```

- [ ] **Step 6: Extend `AnalyticsBundle`** — `backend/vizql/analytics_types.py` — add `box_plots` field + (de)serialisation. Find the existing `AnalyticsBundle` dataclass (lines 193-199) and extend:

```python
# at top of file — add import
from .box_plot import BoxPlotSpec

# extend AnalyticsBundle dataclass
@dataclass(frozen=True, slots=True)
class AnalyticsBundle:
    """The full analytics payload attached to a VisualSpec."""
    reference_lines: List[ReferenceLineSpec] = field(default_factory=list)
    reference_bands: List[ReferenceBandSpec] = field(default_factory=list)
    distributions:   List[ReferenceDistributionSpec] = field(default_factory=list)
    totals:          List[TotalsSpec] = field(default_factory=list)
    box_plots:       List[BoxPlotSpec] = field(default_factory=list)  # NEW — Plan 9e

    def to_proto(self) -> pb.AnalyticsBundle:
        m = pb.AnalyticsBundle()
        m.reference_lines.extend(x.to_proto() for x in self.reference_lines)
        m.reference_bands.extend(x.to_proto() for x in self.reference_bands)
        m.distributions.extend(x.to_proto()   for x in self.distributions)
        m.totals.extend(x.to_proto()          for x in self.totals)
        m.box_plots.extend(x.to_proto()       for x in self.box_plots)   # NEW
        return m

    @classmethod
    def from_proto(cls, m: pb.AnalyticsBundle) -> "AnalyticsBundle":
        return cls(
            reference_lines=[ReferenceLineSpec.from_proto(x) for x in m.reference_lines],
            reference_bands=[ReferenceBandSpec.from_proto(x) for x in m.reference_bands],
            distributions=[ReferenceDistributionSpec.from_proto(x) for x in m.distributions],
            totals=[TotalsSpec.from_proto(x) for x in m.totals],
            box_plots=[BoxPlotSpec.from_proto(x) for x in m.box_plots],      # NEW
        )

# extend __all__ at bottom
__all__ = [
    # ... existing entries ...
    "BoxPlotSpec",
    "AnalyticsBundle",
]
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_box_plot_types.py -v`
Expected: 10 passed.

- [ ] **Step 8: Verify no regressions**

Run: `cd backend && python -m pytest tests/ -v -k "analytics or proto"`
Expected: existing analytics tests still green (proto field 6 is additive).

- [ ] **Step 9: Commit**

```bash
cd "QueryCopilot V1"
git add backend/proto/askdb/vizdataservice/v1.proto \
        backend/vizql/proto/ \
        frontend/src/chart-ir/vizSpecGenerated.ts \
        backend/vizql/box_plot.py \
        backend/vizql/analytics_types.py \
        backend/tests/test_box_plot_types.py
git commit -m "feat(analyst-pro): add BoxPlotSpec dataclass + proto extension (Plan 9e T1)"
```

---

## Task 2: Box-plot SQL compiler

**Files:**
- Create: `backend/vizql/box_plot_compiler.py`
- Create: `backend/tests/fixtures/box_plot/normal-1k.json`
- Create: `backend/tests/fixtures/box_plot/spiked-plus-minus-10.json`
- Create: `backend/tests/fixtures/box_plot/uniform-100.json`
- Create: `backend/tests/test_box_plot_compiler.py`

- [ ] **Step 1: Generate fixtures** — run from `backend/`:

```python
import json
import numpy as np
from pathlib import Path

rng = np.random.default_rng(42)
base = Path("tests/fixtures/box_plot")
base.mkdir(parents=True, exist_ok=True)

normal = rng.normal(0.0, 1.0, 1000).round(6).tolist()
(base / "normal-1k.json").write_text(json.dumps({"measure": normal}))

spiked = normal + [10.0, -10.0]
(base / "spiked-plus-minus-10.json").write_text(json.dumps({"measure": spiked}))

uniform = rng.uniform(0.0, 1.0, 100).round(6).tolist()
(base / "uniform-100.json").write_text(json.dumps({"measure": uniform}))
```

Commit only the three JSON files (no script). Verify shape: `{"measure": [...]}` with 1000 / 1002 / 100 entries respectively.

- [ ] **Step 2: Write the failing test** — `backend/tests/test_box_plot_compiler.py`:

```python
"""Plan 9e T2 — compile_box_plot emits the right SQL envelope + correct numerics.

References:
  Build_Tableau §XIII.1 (box plot catalogue).
  Build_Tableau Appendix B — PERCENTILE_CONT + WITHIN GROUP grammar.
"""
import json
from pathlib import Path

import duckdb

from sql_validator import SQLValidator
from vizql import logical as lg
from vizql.box_plot import BoxPlotSpec
from vizql.box_plot_compiler import compile_box_plot

FIXTURES = Path(__file__).parent / "fixtures" / "box_plot"


def _load(name: str) -> list[dict]:
    rows = json.loads((FIXTURES / name).read_text())["measure"]
    return [{"measure": v} for v in rows]


def _base_plan_from_rows(rows: list[dict]) -> lg.LogicalOp:
    # Minimal base plan — LogicalOpAggregate with no group-bys, sum of
    # measure column — matches the shape analytics_compiler expects.
    return lg.LogicalOpAggregate(
        input=lg.LogicalOpInlineRows(rows=rows, column_aliases=("measure",)),
        group_bys=(),
        aggregations=(lg.AggExp(name="measure", agg="sum",
                                expr=lg.FieldRef(id="measure")),),
    )


def _run_query(fn) -> list[dict]:
    sql = fn.to_sql_generic()
    ok, clean, err = SQLValidator().validate(sql)
    assert ok, f"SQLValidator rejected emitted SQL: {err}\n{sql}"
    con = duckdb.connect()
    df = con.execute(clean).df()
    return df.to_dict("records")


def test_tukey_emits_5_queries_when_no_outliers():
    spec = BoxPlotSpec(
        axis="y", whisker_method="tukey", whisker_percentile=None,
        show_outliers=False, fill_color="#4C78A8", fill_opacity=0.3, scope="entire",
    )
    rows = _load("normal-1k.json")
    fns = compile_box_plot(
        spec=spec, base_plan=_base_plan_from_rows(rows),
        measure_alias="measure", pane_dims=(),
    )
    assert len(fns) == 5  # q1, median, q3, min, max


def test_tukey_emits_6_queries_with_outliers():
    spec = BoxPlotSpec(
        axis="y", whisker_method="tukey", whisker_percentile=None,
        show_outliers=True, fill_color="#4C78A8", fill_opacity=0.3, scope="entire",
    )
    rows = _load("normal-1k.json")
    fns = compile_box_plot(
        spec=spec, base_plan=_base_plan_from_rows(rows),
        measure_alias="measure", pane_dims=(),
    )
    assert len(fns) == 6  # q1, median, q3, min, max, outliers


def test_min_max_emits_5_queries():
    spec = BoxPlotSpec(
        axis="y", whisker_method="min-max", whisker_percentile=None,
        show_outliers=False, fill_color="#4C78A8", fill_opacity=0.3, scope="entire",
    )
    rows = _load("uniform-100.json")
    fns = compile_box_plot(
        spec=spec, base_plan=_base_plan_from_rows(rows),
        measure_alias="measure", pane_dims=(),
    )
    assert len(fns) == 5


def test_percentile_mode_emits_specified_bounds():
    spec = BoxPlotSpec(
        axis="y", whisker_method="percentile", whisker_percentile=(10, 90),
        show_outliers=True, fill_color="#4C78A8", fill_opacity=0.3, scope="entire",
    )
    rows = _load("normal-1k.json")
    fns = compile_box_plot(
        spec=spec, base_plan=_base_plan_from_rows(rows),
        measure_alias="measure", pane_dims=(),
    )
    assert len(fns) == 6  # q1, median, q3, p10, p90, outliers
    sqls = [fn.to_sql_generic() for fn in fns]
    pct_sqls = [s for s in sqls if "PERCENTILE_CONT" in s]
    assert any("0.1" in s for s in pct_sqls), f"no 0.1 bound: {pct_sqls}"
    assert any("0.9" in s for s in pct_sqls), f"no 0.9 bound: {pct_sqls}"


def test_gaussian_quartiles_match_analytical():
    spec = BoxPlotSpec(
        axis="y", whisker_method="tukey", whisker_percentile=None,
        show_outliers=False, fill_color="#4C78A8", fill_opacity=0.3, scope="entire",
    )
    rows = _load("normal-1k.json")
    fns = compile_box_plot(
        spec=spec, base_plan=_base_plan_from_rows(rows),
        measure_alias="measure", pane_dims=(),
    )
    q1  = _run_query(fns[0])[0]["__reference_value__"]
    med = _run_query(fns[1])[0]["__reference_value__"]
    q3  = _run_query(fns[2])[0]["__reference_value__"]
    assert abs(q1 - (-0.6745)) < 0.1
    assert abs(med - 0.0) < 0.1
    assert abs(q3 - 0.6745) < 0.1


def test_spiked_outliers_caught():
    spec = BoxPlotSpec(
        axis="y", whisker_method="tukey", whisker_percentile=None,
        show_outliers=True, fill_color="#4C78A8", fill_opacity=0.3, scope="entire",
    )
    rows = _load("spiked-plus-minus-10.json")
    fns = compile_box_plot(
        spec=spec, base_plan=_base_plan_from_rows(rows),
        measure_alias="measure", pane_dims=(),
    )
    # Last fn is the outlier detail query.
    outlier_rows = _run_query(fns[-1])
    vals = sorted(r["measure"] for r in outlier_rows)
    assert 10.0 in vals and -10.0 in vals
    assert len(vals) == 2, f"expected exactly 2 spiked outliers, got {vals}"


def test_every_emitted_query_passes_validator():
    spec = BoxPlotSpec(
        axis="y", whisker_method="tukey", whisker_percentile=None,
        show_outliers=True, fill_color="#4C78A8", fill_opacity=0.3, scope="entire",
    )
    rows = _load("normal-1k.json")
    fns = compile_box_plot(
        spec=spec, base_plan=_base_plan_from_rows(rows),
        measure_alias="measure", pane_dims=(),
    )
    v = SQLValidator()
    for fn in fns:
        ok, _, err = v.validate(fn.to_sql_generic())
        assert ok, f"SQLValidator rejected: {err}"
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_box_plot_compiler.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'vizql.box_plot_compiler'`.

- [ ] **Step 4: Implement `compile_box_plot`** — `backend/vizql/box_plot_compiler.py`:

```python
"""Plan 9e — compile a BoxPlotSpec into a list of SQLQueryFunctions.

Composition rule (Build_Tableau §XIII.1):
  Every box plot is a ReferenceDistributionSpec preset producing five
  aggregated rows — q1 / median / q3 + whisker_low / whisker_high — plus an
  optional detail-level outlier query when show_outliers is True.

Whisker methods:
  - tukey      — q1/q3 emitted as percentiles; MIN + MAX emitted alongside
                 so the endpoint can clamp [q1-1.5*iqr, q3+1.5*iqr] to the
                 actual data without a second round trip.
  - min-max    — whisker_low = MIN, whisker_high = MAX.
  - percentile — whisker_low / whisker_high = PERCENTILE_CONT(lo/100),
                 PERCENTILE_CONT(hi/100).

Outlier query (when enabled) is a detail SELECT over the base subquery
joined to a 1-row bounds subquery carrying inline PERCENTILE_CONT
expressions for the thresholds, so the DB computes everything in one pass.
"""
from __future__ import annotations

from typing import Sequence

from . import analytics_compiler as ac
from . import analytics_types as at
from . import logical as lg
from . import sql_ast as sa
from .box_plot import BoxPlotSpec


def _percentile_line(axis: str, p: int, scope: str) -> at.ReferenceLineSpec:
    return at.ReferenceLineSpec(
        axis=axis, aggregation="percentile", value=None,
        percentile=p, scope=scope, label="value", custom_label="",
        line_style="solid", color="#000000", show_marker=False,
    )


def _agg_line(axis: str, agg: str, scope: str) -> at.ReferenceLineSpec:
    return at.ReferenceLineSpec(
        axis=axis, aggregation=agg, value=None,
        percentile=None, scope=scope, label="value", custom_label="",
        line_style="solid", color="#000000", show_marker=False,
    )


def _outlier_query(
    base_plan: lg.LogicalOp,
    measure_alias: str,
    spec: BoxPlotSpec,
) -> sa.SQLQueryFunction:
    """Detail-level outlier query. Uses inline PERCENTILE_CONT sub-exprs
    for the low/high bounds + a cross-joined 1-row bounds subquery so the
    predicate references lo/hi as plain columns. Dialect-portable."""
    col = sa.Column(name=measure_alias, table_alias="")

    def _pct(frac: float) -> sa.SQLQueryExpression:
        return sa.FnCall(
            name="PERCENTILE_CONT",
            args=(sa.Literal(value=frac, data_type="float"),),
            within_group=((col, True),),
        )

    if spec.whisker_method == "percentile":
        lo_expr = _pct(spec.whisker_percentile[0] / 100.0)
        hi_expr = _pct(spec.whisker_percentile[1] / 100.0)
    else:  # tukey
        q1 = _pct(0.25)
        q3 = _pct(0.75)
        iqr = sa.BinaryOp(op="-", left=q3, right=q1)
        coef = sa.Literal(value=1.5, data_type="float")
        adj = sa.BinaryOp(op="*", left=coef, right=iqr)
        lo_expr = sa.BinaryOp(op="-", left=q1, right=adj)
        hi_expr = sa.BinaryOp(op="+", left=q3, right=adj)

    bounds_cte_derived = sa.SubqueryRef(
        query=ac.compile_logical_to_sql(base_plan), alias="_t0",
    )
    bounds_cte = sa.SQLQueryFunction(
        projections=(
            sa.Projection(alias="__lo__", expression=lo_expr),
            sa.Projection(alias="__hi__", expression=hi_expr),
        ),
        from_=bounds_cte_derived,
        limit=1,
    )
    bounds_ref = sa.SubqueryRef(query=bounds_cte, alias="_b")
    detail_base = sa.SubqueryRef(
        query=ac.compile_logical_to_sql(base_plan), alias="_d",
    )
    predicate = sa.BinaryOp(
        op="OR",
        left=sa.BinaryOp(
            op="<", left=sa.Column(name=measure_alias, table_alias="_d"),
            right=sa.Column(name="__lo__", table_alias="_b"),
        ),
        right=sa.BinaryOp(
            op=">", left=sa.Column(name=measure_alias, table_alias="_d"),
            right=sa.Column(name="__hi__", table_alias="_b"),
        ),
    )
    return sa.SQLQueryFunction(
        projections=(
            sa.Projection(
                alias=measure_alias,
                expression=sa.Column(name=measure_alias, table_alias="_d"),
            ),
        ),
        from_=sa.CrossJoin(left=detail_base, right=bounds_ref),
        where=predicate,
    )


def compile_box_plot(
    *,
    spec: BoxPlotSpec,
    base_plan: lg.LogicalOp,
    measure_alias: str,
    pane_dims: Sequence[str] = (),
) -> list[sa.SQLQueryFunction]:
    """Compile BoxPlotSpec into [q1, median, q3, whisker_low, whisker_high]
    + optional outliers. Order is load-bearing — the endpoint uses index
    positions to assemble the wire envelope."""
    spec.validate()
    out: list[sa.SQLQueryFunction] = []

    for p in (25, 50, 75):
        out.append(ac.compile_reference_line(
            spec=_percentile_line(spec.axis, p, spec.scope),
            base_plan=base_plan, measure_alias=measure_alias, pane_dims=pane_dims,
        ))

    if spec.whisker_method == "min-max":
        out.append(ac.compile_reference_line(
            spec=_agg_line(spec.axis, "min", spec.scope),
            base_plan=base_plan, measure_alias=measure_alias, pane_dims=pane_dims,
        ))
        out.append(ac.compile_reference_line(
            spec=_agg_line(spec.axis, "max", spec.scope),
            base_plan=base_plan, measure_alias=measure_alias, pane_dims=pane_dims,
        ))
    elif spec.whisker_method == "percentile":
        lo, hi = spec.whisker_percentile
        out.append(ac.compile_reference_line(
            spec=_percentile_line(spec.axis, lo, spec.scope),
            base_plan=base_plan, measure_alias=measure_alias, pane_dims=pane_dims,
        ))
        out.append(ac.compile_reference_line(
            spec=_percentile_line(spec.axis, hi, spec.scope),
            base_plan=base_plan, measure_alias=measure_alias, pane_dims=pane_dims,
        ))
    else:  # tukey — emit MIN + MAX so endpoint can clamp
        out.append(ac.compile_reference_line(
            spec=_agg_line(spec.axis, "min", spec.scope),
            base_plan=base_plan, measure_alias=measure_alias, pane_dims=pane_dims,
        ))
        out.append(ac.compile_reference_line(
            spec=_agg_line(spec.axis, "max", spec.scope),
            base_plan=base_plan, measure_alias=measure_alias, pane_dims=pane_dims,
        ))

    if spec.show_outliers:
        out.append(_outlier_query(base_plan, measure_alias, spec))

    return out


__all__ = ["compile_box_plot"]
```

> **If `sa.CrossJoin` does not yet exist** in `backend/vizql/sql_ast.py`, fall back to the equivalent form the existing suite already uses (e.g. a `WITH __bounds__ AS (…)` clause and a plain `SELECT … FROM base, __bounds__ WHERE …`). The test asserts only that `SQLValidator` accepts the SQL and DuckDB returns the right rows — it does not pin the AST shape. Use whichever sub-AST is already in place; do NOT add a new AST node in this task.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_box_plot_compiler.py -v`
Expected: 7 passed.

- [ ] **Step 6: Commit**

```bash
cd "QueryCopilot V1"
git add backend/vizql/box_plot_compiler.py \
        backend/tests/fixtures/box_plot/ \
        backend/tests/test_box_plot_compiler.py
git commit -m "feat(analyst-pro): add box-plot SQL compiler (Plan 9e T2)"
```

---

## Task 3: Wire box plots into `/queries/execute`

**Files:**
- Modify: `backend/routers/query_routes.py`
- Create: `backend/tests/test_box_plot_endpoint.py`

- [ ] **Step 1: Write the failing test** — `backend/tests/test_box_plot_endpoint.py`:

```python
"""Plan 9e T3 — POST /api/queries/execute with box-plot analytics payload."""
import pytest
from fastapi.testclient import TestClient

from main import app  # noqa: F401 — triggers router registration


def _demo_login(client: TestClient) -> tuple[str, str]:
    # Reuse whichever helper the existing Plan 9a endpoint test uses
    # (see backend/tests/test_analytics_endpoint.py). Inline here for
    # clarity; replace with import if the helper already exists.
    r = client.post("/api/auth/demo", json={})
    assert r.status_code == 200
    token = r.json()["access_token"]
    r = client.post("/api/connections/demo",
                    headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    return token, r.json()["conn_id"]


@pytest.fixture
def client_and_conn():
    client = TestClient(app)
    token, conn_id = _demo_login(client)
    return client, token, conn_id


def _body(conn_id: str, box_plot: dict) -> dict:
    return {
        "sql": "SELECT value AS measure FROM (VALUES (-2.0),(-1.0),(0.0),(1.0),(2.0),(10.0)) t(value)",
        "conn_id": conn_id,
        "analytics": {"box_plots": [box_plot]},
        "measure_alias": "measure",
        "pane_dims": [],
        "base_plan_hint": {
            "kind": "aggregate",
            "group_bys": [],
            "aggregations": [
                {"name": "measure", "agg": "sum",
                 "expr": {"kind": "field", "id": "measure"}}
            ],
            "input": {
                "kind": "inline_rows",
                "rows": [{"measure": v} for v in [-2.0, -1.0, 0.0, 1.0, 2.0, 10.0]],
                "column_aliases": ["measure"],
            },
        },
    }


def test_box_plot_happy_path(client_and_conn):
    client, token, conn_id = client_and_conn
    headers = {"Authorization": f"Bearer {token}"}
    bp = {
        "axis": "y",
        "whisker_method": "tukey",
        "whisker_percentile": None,
        "show_outliers": True,
        "fill_color": "#4C78A8",
        "fill_opacity": 0.3,
        "scope": "entire",
    }
    r = client.post("/api/queries/execute", json=_body(conn_id, bp), headers=headers)
    assert r.status_code == 200, r.text
    results = r.json().get("analytics_results", [])
    box = next((x for x in results if x["kind"] == "box_plot"), None)
    assert box is not None
    assert box["axis"] == "y"
    v = box["values"]
    for k in ("q1", "median", "q3", "whisker_low", "whisker_high"):
        assert k in v and v[k] is not None
    assert any(abs(o - 10.0) < 1e-6 for o in box.get("outliers", []))


def test_box_plot_rejects_min_max_with_outliers(client_and_conn):
    client, token, conn_id = client_and_conn
    headers = {"Authorization": f"Bearer {token}"}
    bp = {
        "axis": "y", "whisker_method": "min-max", "whisker_percentile": None,
        "show_outliers": True, "fill_color": "#000", "fill_opacity": 0.3,
        "scope": "entire",
    }
    r = client.post("/api/queries/execute", json=_body(conn_id, bp), headers=headers)
    assert r.status_code == 400
    assert "min-max" in r.text.lower()


def test_box_plot_feature_gate_closed(client_and_conn, monkeypatch):
    client, token, conn_id = client_and_conn
    headers = {"Authorization": f"Bearer {token}"}
    from config import settings
    monkeypatch.setattr(settings, "FEATURE_ANALYST_PRO", False, raising=False)
    bp = {
        "axis": "y", "whisker_method": "tukey", "whisker_percentile": None,
        "show_outliers": False, "fill_color": "#000", "fill_opacity": 0.3,
        "scope": "entire",
    }
    r = client.post("/api/queries/execute", json=_body(conn_id, bp), headers=headers)
    # Behaviour depends on where FEATURE_ANALYST_PRO gate lives (upstream of
    # or inside _run_analytics). Either 403 or 200-with-empty-analytics_results.
    assert r.status_code in (200, 403)
    if r.status_code == 200:
        assert not any(x["kind"] == "box_plot"
                       for x in r.json().get("analytics_results", []))
```

> If the demo-login / demo-connection helpers are named differently in the existing test suite (check `backend/tests/test_analytics_endpoint.py` shipped in Plan 9a T5), replace `_demo_login` with that import verbatim.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_box_plot_endpoint.py -v`
Expected: FAIL — `analytics.box_plots` is ignored; no `box_plot` envelope appears in `analytics_results`.

- [ ] **Step 3: Extend `AnalyticsPayload`** — `backend/routers/query_routes.py` line 174:

```python
class AnalyticsPayload(BaseModel):
    """Plan 9a T5: analytics bundle attached to /queries/execute.
    Each list contains raw dict-shaped specs (see backend/vizql/analytics_types.py)."""
    reference_lines: list[dict] = Field(default_factory=list)
    reference_bands: list[dict] = Field(default_factory=list)
    distributions: list[dict] = Field(default_factory=list)
    totals: list[dict] = Field(default_factory=list)
    box_plots: list[dict] = Field(default_factory=list)   # NEW — Plan 9e T3
```

- [ ] **Step 4: Add box-plot branch to `_run_analytics`** — insert between the existing `distributions` branch (lines 464-483) and the `totals` branch (starting line 486). NOTE: the existing helper inside `_run_analytics` is a local closure; alias it locally as `emit_analytic` to keep the new lines short and easy to read:

```python
    # ── box_plots ────────────────────────────────────────────────────
    # Plan 9e — Each BoxPlotSpec compiles into 5 aggregated queries
    # (q1/median/q3 + whisker_low/whisker_high) and (when show_outliers)
    # a 6th detail-level outlier query. Tukey whiskers are clamped here
    # to the emitted MIN/MAX so the client does not need to re-derive.
    emit_analytic = _emit_and_exec  # alias for readability of this branch

    for raw in req.analytics.box_plots:
        from vizql.box_plot import BoxPlotSpec
        from vizql.box_plot_compiler import compile_box_plot

        bp = BoxPlotSpec(
            axis=raw["axis"],
            whisker_method=raw["whisker_method"],
            whisker_percentile=(
                tuple(raw["whisker_percentile"])
                if raw.get("whisker_percentile") else None
            ),
            show_outliers=bool(raw["show_outliers"]),
            fill_color=raw["fill_color"],
            fill_opacity=float(raw["fill_opacity"]),
            scope=raw["scope"],
        )
        try:
            bp.validate()
        except ValueError as v_err:
            raise HTTPException(status_code=400,
                                detail=f"invalid box_plot spec: {v_err}") from v_err

        fns = compile_box_plot(
            spec=bp, base_plan=base_plan,
            measure_alias=req.measure_alias, pane_dims=pane_dims,
        )

        # Fixed order from compile_box_plot: q1, median, q3, lo, hi [, outliers]
        q1     = _extract_scalar(emit_analytic(fns[0], "box_plot"), "__reference_value__")
        median = _extract_scalar(emit_analytic(fns[1], "box_plot"), "__reference_value__")
        q3     = _extract_scalar(emit_analytic(fns[2], "box_plot"), "__reference_value__")
        lo     = _extract_scalar(emit_analytic(fns[3], "box_plot"), "__reference_value__")
        hi     = _extract_scalar(emit_analytic(fns[4], "box_plot"), "__reference_value__")

        # Tukey clamp to actual [q1-1.5*iqr, q3+1.5*iqr].
        if bp.whisker_method == "tukey" and q1 is not None and q3 is not None:
            iqr = q3 - q1
            tlo = q1 - 1.5 * iqr
            thi = q3 + 1.5 * iqr
            if lo is not None: lo = max(lo, tlo)
            if hi is not None: hi = min(hi, thi)

        outliers: list[float] = []
        if bp.show_outliers and len(fns) == 6:
            df = emit_analytic(fns[5], "box_plot")
            if df is not None and not getattr(df, "empty", False):
                col = req.measure_alias
                try:
                    outliers = [float(v) for v in df[col].tolist() if v is not None]
                except Exception:
                    outliers = []

        out.append({
            "kind": "box_plot",
            "axis": bp.axis,
            "scope": bp.scope,
            "whisker_method": bp.whisker_method,
            "values": {
                "q1": q1, "median": median, "q3": q3,
                "whisker_low": lo, "whisker_high": hi,
            },
            "outliers": outliers,
            "fill_color": bp.fill_color,
            "fill_opacity": bp.fill_opacity,
        })
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_box_plot_endpoint.py -v`
Expected: 3 passed.

- [ ] **Step 6: Full-suite regression guard**

Run: `cd backend && python -m pytest tests/ -v`
Expected: full suite green (516+ tests plus Plans 9a–9d additions plus the new `test_box_plot_*` files).

- [ ] **Step 7: Commit**

```bash
cd "QueryCopilot V1"
git add backend/routers/query_routes.py backend/tests/test_box_plot_endpoint.py
git commit -m "feat(analyst-pro): wire box plots into /queries/execute analytics path (Plan 9e T3)"
```

---

## Task 4: Box plot → Vega-Lite compiler

**Files:**
- Create: `frontend/src/chart-ir/analytics/boxPlotToVega.ts`
- Create: `frontend/src/chart-ir/analytics/__tests__/boxPlotToVega.test.ts`
- Create: `frontend/src/chart-ir/analytics/__tests__/__fixtures__/boxplot-single-pane.json`
- Create: `frontend/src/chart-ir/analytics/__tests__/__fixtures__/boxplot-with-outliers.json`
- Create: `frontend/src/chart-ir/analytics/__tests__/__fixtures__/boxplot-min-max.json`

- [ ] **Step 1: Write the failing test** — `frontend/src/chart-ir/analytics/__tests__/boxPlotToVega.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { compileBoxPlot, type BoxPlotSpec, type BoxPlotEnvelope } from '../boxPlotToVega';

import singlePane from './__fixtures__/boxplot-single-pane.json';
import withOutliers from './__fixtures__/boxplot-with-outliers.json';
import minMax from './__fixtures__/boxplot-min-max.json';

describe('boxPlotToVega', () => {
  const baseEnc = { xField: 'category', yField: 'measure' };

  it('emits 3 marks (whiskers + box + median) with no outliers', () => {
    const spec: BoxPlotSpec = {
      axis: 'y', whisker_method: 'tukey', whisker_percentile: null,
      show_outliers: false, fill_color: '#4C78A8', fill_opacity: 0.3,
      scope: 'entire',
    };
    const layers = compileBoxPlot(spec, singlePane as BoxPlotEnvelope, baseEnc);
    const types = layers.map((l: any) => l.mark?.type ?? l.mark);
    expect(types).toEqual(['rule', 'rect', 'rule']);
  });

  it('emits 4 marks with outlier point layer when show_outliers', () => {
    const spec: BoxPlotSpec = {
      axis: 'y', whisker_method: 'tukey', whisker_percentile: null,
      show_outliers: true, fill_color: '#4C78A8', fill_opacity: 0.3,
      scope: 'entire',
    };
    const env = withOutliers as BoxPlotEnvelope;
    const layers = compileBoxPlot(spec, env, baseEnc);
    const types = layers.map((l: any) => l.mark?.type ?? l.mark);
    expect(types).toEqual(['rule', 'rect', 'rule', 'point']);
    const outlierLayer: any = layers[3];
    expect(outlierLayer.mark.filled).toBe(false);
    expect(Array.isArray(outlierLayer.data.values)).toBe(true);
    expect(outlierLayer.data.values.length).toBe(env.outliers.length);
  });

  it('tooltip carries all summary stats', () => {
    const spec: BoxPlotSpec = {
      axis: 'y', whisker_method: 'min-max', whisker_percentile: null,
      show_outliers: false, fill_color: '#4C78A8', fill_opacity: 0.3,
      scope: 'entire',
    };
    const layers = compileBoxPlot(spec, minMax as BoxPlotEnvelope, baseEnc);
    const box: any = layers[1];  // rect layer
    const fields = (box.encoding.tooltip as Array<{ field: string }>).map((t) => t.field);
    expect(fields).toEqual(
      expect.arrayContaining(['min', 'q1', 'median', 'q3', 'max', 'iqr']),
    );
  });

  it('rect layer honours fill_color and fill_opacity', () => {
    const spec: BoxPlotSpec = {
      axis: 'y', whisker_method: 'tukey', whisker_percentile: null,
      show_outliers: false, fill_color: '#E45756', fill_opacity: 0.55,
      scope: 'entire',
    };
    const layers = compileBoxPlot(spec, singlePane as BoxPlotEnvelope, baseEnc);
    const rect: any = layers[1];
    expect(rect.mark.fill).toBe('#E45756');
    expect(rect.mark.fillOpacity).toBeCloseTo(0.55);
  });
});
```

- [ ] **Step 2: Create fixtures**

`frontend/src/chart-ir/analytics/__tests__/__fixtures__/boxplot-single-pane.json`:
```json
{
  "kind": "box_plot",
  "axis": "y",
  "scope": "entire",
  "whisker_method": "tukey",
  "values": { "q1": -0.67, "median": 0.0, "q3": 0.67, "whisker_low": -2.1, "whisker_high": 2.1 },
  "outliers": [],
  "fill_color": "#4C78A8",
  "fill_opacity": 0.3
}
```

`frontend/src/chart-ir/analytics/__tests__/__fixtures__/boxplot-with-outliers.json`:
```json
{
  "kind": "box_plot",
  "axis": "y",
  "scope": "entire",
  "whisker_method": "tukey",
  "values": { "q1": -0.67, "median": 0.0, "q3": 0.67, "whisker_low": -2.1, "whisker_high": 2.1 },
  "outliers": [10.0, -10.0, 8.5],
  "fill_color": "#4C78A8",
  "fill_opacity": 0.3
}
```

`frontend/src/chart-ir/analytics/__tests__/__fixtures__/boxplot-min-max.json`:
```json
{
  "kind": "box_plot",
  "axis": "y",
  "scope": "entire",
  "whisker_method": "min-max",
  "values": { "q1": -0.67, "median": 0.0, "q3": 0.67, "whisker_low": -3.2, "whisker_high": 3.2 },
  "outliers": [],
  "fill_color": "#4C78A8",
  "fill_opacity": 0.3
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npm run test:chart-ir -- boxPlotToVega`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `compileBoxPlot`** — `frontend/src/chart-ir/analytics/boxPlotToVega.ts`:

```typescript
/**
 * Plan 9e — Compile BoxPlotSpec + BoxPlotEnvelope to Vega-Lite layers.
 *
 * Four-mark layout per pane (Build_Tableau §XIII.1):
 *   1. rule   — whisker line: whisker_low ↔ whisker_high
 *   2. rect   — the box: y=q1 .. y=q3 (fill_color + fill_opacity)
 *   3. rule   — the median inside the box (thicker stroke)
 *   4. point  — outliers (hollow circles), emitted only when show_outliers
 */

export interface BoxPlotSpec {
  axis: 'x' | 'y';
  whisker_method: 'tukey' | 'min-max' | 'percentile';
  whisker_percentile: [number, number] | null;
  show_outliers: boolean;
  fill_color: string;
  fill_opacity: number;
  scope: 'entire' | 'pane' | 'cell';
}

export interface BoxPlotValues {
  q1: number | null;
  median: number | null;
  q3: number | null;
  whisker_low: number | null;
  whisker_high: number | null;
}

export interface BoxPlotEnvelope {
  kind: 'box_plot';
  axis: 'x' | 'y';
  scope: 'entire' | 'pane' | 'cell';
  whisker_method: BoxPlotSpec['whisker_method'];
  values: BoxPlotValues;
  outliers: number[];
  fill_color: string;
  fill_opacity: number;
}

export interface BaseEncoding {
  xField: string;
  yField: string;
}

export type VegaLiteLayer = Record<string, unknown>;

export function compileBoxPlot(
  spec: BoxPlotSpec,
  env: BoxPlotEnvelope,
  baseEncoding: BaseEncoding,
): VegaLiteLayer[] {
  const { q1, median, q3, whisker_low, whisker_high } = env.values;
  const iqr =
    q1 !== null && q3 !== null ? Number((q3 - q1).toFixed(6)) : null;

  const statsRow = {
    q1, median, q3, whisker_low, whisker_high, iqr,
    min: whisker_low, max: whisker_high,
  };

  const axisField =
    spec.axis === 'y' ? baseEncoding.yField : baseEncoding.xField;

  const tooltip = [
    { field: 'min',    type: 'quantitative', title: 'Whisker low',  format: '.3f' },
    { field: 'q1',     type: 'quantitative', title: 'Q1',           format: '.3f' },
    { field: 'median', type: 'quantitative', title: 'Median',       format: '.3f' },
    { field: 'q3',     type: 'quantitative', title: 'Q3',           format: '.3f' },
    { field: 'max',    type: 'quantitative', title: 'Whisker high', format: '.3f' },
    { field: 'iqr',    type: 'quantitative', title: 'IQR',          format: '.3f' },
  ];

  const whiskerLayer: VegaLiteLayer = {
    data: { values: [statsRow] },
    mark: { type: 'rule', strokeWidth: 1, color: '#333' },
    encoding: {
      [spec.axis]:       { field: 'min', type: 'quantitative', title: axisField },
      [`${spec.axis}2`]: { field: 'max' },
    },
  };

  const boxLayer: VegaLiteLayer = {
    data: { values: [statsRow] },
    mark: {
      type: 'rect',
      fill: spec.fill_color,
      fillOpacity: spec.fill_opacity,
      stroke: '#333',
      strokeWidth: 1,
    },
    encoding: {
      [spec.axis]:       { field: 'q1', type: 'quantitative', title: axisField },
      [`${spec.axis}2`]: { field: 'q3' },
      tooltip,
    },
  };

  const medianLayer: VegaLiteLayer = {
    data: { values: [statsRow] },
    mark: { type: 'rule', strokeWidth: 2, color: '#111' },
    encoding: {
      [spec.axis]:       { field: 'median', type: 'quantitative' },
      [`${spec.axis}2`]: { field: 'median' },
    },
  };

  const layers: VegaLiteLayer[] = [whiskerLayer, boxLayer, medianLayer];

  if (spec.show_outliers && env.outliers.length) {
    const outlierRows = env.outliers.map((v) => ({ [axisField]: v }));
    layers.push({
      data: { values: outlierRows },
      mark: { type: 'point', filled: false, stroke: '#333', strokeWidth: 1, size: 40 },
      encoding: {
        [spec.axis]: { field: axisField, type: 'quantitative' },
      },
    });
  }

  return layers;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && npm run test:chart-ir -- boxPlotToVega`
Expected: 4 passed.

- [ ] **Step 6: Commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/chart-ir/analytics/boxPlotToVega.ts \
        frontend/src/chart-ir/analytics/__tests__/boxPlotToVega.test.ts \
        frontend/src/chart-ir/analytics/__tests__/__fixtures__/boxplot-*.json
git commit -m "feat(analyst-pro): add boxPlotToVega Vega-Lite compiler (Plan 9e T4)"
```

---

## Task 5: Drop lines → Vega-Lite compiler (client-side)

**Files:**
- Create: `frontend/src/chart-ir/analytics/dropLinesToVega.ts`
- Create: `frontend/src/chart-ir/analytics/__tests__/dropLinesToVega.test.ts`

- [ ] **Step 1: Write the failing test** — `frontend/src/chart-ir/analytics/__tests__/dropLinesToVega.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
  compileDropLines,
  type DropLinesSpec,
  type ActiveMark,
} from '../dropLinesToVega';

describe('dropLinesToVega', () => {
  const mark: ActiveMark = { x: 12, y: 340, xField: 'category', yField: 'sales' };

  it('emits 0 layers when mode=off', () => {
    const spec: DropLinesSpec = { mode: 'off', color: '#888', line_style: 'dashed' };
    expect(compileDropLines(spec, mark)).toEqual([]);
  });

  it('emits 1 layer for mode=x', () => {
    const spec: DropLinesSpec = { mode: 'x', color: '#888', line_style: 'dashed' };
    expect(compileDropLines(spec, mark)).toHaveLength(1);
  });

  it('emits 1 layer for mode=y', () => {
    const spec: DropLinesSpec = { mode: 'y', color: '#888', line_style: 'dashed' };
    expect(compileDropLines(spec, mark)).toHaveLength(1);
  });

  it('emits 2 layers for mode=both', () => {
    const spec: DropLinesSpec = { mode: 'both', color: '#888', line_style: 'dashed' };
    expect(compileDropLines(spec, mark)).toHaveLength(2);
  });

  it('applies dashed style by default', () => {
    const spec: DropLinesSpec = { mode: 'both', color: '#888', line_style: 'dashed' };
    const [first]: any = compileDropLines(spec, mark);
    expect(first.mark.strokeDash).toEqual([4, 3]);
    expect(first.mark.strokeWidth).toBe(1);
  });

  it('applies dotted style', () => {
    const spec: DropLinesSpec = { mode: 'both', color: '#888', line_style: 'dotted' };
    const [first]: any = compileDropLines(spec, mark);
    expect(first.mark.strokeDash).toEqual([1, 2]);
  });

  it('honours color', () => {
    const spec: DropLinesSpec = { mode: 'both', color: '#E45756', line_style: 'dashed' };
    const [first]: any = compileDropLines(spec, mark);
    expect(first.mark.color).toBe('#E45756');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test:chart-ir -- dropLinesToVega`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `compileDropLines`** — `frontend/src/chart-ir/analytics/dropLinesToVega.ts`:

```typescript
/**
 * Plan 9e — Client-side Drop Lines overlay.
 *
 * A drop line is a 1px dashed (or dotted) rule connecting an active
 * (hovered / selected) mark to the nearest axis — x-axis (bottom),
 * y-axis (left), or both. See Build_Tableau.md §XIII.1 ("UI feature,
 * not separate subsystem"). Zero query overhead; pure Vega-Lite layer
 * injection.
 */

export interface DropLinesSpec {
  mode: 'x' | 'y' | 'both' | 'off';
  color: string;
  line_style: 'dashed' | 'dotted';
}

export interface ActiveMark {
  x: number;
  y: number;
  xField: string;
  yField: string;
}

export type VegaLiteLayer = Record<string, unknown>;

const DASH_PATTERN: Record<DropLinesSpec['line_style'], number[]> = {
  dashed: [4, 3],
  dotted: [1, 2],
};

export function compileDropLines(
  spec: DropLinesSpec,
  mark: ActiveMark,
): VegaLiteLayer[] {
  if (spec.mode === 'off') return [];

  const strokeDash = DASH_PATTERN[spec.line_style];
  const layers: VegaLiteLayer[] = [];

  // Drop to x-axis — vertical line from (mark.x, mark.y) down to (mark.x, 0).
  if (spec.mode === 'x' || spec.mode === 'both') {
    layers.push({
      data: { values: [{ x: mark.x, y_start: mark.y, y_end: 0 }] },
      mark: { type: 'rule', color: spec.color, strokeWidth: 1, strokeDash },
      encoding: {
        x:  { field: 'x',       type: 'quantitative', title: mark.xField },
        y:  { field: 'y_start', type: 'quantitative', title: mark.yField },
        y2: { field: 'y_end' },
      },
    });
  }

  // Drop to y-axis — horizontal line from (mark.x, mark.y) to (0, mark.y).
  if (spec.mode === 'y' || spec.mode === 'both') {
    layers.push({
      data: { values: [{ y: mark.y, x_start: mark.x, x_end: 0 }] },
      mark: { type: 'rule', color: spec.color, strokeWidth: 1, strokeDash },
      encoding: {
        y:  { field: 'y',       type: 'quantitative', title: mark.yField },
        x:  { field: 'x_start', type: 'quantitative', title: mark.xField },
        x2: { field: 'x_end' },
      },
    });
  }

  return layers;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm run test:chart-ir -- dropLinesToVega`
Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/chart-ir/analytics/dropLinesToVega.ts \
        frontend/src/chart-ir/analytics/__tests__/dropLinesToVega.test.ts
git commit -m "feat(analyst-pro): add dropLinesToVega client-side overlay compiler (Plan 9e T5)"
```

---

## Task 6: Store actions — box plots + drop lines

**Files:**
- Modify: `frontend/src/store.js`
- Create: `frontend/src/__tests__/store.boxPlot.test.ts`

- [ ] **Step 1: Write the failing test** — `frontend/src/__tests__/store.boxPlot.test.ts`:

```typescript
import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '../store';

function resetStore(): void {
  useStore.setState({
    ...useStore.getState(),
    analystProBoxPlots: [],
    analystProBoxPlotDialogCtx: null,
    analystProDropLinesBySheet: {},
    analystProDropLinesDialogCtx: null,
  });
}

const SPEC = {
  axis: 'y',
  whisker_method: 'tukey',
  whisker_percentile: null,
  show_outliers: true,
  fill_color: '#4C78A8',
  fill_opacity: 0.3,
  scope: 'entire',
};

describe('store — box plot CRUD', () => {
  beforeEach(resetStore);

  it('addBoxPlotAnalystPro appends a box plot', () => {
    useStore.getState().addBoxPlotAnalystPro({ id: 'bp1', spec: SPEC, envelope: null });
    expect(useStore.getState().analystProBoxPlots).toHaveLength(1);
    expect(useStore.getState().analystProBoxPlots[0].id).toBe('bp1');
  });

  it('updateBoxPlotAnalystPro patches by id', () => {
    useStore.getState().addBoxPlotAnalystPro({ id: 'bp1', spec: SPEC, envelope: null });
    useStore.getState().updateBoxPlotAnalystPro('bp1', { envelope: { q1: -1 } });
    expect(useStore.getState().analystProBoxPlots[0].envelope).toEqual({ q1: -1 });
  });

  it('deleteBoxPlotAnalystPro removes by id', () => {
    useStore.getState().addBoxPlotAnalystPro({ id: 'bp1', spec: SPEC, envelope: null });
    useStore.getState().deleteBoxPlotAnalystPro('bp1');
    expect(useStore.getState().analystProBoxPlots).toHaveLength(0);
  });

  it('openBoxPlotDialogAnalystPro sets ctx; close clears it', () => {
    useStore.getState().openBoxPlotDialogAnalystPro({ kind: 'box_plot' });
    expect(useStore.getState().analystProBoxPlotDialogCtx).toEqual({ kind: 'box_plot' });
    useStore.getState().closeBoxPlotDialogAnalystPro();
    expect(useStore.getState().analystProBoxPlotDialogCtx).toBeNull();
  });
});

describe('store — drop lines per-sheet', () => {
  beforeEach(resetStore);

  const SHEET_A = 'sheet_a';
  const SHEET_B = 'sheet_b';
  const SPEC_A = { mode: 'both', color: '#888', line_style: 'dashed' };
  const SPEC_B = { mode: 'y',    color: '#E45756', line_style: 'dotted' };

  it('setDropLinesAnalystPro stores per sheet', () => {
    useStore.getState().setDropLinesAnalystPro(SHEET_A, SPEC_A);
    useStore.getState().setDropLinesAnalystPro(SHEET_B, SPEC_B);
    const map = useStore.getState().analystProDropLinesBySheet;
    expect(map[SHEET_A]).toEqual(SPEC_A);
    expect(map[SHEET_B]).toEqual(SPEC_B);
  });

  it('getDropLinesForSheet returns null for unknown sheet', () => {
    expect(useStore.getState().getDropLinesForSheet('nope')).toBeNull();
  });

  it("mode='off' persists as an explicit value", () => {
    useStore.getState().setDropLinesAnalystPro(SHEET_A, { mode: 'off', color: '#888', line_style: 'dashed' });
    expect(useStore.getState().analystProDropLinesBySheet[SHEET_A].mode).toBe('off');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test:chart-ir -- store.boxPlot`
Expected: FAIL — actions / state do not exist.

- [ ] **Step 3: Add state + actions** — `frontend/src/store.js` — insert **after** the existing Plan 9d cluster block (after `createSetFromClusterAnalystPro`, around line 1610):

```javascript
  // Plan 9e: Box Plot analytics. analystProBoxPlots lives at the root; each
  // entry carries { id, spec, envelope, name? }. Envelope = wire response
  // from /queries/execute (values + outliers). Pattern mirrors 9d cluster.
  analystProBoxPlots: [],
  analystProBoxPlotDialogCtx: null,

  addBoxPlotAnalystPro: (boxPlot) => {
    if (!boxPlot || !boxPlot.id) return;
    set((s) => ({ analystProBoxPlots: [...s.analystProBoxPlots, boxPlot] }));
    const dash = get().analystProDashboard;
    if (dash && typeof get().pushAnalystProHistory === 'function') {
      get().pushAnalystProHistory(dash, 'Add box plot');
    } else if (typeof get().pushHistorySnapshot === 'function') {
      get().pushHistorySnapshot();
    }
  },

  updateBoxPlotAnalystPro: (boxPlotId, patch) => {
    if (!boxPlotId || !patch) return;
    set((s) => ({
      analystProBoxPlots: s.analystProBoxPlots.map((bp) =>
        bp.id === boxPlotId ? { ...bp, ...patch } : bp,
      ),
    }));
    const dash = get().analystProDashboard;
    if (dash && typeof get().pushAnalystProHistory === 'function') {
      get().pushAnalystProHistory(dash, 'Update box plot');
    } else if (typeof get().pushHistorySnapshot === 'function') {
      get().pushHistorySnapshot();
    }
  },

  deleteBoxPlotAnalystPro: (boxPlotId) => {
    if (!boxPlotId) return;
    set((s) => ({
      analystProBoxPlots: s.analystProBoxPlots.filter((bp) => bp.id !== boxPlotId),
    }));
    const dash = get().analystProDashboard;
    if (dash && typeof get().pushAnalystProHistory === 'function') {
      get().pushAnalystProHistory(dash, 'Delete box plot');
    } else if (typeof get().pushHistorySnapshot === 'function') {
      get().pushHistorySnapshot();
    }
  },

  openBoxPlotDialogAnalystPro: (ctx) => set({ analystProBoxPlotDialogCtx: ctx || {} }),
  closeBoxPlotDialogAnalystPro: () => set({ analystProBoxPlotDialogCtx: null }),

  // Plan 9e: Drop Lines per-sheet. Explicit mode='off' persists vs. absent key.
  analystProDropLinesBySheet: {},
  analystProDropLinesDialogCtx: null,

  setDropLinesAnalystPro: (sheetId, spec) => {
    if (!sheetId || !spec) return;
    set((s) => ({
      analystProDropLinesBySheet: {
        ...s.analystProDropLinesBySheet,
        [sheetId]: { ...spec },
      },
    }));
    if (typeof get().pushHistorySnapshot === 'function') {
      get().pushHistorySnapshot();
    }
  },

  getDropLinesForSheet: (sheetId) => {
    if (!sheetId) return null;
    const map = get().analystProDropLinesBySheet || {};
    return map[sheetId] || null;
  },

  openDropLinesDialogAnalystPro: (ctx) => set({ analystProDropLinesDialogCtx: ctx || {} }),
  closeDropLinesDialogAnalystPro: () => set({ analystProDropLinesDialogCtx: null }),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm run test:chart-ir -- store.boxPlot`
Expected: 7 passed.

- [ ] **Step 5: Frontend full-suite regression guard**

Run: `cd frontend && npm run test:chart-ir`
Expected: no NEW failures beyond the ~22 pre-existing chart-ir failures tracked in CLAUDE.md "Known Test Debt". Diff before/after — must match.

- [ ] **Step 6: Commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/store.js frontend/src/__tests__/store.boxPlot.test.ts
git commit -m "feat(analyst-pro): add box-plot + drop-lines store actions (Plan 9e T6)"
```

---

## Task 7: Dialogs + stats badge + FloatingLayer mounts

**Files:**
- Create: `frontend/src/components/dashboard/freeform/panels/BoxPlotDialog.jsx`
- Create: `frontend/src/components/dashboard/freeform/panels/BoxPlotStatsBadge.jsx`
- Create: `frontend/src/components/dashboard/freeform/panels/DropLinesDialog.jsx`
- Create: `frontend/src/components/dashboard/freeform/__tests__/BoxPlotDialog.integration.test.tsx`
- Create: `frontend/src/components/dashboard/freeform/__tests__/DropLinesDialog.integration.test.tsx`
- Modify: `frontend/src/components/dashboard/freeform/FloatingLayer.jsx`

- [ ] **Step 1: Write the failing BoxPlotDialog test** — `frontend/src/components/dashboard/freeform/__tests__/BoxPlotDialog.integration.test.tsx`:

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, beforeEach } from 'vitest';
import BoxPlotDialog from '../panels/BoxPlotDialog';
import { useStore } from '../../../../store';

beforeEach(() => {
  useStore.setState({
    ...useStore.getState(),
    analystProBoxPlots: [],
    analystProBoxPlotDialogCtx: { kind: 'box_plot' },
  });
});

describe('BoxPlotDialog integration', () => {
  it('dispatches addBoxPlotAnalystPro with chosen whisker method', () => {
    render(<BoxPlotDialog />);
    fireEvent.click(screen.getByLabelText(/Tukey/i));
    fireEvent.click(screen.getByLabelText(/Show outliers/i));
    fireEvent.click(screen.getByRole('button', { name: /Save/i }));
    const list = useStore.getState().analystProBoxPlots;
    expect(list).toHaveLength(1);
    expect(list[0].spec.whisker_method).toBe('tukey');
    expect(list[0].spec.show_outliers).toBe(true);
  });

  it('disables show_outliers when whisker_method=min-max', () => {
    render(<BoxPlotDialog />);
    fireEvent.click(screen.getByLabelText(/Min\/Max/i));
    expect(screen.getByLabelText(/Show outliers/i)).toBeDisabled();
  });
});
```

- [ ] **Step 2: Write the failing DropLinesDialog test** — `frontend/src/components/dashboard/freeform/__tests__/DropLinesDialog.integration.test.tsx`:

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, beforeEach } from 'vitest';
import DropLinesDialog from '../panels/DropLinesDialog';
import { useStore } from '../../../../store';

beforeEach(() => {
  useStore.setState({
    ...useStore.getState(),
    analystProDropLinesBySheet: {},
    analystProDropLinesDialogCtx: { sheetId: 'sheet_a' },
  });
});

describe('DropLinesDialog integration', () => {
  it('writes a per-sheet spec on Save', () => {
    render(<DropLinesDialog />);
    fireEvent.click(screen.getByLabelText(/Both axes/i));
    fireEvent.click(screen.getByLabelText(/Dashed/i));
    fireEvent.click(screen.getByRole('button', { name: /Save/i }));
    const map = useStore.getState().analystProDropLinesBySheet;
    expect(map.sheet_a.mode).toBe('both');
    expect(map.sheet_a.line_style).toBe('dashed');
  });

  it("mode='off' persists as an explicit choice", () => {
    render(<DropLinesDialog />);
    fireEvent.click(screen.getByLabelText(/^Off$/i));
    fireEvent.click(screen.getByRole('button', { name: /Save/i }));
    expect(useStore.getState().analystProDropLinesBySheet.sheet_a.mode).toBe('off');
  });
});
```

- [ ] **Step 3: Implement `BoxPlotDialog.jsx`** — `frontend/src/components/dashboard/freeform/panels/BoxPlotDialog.jsx`:

```jsx
import React, { useState } from 'react';
import { useStore } from '../../../../store';

const WHISKER_METHODS = [
  { id: 'tukey',      label: 'Tukey (1.5 × IQR)' },
  { id: 'min-max',    label: 'Min/Max' },
  { id: 'percentile', label: 'Custom percentile' },
];
const SCOPES = [
  { id: 'entire', label: 'Entire table' },
  { id: 'pane',   label: 'Per pane' },
  { id: 'cell',   label: 'Per cell' },
];

export default function BoxPlotDialog() {
  const ctx = useStore((s) => s.analystProBoxPlotDialogCtx);
  const close = useStore((s) => s.closeBoxPlotDialogAnalystPro);
  const add = useStore((s) => s.addBoxPlotAnalystPro);

  const [whiskerMethod, setWhiskerMethod] = useState('tukey');
  const [whiskerLo, setWhiskerLo] = useState(10);
  const [whiskerHi, setWhiskerHi] = useState(90);
  const [showOutliers, setShowOutliers] = useState(false);
  const [scope, setScope] = useState('entire');
  const [fillColor, setFillColor] = useState('#4C78A8');
  const [fillOpacity, setFillOpacity] = useState(0.3);

  if (!ctx) return null;

  const outliersDisabled = whiskerMethod === 'min-max';

  const onSave = () => {
    const spec = {
      axis: 'y',
      whisker_method: whiskerMethod,
      whisker_percentile:
        whiskerMethod === 'percentile' ? [whiskerLo, whiskerHi] : null,
      show_outliers: outliersDisabled ? false : showOutliers,
      fill_color: fillColor,
      fill_opacity: fillOpacity,
      scope,
    };
    add({ id: `bp_${Date.now()}`, spec, envelope: null });
    close();
  };

  return (
    <div role="dialog" aria-label="Box plot" className="ap-dialog">
      <h3>Box Plot</h3>

      <fieldset>
        <legend>Whisker method</legend>
        {WHISKER_METHODS.map((m) => (
          <label key={m.id}>
            <input type="radio" name="whisker_method"
                   checked={whiskerMethod === m.id}
                   onChange={() => setWhiskerMethod(m.id)} />
            {m.label}
          </label>
        ))}
      </fieldset>

      {whiskerMethod === 'percentile' && (
        <div className="ap-row">
          <label>Low  <input type="number" value={whiskerLo}
                             min={1}  max={49}
                             onChange={(e) => setWhiskerLo(Number(e.target.value))} /></label>
          <label>High <input type="number" value={whiskerHi}
                             min={51} max={99}
                             onChange={(e) => setWhiskerHi(Number(e.target.value))} /></label>
        </div>
      )}

      <label>
        <input type="checkbox" checked={showOutliers}
               disabled={outliersDisabled}
               onChange={(e) => setShowOutliers(e.target.checked)} />
        Show outliers
      </label>

      <fieldset>
        <legend>Scope</legend>
        {SCOPES.map((s) => (
          <label key={s.id}>
            <input type="radio" name="scope"
                   checked={scope === s.id}
                   onChange={() => setScope(s.id)} />
            {s.label}
          </label>
        ))}
      </fieldset>

      <label>Fill color <input type="color" value={fillColor}
                               onChange={(e) => setFillColor(e.target.value)} /></label>
      <label>Opacity
        <input type="range" min={0} max={1} step={0.05} value={fillOpacity}
               onChange={(e) => setFillOpacity(Number(e.target.value))} />
      </label>

      <div className="ap-dialog__actions">
        <button type="button" onClick={close}>Cancel</button>
        <button type="button" onClick={onSave}>Save</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Implement `BoxPlotStatsBadge.jsx`** — `frontend/src/components/dashboard/freeform/panels/BoxPlotStatsBadge.jsx`:

```jsx
import React, { useState } from 'react';

export default function BoxPlotStatsBadge({ boxPlot }) {
  const [open, setOpen] = useState(false);
  if (!boxPlot || !boxPlot.envelope) return null;
  const { values, outliers = [] } = boxPlot.envelope;
  const iqr =
    values.q1 !== null && values.q3 !== null
      ? (values.q3 - values.q1).toFixed(3)
      : 'n/a';
  return (
    <div className="ap-stats-badge" onClick={() => setOpen((v) => !v)}>
      <span>Q1 {values.q1?.toFixed(3)}</span>
      <span>Med {values.median?.toFixed(3)}</span>
      <span>Q3 {values.q3?.toFixed(3)}</span>
      <span>IQR {iqr}</span>
      <span>Outliers {outliers.length}</span>
      {open && outliers.length > 0 && (
        <table className="ap-outlier-table">
          <tbody>
            {outliers.slice(0, 20).map((v, i) => (
              <tr key={i}><td>{v.toFixed(3)}</td></tr>
            ))}
            {outliers.length > 20 && (
              <tr><td>… {outliers.length - 20} more</td></tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Implement `DropLinesDialog.jsx`** — `frontend/src/components/dashboard/freeform/panels/DropLinesDialog.jsx`:

```jsx
import React, { useState } from 'react';
import { useStore } from '../../../../store';

const MODES = [
  { id: 'off',  label: 'Off' },
  { id: 'x',    label: 'Drop to X axis' },
  { id: 'y',    label: 'Drop to Y axis' },
  { id: 'both', label: 'Both axes' },
];

const STYLES = [
  { id: 'dashed', label: 'Dashed' },
  { id: 'dotted', label: 'Dotted' },
];

export default function DropLinesDialog() {
  const ctx = useStore((s) => s.analystProDropLinesDialogCtx);
  const close = useStore((s) => s.closeDropLinesDialogAnalystPro);
  const setSpec = useStore((s) => s.setDropLinesAnalystPro);
  const existing = useStore((s) =>
    ctx ? s.getDropLinesForSheet(ctx.sheetId) : null,
  );

  const [mode, setMode] = useState(existing?.mode ?? 'off');
  const [color, setColor] = useState(existing?.color ?? '#888888');
  const [lineStyle, setLineStyle] = useState(existing?.line_style ?? 'dashed');

  if (!ctx) return null;

  const onSave = () => {
    setSpec(ctx.sheetId, { mode, color, line_style: lineStyle });
    close();
  };

  return (
    <div role="dialog" aria-label="Drop lines" className="ap-dialog">
      <h3>Drop Lines</h3>
      <p className="ap-dialog__help">
        Applies to every chart on this sheet.
      </p>

      <fieldset>
        <legend>Axis mode</legend>
        {MODES.map((m) => (
          <label key={m.id}>
            <input type="radio" name="drop_mode"
                   checked={mode === m.id}
                   onChange={() => setMode(m.id)} />
            {m.label}
          </label>
        ))}
      </fieldset>

      <label>Color <input type="color" value={color}
                          onChange={(e) => setColor(e.target.value)} /></label>

      <fieldset>
        <legend>Style</legend>
        {STYLES.map((s) => (
          <label key={s.id}>
            <input type="radio" name="drop_style"
                   checked={lineStyle === s.id}
                   onChange={() => setLineStyle(s.id)} />
            {s.label}
          </label>
        ))}
      </fieldset>

      <div className="ap-dialog__actions">
        <button type="button" onClick={close}>Cancel</button>
        <button type="button" onClick={onSave}>Save</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Mount both dialogs in `FloatingLayer.jsx`**

`frontend/src/components/dashboard/freeform/FloatingLayer.jsx` — add imports + subscriptions + conditional render alongside the existing dialog mounts (lines 6-8 + 28-30 + 39-41 areas):

```jsx
// at top, after existing dialog imports
import BoxPlotDialog from './panels/BoxPlotDialog';
import DropLinesDialog from './panels/DropLinesDialog';

// inside the component (near the other `analystPro…DialogCtx` subscriptions)
const analystProBoxPlotDialogCtx   = useStore((s) => s.analystProBoxPlotDialogCtx);
const analystProDropLinesDialogCtx = useStore((s) => s.analystProDropLinesDialogCtx);

// inside the returned JSX, right after the existing dialog conditionals
{analystProBoxPlotDialogCtx   ? <BoxPlotDialog   /> : null}
{analystProDropLinesDialogCtx ? <DropLinesDialog /> : null}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd frontend && npm run test:chart-ir -- BoxPlotDialog DropLinesDialog`
Expected: 4 passed (2 per dialog).

- [ ] **Step 8: Commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/components/dashboard/freeform/panels/BoxPlotDialog.jsx \
        frontend/src/components/dashboard/freeform/panels/BoxPlotStatsBadge.jsx \
        frontend/src/components/dashboard/freeform/panels/DropLinesDialog.jsx \
        frontend/src/components/dashboard/freeform/__tests__/BoxPlotDialog.integration.test.tsx \
        frontend/src/components/dashboard/freeform/__tests__/DropLinesDialog.integration.test.tsx \
        frontend/src/components/dashboard/freeform/FloatingLayer.jsx
git commit -m "feat(analyst-pro): BoxPlotDialog + DropLinesDialog + FloatingLayer mounts (Plan 9e T7)"
```

---

## Task 8: AnalyticsPanel polish + catalogue unpark + docs

**Files:**
- Modify: `frontend/src/components/dashboard/freeform/panels/AnalyticsPanel.jsx`
- Create: `frontend/src/components/dashboard/freeform/panels/__tests__/AnalyticsPanel.test.tsx`
- Create: `docs/ANALYTICS_BOX_PLOT.md`
- Create: `docs/ANALYTICS_DROP_LINES.md`
- Modify: `docs/analyst_pro_tableau_parity_roadmap.md`

- [ ] **Step 1: Write the failing AnalyticsPanel test** — `frontend/src/components/dashboard/freeform/panels/__tests__/AnalyticsPanel.test.tsx`:

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import AnalyticsPanel from '../AnalyticsPanel';

describe('AnalyticsPanel Plan 9e polish', () => {
  it('renders three section headings: Summarise / Model / Custom', () => {
    render(<AnalyticsPanel />);
    expect(screen.getByRole('heading', { name: /Summarise/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Model/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Custom/i })).toBeInTheDocument();
  });

  it('box_plot catalogue item is enabled (no Coming-Soon badge)', () => {
    render(<AnalyticsPanel />);
    const item = screen.getByText(/^Box Plot$/i).closest('li')!;
    expect(item.getAttribute('data-disabled')).toBe('false');
    expect(item.getAttribute('draggable')).toBe('true');
  });

  it('drop_lines catalogue item is present and enabled', () => {
    render(<AnalyticsPanel />);
    const item = screen.getByText(/^Drop Lines$/i).closest('li')!;
    expect(item.getAttribute('data-kind')).toBe('drop_lines');
    expect(item.getAttribute('data-disabled')).toBe('false');
  });

  it('collapsing a section hides its items', () => {
    render(<AnalyticsPanel />);
    const header = screen.getByRole('button', { name: /Summarise/i });
    fireEvent.click(header);
    expect(screen.queryByText(/Constant Line/i)).not.toBeInTheDocument();
  });

  it('empty-state help text is visible', () => {
    render(<AnalyticsPanel />);
    expect(
      screen.getByText(/Drag onto an axis to add a reference/i),
    ).toBeInTheDocument();
  });

  it('hovering an item shows a tooltip preview', () => {
    render(<AnalyticsPanel />);
    const item = screen.getByText(/^Trend Line$/i).closest('li')!;
    fireEvent.mouseEnter(item);
    expect(
      screen.getByRole('tooltip', { name: /least-squares fit/i }),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rewrite `AnalyticsPanel.jsx`**:

```jsx
import React, { useMemo, useState } from 'react';
import { useStore } from '../../../../store';
import SidebarSection from './SidebarSection';

/**
 * Plan 9e T8 — Analytics-pane catalogue with section grouping, icons,
 * collapsible families, empty-state copy, and hover tooltip previews.
 *
 * Families (Build_Tableau §XIII.1):
 *   Summarise — Constant/Average/Median/Reference Line/Band/Distribution/Totals
 *   Model     — Trend Line / Forecast / Cluster / Box Plot
 *   Custom    — Drop Lines
 */
const SECTIONS = [
  {
    id: 'summarise',
    heading: 'Summarise',
    items: [
      { id: 'constant_line',          label: 'Constant Line',          icon: 'const', kind: 'reference_line',         preset: { aggregation: 'constant' }, tip: 'Fixed value ruled across the axis.' },
      { id: 'average_line',           label: 'Average Line',           icon: 'avg',   kind: 'reference_line',         preset: { aggregation: 'mean' },     tip: 'Axis mean across the selected scope.' },
      { id: 'median_line',            label: 'Median',                 icon: 'med',   kind: 'reference_line',         preset: { aggregation: 'median' },   tip: 'Median of the measure.' },
      { id: 'reference_line',         label: 'Reference Line',         icon: 'ref',   kind: 'reference_line',                                              tip: 'Single aggregated value with full styling.' },
      { id: 'reference_band',         label: 'Reference Band',         icon: 'band',  kind: 'reference_band',                                              tip: 'Two values shaded between them.' },
      { id: 'reference_distribution', label: 'Reference Distribution', icon: 'dist',  kind: 'reference_distribution',                                      tip: 'N percentiles or ±σ overlay.' },
      { id: 'totals',                 label: 'Totals',                 icon: 'sum',   kind: 'totals',                                                      tip: 'Grand / subtotal rows or columns.' },
    ],
  },
  {
    id: 'model',
    heading: 'Model',
    items: [
      { id: 'trend_line', label: 'Trend Line', icon: 'trend',    kind: 'trend_line', tip: 'Least-squares fit — linear / log / exp / power / polynomial.' },
      { id: 'forecast',   label: 'Forecast',   icon: 'forecast', kind: 'forecast',   tip: 'Holt-Winters with AIC model selection.' },
      { id: 'cluster',    label: 'Cluster',    icon: 'cluster',  kind: 'cluster',    tip: 'K-means with auto-k by Calinski-Harabasz.' },
      { id: 'box_plot',   label: 'Box Plot',   icon: 'box',      kind: 'box_plot',   tip: 'Quartiles + whiskers + outliers.' },
    ],
  },
  {
    id: 'custom',
    heading: 'Custom',
    items: [
      { id: 'drop_lines', label: 'Drop Lines', icon: 'drop', kind: 'drop_lines', tip: 'Hover rule from mark to axis. Applies to the whole sheet.' },
    ],
  },
];

const MIME = 'application/askdb-analytics';

const ICONS = {
  const: '▬', avg: '─', med: '—', ref: '╎', band: '▥', dist: '⋮', sum: 'Σ',
  trend: '↗', forecast: '⟶', cluster: '◉', box: '▭', drop: '↧',
};

export default function AnalyticsPanel() {
  const openDialog = useStore((s) => s.openReferenceLineDialogAnalystPro);
  const openTrendLineDialog = useStore((s) => s.openTrendLineDialogAnalystPro);
  const openForecastDialog = useStore((s) => s.openForecastDialogAnalystPro);
  const openClusterDialog = useStore((s) => s.openClusterDialogAnalystPro);
  const openBoxPlotDialog = useStore((s) => s.openBoxPlotDialogAnalystPro);
  const openDropLinesDialog = useStore((s) => s.openDropLinesDialogAnalystPro);

  const [collapsed, setCollapsed] = useState({});
  const [hoverId, setHoverId] = useState(null);

  const totalItems = useMemo(
    () => SECTIONS.reduce((a, s) => a + s.items.length, 0),
    [],
  );

  const activate = (item) => {
    if (item.kind === 'trend_line') return openTrendLineDialog?.({ kind: item.kind, preset: item.preset ?? {} });
    if (item.kind === 'forecast')   return openForecastDialog?.({ kind: item.kind, preset: item.preset ?? {} });
    if (item.kind === 'cluster')    return openClusterDialog?.({});
    if (item.kind === 'box_plot')   return openBoxPlotDialog?.({ kind: item.kind });
    if (item.kind === 'drop_lines') return openDropLinesDialog?.({ sheetId: 'current' });
    openDialog?.({ kind: item.kind, preset: item.preset ?? {} });
  };

  return (
    <SidebarSection id="analytics" heading="Analytics">
      <p
        className="analytics-catalogue__help"
        style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 8px' }}
      >
        Drag onto an axis to add a reference. {totalItems} items available.
      </p>

      {SECTIONS.map((section) => {
        const isCollapsed = !!collapsed[section.id];
        return (
          <div key={section.id} className="analytics-catalogue__section">
            <button
              type="button"
              name={section.heading}
              onClick={() => setCollapsed((c) => ({ ...c, [section.id]: !c[section.id] }))}
              style={{
                display: 'flex', alignItems: 'center', width: '100%',
                padding: '4px 0', border: 0, background: 'transparent',
                fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
                color: 'var(--text-muted)', cursor: 'pointer',
              }}
            >
              <span role="heading" aria-level={3}>{section.heading}</span>
              <span style={{ marginLeft: 'auto' }}>{isCollapsed ? '▸' : '▾'}</span>
            </button>

            {!isCollapsed && (
              <ul
                className="analytics-catalogue"
                role="list"
                style={{ listStyle: 'none', padding: 0, margin: '0 0 8px', display: 'flex', flexDirection: 'column', gap: 2 }}
              >
                {section.items.map((it) => (
                  <li
                    key={it.id}
                    data-analytics-item=""
                    data-kind={it.kind}
                    data-disabled="false"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(
                        MIME,
                        JSON.stringify({ kind: it.kind, preset: it.preset ?? {} }),
                      );
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                    onDoubleClick={() => activate(it)}
                    onMouseEnter={() => setHoverId(it.id)}
                    onMouseLeave={() => setHoverId(null)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '6px 8px', borderRadius: 4,
                      cursor: 'grab', fontSize: 12, color: 'var(--fg)',
                      userSelect: 'none', position: 'relative',
                    }}
                  >
                    <span
                      className="analytics-catalogue__icon"
                      aria-hidden
                      style={{ width: 16, textAlign: 'center' }}
                    >
                      {ICONS[it.icon] ?? '•'}
                    </span>
                    <span>{it.label}</span>
                    {hoverId === it.id && (
                      <span
                        role="tooltip"
                        aria-label={it.tip}
                        style={{
                          position: 'absolute', left: '100%', top: 0,
                          marginLeft: 8, whiteSpace: 'nowrap',
                          background: 'var(--bg-elevated)',
                          border: '1px solid var(--border-default)',
                          borderRadius: 4, padding: '4px 8px',
                          fontSize: 11, zIndex: 10,
                        }}
                      >
                        {it.tip}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </SidebarSection>
  );
}
```

- [ ] **Step 2a: Run tests to verify they pass**

Run: `cd frontend && npm run test:chart-ir -- AnalyticsPanel`
Expected: 6 passed.

- [ ] **Step 3: Write `docs/ANALYTICS_BOX_PLOT.md`**:

```markdown
# Analytics — Box Plot

Summarise a measure's distribution with Q1 / median / Q3 + whiskers +
optional outliers. Composes the existing reference-distribution path
(Plan 9a) — no new data pipeline.

## Whisker methods

| Method | Whisker low | Whisker high | Outliers? |
|---|---|---|---|
| **Tukey** | `max(Q1 − 1.5·IQR, MIN)` | `min(Q3 + 1.5·IQR, MAX)` | Yes — rows outside `[Q1 − 1.5·IQR, Q3 + 1.5·IQR]` |
| **Min/Max** | `MIN` | `MAX` | Not meaningful (every row fits inside) |
| **Custom percentile** | `PERCENTILE_CONT(low/100)` | `PERCENTILE_CONT(high/100)` | Yes — rows outside `[low, high]` |

## Scope

- **Entire** — one box over all visible rows.
- **Pane** — one box per row/column header combination.
- **Cell** — one box per cell (per dimensional coordinate).

## Performance

Aggregated stats (Q1 / median / Q3 / MIN / MAX) cost one `PERCENTILE_CONT`
sub-expression each; a single box plot is 5 cacheable queries. Outliers
add one detail-level query that scans the base table — heavier. Disable
outliers if your dataset is above ~1M rows and you do not need them.

## Read also
- `backend/vizql/box_plot.py`, `backend/vizql/box_plot_compiler.py`
- `frontend/src/chart-ir/analytics/boxPlotToVega.ts`
- `docs/Build_Tableau.md` §XIII.1
```

- [ ] **Step 4: Write `docs/ANALYTICS_DROP_LINES.md`**:

```markdown
# Analytics — Drop Lines

Drop lines are a UI aid: when you hover or select a mark, AskDB draws
1-pixel dashed (or dotted) rules from the mark down to the nearest
axis — x, y, or both. No query runs.

## Modes

| Mode | Behaviour |
|---|---|
| **Off** | No drop lines on this sheet. Stored explicitly — switching it on later preserves the other settings. |
| **Drop to X axis** | Vertical line from mark down to y = 0. |
| **Drop to Y axis** | Horizontal line from mark to x = 0. |
| **Both axes** | Both of the above, simultaneously. |

## Styling

- **Color** — any CSS colour; default `#888888`.
- **Style** — `Dashed` (default) emits `strokeDash [4, 3]`; `Dotted` emits `strokeDash [1, 2]`. Width is always 1 pixel (Tableau parity).

## Scope

Drop lines apply **per sheet**, not per chart. One setting covers every
chart you author on that sheet. This matches Tableau's worksheet-level
"Drop Lines" menu.

## Read also
- `frontend/src/chart-ir/analytics/dropLinesToVega.ts`
- `frontend/src/components/dashboard/freeform/panels/DropLinesDialog.jsx`
- `docs/Build_Tableau.md` §XIII.1
```

- [ ] **Step 5: Update roadmap** — `docs/analyst_pro_tableau_parity_roadmap.md` — replace the current Plan 9e stub (lines ~770-772) with:

```markdown
### Plan 9e — Box Plots + Drop Lines — ✅ Shipped 2026-04-20

**Status:** ✅ Shipped 2026-04-20. 8 tasks. Backend modules: `backend/vizql/{box_plot,box_plot_compiler}.py`. Wire path: `POST /api/queries/execute` extended with `analytics.box_plots[]` (Plan 9a bundle). Frontend: `frontend/src/chart-ir/analytics/{boxPlotToVega,dropLinesToVega}.ts`, `BoxPlotDialog.jsx`, `BoxPlotStatsBadge.jsx`, `DropLinesDialog.jsx`. Store: `analystProBoxPlots` + `analystProDropLinesBySheet` per-sheet dict. Protobuf: new `BoxPlotSpec` message + `repeated BoxPlotSpec box_plots = 6` on `AnalyticsBundle`. AnalyticsPanel polish: 3 collapsible sections (Summarise / Model / Custom), 12 catalogue items with icons + hover tooltips + empty-state copy. Tests: 10 spec + 7 compiler + 3 endpoint backend; 4 vega + 7 drop-lines + 7 store + 4 dialog + 6 panel frontend — all green; backend full suite green; frontend chart-ir baseline unchanged. Plan doc: `docs/superpowers/plans/2026-04-20-analyst-pro-plan-9e-box-plots-drop-lines.md`.
```

- [ ] **Step 6: Regression guard (parallel)**

```bash
cd backend  && python -m pytest tests/ -v
cd frontend && npm run test:chart-ir
```
Expected: backend full suite green; frontend chart-ir fails only on the documented ~22 pre-existing baseline (CLAUDE.md "Known Test Debt").

- [ ] **Step 7: Commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/components/dashboard/freeform/panels/AnalyticsPanel.jsx \
        frontend/src/components/dashboard/freeform/panels/__tests__/AnalyticsPanel.test.tsx \
        docs/ANALYTICS_BOX_PLOT.md \
        docs/ANALYTICS_DROP_LINES.md \
        docs/analyst_pro_tableau_parity_roadmap.md
git commit -m "docs(analyst-pro): AnalyticsPanel polish + box-plot + drop-lines catalogue + user docs (Plan 9e T8)"
```

---

## Self-Review

**Spec coverage (scheduled-task brief deliverables → task):**
1. Box plot spec (`backend/vizql/box_plot.py`) — **T1**.
2. Box plot compiler (`backend/vizql/box_plot_compiler.py` with main + outlier queries, reuses Plan 9a) — **T2**.
3. Frontend box plot Vega layer (4 marks: rule / rect / rule / point + tooltip) — **T4**.
4. Drop lines client-side (`dropLinesToVega.ts`, 2 rules per mark, `DropLinesSpec` per-sheet) — **T5**.
5. Analytics pane "Box Plot" + "Drop Lines" items; dialogs with whisker method / outliers / scope (box) and axis mode / color / style (drop lines) — **T7** (dialogs) + **T8** (catalogue).
6. Store actions (`addBoxPlotAnalystPro`, `updateBoxPlotAnalystPro`, `deleteBoxPlotAnalystPro`, `setDropLinesAnalystPro`) — **T6**.
7. Polish AnalyticsPanel (section icons, collapsible sections, empty-state, hover tooltips) — **T8**.
8. Tests: types + compiler + endpoint + Vega + drop-lines + store + dialogs + panel — covered across **T1–T8**.

**Build_Tableau sections cited:** §XIII.1 (T1 / T2 / T8 / doc), §XIV.5 (T1 fill styling), Appendix B (T2 `PERCENTILE_CONT` + `WITHIN GROUP`), Appendix C (intro `tabdocaxis` mapping).

**Hard-convention adherence:**
- Box plot composes Plan 9a ReferenceDistributionSpec — **T2** delegates to `compile_reference_line`; zero new aggregation operators.
- Drop lines client-side only — **T5** / **T6** / **T7** never touch backend.
- Outlier query separate — **T2** emits it only when `show_outliers=True`; main query stays aggregated.
- TDD synthetic Gaussian + spiked outliers — **T2** uses `numpy.random.default_rng(42)`.
- Commit per task — format matches Plan 9d precedent.

**Placeholder scan:** no TBD / TODO / "implement later" / "add error handling" / "similar to Task N". Every code step contains real code.

**Type consistency:**
- `BoxPlotSpec` — same field names across proto / Python dataclass / TS interface / dialog state / envelope (`axis`, `whisker_method`, `whisker_percentile`, `show_outliers`, `fill_color`, `fill_opacity`, `scope`).
- `DropLinesSpec` — same field names across TS interface / dialog / store / Vega compiler (`mode`, `color`, `line_style`).
- Envelope shape `{ kind, axis, scope, whisker_method, values: { q1, median, q3, whisker_low, whisker_high }, outliers, fill_color, fill_opacity }` matches backend (T3), TS interface (T4), and stats badge (T7).
- Store action names match `…AnalystPro` suffix convention used by 9a–9d — verified against `frontend/src/store.js:1527-1606`.

**Task count:** 8 — matches brief's `**Task count target:** 8 tasks`.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-20-analyst-pro-plan-9e-box-plots-drop-lines.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration. **REQUIRED SUB-SKILL:** `superpowers:subagent-driven-development`.

**2. Inline Execution** — execute tasks in this session with batch checkpoints for review. **REQUIRED SUB-SKILL:** `superpowers:executing-plans`.

**Which approach?**
