# UFSD Summary
Feature: Full BI-grade dimension/measure system with tile editability, smart custom metrics, trending intelligence, and chat-style agent panel
Scope Baseline: In — dim/measure auto-classification + override, tile field swapping with SQL regen, custom metrics formula editor with { autocomplete + function-aware context + validation + persistence + agent auto-creation, smart trending badge (time-series only), agent panel chat-bubble redesign + quick-action buttons, regression testing. Out — backend schema storage changes, new DB engine support, drag-and-drop field reordering, real-time collaboration, agent voice/image input, mobile-responsive agent panel.
Assumptions: 10 (see detail block)
Confidence: 5/5
Coverage: 8 explored / 9 visible (regression test strategy inferred)

---

# UFSD Detail

## What We're Building
Transform DataLens from a query-result viewer into a full BI tool with proper field classification, flexible chart editing, composable custom metrics, and a modern chat-style agent experience.

## Key Decisions

### 1. Dimension/Measure Classification (Slice 1)
- **Auto-detect** from SQL column data types: numeric → measure, string/date/boolean → dimension
- **User override**: toggle any field between dim/measure in TileEditor
- Classification persists per-tile in `tile.fieldClassifications = { colName: "dimension"|"measure" }`
- Dropdowns, primary measure selector, and custom metrics editor all respect classification
- "station" (string) auto-classified as dimension — no longer appears in measure dropdowns

### 2. Full Tile Editability (Slice 1)
- TileEditor shows ALL database columns (from schema cache via `schema_routes`)
- User can assign any column as X-axis dimension, Y-axis measure(s), color/group dimension
- Selecting a column NOT in current tile data triggers automatic SQL regeneration + execution
- SQL regen uses existing query engine (Haiku primary, Sonnet fallback)
- Existing columns remap visually without re-query (fast path)
- Three chart creation paths: SQL Editor, Agent Panel, or manual dimension/measure picker

### 3. Custom Metrics Formula Editor (Slice 2)
- Typing `{` triggers autocomplete dropdown showing ALL database columns
- **Function-aware context detection** via lookup table:
  - Measure-preferring: SUM, AVG, MAX, MIN, STDDEV, VAR/VARIANCE, STDEV
  - Dimension-preferring: COUNT, COUNTD/COUNT(DISTINCT), MEDIAN, MODE
  - Neutral/unknown: show all fields
- Dropdown always shows sections: "Dimensions" / "Measures" with appropriate section first
- Lookup table is extensible (config object, not hardcoded conditionals)
- **Validation gate**: metric must pass test execution (formulaSandbox.js) before saving
- Persistence: dashboard-level `customMetrics` array (existing pattern)
- CRUD: create, edit, delete custom metrics; stored per-dashboard, available across all tiles
- **Agent auto-creation**: agent can create custom metrics based on user prompts (new tool or prompt interpretation)

### 4. Smart Trending Badge (Slice 3)
- Only display on charts where X-axis column is date/time type
- Reuse dim/measure type inference for date detection
- Suppress entirely on categorical X-axis (bar charts sorted by name, etc.)
- Keep existing linear regression algorithm (slope > 0.1*stdev threshold)
- Requires >= 3 temporal data points

### 5. Agent Panel UX Redesign (Slice 3)
- **Chat-style message bubbles**: user messages right-aligned (accent color), agent messages left-aligned (surface color)
- **Timestamps** on messages
- **Quick-action buttons** below every agent response: "Continue", "OK", free-text input always visible
- **Hybrid input for ask_user**: suggested button options + free-text field simultaneously
- **Visual hierarchy**: clear user/agent distinction, tool calls collapsed by default, results expanded
- Frontend-only changes — no backend SSE protocol modifications
- Quick-action buttons generated client-side (not from backend)

### 6. Regression Testing (Slice 4)
- End-to-end exercise: tile CRUD, field classification, field swaps (remap + regen), custom metrics CRUD + agent-create, trending badge presence/absence, agent panel interactions
- Test across multiple chart types (bar, line, pie, kpi, table, scatter)
- Verify no regressions in: dashboard save/load, global filters, cross-filtering, data blending, presentation engine

## Assumptions
1. Auto-detect uses SQL column data types (numeric → measure, string/date/boolean → dimension)
2. Schema column list reuses existing schema_routes / ChromaDB schema cache
3. SQL regeneration on column swap uses existing query engine (Haiku → Sonnet fallback)
4. Custom metrics persist at dashboard level (current behavior), available across all tiles
5. Agent can create custom metrics via tool or prompt interpretation
6. Trending badge date detection reuses dim/measure type inference
7. Agent panel redesign is frontend-only; no backend SSE protocol changes
8. Quick-action buttons are frontend-generated (not sent from backend)
9. Function-aware autocomplete uses extensible lookup table (config object)
10. Custom metrics must pass test execution before saving; agent-created metrics also validated

## Success Criteria
1. "station" (string column) auto-classified as dimension; doesn't appear in measure dropdowns
2. User can swap any measure/dimension in a tile, including columns from other tables (triggers SQL regen)
3. Typing `SUM({` shows measures first; `COUNT({` shows dimensions first; `MEDIAN({` shows dimensions first; unknown functions show all with section headers
4. Custom metrics are validated before save — failed formulas cannot be saved
5. Trending badge only appears on charts with temporal X-axis
6. Agent panel visually matches modern chat UIs (message bubbles, quick actions, timestamps)
7. All existing dashboard features continue working (regression pass)

## Edge Cases
- Column with numeric name (e.g., "2024") — auto-detect may misclassify; user override handles it
- Empty tile (no SQL yet) — field picker shows DB columns, user builds chart from scratch
- Custom metric referencing a deleted column — validation catches at test time, shows error
- Agent creates metric with invalid formula — validation gate prevents saving, agent retries
- Tile with 50+ columns — dropdown needs search/filter for usability
- SQL regen fails (timeout, syntax) — show error in tile, preserve previous data

---

## Planning Appendix (2026-04-09)

**Planning complete.** Branch: `feature/bi-editability-agent-ux`. Fingerprint: Dashboard tiles support auto-detected dim/measure classification with user override, full schema column access with SQL regen, `{`-triggered function-aware formula autocomplete, time-series-only trending badges, and chat-bubble agent panel with hybrid quick-action input.

### Planning Assumptions
- P1: GET /schema/tables returns column data types — VALIDATED
- P2: Schema columns fetched once on TileEditor mount — VALIDATED
- P3: SQL regen uses simple SELECT rewrite — UNVALIDATED (RISK-1: complex SQL falls back to agent)
- P4: fieldClassifications added to tile dict without backend changes — VALIDATED
- P5: Adding tool #12 to agent dispatch is safe — VALIDATED

### Invariant List
- Inv-1: Read-only DB enforcement on all SQL
- Inv-2: PII masking before any data return
- Inv-3: Two-step query flow (generate → execute)
- Inv-4: Agent guardrails (budget, timeouts, retries)
- Inv-5: Custom metrics validated before save
- Inv-6: Tile save preserves runtime rows/columns
- Inv-7: All 13 SSE step types render correctly

### Failure Mode Map
1. FM-1: Schema fetch latency on large schemas → mitigated by 200-col cap + search filter
2. FM-2: SQL regen invalid for complex SQL → mitigated by complexity detection + agent fallback
3. FM-3: Formula `{` autocomplete cursor conflicts → mitigated by keypress-only trigger
4. FM-4: Chat bubble redesign breaks step types → mitigated by wrapping existing renderers
5. FM-5: fieldClassifications not persisted → mitigated by dedicated persistence task + invariant check

### Counterfactual Gate
Against: FM-2 — SQL regen for complex tiles produces invalid SQL.
Accepted because: Progressive enhancement with agent fallback. Simple tiles auto-regen, complex tiles get "use Agent" prompt.
