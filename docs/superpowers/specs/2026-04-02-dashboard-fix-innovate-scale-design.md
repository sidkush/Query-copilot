# Dashboard Fix, Innovate & Scale — Comprehensive Design Spec

## Problem

Three compounding issues prevent QueryCopilot from competing with Tableau/Power BI:

1. **12 broken features** — GlobalFilterBar doesn't refresh tiles (passes null connId), FreeformCanvas positions lost on refresh (autoSave debounce), TileEditor visualConfig overwrites fields with null, palette dual source of truth, FloatingToolbar changes don't persist, tile selection broken in freeform mode, zoom/pan not saved, no visual selection feedback.

2. **Missing table-stakes interactivity** — No cross-tile filtering (click bar → filter all tiles), no state bookmarking (share views via URL), no conditional section visibility (dynamic zones), no chart transition animations.

3. **Data scale ceiling** — Backend caps tiles at 100 rows, frontend renders only 50. Recharts (SVG) degrades at 1000+ points. No Canvas/WebGL fallback for scatter/heatmap. WebGPU is premature (40-60% of enterprise browsers lack support).

## Strategic Context (from 9-agent research)

- Tableau won on **speed-to-insight**, not pixels-per-second
- Power BI wins on **price + Microsoft ecosystem**, not rendering
- QueryCopilot's moat is **"question to dashboard in 10 seconds"** via AI
- WebGPU solves a problem we don't have (35M points; we render 50-100)
- The actual bottleneck is SQL execution (100-2000ms) + Claude API (1-3s), NOT rendering
- 95% of tiles show <500 data points; only scatter/heatmap need scale

## Success Criteria

- All 12 broken features fixed and verified via stress test
- Cross-tile interactivity: click a bar → all tiles filter in <100ms
- State bookmarking: share a dashboard view via URL → colleague sees exact same state
- Data scale: scatter plots render 5000 points smoothly on Canvas
- AI chart config: Claude suggests optimal chart type + formatting after SQL generation
- Zero regressions in existing functionality
- Build passes, bundle size increase <350KB total

---

## Phase 1 (Week 1-2): Fix All 12 Broken Features

### Fix 1: GlobalFilterBar connId (CRITICAL)

**File:** `frontend/src/pages/DashboardBuilder.jsx` — `handleGlobalFiltersChange` (~line 601)

**Root cause:** Calls `handleTileRefresh(tid, null, newFilters)` — passes `null` for connId.

**Fix:** Replace `null` with `activeConnId`. Also applies to the bulk refresh path (`api.refreshBulk` already accepts connId).

### Fix 2: FreeformCanvas persistence (CRITICAL)

**File:** `frontend/src/components/dashboard/FreeformCanvas.jsx` — onDragStop/onResizeStop handlers

**Root cause:** `autoSave` has 800ms debounce. Navigate away before save fires → positions lost. `handleCanvasViewportChange` intentionally doesn't save.

**Fix:**
- On drag/resize stop: flush autoSave immediately (no debounce for layout changes)
- On viewport change: add 2-second debounced save (not "never")

### Fix 3: TileEditor visualConfig save (HIGH)

**File:** `frontend/src/components/dashboard/TileEditor.jsx` — `handleSave`

**Root cause:** Builds visualConfig fresh from state. Null state variables overwrite existing values.

**Fix:** Merge with existing `tile.visualConfig` before saving. Only set non-null values:
```js
const mergedVC = { ...tile.visualConfig };
// For each section, merge non-null values only
```

### Fix 4: Palette dual source of truth (HIGH)

**Root cause:** `tile.palette` (old) and `tile.visualConfig.colors.palette` (new) both exist. TileEditor saves to both, but reads inconsistently.

**Fix:** Single source: always read from `visualConfig.colors.palette ?? tile.palette ?? 'default'`. Save ONLY to `visualConfig.colors.palette`. Keep `tile.palette` for backward compat of old tiles but never write to it in new code.

### Fix 5: FreeformCanvas tile selection (HIGH)

**File:** `frontend/src/components/dashboard/FreeformCanvas.jsx`

**Root cause:** `onSelect` prop not passed to TileWrapper inside Rnd wrapper. Only `onDragStart` triggers selection.

**Fix:** Add `onSelect={() => onTileSelect?.(tile.id)}` to TileWrapper in the Rnd tile loop.

### Fix 6: FloatingToolbar persistence (HIGH)

**Root cause:** `handleQuickTileUpdate` calls `api.updateTile()` but doesn't use the returned dashboard to update state.

**Fix:** Use API response (like `handleTileSave` does) to accurately update `activeDashboard` state.

### Fix 7: Style tab initialization (HIGH)

**Root cause:** Style state vars initialize from `vc.style?.X` but if previous save wrote nulls, they initialize as null — showing blank pickers.

**Fix:** Initialize each from `vc.style?.X ?? FORMATTING_DEFAULTS.style.X`.

### Fix 8: Zoom/pan persistence (MEDIUM)

**Fix:** Add 2-second debounced `autoSave` to `handleCanvasViewportChange` (currently has comment "don't auto-save").

### Fix 9: Selected tile visual feedback (MEDIUM)

**Fix:** Pass `selectedTileId` as prop through Section → TileWrapper. Apply `outline: 2px solid ${TOKENS.accent}` when `tile.id === selectedTileId`.

### Fix 10: TileEditor refactor — reduce 51 useState to Zustand (STABILITY)

**Root cause:** 51 useState hooks in TileEditor is an anti-pattern. Stale closure risk, massive dependency arrays, unmaintainable.

**Fix:** Create `useTileEditorStore` (Zustand) that holds all formatting state. TileEditor reads/writes to this store instead of 51 individual useState calls. Reduces component complexity dramatically.

### Fix 11: DashboardBuilder module split (STABILITY)

**Root cause:** 1448 lines, 15 useState, 32 useCallback. Adding more features risks unmaintainability.

**Fix:** Extract into:
- `DashboardBuilder.jsx` — layout + rendering only (~400 lines)
- `useDashboardHandlers.js` — all useCallback handlers (~600 lines)
- `useDashboardState.js` — state initialization + refs (~200 lines)

### Fix 12: Stress test verification

Run the stress test matrix from previous spec:
- 12 tiles, mixed types, format + save + reload
- Chart type switching preserves formatting
- Filter changes preserve formatting
- Cross-feature: blending + formatting + freeform all work together

---

## Phase 2 (Week 3-4): High-Impact Innovation

### Feature A: Cross-Tile Interactivity

**Architecture:** Hybrid (frontend instant + backend accurate)

1. Add `crossFilter` state to DashboardBuilder: `{ field, value, sourceTileId }`
2. Add `onClick` handlers to Recharts Bar/Pie/Cell components in ResultsChart
3. On click: set `crossFilter` → all tiles filter rows locally (instant, <50ms)
4. In background: trigger `api.refreshBulk` with cross-filter as WHERE clause
5. When backend responds: replace frontend-filtered data with accurate results
6. "Clear Filter" badge at top with field + value shown

**Data flow:**
```
Click bar in Tile A → setCrossFilter({field: "region", value: "NA"})
  → All tiles: rows.filter(r => r.region === "NA") [instant]
  → Background: api.refreshBulk with WHERE region = 'NA' [accurate]
  → Replace filtered rows when response arrives
```

**Files:** DashboardBuilder (state), Section (threading), TileWrapper (threading), ResultsChart (onClick + filtering)

### Feature B: State Bookmarking

**Architecture:** Hybrid URL — bookmark ID in URL, full state in backend

**State captured per bookmark:**
- `activeTabId`
- `globalFilters` (date range, field filters)
- `crossFilter` (if active)
- `collapsedSections` (array of section IDs)
- `canvasViewport` (pan, zoom per section)
- NOT tile data (too large; re-fetched on load)

**Storage:** `dashboard.bookmarks[]` array in existing JSON file
```json
{
  "id": "bm_xyz",
  "name": "Monday Morning View",
  "state": { "activeTabId": "...", "globalFilters": {...}, ... },
  "created_at": "...",
  "created_by": "..."
}
```

**Sharing:** URL `/analytics?dashboard=abc&view=bm_xyz`. On load: fetch dashboard, find bookmark, apply state overlay.

**UI:** "Save View" button in DashboardHeader, bookmark dropdown list, "Share" copies URL to clipboard.

**Backend:** Add bookmark CRUD endpoints (save, list, get, delete). Add `"bookmarks"` to allowed keys in `update_dashboard()`. ~100 lines backend.

### Feature C: Dynamic Zone Visibility

**Architecture:** Rule-based section show/hide

Each section gets optional `visibilityRule`:
```json
{ "type": "filter-value", "field": "region", "operator": "===", "value": "North America" }
```

**Evaluation:** Before rendering sections, filter by `evaluateVisibilityRule(section.visibilityRule, globalFilters)`. Simple comparison engine (~30 lines).

**UI:** In section edit menu, add "Visibility Rule" config: field dropdown, operator select, value input.

**Badge:** Sections with rules show "conditional" badge in header.

### Feature D: Chart Crossfade Animation

**Architecture:** Framer Motion `AnimatePresence` wrapping chart render

```jsx
<AnimatePresence mode="wait">
  <motion.div key={chartType}
    initial={{ opacity: 0, scale: 0.98 }}
    animate={{ opacity: 1, scale: 1 }}
    exit={{ opacity: 0, scale: 1.02 }}
    transition={{ duration: 0.3 }}
  >
    {renderChart()}
  </motion.div>
</AnimatePresence>
```

2-4 hours. Framer Motion already installed. Works for all 10 chart types.

---

## Phase 3 (Week 5-6): Data Scale Upgrade

### Backend: Raise row limit

**File:** `backend/user_storage.py` — tile row cap

- Current: `tile["rows"] = tile["rows"][:100]`
- Change: `tile["rows"] = tile["rows"][:5000]` when `tile.get("bigDataMode")` is true
- Default stays 100 for normal tiles (safe, fast)
- Add `bigDataMode: Optional[bool] = None` to `UpdateTileBody`

**File:** `backend/routers/dashboard_routes.py` — refresh endpoint

- Change `df.head(100)` to `df.head(5000)` when tile has `bigDataMode: true`
- Keep 100 as default

### Frontend: Remove 50-row hard limit

**File:** `frontend/src/components/ResultsChart.jsx` — line ~342

- Current: `const data = useMemo(() => augRows.slice(0, 50), [augRows]);`
- Change: dynamic limit based on chart type and renderer
  - Recharts (SVG): cap at 500 (readable, performant)
  - Canvas fallback: cap at 5000

### Frontend: ECharts Canvas renderer for high-density charts

**New file:** `frontend/src/components/dashboard/CanvasChart.jsx`

- Install `echarts-for-react` (~300KB gzipped)
- Create wrapper that accepts same props as ResultsChart (columns, rows, chartType, formatting)
- Support scatter and heatmap chart types only
- Auto-switches: if `rows.length > 1000 && (chartType === 'scatter' || chartType === 'heatmap')`, use CanvasChart instead of Recharts

**Integration in TileWrapper:**
```jsx
const useCanvas = chartRows.length > 1000 && ['scatter', 'heatmap'].includes(tile.chartType);

{useCanvas ? (
  <CanvasChart columns={chartColumns} rows={chartRows} chartType={tile.chartType} formatting={tile.visualConfig} />
) : (
  <ResultsChart ... />
)}
```

**NOT WebGPU.** Canvas handles 5000-10000 points at 60fps. WebGPU only needed at 50K+ which no current user hits.

---

## Phase 4 (Week 7-8): AI Differentiation

### Feature: AI Chart Config

**Architecture:** After SQL generation, ask Claude to suggest optimal chart config.

**Backend:** Add optional second Claude call in `query_engine.py` after dashboard generation:
```python
chart_config = self._suggest_chart_config(columns, rows[:10], question)
# Returns: { recommendedType, reasoning, config: { xAxis, series, colors, yAxisLabel } }
tile["aiSuggestedConfig"] = chart_config
```

**Frontend:** TileWrapper checks `tile.aiSuggestedConfig`. If present, shows "AI Suggestion" badge. Clicking applies the config (chart type + formatting). User can override.

**Latency:** +1-2s per dashboard generation (one Claude call batched for all tiles). Acceptable since generation already takes 3-5s.

### Feature: Predictive Prefetching

**Architecture:** On dashboard load, prefetch ALL tabs (not just active).

**Backend:** Add `prefetch: bool = False` to `RefreshTileBody`. When true, run via `BackgroundTasks` (FastAPI built-in), return `{status: "prefetching"}` immediately.

**Frontend:**
- On dashboard load: fire background refresh for all inactive tab tiles
- Store prefetched data in Zustand: `prefetchCache[dashboardId][tabId] = { columns, rows, timestamp }`
- On tab switch: check cache first → instant render
- Cache TTL: 5 minutes
- Invalidate on filter change

**Impact:** Tab switching goes from 500-1200ms to <100ms (cache hit).

### Feature: LOD Expression Parser (Phase 1 — Frontend Only)

**File:** `frontend/src/lib/metricEvaluator.js` — extend parser

Add LOD syntax recognition: `{FIXED [Region] : SUM(Revenue)}`

Phase 1: Parse and flag as `requiresBackend: true`. Show in MetricEditor UI with syntax hints.

Phase 2 (Week 9+): Backend CTE generation via sqlglot for actual execution.

---

## Phase 5 (Week 9+): Only If Metrics Demand

### WebGPU / Deck.gl — Deferred

**Trigger:** Only pursue if analytics show users regularly exceed 5000-row Canvas limit.

**Approach if triggered:** Use ECharts-GL or Deck.gl (proven, documented) — NOT custom WebGPU shaders or ChartGPU (dormant, no npm package).

**Browser support timeline:** Firefox WebGPU expected stable Q3 2026, Safari TBD. Wait.

---

## Files to Create

| File | Phase | Purpose |
|---|---|---|
| `frontend/src/hooks/useDashboardHandlers.js` | 1 | Extracted callbacks from DashboardBuilder |
| `frontend/src/hooks/useDashboardState.js` | 1 | Extracted state from DashboardBuilder |
| `frontend/src/stores/tileEditorStore.js` | 1 | Zustand store replacing 51 useState in TileEditor |
| `frontend/src/lib/visibilityRules.js` | 2 | `evaluateVisibilityRule()` for DZV |
| `frontend/src/components/dashboard/BookmarkManager.jsx` | 2 | Save/list/share bookmarks UI |
| `frontend/src/components/dashboard/CrossFilterBadge.jsx` | 2 | Shows active cross-filter with clear button |
| `frontend/src/components/dashboard/CanvasChart.jsx` | 3 | ECharts Canvas wrapper for scatter/heatmap |
| `frontend/src/lib/aiChartAdvisor.js` | 4 | Claude API call for chart config suggestion |
| `frontend/src/hooks/usePrefetch.js` | 4 | Prefetch cache + requestIdleCallback |

## Files to Modify

| File | Phase | Change |
|---|---|---|
| `DashboardBuilder.jsx` | 1 | Split into 3 modules, fix connId, fix autoSave, add crossFilter/bookmarks state |
| `TileEditor.jsx` | 1 | Migrate 51 useState to Zustand store, fix visualConfig merge |
| `FreeformCanvas.jsx` | 1 | Fix persistence (immediate save on layout change), pass onSelect to TileWrapper |
| `FloatingToolbar.jsx` | 1 | Fix quick-update persistence |
| `TileWrapper.jsx` | 1-2 | Add selection visual, pass crossFilter to ResultsChart, Canvas fallback |
| `ResultsChart.jsx` | 2-3 | Add onClick to Bar/Pie, apply crossFilter, crossfade animation, dynamic row limit |
| `Section.jsx` | 2 | Add visibility rule evaluation, pass crossFilter/selectedTileId |
| `DashboardHeader.jsx` | 2 | Add "Save View" + bookmark dropdown |
| `GlobalFilterBar.jsx` | 2 | Add CrossFilterBadge integration |
| `backend/dashboard_routes.py` | 2-4 | Bookmark CRUD, prefetch flag, bigDataMode |
| `backend/user_storage.py` | 2-3 | Bookmark storage, conditional row limit |
| `backend/query_engine.py` | 4 | AI chart config suggestion call |
| `frontend/src/api.js` | 2-4 | Bookmark API, prefetch API |
| `frontend/src/store.js` | 2-4 | Prefetch cache, bookmark state |

## New Dependencies

| Package | Phase | Size (gzipped) | Purpose |
|---|---|---|---|
| `echarts-for-react` | 3 | ~300KB | Canvas renderer for high-density scatter/heatmap |

---

## Stress Test Plan

### Phase 1 Verification (after fixes)

| # | Test | Pass Criteria |
|---|---|---|
| 1 | Apply global filter → tiles refresh with filtered data | All tiles show filtered results, not stale data |
| 2 | Drag tile in freeform → refresh page → tile stays in position | Position persists |
| 3 | Edit tile formatting → save → reopen editor | All formatting values preserved |
| 4 | Change palette in Colors tab → save → tile renders new colors | No palette drift |
| 5 | Click tile in freeform → FloatingToolbar appears | Selection works in both grid and freeform |
| 6 | Zoom/pan freeform canvas → refresh → viewport restored | Within 2-second save window |
| 7 | 12 tiles with mixed formatting → save → reload → all intact | Zero formatting loss |
| 8 | Chart type switch (bar→line→bar) with formatting | Formatting preserved through transitions |
| 9 | Data refresh preserves formatting | New data + old formatting |
| 10 | Freeform + formatting + blending all active simultaneously | No crashes or visual glitches |

### Phase 2 Verification (after innovation)

| # | Test | Pass Criteria |
|---|---|---|
| 11 | Click bar in Tile A → all tiles filter | Cross-filter applied in <100ms |
| 12 | Save bookmark → share URL → colleague opens → same state | Filters, tab, collapsed sections all match |
| 13 | Set visibility rule on section → apply matching filter → section appears | DZV works |
| 14 | Switch chart type → crossfade animation plays | Smooth 300ms transition |

### Phase 3 Verification (after scale)

| # | Test | Pass Criteria |
|---|---|---|
| 15 | Scatter plot with 3000 rows → renders smoothly | Canvas mode activates, 30+ FPS |
| 16 | Normal bar chart with 100 rows → still uses Recharts | No unnecessary Canvas |

---

## What We Explicitly Do NOT Build

| Feature | Reason |
|---|---|
| WebGPU custom shaders | 40-60% browser unsupported, 100-row tiles don't need it |
| tldraw infinite canvas | 4/10 feasibility, React 19 untested, file-based backend incompatible with Yjs |
| React Flow node editor | 4/10 feasibility, SVG flow diagram is sufficient |
| Eye-tracking layout optimization | Gimmicky, privacy concerns, enterprise buyers don't evaluate this |
| Haptic data sculpting | No hardware adoption |
| WebXR/AR walk-through | Research project, not product feature |
| ChartGPU | No npm package, dormant repo, not production-ready |
| Generative React JSX | Security nightmare (code execution), maintenance impossibility |

---

## Risk Mitigation

| Risk | Mitigation |
|---|---|
| TileEditor refactor breaks existing saves | Migration: read old format, write new format, both work |
| DashboardBuilder split introduces regressions | Extract handlers one-at-a-time, verify build after each |
| Cross-filter column name mismatch across tiles | Frontend filters by display column; backend re-query is the accuracy fallback |
| ECharts bundle bloat | Lazy-load: `const ECharts = lazy(() => import('echarts-for-react'))` |
| AI chart config adds latency | Batch Claude call for all tiles; cache suggestions per data shape |
| Prefetch overwhelms DB | Rate-limit background tasks; max 3 concurrent prefetches |
