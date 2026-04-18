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
import ContextMenu from '../freeform/ContextMenu';
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
}) {
  useActionRuntime();

  const snapEnabled = useStore((s) => s.analystProSnapEnabled);
  const setSnapEnabled = useStore((s) => s.setAnalystProSnapEnabled);
  const openContextMenu = useStore((s) => s.openContextMenuAnalystPro);
  const rulersVisible = useStore((s) => s.analystProRulersVisible);
  const toggleRulers = useStore((s) => s.toggleRulersAnalystPro);

  // Build dashboard object from legacy tile array (Plan 1 read-only path).
  // Plan 2 will receive a full `dashboard` prop instead.
  const dashboard = useMemo(() => legacyTilesToDashboard(tiles, dashboardId, dashboardName, size), [
    tiles,
    dashboardId,
    dashboardName,
    size,
  ]);

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
    </div>
  );
}

// Plan 5e — smart layout heuristic lives in modes/legacyTilesToDashboard.js
// so the component file only exports the React component (satisfies
// react-refresh/only-export-components). Tests import directly from the
// lib file.
