# Regression Checklist — BI Editability & Agent UX (2026-04-09)

## Prerequisites
- Backend running on port 8002 (`cd backend && uvicorn main:app --reload --port 8002`)
- Frontend running on port 5173 (`cd frontend && npm run dev`)
- Active database connection established

---

## Slice 1: Dimension/Measure Classification + Tile Editability

### Field Classification
- [ ] Open TileEditor for a tile with mixed columns (strings + numbers)
- [ ] String columns (e.g., "station") appear in Dimensions section
- [ ] Numeric columns (e.g., "total_rides") appear in Measures section
- [ ] Each column shows D/M toggle button
- [ ] Click D/M toggle on a dimension → moves to Measures section
- [ ] Click D/M toggle on a measure → moves to Dimensions section
- [ ] Custom metric columns show "fx" badge and cannot be reclassified
- [ ] Primary Measure dropdown only shows columns classified as measures
- [ ] "station" does NOT appear in Primary Measure dropdown by default
- [ ] Save tile → reload dashboard → open editor → classifications persist

### Schema Column Access
- [ ] TileEditor shows database columns beyond query result columns (labeled "schema")
- [ ] Schema columns are auto-classified (numeric=measure, string=dimension)
- [ ] Search filter appears when >10 columns total
- [ ] Search filter narrows both Dimensions and Measures sections
- [ ] Loading indicator shows while schema is being fetched

### SQL Regeneration
- [ ] Enable a schema column not in current data → loading indicator appears
- [ ] SQL regenerates and tile refreshes with new column data
- [ ] Enable a column on a tile with complex SQL (CTE/JOIN) → shows "use Agent" message
- [ ] Enable a column already in tile data → simple toggle, no SQL regen
- [ ] SQL regen failure → error message shown, previous data preserved

---

## Slice 2: Custom Metrics Formula Editor

### Formula Autocomplete
- [ ] Open MetricEditor → create new metric
- [ ] Type `{` in formula field → autocomplete dropdown appears
- [ ] Dropdown shows two sections: "Measures" and "Dimensions"
- [ ] Type letters after `{` → dropdown filters by typed text
- [ ] Select a column → inserts `{columnName}` in formula
- [ ] Press Escape → closes dropdown
- [ ] Press `}` → closes dropdown

### Function-Aware Context
- [ ] Type `SUM({` → dropdown shows Measures section first
- [ ] Type `COUNT({` → dropdown shows Dimensions section first
- [ ] Type `MEDIAN({` → dropdown shows Dimensions section first
- [ ] Type `AVG({` → dropdown shows Measures section first
- [ ] Type `{` without enclosing function → shows all fields, Measures first

### Validation Gate
- [ ] Create new metric → Save button is disabled
- [ ] Click Test → success → Save button enables, green checkmark appears
- [ ] Click Test → failure → Save stays disabled, red X appears
- [ ] Edit formula after successful test → Save disables again, indicator clears
- [ ] Test all metrics → Save enables
- [ ] Try to save with untested metric → blocked

### Custom Metrics CRUD
- [ ] Create metric → appears in list
- [ ] Edit existing metric → changes saved
- [ ] Delete metric → removed from list
- [ ] Metric persists across sessions (save dashboard → reload → metric still there)
- [ ] Metric appears in TileEditor measures section with "fx" badge

### Agent Custom Metric Creation
- [ ] Ask agent: "create a custom metric called ARPU for SUM(revenue)/COUNT(DISTINCT customer_id)"
- [ ] Agent calls create_custom_metric tool
- [ ] Metric appears in dashboard custom metrics
- [ ] Agent shows success message with metric details

---

## Slice 3: Smart Trending Badge + Agent Panel UX

### Trending Badge
- [ ] Tile with date/time X-axis → shows trending badge (up or down)
- [ ] Tile with categorical X-axis (station names) → NO trending badge
- [ ] Tile with ascending-sorted categorical data → NO trending badge (fixes original bug)
- [ ] KPI tile → no trending badge (no X-axis)
- [ ] Table tile → no trending badge

### Agent Panel — Chat Bubbles
- [ ] User messages appear right-aligned with blue tint
- [ ] Agent thinking appears as compact left-aligned bubble
- [ ] Tool calls appear as compact left bubbles (expandable)
- [ ] Final result appears as left-aligned bubble with icon
- [ ] All 13 step types render correctly (verify each):
  - [ ] user_query (right, blue)
  - [ ] thinking (left, compact, italic)
  - [ ] tool_call (left, compact, expandable)
  - [ ] result (left, full)
  - [ ] tier_routing (left, amber badge)
  - [ ] plan (left, purple)
  - [ ] budget_extension (left, amber)
  - [ ] progress (left, progress bar)
  - [ ] tier_hit (left, green badge)
  - [ ] cached_result (left, cyan)
  - [ ] live_correction (left, orange/green)
  - [ ] error (left, red)
  - [ ] ask_user (question UI)
- [ ] Timestamps shown on messages

### Agent Panel — Quick Actions
- [ ] After agent finishes responding, quick-action buttons appear: "Continue", "Tell me more", "Add to dashboard"
- [ ] Click "Continue" → sends as new agent query
- [ ] Click "Tell me more" → sends as new agent query
- [ ] Quick actions hidden during loading/streaming
- [ ] Quick actions hidden when agent is waiting for user input

### Agent Panel — Input
- [ ] Input area is rounded pill shape (like ChatGPT/Claude)
- [ ] Focus → border glows blue
- [ ] Send button is circular, inside the input container
- [ ] During loading → stop button (red circle) replaces send
- [ ] Click stop → streaming stops
- [ ] Header is compact (smaller icons and spacing)

### Agent Panel — Ask User (Hybrid Input)
- [ ] Agent asks question with options → buttons AND text input shown
- [ ] Click an option button → response sent
- [ ] Type in text field instead → response sent
- [ ] "Other..." button focuses text input

---

## General Regression (Existing Features)

- [ ] Dashboard loads without console errors
- [ ] Create new tile → works
- [ ] Copy tile → works
- [ ] Move tile → works
- [ ] Delete tile → works
- [ ] All 12 chart types render: bar, line, area, pie, donut, table, kpi, stacked_bar, bar_h, radar, scatter, treemap
- [ ] Global date filters still apply to all tiles
- [ ] Cross-filtering between tiles still works
- [ ] Data blending still works
- [ ] Presentation engine still works
- [ ] Dashboard save/load preserves all new fields (fieldClassifications, etc.)
- [ ] Agent panel docking (float, right, bottom, left) still works
- [ ] Agent panel minimize/maximize still works
- [ ] Agent history (load, continue, delete) still works
- [ ] Persona selector still works
- [ ] Permission mode toggle still works

---

## Build Verification
- [ ] `cd frontend && npm run lint` — no new errors from our changes
- [ ] `cd frontend && npm run build` — builds successfully
- [ ] `cd backend && python test_bi_editability.py` — all tests pass
