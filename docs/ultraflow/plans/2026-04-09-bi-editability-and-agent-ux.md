# Plan: BI Editability & Agent UX
**Spec**: `docs/ultraflow/specs/UFSD-2026-04-09-bi-editability-and-agent-ux.md`
**UFSD**: Same file (combined spec+detail)
**Approach**: Integrated Vertical Slices — Slice 1 (dim/measure + tile edit), Slice 2 (custom metrics formula), Slice 3 (trending + agent UX), Slice 4 (regression)
**Branch**: `feature/bi-editability-agent-ux`

## Assumption Registry
- ASSUMPTION-P1: `GET /schema/tables` returns column data types — VALIDATED (schema_routes.py line 33)
- ASSUMPTION-P2: Schema columns fetched once on TileEditor mount, cached in component state — VALIDATED (api.getTables() at api.js line 287)
- ASSUMPTION-P3: SQL regen for column swap uses simple SELECT pattern — UNVALIDATED — risk: complex SQL tiles need agent-assisted regen
- ASSUMPTION-P4: `fieldClassifications` added to tile dict without backend model changes — VALIDATED (tiles are plain dicts)
- ASSUMPTION-P5: Adding tool #12 to agent dispatch is safe under tool budget — VALIDATED (MAX_TOOL_CALLS=100)

## Invariant List
- Invariant-1: Read-only DB enforcement (sql_validator + driver READ ONLY) on all SQL
- Invariant-2: PII masking via `mask_dataframe()` before any data return
- Invariant-3: Two-step query flow (generate → execute)
- Invariant-4: Agent guardrails (tool budget, timeouts, retries)
- Invariant-5: Custom metrics validated before save (formulaSandbox test must pass)
- Invariant-6: Tile save preserves runtime rows/columns (optimistic merge)
- Invariant-7: All 13 existing SSE step types continue rendering correctly

## Failure Mode Map
1. FM-1: Schema column fetch adds latency to TileEditor open on large schemas (500+ columns)
2. FM-2: SQL regen produces invalid SQL for complex joins/CTEs
3. FM-3: Formula `{` autocomplete conflicts with textarea cursor behavior
4. FM-4: Chat bubble redesign breaks existing 13 step type renderers
5. FM-5: `fieldClassifications` not persisted through save/load cycle

---

## SLICE 1: Dimension/Measure Classification + Tile Editability

### Task 1.1: Create fieldClassification utility module (~5 min)
- **Files**: `frontend/src/lib/fieldClassification.js` (create)
- **Intent**: Utility module that exports:
  - `classifyColumns(columns, rows, existingClassifications)` — auto-detects dim/measure from data types. Numeric columns → "measure", string/date/boolean → "dimension". Merges with any user overrides from `existingClassifications`. Returns `{ colName: "dimension"|"measure" }` map.
  - `isDateColumn(colName, rows)` — heuristic: checks if >80% of non-null values in first 20 rows parse as dates (ISO, US, EU formats). Used by trending badge (Task 3.1).
  - `MEASURE_FUNCTIONS` — config object mapping function names to preferred field type: `{ SUM: "measure", AVG: "measure", MAX: "measure", MIN: "measure", STDDEV: "measure", VAR: "measure", VARIANCE: "measure", STDEV: "measure", COUNT: "dimension", COUNTD: "dimension", "COUNT(DISTINCT)": "dimension", MEDIAN: "dimension", MODE: "dimension" }`.
  - `getFieldSuggestions(functionName, classifications)` — returns `{ dimensions: [...], measures: [...], preferred: "dimension"|"measure"|"all" }` based on MEASURE_FUNCTIONS lookup.
- **Invariants**: none
- **Test**: Import in browser console or add inline `console.assert` tests. `classifyColumns(["id","name","revenue"], [{id:1,name:"foo",revenue:100}], {})` → `{id:"measure", name:"dimension", revenue:"measure"}`. `isDateColumn("created_at", [{created_at:"2024-01-01"},...])` → `true`.
- **Commit**: `feat: add fieldClassification utility with auto-detect and function-aware suggestions`

### Task 1.2: Add schema column fetch to TileEditor (~5 min)
- **Files**: `frontend/src/components/dashboard/TileEditor.jsx` (modify)
- **Intent**: On mount, fetch ALL database columns via `api.getTables(connId)`. Extract flat column list with types from response. Store in `schemaColumns` state. Merge with `tile.columns` to create `allColumns` — the union of schema columns and tile result columns. Add `connId` prop (passed from DashboardBuilder). Add loading state for schema fetch. If fetch fails, fall back to tile.columns only (graceful degradation).
- **Key changes**:
  - Add `useEffect` to fetch schema on mount: call `api.getTables()`, flatten `tables[*].columns` into `[{name, type, table}]`
  - New state: `schemaColumns` (array), `schemaLoading` (bool)
  - Compute `allColumns = [...new Set([...schemaColumns.map(c=>c.name), ...baseColumns, ...metricNames])]`
  - Replace `columns` references in measures section and primary measure dropdown with `allColumns`
  - FM-1 mitigation: limit schema fetch to first 200 columns; add search/filter input above column list
- **Invariants**: Invariant-6 (tile save must preserve runtime rows/columns — don't modify save logic)
- **Invariant-Check**: After saving a tile with new classifications, reload dashboard and verify `tile.rows` and `tile.columns` are preserved
- **Test**: Open TileEditor for a tile → verify dropdown shows DB columns beyond just query result columns. Search filter narrows results.
- **Commit**: `feat: fetch schema columns in TileEditor with search filter`

### Task 1.3: Add dimension/measure toggle UI in TileEditor (~5 min)
- **Files**: `frontend/src/components/dashboard/TileEditor.jsx` (modify)
- **Intent**: Replace flat "Measures" checkbox list with a two-section layout: "Dimensions" section and "Measures" section. Each column shows a small toggle button (D/M) to reclassify. Uses `classifyColumns()` from Task 1.1 for initial classification. Override stored in `fieldClassifications` state. Sections filter `allColumns` by classification. Primary Measure dropdown only shows columns classified as "measure".
- **Key changes**:
  - Import `classifyColumns` from `fieldClassification.js`
  - New state: `fieldClassifications` initialized via `classifyColumns(allColumns, tile.rows, tile.fieldClassifications || {})`
  - Replace measures section (lines 373-418) with two sections: Dimensions (checkbox + D/M toggle) and Measures (checkbox + D/M toggle)
  - Primary Measure dropdown (lines 403-417): filter options to only `classification === "measure"` columns
  - Toggle handler: flips column between dim/measure in `fieldClassifications` state
  - Include `fieldClassifications` in `handleSave` updated tile object (line 221-250)
- **Invariants**: Invariant-5 (custom metrics always classified as "measure" — don't allow reclassification of metric names)
- **Invariant-Check**: Create a custom metric → verify it appears in Measures section and cannot be toggled to Dimension
- **Test**: Open TileEditor → "station" appears in Dimensions, "total_rides" in Measures. Toggle "station" to Measure → it moves sections. Primary Measure dropdown no longer shows dimensions.
- **Commit**: `feat: dimension/measure classification with auto-detect and user toggle`

### Task 1.4: Wire fieldClassifications through DashboardBuilder (~3 min)
- **Files**: `frontend/src/pages/DashboardBuilder.jsx` (modify)
- **Intent**: Pass `connId` prop to TileEditor (from `activeConnId` in store). Ensure `fieldClassifications` is included in tile save payload and persisted through the optimistic merge (line 1032). On tile load, `fieldClassifications` flows back to TileEditor via `editingTile` prop.
- **Key changes**:
  - At TileEditor invocation (line 2091-2101): add `connId={activeConnId}` prop
  - In `handleTileSave` optimistic merge (line 1022-1038): ensure `fieldClassifications` is NOT stripped — it should persist like `visualConfig`
  - FM-5 mitigation: verify `fieldClassifications` round-trips through save → API → reload
- **Invariants**: Invariant-6 (optimistic merge preserves rows/columns)
- **Invariant-Check**: Save tile with field classifications → reload page → open TileEditor → verify classifications restored
- **Test**: Classify a column as dimension → save → reload dashboard → open editor → classification persists.
- **Commit**: `feat: persist fieldClassifications through tile save/load cycle`

### Task 1.5: SQL regeneration on column swap (~5 min)
- **Files**: `frontend/src/components/dashboard/TileEditor.jsx` (modify), `frontend/src/api.js` (modify)
- **Intent**: When user enables a column from `schemaColumns` that is NOT in current `tile.columns`, trigger SQL regeneration. Use existing `api.generateQuery()` or construct a simple SELECT. Show loading indicator on the column while SQL executes. On success, update tile's `sql`, `columns`, `rows` in editor state. On failure, show inline error and revert checkbox.
- **Key changes**:
  - New handler `handleColumnAdd(colName)`: if `colName` not in `tile.columns`, call backend to generate + execute SQL including the new column
  - Use `api.refreshTile()` approach — construct modified SQL adding the column to existing SELECT, validate, execute
  - Simpler approach for ASSUMPTION-P3 risk: if tile has simple SQL, rewrite SELECT list. If SQL is complex (contains JOIN, CTE, subquery), show prompt "Complex SQL detected — edit SQL manually or use Agent to add this column" instead of auto-rewriting
  - New api helper: `api.generateColumnSQL(connId, existingSQL, newColumn)` — backend endpoint that uses query engine to rewrite SQL (or returns error for complex SQL)
  - Loading state per column: `loadingColumns` set
- **Invariants**: Invariant-1 (all generated SQL must go through sql_validator), Invariant-2 (results must be PII-masked)
- **Invariant-Check**: Swap in a column → verify SQL validator runs (check backend logs for "SQL validated" message)
- **Test**: Enable a DB column not in current data → SQL regenerates → new data appears. Try on a complex CTE tile → shows "use Agent" prompt instead.
- **Commit**: `feat: SQL regeneration when adding new schema columns to tiles`

### Task 1.6: Backend endpoint for column SQL generation (~5 min)
- **Files**: `backend/routers/dashboard_routes.py` (modify)
- **Intent**: New endpoint `POST /api/v1/dashboards/generate-column-sql` that takes `{conn_id, existing_sql, new_columns: [col1, col2]}` and returns rewritten SQL. Uses sqlglot to parse existing SQL, add columns to SELECT list. If SQL is too complex (CTE, >2 JOINs, UNION), returns `{error: "complex_sql", message: "Use Agent to modify this query"}`. Validates output through sql_validator.
- **Key changes**:
  - New Pydantic model: `GenerateColumnSQLBody(conn_id: str, existing_sql: str, new_columns: list[str])`
  - New endpoint: parse SQL with sqlglot, detect complexity, rewrite SELECT list, validate, return `{sql: str}` or `{error: str}`
  - Import sqlglot (already a dependency for sql_validator.py)
- **Invariants**: Invariant-1 (output SQL validated), Invariant-3 (this is generation only, not execution)
- **Invariant-Check**: Call endpoint with `DROP TABLE` in existing_sql → verify sql_validator rejects it
- **Test**: `POST` with simple SELECT → returns expanded SQL. `POST` with CTE → returns `{error: "complex_sql"}`.
- **Commit**: `feat: backend endpoint to rewrite SQL SELECT list for column addition`

---

## SLICE 2: Custom Metrics Formula Editor with { Autocomplete

### Task 2.1: Build FormulaInput component with { autocomplete (~5 min)
- **Files**: `frontend/src/components/dashboard/FormulaInput.jsx` (create)
- **Intent**: Controlled textarea component that detects `{` keypress and shows a positioned dropdown. Dropdown shows all database columns from `schemaColumns` prop, separated into "Dimensions" and "Measures" sections based on `fieldClassifications` prop. Dropdown filters as user types after `{`. Selecting a column inserts `{colName}` and closes dropdown. Pressing `}` or Escape closes dropdown.
- **Key changes**:
  - Props: `value`, `onChange`, `schemaColumns`, `fieldClassifications`, `placeholder`
  - State: `showDropdown`, `dropdownFilter`, `cursorPosition`, `dropdownPosition`
  - `onKeyDown` handler: detect `{` → open dropdown, track cursor position
  - `onChange` handler: filter dropdown items based on text between `{` and cursor
  - Dropdown positioned absolutely relative to textarea cursor (use `getCaretCoordinates` helper or textarea `selectionStart`)
  - Sections: "Dimensions" header + dim columns, "Measures" header + measure columns
  - FM-3 mitigation: only trigger dropdown when `{` is typed (not on paste or programmatic value changes)
- **Invariants**: none
- **Test**: Type `SUM({` → dropdown appears with measures section first. Type `rev` → filters to "revenue". Select → inserts `{revenue}`. Press Escape → closes.
- **Commit**: `feat: FormulaInput component with { autocomplete and dim/measure sections`

### Task 2.2: Add function-aware context detection to FormulaInput (~4 min)
- **Files**: `frontend/src/components/dashboard/FormulaInput.jsx` (modify)
- **Intent**: When dropdown opens, look backward from cursor to find enclosing function name. Use `getFieldSuggestions()` from fieldClassification.js to determine which section appears first and is highlighted. If inside `SUM(`, measures section first. If inside `COUNT(`, dimensions first. If no enclosing function, show all with measures first (default).
- **Key changes**:
  - Helper `detectEnclosingFunction(text, cursorPos)`: scans backward for pattern `FUNCNAME(` before cursor. Returns function name or null.
  - On dropdown open: call `detectEnclosingFunction`, then `getFieldSuggestions(funcName, classifications)`
  - Reorder sections: preferred type section first, other second
  - Highlight preferred section header with accent color
- **Invariants**: none
- **Test**: Type `SUM({` → measures first. `COUNT({` → dimensions first. `{` alone → all fields, measures first. `MEDIAN({` → dimensions first.
- **Commit**: `feat: function-aware context detection in formula autocomplete`

### Task 2.3: Integrate FormulaInput into MetricEditor (~4 min)
- **Files**: `frontend/src/components/dashboard/MetricEditor.jsx` (modify)
- **Intent**: Replace the plain textarea (lines 148-153) with the new `FormulaInput` component. Pass `schemaColumns` and `fieldClassifications` as props. MetricEditor needs to receive these from DashboardBuilder. Also pass them through to enable autocomplete.
- **Key changes**:
  - Import `FormulaInput` from `./FormulaInput`
  - Replace `<textarea>` at line 148-153 with `<FormulaInput value={formula} onChange={setFormula} schemaColumns={schemaColumns} fieldClassifications={fieldClassifications} />`
  - Add props to MetricEditor: `schemaColumns`, `fieldClassifications`
  - Keep existing hint buttons (SUM, AVG, COUNT) below FormulaInput — they insert text at cursor
- **Invariants**: Invariant-5 (validation gate — existing test flow must still work)
- **Invariant-Check**: Create a metric with invalid formula → Test button shows error → Save button remains disabled
- **Test**: Open MetricEditor → type `SUM({` → dropdown shows columns. Select one → formula shows `SUM({revenue})`. Test button works. Save succeeds.
- **Commit**: `feat: integrate FormulaInput with autocomplete into MetricEditor`

### Task 2.4: Wire schema columns to MetricEditor from DashboardBuilder (~3 min)
- **Files**: `frontend/src/pages/DashboardBuilder.jsx` (modify)
- **Intent**: Fetch schema columns (same as Task 1.2 pattern) and pass to MetricEditor. Cache schema columns at DashboardBuilder level so both TileEditor and MetricEditor share the same data without duplicate fetches.
- **Key changes**:
  - Lift schema fetch to DashboardBuilder: `useEffect` fetches `api.getTables()` on `activeConnId` change, stores in `schemaColumns` state
  - Pass `schemaColumns` and a default `fieldClassifications` (from `classifyColumns`) to both TileEditor and MetricEditor
  - TileEditor can still override per-tile, but gets initial schema-level classifications
  - At MetricEditor invocation (line 2105-2112): add `schemaColumns={schemaColumns} fieldClassifications={defaultClassifications}`
- **Invariants**: none
- **Test**: Open MetricEditor from toolbar → formula autocomplete shows all DB columns.
- **Commit**: `feat: share schema columns between TileEditor and MetricEditor via DashboardBuilder`

### Task 2.5: Enforce validation gate on metric save (~3 min)
- **Files**: `frontend/src/components/dashboard/MetricEditor.jsx` (modify)
- **Intent**: Prevent saving a metric that hasn't been successfully tested. Add `testPassed` state per metric. Test button sets `testPassed = true` on success, `false` on error. Save button for individual metric disabled unless `testPassed`. Editing the formula resets `testPassed` to false. This enforces UFSD assumption 10.
- **Key changes**:
  - New state: `testResults` map `{ metricId: { passed: bool, value: number|null, error: string|null } }`
  - On formula change: reset `testResults[metricId]`
  - On test success: set `testResults[metricId] = { passed: true, value }`
  - Save button: disabled if any item in `items` has !testResults[id]?.passed
  - Show green checkmark next to tested metrics, red X next to failed
- **Invariants**: Invariant-5 (custom metrics validated before save)
- **Invariant-Check**: Try saving with untested formula → blocked. Test → passes → save works. Edit formula → must re-test.
- **Test**: Create metric → type formula → Save disabled. Click Test → success → Save enabled. Edit formula → Save disabled again.
- **Commit**: `feat: enforce validation gate on custom metric save`

### Task 2.6: Agent tool for custom metric creation (~5 min)
- **Files**: `backend/agent_engine.py` (modify)
- **Intent**: Add new tool `create_custom_metric` to agent's tool set. Tool takes `{dashboard_id, name, formula, description}`. Validates formula syntax server-side (basic tokenization check). Returns success or validation error. Agent can auto-create metrics when user asks "create a metric for average revenue per customer".
- **Key changes**:
  - Add tool definition to `DASHBOARD_TOOL_DEFINITIONS` (after line 231): name `create_custom_metric`, params: `dashboard_id`, `name`, `formula`, `description`
  - Add handler `_tool_create_custom_metric()`: loads dashboard, appends to `customMetrics` array, saves, returns success
  - Add to dispatch dict (line 745-757)
  - Basic formula validation: tokenize with a simple regex (alphanumeric, parens, operators, braces) — reject if contains suspicious patterns
- **Invariants**: Invariant-4 (tool counts toward budget), Invariant-1 (formula is NOT SQL — no sql_validator needed, but sanitize for XSS)
- **Test**: Agent prompt "create a custom metric called ARPU that calculates SUM(revenue)/COUNT(DISTINCT customer_id)" → agent calls tool → metric appears in dashboard.
- **Commit**: `feat: agent tool for creating custom metrics on dashboards`

---

## SLICE 3: Smart Trending Badge + Agent Panel UX Redesign

### Task 3.1: Smart trending badge — time-series only (~4 min)
- **Files**: `frontend/src/components/dashboard/TileWrapper.jsx` (modify)
- **Intent**: Modify trending badge computation (lines 107-124) to only calculate when X-axis column is a date/time type. Use `isDateColumn()` from fieldClassification.js. If X-axis is not temporal, return null (no badge). X-axis column = first column in `tile.columns` that is NOT in `activeMeasures` (the dimension axis).
- **Key changes**:
  - Import `isDateColumn` from `../../lib/fieldClassification`
  - In trend `useMemo` (line 107): identify X-axis column (first non-measure column), call `isDateColumn(xCol, chartRows)`, return null early if not temporal
  - Keep existing linear regression logic intact for temporal data
  - Badge color: green for up, red for down (unchanged)
- **Invariants**: none
- **Test**: Tile with date X-axis → shows trending badge. Tile with categorical X-axis (station names) → no badge. Tile with ascending-sorted categorical → no badge (fixes reported bug).
- **Commit**: `fix: trending badge only displays on time-series charts`

### Task 3.2: Agent panel — chat bubble message layout (~5 min)
- **Files**: `frontend/src/components/agent/AgentStepFeed.jsx` (modify)
- **Intent**: Redesign step rendering to use chat-style message bubbles. User messages (user_query) right-aligned with accent background. Agent messages (result, thinking, plan) left-aligned with surface background. Tool calls collapsed into a compact "tool used" summary (expandable). Timestamps on every message. Clear visual grouping.
- **Key changes**:
  - New wrapper component `ChatBubble({align, color, timestamp, children})`: renders a message bubble with appropriate alignment, border-radius (rounded corners except the "tail" corner), timestamp in muted text
  - `user_query` (line 363-371): wrap in `<ChatBubble align="right" color={TOKENS.accent}>` with right-aligned flex
  - `result` (line 384-398): wrap in `<ChatBubble align="left" color={TOKENS.bg.surface}>`
  - `thinking` (line 373-378): small left-aligned italic bubble, compact
  - `tool_call` (line 380-382): collapsed single line "Used: {tool_name}" with expand arrow → existing RunSqlStepRenderer
  - `plan` (line 412-449): left-aligned bubble with purple accent
  - `error` (line 621-625): left-aligned bubble with danger border
  - Add timestamp to each step: `step.timestamp || new Date().toISOString()` → format as "HH:MM"
  - Preserve all 13 step type renderers — just wrap them in ChatBubble
- **Invariants**: Invariant-7 (all 13 existing step types must continue rendering)
- **Invariant-Check**: Trigger each step type → verify it renders correctly inside bubble wrapper. Specifically check tier_routing, cached_result, live_correction, progress.
- **Test**: Ask agent a question → user message appears right-aligned in blue bubble. Agent thinking appears left in compact bubble. Tool calls show collapsed. Final result in left bubble with timestamp.
- **Commit**: `feat: chat-style message bubbles for agent step feed`

### Task 3.3: Agent panel — quick-action buttons (~5 min)
- **Files**: `frontend/src/components/agent/AgentQuestion.jsx` (modify), `frontend/src/components/agent/AgentPanel.jsx` (modify)
- **Intent**: Redesign AgentQuestion to show BOTH button options AND free-text input simultaneously (hybrid mode). Add persistent quick-action buttons ("Continue", "OK", "Tell me more") below every non-error agent response, even when agent isn't in `ask_user` state. These quick actions submit as new agent queries.
- **Key changes in AgentQuestion.jsx**:
  - Remove the if/else between options and text input — show both: option buttons at top, text input below
  - Style buttons as pills (rounded, smaller) in a horizontal wrap
  - Text input always visible below buttons with "Type a custom response..." placeholder
  - Add "Other..." button at end of options that focuses the text input
- **Key changes in AgentPanel.jsx**:
  - After the last agent step (when not loading and not waiting), render quick-action row: "Continue", "OK", "Tell me more" buttons
  - Clicking a quick action calls `handleSubmit` with the button text as input
  - Style: subtle, smaller than main input, ghost/outline style
  - Hide quick actions during loading/streaming
- **Invariants**: Invariant-7 (ask_user flow still works — agentRespond API unchanged)
- **Test**: Agent asks a question with options → buttons AND text input visible. Click option → responds. Agent finishes answering → "Continue", "OK", "Tell me more" buttons appear below. Click "Continue" → sends new query.
- **Commit**: `feat: hybrid quick-action buttons with persistent input in agent panel`

### Task 3.4: Agent panel — visual polish and input redesign (~4 min)
- **Files**: `frontend/src/components/agent/AgentPanel.jsx` (modify)
- **Intent**: Modernize the footer input area to match ChatGPT/Claude style: rounded input container with send button inside (not beside), subtle border glow on focus, placeholder animation. Improve the header — smaller, cleaner icons. Add subtle transition when new messages arrive.
- **Key changes**:
  - Input container: single rounded box with input + send button inside, `border: 1px solid ${TOKENS.border.default}`, `borderRadius: xl`, `background: ${TOKENS.bg.base}`
  - Send button: circular, accent color, inside the input container on the right
  - Focus state: border color transitions to accent
  - Stop button: red circular icon, replaces send button during loading
  - Header: reduce padding, use 20px icons instead of 24px, remove excess gaps
  - New message arrival: subtle slide-up animation for new bubbles (CSS keyframe)
- **Invariants**: none
- **Test**: Visual inspection — input looks like a modern chat bar. Focus → border glows blue. Send button is circular inside the input. Header is more compact.
- **Commit**: `feat: modernize agent panel input and header styling`

---

## SLICE 4: Regression Testing

### Task 4.1: Create regression test script (~5 min)
- **Files**: `backend/test_bi_editability.py` (create)
- **Intent**: Manual regression test script (consistent with project's no-pytest pattern). Tests the backend endpoints added/modified: column SQL generation, custom metric agent tool, tile save with fieldClassifications. Exercises the full flow: connect → fetch schema → generate column SQL → save tile → verify round-trip.
- **Key changes**:
  - Script structure: `main()` with sequential test functions
  - `test_schema_has_types()`: GET /schema/tables → verify columns have type info
  - `test_column_sql_generation()`: POST generate-column-sql with simple SQL → verify expanded SQL
  - `test_column_sql_complex_rejection()`: POST with CTE SQL → verify error response
  - `test_tile_field_classifications_persist()`: PUT tile with fieldClassifications → GET tile → verify persistence
  - `test_custom_metric_agent_tool()`: Verify the tool is in agent tool definitions
  - Each test prints PASS/FAIL with details
- **Invariants**: Invariant-1 (generated SQL validated), Invariant-2 (returned data PII-masked)
- **Invariant-Check**: `test_column_sql_generation` verifies the returned SQL passes sql_validator
- **Test**: `cd backend && python test_bi_editability.py` → all tests PASS
- **Commit**: `test: regression test script for BI editability backend changes`

### Task 4.2: Frontend visual regression checklist (~5 min)
- **Files**: `docs/ultraflow/plans/regression-checklist-2026-04-09.md` (create)
- **Intent**: Document a manual regression checklist for all frontend changes. Covers every feature end-to-end. To be executed by running the app and testing each item.
- **Checklist items**:
  - [ ] Dashboard loads without errors
  - [ ] Tile CRUD: create, edit, copy, move, delete
  - [ ] Field classification: auto-detect works, toggle D/M, persists after save/reload
  - [ ] Primary measure dropdown: only shows measures
  - [ ] Schema columns appear in TileEditor (requires active DB connection)
  - [ ] Column swap: existing column remaps without query. New column triggers SQL regen.
  - [ ] Complex SQL tile: column add shows "use Agent" prompt instead of auto-regen
  - [ ] Custom metrics: create with `{` autocomplete, test validates, save works
  - [ ] Custom metrics: function-aware context (SUM→measures, COUNT→dimensions)
  - [ ] Custom metrics: edit and delete work, persist across sessions
  - [ ] Custom metrics: validation gate prevents saving untested/failed metrics
  - [ ] Trending badge: shows on time-series chart, hidden on categorical chart
  - [ ] Agent panel: chat bubbles render correctly for all step types
  - [ ] Agent panel: quick-action buttons appear after agent response
  - [ ] Agent panel: hybrid input (buttons + text) during ask_user
  - [ ] Agent panel: input styling matches modern chat UI
  - [ ] Agent panel: tool calls collapse/expand correctly
  - [ ] Global filters still work on all tile types
  - [ ] Cross-filtering still works
  - [ ] Data blending still works
  - [ ] Presentation engine still works
  - [ ] Dashboard save/load preserves all new fields
  - [ ] All 12 chart types render correctly (bar, line, area, pie, donut, table, kpi, stacked_bar, bar_h, radar, scatter, treemap)
- **Invariants**: all (comprehensive check)
- **Test**: Execute each checklist item manually.
- **Commit**: `docs: regression test checklist for BI editability release`

---

## Task Dependencies

```
Task 1.1 (fieldClassification util) ← independent, do first
Task 1.2 (schema fetch in TileEditor) ← depends on 1.1
Task 1.3 (dim/measure toggle UI) ← depends on 1.1, 1.2
Task 1.4 (wire through DashboardBuilder) ← depends on 1.2, 1.3
Task 1.5 (SQL regen frontend) ← depends on 1.6
Task 1.6 (SQL regen backend) ← independent of 1.1-1.4

Task 2.1 (FormulaInput component) ← depends on 1.1
Task 2.2 (function-aware detection) ← depends on 2.1
Task 2.3 (integrate into MetricEditor) ← depends on 2.1, 2.2
Task 2.4 (wire schema to MetricEditor) ← depends on 1.4, 2.3
Task 2.5 (validation gate) ← depends on 2.3
Task 2.6 (agent tool) ← independent

Task 3.1 (smart trending) ← depends on 1.1
Task 3.2 (chat bubbles) ← independent
Task 3.3 (quick-action buttons) ← depends on 3.2
Task 3.4 (visual polish) ← depends on 3.3

Task 4.1 (backend regression) ← depends on 1.6, 2.6
Task 4.2 (frontend checklist) ← depends on all prior tasks
```

**Parallelizable groups**:
- Group A: Task 1.1 + Task 1.6 + Task 2.6 + Task 3.2 (all independent)
- Group B: Task 1.2 + Task 1.3 + Task 2.1 (all depend only on 1.1)
- Group C: Task 3.1 + Task 3.3 (depend on 1.1 and 3.2 respectively)

## Risk Items
- **RISK-1 (from ASSUMPTION-P3)**: SQL regeneration assumes simple SELECT rewrite works. Complex tiles (CTEs, multi-JOINs, UNIONs) will produce invalid SQL. **Mitigation**: Task 1.5 detects complex SQL via heuristic (CTE/JOIN count) and falls back to "use Agent" prompt. Task 1.6 backend does same detection server-side. Agent has `run_sql` + `inspect_schema` tools for manual rewriting. See Counterfactual Gate for full analysis.

## Scope Validation
Tasks in scope: 1.1-1.6 (dim/measure + tile edit), 2.1-2.6 (custom metrics), 3.1-3.4 (trending + agent), 4.1-4.2 (regression)
Tasks flagged: none — all within UFSD scope baseline

## Counterfactual Gate
Strongest argument AGAINST this plan: FM-2 — SQL regeneration for complex tiles (CTEs, multi-joins) will produce invalid SQL, frustrating users who have sophisticated queries. This affects a core workflow (adding columns to existing tiles).
We accept this plan because: Task 1.5 explicitly detects complex SQL and falls back to "use Agent" prompt rather than generating broken SQL. The agent already has `run_sql` + `inspect_schema` tools capable of rewriting complex queries. This is a progressive enhancement — simple tiles get auto-regen, complex tiles get agent assistance. Edge case acknowledged in UFSD.
> Impact estimates are REASONED, not PROVEN — assumption chain: P3 (simple SELECT rewrite works) → sqlglot can parse most SQL dialects (validated: already used in sql_validator.py) → complex detection heuristic (CTE/JOIN count) catches most edge cases.

## MVP-Proof
No performance or scalability claims. Schema fetch latency mitigated by 200-column cap and search filter (FM-1). Formula autocomplete is client-side only (no network calls during typing).

## Fingerprint
Dashboard tiles support auto-detected dim/measure classification with user override, full schema column access with SQL regen, `{`-triggered function-aware formula autocomplete, time-series-only trending badges, and chat-bubble agent panel with hybrid quick-action input.
