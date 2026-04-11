# Development Journal: Dashboard Overhaul & Agent Integration

**Date:** 2026-04-09  
**Project:** QueryCopilot V1 / DataLens  
**Scope:** Dashboard visualization, agent SQL execution, filter system, alerts, and cross-tile operations  

---

## Table of Contents

1. [Dynamic Dashboard Focus Options](#1-dynamic-dashboard-focus-options)
2. [Turbo Mode Wired Into Agent SQL Execution](#2-turbo-mode-wired-into-agent-sql-execution)
3. [Tile Color Save Not Reflecting](#3-tile-color-save-not-reflecting)
4. [Live Preview Added Then Removed](#4-live-preview-added-then-removed)
5. [H-Bar Chart Blank](#5-h-bar-chart-blank)
6. [Per-Category Color Control](#6-per-category-color-control)
7. [Color Picker Too Small](#7-color-picker-too-small)
8. [Category Colors Container Clipping](#8-category-colors-container-clipping)
9. [Advanced Sort and Custom Ordering](#9-advanced-sort-and-custom-ordering)
10. [H-Bar Sort Direction Reversed](#10-h-bar-sort-direction-reversed)
11. [H-Bar Data Labels Position](#11-h-bar-data-labels-position)
12. [LIMIT 1000 Display Fix](#12-limit-1000-display-fix)
13. [Reverted LIMIT Changes](#13-reverted-limit-changes)
14. [Re-split validate/apply_limit](#14-re-split-validateapply_limit)
15. [KPI Tile Value Color](#15-kpi-tile-value-color)
16. [Removed AI Suggest Button](#16-removed-ai-suggest-button)
17. [Removed Download JSON and Edit SQL Buttons](#17-removed-download-json-and-edit-sql-buttons)
18. [Filter System Overhaul](#18-filter-system-overhaul)
19. [Connection Status Fix](#19-connection-status-fix)
20. [Stale Filter Data Fix](#20-stale-filter-data-fix)
21. [Views/Bookmarks Fix](#21-viewsbookmarks-fix)
22. [Alert Fix](#22-alert-fix)
23. [Alert Schema Context](#23-alert-schema-context)
24. [BigQuery Dialect Fix](#24-bigquery-dialect-fix)
25. [Agent Panel Charts](#25-agent-panel-charts)
26. [Agent Tile Creation Fix](#26-agent-tile-creation-fix)
27. [Cross-Section/Tab Tile Move and Copy](#27-cross-sectiontab-tile-move-and-copy)

---

## 1. Dynamic Dashboard Focus Options

**Request:** The Chat page had hardcoded focus options (Sales, Customers, etc.) for dashboard creation. These should reflect the actual database schema tables instead.

**Root cause:** `Chat.jsx` contained a static `focusOptions` array that was never updated based on the connected database. Additionally, the dashboard naming regex was too greedy, sometimes capturing unintended text as the dashboard name.

**Fix:** Replaced the hardcoded array with a call to `api.getSchemaProfile()` to derive table names dynamically from the connected database. Updated the dashboard naming regex to check for an explicit pattern (e.g., "Name the dashboard '...'") first before falling back to inference.

**Files modified:**
- `frontend/src/pages/Chat.jsx`
- `frontend/src/api.js`

---

## 2. Turbo Mode Wired Into Agent SQL Execution

**Request:** The agent engine's `_tool_run_sql` method should use the DuckDB twin (Turbo Mode) when available, rather than always hitting the live database.

**Root cause:** `agent_engine.py` had the DuckDB twin integration built out elsewhere in the codebase, but the agent's `_tool_run_sql` tool function never checked for or used it. All agent SQL execution went directly to the live database.

**Fix:** Added a `_get_turbo_tier()` helper method that checks whether a DuckDB twin is available for the current connection. Updated `_tool_run_sql` to attempt turbo-first execution via DuckDB and fall back to the live database on failure.

**Files modified:**
- `backend/agent_engine.py`
- `backend/duckdb_twin.py`

---

## 3. Tile Color Save Not Reflecting

**Request:** When saving color changes in TileEditor, the new colors did not appear on the dashboard until a full page refresh.

**Root cause:** `handleTileSave` in the dashboard builder re-fetched the entire dashboard state from the backend after saving. This round-trip replaced the local state (including runtime-computed rows and columns) with the persisted version, which did not yet reflect the just-saved changes due to timing.

**Fix:** Changed `handleTileSave` to perform an optimistic local state merge. After the backend save succeeds, the local tile state is updated directly with the new visualConfig rather than re-fetching the entire dashboard.

**Files modified:**
- `frontend/src/pages/DashboardBuilder.jsx`

---

## 4. Live Preview Added Then Removed

**Request:** Initially requested real-time color preview while adjusting colors in TileEditor.

**Root cause:** An `onPreview` callback was added so color changes would stream to the parent tile in real-time. However, the user clarified that colors should not change visually until the Save button is clicked.

**Fix:** Added the `onPreview` callback for real-time color updates, then removed it entirely per user direction. The final behavior: color changes are staged locally in TileEditor and only applied to the tile on explicit Save.

**Files modified:**
- `frontend/src/components/Dashboard/TileEditor.jsx`
- `frontend/src/pages/DashboardBuilder.jsx`

---

## 5. H-Bar Chart Blank

**Request:** Horizontal bar charts rendered as blank/empty tiles despite having valid data.

**Root cause:** Inconsistent chart type identifiers across the stack. `TileWrapper` and the backend used `'horizontal_bar'` as the chart type ID, while `ResultsChart` expected `'bar_h'`. The mismatch caused the chart renderer to receive an unrecognized type and render nothing.

**Fix:** Standardized all 5 files (2 frontend, 3 backend) to use `'bar_h'` as the canonical identifier for horizontal bar charts.

**Files modified:**
- `frontend/src/components/Dashboard/TileWrapper.jsx`
- `frontend/src/components/ResultsChart.jsx`
- `backend/agent_engine.py`
- `backend/query_engine.py`
- `backend/routers/dashboard_routes.py`

---

## 6. Per-Category Color Control

**Request:** New feature to allow users to set individual colors for each data category (e.g., specific bar segments, pie slices) rather than only a single series color.

**Root cause:** N/A (new feature). The existing visualConfig only supported a single color per chart. Users needed granular control over individual categories in bar, horizontal bar, pie, donut, and treemap charts.

**Fix:** Introduced a `categoryColors` map in `visualConfig`. Created a `resolveCategoryColor()` utility function in `formatUtils.js` that resolves per-category colors with fallback to the default series color. Added category color pickers to TileEditor. Applied category color resolution in ResultsChart for bar, bar_h, pie, donut, and treemap chart types.

**Files modified:**
- `frontend/src/lib/formatUtils.js` -- new `resolveCategoryColor()` function
- `frontend/src/components/Dashboard/TileEditor.jsx` -- category color picker UI
- `frontend/src/components/ResultsChart.jsx` -- apply categoryColors to bar/bar_h/pie/donut/treemap

---

## 7. Color Picker Too Small

**Request:** The hex color picker widget was too small for comfortable use.

**Root cause:** The `HexColorPicker` component in `ColorPickerButton.jsx` used its default compact dimensions.

**Fix:** Increased the `HexColorPicker` dimensions to 240px wide by 200px tall.

**Files modified:**
- `frontend/src/components/Dashboard/ColorPickerButton.jsx`

---

## 8. Category Colors Container Clipping

**Request:** The color picker popover was being clipped/cut off when opened inside the category colors section of TileEditor.

**Root cause:** The category colors container had `overflowY: 'auto'` set, which created a scrollable container that clipped any popover (like the color picker) extending beyond its bounds.

**Fix:** Removed the `overflowY: 'auto'` style from the category colors container so the color picker popover can render without clipping.

**Files modified:**
- `frontend/src/components/Dashboard/TileEditor.jsx`

---

## 9. Advanced Sort and Custom Ordering

**Request:** New feature for advanced sorting capabilities including custom category ordering and Top N limiting.

**Root cause:** N/A (new feature). The existing sort only supported ascending/descending by value. Users needed the ability to define a custom display order for categories and to limit charts to the top N entries.

**Fix:** Extended the sort schema in `formatUtils.js` to include `customOrder[]` (array of category names in desired display order) and `limit` (integer for Top N). Added a Custom order mode to TileEditor with up/down arrow controls for reordering categories and a Top N limit input. Updated `ResultsChart` to apply custom ordering and limit to `sortedData` before rendering.

**Files modified:**
- `frontend/src/lib/formatUtils.js` -- extended sort schema with `customOrder` and `limit`
- `frontend/src/components/Dashboard/TileEditor.jsx` -- custom order UI with arrows, Top N input
- `frontend/src/components/ResultsChart.jsx` -- sortedData logic for custom order + limit

---

## 10. H-Bar Sort Direction Reversed

**Request:** Ascending sort on horizontal bar charts showed the largest value at the top instead of the smallest.

**Root cause:** ECharts renders y-axis categories from bottom to top. An ascending-sorted data array placed the smallest value first in the array, but ECharts displayed it at the bottom of the chart, making it appear reversed to the user.

**Fix:** Added a data reversal step specifically for `bar_h` charts so that ascending sort places the smallest value at the visual top and the largest at the bottom, matching user expectations.

**Files modified:**
- `frontend/src/components/ResultsChart.jsx`

---

## 11. H-Bar Data Labels Position

**Request:** Data labels on horizontal bar charts were positioned at the top of bars (visually above), which looked wrong for horizontal orientation.

**Root cause:** The ECharts label position was set to `'top'`, which is appropriate for vertical bars but places labels above the bar end in horizontal orientation.

**Fix:** Changed the label position from `'top'` to `'right'` for `bar_h` charts so labels appear to the right of each horizontal bar.

**Files modified:**
- `frontend/src/components/ResultsChart.jsx`

---

## 12. LIMIT 1000 Display Fix

**Request:** The `LIMIT 1000` clause injected by the SQL validator was appearing in the displayed SQL shown to users, which was confusing.

**Root cause:** `SQLValidator.validate()` both validated the SQL and injected the `LIMIT 1000` safety clause in a single pass. The same SQL string was then used for both display and execution, so users saw the injected LIMIT.

**Fix:** Split `validate()` into two methods: `validate()` (validation only, no LIMIT injection -- produces clean display SQL) and `apply_limit()` (injects LIMIT, called only before actual database execution). Updated all call sites in `query_engine.py`, `agent_engine.py`, and `dashboard_routes.py` to use the two-step approach.

**Files modified:**
- `backend/sql_validator.py` -- split into `validate()` and `apply_limit()`
- `backend/query_engine.py` -- call `apply_limit()` before execution only
- `backend/agent_engine.py` -- call `apply_limit()` before execution only
- `backend/routers/dashboard_routes.py` -- call `apply_limit()` before execution only

---

## 13. Reverted LIMIT Changes

**Request:** User clarified that the `LIMIT 1000` is cosmetic/safety-only and that aggregation queries process all rows regardless. Some of the config and prompt changes from the previous fix were unnecessary.

**Root cause:** Over-correction. Changes to `config.py` and system prompts related to LIMIT behavior were not needed because the LIMIT only affects the returned result set, not the aggregation computation.

**Fix:** Reverted changes to `config.py` and prompt-related files. Kept the core `validate()`/`apply_limit()` split intact.

**Files modified:**
- `backend/config.py` -- reverted
- Backend prompt files -- reverted

---

## 14. Re-split validate/apply_limit

**Request:** After the revert, user confirmed the original goal still stands: LIMIT should not appear in displayed SQL.

**Root cause:** The revert in step 13 may have partially undone the display separation. Needed to ensure `validate()` stays clean (no LIMIT injection) while `apply_limit()` is called exclusively at execution time.

**Fix:** Re-confirmed and finalized the two-method split. `validate()` returns clean SQL for display. `apply_limit()` is called only at the point of database execution in `query_engine.py`, `agent_engine.py`, and `dashboard_routes.py`.

**Files modified:**
- `backend/sql_validator.py`
- `backend/query_engine.py`
- `backend/agent_engine.py`
- `backend/routers/dashboard_routes.py`

---

## 15. KPI Tile Value Color

**Request:** KPI tiles should support custom value color and font size, separate from the tile title styling.

**Root cause:** `KPICard.jsx` did not read any color or sizing configuration from `visualConfig`. The KPI value was rendered with a fixed default style regardless of user customization.

**Fix:** Updated `KPICard.jsx` to read value color from `visualConfig.measureColors` and font size from `visualConfig.titleFontSize`. These are intentionally separate from the tile title color, giving users independent control over KPI value presentation.

**Files modified:**
- `frontend/src/components/Dashboard/KPICard.jsx`

---

## 16. Removed AI Suggest Button

**Request:** Remove the AI chart suggestion button from the tile toolbar.

**Root cause:** Feature deemed unnecessary for the current product stage. The button, its API endpoint, and the `AIChartSuggestBody` model were dead weight.

**Fix:** Removed the AI Suggest button from `TileWrapper.jsx`, removed the corresponding API call from `api.js`, and removed the `AIChartSuggestBody` Pydantic model and `/suggest` endpoint from `dashboard_routes.py`.

**Files modified:**
- `frontend/src/components/Dashboard/TileWrapper.jsx`
- `frontend/src/api.js`
- `backend/routers/dashboard_routes.py`

---

## 17. Removed Download JSON and Edit SQL Buttons

**Request:** Remove the Download JSON and Edit SQL buttons from the tile toolbar.

**Root cause:** Feature cleanup. These actions were not part of the target UX for the investor demo.

**Fix:** Removed both buttons from `TileWrapper.jsx`. Cleaned up the `onEditSQL` prop chain through `Section.jsx`, `FreeformCanvas.jsx`, and `DashboardBuilder.jsx`.

**Files modified:**
- `frontend/src/components/Dashboard/TileWrapper.jsx`
- `frontend/src/components/Dashboard/Section.jsx`
- `frontend/src/components/Dashboard/FreeformCanvas.jsx`
- `frontend/src/pages/DashboardBuilder.jsx`

---

## 18. Filter System Overhaul

**Request:** Multiple issues with the global filter system needed fixing: filters not applying correctly, auto-refresh causing unwanted queries, tile scoping missing, and filter state not persisting across page refreshes.

**Root cause (multiple):**
1. Batch-refresh wrapped filtered SQL in a subquery instead of injecting WHERE clauses directly, causing syntax errors with some dialects.
2. Filters auto-applied on every keystroke via debounce, causing excessive queries.
3. No mechanism to scope a filter field to specific tiles.
4. `removeField` updated state but did not trigger a re-filter.
5. Filter chips were not restored from `globalFilters` prop on page refresh.
6. `refreshAllTiles` required `activeConnId` which was not always available.
7. Batch refresh results were fetched from the backend instead of applied directly to local state.

**Fix:**
1. Changed batch-refresh to inject field filters into the SQL WHERE clause directly (not as a subquery wrapper).
2. Added an explicit Apply Filters button to `GlobalFilterBar` and removed the auto-debounce behavior.
3. Added per-tile filter scoping via a `tileIds` property on filter field definitions.
4. Fixed `removeField` to immediately trigger `refreshAllTiles` (not just mark dirty).
5. Added a `useEffect` in `GlobalFilterBar` to sync filter chips from the `globalFilters` prop on mount/update.
6. Fixed `refreshAllTiles` to work without requiring `activeConnId`.
7. Changed `refreshAllTiles` to apply batch results directly to local tile state instead of re-fetching.

**Files modified:**
- `frontend/src/components/Dashboard/GlobalFilterBar.jsx` -- Apply button, removeField fix, chip sync
- `frontend/src/pages/DashboardBuilder.jsx` -- refreshAllTiles rewrite, filter scoping
- `backend/routers/dashboard_routes.py` -- WHERE clause injection, batch refresh logic

---

## 19. Connection Status Fix

**Request:** The database connection status indicator always showed green (connected), even when no live connections existed.

**Root cause:** `DatabaseSwitcher.jsx` had the `StatusDot` component hardcoded with `isLive={true}`. It never checked actual connection liveness. Additionally, `Dashboard.jsx` did not clear the connections list when no live connections were found.

**Fix:** Updated `DatabaseSwitcher.jsx` to check `liveConnIds` from `api.listConnections()` and set `isLive` based on actual status. Fixed `Dashboard.jsx` to call `setConnections([])` when the API returns no live connections.

**Files modified:**
- `frontend/src/components/DatabaseSwitcher.jsx`
- `frontend/src/pages/Dashboard.jsx`

---

## 20. Stale Filter Data Fix

**Request:** Dashboard tiles were showing stale filtered data from a previous session on load, even though no filters were active.

**Root cause (multiple):**
1. `globalFilters` were not cleared on dashboard load, carrying over from previous sessions.
2. `globalFilters` were included in auto-save, persisting filtered state to disk.
3. On unmount, `resetGlobalFilters` was not called, leaving dirty state.
4. The backend's filtered refresh endpoint was saving filtered rows to the tile's persistent storage, overwriting the unfiltered data.

**Fix:**
1. Clear `globalFilters` on dashboard load.
2. Removed `globalFilters` from the auto-save payload.
3. Added `resetGlobalFilters` call on component unmount.
4. Auto-refresh all tiles on load to ensure fresh unfiltered data.
5. Backend: guarded `update_tile` in the filtered refresh path with a `has_filters` check, so filtered rows are never persisted to disk.

**Files modified:**
- `frontend/src/pages/DashboardBuilder.jsx` -- clear filters on load, remove from auto-save, unmount reset
- `backend/routers/dashboard_routes.py` -- has_filters guard on tile persistence

---

## 21. Views/Bookmarks Fix

**Request:** Restoring a saved bookmark/view did not re-apply the associated filters, and bookmark details did not show which filters were saved.

**Root cause:** `applyBookmarkState` restored the filter state in memory but did not call `refreshAllTiles` to actually execute the restored filters against the tiles. The `BookmarkManager` UI also lacked filter detail display.

**Fix:** Updated `applyBookmarkState` to call `refreshAllTiles` after restoring filters. Enhanced `BookmarkManager` to display filter field details (field names, operators, values) for each saved view.

**Files modified:**
- `frontend/src/pages/DashboardBuilder.jsx` -- refreshAllTiles after bookmark restore
- `frontend/src/components/Dashboard/BookmarkManager.jsx` -- filter details display

---

## 22. Alert Fix

**Request:** The alert check endpoint was crashing with a call signature error.

**Root cause:** `alert_routes.py`'s `check_alert` function called `SQLValidator.validate()` with 3 positional arguments (sql, dialect, schema), but the constructor had been refactored to accept dialect at construction time, not as a `validate()` argument. Additionally, `DBType` enum values were being converted to strings incorrectly using `str()` instead of accessing the `.value` property.

**Fix:** Fixed the `SQLValidator` instantiation to pass `dialect` to the constructor. Updated `validate()` call to pass only the required 2 arguments. Fixed `DBType` enum conversion to use `.value` for string representation. Properly unpacked the 3-tuple return from `validate()`.

**Files modified:**
- `backend/routers/alert_routes.py`

---

## 23. Alert Schema Context

**Request:** The alert parse endpoint should use the schema profile for more accurate table and column name resolution.

**Root cause:** The parse endpoint was interpreting user alert definitions without schema context, leading to incorrect or ambiguous table/column references.

**Fix:** Enhanced the parse endpoint to load and use `schema_profile` for the current connection, providing the LLM with accurate table and column names when interpreting alert conditions.

**Files modified:**
- `backend/routers/alert_routes.py`

---

## 24. BigQuery Dialect Fix

**Request:** Dashboard tile refresh was generating invalid SQL for BigQuery connections.

**Root cause:** All 3 tile refresh endpoints in `dashboard_routes.py` created `SQLValidator()` instances with the default `'postgres'` dialect, regardless of the actual database type. BigQuery connections require BigQuery-specific SQL validation rules.

**Fix:** Updated all 3 tile refresh endpoints to read the database type from `entry.connector.db_type.value` and pass it to the `SQLValidator` constructor.

**Files modified:**
- `backend/routers/dashboard_routes.py`

---

## 25. Agent Panel Charts

**Request:** Agent SQL results should render inline charts and tables directly in the agent panel, with an option to send results to the dashboard.

**Root cause:** N/A (new feature). The agent step feed only displayed text results. SQL query results were not visualized.

**Fix:** Created `RunSqlStepRenderer` within `AgentStepFeed.jsx` that renders inline `ResultsChart` components for SQL results. Added a table view toggle so users can switch between chart and tabular views. Added a "+ Dashboard" button that creates a tile from agent results. Added `ReactMarkdown` rendering for `result` and `ask_user` content types in the step feed.

**Files modified:**
- `frontend/src/components/Agent/AgentStepFeed.jsx` -- RunSqlStepRenderer, inline charts, table toggle, + Dashboard button
- `frontend/src/components/Agent/AgentPanel.jsx` -- ReactMarkdown integration

---

## 26. Agent Tile Creation Fix

**Request:** Tiles created by the agent appeared empty or with missing SQL.

**Root cause (multiple):**
1. `agent_engine.py`'s `_tool_create_dashboard_tile` stored the SQL under the key `'rawSQL'` instead of `'sql'`, which the frontend tile renderer expected.
2. `create_dashboard_tile` was listed in `_ALWAYS_CONFIRM_TOOLS`, requiring user confirmation for a non-destructive action, which broke the agent flow.
3. The frontend did not refresh the dashboard when the agent created, updated, or deleted tiles.

**Fix:**
1. Fixed the storage key from `'rawSQL'` to `'sql'` in `agent_engine.py`.
2. Removed `create_dashboard_tile` from `_ALWAYS_CONFIRM_TOOLS` (it is non-destructive).
3. Added a `dashboard-reload` custom event dispatch from `AgentPanel.jsx` when the agent creates, updates, or deletes tiles, so the dashboard builder re-fetches and re-renders.

**Files modified:**
- `backend/agent_engine.py` -- fixed 'rawSQL' to 'sql', removed from ALWAYS_CONFIRM
- `frontend/src/components/Agent/AgentPanel.jsx` -- dashboard-reload event dispatch

---

## 27. Cross-Section/Tab Tile Move and Copy

**Request:** New feature to move or copy a tile from one dashboard section (or tab) to another.

**Root cause:** N/A (new feature). Users had no way to reorganize tiles across sections or tabs without deleting and recreating them.

**Fix:** Implemented `move_tile()` and `copy_tile()` functions in `user_storage.py` that handle the underlying data operations (removing from source section, inserting into target section, deep-copying for copy). Added `/move` and `/copy` REST endpoints in `dashboard_routes.py`. Added Move and Copy buttons to `TileWrapper.jsx` with a section picker dropdown that lists all available sections/tabs as move/copy targets.

**Files modified:**
- `backend/user_storage.py` -- `move_tile()` and `copy_tile()` functions
- `backend/routers/dashboard_routes.py` -- `/move` and `/copy` endpoints
- `frontend/src/components/Dashboard/TileWrapper.jsx` -- Move/Copy buttons with section picker dropdown

---

## Summary of All Files Modified

### Frontend

| File | Changes |
|------|---------|
| `frontend/src/pages/Chat.jsx` | Dynamic focus options from schema |
| `frontend/src/pages/Dashboard.jsx` | Connection status clearing |
| `frontend/src/pages/DashboardBuilder.jsx` | Tile save optimistic merge, filter overhaul, bookmark refresh, auto-save cleanup, onEditSQL prop removal |
| `frontend/src/api.js` | Removed AI suggest call, schema profile integration |
| `frontend/src/lib/formatUtils.js` | `resolveCategoryColor()`, extended sort schema with `customOrder` and `limit` |
| `frontend/src/components/ResultsChart.jsx` | bar_h type fix, category colors, custom sort/limit, h-bar reversal, label position |
| `frontend/src/components/DatabaseSwitcher.jsx` | Live connection status check |
| `frontend/src/components/Dashboard/TileWrapper.jsx` | bar_h type fix, removed AI Suggest/Download JSON/Edit SQL buttons, Move/Copy feature |
| `frontend/src/components/Dashboard/TileEditor.jsx` | Category color pickers, custom order UI, overflow fix, live preview add/remove |
| `frontend/src/components/Dashboard/ColorPickerButton.jsx` | Increased picker dimensions |
| `frontend/src/components/Dashboard/KPICard.jsx` | Value color and font size from visualConfig |
| `frontend/src/components/Dashboard/GlobalFilterBar.jsx` | Apply button, removeField fix, chip sync |
| `frontend/src/components/Dashboard/BookmarkManager.jsx` | Filter details per view |
| `frontend/src/components/Dashboard/Section.jsx` | Removed onEditSQL prop |
| `frontend/src/components/Dashboard/FreeformCanvas.jsx` | Removed onEditSQL prop |
| `frontend/src/components/Agent/AgentStepFeed.jsx` | RunSqlStepRenderer, inline charts, table toggle, + Dashboard button |
| `frontend/src/components/Agent/AgentPanel.jsx` | ReactMarkdown, dashboard-reload event |

### Backend

| File | Changes |
|------|---------|
| `backend/agent_engine.py` | Turbo mode in _tool_run_sql, bar_h type fix, validate/apply_limit split, tile creation key fix, removed from ALWAYS_CONFIRM |
| `backend/query_engine.py` | bar_h type fix, validate/apply_limit split |
| `backend/sql_validator.py` | Split validate() and apply_limit() methods |
| `backend/config.py` | Temporarily modified then reverted (LIMIT changes) |
| `backend/duckdb_twin.py` | Turbo tier helper support |
| `backend/user_storage.py` | `move_tile()` and `copy_tile()` functions |
| `backend/routers/dashboard_routes.py` | bar_h type fix, removed AI suggest endpoint, filter WHERE injection, BigQuery dialect fix, tile refresh validate/apply_limit, move/copy endpoints, has_filters persistence guard |
| `backend/routers/alert_routes.py` | Fixed validate() call signature, DBType.value conversion, schema context for parse |
