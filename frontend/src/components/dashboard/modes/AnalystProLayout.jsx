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
 * Plan 5e — smart layout heuristic:
 *   - n ≤ 4  → single container-vert (byte-identical to pre-5e).
 *   - 5..9   → container-horz with 2 container-vert children (round-robin).
 *   - n ≥ 10 → container-horz with 3 container-vert children (round-robin).
 * Default canvas: fixed 1440 × max(900, ceil(n / N) * 320) when size is undefined;
 * caller-supplied size is preserved verbatim.
 */
export function legacyTilesToDashboard(tiles, dashboardId, dashboardName, size) {
  const n = tiles.length;
  const columns = n >= 10 ? 3 : n >= 5 ? 2 : 1;

  const toWorksheetChild = (t, i, axisH) => ({
    id: String(t.id ?? `t${i}`),
    type: 'worksheet',
    w: 100000,
    h: axisH,
    worksheetRef: String(t.id ?? `t${i}`),
  });

  let tiledRoot;
  if (columns === 1) {
    const childH = Math.floor(100000 / Math.max(n, 1));
    const children = tiles.map((t, i) => toWorksheetChild(t, i, childH));
    tiledRoot = { id: 'root', type: 'container-vert', w: 100000, h: 100000, children };
  } else {
    const buckets = Array.from({ length: columns }, () => []);
    tiles.forEach((t, i) => { buckets[i % columns].push(t); });
    const colW = Math.floor(100000 / columns);
    const verts = buckets.map((bucket, colIdx) => {
      const perColH = Math.floor(100000 / Math.max(bucket.length, 1));
      return {
        id: `col${colIdx}`,
        type: 'container-vert',
        w: colW,
        h: 100000,
        children: bucket.map((t, i) => toWorksheetChild(t, i, perColH)),
      };
    });
    const wSum = verts.reduce((s, v) => s + v.w, 0);
    const drift = 100000 - wSum;
    if (drift !== 0 && verts.length > 0) {
      verts[verts.length - 1] = { ...verts[verts.length - 1], w: verts[verts.length - 1].w + drift };
    }
    tiledRoot = { id: 'root', type: 'container-horz', w: 100000, h: 100000, children: verts };
  }

  const defaultSize = {
    mode: 'fixed',
    width: 1440,
    height: Math.max(900, Math.ceil(n / columns) * 320),
    preset: 'custom',
  };

  return {
    schemaVersion: 'askdb/dashboard/v1',
    id: dashboardId || 'unknown',
    name: dashboardName || 'Untitled',
    archetype: 'analyst-pro',
    size: size ?? defaultSize,
    tiledRoot,
    floatingLayer: [],
    worksheets: tiles.map((t) => ({ id: String(t.id), chartSpec: t.chart_spec ?? t.chartSpec })),
    parameters: [],
    sets: [],
    actions: [],
  };
}
