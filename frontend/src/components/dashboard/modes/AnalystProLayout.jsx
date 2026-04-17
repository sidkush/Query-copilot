// frontend/src/components/dashboard/modes/AnalystProLayout.jsx
import { useCallback, useMemo } from 'react';
import FreeformCanvas from '../freeform/FreeformCanvas';
import SizeToggleDropdown from '../freeform/SizeToggleDropdown';
import DevicePreviewToggle from '../freeform/DevicePreviewToggle';
import ObjectLibraryPanel from '../freeform/panels/ObjectLibraryPanel';
import LayoutTreePanel from '../freeform/panels/LayoutTreePanel';
import AlignmentToolbar from '../freeform/panels/AlignmentToolbar';
import StructureToolbar from '../freeform/panels/StructureToolbar';
import LayoutOverlayToggle from '../freeform/panels/LayoutOverlayToggle';
import ActionsMenuButton from '../freeform/panels/ActionsMenuButton';
import UndoRedoToolbar from '../freeform/panels/UndoRedoToolbar';
import HistoryInspectorPanel from '../freeform/panels/HistoryInspectorPanel';
import ActionsDialog from '../freeform/panels/ActionsDialog';
import SetsPanel from '../freeform/panels/SetsPanel';
import ParametersPanel from '../freeform/panels/ParametersPanel';
import ZonePropertiesPanel from '../freeform/panels/ZonePropertiesPanel';
import AnalystProWorksheetTile from '../freeform/AnalystProWorksheetTile';
import ZoneFrame from '../freeform/ZoneFrame';
import ContextMenu from '../freeform/ContextMenu';
import { useActionRuntime } from '../freeform/hooks/useActionRuntime';
import { useStore } from '../../../store';

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
    // Plan 5a: quick-action dispatch stub. Plan 5c replaces this with a real
    // context-menu mount; Plan 5d wires 'fit' and 'close' to zone ops.
    void event;
    if (import.meta.env.DEV) {
      console.debug('[AnalystPro] quick-action', action, zone?.id);
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
          <ObjectLibraryPanel />
          <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
            <LayoutTreePanel />
          </div>
          <SetsPanel />
          <ParametersPanel />
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

/**
 * Legacy shim: flat tile array → zone tree.
 * Used in Plan 1 while the backend migration lands; Plan 2 removes this.
 */
function legacyTilesToDashboard(tiles, dashboardId, dashboardName, size) {
  const children = tiles.map((t, i) => ({
    id: String(t.id ?? `t${i}`),
    type: 'worksheet',
    w: 100000, // each row-of-one fills full width; vertical stack
    h: Math.floor(100000 / Math.max(tiles.length, 1)),
    worksheetRef: String(t.id ?? `t${i}`),
  }));
  const tiledRoot = {
    id: 'root',
    type: 'container-vert',
    w: 100000,
    h: 100000,
    children,
  };
  return {
    schemaVersion: 'askdb/dashboard/v1',
    id: dashboardId || 'unknown',
    name: dashboardName || 'Untitled',
    archetype: 'analyst-pro',
    size: size ?? { mode: 'automatic' },
    tiledRoot,
    floatingLayer: [],
    worksheets: tiles.map((t) => ({ id: String(t.id), chartSpec: t.chart_spec ?? t.chartSpec })),
    parameters: [],
    sets: [],
    actions: [],
  };
}
