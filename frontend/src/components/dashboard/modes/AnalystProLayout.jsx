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
import { legacyTilesToDashboard } from './legacyTilesToDashboard';

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
    // Plan 7 T15 — heal `{mode:'automatic'}` when the tree has enough rows
    // that viewport-fill would squish each row below ~160 px (chart cells
    // then render as a single axis tick with no marks). Switch to a fixed
    // canvas tall enough for the tree: KPI rows 160 px, chart rows 360 px.
    // Users can still opt back into automatic via the SizeToggleDropdown.
    if (!base?.tiledRoot || base.size?.mode !== 'automatic') return base;
    const rows = base.tiledRoot.children ?? [];
    if (rows.length <= 4) return base; // small dashboards fit viewport fine
    const KPI_ROW_PX = 160;
    const CHART_ROW_PX = 360;
    const GUTTER_PX = 32;
    let total = 0;
    for (const row of rows) {
      const isKpiRow = typeof row.id === 'string' && row.id.startsWith('kpi-row');
      total += isKpiRow ? KPI_ROW_PX : CHART_ROW_PX;
    }
    total += Math.max(0, rows.length - 1) * GUTTER_PX;
    return {
      ...base,
      size: { mode: 'fixed', width: 1440, height: Math.max(900, total), preset: 'custom' },
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

  const renderLeaf = useMemo(() => {
    return (zone, resolved) => {
      let content = null;
      if (zone.type === 'worksheet' && zone.worksheetRef) {
        const tile = tiles.find((t) => String(t.id) === zone.worksheetRef);
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
  }, [tiles, onTileClick, handleQuickAction, handleZoneContextMenu]);

  return (
    <div
      data-testid="layout-analyst-pro"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        minHeight: 0,
        background: 'var(--archetype-analyst-pro-bg)',
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
