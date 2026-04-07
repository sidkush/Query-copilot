# Plan: Dashboard Overhaul — Week 1 (Phase 1 + Phase 2)

**Spec**: `docs/ultraflow/specs/2026-04-03-dashboard-overhaul.md`
**Approach**: Fix-First + Performance — all ADV-FIX markers mandatory
**Branch**: `master` (current working branch)

## Task Dependency Graph

```
T1 (activeModal refactor) ──┐
                             ├── T2 (settings modal) ── T3 (section menu)
T4 (KPI toolbar)             │
T5 (comment badge)           │
T6 (note deletion backend)   ├── T7 (note deletion frontend)
                             │
T8 (parallel refresh)        │   ← requires reducer pattern [ADV-FIX C1]
T9 (auto-save layout)        │   ← [ADV-FIX C3, H4]
T10 (instant filters)        │   ← [ADV-FIX H5]
T11 (React.memo tiles)       │
T12 (drop Recharts)          │   ← [ADV-FIX C5]
T13 (CSV/JSON export)        │
```

**Independent tasks (can run in parallel):** T4, T5, T6, T11, T12, T13
**Sequential chains:** T1 → T2 → T3, T6 → T7, T8 → T9 → T10

---

## Tasks

### Task 1: Refactor Modal State to Single `activeModal` (~5 min)
- **Files**: `frontend/src/pages/DashboardBuilder.jsx` (modify)
- **Intent**: Replace individual boolean states (`showExport`, `showMetricEditor`, `showThemeEditor`, `showBookmarks`) with a single `activeModal` state string. This prevents multiple modals stacking. [ADV-FIX M6]
- **Details**:
  - Remove: `showExport`, `showMetricEditor`, `showThemeEditor`, `showBookmarks` state declarations (lines ~78-89)
  - Add: `const [activeModal, setActiveModal] = useState(null);` — values: `'export'|'tileEditor'|'themeEditor'|'metrics'|'bookmarks'|'settings'|null`
  - Replace all `setShowExport(true)` → `setActiveModal('export')`, etc.
  - Replace all `showExport && <ExportModal>` → `activeModal === 'export' && <ExportModal>`
  - `editingTile` stays separate (it's data, not a modal toggle) — but opening TileEditor also sets `activeModal('tileEditor')`
  - All modal `onClose` handlers call `setActiveModal(null)`
- **Test**: `cd frontend && npm run build` → builds without errors. Open browser → click Export → Export modal opens → click Settings gear → Export modal closes, Settings opens (not both).
- **Commit**: `refactor: unify modal state to prevent stacking [ADV-FIX M6]`

---

### Task 2: Build SettingsModal + Wire Gear Button (~5 min)
- **Files**: `frontend/src/components/dashboard/SettingsModal.jsx` (create), `frontend/src/pages/DashboardBuilder.jsx` (modify)
- **Intent**: Create a settings modal following the existing TileEditor modal pattern. Wire the gear icon in CommandBar.
- **Details**:
  - `SettingsModal.jsx`: Modal with 3 tabs (General, Layout, Export). Import `TOKENS` from `tokens.js`. Props: `dashboard`, `onSave`, `onClose`.
    - **General tab**: Auto-refresh interval (dropdown: off/30s/1m/5m), timezone (text input), default date range (dropdown from RANGES)
    - **Layout tab**: Default tile gap (slider 4-24), default tile padding (slider 8-32), animation speed (fast/normal/slow)
    - **Export tab**: Default format (PDF/PNG radio), page orientation (landscape/portrait), include timestamp (checkbox)
  - `DashboardBuilder.jsx`:
    - Remove `handleSettings = console.log("Open settings")` (line 992-994)
    - Replace with `const handleSettings = useCallback(() => setActiveModal('settings'), []);`
    - Add `SettingsModal` render: `{activeModal === 'settings' && <SettingsModal dashboard={activeDashboard} onSave={handleSettingsSave} onClose={() => setActiveModal(null)} />}`
    - `handleSettingsSave`: calls `api.updateDashboard(dash.id, { settings: newSettings })`, merges into `activeDashboard`
  - Settings stored in `dashboard.settings` field — backend already accepts arbitrary fields in `updateDashboard`
- **Test**: `npm run build` → no errors. Browser → click gear icon → SettingsModal opens with 3 tabs. Change auto-refresh to "1m" → Save → reload page → setting persists.
- **Commit**: `feat: add SettingsModal and wire gear button [spec 1.1]`

---

### Task 3: Fix Section "..." Menu with Dropdown (~5 min)
- **Files**: `frontend/src/components/dashboard/Section.jsx` (modify), `frontend/src/pages/DashboardBuilder.jsx` (modify)
- **Intent**: Replace the dead "..." button with a functional dropdown menu. Fix the missing `sectionId` argument.
- **Details**:
  - `Section.jsx` line 103: Change `onEditSection?.()` to `onEditSection?.(section.id, 'menu')`
  - Replace the single "..." button with a local state dropdown (`showMenu` bool):
    - **Rename** — sets inline editing state (same pattern as TabBar rename)
    - **Delete Section** — calls `onDeleteSection?.(section.id)` with browser `confirm()` dialog
    - **Move Up / Move Down** — calls `onReorderSection?.(section.id, 'up'|'down')`
  - **Note:** VisibilityRuleEditor modal (spec 1.2) is deferred to Week 2 — the dropdown includes a disabled "Visibility Rules (coming soon)" item as a placeholder
  - Add new props to Section: `onDeleteSection`, `onReorderSection`, `onRenameSection`
  - `DashboardBuilder.jsx`:
    - Add `handleDeleteSection(sectionId)` — removes section from active tab, moves orphaned tiles to first section or deletes them. Calls `autoSave`.
    - Add `handleReorderSection(sectionId, direction)` — swaps section position in the `sections` array. Calls `autoSave`.
    - Add `handleRenameSection(sectionId, newName)` — updates section name. Calls `autoSave`.
    - Pass new handlers to `<Section>` in the render loop (line ~1589)
  - Update `onEditSection` prop in the `<Section>` render to pass section.id: already handled by Section.jsx change above
- **Test**: `npm run build` → no errors. Browser → hover section header → click "..." → dropdown appears with Rename/Delete/Move Up/Move Down. Click "Rename" → inline input appears. Click "Delete" → confirm dialog → section removed.
- **Commit**: `feat: fix section menu with rename, delete, reorder [spec 1.2]`

---

### Task 4: KPI Tiles — Full Toolbar Parity (~5 min)
- **Files**: `frontend/src/components/dashboard/TileWrapper.jsx` (modify)
- **Intent**: Remove the KPI early return so KPI tiles render inside the same container as all other tiles, gaining hover toolbar, selection, cross-filter, and drag handle. [ADV-FIX C4]
- **Details**:
  - Remove lines 87-89 (the `if (tile?.chartType === 'kpi') return <KPICard>` early return)
  - In the chart body area (line ~212), add a conditional:
    ```jsx
    {tile?.chartType === 'kpi' ? (
      <KPICard tile={tile} index={index} onEdit={onEdit} />
    ) : chartRows?.length > 0 ? (
      // existing chart rendering logic
    ) : ...}
    ```
  - This preserves the outer `<div>` with: selection outline, theme styling, drag handle, hover toolbar buttons (refresh, AI suggest, edit SQL, edit, chart type picker, remove)
  - `KPICard.jsx`: Remove the root `onClick={() => onEdit?.(tile)}` — the toolbar "Edit" button handles this now
  - `KPICard.jsx`: Remove `cursor-pointer` class from root div
- **Test**: `npm run build` → no errors. Browser → view KPI tile → hover → toolbar appears with refresh/edit/remove/chart-type buttons. Click tile → selection outline appears. Drag handle works.
- **Commit**: `feat: give KPI tiles full toolbar parity [spec 1.3, ADV-FIX C4]`

---

### Task 5: Comment Badge — Functional Popover (~5 min)
- **Files**: `frontend/src/components/dashboard/TileWrapper.jsx` (modify)
- **Intent**: Make the comment count badge clickable, showing a per-tile annotation popover.
- **Details**:
  - Add local state: `const [showComments, setShowComments] = useState(false);`
  - On the comment badge `<span>` (line ~130), add `onClick={(e) => { e.stopPropagation(); setShowComments(o => !o); }}`
  - Below the badge, render a popover when `showComments && commentCount > 0`:
    - Positioned `absolute right-0 top-8 z-50` with TOKENS styling
    - Lists `tile.annotations` with author initials, relative time, text
    - Input + Send button at bottom (calls `api.addTileAnnotation`)
    - Close on click outside (same pattern as chartPickerOpen, line 62-71)
  - Close comments popover when chart picker opens and vice versa
- **Test**: `npm run build` → no errors. Browser → tile with annotations → hover → click comment badge → popover shows annotations. Add a new annotation → appears in list. Click outside → popover closes.
- **Commit**: `feat: make comment badge clickable with annotation popover [spec 1.4]`

---

### Task 6: Note Deletion — Backend Endpoint (~3 min)
- **Files**: `backend/routers/dashboard_routes.py` (modify), `backend/user_storage.py` (modify), `frontend/src/api.js` (modify)
- **Intent**: Add DELETE endpoint for dashboard annotations and tile annotations.
- **Details**:
  - `backend/user_storage.py`: Add `delete_annotation(email, dashboard_id, annotation_id, tile_id=None)` function
    - Load dashboard, find annotation by ID in `dashboard['annotations']` or `tile['annotations']`, remove it, save
    - Return updated dashboard
  - `backend/routers/dashboard_routes.py`: Add two endpoints:
    ```python
    @router.delete("/{dashboard_id}/annotations/{annotation_id}")
    async def delete_dashboard_annotation(dashboard_id: str, annotation_id: str, user=Depends(get_current_user)):
        d = delete_annotation(user["email"], dashboard_id, annotation_id)
        if not d:
            raise HTTPException(404, "Annotation not found")
        return d

    @router.delete("/{dashboard_id}/tiles/{tile_id}/annotations/{annotation_id}")
    async def delete_tile_annotation(dashboard_id: str, tile_id: str, annotation_id: str, user=Depends(get_current_user)):
        d = delete_annotation(user["email"], dashboard_id, annotation_id, tile_id=tile_id)
        if not d:
            raise HTTPException(404, "Annotation not found")
        return d
    ```
  - `frontend/src/api.js`: Add:
    ```js
    deleteDashboardAnnotation: (dashboardId, annotationId) =>
      request(`/dashboards/${dashboardId}/annotations/${annotationId}`, { method: "DELETE" }),
    deleteTileAnnotation: (dashboardId, tileId, annotationId) =>
      request(`/dashboards/${dashboardId}/tiles/${tileId}/annotations/${annotationId}`, { method: "DELETE" }),
    ```
- **Test**: `curl -X DELETE http://localhost:8002/api/dashboards/{id}/annotations/{ann_id} -H "Authorization: Bearer {token}"` → 200 + updated dashboard without that annotation.
- **Commit**: `feat: add annotation delete endpoints [spec 1.5]`

---

### Task 7: Note Deletion — Frontend UI (~3 min)
- **Files**: `frontend/src/components/dashboard/NotesPanel.jsx` (modify), `frontend/src/pages/DashboardBuilder.jsx` (modify)
- **Intent**: Add delete button per note in the NotesPanel. Wire to API.
- **Details**:
  - `NotesPanel.jsx`: Add `onDelete` prop. In each note render (line 36-49), add a hover-visible trash button:
    ```jsx
    <button onClick={() => onDelete?.(note.id)}
      className="opacity-0 group-hover:opacity-100 ml-auto cursor-pointer"
      style={{ color: TOKENS.danger, background: 'none', border: 'none', transition: `opacity ${TOKENS.transition}` }}>
      <svg ...trash icon... className="w-3.5 h-3.5" />
    </button>
    ```
  - Wrap each note `<div>` in a `group` class for hover detection
  - `DashboardBuilder.jsx`: Pass `onDelete` to NotesPanel:
    ```jsx
    <NotesPanel
      annotations={activeDashboard?.annotations || []}
      userName={...}
      onAdd={handleAddAnnotation}
      onDelete={async (annotationId) => {
        const updated = await api.deleteDashboardAnnotation(activeDashboard.id, annotationId);
        setActiveDashboard(updated);
      }}
    />
    ```
- **Test**: `npm run build` → no errors. Browser → NotesPanel → hover a note → trash icon appears → click → note disappears.
- **Commit**: `feat: add note deletion UI [spec 1.5]`

---

### Task 8: Parallel Tile Refresh with Reducer Pattern (~5 min)
- **Files**: `frontend/src/pages/DashboardBuilder.jsx` (modify)
- **Intent**: Replace sequential tile refresh with parallel execution. Use single `getDashboard` after all settle to avoid state races. [ADV-FIX C1]
- **Details**:
  - `handleTileRefresh` (line 668-684): Change to ONLY call `api.refreshTile()` — remove the `api.getDashboard()` + `setActiveDashboard()` calls:
    ```js
    const handleTileRefresh = useCallback(
      async (tileId, connId, filtersOverride = null) => {
        const dash = dashboardRef.current;
        if (!dash) return;
        const filtersUrl = filtersOverride || globalFiltersRef.current;
        await api.refreshTile(dash.id, tileId, connId, filtersUrl);
        // Do NOT getDashboard or setActiveDashboard here — caller handles that
      },
      []
    );
    ```
  - `refreshAllTiles` (line 689-723): Replace sequential loop with parallel + single state update:
    ```js
    const refreshAllTiles = useCallback((filtersOverride) => {
      const dash = dashboardRef.current;
      const tabId = activeTabIdRef.current;
      if (!dash || !tabId) return;
      const currentTab = dash.tabs.find(t => t.id === tabId);
      if (!currentTab) return;
      const tiles = [];
      currentTab.sections.forEach(s => s.tiles.forEach(t => tiles.push({ id: t.id, title: t.title || t.id })));

      (async () => {
        const results = await Promise.allSettled(
          tiles.map(tile => api.refreshTile(dash.id, tile.id, activeConnId, filtersOverride || globalFiltersRef.current))
        );
        const failedNames = results
          .map((r, i) => r.status === 'rejected' ? tiles[i].title : null)
          .filter(Boolean);

        // ONE getDashboard call after all tiles refreshed
        try {
          const fresh = await api.getDashboard(dash.id);
          if (fresh) setActiveDashboard(fresh);
        } catch (e) {
          console.error("[filter] failed to fetch fresh dashboard:", e);
        }

        if (failedNames.length > 0) {
          setFilterError(`${failedNames.length} tile(s) failed: ${failedNames.join(', ')}`);
          setTimeout(() => setFilterError(null), 10000);
        }
      })();
    }, [activeConnId]);
    ```
- **Test**: `npm run build` → no errors. Browser → apply a date filter → all tiles show spinners simultaneously → all resolve with data → no stale/reverted tiles.
- **Commit**: `perf: parallel tile refresh with single state update [spec 2.1, ADV-FIX C1]`

---

### Task 9: Auto-Save Layout — Remove "Apply Layout" Button (~5 min)
- **Files**: `frontend/src/pages/DashboardBuilder.jsx` (modify)
- **Intent**: Auto-save layout on drag/resize with debounce. Remove "Apply Layout" button. Capture tab ID via ref to avoid stale-tab writes. [ADV-FIX C3, H4]
- **Details**:
  - `handleLayoutChange` (line 398-416): After updating state, trigger debounced auto-save instead of setting `layoutDirty`:
    ```js
    const handleLayoutChange = useCallback(
      (sectionId, newLayout) => {
        setActiveDashboard((prev) => {
          if (!prev) return prev;
          const tabId = activeTabIdRef.current;
          const tabs = prev.tabs.map((tab) => {
            if (tab.id !== tabId) return tab;
            return { ...tab, sections: tab.sections.map((sec) =>
              sec.id === sectionId ? { ...sec, layout: newLayout } : sec
            )};
          });
          const updated = { ...prev, tabs };
          // [ADV-FIX H4] Debounced auto-save captures current state at fire time
          if (layoutSaveTimer.current) clearTimeout(layoutSaveTimer.current);
          layoutSaveTimer.current = setTimeout(() => {
            const current = dashboardRef.current;
            if (current) autoSave(current);
          }, 800);
          return updated;
        });
      },
      [autoSave]
    );
    ```
  - Add ref: `const layoutSaveTimer = useRef(null);`
  - Remove: `const [layoutDirty, setLayoutDirty] = useState(false);` (line 396)
  - Remove: `handleApplyLayout` callback (lines 440-446)
  - Remove: "Apply Layout" button JSX (lines 1513-1533)
  - Cleanup: Add `layoutSaveTimer` to the cleanup useEffect (line ~1006)
- **Test**: `npm run build` → no errors. Browser → drag a tile to new position → wait 1s → reload page → tile stays in new position. No "Apply Layout" button visible.
- **Commit**: `feat: auto-save layout with debounce, remove Apply button [spec 2.2, ADV-FIX C3, H4]`

---

### Task 10: Instant Filter Apply — Remove "Apply" Button (~5 min)
- **Files**: `frontend/src/components/dashboard/GlobalFilterBar.jsx` (modify)
- **Intent**: Filters apply automatically on change with 500ms debounce. Remove Apply button. Add bookmark schema version. [ADV-FIX H5]
- **Details**:
  - Add debounce ref: `const applyTimer = useRef(null);`
  - Create debounced apply function:
    ```js
    const debouncedApply = useCallback((newState) => {
      if (applyTimer.current) clearTimeout(applyTimer.current);
      applyTimer.current = setTimeout(() => {
        onChange(newState);
      }, 500);
    }, [onChange]);
    ```
  - On `setRange` change (line 195): after `setRange(newRange)`, call `debouncedApply({ dateColumn, range: newRange, dateStart, dateEnd, fields })`
  - On `setDateColumn` change: same pattern
  - On `dateStart`/`dateEnd` change: debounce at 800ms (to avoid firing while user types)
  - On field filter add/remove: call `debouncedApply` immediately
  - Remove the "Apply" button (line 328). Keep the "Clear" button (it calls `onChange` directly with empty filters).
  - Cleanup: `useEffect(() => () => { if (applyTimer.current) clearTimeout(applyTimer.current); }, []);`
- **Test**: `npm run build` → no errors. Browser → select "Last Month" from date range dropdown → tiles refresh automatically after 500ms. No "Apply" button visible. "Clear" still works.
- **Commit**: `feat: instant filter apply with debounce, remove Apply button [spec 2.3, ADV-FIX H5]`

---

### Task 11: React.memo TileWrapper (~3 min)
- **Files**: `frontend/src/components/dashboard/TileWrapper.jsx` (modify)
- **Intent**: Wrap TileWrapper in React.memo with a custom comparator to prevent unnecessary re-renders.
- **Details**:
  - At the bottom of the file, change `export default function TileWrapper(...)` to:
    ```jsx
    function TileWrapper({ ... }) {
      // ... existing component body
    }

    export default React.memo(TileWrapper, (prev, next) => {
      // Return true if props are "equal" (skip re-render)
      return (
        prev.tile?.id === next.tile?.id &&
        prev.tile?.rows === next.tile?.rows &&
        prev.tile?.columns === next.tile?.columns &&
        prev.tile?.chartType === next.tile?.chartType &&
        prev.tile?.palette === next.tile?.palette &&
        prev.tile?.visualConfig === next.tile?.visualConfig &&
        prev.tile?.title === next.tile?.title &&
        prev.tile?.annotations === next.tile?.annotations &&
        prev.selectedTileId === next.selectedTileId &&
        prev.crossFilter === next.crossFilter &&
        prev.themeConfig === next.themeConfig
      );
    });
    ```
  - Add `React` to the imports (it's already imported via `{ useState, ... }` from 'react' — add `memo` or use `React.memo`)
  - Import `memo` from 'react': `import { useState, useRef, useEffect, useMemo, useCallback, lazy, Suspense, memo } from 'react';`
  - Use `export default memo(TileWrapper, ...)` instead of `React.memo`
- **Test**: `npm run build` → no errors. Browser → open React DevTools Profiler → refresh dashboard → verify only the refreshed tile re-renders, not all tiles.
- **Commit**: `perf: React.memo on TileWrapper to prevent unnecessary re-renders [spec 2.4]`

---

### Task 12: Drop Recharts — Pure SVG Sparkline (~5 min)
- **Files**: `frontend/src/components/dashboard/KPICard.jsx` (modify), `frontend/package.json` (modify)
- **Intent**: Replace Recharts sparkline with hand-rolled SVG bars. Remove recharts dependency. [ADV-FIX C5]
- **Details**:
  - First verify: only `KPICard.jsx` imports from `recharts` (confirmed by grep — only 1 match)
  - `KPICard.jsx`: Remove `import { ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';` (line 3)
  - Replace the sparkline section (lines 110-122) with pure SVG:
    ```jsx
    {trendData.length > 2 && (
      <div className="w-[80px] h-[40px] opacity-70 group-hover:opacity-100 transition-opacity">
        <svg viewBox={`0 0 ${trendData.length * 12} 40`} className="w-full h-full">
          {trendData.map((entry, idx) => {
            const maxVal = Math.max(...trendData.map(d => d.value), 1);
            const barH = (entry.value / maxVal) * 36;
            return (
              <rect
                key={idx}
                x={idx * 12 + 1}
                y={40 - barH}
                width={10}
                height={barH}
                rx={2}
                fill={accentColor}
                fillOpacity={idx === trendData.length - 1 ? 1 : 0.4}
              />
            );
          })}
        </svg>
      </div>
    )}
    ```
  - Remove `recharts` from `package.json` dependencies
  - Run `npm install` to update lockfile
- **Test**: `npm run build` → no errors, no "recharts" in build output. Browser → KPI card shows sparkline bars with correct accent color and opacity.
- **Commit**: `perf: replace Recharts sparkline with pure SVG, remove recharts dependency [spec 2.5, ADV-FIX C5]`

---

### Task 13: CSV/JSON Export Per Tile (~3 min)
- **Files**: `frontend/src/components/dashboard/TileWrapper.jsx` (modify)
- **Intent**: Add a download button to the tile hover toolbar for CSV/JSON export of tile data.
- **Details**:
  - Add a download button to the toolbar array (after "Edit", before chart type picker):
    ```jsx
    { title: 'Download', icon: 'M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3',
      onClick: () => {
        const cols = tile?.columns || [];
        const rows = tile?.rows || [];
        if (!cols.length) return;
        const header = cols.join(',');
        const csvRows = rows.map(r => cols.map(c => {
          const v = r[c];
          return typeof v === 'string' && v.includes(',') ? `"${v}"` : v ?? '';
        }).join(','));
        const csv = [header, ...csvRows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${(tile?.title || 'data').replace(/[^a-zA-Z0-9]/g, '_')}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      }
    }
    ```
  - Insert this into the toolbar buttons array at line ~140, between "Edit" and the chart type picker
- **Test**: `npm run build` → no errors. Browser → hover tile → click Download button → CSV file downloads with correct columns and rows.
- **Commit**: `feat: add CSV export per tile via toolbar button [spec 5.3]`

---

## Fingerprint

When all 13 tasks are complete: Gear icon opens a 3-tab SettingsModal. Section "..." menu has Rename/Delete/Move Up/Move Down. KPI tiles have full hover toolbar parity (refresh, edit, chart type, remove). Comment badges open a clickable annotation popover. Notes have delete buttons. Tiles refresh in parallel (~500ms vs ~5s). Layout auto-saves on drag (no "Apply Layout" button). Filters apply instantly on change (no "Apply" button). TileWrapper is memoized. Recharts is removed (pure SVG sparklines). Every tile has a CSV download button. All modal booleans replaced with single `activeModal` state. No `console.log("Open settings")` anywhere.
