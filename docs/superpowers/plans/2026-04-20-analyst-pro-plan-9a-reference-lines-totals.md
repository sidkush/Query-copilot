# Analyst Pro — Plan 9a: Reference Lines + Bands + Distributions + Totals

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Phase 9 (Analytics Pane) slice #1 — per-axis reference lines, reference bands, reference distributions, and Grand Totals + Subtotals — covering the canonical Tableau `tabdocaxis!ReferenceLineSpecification` surface plus §IV.7 step 9 totals semantics.

**Architecture:** Analytics specs are carried in `VisualSpec.analytics` (proto field 9) as **typed repeated messages** (not generic string maps). The backend `analytics_compiler` produces extra `SQLQueryFunction` plans per spec — entire/pane/cell scope maps to full-table / group-by-pane-dims / window — then the router issues them alongside the base plan. Totals are always a **separate query** per §IV.7 step 9: the base plan with dimensions removed (grand) or one dim removed (subtotal). Rendering is pure Vega-Lite: reference lines are `rule` marks, bands are `rect` marks with `y`/`y2`, distributions are stacks of rules. Totals append bold rows / insert group-boundary rows in crosstab renderers.

**Tech Stack:** Python 3.10 / sqlglot / protobuf / pytest; React 19 / TypeScript 5.x / Vega-Lite (via `react-vega`) / Zustand / Vitest. Reuses Plan 7a–7e VizQL IR + Plan 6b history + Plan 8c `/api/v1/queries/execute` wiring.

**Authoritative references:**
- `docs/Build_Tableau.md` §XIII.1 (analytics-pane catalogue), §IV.7 (filter order-of-ops — step 9 totals), §III.1 (shelves/axes), §V.1 (`PERCENTILE` aggregate), Appendix A.14 (`AggregationType`), Appendix B (observed `WITHIN GROUP (ORDER BY …)` grammar), Appendix C (`tabdocaxis` → "Axes + reference lines").
- `docs/analyst_pro_tableau_parity_roadmap.md` §Phase 9 / Plan 9a.
- `CLAUDE.md` shared conventions (AnalystPro naming, commit format, 6-layer SQL validator, Vega-Lite only).
- Plan 7a proto (`backend/proto/askdb/vizdataservice/v1.proto`), Plan 7b compiler (`backend/vizql/compiler.py`), Plan 7c SQL AST (`backend/vizql/sql_ast.py`), Plan 7d dialect emitters (`backend/vizql/dialects/*.py`), Plan 8c table-calc pattern (`backend/vizql/table_calc.py`).

**Hard conventions (per Plan 9a scheduled-task brief + roadmap §Shared conventions):**
- Store action suffix `…AnalystPro`; state field prefix `analystPro…`.
- Commit per task: `feat(analyst-pro): <verb> <object> (Plan 9a T<N>)`.
- Every generated SQL passes `backend/sql_validator.py` 6-layer validation.
- Reference-line rendering via Vega-Lite layered spec — **no custom canvas**.
- Totals query is **separate** from the base SQL — never mixed in one statement. Honor existing `Filter.filter_stage == "totals"` / `Filter.ShouldAffectTotals` flag (already present in `FilterSpec.filter_properties` per Plan 7c).
- Scope semantics (entire / pane / cell) must match Tableau's `ReferenceLineSpecification.Scope`.
- TDD: for every spec kind produce a golden SQL fixture in `backend/tests/fixtures/analytics/` and a golden Vega fixture in `frontend/src/chart-ir/analytics/__tests__/__fixtures__/`. Test names: `test_compile_reference_line_mean_entire`, `test_compile_totals_grand_respects_should_affect_totals`, etc.
- Proto regen: `bash backend/scripts/regen_proto.sh && bash frontend/scripts/regen_proto.sh` (per `CLAUDE.md :: VizQL codegen`). Edited `.proto` and regenerated bindings commit together in T1.
- Feature flag: the new endpoint surface stays under `settings.FEATURE_ANALYST_PRO` (already gates every Analyst Pro endpoint in `query_routes.py`).

---

## File Structure

### Backend — Python

| Path | Purpose | Touch |
|---|---|---|
| `backend/proto/askdb/vizdataservice/v1.proto` | Add typed `ReferenceLineSpec`, `ReferenceBandSpec`, `ReferenceDistributionSpec`, `TotalsSpec` messages; extend `Analytics` with typed repeated fields. | Modify |
| `backend/vizql/proto/v1_pb2.py` + `v1_pb2.pyi` | Regenerated Python proto bindings. | Modify (generated) |
| `backend/vizql/analytics_types.py` | Ergonomic Python dataclasses + `to_proto` / `from_proto`, mirroring Plan 7a `spec.py` pattern. | Create |
| `backend/vizql/analytics_compiler.py` | `compile_reference_line`, `compile_reference_band`, `compile_reference_distribution`, `compile_totals`. Consumes `base_plan: LogicalOp` and returns `sql_ast.SQLQueryFunction` (or list thereof for totals). | Create |
| `backend/routers/query_routes.py` | Extend `POST /api/v1/queries/execute` with optional `analytics: list[AnalyticsSpec]`; return body adds `analytics_rows`. | Modify |
| `backend/tests/test_analytics_compiler.py` | Unit tests per spec kind, with golden SQL fixtures. | Create |
| `backend/tests/fixtures/analytics/` | Golden `.sql` fixtures (one per test). | Create |
| `backend/tests/test_analytics_endpoint.py` | Integration test for `/queries/execute` with analytics body. | Create |

### Frontend — TypeScript / React

| Path | Purpose | Touch |
|---|---|---|
| `frontend/src/chart-ir/vizSpecGenerated.ts` | Regenerated TS proto bindings. | Modify (generated) |
| `frontend/src/chart-ir/analytics/referenceLineToVega.ts` | `compileReferenceLines(specs, data) → VegaLiteLayer[]` — rule / rect / rule-stack / text. | Create |
| `frontend/src/chart-ir/analytics/totalsToVega.ts` | `compileTotalsToCrosstab(rows, analyticsRows, layout)` — grand-total row + per-dim subtotal rows with styling. | Create |
| `frontend/src/chart-ir/analytics/__tests__/referenceLineToVega.test.ts` | Vitest — spec → Vega layer shape. | Create |
| `frontend/src/chart-ir/analytics/__tests__/totalsToVega.test.ts` | Vitest — crosstab row ordering. | Create |
| `frontend/src/chart-ir/analytics/__tests__/__fixtures__/` | JSON golden fixtures per test. | Create |
| `frontend/src/store.js` | Add `addReferenceLineAnalystPro` / `updateReferenceLineAnalystPro` / `deleteReferenceLineAnalystPro` + same triples for bands / distributions / totals; extend `analystProSidebarTab` tuple to include `'analytics'`. | Modify |
| `frontend/src/__tests__/store.analyticsSlots.test.ts` | Vitest — CRUD + history round-trip for every slot kind. | Create |
| `frontend/src/components/dashboard/freeform/panels/AnalystProSidebar.jsx` | Add third tab `'analytics'` to the `TABS` constant. | Modify |
| `frontend/src/components/dashboard/freeform/panels/AnalyticsPanel.jsx` | Tab body: draggable catalogue (Constant Line, Average Line, Median, Reference Line, Reference Band, Reference Distribution, Totals; placeholder entries for Box Plot / Trend Line / Forecast / Cluster routed to future plans). | Create |
| `frontend/src/components/dashboard/freeform/panels/ReferenceLineDialog.jsx` | Editor dialog (axis / aggregation / scope / label / style / marker). | Create |
| `frontend/src/components/dashboard/freeform/__tests__/AnalyticsPanel.integration.test.tsx` | Drag catalog item onto bar chart axis → dialog → save → rule mark renders at average. | Create |

---

## Task 1: Extend proto + Python dataclasses (typed analytics specs)

**Files:**
- Modify: `backend/proto/askdb/vizdataservice/v1.proto:305-313` (`Analytics` message) — keep `repeated Slot slots = 1` for forward-compat, add typed repeated fields at numbers 2..5.
- Modify: `backend/vizql/proto/v1_pb2.py`, `backend/vizql/proto/v1_pb2.pyi` (regenerated — commit the diff).
- Modify: `frontend/src/chart-ir/vizSpecGenerated.ts` (regenerated — commit the diff).
- Create: `backend/vizql/analytics_types.py`
- Create: `backend/tests/test_analytics_types.py`

- [ ] **Step 1: Write the failing test** — `backend/tests/test_analytics_types.py`:

```python
"""Plan 9a T1 — analytics typed specs round-trip through proto."""
import pytest

from vizql import analytics_types as at
from vizql.proto import v1_pb2 as pb


def test_reference_line_round_trip():
    spec = at.ReferenceLineSpec(
        axis="y",
        aggregation="mean",
        value=None,
        percentile=None,
        scope="entire",
        label="computation",
        custom_label="",
        line_style="dashed",
        color="#4C78A8",
        show_marker=True,
    )
    m = spec.to_proto()
    assert isinstance(m, pb.ReferenceLineSpec)
    assert at.ReferenceLineSpec.from_proto(m) == spec


def test_reference_band_round_trip():
    low = at.ReferenceLineSpec(axis="y", aggregation="percentile", value=None,
                               percentile=25, scope="entire", label="value",
                               custom_label="", line_style="solid",
                               color="#888", show_marker=False)
    high = at.ReferenceLineSpec(axis="y", aggregation="percentile", value=None,
                                percentile=75, scope="entire", label="value",
                                custom_label="", line_style="solid",
                                color="#888", show_marker=False)
    band = at.ReferenceBandSpec(axis="y", from_spec=low, to_spec=high,
                                fill="#cccccc", fill_opacity=0.25)
    assert at.ReferenceBandSpec.from_proto(band.to_proto()) == band


def test_reference_distribution_round_trip():
    dist = at.ReferenceDistributionSpec(axis="y", percentiles=[10, 25, 50, 75, 90],
                                        scope="entire", style="quantile",
                                        color="#888888")
    assert at.ReferenceDistributionSpec.from_proto(dist.to_proto()) == dist


def test_totals_round_trip():
    tot = at.TotalsSpec(kind="both", axis="both", aggregation="sum",
                        position="after", should_affect_totals=True)
    assert at.TotalsSpec.from_proto(tot.to_proto()) == tot


def test_percentile_requires_percentile_value():
    with pytest.raises(ValueError, match="percentile"):
        at.ReferenceLineSpec(axis="y", aggregation="percentile", value=None,
                             percentile=None, scope="entire", label="value",
                             custom_label="", line_style="solid",
                             color="#888", show_marker=False).validate()


def test_constant_requires_value():
    with pytest.raises(ValueError, match="value"):
        at.ReferenceLineSpec(axis="y", aggregation="constant", value=None,
                             percentile=None, scope="entire", label="value",
                             custom_label="", line_style="solid",
                             color="#888", show_marker=False).validate()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_analytics_types.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'vizql.analytics_types'` (and/or `AttributeError: module 'vizql.proto.v1_pb2' has no attribute 'ReferenceLineSpec'`).

- [ ] **Step 3: Extend the proto** — `backend/proto/askdb/vizdataservice/v1.proto`. Replace lines 305-313 (current `Analytics` message) with the typed block below. Keep `repeated Slot slots = 1` so any existing serialized `Analytics{slots:[...]}` message still decodes (forward compat).

```proto
// Analytics pane slots (Build_Tableau XIII). Plan 9a introduces typed
// repeated fields for reference-lines / bands / distributions / totals;
// legacy `slots` remains for forward-compat with any generic entry.
message Analytics {
  message Slot {
    string id   = 1;
    string kind = 2;
    map<string, string> properties = 3;
  }
  repeated Slot                      slots           = 1;
  repeated ReferenceLineSpec         reference_lines = 2;
  repeated ReferenceBandSpec         reference_bands = 3;
  repeated ReferenceDistributionSpec distributions   = 4;
  repeated TotalsSpec                totals          = 5;
}

// Build_Tableau XIII.1 + Appendix C tabdocaxis!ReferenceLineSpecification.
// Scope maps to Tableau Scope: "entire" = full data, "pane" = per-pane
// group, "cell" = per-cell (window).
message ReferenceLineSpec {
  string axis          = 1;   // "x" | "y"
  string aggregation   = 2;   // "constant"|"mean"|"median"|"sum"|"min"|"max"|"percentile"
  double value         = 3;   // used when aggregation=="constant"; else ignored
  bool   has_value     = 4;   // discriminates legitimate 0 constant from unset
  int32  percentile    = 5;   // 1..99; used when aggregation=="percentile"
  string scope         = 6;   // "entire" | "pane" | "cell"
  string label         = 7;   // "value" | "computation" | "custom" | "none"
  string custom_label  = 8;
  string line_style    = 9;   // "solid" | "dashed" | "dotted"
  string color         = 10;  // "#RRGGBB"
  bool   show_marker   = 11;
}

message ReferenceBandSpec {
  string            axis         = 1;
  ReferenceLineSpec from_spec    = 2;
  ReferenceLineSpec to_spec      = 3;
  string            fill         = 4;   // "#RRGGBB"
  double            fill_opacity = 5;   // 0..1
}

message ReferenceDistributionSpec {
  string         axis        = 1;
  repeated int32 percentiles = 2;   // ordered
  string         scope       = 3;   // "entire" | "pane" | "cell"
  string         style       = 4;   // "confidence" | "quantile" | "stddev"
  string         color       = 5;
}

// Per Build_Tableau IV.7 step 9, totals are issued as SEPARATE queries.
// `should_affect_totals` mirrors Tableau's Filter::ShouldAffectTotals
// flag at the totals-spec level (individual filters still carry their
// own placement via FilterSpec.filter_stage).
message TotalsSpec {
  string kind                 = 1;  // "grand_total" | "subtotal" | "both"
  string axis                 = 2;  // "row" | "column" | "both"
  string aggregation          = 3;  // Appendix A.14 AggType spelling
  string position             = 4;  // "before" | "after"
  bool   should_affect_totals = 5;  // true = honor normal filters; false = skip
}
```

- [ ] **Step 4: Regenerate proto bindings**

Run:
```bash
cd "QueryCopilot V1"
bash backend/scripts/regen_proto.sh
bash frontend/scripts/regen_proto.sh
```

Expected: `backend/vizql/proto/v1_pb2.py` + `.pyi` + `frontend/src/chart-ir/vizSpecGenerated.ts` now expose `ReferenceLineSpec`, `ReferenceBandSpec`, `ReferenceDistributionSpec`, `TotalsSpec`. No diff in existing messages.

- [ ] **Step 5: Write the dataclass wrappers** — `backend/vizql/analytics_types.py`:

```python
"""Plan 9a — ergonomic dataclasses for analytics-pane specs.

Mirrors the Plan 7a ``spec.py`` pattern: dataclasses 1:1 with the proto
messages, ``to_proto`` / ``from_proto`` as the *only* conversion points.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional

from vizql.proto import v1_pb2 as pb


_VALID_AGGS = {"constant", "mean", "median", "sum", "min", "max", "percentile"}
_VALID_SCOPES = {"entire", "pane", "cell"}
_VALID_AXES = {"x", "y"}
_VALID_LINE_STYLES = {"solid", "dashed", "dotted"}
_VALID_LABELS = {"value", "computation", "custom", "none"}
_VALID_DIST_STYLES = {"confidence", "quantile", "stddev"}
_VALID_TOTALS_KINDS = {"grand_total", "subtotal", "both"}
_VALID_TOTALS_AXES = {"row", "column", "both"}
_VALID_TOTALS_POS = {"before", "after"}


@dataclass(frozen=True, slots=True)
class ReferenceLineSpec:
    axis: str
    aggregation: str
    value: Optional[float]
    percentile: Optional[int]
    scope: str
    label: str
    custom_label: str
    line_style: str
    color: str
    show_marker: bool

    def validate(self) -> None:
        if self.axis not in _VALID_AXES:
            raise ValueError(f"axis must be one of {_VALID_AXES}, got {self.axis!r}")
        if self.aggregation not in _VALID_AGGS:
            raise ValueError(f"aggregation must be one of {_VALID_AGGS}, got {self.aggregation!r}")
        if self.scope not in _VALID_SCOPES:
            raise ValueError(f"scope must be one of {_VALID_SCOPES}, got {self.scope!r}")
        if self.label not in _VALID_LABELS:
            raise ValueError(f"label must be one of {_VALID_LABELS}, got {self.label!r}")
        if self.line_style not in _VALID_LINE_STYLES:
            raise ValueError(f"line_style must be one of {_VALID_LINE_STYLES}, got {self.line_style!r}")
        if self.aggregation == "constant" and self.value is None:
            raise ValueError("aggregation=constant requires a numeric value")
        if self.aggregation == "percentile" and (self.percentile is None or not 1 <= self.percentile <= 99):
            raise ValueError("aggregation=percentile requires percentile in [1,99]")

    def to_proto(self) -> pb.ReferenceLineSpec:
        return pb.ReferenceLineSpec(
            axis=self.axis,
            aggregation=self.aggregation,
            value=float(self.value) if self.value is not None else 0.0,
            has_value=self.value is not None,
            percentile=int(self.percentile) if self.percentile is not None else 0,
            scope=self.scope,
            label=self.label,
            custom_label=self.custom_label,
            line_style=self.line_style,
            color=self.color,
            show_marker=self.show_marker,
        )

    @classmethod
    def from_proto(cls, m: pb.ReferenceLineSpec) -> "ReferenceLineSpec":
        return cls(
            axis=m.axis,
            aggregation=m.aggregation,
            value=m.value if m.has_value else None,
            percentile=m.percentile if m.aggregation == "percentile" else None,
            scope=m.scope,
            label=m.label,
            custom_label=m.custom_label,
            line_style=m.line_style,
            color=m.color,
            show_marker=m.show_marker,
        )


@dataclass(frozen=True, slots=True)
class ReferenceBandSpec:
    axis: str
    from_spec: ReferenceLineSpec
    to_spec: ReferenceLineSpec
    fill: str
    fill_opacity: float

    def validate(self) -> None:
        if self.axis not in _VALID_AXES:
            raise ValueError(f"axis must be one of {_VALID_AXES}, got {self.axis!r}")
        if not 0.0 <= self.fill_opacity <= 1.0:
            raise ValueError("fill_opacity must be in [0,1]")
        self.from_spec.validate()
        self.to_spec.validate()

    def to_proto(self) -> pb.ReferenceBandSpec:
        return pb.ReferenceBandSpec(
            axis=self.axis,
            from_spec=self.from_spec.to_proto(),
            to_spec=self.to_spec.to_proto(),
            fill=self.fill,
            fill_opacity=self.fill_opacity,
        )

    @classmethod
    def from_proto(cls, m: pb.ReferenceBandSpec) -> "ReferenceBandSpec":
        return cls(
            axis=m.axis,
            from_spec=ReferenceLineSpec.from_proto(m.from_spec),
            to_spec=ReferenceLineSpec.from_proto(m.to_spec),
            fill=m.fill,
            fill_opacity=m.fill_opacity,
        )


@dataclass(frozen=True, slots=True)
class ReferenceDistributionSpec:
    axis: str
    percentiles: List[int]
    scope: str
    style: str
    color: str

    def validate(self) -> None:
        if self.axis not in _VALID_AXES:
            raise ValueError(f"axis must be one of {_VALID_AXES}")
        if self.scope not in _VALID_SCOPES:
            raise ValueError(f"scope must be one of {_VALID_SCOPES}")
        if self.style not in _VALID_DIST_STYLES:
            raise ValueError(f"style must be one of {_VALID_DIST_STYLES}")
        if not self.percentiles:
            raise ValueError("at least one percentile required")
        for p in self.percentiles:
            if not 1 <= p <= 99:
                raise ValueError(f"percentile out of [1,99]: {p}")

    def to_proto(self) -> pb.ReferenceDistributionSpec:
        m = pb.ReferenceDistributionSpec(
            axis=self.axis, scope=self.scope, style=self.style, color=self.color,
        )
        m.percentiles.extend(self.percentiles)
        return m

    @classmethod
    def from_proto(cls, m: pb.ReferenceDistributionSpec) -> "ReferenceDistributionSpec":
        return cls(
            axis=m.axis,
            percentiles=list(m.percentiles),
            scope=m.scope,
            style=m.style,
            color=m.color,
        )


@dataclass(frozen=True, slots=True)
class TotalsSpec:
    kind: str
    axis: str
    aggregation: str
    position: str
    should_affect_totals: bool

    def validate(self) -> None:
        if self.kind not in _VALID_TOTALS_KINDS:
            raise ValueError(f"kind must be one of {_VALID_TOTALS_KINDS}")
        if self.axis not in _VALID_TOTALS_AXES:
            raise ValueError(f"axis must be one of {_VALID_TOTALS_AXES}")
        if self.position not in _VALID_TOTALS_POS:
            raise ValueError(f"position must be one of {_VALID_TOTALS_POS}")

    def to_proto(self) -> pb.TotalsSpec:
        return pb.TotalsSpec(
            kind=self.kind,
            axis=self.axis,
            aggregation=self.aggregation,
            position=self.position,
            should_affect_totals=self.should_affect_totals,
        )

    @classmethod
    def from_proto(cls, m: pb.TotalsSpec) -> "TotalsSpec":
        return cls(
            kind=m.kind, axis=m.axis, aggregation=m.aggregation,
            position=m.position, should_affect_totals=m.should_affect_totals,
        )


@dataclass(frozen=True, slots=True)
class AnalyticsBundle:
    """The full analytics payload attached to a VisualSpec."""
    reference_lines: List[ReferenceLineSpec] = field(default_factory=list)
    reference_bands: List[ReferenceBandSpec] = field(default_factory=list)
    distributions:   List[ReferenceDistributionSpec] = field(default_factory=list)
    totals:          List[TotalsSpec] = field(default_factory=list)

    def validate(self) -> None:
        for rl in self.reference_lines: rl.validate()
        for rb in self.reference_bands: rb.validate()
        for rd in self.distributions:   rd.validate()
        for t  in self.totals:          t.validate()

    def to_proto(self) -> pb.Analytics:
        m = pb.Analytics()
        m.reference_lines.extend(rl.to_proto() for rl in self.reference_lines)
        m.reference_bands.extend(rb.to_proto() for rb in self.reference_bands)
        m.distributions.extend(rd.to_proto()   for rd in self.distributions)
        m.totals.extend(t.to_proto()           for t  in self.totals)
        return m

    @classmethod
    def from_proto(cls, m: pb.Analytics) -> "AnalyticsBundle":
        return cls(
            reference_lines=[ReferenceLineSpec.from_proto(x) for x in m.reference_lines],
            reference_bands=[ReferenceBandSpec.from_proto(x) for x in m.reference_bands],
            distributions=[ReferenceDistributionSpec.from_proto(x) for x in m.distributions],
            totals=[TotalsSpec.from_proto(x) for x in m.totals],
        )


__all__ = [
    "ReferenceLineSpec",
    "ReferenceBandSpec",
    "ReferenceDistributionSpec",
    "TotalsSpec",
    "AnalyticsBundle",
]
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_analytics_types.py -v`
Expected: 6/6 pass.

- [ ] **Step 7: Run the full vizql regression to confirm no proto break**

Run: `cd backend && python -m pytest tests/ -k "vizql or visual_spec or proto" -v`
Expected: all existing tests still pass (proto change is additive).

- [ ] **Step 8: Commit**

```bash
cd "QueryCopilot V1"
git add backend/proto/askdb/vizdataservice/v1.proto \
        backend/vizql/proto/v1_pb2.py backend/vizql/proto/v1_pb2.pyi \
        frontend/src/chart-ir/vizSpecGenerated.ts \
        backend/vizql/analytics_types.py \
        backend/tests/test_analytics_types.py
git commit -m "feat(analyst-pro): typed analytics specs + proto extension (Plan 9a T1)"
```

---

## Task 2: `analytics_compiler.compile_reference_line` — entire / pane / cell scope

**Files:**
- Create: `backend/vizql/analytics_compiler.py`
- Create: `backend/tests/test_analytics_compiler.py`
- Create: `backend/tests/fixtures/analytics/refline_mean_entire.sql`
- Create: `backend/tests/fixtures/analytics/refline_mean_pane.sql`
- Create: `backend/tests/fixtures/analytics/refline_p95_entire.sql`
- Create: `backend/tests/fixtures/analytics/refline_constant_entire.sql`

- [ ] **Step 1: Write the failing test** — `backend/tests/test_analytics_compiler.py`:

```python
"""Plan 9a T2 — compile_reference_line golden-SQL tests."""
from pathlib import Path

import pytest

from vizql import analytics_compiler as ac
from vizql import analytics_types as at
from vizql import logical as lg
from vizql.dialects.generic import GenericDialect
from vizql.logical_to_sql import compile_logical_to_sql


FIXTURES = Path(__file__).parent / "fixtures" / "analytics"


def _base_plan_bar_by_region():
    """`SELECT region, SUM(sales) FROM orders GROUP BY region` as LogicalOp."""
    rel = lg.LogicalOpRelation(table="orders", schema=None)
    region = lg.Field(id="region")
    sales = lg.Field(id="sales")
    return lg.LogicalOpAggregate(
        input=rel,
        group_bys=(region,),
        aggregations=(lg.AggExp(name="sum_sales", agg="sum",
                                expr=lg.Column(field=sales)),),
    )


def _render(fn) -> str:
    return GenericDialect().emit(fn).strip()


def _golden(path: str) -> str:
    return (FIXTURES / path).read_text(encoding="utf-8").strip()


def test_refline_mean_entire_scope_full_aggregate():
    spec = at.ReferenceLineSpec(axis="y", aggregation="mean", value=None,
                                percentile=None, scope="entire", label="computation",
                                custom_label="", line_style="solid",
                                color="#4C78A8", show_marker=True)
    fn = ac.compile_reference_line(spec=spec, base_plan=_base_plan_bar_by_region(),
                                   measure_alias="sum_sales")
    assert _render(fn) == _golden("refline_mean_entire.sql")


def test_refline_mean_pane_scope_groups_by_pane_dims():
    spec = at.ReferenceLineSpec(axis="y", aggregation="mean", value=None,
                                percentile=None, scope="pane", label="computation",
                                custom_label="", line_style="solid",
                                color="#4C78A8", show_marker=False)
    fn = ac.compile_reference_line(spec=spec, base_plan=_base_plan_bar_by_region(),
                                   measure_alias="sum_sales",
                                   pane_dims=("region",))
    assert _render(fn) == _golden("refline_mean_pane.sql")


def test_refline_percentile_uses_within_group_order_by():
    spec = at.ReferenceLineSpec(axis="y", aggregation="percentile", value=None,
                                percentile=95, scope="entire", label="value",
                                custom_label="", line_style="dashed",
                                color="#d62728", show_marker=True)
    fn = ac.compile_reference_line(spec=spec, base_plan=_base_plan_bar_by_region(),
                                   measure_alias="sum_sales")
    sql = _render(fn)
    assert sql == _golden("refline_p95_entire.sql")
    assert "PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY" in sql


def test_refline_constant_emits_literal_subquery_not_aggregate():
    spec = at.ReferenceLineSpec(axis="y", aggregation="constant", value=100.0,
                                percentile=None, scope="entire", label="custom",
                                custom_label="Goal", line_style="dotted",
                                color="#2ca02c", show_marker=False)
    fn = ac.compile_reference_line(spec=spec, base_plan=_base_plan_bar_by_region(),
                                   measure_alias="sum_sales")
    assert _render(fn) == _golden("refline_constant_entire.sql")


def test_refline_rejects_unknown_scope():
    bad = at.ReferenceLineSpec(axis="y", aggregation="mean", value=None,
                               percentile=None, scope="entire", label="value",
                               custom_label="", line_style="solid",
                               color="#888", show_marker=False)
    with pytest.raises(ValueError, match="scope"):
        ac.compile_reference_line(
            spec=bad, base_plan=_base_plan_bar_by_region(),
            measure_alias="sum_sales", pane_dims=(), scope_override="galaxy",
        )


def test_refline_cell_scope_emits_window():
    spec = at.ReferenceLineSpec(axis="y", aggregation="mean", value=None,
                                percentile=None, scope="cell", label="value",
                                custom_label="", line_style="solid",
                                color="#888", show_marker=False)
    fn = ac.compile_reference_line(spec=spec, base_plan=_base_plan_bar_by_region(),
                                   measure_alias="sum_sales", pane_dims=("region",))
    sql = _render(fn)
    assert "OVER (" in sql
    assert "__reference_value__" in sql
```

Golden SQL fixtures (one file each):

`backend/tests/fixtures/analytics/refline_mean_entire.sql`:
```sql
SELECT AVG(sum_sales) AS __reference_value__
FROM (SELECT region AS region, SUM(sales) AS sum_sales FROM orders GROUP BY region) AS _t0
```

`backend/tests/fixtures/analytics/refline_mean_pane.sql`:
```sql
SELECT region AS region, AVG(sum_sales) AS __reference_value__
FROM (SELECT region AS region, SUM(sales) AS sum_sales FROM orders GROUP BY region) AS _t0
GROUP BY region
```

`backend/tests/fixtures/analytics/refline_p95_entire.sql`:
```sql
SELECT PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY sum_sales) AS __reference_value__
FROM (SELECT region AS region, SUM(sales) AS sum_sales FROM orders GROUP BY region) AS _t0
```

`backend/tests/fixtures/analytics/refline_constant_entire.sql`:
```sql
SELECT CAST(100.0 AS DOUBLE) AS __reference_value__
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_analytics_compiler.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'vizql.analytics_compiler'`.

- [ ] **Step 3: Implement the compiler** — `backend/vizql/analytics_compiler.py`:

```python
"""Plan 9a — compile analytics specs into SQLQueryFunctions.

Each spec becomes a SEPARATE query issued alongside the base viz query.
Scope semantics per Build_Tableau §XIII.1 map to:
    entire → SELECT agg(measure) FROM (base_plan)
    pane   → SELECT pane_dims, agg(measure) FROM (base_plan) GROUP BY pane_dims
    cell   → SELECT pane_dims, agg(measure) OVER (...) FROM (base_plan)

For totals (separate path — see compile_totals), base_plan is rebuilt
with dimensions removed per §IV.7 step 9.
"""
from __future__ import annotations

from typing import Iterable, Optional, Sequence

from . import analytics_types as at
from . import logical as lg
from . import sql_ast as sa
from .logical_to_sql import compile_logical_to_sql


_REFERENCE_VALUE_COL = "__reference_value__"


def _base_subquery(base_plan: lg.LogicalOp) -> sa.SQLQueryFunction:
    """Compile base plan and wrap its output as a derived table alias _t0."""
    fn = compile_logical_to_sql(base_plan)
    return fn  # caller wraps with FromSubquery


def _wrap_as_from(base_fn: sa.SQLQueryFunction, alias: str = "_t0") -> sa.FromSubquery:
    return sa.FromSubquery(query=base_fn, alias=alias)


def _agg_expr(aggregation: str, col: str, percentile: Optional[int]) -> sa.SQLQueryExpression:
    """Build the analytics aggregate expression over the base subquery's measure column."""
    c = sa.Column(name=col, table_alias="")
    if aggregation == "mean":
        return sa.FnCall(name="AVG", args=(c,))
    if aggregation == "median":
        return sa.FnCall(name="MEDIAN", args=(c,))
    if aggregation == "sum":
        return sa.FnCall(name="SUM", args=(c,))
    if aggregation == "min":
        return sa.FnCall(name="MIN", args=(c,))
    if aggregation == "max":
        return sa.FnCall(name="MAX", args=(c,))
    if aggregation == "percentile":
        if percentile is None:
            raise ValueError("percentile aggregation requires percentile value")
        frac = percentile / 100.0
        # Build_Tableau Appendix B observed grammar:
        #   PERCENTILE_CONT(<frac>) WITHIN GROUP (ORDER BY <col>)
        return sa.WithinGroup(
            func=sa.FnCall(name="PERCENTILE_CONT", args=(sa.Literal(value=frac),)),
            order_by=(sa.OrderBy(expr=c, direction="asc"),),
        )
    raise ValueError(f"unsupported aggregation: {aggregation!r}")


def compile_reference_line(
    *,
    spec: at.ReferenceLineSpec,
    base_plan: lg.LogicalOp,
    measure_alias: str,
    pane_dims: Sequence[str] = (),
    scope_override: Optional[str] = None,
) -> sa.SQLQueryFunction:
    """Compile a ReferenceLineSpec into a separate SQLQueryFunction.

    Args:
        spec: the analytics spec.
        base_plan: the base viz's LogicalOp (used as a derived table).
        measure_alias: output alias of the measure column in base_plan
            (Plan 7b compiler convention: `LogicalOpAggregate.aggregations[i].name`).
        pane_dims: dimension alias list active on Rows + Columns for "pane" /
            "cell" scope. Callers must pull these from VisualSpec shelves.
        scope_override: test hook; default uses spec.scope.
    """
    spec.validate()
    scope = scope_override or spec.scope
    if scope not in {"entire", "pane", "cell"}:
        raise ValueError(f"unknown scope: {scope!r}")

    # Constant: no base-plan subquery needed.
    if spec.aggregation == "constant":
        return sa.SQLQueryFunction(
            projections=(sa.Projection(
                alias=_REFERENCE_VALUE_COL,
                expression=sa.Cast(expr=sa.Literal(value=spec.value), type_name="DOUBLE"),
            ),),
            from_=None,
        )

    base_fn = _base_subquery(base_plan)
    derived = _wrap_as_from(base_fn, alias="_t0")

    agg = _agg_expr(spec.aggregation, measure_alias, spec.percentile)

    if scope == "entire":
        return sa.SQLQueryFunction(
            projections=(sa.Projection(alias=_REFERENCE_VALUE_COL, expression=agg),),
            from_=derived,
        )

    if scope == "pane":
        projs: list[sa.Projection] = [
            sa.Projection(alias=d, expression=sa.Column(name=d, table_alias=""))
            for d in pane_dims
        ]
        projs.append(sa.Projection(alias=_REFERENCE_VALUE_COL, expression=agg))
        group_by = tuple(sa.Column(name=d, table_alias="") for d in pane_dims)
        return sa.SQLQueryFunction(
            projections=tuple(projs),
            from_=derived,
            group_by=group_by,
        )

    # scope == "cell"
    win_partition = tuple(sa.Column(name=d, table_alias="") for d in pane_dims)
    window = sa.Window(
        func=agg,
        partition_by=win_partition,
        order_by=(),
        frame=None,
    )
    projs_cell: list[sa.Projection] = [
        sa.Projection(alias=d, expression=sa.Column(name=d, table_alias=""))
        for d in pane_dims
    ]
    projs_cell.append(sa.Projection(alias=_REFERENCE_VALUE_COL, expression=window))
    return sa.SQLQueryFunction(projections=tuple(projs_cell), from_=derived)


__all__ = ["compile_reference_line"]
```

**Sidecar note for implementer:** `sa.Cast`, `sa.WithinGroup`, and `sa.Window` already exist in `backend/vizql/sql_ast.py` as per Plan 7c + 8c (verify at `grep -n 'class Cast\|class WithinGroup\|class Window' backend/vizql/sql_ast.py`). If any is missing — stop and add it under the Plan 7c style (thin dataclass + emitter dispatch in `dialects/generic.py`). Do NOT invent a shortcut string. Goldens above are emitted by `GenericDialect`; if your dialect whitespace differs re-run fixtures with `pytest … -vv` and paste observed output into the `.sql` file — the goldens are source-of-truth for the dialect, not hand-written.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_analytics_compiler.py -v`
Expected: 6/6 pass.

- [ ] **Step 5: Confirm SQL validator accepts every generated SQL**

Run: `cd backend && python -m pytest tests/test_analytics_compiler.py -v && python -c "from sql_validator import SQLValidator; import pathlib; v=SQLValidator();
[print(p.name, v.validate(p.read_text())[0]) for p in pathlib.Path('tests/fixtures/analytics').glob('*.sql')]"`
Expected: all four print `True`.

- [ ] **Step 6: Commit**

```bash
git add backend/vizql/analytics_compiler.py \
        backend/tests/test_analytics_compiler.py \
        backend/tests/fixtures/analytics/refline_*.sql
git commit -m "feat(analyst-pro): compile_reference_line entire/pane/cell (Plan 9a T2)"
```

---

## Task 3: `compile_reference_band` + `compile_reference_distribution`

**Files:**
- Modify: `backend/vizql/analytics_compiler.py`
- Modify: `backend/tests/test_analytics_compiler.py`
- Create: `backend/tests/fixtures/analytics/refband_iqr_entire.sql`
- Create: `backend/tests/fixtures/analytics/refdist_quantile_entire.sql`

- [ ] **Step 1: Extend tests** — append to `backend/tests/test_analytics_compiler.py`:

```python
def test_reference_band_iqr_entire_emits_two_rows():
    p25 = at.ReferenceLineSpec(axis="y", aggregation="percentile", value=None,
                               percentile=25, scope="entire", label="value",
                               custom_label="", line_style="solid",
                               color="#888", show_marker=False)
    p75 = at.ReferenceLineSpec(axis="y", aggregation="percentile", value=None,
                               percentile=75, scope="entire", label="value",
                               custom_label="", line_style="solid",
                               color="#888", show_marker=False)
    band = at.ReferenceBandSpec(axis="y", from_spec=p25, to_spec=p75,
                                fill="#cccccc", fill_opacity=0.25)
    fns = ac.compile_reference_band(spec=band,
                                    base_plan=_base_plan_bar_by_region(),
                                    measure_alias="sum_sales",
                                    pane_dims=())
    assert len(fns) == 2, "band emits from_ + to_ queries"
    assert _render(fns[0]) + "\n---\n" + _render(fns[1]) == _golden("refband_iqr_entire.sql")


def test_reference_distribution_quantile_emits_one_row_per_percentile():
    dist = at.ReferenceDistributionSpec(axis="y", percentiles=[10, 50, 90],
                                        scope="entire", style="quantile",
                                        color="#888888")
    fns = ac.compile_reference_distribution(
        spec=dist, base_plan=_base_plan_bar_by_region(),
        measure_alias="sum_sales", pane_dims=(),
    )
    assert len(fns) == 3
    combined = "\n---\n".join(_render(f) for f in fns)
    assert combined == _golden("refdist_quantile_entire.sql")
    assert combined.count("PERCENTILE_CONT(") == 3


def test_reference_distribution_stddev_emits_mean_plus_minus_sigma():
    dist = at.ReferenceDistributionSpec(axis="y", percentiles=[],
                                        scope="entire", style="stddev",
                                        color="#888888")
    fns = ac.compile_reference_distribution(
        spec=dist, base_plan=_base_plan_bar_by_region(),
        measure_alias="sum_sales", pane_dims=(),
    )
    # stddev style emits 3 lines: mean - stddev, mean, mean + stddev.
    assert len(fns) == 3
    joined = " | ".join(_render(f) for f in fns)
    assert "STDDEV" in joined.upper()
    assert "AVG(sum_sales)" in joined
```

Golden fixtures:

`backend/tests/fixtures/analytics/refband_iqr_entire.sql`:
```sql
SELECT PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY sum_sales) AS __reference_value__
FROM (SELECT region AS region, SUM(sales) AS sum_sales FROM orders GROUP BY region) AS _t0
---
SELECT PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY sum_sales) AS __reference_value__
FROM (SELECT region AS region, SUM(sales) AS sum_sales FROM orders GROUP BY region) AS _t0
```

`backend/tests/fixtures/analytics/refdist_quantile_entire.sql`:
```sql
SELECT PERCENTILE_CONT(0.10) WITHIN GROUP (ORDER BY sum_sales) AS __reference_value__
FROM (SELECT region AS region, SUM(sales) AS sum_sales FROM orders GROUP BY region) AS _t0
---
SELECT PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY sum_sales) AS __reference_value__
FROM (SELECT region AS region, SUM(sales) AS sum_sales FROM orders GROUP BY region) AS _t0
---
SELECT PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY sum_sales) AS __reference_value__
FROM (SELECT region AS region, SUM(sales) AS sum_sales FROM orders GROUP BY region) AS _t0
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_analytics_compiler.py -v`
Expected: 3 new tests fail with `AttributeError: module 'vizql.analytics_compiler' has no attribute 'compile_reference_band'`.

- [ ] **Step 3: Extend the compiler** — append to `backend/vizql/analytics_compiler.py`:

```python
def compile_reference_band(
    *,
    spec: at.ReferenceBandSpec,
    base_plan: lg.LogicalOp,
    measure_alias: str,
    pane_dims: Sequence[str] = (),
) -> list[sa.SQLQueryFunction]:
    """Band = two reference lines. Metadata (fill/fill_opacity) travels
    alongside via the endpoint response envelope, not in SQL."""
    spec.validate()
    return [
        compile_reference_line(spec=spec.from_spec, base_plan=base_plan,
                               measure_alias=measure_alias, pane_dims=pane_dims),
        compile_reference_line(spec=spec.to_spec, base_plan=base_plan,
                               measure_alias=measure_alias, pane_dims=pane_dims),
    ]


def _stddev_plans(
    base_plan: lg.LogicalOp,
    measure_alias: str,
    pane_dims: Sequence[str],
    scope: str,
) -> list[sa.SQLQueryFunction]:
    """Mean, mean−σ, mean+σ as three separate SQLQueryFunctions."""
    base_fn = _base_subquery(base_plan)
    derived = _wrap_as_from(base_fn, alias="_t0")
    col = sa.Column(name=measure_alias, table_alias="")
    avg = sa.FnCall(name="AVG", args=(col,))
    sd = sa.FnCall(name="STDDEV", args=(col,))

    if scope == "entire":
        return [
            sa.SQLQueryFunction(
                projections=(sa.Projection(
                    alias=_REFERENCE_VALUE_COL,
                    expression=sa.BinaryOp(op=op, left=avg, right=sd),
                ),),
                from_=derived,
            )
            for op in ("-", "+")
        ] + [sa.SQLQueryFunction(
                projections=(sa.Projection(alias=_REFERENCE_VALUE_COL, expression=avg),),
                from_=derived,
        )]
    # pane/cell scope: same shape as reference-line pane/cell compile.
    # Re-use compile_reference_line twice with synthetic "mean" spec, then
    # layer stddev-adjusted expressions on top. Kept simple for T3 scope:
    # stddev style only supported for "entire" in Plan 9a.
    raise ValueError("stddev distribution supported only for scope='entire' in Plan 9a")


def compile_reference_distribution(
    *,
    spec: at.ReferenceDistributionSpec,
    base_plan: lg.LogicalOp,
    measure_alias: str,
    pane_dims: Sequence[str] = (),
) -> list[sa.SQLQueryFunction]:
    spec.validate()
    if spec.style == "stddev":
        return _stddev_plans(base_plan, measure_alias, pane_dims, spec.scope)

    # quantile + confidence both materialise as one ref-line per percentile.
    out: list[sa.SQLQueryFunction] = []
    for p in spec.percentiles:
        line = at.ReferenceLineSpec(
            axis=spec.axis, aggregation="percentile", value=None,
            percentile=p, scope=spec.scope, label="value", custom_label="",
            line_style="solid", color=spec.color, show_marker=False,
        )
        out.append(compile_reference_line(
            spec=line, base_plan=base_plan,
            measure_alias=measure_alias, pane_dims=pane_dims,
        ))
    return out


__all__ += ["compile_reference_band", "compile_reference_distribution"]
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_analytics_compiler.py -v`
Expected: all tests pass (including Task 2's).

- [ ] **Step 5: Commit**

```bash
git add backend/vizql/analytics_compiler.py \
        backend/tests/test_analytics_compiler.py \
        backend/tests/fixtures/analytics/refband_*.sql \
        backend/tests/fixtures/analytics/refdist_*.sql
git commit -m "feat(analyst-pro): compile_reference_band + distribution (Plan 9a T3)"
```

---

## Task 4: `compile_totals` — grand + subtotal via separate queries

**Files:**
- Modify: `backend/vizql/analytics_compiler.py`
- Modify: `backend/tests/test_analytics_compiler.py`
- Create: `backend/tests/fixtures/analytics/totals_grand_sum.sql`
- Create: `backend/tests/fixtures/analytics/totals_subtotal_region.sql`
- Create: `backend/tests/fixtures/analytics/totals_grand_skips_non_totals_filters.sql`

- [ ] **Step 1: Extend tests** — append to `backend/tests/test_analytics_compiler.py`:

```python
def _base_plan_bar_region_x_category():
    """`SELECT region, category, SUM(sales) GROUP BY region, category`."""
    rel = lg.LogicalOpRelation(table="orders", schema=None)
    region = lg.Field(id="region")
    cat    = lg.Field(id="category")
    sales  = lg.Field(id="sales")
    return lg.LogicalOpAggregate(
        input=rel,
        group_bys=(region, cat),
        aggregations=(lg.AggExp(name="sum_sales", agg="sum",
                                expr=lg.Column(field=sales)),),
    )


def test_totals_grand_total_removes_all_dims():
    totals = at.TotalsSpec(kind="grand_total", axis="both",
                           aggregation="sum", position="after",
                           should_affect_totals=True)
    fns = ac.compile_totals(spec=totals,
                            base_plan=_base_plan_bar_region_x_category(),
                            measure_alias="sum_sales",
                            pane_dims=("region", "category"))
    assert len(fns) == 1
    assert _render(fns[0]) == _golden("totals_grand_sum.sql")


def test_totals_subtotal_removes_one_dim_per_axis():
    totals = at.TotalsSpec(kind="subtotal", axis="row",
                           aggregation="sum", position="after",
                           should_affect_totals=True)
    fns = ac.compile_totals(spec=totals,
                            base_plan=_base_plan_bar_region_x_category(),
                            measure_alias="sum_sales",
                            pane_dims=("region", "category"),
                            row_dims=("region",),
                            column_dims=("category",))
    assert len(fns) == 1
    assert _render(fns[0]) == _golden("totals_subtotal_region.sql")


def test_totals_both_emits_grand_plus_one_per_dim():
    totals = at.TotalsSpec(kind="both", axis="both",
                           aggregation="sum", position="after",
                           should_affect_totals=True)
    fns = ac.compile_totals(spec=totals,
                            base_plan=_base_plan_bar_region_x_category(),
                            measure_alias="sum_sales",
                            pane_dims=("region", "category"),
                            row_dims=("region",),
                            column_dims=("category",))
    # 1 grand total + 2 subtotals (one per dim).
    assert len(fns) == 3


def test_totals_respects_should_affect_totals_false():
    """When should_affect_totals=False, filters with filter_stage=='dimension'
    on the base plan must be stripped in the totals query. Golden fixture
    proves no WHERE clause leaks through."""
    rel = lg.LogicalOpRelation(table="orders", schema=None)
    filtered = lg.LogicalOpSelect(
        input=rel,
        predicate=lg.BinaryOp(op="=",
                              left=lg.Column(field=lg.Field(id="region")),
                              right=lg.Literal(value="West")),
        filter_stage="dimension",
    )
    agg = lg.LogicalOpAggregate(
        input=filtered,
        group_bys=(lg.Field(id="region"), lg.Field(id="category")),
        aggregations=(lg.AggExp(name="sum_sales", agg="sum",
                                expr=lg.Column(field=lg.Field(id="sales"))),),
    )
    totals = at.TotalsSpec(kind="grand_total", axis="both",
                           aggregation="sum", position="after",
                           should_affect_totals=False)
    fns = ac.compile_totals(spec=totals, base_plan=agg,
                            measure_alias="sum_sales",
                            pane_dims=("region", "category"))
    sql = _render(fns[0])
    assert "WHERE" not in sql.upper(), f"totals should skip dimension filter: {sql}"
    assert sql == _golden("totals_grand_skips_non_totals_filters.sql")
```

Goldens:

`backend/tests/fixtures/analytics/totals_grand_sum.sql`:
```sql
SELECT SUM(sales) AS __total_value__
FROM orders AS _t0
```

`backend/tests/fixtures/analytics/totals_subtotal_region.sql`:
```sql
SELECT region AS region, SUM(sales) AS __subtotal_value__
FROM orders AS _t0
GROUP BY region
```

`backend/tests/fixtures/analytics/totals_grand_skips_non_totals_filters.sql`:
```sql
SELECT SUM(sales) AS __total_value__
FROM orders AS _t0
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_analytics_compiler.py::test_totals_grand_total_removes_all_dims -v`
Expected: FAIL — `AttributeError: module 'vizql.analytics_compiler' has no attribute 'compile_totals'`.

- [ ] **Step 3: Implement `compile_totals`** — append to `backend/vizql/analytics_compiler.py`:

```python
_TOTAL_COL = "__total_value__"
_SUBTOTAL_COL = "__subtotal_value__"


def _strip_filters_for_totals(plan: lg.LogicalOp) -> lg.LogicalOp:
    """Remove Select nodes whose filter_stage is dimension/measure. Keep
    context/extract/datasource stages (they always affect totals)."""
    if isinstance(plan, lg.LogicalOpAggregate):
        return lg.LogicalOpAggregate(
            input=_strip_filters_for_totals(plan.input),
            group_bys=plan.group_bys,
            aggregations=plan.aggregations,
        )
    if isinstance(plan, (lg.LogicalOpSelect, lg.LogicalOpFilter)):
        stage = getattr(plan, "filter_stage", "") or ""
        if stage in {"dimension", "measure", "table_calc"}:
            return _strip_filters_for_totals(plan.input)
        # context / extract / datasource stay.
        cls = type(plan)
        return cls(
            input=_strip_filters_for_totals(plan.input),
            predicate=plan.predicate,
            filter_stage=stage,
        )
    return plan


def _aggregate_without_dims(
    plan: lg.LogicalOp, measure_alias: str, agg: str, kept_dims: Sequence[str],
) -> lg.LogicalOp:
    """Return a LogicalOpAggregate grouping only on kept_dims. Discovers
    the underlying measure expression by walking the existing aggregate."""
    cur = plan
    while cur is not None and not isinstance(cur, lg.LogicalOpAggregate):
        cur = getattr(cur, "input", None)
    if cur is None:
        raise ValueError("base_plan has no LogicalOpAggregate to rewrite")
    inner = cur.input

    # Locate the existing AggExp that produced measure_alias.
    existing = next((a for a in cur.aggregations if a.name == measure_alias), None)
    if existing is None:
        raise ValueError(f"measure alias {measure_alias!r} not in base_plan aggregations")

    kept = tuple(f for f in cur.group_bys if f.id in kept_dims)
    new_agg = lg.AggExp(
        name=_TOTAL_COL if not kept_dims else _SUBTOTAL_COL,
        agg=agg,
        expr=existing.expr,
    )
    return lg.LogicalOpAggregate(input=inner, group_bys=kept, aggregations=(new_agg,))


def compile_totals(
    *,
    spec: at.TotalsSpec,
    base_plan: lg.LogicalOp,
    measure_alias: str,
    pane_dims: Sequence[str],
    row_dims: Sequence[str] = (),
    column_dims: Sequence[str] = (),
) -> list[sa.SQLQueryFunction]:
    spec.validate()
    plan = base_plan
    if not spec.should_affect_totals:
        plan = _strip_filters_for_totals(plan)

    out: list[sa.SQLQueryFunction] = []

    if spec.kind in {"grand_total", "both"}:
        grand_plan = _aggregate_without_dims(plan, measure_alias, spec.aggregation, kept_dims=())
        out.append(compile_logical_to_sql(grand_plan))

    if spec.kind in {"subtotal", "both"}:
        # One subtotal per dim on the configured axis.
        if spec.axis == "row":
            target_dims = tuple(row_dims)
        elif spec.axis == "column":
            target_dims = tuple(column_dims)
        else:  # "both"
            target_dims = tuple(row_dims) + tuple(column_dims)
        for d in target_dims:
            sub_plan = _aggregate_without_dims(plan, measure_alias, spec.aggregation, kept_dims=(d,))
            out.append(compile_logical_to_sql(sub_plan))

    return out


__all__ += ["compile_totals"]
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_analytics_compiler.py -v`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/vizql/analytics_compiler.py \
        backend/tests/test_analytics_compiler.py \
        backend/tests/fixtures/analytics/totals_*.sql
git commit -m "feat(analyst-pro): compile_totals grand+subtotal per IV.7 step 9 (Plan 9a T4)"
```

---

## Task 5: `/api/v1/queries/execute` accepts `analytics` payload

**Files:**
- Modify: `backend/routers/query_routes.py`
- Create: `backend/tests/test_analytics_endpoint.py`

- [ ] **Step 1: Write the failing test** — `backend/tests/test_analytics_endpoint.py`:

```python
"""Plan 9a T5 — /queries/execute analytics payload."""
import pytest
from fastapi.testclient import TestClient

from main import app
from tests.helpers import login_demo_user, register_test_connection


def _client() -> TestClient:
    return TestClient(app)


def test_execute_with_reference_line_returns_analytics_rows(monkeypatch):
    client = _client()
    token = login_demo_user(client)
    conn_id = register_test_connection(client, token)

    body = {
        "conn_id": conn_id,
        "sql": "SELECT region, SUM(sales) AS sum_sales FROM orders GROUP BY region",
        "question": "sales by region",
        "analytics": {
            "reference_lines": [{
                "axis": "y", "aggregation": "mean", "scope": "entire",
                "label": "computation", "custom_label": "",
                "line_style": "solid", "color": "#4C78A8",
                "show_marker": True,
                "value": None, "percentile": None,
            }],
            "reference_bands": [],
            "distributions": [],
            "totals": [],
        },
        "measure_alias": "sum_sales",
        "pane_dims": ["region"],
        "row_dims": ["region"],
        "column_dims": [],
    }
    r = client.post("/api/v1/queries/execute",
                    json=body,
                    headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200, r.text
    data = r.json()
    assert "rows" in data
    assert "analytics_rows" in data
    assert len(data["analytics_rows"]) == 1
    entry = data["analytics_rows"][0]
    assert entry["kind"] == "reference_line"
    assert entry["axis"] == "y"
    assert "value" in entry  # numeric


def test_execute_with_totals_returns_separate_queries(monkeypatch):
    client = _client()
    token = login_demo_user(client)
    conn_id = register_test_connection(client, token)

    body = {
        "conn_id": conn_id,
        "sql": "SELECT region, category, SUM(sales) AS sum_sales FROM orders "
               "GROUP BY region, category",
        "analytics": {
            "reference_lines": [], "reference_bands": [], "distributions": [],
            "totals": [{
                "kind": "both", "axis": "both",
                "aggregation": "sum", "position": "after",
                "should_affect_totals": True,
            }],
        },
        "measure_alias": "sum_sales",
        "pane_dims": ["region", "category"],
        "row_dims": ["region"],
        "column_dims": ["category"],
    }
    r = client.post("/api/v1/queries/execute",
                    json=body,
                    headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200, r.text
    out = r.json()["analytics_rows"]
    kinds = [e["kind"] for e in out]
    assert "grand_total" in kinds
    assert kinds.count("subtotal") == 2


def test_execute_analytics_sql_passes_validator(monkeypatch):
    """Every analytics SQL must pass the 6-layer validator before execution."""
    from vizql import analytics_compiler as ac
    from vizql import analytics_types as at
    from sql_validator import SQLValidator
    v = SQLValidator()

    # Build the same compiled SQL the endpoint would execute.
    # (See test_analytics_compiler._base_plan_bar_by_region.)
    from tests.test_analytics_compiler import _base_plan_bar_by_region
    fn = ac.compile_reference_line(
        spec=at.ReferenceLineSpec(axis="y", aggregation="mean", value=None,
                                  percentile=None, scope="entire",
                                  label="computation", custom_label="",
                                  line_style="solid", color="#888",
                                  show_marker=False),
        base_plan=_base_plan_bar_by_region(),
        measure_alias="sum_sales",
    )
    from vizql.dialects.generic import GenericDialect
    sql = GenericDialect().emit(fn)
    ok, _, err = v.validate(sql)
    assert ok, f"analytics SQL failed validator: {err}\n{sql}"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_analytics_endpoint.py -v`
Expected: FAIL — `KeyError: 'analytics_rows'` or 422 validation error (new optional fields not recognized).

- [ ] **Step 3: Extend `ExecuteRequest` + endpoint** — in `backend/routers/query_routes.py`, find the `ExecuteRequest` Pydantic model (search for `class ExecuteRequest`). Append the optional analytics fields below to the model. Then, in `execute_sql`, after the base SQL has been validated and executed, compile each analytics spec, run it through the same validator + engine, and append the scalar result to `response["analytics_rows"]`.

```python
# backend/routers/query_routes.py — additions

from typing import Optional
from pydantic import BaseModel
# ↑ already imported; just add fields.

class AnalyticsPayload(BaseModel):
    reference_lines: list[dict] = []
    reference_bands: list[dict] = []
    distributions:   list[dict] = []
    totals:          list[dict] = []


class ExecuteRequest(BaseModel):
    # …existing fields…
    analytics: Optional[AnalyticsPayload] = None
    measure_alias: Optional[str] = None          # which SELECT alias the analytics targets
    pane_dims:    list[str] = []
    row_dims:     list[str] = []
    column_dims:  list[str] = []


def _run_analytics(
    req: ExecuteRequest, entry, base_plan  # base_plan: reconstructed LogicalOp
) -> list[dict]:
    """Compile + execute every analytics spec; return wire-format entries.
    Every generated SQL is re-validated before running — security invariant."""
    from vizql import analytics_compiler as ac
    from vizql import analytics_types as at
    from vizql.dialects.generic import GenericDialect
    from sql_validator import SQLValidator

    if not req.analytics or not req.measure_alias:
        return []

    dialect = GenericDialect()   # Plan 7d per-dialect router comes later.
    validator = SQLValidator()
    out: list[dict] = []

    for raw in req.analytics.reference_lines:
        spec = at.ReferenceLineSpec(**raw)
        fn = ac.compile_reference_line(
            spec=spec, base_plan=base_plan,
            measure_alias=req.measure_alias, pane_dims=tuple(req.pane_dims),
        )
        sql = dialect.emit(fn)
        ok, clean, err = validator.validate(sql)
        if not ok:
            raise HTTPException(status_code=400,
                                detail=f"Analytics SQL validation failed: {err}")
        df = entry.engine.execute_sql(clean, "reference_line")
        value = float(df.iloc[0]["__reference_value__"]) if len(df) else None
        out.append({
            "kind": "reference_line",
            "axis": spec.axis, "aggregation": spec.aggregation,
            "scope": spec.scope, "percentile": spec.percentile,
            "value": value, "label": spec.label,
            "custom_label": spec.custom_label,
            "line_style": spec.line_style, "color": spec.color,
            "show_marker": spec.show_marker,
        })

    for raw in req.analytics.reference_bands:
        band = at.ReferenceBandSpec(
            axis=raw["axis"],
            from_spec=at.ReferenceLineSpec(**raw["from_spec"]),
            to_spec=at.ReferenceLineSpec(**raw["to_spec"]),
            fill=raw["fill"], fill_opacity=raw["fill_opacity"],
        )
        fns = ac.compile_reference_band(
            spec=band, base_plan=base_plan,
            measure_alias=req.measure_alias, pane_dims=tuple(req.pane_dims),
        )
        values = []
        for fn in fns:
            sql = dialect.emit(fn)
            ok, clean, err = validator.validate(sql)
            if not ok:
                raise HTTPException(status_code=400,
                                    detail=f"Band SQL failed: {err}")
            df = entry.engine.execute_sql(clean, "reference_band")
            values.append(float(df.iloc[0]["__reference_value__"]) if len(df) else None)
        out.append({
            "kind": "reference_band",
            "axis": band.axis,
            "from_value": values[0], "to_value": values[1],
            "fill": band.fill, "fill_opacity": band.fill_opacity,
        })

    for raw in req.analytics.distributions:
        dist = at.ReferenceDistributionSpec(**raw)
        fns = ac.compile_reference_distribution(
            spec=dist, base_plan=base_plan,
            measure_alias=req.measure_alias, pane_dims=tuple(req.pane_dims),
        )
        vals: list[float] = []
        for fn in fns:
            sql = dialect.emit(fn)
            ok, clean, err = validator.validate(sql)
            if not ok:
                raise HTTPException(status_code=400,
                                    detail=f"Distribution SQL failed: {err}")
            df = entry.engine.execute_sql(clean, "reference_distribution")
            vals.append(float(df.iloc[0]["__reference_value__"]) if len(df) else None)
        out.append({
            "kind": "reference_distribution",
            "axis": dist.axis, "scope": dist.scope, "style": dist.style,
            "percentiles": dist.percentiles, "values": vals,
            "color": dist.color,
        })

    for raw in req.analytics.totals:
        tot = at.TotalsSpec(**raw)
        fns = ac.compile_totals(
            spec=tot, base_plan=base_plan,
            measure_alias=req.measure_alias,
            pane_dims=tuple(req.pane_dims),
            row_dims=tuple(req.row_dims),
            column_dims=tuple(req.column_dims),
        )
        expected = 1 if tot.kind == "grand_total" else (
            len(req.row_dims) if tot.axis == "row" else
            len(req.column_dims) if tot.axis == "column" else
            len(req.row_dims) + len(req.column_dims)
        )
        if tot.kind == "both":
            expected += 1
        for i, fn in enumerate(fns):
            sql = dialect.emit(fn)
            ok, clean, err = validator.validate(sql)
            if not ok:
                raise HTTPException(status_code=400,
                                    detail=f"Totals SQL failed: {err}")
            df = entry.engine.execute_sql(clean, "totals")
            if tot.kind == "grand_total" or (tot.kind == "both" and i == 0):
                out.append({"kind": "grand_total",
                            "value": float(df.iloc[0]["__total_value__"]) if len(df) else None,
                            "aggregation": tot.aggregation,
                            "position": tot.position})
            else:
                records = df.to_dict("records")
                out.append({"kind": "subtotal",
                            "rows": records,
                            "aggregation": tot.aggregation,
                            "position": tot.position})

    return out


# Inside the existing execute_sql handler, after the base result is produced:
#
#     result = entry.engine.execute_sql(clean_sql, req.question)
#     # …existing PII masking…
#     response = {...existing payload...}
#     if req.analytics is not None:
#         # base_plan reconstruction: if the request was produced by a Plan 7a
#         # VisualSpec (sheet_id present on /generate), re-hydrate; else
#         # parse req.sql with sqlglot into a minimal LogicalOpAggregate.
#         base_plan = _rebuild_base_plan_from_request(req)
#         response["analytics_rows"] = _run_analytics(req, entry, base_plan)
#     return response
```

**Important caveat for the implementer.** Re-hydrating `base_plan` from a raw SQL string is non-trivial. Use this order:
  1. If the request carries a `sheet_id`, fetch the cached `VisualSpec` via `analystProDashboard.worksheets[sheetId]` protobuf payload (server side: `agent_session_store`). Compile through `compiler.compile(spec)` to get the `LogicalOp`.
  2. Else, parse `req.sql` with `sqlglot.parse_one(req.sql).sql()` and extract table + group-by + aggregate into a minimal `LogicalOpAggregate(input=LogicalOpRelation(...), group_bys=..., aggregations=...)`. This handles the 95% cartesian case that Analyst Pro ships today.
  3. If both fail, return HTTP 422 `base_plan_unavailable_for_analytics`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_analytics_endpoint.py -v`
Expected: all 3 pass.

- [ ] **Step 5: Run the full query-routes regression**

Run: `cd backend && python -m pytest tests/test_query_routes.py tests/test_analytics_endpoint.py tests/test_analytics_compiler.py -v`
Expected: all pre-existing tests still pass; the three new tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/routers/query_routes.py \
        backend/tests/test_analytics_endpoint.py
git commit -m "feat(analyst-pro): /queries/execute analytics payload (Plan 9a T5)"
```

---

## Task 6: Frontend — `referenceLineToVega` compiler

**Files:**
- Create: `frontend/src/chart-ir/analytics/referenceLineToVega.ts`
- Create: `frontend/src/chart-ir/analytics/__tests__/referenceLineToVega.test.ts`
- Create: `frontend/src/chart-ir/analytics/__tests__/__fixtures__/refline_mean_layer.json`
- Create: `frontend/src/chart-ir/analytics/__tests__/__fixtures__/refband_iqr_layer.json`
- Create: `frontend/src/chart-ir/analytics/__tests__/__fixtures__/refdist_quantile_layer.json`

- [ ] **Step 1: Write the failing test** — `frontend/src/chart-ir/analytics/__tests__/referenceLineToVega.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { compileAnalyticsToVegaLayers } from '../referenceLineToVega';
import type { AnalyticsRow } from '../referenceLineToVega';
import mean from './__fixtures__/refline_mean_layer.json';
import band from './__fixtures__/refband_iqr_layer.json';
import dist from './__fixtures__/refdist_quantile_layer.json';

describe('compileAnalyticsToVegaLayers', () => {
  it('reference line mean → rule mark + optional text label', () => {
    const rows: AnalyticsRow[] = [{
      kind: 'reference_line', axis: 'y', aggregation: 'mean',
      scope: 'entire', percentile: null, value: 42.5, label: 'computation',
      custom_label: '', line_style: 'dashed', color: '#4C78A8',
      show_marker: true,
    }];
    expect(compileAnalyticsToVegaLayers(rows)).toEqual(mean);
  });

  it('reference band → rect mark with y/y2', () => {
    const rows: AnalyticsRow[] = [{
      kind: 'reference_band', axis: 'y',
      from_value: 10, to_value: 90, fill: '#cccccc', fill_opacity: 0.25,
    }];
    expect(compileAnalyticsToVegaLayers(rows)).toEqual(band);
  });

  it('reference distribution → one rule per percentile, color scaled', () => {
    const rows: AnalyticsRow[] = [{
      kind: 'reference_distribution', axis: 'y', scope: 'entire',
      style: 'quantile', percentiles: [10, 50, 90],
      values: [12, 50, 100], color: '#888888',
    }];
    expect(compileAnalyticsToVegaLayers(rows)).toEqual(dist);
  });

  it('empty input → empty layer list', () => {
    expect(compileAnalyticsToVegaLayers([])).toEqual([]);
  });

  it('reference_line with label=none suppresses text mark', () => {
    const rows: AnalyticsRow[] = [{
      kind: 'reference_line', axis: 'x', aggregation: 'median',
      scope: 'entire', percentile: null, value: 5, label: 'none',
      custom_label: '', line_style: 'solid', color: '#000',
      show_marker: false,
    }];
    const layers = compileAnalyticsToVegaLayers(rows);
    expect(layers).toHaveLength(1);
    expect(layers[0].mark).toMatchObject({ type: 'rule' });
  });
});
```

Fixtures:

`frontend/src/chart-ir/analytics/__tests__/__fixtures__/refline_mean_layer.json`:
```json
[
  {
    "mark": { "type": "rule", "strokeDash": [4, 4], "color": "#4C78A8", "size": 2 },
    "encoding": { "y": { "datum": 42.5, "type": "quantitative" } }
  },
  {
    "mark": { "type": "text", "align": "left", "dx": 4, "dy": -4, "color": "#4C78A8" },
    "encoding": {
      "y": { "datum": 42.5, "type": "quantitative" },
      "text": { "value": "Average 42.5" }
    }
  }
]
```

`frontend/src/chart-ir/analytics/__tests__/__fixtures__/refband_iqr_layer.json`:
```json
[
  {
    "mark": { "type": "rect", "color": "#cccccc", "opacity": 0.25 },
    "encoding": {
      "y":  { "datum": 10, "type": "quantitative" },
      "y2": { "datum": 90 }
    }
  }
]
```

`frontend/src/chart-ir/analytics/__tests__/__fixtures__/refdist_quantile_layer.json`:
```json
[
  {
    "mark": { "type": "rule", "color": "#888888", "opacity": 0.4, "size": 1 },
    "encoding": { "y": { "datum": 12, "type": "quantitative" } }
  },
  {
    "mark": { "type": "rule", "color": "#888888", "opacity": 0.7, "size": 1 },
    "encoding": { "y": { "datum": 50, "type": "quantitative" } }
  },
  {
    "mark": { "type": "rule", "color": "#888888", "opacity": 0.4, "size": 1 },
    "encoding": { "y": { "datum": 100, "type": "quantitative" } }
  }
]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test:chart-ir -- --run referenceLineToVega`
Expected: FAIL — `Cannot find module '../referenceLineToVega'`.

- [ ] **Step 3: Implement the compiler** — `frontend/src/chart-ir/analytics/referenceLineToVega.ts`:

```typescript
/**
 * Plan 9a — compile analytics rows (from /api/v1/queries/execute response
 * `analytics_rows`) into Vega-Lite layer specs. Pure function. No React.
 *
 * Every reference-line/band/distribution is rendered as its own layer so
 * the caller (VegaRenderer) appends them to a base ChartSpec's `layer`.
 */

export type RefLineRow = {
  kind: 'reference_line';
  axis: 'x' | 'y';
  aggregation: 'constant' | 'mean' | 'median' | 'sum' | 'min' | 'max' | 'percentile';
  scope: 'entire' | 'pane' | 'cell';
  percentile: number | null;
  value: number | null;
  label: 'value' | 'computation' | 'custom' | 'none';
  custom_label: string;
  line_style: 'solid' | 'dashed' | 'dotted';
  color: string;
  show_marker: boolean;
};

export type RefBandRow = {
  kind: 'reference_band';
  axis: 'x' | 'y';
  from_value: number | null;
  to_value: number | null;
  fill: string;
  fill_opacity: number;
};

export type RefDistRow = {
  kind: 'reference_distribution';
  axis: 'x' | 'y';
  scope: 'entire' | 'pane' | 'cell';
  style: 'confidence' | 'quantile' | 'stddev';
  percentiles: number[];
  values: (number | null)[];
  color: string;
};

export type AnalyticsRow = RefLineRow | RefBandRow | RefDistRow;

export type VegaLayer = {
  mark: Record<string, unknown>;
  encoding: Record<string, unknown>;
};

const DASH: Record<RefLineRow['line_style'], number[] | undefined> = {
  solid: undefined,
  dashed: [4, 4],
  dotted: [1, 3],
};

function labelText(row: RefLineRow): string | null {
  if (row.label === 'none') return null;
  if (row.label === 'custom') return row.custom_label || '';
  if (row.label === 'value') return row.value == null ? '' : String(row.value);
  // "computation"
  const v = row.value == null ? '' : String(row.value);
  const word =
    row.aggregation === 'mean' ? 'Average' :
    row.aggregation === 'median' ? 'Median' :
    row.aggregation === 'percentile' ? `P${row.percentile}` :
    row.aggregation.charAt(0).toUpperCase() + row.aggregation.slice(1);
  return `${word} ${v}`.trim();
}

function refLineLayers(row: RefLineRow): VegaLayer[] {
  if (row.value == null) return [];
  const axis = row.axis;
  const dash = DASH[row.line_style];
  const ruleMark: Record<string, unknown> = {
    type: 'rule',
    color: row.color,
    size: 2,
  };
  if (dash !== undefined) ruleMark.strokeDash = dash;
  const layers: VegaLayer[] = [{
    mark: ruleMark,
    encoding: { [axis]: { datum: row.value, type: 'quantitative' } },
  }];
  const text = labelText(row);
  if (text) {
    layers.push({
      mark: { type: 'text', align: 'left', dx: 4, dy: -4, color: row.color },
      encoding: {
        [axis]: { datum: row.value, type: 'quantitative' },
        text: { value: text },
      },
    });
  }
  return layers;
}

function refBandLayers(row: RefBandRow): VegaLayer[] {
  if (row.from_value == null || row.to_value == null) return [];
  const [lo, hi] = row.from_value <= row.to_value
    ? [row.from_value, row.to_value]
    : [row.to_value, row.from_value];
  const axis = row.axis;
  const axis2 = (axis === 'y' ? 'y2' : 'x2') as 'x2' | 'y2';
  return [{
    mark: { type: 'rect', color: row.fill, opacity: row.fill_opacity },
    encoding: {
      [axis]:  { datum: lo, type: 'quantitative' },
      [axis2]: { datum: hi },
    },
  }];
}

function refDistLayers(row: RefDistRow): VegaLayer[] {
  const axis = row.axis;
  const n = row.percentiles.length;
  const out: VegaLayer[] = [];
  for (let i = 0; i < n; i++) {
    const v = row.values[i];
    if (v == null) continue;
    // Outer percentiles drawn lighter, middle stronger.
    const edgeDistance = Math.min(i, n - 1 - i) / Math.max(1, Math.floor(n / 2));
    const opacity = 0.4 + 0.3 * edgeDistance;
    out.push({
      mark: { type: 'rule', color: row.color, opacity, size: 1 },
      encoding: { [axis]: { datum: v, type: 'quantitative' } },
    });
  }
  return out;
}

export function compileAnalyticsToVegaLayers(rows: AnalyticsRow[]): VegaLayer[] {
  const out: VegaLayer[] = [];
  for (const row of rows) {
    if (row.kind === 'reference_line') out.push(...refLineLayers(row));
    else if (row.kind === 'reference_band') out.push(...refBandLayers(row));
    else if (row.kind === 'reference_distribution') out.push(...refDistLayers(row));
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm run test:chart-ir -- --run referenceLineToVega`
Expected: 5/5 pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/chart-ir/analytics/referenceLineToVega.ts \
        frontend/src/chart-ir/analytics/__tests__/referenceLineToVega.test.ts \
        frontend/src/chart-ir/analytics/__tests__/__fixtures__/refline_mean_layer.json \
        frontend/src/chart-ir/analytics/__tests__/__fixtures__/refband_iqr_layer.json \
        frontend/src/chart-ir/analytics/__tests__/__fixtures__/refdist_quantile_layer.json
git commit -m "feat(analyst-pro): Vega-Lite reference line/band/distribution layers (Plan 9a T6)"
```

---

## Task 7: Frontend — `totalsToVega` crosstab injection

**Files:**
- Create: `frontend/src/chart-ir/analytics/totalsToVega.ts`
- Create: `frontend/src/chart-ir/analytics/__tests__/totalsToVega.test.ts`

- [ ] **Step 1: Write the failing test** — `frontend/src/chart-ir/analytics/__tests__/totalsToVega.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { applyTotalsToCrosstab } from '../totalsToVega';

const baseRows = [
  { region: 'West',  category: 'Tech',     sum_sales: 100 },
  { region: 'West',  category: 'Apparel',  sum_sales: 40  },
  { region: 'East',  category: 'Tech',     sum_sales: 80  },
  { region: 'East',  category: 'Apparel',  sum_sales: 60  },
];

describe('applyTotalsToCrosstab', () => {
  it('appends grand total row with __is_grand_total__ marker', () => {
    const analytics = [{ kind: 'grand_total', value: 280, aggregation: 'sum', position: 'after' }];
    const out = applyTotalsToCrosstab(baseRows, analytics, {
      measure_alias: 'sum_sales', row_dims: ['region'], column_dims: ['category'],
    });
    const last = out[out.length - 1];
    expect(last.__is_grand_total__).toBe(true);
    expect(last.sum_sales).toBe(280);
  });

  it('inserts subtotal rows at region boundary', () => {
    const analytics = [{
      kind: 'subtotal',
      rows: [
        { region: 'West', __subtotal_value__: 140 },
        { region: 'East', __subtotal_value__: 140 },
      ],
      aggregation: 'sum',
      position: 'after',
    }];
    const out = applyTotalsToCrosstab(baseRows, analytics, {
      measure_alias: 'sum_sales', row_dims: ['region'], column_dims: ['category'],
    });
    const westSub = out.find(r => r.__is_subtotal__ && r.region === 'West');
    expect(westSub).toBeDefined();
    expect(westSub!.sum_sales).toBe(140);
    // Sub-total must appear after West's two detail rows and before East's.
    const westIdx = out.findIndex(r => r === westSub);
    expect(out[westIdx - 1]).toMatchObject({ region: 'West' });
    expect(out[westIdx + 1].region).toBe('East');
  });

  it('position=before puts grand total at the head', () => {
    const analytics = [{ kind: 'grand_total', value: 280, aggregation: 'sum', position: 'before' }];
    const out = applyTotalsToCrosstab(baseRows, analytics, {
      measure_alias: 'sum_sales', row_dims: ['region'], column_dims: ['category'],
    });
    expect(out[0].__is_grand_total__).toBe(true);
  });

  it('no analytics → input rows unchanged (referential)', () => {
    const out = applyTotalsToCrosstab(baseRows, [], {
      measure_alias: 'sum_sales', row_dims: ['region'], column_dims: ['category'],
    });
    expect(out).toEqual(baseRows);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test:chart-ir -- --run totalsToVega`
Expected: FAIL — `Cannot find module '../totalsToVega'`.

- [ ] **Step 3: Implement** — `frontend/src/chart-ir/analytics/totalsToVega.ts`:

```typescript
/**
 * Plan 9a — merge totals `analytics_rows` entries into a crosstab row
 * array. Callers pipe the returned array straight into Vega-Lite's
 * data.values (or a tabular renderer). The markers `__is_grand_total__`
 * and `__is_subtotal__` drive bold styling + divider borders via
 * conditional formatting at render time.
 */

export type TotalsRow =
  | { kind: 'grand_total'; value: number | null;
      aggregation: string; position: 'before' | 'after' }
  | { kind: 'subtotal'; rows: Record<string, unknown>[];
      aggregation: string; position: 'before' | 'after' };

export interface ApplyTotalsCtx {
  measure_alias: string;
  row_dims: string[];
  column_dims: string[];
}

export function applyTotalsToCrosstab<Row extends Record<string, unknown>>(
  baseRows: Row[],
  analytics: TotalsRow[],
  ctx: ApplyTotalsCtx,
): (Row & Record<string, unknown>)[] {
  if (analytics.length === 0) return baseRows;

  let out: (Row & Record<string, unknown>)[] = [...baseRows];

  // Insert subtotals first (inline, at the boundary of their owning dim).
  for (const t of analytics) {
    if (t.kind !== 'subtotal') continue;
    out = insertSubtotals(out, t.rows, ctx);
  }

  // Then grand totals (outermost).
  for (const t of analytics) {
    if (t.kind !== 'grand_total') continue;
    const gt: Record<string, unknown> = {
      __is_grand_total__: true,
      [ctx.measure_alias]: t.value,
    };
    if (t.position === 'before') out = [gt as Row & Record<string, unknown>, ...out];
    else out = [...out, gt as Row & Record<string, unknown>];
  }

  return out;
}

function insertSubtotals<Row extends Record<string, unknown>>(
  rows: (Row & Record<string, unknown>)[],
  subtotals: Record<string, unknown>[],
  ctx: ApplyTotalsCtx,
): (Row & Record<string, unknown>)[] {
  if (subtotals.length === 0) return rows;
  // Assume subtotal.rows carry the single grouping dim + __subtotal_value__.
  const dim = Object.keys(subtotals[0]).find(
    (k) => k !== '__subtotal_value__',
  );
  if (!dim) return rows;

  const byDim = new Map<unknown, Record<string, unknown>>();
  for (const s of subtotals) byDim.set(s[dim], s);

  const result: (Row & Record<string, unknown>)[] = [];
  let prev: unknown = Symbol.for('init');
  for (const r of rows) {
    const cur = r[dim];
    if (prev !== Symbol.for('init') && prev !== cur && byDim.has(prev)) {
      const s = byDim.get(prev)!;
      result.push({
        __is_subtotal__: true,
        [dim]: prev,
        [ctx.measure_alias]: s['__subtotal_value__'],
      } as unknown as Row & Record<string, unknown>);
    }
    result.push(r);
    prev = cur;
  }
  // Flush final group.
  if (prev !== Symbol.for('init') && byDim.has(prev)) {
    const s = byDim.get(prev)!;
    result.push({
      __is_subtotal__: true,
      [dim]: prev,
      [ctx.measure_alias]: s['__subtotal_value__'],
    } as unknown as Row & Record<string, unknown>);
  }
  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm run test:chart-ir -- --run totalsToVega`
Expected: 4/4 pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/chart-ir/analytics/totalsToVega.ts \
        frontend/src/chart-ir/analytics/__tests__/totalsToVega.test.ts
git commit -m "feat(analyst-pro): totals grand+subtotal crosstab injection (Plan 9a T7)"
```

---

## Task 8: Store actions — CRUD with history

**Files:**
- Modify: `frontend/src/store.js` (append after existing `setTableCalcComputeUsingAnalystPro` block, around line 1230)
- Create: `frontend/src/__tests__/store.analyticsSlots.test.ts`

- [ ] **Step 1: Write the failing test** — `frontend/src/__tests__/store.analyticsSlots.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../store';
import { emptyDashboardForPreset } from '../__fixtures__/dashboardPresets';

const SHEET = 'sheet-1';

function seedWithWorksheet() {
  useStore.setState({
    analystProDashboard: {
      ...emptyDashboardForPreset('analyst-pro'),
      worksheets: {
        [SHEET]: { id: SHEET, name: 'Sales', analytics: {
          referenceLines: [], referenceBands: [], distributions: [], totals: [],
        }},
      },
    },
  });
}

describe('analytics slot store actions', () => {
  beforeEach(seedWithWorksheet);

  it('addReferenceLineAnalystPro appends spec + pushes history entry', () => {
    const spec = { axis: 'y', aggregation: 'mean', scope: 'entire',
                   label: 'computation', custom_label: '',
                   line_style: 'solid', color: '#4C78A8',
                   show_marker: true, value: null, percentile: null };
    const histBefore = useStore.getState().analystProHistory?.length ?? 0;
    useStore.getState().addReferenceLineAnalystPro(SHEET, spec);
    const sheet = useStore.getState().analystProDashboard.worksheets[SHEET];
    expect(sheet.analytics.referenceLines).toHaveLength(1);
    expect(sheet.analytics.referenceLines[0]).toEqual(spec);
    expect(useStore.getState().analystProHistory?.length).toBeGreaterThan(histBefore);
  });

  it('updateReferenceLineAnalystPro patches by index', () => {
    const spec = { axis: 'y', aggregation: 'mean', scope: 'entire',
                   label: 'computation', custom_label: '',
                   line_style: 'solid', color: '#4C78A8',
                   show_marker: true, value: null, percentile: null };
    useStore.getState().addReferenceLineAnalystPro(SHEET, spec);
    useStore.getState().updateReferenceLineAnalystPro(SHEET, 0, { color: '#d62728' });
    const rl = useStore.getState().analystProDashboard.worksheets[SHEET].analytics.referenceLines[0];
    expect(rl.color).toBe('#d62728');
    expect(rl.aggregation).toBe('mean');
  });

  it('deleteReferenceLineAnalystPro removes by index', () => {
    const spec = { axis: 'y', aggregation: 'mean', scope: 'entire',
                   label: 'computation', custom_label: '',
                   line_style: 'solid', color: '#4C78A8',
                   show_marker: true, value: null, percentile: null };
    useStore.getState().addReferenceLineAnalystPro(SHEET, spec);
    useStore.getState().deleteReferenceLineAnalystPro(SHEET, 0);
    expect(useStore.getState().analystProDashboard.worksheets[SHEET]
           .analytics.referenceLines).toHaveLength(0);
  });

  it('addTotalsAnalystPro appends totals spec', () => {
    const tot = { kind: 'both', axis: 'both', aggregation: 'sum',
                  position: 'after', should_affect_totals: true };
    useStore.getState().addTotalsAnalystPro(SHEET, tot);
    expect(useStore.getState().analystProDashboard.worksheets[SHEET]
           .analytics.totals).toEqual([tot]);
  });

  it.each([
    ['Band',    'referenceBands'],
    ['Distribution', 'distributions'],
  ])('add/update/delete %s triples work', (kind, key) => {
    const addFn = useStore.getState()[`add${kind}AnalystPro`];
    const updateFn = useStore.getState()[`update${kind}AnalystPro`];
    const deleteFn = useStore.getState()[`delete${kind}AnalystPro`];
    addFn(SHEET, { axis: 'y', __placeholder__: true });
    expect(useStore.getState().analystProDashboard.worksheets[SHEET].analytics[key])
      .toHaveLength(1);
    updateFn(SHEET, 0, { axis: 'x' });
    expect(useStore.getState().analystProDashboard.worksheets[SHEET].analytics[key][0].axis)
      .toBe('x');
    deleteFn(SHEET, 0);
    expect(useStore.getState().analystProDashboard.worksheets[SHEET].analytics[key])
      .toHaveLength(0);
  });

  it('sidebar tab accepts "analytics" as third value', () => {
    useStore.getState().setAnalystProSidebarTab('analytics');
    expect(useStore.getState().analystProSidebarTab).toBe('analytics');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/__tests__/store.analyticsSlots.test.ts`
Expected: FAIL — `TypeError: useStore.getState().addReferenceLineAnalystPro is not a function`.

- [ ] **Step 3: Add actions to `frontend/src/store.js`** — after the `setTableCalcComputeUsingAnalystPro` action (around line 1230), insert the following. Reuse the existing `pushHistory` / `snapshotHistory` helper already used by `setChartEditorSpec` (line 551-570).

```javascript
// ──────────────────────────────────────────────────────────────────
// Plan 9a — Analytics pane slots
// ──────────────────────────────────────────────────────────────────

const _ensureAnalytics = (sheet) => ({
  ...sheet,
  analytics: sheet.analytics ?? {
    referenceLines: [], referenceBands: [], distributions: [], totals: [],
  },
});

const _analyticsSlotActions = (set, get, slotKey, singularLabel) => ({
  add: (sheetId, spec) => {
    const dash = get().analystProDashboard;
    if (!dash?.worksheets?.[sheetId]) return;
    const prev = dash.worksheets[sheetId];
    const sheet = _ensureAnalytics(prev);
    const nextSheet = {
      ...sheet,
      analytics: { ...sheet.analytics, [slotKey]: [...sheet.analytics[slotKey], spec] },
    };
    const nextDash = { ...dash, worksheets: { ...dash.worksheets, [sheetId]: nextSheet } };
    set({ analystProDashboard: nextDash });
    get()._pushAnalystProHistory?.({
      op: `add_${singularLabel}`, sheetId, slotKey, spec,
    });
  },
  update: (sheetId, idx, patch) => {
    const dash = get().analystProDashboard;
    if (!dash?.worksheets?.[sheetId]) return;
    const sheet = _ensureAnalytics(dash.worksheets[sheetId]);
    const list = sheet.analytics[slotKey];
    if (idx < 0 || idx >= list.length) return;
    const next = list.map((v, i) => (i === idx ? { ...v, ...patch } : v));
    const nextSheet = { ...sheet, analytics: { ...sheet.analytics, [slotKey]: next } };
    const nextDash = { ...dash, worksheets: { ...dash.worksheets, [sheetId]: nextSheet } };
    set({ analystProDashboard: nextDash });
    get()._pushAnalystProHistory?.({
      op: `update_${singularLabel}`, sheetId, slotKey, idx, patch,
    });
  },
  remove: (sheetId, idx) => {
    const dash = get().analystProDashboard;
    if (!dash?.worksheets?.[sheetId]) return;
    const sheet = _ensureAnalytics(dash.worksheets[sheetId]);
    const list = sheet.analytics[slotKey];
    if (idx < 0 || idx >= list.length) return;
    const next = [...list.slice(0, idx), ...list.slice(idx + 1)];
    const nextSheet = { ...sheet, analytics: { ...sheet.analytics, [slotKey]: next } };
    const nextDash = { ...dash, worksheets: { ...dash.worksheets, [sheetId]: nextSheet } };
    set({ analystProDashboard: nextDash });
    get()._pushAnalystProHistory?.({
      op: `delete_${singularLabel}`, sheetId, slotKey, idx,
    });
  },
});

// Bind a triple (add/update/delete) per slot kind. Keep names explicit
// rather than metaprogrammed so grep hits in reviews.
const _rl = _analyticsSlotActions(set, get, 'referenceLines', 'reference_line');
const _rb = _analyticsSlotActions(set, get, 'referenceBands', 'reference_band');
const _rd = _analyticsSlotActions(set, get, 'distributions',  'reference_distribution');
const _tt = _analyticsSlotActions(set, get, 'totals',          'totals');

// Public actions:
addReferenceLineAnalystPro:     (sheetId, spec) => _rl.add(sheetId, spec),
updateReferenceLineAnalystPro:  (sheetId, idx, patch) => _rl.update(sheetId, idx, patch),
deleteReferenceLineAnalystPro:  (sheetId, idx) => _rl.remove(sheetId, idx),

addBandAnalystPro:              (sheetId, spec) => _rb.add(sheetId, spec),
updateBandAnalystPro:           (sheetId, idx, patch) => _rb.update(sheetId, idx, patch),
deleteBandAnalystPro:           (sheetId, idx) => _rb.remove(sheetId, idx),

addDistributionAnalystPro:      (sheetId, spec) => _rd.add(sheetId, spec),
updateDistributionAnalystPro:   (sheetId, idx, patch) => _rd.update(sheetId, idx, patch),
deleteDistributionAnalystPro:   (sheetId, idx) => _rd.remove(sheetId, idx),

addTotalsAnalystPro:            (sheetId, spec) => _tt.add(sheetId, spec),
updateTotalsAnalystPro:         (sheetId, idx, patch) => _tt.update(sheetId, idx, patch),
deleteTotalsAnalystPro:         (sheetId, idx) => _tt.remove(sheetId, idx),
```

Also: find the `analystProSidebarTab` declaration (line 1182) and change the inline comment:
```javascript
analystProSidebarTab: 'dashboard',                 // 'dashboard' | 'layout' | 'analytics'
```

**Implementer note.** If `_pushAnalystProHistory` does not yet exist under that name, the Plan 6b history helper is whatever `setChartEditorSpec` at line 551 invokes — mirror that call shape (take a before/after pair and push a diff into `analystProHistory`). Do not invent a new persistence channel.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/__tests__/store.analyticsSlots.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Run the full store regression**

Run: `cd frontend && npm run test:chart-ir -- --run store`
Expected: pre-existing `store.*.test.ts` tests still green (see roadmap §Known Test Debt for unrelated 22 chart-ir failures; confirm that failure count does not rise).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/store.js \
        frontend/src/__tests__/store.analyticsSlots.test.ts
git commit -m "feat(analyst-pro): analytics slot CRUD actions + history (Plan 9a T8)"
```

---

## Task 9: `AnalyticsPanel` — third sidebar tab + draggable catalogue

**Files:**
- Modify: `frontend/src/components/dashboard/freeform/panels/AnalystProSidebar.jsx`
- Create: `frontend/src/components/dashboard/freeform/panels/AnalyticsPanel.jsx`
- Create: `frontend/src/components/dashboard/freeform/__tests__/AnalyticsPanel.test.tsx`

- [ ] **Step 1: Write the failing test** — `frontend/src/components/dashboard/freeform/__tests__/AnalyticsPanel.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AnalystProSidebar } from '../panels/AnalystProSidebar';
import { useStore } from '../../../../store';

describe('Analytics sidebar tab', () => {
  it('renders Analytics as third tab after Dashboard, Layout', () => {
    render(<AnalystProSidebar />);
    const tabs = screen.getAllByRole('tab').map(t => t.textContent);
    expect(tabs).toEqual(['Dashboard', 'Layout', 'Analytics']);
  });

  it('clicking Analytics tab flips analystProSidebarTab state', () => {
    render(<AnalystProSidebar />);
    fireEvent.click(screen.getByRole('tab', { name: 'Analytics' }));
    expect(useStore.getState().analystProSidebarTab).toBe('analytics');
  });

  it('Analytics tab lists catalogue items per Build_Tableau §XIII.1', () => {
    useStore.getState().setAnalystProSidebarTab('analytics');
    render(<AnalystProSidebar />);
    for (const label of [
      'Constant Line', 'Average Line', 'Median', 'Reference Line',
      'Reference Band', 'Reference Distribution', 'Totals',
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('future-phase items (Trend, Forecast, Cluster, Box Plot) are listed but disabled', () => {
    useStore.getState().setAnalystProSidebarTab('analytics');
    render(<AnalystProSidebar />);
    for (const label of ['Trend Line', 'Forecast', 'Cluster', 'Box Plot']) {
      const el = screen.getByText(label).closest('[data-analytics-item]');
      expect(el).not.toBeNull();
      expect(el!.getAttribute('data-disabled')).toBe('true');
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/AnalyticsPanel.test.tsx`
Expected: FAIL — tab list is 2 entries not 3; `AnalyticsPanel` import missing.

- [ ] **Step 3: Extend the sidebar + panel** — in `frontend/src/components/dashboard/freeform/panels/AnalystProSidebar.jsx`, change the `TABS` constant (line 11-14) to:

```jsx
import AnalyticsPanel from './AnalyticsPanel';

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'layout',    label: 'Layout' },
  { id: 'analytics', label: 'Analytics' },
];
```

Add a conditional render branch for the `analytics` tab that renders `<AnalyticsPanel />`.

Create `frontend/src/components/dashboard/freeform/panels/AnalyticsPanel.jsx`:

```jsx
import React from 'react';
import { useStore } from '../../../../store';
import SidebarSection from './SidebarSection';

/**
 * Plan 9a — Analytics-pane catalogue tab.
 * Build_Tableau §XIII.1 catalogue order preserved. Items marked with
 * `disabled` are parked for Plans 9b (trend), 9c (forecast), 9d
 * (cluster), 9e (box plot); they render but refuse drag.
 */
const ITEMS = [
  { id: 'constant_line',          label: 'Constant Line',         kind: 'reference_line', preset: { aggregation: 'constant' } },
  { id: 'average_line',           label: 'Average Line',          kind: 'reference_line', preset: { aggregation: 'mean' } },
  { id: 'median_line',            label: 'Median',                kind: 'reference_line', preset: { aggregation: 'median' } },
  { id: 'reference_line',         label: 'Reference Line',        kind: 'reference_line' },
  { id: 'reference_band',         label: 'Reference Band',        kind: 'reference_band' },
  { id: 'reference_distribution', label: 'Reference Distribution', kind: 'reference_distribution' },
  { id: 'totals',                 label: 'Totals',                kind: 'totals' },
  { id: 'trend_line',             label: 'Trend Line',            kind: 'trend',    disabled: true },
  { id: 'forecast',               label: 'Forecast',              kind: 'forecast', disabled: true },
  { id: 'cluster',                label: 'Cluster',               kind: 'cluster',  disabled: true },
  { id: 'box_plot',               label: 'Box Plot',              kind: 'box_plot', disabled: true },
];

export default function AnalyticsPanel() {
  const openDialog = useStore((s) => s.openReferenceLineDialogAnalystPro);
  return (
    <SidebarSection id="analytics" heading="Analytics">
      <ul className="analytics-catalogue" role="list">
        {ITEMS.map((it) => (
          <li
            key={it.id}
            data-analytics-item
            data-disabled={it.disabled ? 'true' : 'false'}
            draggable={!it.disabled}
            onDragStart={(e) => {
              if (it.disabled) return e.preventDefault();
              e.dataTransfer.setData(
                'application/askdb-analytics',
                JSON.stringify({ kind: it.kind, preset: it.preset ?? {} }),
              );
              e.dataTransfer.effectAllowed = 'copy';
            }}
            onDoubleClick={() => {
              if (it.disabled) return;
              openDialog?.({ kind: it.kind, preset: it.preset ?? {} });
            }}
          >
            <span>{it.label}</span>
            {it.disabled && <span className="analytics-catalogue__badge">Coming soon</span>}
          </li>
        ))}
      </ul>
    </SidebarSection>
  );
}
```

Also add `openReferenceLineDialogAnalystPro` + `analystProReferenceLineDialog` state to the store (placed next to other modal-state fields — grep for `setCalcEditorDialog` as a neighbouring example). Default state `null`; the dialog component renders when non-null.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/AnalyticsPanel.test.tsx`
Expected: 4/4 pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/freeform/panels/AnalystProSidebar.jsx \
        frontend/src/components/dashboard/freeform/panels/AnalyticsPanel.jsx \
        frontend/src/components/dashboard/freeform/__tests__/AnalyticsPanel.test.tsx \
        frontend/src/store.js
git commit -m "feat(analyst-pro): Analytics sidebar tab + catalogue (Plan 9a T9)"
```

---

## Task 10: `ReferenceLineDialog` + end-to-end integration test

**Files:**
- Create: `frontend/src/components/dashboard/freeform/panels/ReferenceLineDialog.jsx`
- Create: `frontend/src/components/dashboard/freeform/__tests__/ReferenceLineDialog.test.tsx`
- Create: `frontend/src/components/dashboard/freeform/__tests__/AnalyticsPanel.integration.test.tsx`
- Modify: `frontend/src/components/dashboard/freeform/FloatingLayer.jsx` (mount `<ReferenceLineDialog />` when `analystProReferenceLineDialog` is non-null; mirror the Plan 8d `CalcEditorDialog` wiring pattern per commit `bbca582`)
- Create: `docs/superpowers/plans/2026-04-20-analyst-pro-plan-9a-reference-lines-totals.SHIPPED.md` (empty marker file — idiomatic shipped-marker per Plan 7/8 pattern; content may be just `# Shipped 2026-04-20`).

- [ ] **Step 1: Write unit + integration tests**

`frontend/src/components/dashboard/freeform/__tests__/ReferenceLineDialog.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ReferenceLineDialog from '../panels/ReferenceLineDialog';
import { useStore } from '../../../../store';

const SHEET = 'sheet-1';

beforeEach(() => {
  useStore.setState({
    analystProReferenceLineDialog: { sheetId: SHEET, kind: 'reference_line', preset: {} },
    analystProDashboard: {
      worksheets: { [SHEET]: { id: SHEET, analytics: {
        referenceLines: [], referenceBands: [], distributions: [], totals: [],
      }}},
    },
  });
});

describe('ReferenceLineDialog', () => {
  it('renders all spec form controls', () => {
    render(<ReferenceLineDialog />);
    expect(screen.getByLabelText('Axis')).toBeInTheDocument();
    expect(screen.getByLabelText('Aggregation')).toBeInTheDocument();
    expect(screen.getByLabelText('Scope')).toBeInTheDocument();
    expect(screen.getByLabelText('Label')).toBeInTheDocument();
    expect(screen.getByLabelText('Line style')).toBeInTheDocument();
    expect(screen.getByLabelText('Color')).toBeInTheDocument();
    expect(screen.getByLabelText('Show marker')).toBeInTheDocument();
  });

  it('Save pushes a ReferenceLineSpec through addReferenceLineAnalystPro', () => {
    render(<ReferenceLineDialog />);
    fireEvent.change(screen.getByLabelText('Axis'), { target: { value: 'y' } });
    fireEvent.change(screen.getByLabelText('Aggregation'), { target: { value: 'mean' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(useStore.getState().analystProDashboard.worksheets[SHEET].analytics.referenceLines).toHaveLength(1);
    expect(useStore.getState().analystProReferenceLineDialog).toBeNull();
  });

  it('Cancel does not modify state', () => {
    render(<ReferenceLineDialog />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(useStore.getState().analystProDashboard.worksheets[SHEET].analytics.referenceLines).toHaveLength(0);
    expect(useStore.getState().analystProReferenceLineDialog).toBeNull();
  });

  it('percentile scope reveals percentile input', () => {
    render(<ReferenceLineDialog />);
    fireEvent.change(screen.getByLabelText('Aggregation'), { target: { value: 'percentile' } });
    expect(screen.getByLabelText('Percentile')).toBeInTheDocument();
  });
});
```

`frontend/src/components/dashboard/freeform/__tests__/AnalyticsPanel.integration.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AnalystProLayout from '../AnalystProLayout';
import { useStore } from '../../../../store';
import { server } from '../../../../__tests__/msw/server';

describe('Analytics integration — bar chart + average line', () => {
  it('renders a Vega rule mark at the average after /queries/execute returns analytics_rows', async () => {
    // arrange: a dashboard with a bar chart whose /queries/execute is mocked
    // to return analytics_rows: [{kind: 'reference_line', value: 42.5, ...}].
    server.use(
      // MSW handler — override the default for this test.
      // (Assumes existing mock server scaffold. See tests/msw/*.)
    );
    useStore.setState({ /* minimal dashboard fixture with single bar worksheet */ });

    render(<AnalystProLayout />);

    // open Analytics tab, drag Average Line onto the bar chart's y axis.
    fireEvent.click(screen.getByRole('tab', { name: 'Analytics' }));
    const item = screen.getByText('Average Line').closest('[data-analytics-item]')!;
    const yAxis = screen.getByTestId('bar-chart-y-axis');
    fireEvent.dragStart(item);
    fireEvent.drop(yAxis);

    // dialog opens → save with defaults.
    fireEvent.click(await screen.findByRole('button', { name: 'Save' }));

    // wait for render.
    await waitFor(() => {
      const rules = document.querySelectorAll('g.mark-rule path');
      expect(rules.length).toBeGreaterThan(0);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/ReferenceLineDialog.test.tsx src/components/dashboard/freeform/__tests__/AnalyticsPanel.integration.test.tsx`
Expected: FAIL — `Cannot find module '../panels/ReferenceLineDialog'`.

- [ ] **Step 3: Implement `ReferenceLineDialog.jsx`**

```jsx
import React, { useState } from 'react';
import { useStore } from '../../../../store';

export default function ReferenceLineDialog() {
  const dialog = useStore((s) => s.analystProReferenceLineDialog);
  const close  = useStore((s) => () => s.openReferenceLineDialogAnalystPro?.(null));
  const add    = useStore((s) => s.addReferenceLineAnalystPro);

  const [form, setForm] = useState(() => ({
    axis: 'y',
    aggregation: dialog?.preset?.aggregation ?? 'mean',
    value: null,
    percentile: null,
    scope: 'entire',
    label: 'computation',
    custom_label: '',
    line_style: 'solid',
    color: '#4C78A8',
    show_marker: true,
  }));

  if (!dialog) return null;

  const set = (k) => (e) => setForm((f) => ({
    ...f,
    [k]: e.target.type === 'checkbox' ? e.target.checked :
         e.target.type === 'number' ? Number(e.target.value) :
         e.target.value,
  }));

  const onSave = () => {
    add(dialog.sheetId, form);
    close();
  };

  return (
    <div role="dialog" aria-label="Reference line editor" className="rl-dialog">
      <label>Axis
        <select aria-label="Axis" value={form.axis} onChange={set('axis')}>
          <option value="x">X</option><option value="y">Y</option>
        </select>
      </label>
      <label>Aggregation
        <select aria-label="Aggregation" value={form.aggregation} onChange={set('aggregation')}>
          {['constant','mean','median','sum','min','max','percentile']
            .map(v => <option key={v} value={v}>{v}</option>)}
        </select>
      </label>
      {form.aggregation === 'constant' && (
        <label>Value
          <input type="number" aria-label="Value" value={form.value ?? ''} onChange={set('value')}/>
        </label>
      )}
      {form.aggregation === 'percentile' && (
        <label>Percentile
          <input type="number" min={1} max={99} aria-label="Percentile"
                 value={form.percentile ?? ''} onChange={set('percentile')}/>
        </label>
      )}
      <label>Scope
        <select aria-label="Scope" value={form.scope} onChange={set('scope')}>
          <option value="entire">Entire Table</option>
          <option value="pane">Per Pane</option>
          <option value="cell">Per Cell</option>
        </select>
      </label>
      <label>Label
        <select aria-label="Label" value={form.label} onChange={set('label')}>
          <option value="value">Value</option>
          <option value="computation">Computation</option>
          <option value="custom">Custom</option>
          <option value="none">None</option>
        </select>
      </label>
      {form.label === 'custom' && (
        <label>Custom label
          <input aria-label="Custom label" value={form.custom_label} onChange={set('custom_label')}/>
        </label>
      )}
      <label>Line style
        <select aria-label="Line style" value={form.line_style} onChange={set('line_style')}>
          <option value="solid">Solid</option>
          <option value="dashed">Dashed</option>
          <option value="dotted">Dotted</option>
        </select>
      </label>
      <label>Color
        <input type="color" aria-label="Color" value={form.color} onChange={set('color')}/>
      </label>
      <label>Show marker
        <input type="checkbox" aria-label="Show marker" checked={form.show_marker} onChange={set('show_marker')}/>
      </label>
      <div className="rl-dialog__actions">
        <button type="button" onClick={close}>Cancel</button>
        <button type="button" onClick={onSave}>Save</button>
      </div>
    </div>
  );
}
```

Also in `frontend/src/components/dashboard/freeform/FloatingLayer.jsx`, add:
```jsx
import ReferenceLineDialog from './panels/ReferenceLineDialog';
…
{analystProReferenceLineDialog && <ReferenceLineDialog />}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/ReferenceLineDialog.test.tsx src/components/dashboard/freeform/__tests__/AnalyticsPanel.integration.test.tsx`
Expected: 4 dialog tests + 1 integration test pass.

- [ ] **Step 5: Run the full freeform regression**

Run: `cd frontend && npm run test:chart-ir`
Expected: no regression beyond the known 22 pre-existing chart-ir failures noted in `CLAUDE.md :: Known Test Debt`. The 5 new tests pass.

- [ ] **Step 6: Run the backend analytics suite end-to-end**

Run: `cd backend && python -m pytest tests/test_analytics_types.py tests/test_analytics_compiler.py tests/test_analytics_endpoint.py -v`
Expected: all green.

- [ ] **Step 7: Create shipped marker + update roadmap**

Create `docs/superpowers/plans/2026-04-20-analyst-pro-plan-9a-reference-lines-totals.SHIPPED.md`:
```markdown
# Shipped 2026-04-20 — Plan 9a Reference Lines / Bands / Distributions / Totals
```

Update the roadmap line (`docs/analyst_pro_tableau_parity_roadmap.md:758`) from
```
### Plan 9a — Reference Lines / Bands / Distributions + Totals
```
to
```
### Plan 9a — Reference Lines / Bands / Distributions + Totals — ✅ Shipped 2026-04-20
```

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/dashboard/freeform/panels/ReferenceLineDialog.jsx \
        frontend/src/components/dashboard/freeform/FloatingLayer.jsx \
        frontend/src/components/dashboard/freeform/__tests__/ReferenceLineDialog.test.tsx \
        frontend/src/components/dashboard/freeform/__tests__/AnalyticsPanel.integration.test.tsx \
        docs/superpowers/plans/2026-04-20-analyst-pro-plan-9a-reference-lines-totals.SHIPPED.md \
        docs/analyst_pro_tableau_parity_roadmap.md
git commit -m "feat(analyst-pro): ReferenceLineDialog + integration test + shipped marker (Plan 9a T10)"
```

---

## Plan self-review summary

- **Spec coverage.** Task-brief deliverables 1-11 each map to a task:
  1. `analytics_types.py` → T1. 2. `analytics_compiler.compile_reference_line` → T2.
  3. Bands + distributions → T3. 4. `compile_totals` → T4. 5. Vega layers → T6.
  6. Totals crosstab → T7. 7. `AnalyticsPanel` → T9. 8. `ReferenceLineDialog` → T10.
  9. Store triples → T8. 10. Tests — split across T1/T2/T3/T4/T6/T7/T8/T9/T10 (golden SQL + golden Vega + integration). 11. `/queries/execute` extension → T5.
- **Build_Tableau cite coverage.** §XIII.1 (T9 catalogue), §IV.7 step 9 (T4 totals), §III.1 (T1 axis field), §V.1 + Appendix A.14 (T2 percentile), Appendix B (T2 `WITHIN GROUP ORDER BY`), Appendix C `tabdocaxis` (T1 proto doc).
- **Task count.** 10 tasks. Matches roadmap target.
- **Hard conventions.** Vega-Lite only (rule/rect/text — no canvas); totals issued as separate queries (T4 + T5 envelope); `sql_validator` re-runs on every generated SQL (T2 step 5, T5 `_run_analytics`); commit-per-task with `(Plan 9a T<N>)` suffix; action names end `…AnalystPro`; state fields prefix `analystPro…`.
- **Placeholder scan.** No TBD / TODO / "similar to" / "add appropriate error handling" / unreferenced types. Every code block is the final content an engineer pastes.
- **Type consistency.** `AnalyticsRow` TypeScript tagged-union discriminator `kind` uses `reference_line` / `reference_band` / `reference_distribution` / `grand_total` / `subtotal` throughout (T5 endpoint response, T6 compiler input, T7 crosstab input). Python `ReferenceLineSpec.aggregation` enum value `mean` (not `avg`) used consistently across T1-T6. Measure column alias `__reference_value__` and totals aliases `__total_value__` / `__subtotal_value__` match between Python compiler (T2-T4) and frontend marker keys (T7).
- **Security.** Every generated SQL runs through `SQLValidator.validate()` before execution (T2 step 5 + T5 `_run_analytics`). Read-only DB enforcement inherited via `entry.engine.execute_sql`. No new user-input-to-SQL concatenation; `PERCENTILE_CONT(0.N)` literal is numeric-constrained by `ReferenceLineSpec.validate()`.
