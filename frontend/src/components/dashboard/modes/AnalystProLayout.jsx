// frontend/src/components/dashboard/modes/AnalystProLayout.jsx
import { useCallback, useMemo } from 'react';
import FreeformCanvas from '../freeform/FreeformCanvas';
import SizeToggleDropdown from '../freeform/SizeToggleDropdown';
import DevicePreviewToggle from '../freeform/DevicePreviewToggle';
import AnalystProSidebar from '../freeform/panels/AnalystProSidebar';
import AlignmentToolbar from '../freeform/panels/AlignmentToolbar';
import StructureToolbar from '../freeform/panels/StructureToolbar';
import LayoutOverlayToggle from '../freeform/panels/LayoutOverlayToggle';
import ActionsMenuButton from '../freeform/panels/ActionsMenuButton';
import UndoRedoToolbar from '../freeform/panels/UndoRedoToolbar';
import HistoryInspectorPanel from '../freeform/panels/HistoryInspectorPanel';
import ActionsDialog from '../freeform/panels/ActionsDialog';
import ZonePropertiesPanel from '../freeform/panels/ZonePropertiesPanel';
import AnalystProWorksheetTile from '../freeform/AnalystProWorksheetTile';
import ZoneFrame from '../freeform/ZoneFrame';
import useAnalystProAutosave from '../freeform/hooks/useAnalystProAutosave';
import ContextMenu from '../freeform/ContextMenu';
import ViewDataDrawer from '../freeform/ViewDataDrawer';
import { useActionRuntime } from '../freeform/hooks/useActionRuntime';
import { useStore } from '../../../store';
import { legacyTilesToDashboard, classifyTile } from './legacyTilesToDashboard';

/** Thin vertical divider for the top toolbar. */
const Separator = () => (
  <span
    aria-hidden="true"
    style={{ width: 1, height: 20, background: 'var(--chrome-bar-border, var(--border-default))', margin: '0 4px', flexShrink: 0 }}
  />
);

/**
 * Analyst Pro archetype — Tableau-parity freeform authoring shell.
 *
 * Plan 1 scope (read-only):
 *   - Mounts an existing dashboard as a zone tree + floating layer.
 *   - Renders via FreeformCanvas + ZoneRenderer + FloatingLayer.
 *   - SizeToggleDropdown for canvas size control.
 *
 * Plan 2 adds:
 *   - drag/resize/select handlers
 *   - ObjectLibraryPanel, LayoutTreePanel
 *   - actions / sets / DZV
 */
export default function AnalystProLayout({
  tiles = [],
  dashboardId,
  dashboardName,
  onTileClick,
  onSizeChange,
  size,
  // Plan 7 T10 — authored dashboard from the server. When present with a
  // truthy tiledRoot, we feed it straight to FreeformCanvas and skip the
  // legacy shim, so a reload restores the user's authored layout instead
  // of overwriting it with the tile-array heuristic.
  authoredLayout,
}) {
  useActionRuntime();

  // Plan 7 T9 — autosave authored Analyst Pro layout back to the backend.
  // Debounced 1500 ms; payload = { schemaVersion, archetype, size,
  // tiledRoot, floatingLayer }. Noop when dashboardId is falsy.
  useAnalystProAutosave(dashboardId);

  const snapEnabled = useStore((s) => s.analystProSnapEnabled);
  const setSnapEnabled = useStore((s) => s.setAnalystProSnapEnabled);
  const openContextMenu = useStore((s) => s.openContextMenuAnalystPro);
  const rulersVisible = useStore((s) => s.analystProRulersVisible);
  const toggleRulers = useStore((s) => s.toggleRulersAnalystPro);

  // Plan 7 T10 — prefer server-authored layout when present; else fall back
  // to the legacy tile-array shim (Plan 5e smart layout / KPI-aware bin pack).
  const dashboard = useMemo(() => {
    const base = (authoredLayout && authoredLayout.tiledRoot)
      ? authoredLayout
      : legacyTilesToDashboard(tiles, dashboardId, dashboardName, size);

    // Plan 7 T17 — row-content-aware heal.
    //
    // The old T15 heal derived row px from `row.id.startsWith('kpi-row')`,
    // which only reflects what the classifier said WHEN the tree was first
    // packed. If the classifier has since been tightened (Plan 7 T16
    // rejects `chartType:'number'` and `mark:'text'` as KPI signals), the
    // persisted authored tree still has stale `kpi-row-*` labels wrapping
    // actual chart tiles — those cells render as 174 px bands with only
    // an axis tick and a legend readout, no marks.
    //
    // Fix: classify every row by its CURRENT children (via classifyTile +
    // tile lookup) and assign px from the current classification. Only
    // rows with all-KPI contents keep the 160 px height; any row with
    // at least one chart tile gets 360 px so Vega has room to render.
    // Then renormalize h proportions to sum === 100000 and override the
    // canvas height to fit.
    if (!base?.tiledRoot) return base;
    const rows = base.tiledRoot.children ?? [];
    if (rows.length === 0) return base;

    const tileById = new Map((tiles || []).map((t) => [String(t.id), t]));
    const classifyRow = (row) => {
      const kids = row.children || [];
      const hasChart = kids.some((c) => {
        if (c.type !== 'worksheet' || !c.worksheetRef) return false;
        const tile = tileById.get(String(c.worksheetRef));
        return classifyTile(tile) === 'chart';
      });
      return hasChart ? 'chart' : 'kpi';
    };

    const KPI_ROW_PX = 160;
    const CHART_ROW_PX = 360;
    const GUTTER_PX = 32;
    const kinds = rows.map(classifyRow);
    const px = kinds.map((k) => (k === 'kpi' ? KPI_ROW_PX : CHART_ROW_PX));
    const totalPx = px.reduce((s, p) => s + p, 0);
    if (totalPx === 0) return base;

    const needsHealing =
      base.size?.mode === 'automatic' ||
      rows.some((r, i) => {
        const intended = kinds[i];
        const labelled = typeof r.id === 'string' && r.id.startsWith('kpi-row') ? 'kpi' : 'chart';
        return intended !== labelled;
      });
    if (!needsHealing) return base;

    // Rebuild rows with h proportional to intended px.
    const newH = px.map((p) => Math.floor((p / totalPx) * 100000));
    const hSum = newH.reduce((s, v) => s + v, 0);
    if (newH.length > 0) newH[newH.length - 1] += 100000 - hSum;

    const newRows = rows.map((r, i) => ({ ...r, h: newH[i] }));
    const canvasHeight = Math.max(900, totalPx + Math.max(0, rows.length - 1) * GUTTER_PX);
    return {
      ...base,
      tiledRoot: { ...base.tiledRoot, children: newRows },
      size: { mode: 'fixed', width: 1440, height: canvasHeight, preset: 'custom' },
    };
  }, [authoredLayout, tiles, dashboardId, dashboardName, size]);

  const handleQuickAction = useCallback((action, zone, event) => {
    void event;
    if (!zone) return;
    const state = useStore.getState();
    if (action === 'fit') {
      state.setZonePropertyAnalystPro?.(zone.id, { fitMode: 'fit' });
      return;
    }
    if (action === 'close') {
      const dash = state.analystProDashboard;
      if (!dash) return;
      const targetId = zone.id;
      const nextFloating = (dash.floatingLayer || []).filter((z) => z.id !== targetId);
      const removeFromTree = (z) => {
        if (!z.children) return z;
        const next = z.children.filter((c) => c.id !== targetId).map(removeFromTree);
        return { ...z, children: next };
      };
      const nextRoot = dash.tiledRoot ? removeFromTree(dash.tiledRoot) : dash.tiledRoot;
      const nextDash = { ...dash, floatingLayer: nextFloating, tiledRoot: nextRoot };
      state.setAnalystProDashboard(nextDash);
      state.pushAnalystProHistory(nextDash, 'Close zone');
      state.setAnalystProSelection([]);
    }
  }, []);

  const handleZoneContextMenu = useCallback((event, zone) => {
    // Plan 5c: open the portal-rendered context menu at the cursor.
    if (!zone) return;
    openContextMenu(event.clientX, event.clientY, zone.id);
  }, [openContextMenu]);

  // Pre-index tiles by id for O(1) lookup per leaf instead of O(n) find().
  const tilesById = useMemo(() => {
    const m = new Map();
    for (const t of tiles) m.set(String(t.id), t);
    return m;
  }, [tiles]);

  const renderLeaf = useMemo(() => {
    return (zone, resolved) => {
      let content = null;
      if (zone.type === 'worksheet' && zone.worksheetRef) {
        const tile = tilesById.get(zone.worksheetRef);
        if (tile) {
          content = (
            <AnalystProWorksheetTile
              tile={tile}
              sheetId={zone.worksheetRef}
              onTileClick={onTileClick}
              fitMode={zone.fitMode}
            />
          );
        }
      } else if (zone.type === 'blank') {
        content = <div data-testid={`blank-${zone.id}`} style={{ width: '100%', height: '100%' }} />;
      }

      return (
        <ZoneFrame
          zone={zone}
          resolved={resolved}
          onQuickAction={handleQuickAction}
          onContextMenu={handleZoneContextMenu}
        >
          {content}
        </ZoneFrame>
      );
    };
  }, [tilesById, onTileClick, handleQuickAction, handleZoneContextMenu]);

  return (
    <div
      data-testid="layout-analyst-pro"
      data-preset="analyst-pro"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        minHeight: 0,
        background: 'var(--bg-page)',
      }}
    >
      {/* Top toolbar */}
      <div
        data-testid="analyst-pro-toolbar"
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '8px 14px',
          borderBottom: '1px solid var(--chrome-bar-border, var(--border-default))',
          gap: 8,
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          data-testid="snap-toggle"
          onClick={() => setSnapEnabled(!snapEnabled)}
          className="premium-btn"
          style={{
            padding: '6px 12px',
            background: snapEnabled ? 'var(--accent)' : 'var(--bg-elevated)',
            color: snapEnabled ? '#fff' : 'var(--text-primary)',
            border: '1px solid var(--border-default)',
            borderRadius: 8,
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: "'JetBrains Mono', monospace",
          }}
          aria-label={`Snap to 8px grid and edges (currently ${snapEnabled ? 'on' : 'off'})`}
          aria-pressed={snapEnabled}
          title={`Snap ${snapEnabled ? 'on' : 'off'} (8px grid + edges)`}
        >
          SNAP {snapEnabled ? 'ON' : 'OFF'}
        </button>
        <SizeToggleDropdown currentSize={size} onChange={onSizeChange} />
        <button
          type="button"
          data-testid="rulers-toggle"
          onClick={toggleRulers}
          className="premium-btn"
          style={{
            padding: '6px 12px',
            background: rulersVisible ? 'var(--accent)' : 'var(--bg-elevated)',
            color: rulersVisible ? '#fff' : 'var(--text-primary)',
            border: '1px solid var(--border-default)',
            borderRadius: 8,
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: "'JetBrains Mono', monospace",
          }}
          aria-label={`Toggle rulers (currently ${rulersVisible ? 'on' : 'off'})`}
          aria-pressed={rulersVisible}
          title="Rulers"
        >
          RULERS {rulersVisible ? 'ON' : 'OFF'}
        </button>
        <DevicePreviewToggle />
        <Separator />
        <AlignmentToolbar />
        <Separator />
        <StructureToolbar />
        <Separator />
        <LayoutOverlayToggle />
        <Separator />
        <UndoRedoToolbar />
        <Separator />
        <ActionsMenuButton />
      </div>

      {/* Body row: left rail + canvas */}
      <div style={{ display: 'flex', flex: '1 1 auto', minHeight: 0 }}>
        {/* Left rail */}
        <div
          data-testid="analyst-pro-left-rail"
          style={{
            width: 240,
            display: 'flex',
            flexDirection: 'column',
            borderRight: '1px solid var(--chrome-bar-border, var(--border-default))',
            overflow: 'hidden',
          }}
        >
          <AnalystProSidebar />
        </div>

        {/* Main canvas */}
        <div style={{ flex: '1 1 auto', minWidth: 0, overflow: 'auto', position: 'relative' }}>
          <FreeformCanvas dashboard={dashboard} renderLeaf={renderLeaf} />
        </div>

        {/* Right rail */}
        <div
          data-testid="analyst-pro-right-rail"
          style={{
            width: 240,
            display: 'flex',
            flexDirection: 'column',
            borderLeft: '1px solid var(--chrome-bar-border, var(--border-default))',
            overflow: 'auto',
          }}
        >
          <HistoryInspectorPanel />
          <ZonePropertiesPanel />
        </div>
      </div>

      {/* Actions modal overlay */}
      <ActionsDialog />

      {/* Plan 5c: portal-rendered right-click context menu. */}
      <ContextMenu />

      {/* Plan 6e T10: View Data drawer (480px right-side, Summary/Underlying tabs). */}
      <ViewDataDrawer />
    </div>
  );
}

// Plan 5e — smart layout heuristic lives in modes/legacyTilesToDashboard.js
// so the component file only exports the React component (satisfies
// react-refresh/only-export-components). Tests import directly from the
// lib file.
