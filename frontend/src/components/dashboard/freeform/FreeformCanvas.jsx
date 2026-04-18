// frontend/src/components/dashboard/freeform/FreeformCanvas.jsx
import { useMemo, useRef, useState, useEffect } from 'react';
import { resolveLayout } from './lib/layoutResolver';
import ZoneRenderer from './ZoneRenderer';
import FloatingLayer from './FloatingLayer';
import SelectionOverlay from './SelectionOverlay';
import MarqueeOverlay from './MarqueeOverlay';
import DropIndicatorOverlay from './DropIndicatorOverlay';
import CanvasZoomControls from './CanvasZoomControls';
import CanvasRulers from './CanvasRulers';
import { screenToSheet, zoomAtAnchor } from './lib/canvasTransform';
import { applyDeviceOverrides, resolveDeviceCanvasSize } from './lib/deviceLayout';
import { useSelection } from './hooks/useSelection';
import { useDragResize } from './hooks/useDragResize';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useStore } from '../../../store';
import { FIXED_PRESETS } from './lib/types';
import { shouldBypassZoneDrag } from './lib/zoneDragBypass';

/**
 * FreeformCanvas — Analyst Pro root authoring surface.
 * Plan 6a adds a CSS transform (translate + scale) on `.freeform-sheet` plus
 * transform-aware pointer math (screenToSheet). Device-preview swaps canvas
 * size + overlays zone overrides without rebuilding the zone tree.
 */
export default function FreeformCanvas({ dashboard: dashboardProp, renderLeaf }) {
  const containerRef = useRef(null);
  const [viewportSize, setViewportSize] = useState({ width: 1200, height: 800 });
  // Render from store once seeded so mutations (delete, resize, add) reach the canvas.
  // Prop is only the bootstrap source — effect below seeds store on id change.
  const storeDashboard = useStore((s) => s.analystProDashboard);
  const dashboard = (storeDashboard && storeDashboard.id === dashboardProp?.id)
    ? storeDashboard
    : dashboardProp;

  const roRafRef = useRef(0);
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver((entries) => {
      if (roRafRef.current) cancelAnimationFrame(roRafRef.current);
      roRafRef.current = requestAnimationFrame(() => {
        for (const entry of entries) {
          setViewportSize({
            width: Math.floor(entry.contentRect.width),
            height: Math.floor(entry.contentRect.height),
          });
        }
      });
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      if (roRafRef.current) cancelAnimationFrame(roRafRef.current);
    };
  }, []);

  const activeDevice = useStore((s) => s.analystProActiveDevice);
  const canvasZoom = useStore((s) => s.analystProCanvasZoom);
  const canvasPan = useStore((s) => s.analystProCanvasPan);
  const setCanvasZoom = useStore((s) => s.setCanvasZoomAnalystPro);
  const setCanvasPan = useStore((s) => s.setCanvasPanAnalystPro);
  const rulersVisible = useStore((s) => s.analystProRulersVisible);

  const effectiveDashboard = useMemo(
    () => applyDeviceOverrides(dashboard, activeDevice),
    [dashboard, activeDevice],
  );
  const effectiveSize = useMemo(
    () => resolveDeviceCanvasSize(effectiveDashboard.size, activeDevice),
    [effectiveDashboard.size, activeDevice],
  );
  const canvasSize = useMemo(
    () => resolveCanvasSize(effectiveSize, viewportSize),
    [effectiveSize, viewportSize],
  );

  const resolved = useMemo(() => {
    return resolveLayout(
      effectiveDashboard.tiledRoot,
      effectiveDashboard.floatingLayer || [],
      canvasSize.width,
      canvasSize.height,
    );
  }, [effectiveDashboard.tiledRoot, effectiveDashboard.floatingLayer, canvasSize.width, canvasSize.height]);

  const resolvedMap = useMemo(() => {
    const m = new Map();
    for (const r of resolved) m.set(r.zone.id, r);
    return m;
  }, [resolved]);

  const { selection, toggleSelection, clearSelection, select } = useSelection();
  const overlayEnabled = useStore((s) => s.analystProLayoutOverlay);
  const initHistory = useStore((s) => s.initAnalystProHistory);
  const setDashboardInStore = useStore((s) => s.setAnalystProDashboard);
  const marquee = useStore((s) => s.analystProMarquee);
  const setMarquee = useStore((s) => s.setAnalystProMarquee);
  const insertObjectAnalystPro = useStore((s) => s.insertObjectAnalystPro);
  const openContextMenuAnalystPro = useStore((s) => s.openContextMenuAnalystPro);
  const marqueeStartRef = useRef(null);
  const sheetRef = useRef(null);
  const spaceHeldRef = useRef(false);

  // Plan 7 T11 — reseed the store when the server-authored tree identity
  // changes, even when the dashboard id is unchanged. Covers the case of
  // the parent re-hydrating from a fresh GET (authored layout) mid-session.
  // Guards against wipe-cycles: the last-seeded serialized tree is cached
  // in a ref, so an identical prop object produces no store write.
  const lastSeededSerializedRef = useRef(null);
  const lastSeededIdRef = useRef(null);
  useEffect(() => {
    if (!dashboardProp) return;
    const serialized = JSON.stringify({
      tr: dashboardProp.tiledRoot ?? null,
      fl: dashboardProp.floatingLayer ?? null,
      sz: dashboardProp.size ?? null,
    });
    const idChanged = lastSeededIdRef.current !== dashboardProp.id;
    const treeChanged = lastSeededSerializedRef.current !== serialized;
    if (idChanged || treeChanged) {
      initHistory(dashboardProp);
      setDashboardInStore(dashboardProp);
      lastSeededIdRef.current = dashboardProp.id;
      lastSeededSerializedRef.current = serialized;
    }
  }, [dashboardProp, initHistory, setDashboardInStore]);

  // Plan 6a — Space-hold tracking for pan gesture
  useEffect(() => {
    const dn = (e) => { if (e.code === 'Space') spaceHeldRef.current = true; };
    const up = (e) => { if (e.code === 'Space') spaceHeldRef.current = false; };
    window.addEventListener('keydown', dn);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', dn);
      window.removeEventListener('keyup', up);
    };
  }, []);

  useKeyboardShortcuts({ canvasRef: containerRef });

  const siblingsFloating = useMemo(
    () => resolved.filter((r) => r.depth === -1),
    [resolved],
  );

  const { onZonePointerDown } = useDragResize({
    canvasRef: containerRef,
    resolvedMap,
    siblingsFloating,
    resolvedList: resolved,
    // Plan 7 T4 + T5 — canvas pixel dims are resolved via canvasSize above
    // (accounts for fixed-vs-automatic size modes and device overrides).
    canvasSize,
  });

  const selectedResolved = useMemo(
    () => resolved.filter((r) => selection.has(r.zone.id)),
    [resolved, selection],
  );

  const handleZoneClick = (zoneId, event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey) {
      toggleSelection(zoneId);
    } else {
      select(zoneId);
    }
  };

  // Plan 6a — Ctrl+wheel zoom anchored at cursor.
  const handleSheetWheel = (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const zoomOld = useStore.getState().analystProCanvasZoom;
    const panOld = useStore.getState().analystProCanvasPan;
    const zoomNew = zoomOld * Math.exp(-e.deltaY * 0.0015);
    const { zoom, pan } = zoomAtAnchor(
      zoomOld,
      panOld,
      zoomNew,
      { clientX: e.clientX, clientY: e.clientY },
      rect,
    );
    setCanvasZoom(zoom);
    setCanvasPan(pan.x, pan.y);
  };

  const handleSheetPointerDown = (e) => {
    // Plan 6a — pan gesture (Space-hold OR middle-click).
    const isPan = spaceHeldRef.current || e.button === 1;
    if (isPan) {
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const startPan = useStore.getState().analystProCanvasPan;
      const onPanMove = (ev) => {
        setCanvasPan(startPan.x + (ev.clientX - startX), startPan.y + (ev.clientY - startY));
      };
      const onPanUp = () => {
        window.removeEventListener('pointermove', onPanMove);
        window.removeEventListener('pointerup', onPanUp);
      };
      window.addEventListener('pointermove', onPanMove);
      window.addEventListener('pointerup', onPanUp);
      return;
    }

    if (e.target !== e.currentTarget) return;
    clearSelection();
    const rect = e.currentTarget.getBoundingClientRect();
    const zoom = useStore.getState().analystProCanvasZoom;
    const pan = useStore.getState().analystProCanvasPan;
    const origin = screenToSheet({ clientX: e.clientX, clientY: e.clientY }, rect, zoom, pan);
    marqueeStartRef.current = { x: origin.x, y: origin.y };
    setMarquee({ x: origin.x, y: origin.y, width: 0, height: 0 });

    const onMove = (ev) => {
      if (!marqueeStartRef.current) return;
      const p = screenToSheet({ clientX: ev.clientX, clientY: ev.clientY }, rect, zoom, pan);
      setMarquee({
        x: marqueeStartRef.current.x,
        y: marqueeStartRef.current.y,
        width: p.x - marqueeStartRef.current.x,
        height: p.y - marqueeStartRef.current.y,
      });
    };
    const onUp = () => {
      if (!marqueeStartRef.current) return;
      const current = useStore.getState().analystProMarquee;
      if (current && (Math.abs(current.width) > 4 || Math.abs(current.height) > 4)) {
        const left = Math.min(current.x, current.x + current.width);
        const right = Math.max(current.x, current.x + current.width);
        const top = Math.min(current.y, current.y + current.height);
        const bottom = Math.max(current.y, current.y + current.height);
        const hits = resolved.filter((r) => {
          const rLeft = r.x, rTop = r.y, rRight = r.x + r.width, rBottom = r.y + r.height;
          return rLeft < right && rRight > left && rTop < bottom && rBottom > top;
        }).map((r) => r.zone.id);
        useStore.getState().setAnalystProSelection(hits);
      }
      setMarquee(null);
      marqueeStartRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const handleSheetContextMenu = (e) => {
    if (e.target !== e.currentTarget) return;
    e.preventDefault();
    openContextMenuAnalystPro(e.clientX, e.clientY, null);
  };

  const handleDragOver = (e) => {
    if (!e.dataTransfer) return;
    const types = Array.from(e.dataTransfer.types || []);
    if (
      types.includes('application/askdb-analyst-pro-object+json') ||
      types.includes('application/askdb-analyst-pro-sheet+json')
    ) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  };

  const handleDrop = (e) => {
    if (!e.dataTransfer) return;
    const sheet = sheetRef.current;
    if (!sheet) return;
    const rect = sheet.getBoundingClientRect();
    const zoom = useStore.getState().analystProCanvasZoom;
    const pan = useStore.getState().analystProCanvasPan;
    const pt = screenToSheet({ clientX: e.clientX, clientY: e.clientY }, rect, zoom, pan);
    const x = Math.max(0, Math.round(pt.x));
    const y = Math.max(0, Math.round(pt.y));

    // Plan 6c — Sheet drop: insert a worksheet-type zone.
    const sheetRaw = e.dataTransfer.getData('application/askdb-analyst-pro-sheet+json');
    if (sheetRaw) {
      let sheetPayload;
      try {
        sheetPayload = JSON.parse(sheetRaw);
      } catch {
        return;
      }
      if (!sheetPayload || typeof sheetPayload.sheetId !== 'string') return;
      e.preventDefault();
      insertObjectAnalystPro({ type: 'worksheet', worksheetRef: sheetPayload.sheetId, x, y });
      return;
    }

    // Plan 2b — Object library drop.
    const raw = e.dataTransfer.getData('application/askdb-analyst-pro-object+json');
    if (!raw) return;
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }
    if (!payload || typeof payload.type !== 'string') return;
    e.preventDefault();
    insertObjectAnalystPro({ type: payload.type, x, y });
  };

  return (
    <div
      ref={containerRef}
      data-testid="freeform-canvas"
      data-archetype="analyst-pro"
      data-size-mode={effectiveDashboard.size?.mode ?? 'automatic'}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'auto',
        background: 'var(--bg-page)',
      }}
    >
      {rulersVisible && (
        <CanvasRulers
          canvasWidth={canvasSize.width}
          canvasHeight={canvasSize.height}
          zoom={canvasZoom}
          pan={canvasPan}
        />
      )}
      <CanvasZoomControls />
      <div
        ref={sheetRef}
        data-testid="freeform-sheet"
        className={`freeform-sheet${overlayEnabled ? ' analyst-pro-layout-overlay' : ''}`}
        onPointerDown={handleSheetPointerDown}
        onContextMenu={handleSheetContextMenu}
        onWheel={handleSheetWheel}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        style={{
          position: 'relative',
          width: canvasSize.width,
          height: canvasSize.height,
          margin: effectiveDashboard.size?.mode === 'automatic' ? 0 : '0 auto',
          transform: `translate(${canvasPan.x}px, ${canvasPan.y}px) scale(${canvasZoom})`,
          transformOrigin: '0 0',
          cursor: spaceHeldRef.current ? 'grab' : undefined,
        }}
      >
        <ZoneRenderer
          root={effectiveDashboard.tiledRoot}
          resolvedMap={resolvedMap}
          renderLeaf={(zone, resolvedZone) => (
            <div
              onPointerDown={(e) => {
                if (shouldBypassZoneDrag(e)) return;
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
          zones={effectiveDashboard.floatingLayer || []}
          renderLeaf={(zone) => (
            <div
              onPointerDown={(e) => {
                if (shouldBypassZoneDrag(e)) return;
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
        <MarqueeOverlay rect={marquee} />
        <DropIndicatorOverlay resolvedList={resolved} />
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
      return { width: preset?.width ?? size.width ?? 1200, height: preset?.height ?? size.height ?? 800 };
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
