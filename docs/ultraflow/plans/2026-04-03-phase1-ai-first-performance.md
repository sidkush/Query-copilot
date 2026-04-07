# Plan: Phase 1 — AI-First Analytics + Performance & Caching

**Spec**: docs/journal-2026-04-03-strategic-council.md (Phase 1 section)
**Approach**: Council synthesis #1 + #2
**Branch**: `master` (continuing existing work)

## Tasks

### Task 1: Backend — Batch Tile Refresh Endpoint (~5 min)
- **Files**: `backend/routers/dashboard_routes.py` (modify)
- **Intent**: Add `POST /api/dashboards/{dashboard_id}/tiles/batch-refresh` that accepts a list of tile_ids + shared filters/connId, executes all tiles concurrently (ThreadPoolExecutor, max 5 workers), returns `{results: {tile_id: {columns, rows}}, errors: {tile_id: message}}`. Reuses existing `refresh_tile` core logic extracted into a helper.
- **Test**: Manual — call endpoint with 3+ tile_ids, verify parallel execution.
- **Commit**: `feat: add batch tile refresh endpoint with concurrent execution`

### Task 2: Backend — Query Result Cache with TTL (~5 min)
- **Files**: `backend/query_engine.py` (modify)
- **Intent**: Implement the existing `_cache` dict stub + `CACHE_ENABLED`/`CACHE_TTL_SECONDS` config. Cache keyed on `hash(sql + str(params))`. On `execute_sql`, check cache first; on hit + not expired, return cached result. On miss, execute and store. Add `clear_cache()` method. No ChromaDB semantic matching yet (Phase 2 — hash embedding too shallow).
- **Test**: Manual — execute same query twice, second should be near-instant.
- **Commit**: `feat: implement TTL query result cache in QueryEngine`

### Task 3: Backend — "Explain This Chart" Endpoint (~3 min)
- **Files**: `backend/routers/query_routes.py` (modify)
- **Intent**: Add `POST /api/queries/explain-chart` accepting `{columns, rows (sample 20), chartType, question, title}`. Calls Claude Haiku with a focused prompt asking for a 2-3 sentence data story. Returns `{explanation}`. Similar pattern to existing `explain-anomaly`.
- **Test**: Manual — POST with sample data, verify explanation returned.
- **Commit**: `feat: add explain-chart endpoint for AI data narration`

### Task 4: Backend — AI Drill-Down Suggestions Endpoint (~3 min)
- **Files**: `backend/routers/query_routes.py` (modify)
- **Intent**: Add `POST /api/queries/drill-down-suggestions` accepting `{sql, columns, rows (sample 5), question}`. Calls Claude Haiku to suggest 3 drill-down questions (e.g., "Break down by region", "Show trend over time"). Returns `{suggestions: [{question, dimension}]}`.
- **Test**: Manual — POST with sample data, verify suggestions array.
- **Commit**: `feat: add AI drill-down suggestions endpoint`

### Task 5: Frontend — "Explain This Chart" Button + Panel (~5 min)
- **Files**: `frontend/src/components/dashboard/TileWrapper.jsx` (modify), `frontend/src/api.js` (modify)
- **Intent**: Add `explainChart` API call. Add "Explain" button (lightbulb icon) to TileWrapper header actions. On click, call API with tile's columns/rows/chartType/question. Show explanation in a slide-down panel below tile header with glassmorphism styling. Loading state with skeleton. Cache explanation in local state to avoid re-fetching.
- **Test**: Manual — click Explain button, verify explanation appears.
- **Commit**: `feat: add Explain This Chart button on dashboard tiles`

### Task 6: Frontend — Drill-Down Suggestions Panel (~5 min)
- **Files**: `frontend/src/pages/DashboardBuilder.jsx` (modify), `frontend/src/api.js` (modify)
- **Intent**: Add `drillDownSuggestions` API call. When drill-down data is shown (after cross-filter click), also fetch suggestions. Show suggestion chips below drill-down results. Clicking a chip fires a new `handleAICommand` with the suggestion text.
- **Test**: Manual — cross-filter click, verify suggestion chips appear.
- **Commit**: `feat: add AI drill-down suggestion chips`

### Task 7: Frontend — Batch Tile Refresh Integration (~3 min)
- **Files**: `frontend/src/api.js` (modify), `frontend/src/pages/DashboardBuilder.jsx` (modify)
- **Intent**: Add `batchRefreshTiles` API call. Replace the batched `Promise.allSettled` loop in `refreshAllTiles` with a single `api.batchRefreshTiles()` call. Falls back to individual refresh on 4xx/5xx.
- **Test**: Manual — apply global filter, verify all tiles refresh via single network call.
- **Commit**: `feat: use batch tile refresh endpoint for global filter updates`

### Task 8: Frontend — Lazy Load Heavy Dashboard Modals (~3 min)
- **Files**: `frontend/src/pages/DashboardBuilder.jsx` (modify), `frontend/vite.config.js` (modify)
- **Intent**: Convert eager imports of TileEditor, ExportModal, PresentationEngine, VersionHistory, AlertManager, ShareModal, DashboardThemeEditor, MetricEditor to `React.lazy()` + `Suspense`. Add `manualChunks` in vite.config for echarts, framer-motion, html2canvas, jspdf vendor chunks.
- **Test**: `npm run build` — verify chunk splitting in output.
- **Commit**: `feat: lazy-load dashboard modals + vendor chunk splitting`

## Fingerprint
Phase 1 complete: dashboard tiles have "Explain" + drill-down suggestions, batch refresh endpoint reduces N+1 API calls to 1, query results are TTL-cached, heavy modals are lazy-loaded with vendor chunk splitting.
