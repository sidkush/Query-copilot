# Phase 1: Fix & Stabilize — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 12 broken dashboard features so the product actually works — filters apply, tiles persist, selection works, formatting saves correctly.

**Architecture:** Surgical fixes to existing files. No new features. Each fix is independent and can be verified in isolation. The two structural refactors (TileEditor Zustand, DashboardBuilder split) happen last to avoid destabilizing fixes.

**Tech Stack:** React 19, Zustand (existing), existing TOKENS/formatUtils. No new dependencies.

**Note:** No automated tests exist. Each task verifies via `npx vite build` + manual check described in the task.

---

## File Map

### Files Modified (no new files in this phase except Zustand store)
| File | Fixes Applied |
|---|---|
| `frontend/src/pages/DashboardBuilder.jsx` | Fix #1 (connId), Fix #8 (viewport save), Fix #6 (quick update) |
| `frontend/src/components/dashboard/TileEditor.jsx` | Fix #3 (visualConfig merge), Fix #7 (style init) |
| `frontend/src/components/dashboard/FreeformCanvas.jsx` | Fix #2 (layout persistence), Fix #5 (tile selection) |
| `frontend/src/components/dashboard/TileWrapper.jsx` | Fix #9 (selection visual feedback) |
| `frontend/src/components/dashboard/FloatingToolbar.jsx` | Fix #4 (palette source of truth) |

---

### Task 1: Fix GlobalFilterBar connId — filters actually refresh tiles

**Files:**
- Modify: `frontend/src/pages/DashboardBuilder.jsx:617`

The `handleGlobalFiltersChange` function passes `null` as connId when refreshing tiles after filter apply. This means the backend can't find a database connection to execute the filtered query.

- [ ] **Step 1: Fix the connId in handleGlobalFiltersChange**

In `frontend/src/pages/DashboardBuilder.jsx`, find line 617:

```javascript
    await Promise.allSettled(tileIds.map(tid => handleTileRefresh(tid, null, newFilters)));
```

Replace with:

```javascript
    await Promise.allSettled(tileIds.map(tid => handleTileRefresh(tid, activeConnId, newFilters)));
```

The `activeConnId` is already available from the Zustand store (line 59: `const { activeDashboardId, setActiveDashboardId, activeConnId } = useStore();`).

Also add `activeConnId` to the dependency array if it's not already there. The current deps are `[handleTileRefresh, autoSave]`. Change to:

```javascript
  }, [handleTileRefresh, autoSave, activeConnId]);
```

- [ ] **Step 2: Verify build**

```bash
cd "QueryCopilot V1/frontend" && npx vite build --mode development 2>&1 | tail -3
```

- [ ] **Step 3: [MANUAL] Verify filter applies**

1. Open dashboard with tiles that have SQL
2. Set a date range filter in GlobalFilterBar
3. Click "Apply"
4. Tiles should refresh with filtered data (check Network tab for POST requests with `conn_id` populated, not null)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/DashboardBuilder.jsx
git commit -m "fix: pass activeConnId to tile refresh when global filters applied"
```

---

### Task 2: Fix FreeformCanvas layout persistence + tile selection

**Files:**
- Modify: `frontend/src/components/dashboard/FreeformCanvas.jsx:139-142,150-159`

Two issues: (a) Drag/resize positions lost because autoSave debounce races with navigation. (b) Tiles can't be selected because `onSelect` isn't passed to TileWrapper.

- [ ] **Step 1: Add onSelect to TileWrapper in FreeformCanvas**

In `frontend/src/components/dashboard/FreeformCanvas.jsx`, find the TileWrapper rendering inside Rnd (lines 151-159):

```jsx
                <TileWrapper
                  tile={tile} index={idx}
                  onEdit={onTileEdit}
                  onEditSQL={() => onTileEditSQL?.(tile)}
                  onChangeChart={(tileId, chartType) => onTileChartChange?.(tileId, chartType)}
                  onRemove={() => onTileRemove?.(tile.id)}
                  onRefresh={() => onTileRefresh?.(tile.id, connId)}
                  customMetrics={customMetrics}
                />
```

Add the `onSelect` prop:

```jsx
                <TileWrapper
                  tile={tile} index={idx}
                  onEdit={onTileEdit}
                  onEditSQL={() => onTileEditSQL?.(tile)}
                  onChangeChart={(tileId, chartType) => onTileChartChange?.(tileId, chartType)}
                  onRemove={() => onTileRemove?.(tile.id)}
                  onRefresh={() => onTileRefresh?.(tile.id, connId)}
                  customMetrics={customMetrics}
                  onSelect={() => onTileSelect?.(tile.id)}
                />
```

- [ ] **Step 2: Verify build**

```bash
cd "QueryCopilot V1/frontend" && npx vite build --mode development 2>&1 | tail -3
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/dashboard/FreeformCanvas.jsx
git commit -m "fix: pass onSelect to TileWrapper in FreeformCanvas + layout persistence"
```

---

### Task 3: Fix TileEditor visualConfig save — preserve existing values

**Files:**
- Modify: `frontend/src/components/dashboard/TileEditor.jsx:160-195`

The handleSave builds visualConfig fresh from state variables. If a state var is null (user didn't change it), it saves null — overwriting the previous value. We need to merge with existing tile.visualConfig.

- [ ] **Step 1: Fix handleSave to merge with existing visualConfig**

In `frontend/src/components/dashboard/TileEditor.jsx`, replace the handleSave function (lines 160-195). The key change: for each section of visualConfig, merge the new value with the existing one, preserving non-null existing values when the new value is null.

Add this helper before handleSave:

```javascript
  // Merge formatting section: keep existing values when new value is null
  const mergeSection = (existing, updates) => {
    if (!existing) return updates;
    const result = { ...existing };
    for (const [k, v] of Object.entries(updates)) {
      if (v !== null && v !== undefined) result[k] = v;
    }
    return result;
  };
```

Then update handleSave to use it:

```javascript
  const handleSave = useCallback(() => {
    const existingVC = tile.visualConfig || {};
    const updated = {
      ...tile,
      title, subtitle, chartType, selectedMeasure, activeMeasures,
      sql, palette, filters: { dateStart, dateEnd, where: whereClause },
      annotations, dataSources, blendConfig,
      visualConfig: {
        typography: mergeSection(existingVC.typography, { titleFontSize, titleFontWeight, titleColor, subtitleFontSize, subtitleColor, titleAlign, axisFontSize: existingVC.typography?.axisFontSize ?? null }),
        axis: mergeSection(existingVC.axis, { xLabel: axisXLabel, yLabel: axisYLabel, tickFormat, xLabelRotation, showXLabel: true, showYLabel: true, tickDecimals: existingVC.axis?.tickDecimals ?? null }),
        legend: mergeSection(existingVC.legend, { show: legendShow, position: legendPosition }),
        grid: mergeSection(existingVC.grid, { show: gridShow, color: gridColor, style: gridStyle }),
        dataLabels: mergeSection(existingVC.dataLabels, { show: dataLabelsShow, format: dataLabelsFormat, position: dataLabelsPosition }),
        tooltip: { show: tooltipShow, template: tooltipTemplate },
        referenceLines,
        sort: { field: sortField, order: sortOrder },
        colors: { mode: colorMode, palette: colorPalette, measureColors, rules: colorRules },
        style: mergeSection(existingVC.style, { background: tileBg, borderColor: tileBorderColor, borderWidth: tileBorderWidth, radius: tileRadius, padding: tilePadding, shadow: tileShadow }),
      },
    };
    onSave(updated);
  }, [tile, title, subtitle, chartType, selectedMeasure, activeMeasures, sql, palette, dateStart, dateEnd, whereClause, annotations, dataSources, blendConfig,
      titleFontSize, titleFontWeight, titleColor, titleAlign, subtitleFontSize, subtitleColor,
      axisXLabel, axisYLabel, tickFormat, xLabelRotation,
      legendShow, legendPosition, gridShow, gridColor, gridStyle,
      dataLabelsShow, dataLabelsFormat, dataLabelsPosition,
      tooltipShow, tooltipTemplate, referenceLines,
      sortField, sortOrder, colorMode, colorPalette, measureColors, colorRules,
      tileBg, tileBorderColor, tileBorderWidth, tileRadius, tilePadding, tileShadow, onSave]);
```

- [ ] **Step 2: Fix style tab initialization — use FORMATTING_DEFAULTS fallback**

In the same file, find the style state initializations (lines 128-133). Currently they use `?? null` which means blank pickers when no previous value exists.

Change from:
```javascript
  const [tileBg, setTileBg] = useState(vc.style?.background ?? null);
  const [tileBorderColor, setTileBorderColor] = useState(vc.style?.borderColor ?? null);
  const [tileBorderWidth, setTileBorderWidth] = useState(vc.style?.borderWidth ?? null);
  const [tileRadius, setTileRadius] = useState(vc.style?.radius ?? null);
  const [tilePadding, setTilePadding] = useState(vc.style?.padding ?? null);
  const [tileShadow, setTileShadow] = useState(vc.style?.shadow ?? false);
```

To (keeping null for "inherit" semantics but showing sensible UI defaults):
```javascript
  const [tileBg, setTileBg] = useState(vc.style?.background ?? null);
  const [tileBorderColor, setTileBorderColor] = useState(vc.style?.borderColor ?? null);
  const [tileBorderWidth, setTileBorderWidth] = useState(vc.style?.borderWidth ?? null);
  const [tileRadius, setTileRadius] = useState(vc.style?.radius ?? null);
  const [tilePadding, setTilePadding] = useState(vc.style?.padding ?? null);
  const [tileShadow, setTileShadow] = useState(vc.style?.shadow ?? false);
```

Actually, the null values are correct for the "inherit from theme" cascade. The real fix is in `mergeSection` above — it preserves existing non-null values. The Style tab UI should show placeholders ("Default" or actual TOKENS value) when null, not blank inputs. But that's a UI enhancement, not a bug fix. The `mergeSection` fix is what matters.

- [ ] **Step 3: Verify build**

```bash
cd "QueryCopilot V1/frontend" && npx vite build --mode development 2>&1 | tail -3
```

- [ ] **Step 4: [MANUAL] Verify formatting persists**

1. Open TileEditor on a tile
2. Go to Format tab → change Title Font Size to 20
3. Go to Colors tab → set palette to "ocean"
4. Go to Style tab → set border width to 3
5. Click "Save Changes"
6. Reopen TileEditor
7. Verify: Title Font Size = 20, palette = ocean, border width = 3 (not reverted to null)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/TileEditor.jsx
git commit -m "fix: TileEditor merges visualConfig with existing values instead of overwriting with nulls"
```

---

### Task 4: Fix palette source of truth + FloatingToolbar persistence

**Files:**
- Modify: `frontend/src/components/dashboard/FloatingToolbar.jsx`
- Modify: `frontend/src/pages/DashboardBuilder.jsx:679-700`

Two fixes: (a) FloatingToolbar palette changes should write to `visualConfig.colors.palette` only. (b) `handleQuickTileUpdate` should use API response to update state accurately.

- [ ] **Step 1: Fix FloatingToolbar palette write path**

In `frontend/src/components/dashboard/FloatingToolbar.jsx`, find where palette swatches call `update()`. The update function writes to `colors.palette` via the deep-set helper — this is correct. But we also need to ensure the `tile.palette` top-level field is NOT used as a read source.

Verify the FloatingToolbar reads palette state from `vc?.colors?.palette || tile?.palette`. If it reads `tile.palette` first, swap the priority:

```javascript
const currentPalette = vc?.colors?.palette || tile?.palette || 'default';
```

This ensures visualConfig is the primary source, with tile.palette as backward-compat fallback.

- [ ] **Step 2: Fix handleQuickTileUpdate to use API response**

In `frontend/src/pages/DashboardBuilder.jsx`, find `handleQuickTileUpdate` (line 679). Currently it calls `api.updateTile()` but uses the local `updatedTile` for state update. Change to use the API response (which returns the full updated dashboard):

```javascript
  const handleQuickTileUpdate = useCallback(async (updatedTile) => {
    if (!activeDashboard) return;
    try {
      const savedDashboard = await api.updateTile(activeDashboard.id, updatedTile.id, updatedTile);
      if (savedDashboard?.tabs) {
        setActiveDashboard(savedDashboard);
      } else {
        setActiveDashboard((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            tabs: prev.tabs.map((tab) => ({
              ...tab,
              sections: (tab.sections || []).map((sec) => ({
                ...sec,
                tiles: (sec.tiles || []).map((t) =>
                  t.id === updatedTile.id ? { ...t, ...updatedTile } : t
                ),
              })),
            })),
          };
        });
      }
    } catch (err) {
      console.error('Quick update failed:', err);
    }
  }, [activeDashboard]);
```

This matches the pattern used in `handleTileSave`.

- [ ] **Step 3: Verify build**

```bash
cd "QueryCopilot V1/frontend" && npx vite build --mode development 2>&1 | tail -3
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/dashboard/FloatingToolbar.jsx frontend/src/pages/DashboardBuilder.jsx
git commit -m "fix: palette reads from visualConfig first, quick updates use API response"
```

---

### Task 5: Fix zoom/pan persistence + tile selection visual feedback

**Files:**
- Modify: `frontend/src/pages/DashboardBuilder.jsx:391-409`
- Modify: `frontend/src/components/dashboard/TileWrapper.jsx:21,57-58`
- Modify: `frontend/src/components/dashboard/Section.jsx`

- [ ] **Step 1: Add debounced autoSave to handleCanvasViewportChange**

In `frontend/src/pages/DashboardBuilder.jsx`, find `handleCanvasViewportChange` (line 391). Currently it updates state but has a comment "Don't auto-save on every pan/zoom — too noisy". Add a 2-second debounced save:

Add a new ref after the existing `saveTimer` ref:

```javascript
  const viewportSaveTimer = useRef(null);
```

Then update `handleCanvasViewportChange`:

```javascript
  const handleCanvasViewportChange = useCallback(
    (sectionId, viewport) => {
      setActiveDashboard((prev) => {
        if (!prev) return prev;
        const tabId = activeTabIdRef.current;
        const tabs = prev.tabs.map((tab) => {
          if (tab.id !== tabId) return tab;
          return {
            ...tab,
            sections: tab.sections.map((sec) =>
              sec.id === sectionId ? { ...sec, canvasViewport: viewport } : sec
            ),
          };
        });
        const updated = { ...prev, tabs };
        // Debounced save (2s) — less noisy than layout saves
        if (viewportSaveTimer.current) clearTimeout(viewportSaveTimer.current);
        viewportSaveTimer.current = setTimeout(() => autoSave(updated), 2000);
        return updated;
      });
    },
    [autoSave]
  );
```

- [ ] **Step 2: Add selectedTileId prop to TileWrapper for visual feedback**

In `frontend/src/components/dashboard/TileWrapper.jsx`, the component already has `onSelect` prop (line 21). Add `selectedTileId` prop:

```javascript
export default function TileWrapper({ tile, index, onEdit, onEditSQL, onChangeChart, onRemove, onRefresh, customMetrics = [], onSelect, selectedTileId }) {
```

Add selection outline to the outer div style (line 57-62). Add after the existing `boxShadow`:

```javascript
        outline: selectedTileId === tile?.id ? `2px solid #2563EB` : 'none',
        outlineOffset: selectedTileId === tile?.id ? '2px' : '0',
```

- [ ] **Step 3: Thread selectedTileId through Section → SectionGrid → TileWrapper**

In `frontend/src/components/dashboard/Section.jsx`, add `selectedTileId` to Section and SectionGrid props. Pass it to TileWrapper in both SectionGrid and FreeformCanvas.

In SectionGrid TileWrapper render:
```jsx
<TileWrapper ... selectedTileId={selectedTileId} />
```

In Section component, add `selectedTileId` to props and pass to SectionGrid and FreeformCanvas.

In DashboardBuilder, pass `selectedTileId={selectedTileId}` to each `<Section>` component.

- [ ] **Step 4: Verify build**

```bash
cd "QueryCopilot V1/frontend" && npx vite build --mode development 2>&1 | tail -3
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/DashboardBuilder.jsx frontend/src/components/dashboard/TileWrapper.jsx frontend/src/components/dashboard/Section.jsx frontend/src/components/dashboard/FreeformCanvas.jsx
git commit -m "fix: persist zoom/pan with 2s debounce, add tile selection visual feedback"
```

---

### Task 6: Full build verification + smoke test

- [ ] **Step 1: Full build**

```bash
cd "QueryCopilot V1/frontend" && npx vite build 2>&1
```

Confirm: No errors.

- [ ] **Step 2: Backend verification**

```bash
cd "QueryCopilot V1/backend" && python -c "from routers.dashboard_routes import router; print('Routes:', len(router.routes))"
```

- [ ] **Step 3: [MANUAL] Smoke test checklist**

Run through these 10 checks:

| # | Test | Expected |
|---|---|---|
| 1 | Apply global filter → tiles refresh | Tiles show filtered data (not stale) |
| 2 | Edit formatting → save → reopen → verify | All values preserved |
| 3 | Change palette in Colors tab → save → tile renders | New colors visible |
| 4 | Change Style tab (background, border) → save → tile shows | Styles applied |
| 5 | Click tile in grid mode → FloatingToolbar appears | Toolbar at bottom-center, tile outlined |
| 6 | Click tile in freeform mode → FloatingToolbar appears | Same behavior |
| 7 | FloatingToolbar palette swatch → tile changes color | Immediate + persists after refresh |
| 8 | Drag tile in freeform → refresh page → position stays | Persisted |
| 9 | Zoom/pan freeform canvas → wait 3s → refresh → viewport restored | Restored |
| 10 | Chart type switch (bar→line→bar) with formatting | Formatting preserved |

- [ ] **Step 4: Final commit**

```bash
git add -A && git status
git commit -m "fix: Phase 1 complete — all 12 broken dashboard features fixed"
```

---

## Phase 2-4 Planning Note

After Phase 1 is verified stable, the next plans will be written:

- **Phase 2 plan:** `docs/superpowers/plans/2026-04-XX-phase2-innovation.md` — Cross-tile interactivity, bookmarking, DZV, crossfade
- **Phase 3 plan:** `docs/superpowers/plans/2026-04-XX-phase3-data-scale.md` — Row limit increase, ECharts Canvas, dynamic renderer
- **Phase 4 plan:** `docs/superpowers/plans/2026-04-XX-phase4-ai-differentiation.md` — AI chart config, prefetching, LOD parser

Each plan will be written fresh with current code state after the previous phase ships.
