// frontend/src/components/dashboard/freeform/FreeformCanvas.jsx
import { useMemo, useRef, useState, useEffect } from 'react';
import { resolveLayout } from './lib/layoutResolver';
import ZoneRenderer from './ZoneRenderer';
import FloatingLayer from './FloatingLayer';
import SelectionOverlay from './SelectionOverlay';
import { useSelection } from './hooks/useSelection';
import { useDragResize } from './hooks/useDragResize';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useStore } from '../../../store';
import { FIXED_PRESETS } from './lib/types';

/**
 * FreeformCanvas — the root authoring surface for Analyst Pro.
 *
 * Responsibilities in Plan 1 (read-only):
 *   1. Resolve canvas dimensions from `dashboard.size` + container bounds.
 *   2. Run the zone tree + floating layer through `resolveLayout`.
 *   3. Pass resolved coords to ZoneRenderer + FloatingLayer.
 *   4. Re-resolve on viewport resize (Automatic / Range modes).
 *
 * Plan 2 extends this with drag/resize/select handlers, SelectionOverlay,
 * and keyboard shortcut installation.
 */
export default function FreeformCanvas({ dashboard, renderLeaf }) {
  const containerRef = useRef(null);
  const [viewportSize, setViewportSize] = useState({ width: 1200, height: 800 });

  // Measure container on mount + on resize
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setViewportSize({
          width: Math.floor(entry.contentRect.width),
          height: Math.floor(entry.contentRect.height),
        });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const canvasSize = useMemo(() => {
    return resolveCanvasSize(dashboard.size, viewportSize);
  }, [dashboard.size, viewportSize]);

  const resolved = useMemo(() => {
    return resolveLayout(
      dashboard.tiledRoot,
      dashboard.floatingLayer || [],
      canvasSize.width,
      canvasSize.height,
    );
  }, [dashboard.tiledRoot, dashboard.floatingLayer, canvasSize.width, canvasSize.height]);

  const resolvedMap = useMemo(() => {
    const m = new Map();
    for (const r of resolved) m.set(r.zone.id, r);
    return m;
  }, [resolved]);

  const { selection, toggleSelection, clearSelection, select } = useSelection();
  const initHistory = useStore((s) => s.initAnalystProHistory);
  const setDashboardInStore = useStore((s) => s.setAnalystProDashboard);

  // Install history on dashboard mount
  useEffect(() => {
    if (dashboard) {
      initHistory(dashboard);
      setDashboardInStore(dashboard);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dashboard.id stable across renders
  }, [dashboard?.id, initHistory, setDashboardInStore]);

  useKeyboardShortcuts({ canvasRef: containerRef });

  const { onZonePointerDown } = useDragResize({
    canvasRef: containerRef,
    resolvedMap,
    siblingsFloating: resolved.filter((r) => r.depth === -1),
  });

  const selectedResolved = resolved.filter((r) => selection.has(r.zone.id));

  const handleZoneClick = (zoneId, event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey) {
      toggleSelection(zoneId);
    } else {
      select(zoneId);
    }
  };

  return (
    <div
      ref={containerRef}
      data-testid="freeform-canvas"
      data-archetype="analyst-pro"
      data-size-mode={dashboard.size?.mode ?? 'automatic'}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'auto',
        background: 'var(--archetype-analyst-pro-bg, var(--bg-page))',
      }}
    >
      <div
        data-testid="freeform-sheet"
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) clearSelection();
        }}
        style={{
          position: 'relative',
          width: canvasSize.width,
          height: canvasSize.height,
          margin: dashboard.size?.mode === 'automatic' ? 0 : '0 auto',
        }}
      >
        <ZoneRenderer
          root={dashboard.tiledRoot}
          resolvedMap={resolvedMap}
          renderLeaf={(zone, resolvedZone) => (
            <div
              onPointerDown={(e) => {
                e.stopPropagation();
                handleZoneClick(zone.id, e);
                onZonePointerDown(zone.id, e, resolvedZone, 'move');
              }}
              style={{ width: '100%', height: '100%' }}
            >
              {renderLeaf(zone, resolvedZone)}
            </div>
          )}
        />
        <FloatingLayer
          zones={dashboard.floatingLayer || []}
          renderLeaf={(zone) => (
            <div
              onPointerDown={(e) => {
                e.stopPropagation();
                const resolvedZone = resolvedMap.get(zone.id);
                handleZoneClick(zone.id, e);
                onZonePointerDown(zone.id, e, resolvedZone, 'move');
              }}
              style={{ width: '100%', height: '100%' }}
            >
              {renderLeaf(zone)}
            </div>
          )}
        />
        <SelectionOverlay
          selectedResolved={selectedResolved}
          onResizeHandlePointerDown={(zoneId, handle, e) => {
            const resolvedZone = resolvedMap.get(zoneId);
            if (!selection.has(zoneId)) select(zoneId);
            onZonePointerDown(zoneId, e, resolvedZone, 'resize', handle);
          }}
          onSelectionPointerDown={(zoneId, e) => {
            const resolvedZone = resolvedMap.get(zoneId);
            handleZoneClick(zoneId, e);
            onZonePointerDown(zoneId, e, resolvedZone, 'move');
          }}
        />
      </div>
    </div>
  );
}

function resolveCanvasSize(size, viewport) {
  if (!size || size.mode === 'automatic') {
    return { width: viewport.width || 1200, height: viewport.height || 800 };
  }
  if (size.mode === 'fixed') {
    if (size.preset && size.preset !== 'custom') {
      const preset = FIXED_PRESETS[size.preset];
      return { width: preset?.width ?? 1200, height: preset?.height ?? 800 };
    }
    return { width: size.width ?? 1200, height: size.height ?? 800 };
  }
  if (size.mode === 'range') {
    const w = Math.min(Math.max(viewport.width, size.minWidth), size.maxWidth);
    const h = Math.min(Math.max(viewport.height, size.minHeight), size.maxHeight);
    return { width: w, height: h };
  }
  return { width: 1200, height: 800 };
}
