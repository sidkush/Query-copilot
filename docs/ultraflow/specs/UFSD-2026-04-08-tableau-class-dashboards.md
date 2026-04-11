# UFSD Summary
Feature: Tableau-class dashboard experience with AI-native intelligence for DataLens
Scope Baseline: In — typography, grid density, 6 new tile types, dual theme, agent dashboard generation, animated time-series, narrative tiles, conversational drill-in, canvas mode polish, connect-time dashboard preflight. Out — map/geo tiles, real-time streaming, collaborative editing, mobile layout, PDF print engine, custom SQL editor, full data extract/replica (TB-scale).
Assumptions:
  1. Dark (default) + light theme toggled per dashboard via themeConfig.mode
  2. Six new tile types: sparkline KPI, horizontal bar, heat matrix, scorecard table, text/narrative, gauge
  3. Animated time-series uses ECharts timeline option (no new charting library)
  4. Agent workflow: clarify (2-3 questions) -> propose layout plan -> user approves -> build
  5. Conversational drill-in reuses AgentPanel.jsx with context-click trigger
  6. FreeformCanvas.jsx is the base for canvas mode (already built, needs polish)
  7. Changes are frontend-heavy; backend needs agent prompt updates + new tile type support in same data model
  8. Existing dashboards must not break (migration path for old tile sizes)
  9. Performance budget: animated charts capped at 10K rows (existing maxRows pattern)
  10. Connect-time preflight runs ~20 aggregate queries (COUNT/AVG/MIN/MAX/GROUP BY) returning <500KB total — no TB data copy
  11. Preflight runs in background during connect; user can skip and start chatting; dashboard populates async
  12. Statistical snapshot stored in schema_cache/{conn_id}_stats.json (~5-50KB)
Confidence: 4/5
Coverage: 11 explored / 11 visible

[COUNCIL SUMMARY — 2026-04-08]
Decision: PENDING user selection — Theme 2 "Blueprint-Then-Approve" leads (14/20 combined with Theme 1)
Confidence: CONFIRMED (7/20 independent alignment on each sub-theme)
Top risks: Two-step invariant violation, 18 DB engine testing burden, ghost dashboards
Unanimous concerns: (1) Two-step invariant must NOT be violated, (2) Stats queries must be engine-aware, (3) No unsolicited dashboard creation
Counterfactual accepted: Y — soft approval gate (1-click "Build this?") preserves invariant without killing UX magic

[COUNCIL ASSUMPTIONS]
  A1. Stats queries are metadata-class — PARTIALLY TRUE (aggregates can leak PII via statistical inference)
  A2. Stats complete <5s all engines — FALSIFIED for BigQuery/Snowflake (use INFORMATION_SCHEMA estimates instead)
  A3. Blueprint cost ~$0.01-0.05 per connect — TRUE for Haiku
  A4. Users connect ≤5x/session — UNVERIFIED
  A5. Aggregates don't leak PII — FALSE (AVG salary, COUNT by race are sensitive)
  A6. Auto-dashboards don't confuse users — MITIGATE with "suggested" state vs persisted
  A7. 30s timeout sufficient — PARTIALLY TRUE (BigQuery/Snowflake may need 60s)
  A8. Blueprint quality is useful — UNPROVEN (needs prompt engineering + testing)

---

# UFSD Detail: Tableau-Class Dashboards for DataLens

## 1. Problem Statement

DataLens dashboards currently waste screen space and lack tile variety. Compared to Tableau Public dashboards (reference screenshots from user):
- **Typography is too large**: KPI values at 32px, titles at 14px — Tableau uses 22-24px KPI, 12px titles
- **Grid is too spacious**: rowHeight=60px with 12px gaps. Tableau packs 4 KPI cards + 2 charts + 1 table in one viewport
- **Only 3 tile types**: chart (ECharts), table, KPI card. Tableau has sparkline KPIs, horizontal bars with inline values, heat matrices, scorecards
- **No storytelling**: Static snapshots only. No animation, no narrative, no conversational drill-in
- **Agent creates basic tiles**: No layout intelligence — dumps tiles into first section

## 2. Current State (from code audit)

### Frontend
- Grid: `react-grid-layout`, 12 cols, `rowHeight=60`, `margin=[12,12]`, `minH=2` (minimum tile height = 120px)
- Font system: Inter (loaded via Google Fonts), sizes via inline styles and Tailwind `text-[]` classes
- Design tokens: `tokens.js` — colors, radii, transitions. No font-size tokens.
- Tile rendering: `TileWrapper.jsx` wraps `ResultsChart.jsx` or `ResultsTable.jsx` or `KPICard.jsx`
- KPICard: 32px value, 11px label, gradient accent strip
- Canvas mode: `FreeformCanvas.jsx` exists, toggled per section via `LayoutModeToggle.jsx` — appears functional but unused in practice
- Dashboard components: 28 files in `dashboard/` — mature subsystem

### Backend
- Agent tools: `create_dashboard_tile`, `update_dashboard_tile`, `delete_dashboard_tile`, `get_dashboard_tiles`, `list_dashboards`
- Tile data model: `{id, title, chartType, columns, rows, sql, selectedMeasure, activeMeasures, palette, visualConfig, annotations}`
- No layout templates or tile-type vocabulary in agent prompts

## 3. Architecture Decisions

### 3.1 Typography System
Add font-size tokens to `tokens.js`:
```js
typography: {
  kpiValue: 22,      // was 32 — tighter for density
  kpiLabel: 10,       // was 11
  tileTitle: 12,      // was 14
  tileSubtitle: 10,   // was 11
  sectionHeader: 13,  // keep current
  bodyText: 11,
  caption: 9,
  axisLabel: 10,
}
```

All dashboard components import from tokens — no hardcoded font sizes.

### 3.2 Grid Density
- `rowHeight`: 60 -> 40px (each grid row = 40px, so a `h=2` tile = 80px — perfect for KPI cards)
- `margin`: [12,12] -> [8,8] (configurable via themeConfig.spacing.tileGap, already supported)
- `minH`: 2 -> 1 (allow single-row tiles for ultra-compact KPIs)
- Default tile sizes:
  - KPI sparkline: w=3, h=2 (120x80px) — 4 across
  - Chart: w=6, h=5 (240x200px)
  - Table: w=6, h=4 (240x160px)
  - Heat matrix: w=4, h=4

### 3.3 New Tile Types (6)
Each tile type is a new React component in `dashboard/tiles/`:

1. **SparklineKPI** — Large number + delta badge + mini sparkline. Like TabSales screenshot. Data: single measure + time column. Height: 80px.

2. **HorizontalBarCard** — Category labels left, proportional bars right, value labels inline. Like Superstore segment/category tiles. No axis chrome needed.

3. **HeatMatrix** — Row labels + column headers + colored cells with values. Like HR Attrition "Factor Correlation". Uses conditional color scale (divergent or sequential).

4. **ScorecardTable** — Ranked list with inline colored bars. Like "Top 5 Customer" tile. Compact table with visual measure encoding.

5. **NarrativeBlock** — Rich text tile for AI-generated annotations. Markdown-rendered. Can include inline KPI callouts. Used by narrative layer.

6. **GaugeRadial** — Semicircle gauge showing progress toward a target. Good for KPIs with known thresholds.

### 3.4 Dual Theme
- `themeConfig.mode`: "dark" (default) | "light"
- Light theme tokens: white bg (#FAFAFA), dark text (#1A1A2E), light borders (#E5E7EB), same accent colors
- Toggle button in DashboardHeader
- Charts adapt via ECharts theme options (already support dark/light via bg color config)

### 3.5 Animated Time-Series ("Data Storytelling")
- ECharts `timeline` component for temporal data
- Play/pause button on chart tiles with a time column
- Animates through time periods (monthly, quarterly, yearly)
- KPI tiles update their values in sync when multiple tiles share a time dimension
- Capped at 10K rows for performance

### 3.6 AI Narrative Layer
- After agent generates dashboard tiles, it runs a "narrator" pass:
  - Examines each tile's data for anomalies (spikes, drops, outliers)
  - Generates 2-3 NarrativeBlock tiles with text annotations
  - Places them adjacent to the relevant chart tile
- Uses existing Claude API call with a narrator system prompt
- Stored as regular tiles with `chartType: "narrative"`

### 3.7 Conversational Drill-In
- KPI values and chart data points become clickable
- Click triggers: "Why did [metric] [change]?" prefilled in agent prompt
- Agent generates explanatory tile(s) and inserts them below the clicked tile
- Uses existing AgentPanel.jsx SSE streaming
- New `onDrillIn` callback prop on TileWrapper → opens agent with context

### 3.8 Agent Dashboard Architect
Updated agent system prompt with:
1. Dashboard layout templates (KPI row → chart pair → detail table)
2. Tile type vocabulary (sparklineKPI, horizontalBar, heatMatrix, scorecardTable, narrative, gauge)
3. Layout intelligence: agent decides tile sizes based on data shape
4. Multi-step workflow:
   - Clarify: "What metrics matter most? What time range?"
   - Plan: "I'll create: 4 KPI sparklines (revenue, profit, orders, customers), 1 trend chart, 1 category breakdown, 1 top-N table"
   - Build: Sequential `create_dashboard_tile` calls with appropriate types and sizes
   - Narrate: Add annotation tiles explaining key findings

### 3.9 Canvas Mode Polish
- FreeformCanvas.jsx already supports drag-anywhere placement
- Polish: snap-to guides, alignment helpers, pixel-level position in tile properties
- Toggle between grid (default) and canvas per section (existing LayoutModeToggle.jsx)

## 3.10 Connect-Time Dashboard Preflight

**Concept:** When a user connects to a database, the system spends ~10-15s in the background analyzing the data and pre-building a dashboard — so when the user lands on the dashboard page, it's already populated with KPIs, charts, and insights. Like Tableau Extract but without copying TB-scale data.

**Why it works without storing TBs:**
- We run ~20 lightweight aggregate queries (COUNT, AVG, MIN, MAX, GROUP BY with LIMIT) that return tiny result sets
- Statistical snapshot: ~5-50KB of JSON metadata (not raw data)
- Each dashboard tile holds ~1-10KB of aggregated results (100-1000 rows max)
- Total footprint: under 500KB even for a massive database
- Existing PII masking runs on all results

**5-Step Pipeline (runs in background during connect):**

1. **Normal connect** (existing, ~2-3s) — test connection, train schema
2. **Schema profile** (existing via `schema_intelligence.py`, ~1-2s) — table names, columns, row counts
3. **Statistical snapshot** (NEW, ~3-5s) — per-column stats (min/max/avg/median/cardinality/nulls/top-values). ~20 SQL queries, all SELECT-only. Stored in `schema_cache/{conn_id}_stats.json`
4. **Dashboard blueprint** (NEW, ~3-5s) — send schema + stats to Claude. Agent decides KPIs, chart types, layout. Returns tile plan as JSON (no SQL execution yet)
5. **Tile hydration** (NEW, ~2-8s) — execute each tile's SQL in parallel (max 6 concurrent), PII mask results, save as pre-built dashboard

**Frontend UX during preflight:**
- Progress animation: "Analyzing your data..." → "Discovering patterns..." → "Building your dashboard..."
- User can skip at any time and start chatting — dashboard populates async via SSE
- If preflight fails (slow DB, timeout), user gets empty dashboard + agent ready to build on demand

**Storage:** schema_cache (existing dir) + dashboards.json (existing). No new storage infra.

**Guardrails:**
- 30s total timeout for steps 3-5; abort gracefully if exceeded
- Max 6 concurrent SQL queries during hydration
- Each query capped at 1000 rows via existing LIMIT enforcement
- All results pass through `mask_dataframe()` before storage

## 4. Staged Delivery

### Phase 1: Visual Density (Week 1)
- Typography tokens in tokens.js
- Grid: rowHeight=40, margin=8, minH=1
- Update all dashboard components to use typography tokens
- Dual theme (dark/light toggle)
- No new tile types yet — existing tiles just render denser
- **Deliverable:** Same dashboards, dramatically more professional and dense

### Phase 2: Tile Variety (Week 2)
- 6 new tile components in `dashboard/tiles/`
- TileWrapper routes to correct component by `chartType`
- Agent prompt update: tile type vocabulary
- ECharts timeline animation for temporal charts
- **Deliverable:** Agent can create sparkline KPIs, horizontal bars, heat matrices

### Phase 3: AI Intelligence (Week 3)
- Agent dashboard architect (clarify → plan → build)
- Narrative layer (auto-generated text annotations)
- Conversational drill-in (click KPI → "why?" → agent expands)
- **Deliverable:** User says "build me a sales dashboard" → gets full Tableau-quality dashboard with annotations

### Phase 4: Connect-Time Preflight + Canvas (Week 4)
- Statistical snapshot engine (backend: ~20 aggregate queries per connection)
- Dashboard blueprint generator (agent generates tile plan from stats)
- Tile hydration pipeline (parallel SQL execution + PII masking)
- Frontend connect progress animation
- FreeformCanvas snap-to-guide polish
- **Deliverable:** User connects to DB → fully populated professional dashboard appears automatically. Power users get canvas mode.

## 5. Success Criteria
1. Single viewport shows 4 KPI cards + 2 charts + 1 table without scrolling (same density as Tableau screenshots)
2. Agent generates a multi-tile professional dashboard from a single prompt
3. Clicking a KPI triggers drill-in that adds explanatory tiles inline
4. Light theme matches Tableau's clean white aesthetic
5. Animated time-series plays through 12+ months smoothly on 10K-row datasets
