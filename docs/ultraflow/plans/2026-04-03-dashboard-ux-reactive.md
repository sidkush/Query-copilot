# Plan: Dashboard UX Improvements — Reactive Zustand Architecture
**Approach**: Council #2 — Reactive Zustand filter slice + collapsible sidebar + flexible tile sizing + button audit
**Branch**: `fix/dashboard-ux-improvements`

## Tasks

### Task 1: Add `dashboardFilters` Zustand slice (~5 min)
- **Files**: `frontend/src/store.js` (modify)
- **Intent**: Add a new slice to the Zustand store with the following shape:
  ```js
  // New state
  dashboardFilterVersion: 0,          // incremented on every filter change — tiles watch this
  dashboardGlobalFilters: { dateColumn: "", range: "all_time", fields: [] },
  
  // New actions
  applyGlobalFilters: (filters) => set(s => ({
    dashboardGlobalFilters: filters,
    dashboardFilterVersion: s.dashboardFilterVersion + 1,
  })),
  resetGlobalFilters: () => set({ dashboardGlobalFilters: { dateColumn: "", range: "all_time", fields: [] }, dashboardFilterVersion: 0 }),
  
  // Tile edit version (separate counter so tile edits also trigger refresh)
  tileEditVersion: 0,
  bumpTileEditVersion: () => set(s => ({ tileEditVersion: s.tileEditVersion + 1 })),
  ```
  The `dashboardFilterVersion` counter acts as a reactive signal — any component selecting it will re-render when filters change.
- **Test**: `cd frontend && npx eslint src/store.js` → no errors
- **Commit**: `feat(store): add reactive dashboardFilters and tileEdit version slices`

### Task 2: Wire GlobalFilterBar + DashboardBuilder to Zustand slice (~5 min)
- **Files**: `frontend/src/pages/DashboardBuilder.jsx` (modify), `frontend/src/components/dashboard/GlobalFilterBar.jsx` (modify)
- **Depends on**: Task 1
- **Intent**:
  In **DashboardBuilder.jsx**:
  - Import `applyGlobalFilters` and `dashboardFilterVersion` from store
  - Replace `handleGlobalFiltersChange` (line 657-675): instead of manually calling `handleTileRefresh` per tile, call `applyGlobalFilters(newFilters)` which sets the store. Then still call `autoSave` to persist. Remove the manual `Promise.allSettled` tile refresh loop.
  - Add a `useEffect` that watches `dashboardFilterVersion` and `tileEditVersion`. When either bumps, iterate all tiles in the active tab and call `handleTileRefresh` for each. This is the single reactive subscription point.
  - Keep `globalFiltersRef` updated from the store value (not local state).
  - Remove the local `const [globalFilters, setGlobalFilters] = useState(...)` (line 79) — this now lives in the store.

  In **GlobalFilterBar.jsx**:
  - No structural changes needed. The `onChange` prop already calls `handleGlobalFiltersChange` in the parent. The parent now writes to the store instead of local state. The component continues to receive `globalFilters` as a prop.
- **Test**: Start dev server (`cd frontend && npm run dev`), open dashboard, change a filter and click Apply → all tiles in active tab should refresh. Check browser console for no errors.
- **Commit**: `feat(filters): wire GlobalFilterBar to reactive Zustand filter slice`

### Task 3: Wire TileEditor Save to trigger reactive refresh (~3 min)
- **Files**: `frontend/src/pages/DashboardBuilder.jsx` (modify)
- **Depends on**: Task 1
- **Intent**:
  In `handleTileSave` (line 687-702): after the `api.updateTile` call succeeds and the fresh dashboard is fetched, call `bumpTileEditVersion()` from the store. This triggers the same `useEffect` from Task 2, which re-fetches the saved tile's data. This ensures "Save Changes" in TileEditor is immediately reflected.
- **Test**: Open TileEditor, change chart type or title, click Save Changes → tile should visually update immediately without manual page refresh.
- **Commit**: `feat(tiles): trigger reactive refresh on TileEditor save`

### Task 4: Collapsible sidebar (~5 min)
- **Files**: `frontend/src/pages/DashboardBuilder.jsx` (modify)
- **Depends on**: None (independent)
- **Intent**:
  - Add `const [sidebarCollapsed, setSidebarCollapsed] = useState(false)` state variable.
  - Modify the sidebar `<aside>` block (lines 1073-1242):
    - When `sidebarCollapsed === true`: render a narrow strip (width: 48px) containing only a `»` expand button (chevron-right icon) at the top.
    - When `sidebarCollapsed === false`: render the existing full 280px sidebar, but add a `«` collapse button (chevron-left icon) next to the "Dashboards" header text.
  - Add CSS transition on the `<aside>` width property (`transition: width 0.2s ease`) for smooth animation.
  - The main content area should use `flex: 1` so it automatically expands when sidebar collapses.
  - Persist collapse preference in `localStorage` key `qc_sidebar_collapsed` so it survives page refresh. Initialize state from localStorage.
- **Test**: Click collapse button → sidebar shrinks to thin strip, dashboard area expands. Click expand → sidebar returns to 280px. Refresh page → collapse state persists.
- **Commit**: `feat(sidebar): add collapsible dashboard list pane with localStorage persistence`

### Task 5: Reduce tile minimum sizes — Grid mode (~3 min)
- **Files**: `frontend/src/components/dashboard/Section.jsx` (modify)
- **Depends on**: None (independent)
- **Intent**:
  In the `tiles.map()` block (lines 38-54), the `<div key={tile.id}>` wrapper does not currently set `data-grid` min constraints. React-grid-layout uses per-item `data-grid` props for min/max sizes. Add `data-grid` attribute to each tile div:
  ```
  data-grid={{ ...tile.layout, minW: 2, minH: 2, minWidth: 2, minHeight: 2 }}
  ```
  This allows tiles to shrink to 2 grid units wide (2/12 = ~16.7% width) and 2 rows tall (120px). Currently they use react-grid-layout's defaults which are larger.
  
  Also check if the `layout` prop passed to `<GridLayout>` already has min constraints baked in — if so, override them to `minW: 2, minH: 2`.
- **Test**: In Grid layout mode, drag-resize a chart tile → it should shrink to roughly KPI-card size (2 columns, 2 rows). Verify KPI tiles still work at their current sizes.
- **Commit**: `feat(grid): allow tiles to shrink to 2x2 grid units minimum`

### Task 6: Reduce tile minimum sizes — Freeform mode (~2 min)
- **Files**: `frontend/src/components/dashboard/FreeformCanvas.jsx` (modify)
- **Depends on**: None (independent)
- **Intent**:
  Change the Rnd constraints at lines 134-135:
  - `minWidth={200}` → `minWidth={100}`
  - `minHeight={160}` → `minHeight={80}`
  This matches roughly the size of KPI cards and allows users to create compact tile arrangements.
- **Test**: In Freeform layout mode, resize a chart tile → it should shrink to 100x80px minimum. Verify tiles remain functional and don't break at small sizes.
- **Commit**: `feat(freeform): reduce minimum tile size to 100x80 for compact layouts`

### Task 7: Button functionality audit (~5 min)
- **Files**: Multiple dashboard components (modify as needed)
- **Depends on**: Tasks 2, 3 (filter pipeline must work first)
- **Intent**:
  Systematically verify every button handler in dashboard components by reading the code and tracing the callback chain. Key buttons to verify:
  
  **TileWrapper.jsx**: Refresh, AI Suggest, Edit SQL, Edit, Chart Type Picker, Delete
  **CommandBar.jsx**: AI Input submit, Add Tile, Export, Settings
  **DashboardHeader.jsx**: Edit Name, Metrics, Views/Bookmarks, Preview/Fullscreen, Theme
  **TabBar.jsx**: Tab select, Tab delete, Add Tab, Tab rename (double-click)
  **Section.jsx**: Collapse/Expand, Add Tile, Edit Section
  **GlobalFilterBar.jsx**: Add Filter, Remove Filter, Apply, Clear
  
  For each: trace the onClick → handler → prop chain. Fix any that are:
  - Wired to undefined/null handlers (dead buttons)
  - Missing `e.stopPropagation()` causing unintended click bubbling
  - Calling functions that don't update state or trigger re-renders
  
  Document findings and fixes in the commit message.
- **Test**: Each fixed button should produce its expected visual/state change. No console errors on any button click.
- **Commit**: `fix(dashboard): audit and fix broken button handlers`

## Task Dependencies & Parallelism

```
Task 1 (Zustand slice) ──┬── Task 2 (wire filters) ──┬── Task 7 (button audit)
                          └── Task 3 (wire tile save) ─┘
Task 4 (collapsible sidebar) ── independent
Task 5 (grid min-sizes) ── independent  
Task 6 (freeform min-sizes) ── independent
```

**Parallel group A**: Tasks 4, 5, 6 (all independent, no shared state)
**Sequential group B**: Task 1 → Tasks 2+3 (parallel) → Task 7

## Fingerprint
Dashboard sidebar collapses to 48px strip with localStorage persistence; tiles resize to 2x2 grid / 100x80 freeform minimum; global filters and tile edits propagate reactively through Zustand `dashboardFilterVersion` + `tileEditVersion` counters triggering a single useEffect refresh loop; all dashboard buttons verified functional.
