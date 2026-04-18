# Plan 8 — Chart-Spec Robustness & Empty-Chart Hardening

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans`. Every task has a Resume Trigger; do not re-implement passed tasks.

## Why this plan exists

The agent pipeline generates Vega-Lite specs dynamically from an NL question and a SQL result set. During live testing we found four distinct bug families where the SQL returned correct data but the chart rendered an empty plot area. Plan 7 T18 + T21 shipped two spec-repair passes (mark promotion, bad-aggregate repair). This plan enumerates every remaining failure mode and ships a unified `repairSpec` pipeline that covers them, plus UX fallbacks for the cases the pipeline can't fix.

## Failure-Mode Catalog (exhaustive)

Each row has: **Symptom** / **Why it happens** / **Repair strategy** / **Ship status**.

### A. Mark-type mismatches

| # | Symptom | Why | Repair | Status |
|---|---|---|---|---|
| A1 | `mark:"text"` + x/y → invisible glyphs | Agent default, no override | Promote to `bar` | ✅ T18 |
| A2 | `mark:"arc"` + x/y → empty plot | Arcs need theta, not x/y | Promote to `bar`; strip arc-only options | ✅ T21 |
| A3 | `mark: null` or missing | Agent omitted mark | Default to `bar` if x/y present, `text` otherwise | ⬜ T22 |
| A4 | `mark:"bars"` / `"lines"` (typos) | Non-standard string | Normalize to `bar` / `line` | ⬜ T22 |
| A5 | `mark:"geoshape"` with no projection | Projection omitted | Add default `mercator` projection OR promote to scatter | ⬜ T23 |
| A6 | `mark:"point"`/`"circle"` with no size encoding → invisible tiny dots | Missing size default | Inject `size: 60` default | ⬜ T23 |

### B. Aggregate misuse

| # | Symptom | Why | Repair | Status |
|---|---|---|---|---|
| B1 | `sum` / `mean` on nominal field → null bars | Agent mis-typed measure | Rewrite to `count`, drop field | ✅ T21 (partial — only sum) |
| B2 | `mean` on nominal → same null issue | Same root cause | Same repair, broader aggregate allowlist | ⬜ T22 |
| B3 | `max`/`min` on string → lexicographic nonsense | Implicit aggregate | Emit warning, fall back to `count` | ⬜ T23 |
| B4 | Missing aggregate on measure axis → raw rows stacked | No `aggregate` key | Add `aggregate: 'sum'` (or `count` if field nominal-named) | ⬜ T22 |

### C. Encoding-type errors

| # | Symptom | Why | Repair | Status |
|---|---|---|---|---|
| C1 | `color: { field: measure, type: 'nominal' }` → 500-entry legend, no bar colors | Agent defaulted nominal | Swap to `type: 'quantitative'` when field is the y.field | ⬜ T22 |
| C2 | `x.type: 'quantitative'` on string field → Vega drops rows | Type override wrong | Auto-infer type from data sample if available | ⬜ T23 |
| C3 | `temporal` type on non-parseable date string → null x-axis | Parse failure | Fallback to nominal + warn | ⬜ T23 |

### D. Missing required encodings

| # | Symptom | Why | Repair | Status |
|---|---|---|---|---|
| D1 | `mark:"bar"` with only x, no y → zero-height bars | Agent forgot measure | Inject `y: { aggregate: 'count', type: 'quantitative' }` | ⬜ T22 |
| D2 | `mark:"line"` missing y → nothing drawn | Same | Same fallback | ⬜ T22 |
| D3 | `mark:"arc"` missing theta → pie with zero slices | Agent used x/y on arc | Already handled by A2 promotion | ✅ T21 |
| D4 | `mark:"rect"` (heatmap) missing x OR y OR color | Partial spec | Emit warning, don't render | ⬜ T23 |

### E. Dimensional explosions

| # | Symptom | Why | Repair | Status |
|---|---|---|---|---|
| E1 | `color` with > 20 nominal values → legend consumes chart | High-cardinality field | Cap to top-N by count + "Other"; or drop color | ⬜ T22 |
| E2 | `x` nominal with > 50 values → overlapping labels | Too many categories | Rotate labels; auto-sort + top-N truncate | ⬜ T23 |
| E3 | `theta` with > 10 slices → unreadable pie | Too many categories | Auto top-5 + "Other" bucket | ⬜ T23 |

### F. Layout constraints

| # | Symptom | Why | Repair | Status |
|---|---|---|---|---|
| F1 | Cell < 120 px after wrap → marks clip | Too-small container | Reject wrap (guard) | ✅ Plan 7 T4 |
| F2 | Legend pushes plot width to 0 | Legend config | Auto-collapse legend when cell < 300 px | ⬜ T23 |
| F3 | `autosize:fit` squishes one axis when cell has extreme aspect ratio | Autosize math | Switch to `autosize: pad` for thin cells | ⬜ T23 |

### G. Data failures

| # | Symptom | Why | Repair | Status |
|---|---|---|---|---|
| G1 | Empty data array → only axes visible | Query returned 0 rows | Render "No data" overlay instead of empty plot | ⬜ T24 (UX) |
| G2 | All rows null on measure | Data quality | Same "No data" overlay + warn in tooltip | ⬜ T24 |
| G3 | Single row → 1-bar chart looks broken | Legit but surprising | No repair; show tile as-is | n/a |
| G4 | All measure values identical → axis scale collapses | Degenerate data | Pad y-domain with `nice: true` + explicit domain | ⬜ T23 |

### H. Transform issues

| # | Symptom | Why | Repair | Status |
|---|---|---|---|---|
| H1 | `transform:[{filter:"datum.x>0"}]` filters to 0 rows | Filter too strict | Detect empty post-filter → "No data after filters" | ⬜ T24 |
| H2 | `transform:[{aggregate:[...]}]` with wrong groupby | Spec error | Hard to auto-fix; emit warning | ⬜ T23 |

### I. Renderer-layer failures

| # | Symptom | Why | Repair | Status |
|---|---|---|---|---|
| I1 | Vega view constructor throws (unparseable spec) | Malformed spec | Wrap in try/catch; show error card | ⬜ T24 |
| I2 | Creative-lane WebGL context fails (Particle Flow, Hologram, Globe) | GPU / browser | Fall back to 2D renderer | ⬜ T24 |
| I3 | Map tile fetch fails (MapLibreRenderer) | Network / CORS | Placeholder background + retry button | ⬜ T24 |
| I4 | VizQL renderer path used with Vega-Lite spec that relies on v5 features | Schema drift | Add feature-detect + fallback | ⬜ T23 |

### J. Runtime / async issues

| # | Symptom | Why | Repair | Status |
|---|---|---|---|---|
| J1 | Tile data fetch errors → frame stays blank, no error shown | Error swallowed | Error boundary + visible error card | ⬜ T24 |
| J2 | Query timeout → same | Same | Same | ⬜ T24 |

---

## Plan

### T22 — Unified `repairSpec` pipeline (this commit batch)

**Goal:** one function `repairSpec(spec)` running all auto-repair passes in order. Replaces ad-hoc `promoteSpecMark` + `repairBadAggregate` calls in tile. Adds 4 new passes.

**Passes (in order):**

1. `fallbackNullMark` (A3, A4) — null/unknown mark → `bar` if x+y, `text` otherwise; typo normalization
2. `promoteSpecMark` (A1, A2) — existing
3. `repairBadAggregate` (B1, B2) — extend to cover `mean` / `average` / `median` / `min` / `max` on nominal-named fields
4. `repairMissingMeasure` (D1, D2) — bar/line without y → inject `count`
5. `repairColorTypeForMeasure` (C1) — `color.field === y.field` + `color.type === 'nominal'` → swap to `type: 'quantitative'`
6. `capColorCardinality` (E1) — if color is nominal and data sample has > 20 unique values, drop the color channel (fallback) and log

Each pass is identity-preserving on a clean spec so `useMemo` short-circuits still work.

**Task list:**

- [ ] T22.1 — `fallbackNullMark` pure helper + test
- [ ] T22.2 — Extend `repairBadAggregate` to cover `mean/avg/median/min/max` + test
- [ ] T22.3 — `repairMissingMeasure` pure helper + test
- [ ] T22.4 — `repairColorTypeForMeasure` pure helper + test
- [ ] T22.5 — `capColorCardinality` pure helper + test (needs data sample — optional arg)
- [ ] T22.6 — `repairSpec(spec, ctx?)` master function composing all passes + test
- [ ] T22.7 — Swap individual pass calls in `AnalystProWorksheetTile` for `repairSpec`
- [ ] T22.8 — Smoke (full vitest + lint + build)

**Resume trigger (single):** `grep -n "export function repairSpec" frontend/src/components/dashboard/freeform/lib/specPromotion.ts` returns a line AND `specPromotion.test.ts` contains a `describe('Plan 8 T22 — repairSpec')` block.

**Commit format:** `fix(analyst-pro): <pass name> repair (Plan 8 T22.N)` / `fix(analyst-pro): unify repairSpec pipeline (Plan 8 T22.6)`.

### T23 — Secondary-impact passes (follow-up)

Covers A5, A6, B3, B4, C2, C3, D4, E2, E3, F2, F3, G4, H2, I4. Lower prevalence than T22 items; individual tasks per row in the catalog.

### T24 — UX fallbacks for unrepairable cases (follow-up)

Covers G1, G2, H1, I1, I2, I3, J1, J2. Adds error-boundary + "No data" / "No data after filters" / "Chart unavailable" overlays.

---

## Shared conventions

- **TDD required** for every pass (pure helper → RED test → implement → GREEN → wire).
- **Identity preservation:** when no repair needed, return input reference unchanged.
- **No ordering surprises:** each pass's output must be a valid input to the next (idempotent).
- **No new backend changes.**
- **Commit per pass** with suffix `(Plan 8 T22.N)`.

---

## Session Resume Protocol

1. `git log --oneline --all | grep "Plan 8 T" | sort -u` to list shipped tasks.
2. Evaluate each task's Resume Trigger.
3. Only implement tasks whose trigger is FALSE.
4. At the end of any edit session, commit with the exact `(Plan 8 T22.N)` suffix so the next session's git-log scan finds it.

---

END OF PLAN 8.
