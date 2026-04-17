// frontend/src/components/dashboard/freeform/hooks/useDragResize.js
import { useCallback, useRef } from 'react';
import { useStore } from '../../../../store';
import { resizeZone } from '../lib/zoneTreeOps';
import { snapToGrid, snapToEdges } from '../lib/snapMath';

const GRID_SIZE = 8;
const SNAP_THRESHOLD = 6;

/**
 * useDragResize — pointer event handlers for Analyst Pro canvas.
 *
 * Returns:
 *   - onZonePointerDown(zoneId, event, resolvedZone, mode: 'move' | 'resize', handle?)
 *
 * Implementation:
 *   - Pointer down captures the pointer on the canvas element.
 *   - Pointermove updates dashboard state live (every rAF).
 *   - Pointerup releases capture, pushes history snapshot, clears dragState.
 *
 * Floating zones: mutate `dashboard.floatingLayer[idx].{x,y}` (move) or {pxW,pxH} (resize).
 * Tiled zones: wired in Tasks 10/11 (resize via resizeZone, reorder via moveZone).
 */
export function useDragResize({ canvasRef, resolvedMap, siblingsFloating }) {
  const rafRef = useRef(0);
  const startRef = useRef(null);

  const snapEnabled = useStore((s) => s.analystProSnapEnabled);
  const dashboard = useStore((s) => s.analystProDashboard);
  const setDashboard = useStore((s) => s.setAnalystProDashboard);
  const pushHistory = useStore((s) => s.pushAnalystProHistory);

  const onZonePointerDown = useCallback((zoneId, event, resolvedZone, mode = 'move', handle = null) => {
    const canvas = canvasRef.current;
    if (!canvas || !dashboard) return;
    event.preventDefault();
    canvas.setPointerCapture?.(event.pointerId);

    const isFloating = (dashboard.floatingLayer || []).some((f) => f.id === zoneId);
    startRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      zoneId,
      mode,
      handle,
      isFloating,
      initialZone: isFloating ? { ...dashboard.floatingLayer.find((f) => f.id === zoneId) } : resolvedZone,
      dashboardAtStart: dashboard,
    };

    const onMove = (ev) => {
      if (!startRef.current) return;
      const dx = ev.clientX - startRef.current.startX;
      const dy = ev.clientY - startRef.current.startY;

      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        applyDragDelta(startRef.current, dx, dy, snapEnabled, siblingsFloating, dashboard, setDashboard);
      });
    };

    const onUp = () => {
      if (!startRef.current) return;
      canvas.releasePointerCapture?.(startRef.current.pointerId);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      // push history snapshot
      const finalDash = useStore.getState().analystProDashboard;
      if (finalDash && startRef.current.dashboardAtStart !== finalDash) {
        pushHistory(finalDash);
      }
      startRef.current = null;
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [canvasRef, resolvedMap, dashboard, snapEnabled, setDashboard, pushHistory, siblingsFloating]);

  return { onZonePointerDown };
}

function applyDragDelta(start, dx, dy, snapEnabled, siblings, dashboard, setDashboard) {
  if (!dashboard) return;
  if (start.isFloating) {
    const floating = dashboard.floatingLayer.map((f) => {
      if (f.id !== start.zoneId) return f;
      if (start.mode === 'move') {
        let nx = start.initialZone.x + dx;
        let ny = start.initialZone.y + dy;
        if (snapEnabled) {
          nx = snapToGrid(nx, GRID_SIZE);
          ny = snapToGrid(ny, GRID_SIZE);
          const rect = { x: nx, y: ny, width: f.pxW, height: f.pxH };
          const snapped = snapToEdges(
            rect,
            siblings.filter((s) => s.zone.id !== f.id).map((s) => ({ x: s.x, y: s.y, width: s.width, height: s.height })),
            SNAP_THRESHOLD,
          );
          nx = snapped.x;
          ny = snapped.y;
        }
        return { ...f, x: nx, y: ny };
      }
      if (start.mode === 'resize') {
        return applyResizeToFloating(f, start, dx, dy, snapEnabled);
      }
      return f;
    });
    setDashboard({ ...dashboard, floatingLayer: floating });
  }

  // Tiled resize: mutate tiledRoot via resizeZone op.
  if (!start.isFloating && start.mode === 'resize' && dashboard.tiledRoot) {
    const initial = start.initialZone;
    // initial.width / height are pixels from ResolvedZone. We derive an
    // axis-aware pixel delta from the handle then translate that into a
    // proportional delta relative to the zone's original proportional size.
    const zoneId = start.zoneId;
    const axisDx = start.handle?.includes('e') ? dx : start.handle?.includes('w') ? -dx : 0;
    const axisDy = start.handle?.includes('s') ? dy : start.handle?.includes('n') ? -dy : 0;
    const initialPxW = initial.width || 1;
    const initialPxH = initial.height || 1;
    // Look up current proportional w/h from the unchanged dashboardAtStart tree.
    const initialZoneInTree = findById(start.dashboardAtStart.tiledRoot, zoneId);
    if (!initialZoneInTree) return;
    const { w: origW, h: origH } = initialZoneInTree;
    // Proportional delta derived from pixel ratio.
    const newW = Math.round(origW * ((initialPxW + axisDx) / initialPxW));
    const newH = Math.round(origH * ((initialPxH + axisDy) / initialPxH));
    const patch = {};
    if (start.handle?.includes('e') || start.handle?.includes('w')) patch.w = newW;
    if (start.handle?.includes('n') || start.handle?.includes('s')) patch.h = newH;

    if (Object.keys(patch).length > 0) {
      const nextTree = resizeZone(start.dashboardAtStart.tiledRoot, zoneId, patch);
      setDashboard({ ...dashboard, tiledRoot: nextTree });
    }
  }
}

function findById(zone, id) {
  if (zone.id === id) return zone;
  if (zone.children) {
    for (const c of zone.children) {
      const f = findById(c, id);
      if (f) return f;
    }
  }
  return null;
}

function applyResizeToFloating(f, start, dx, dy, snapEnabled) {
  const MIN = 40;
  const initial = start.initialZone;
  let x = initial.x;
  let y = initial.y;
  let w = initial.pxW;
  let h = initial.pxH;
  switch (start.handle) {
    case 'e':  w = initial.pxW + dx; break;
    case 'w':  w = initial.pxW - dx; x = initial.x + dx; break;
    case 'n':  h = initial.pxH - dy; y = initial.y + dy; break;
    case 's':  h = initial.pxH + dy; break;
    case 'ne': w = initial.pxW + dx; h = initial.pxH - dy; y = initial.y + dy; break;
    case 'nw': w = initial.pxW - dx; x = initial.x + dx; h = initial.pxH - dy; y = initial.y + dy; break;
    case 'se': w = initial.pxW + dx; h = initial.pxH + dy; break;
    case 'sw': w = initial.pxW - dx; x = initial.x + dx; h = initial.pxH + dy; break;
    default: break;
  }
  w = Math.max(MIN, w);
  h = Math.max(MIN, h);
  if (snapEnabled) {
    x = snapToGrid(x, GRID_SIZE);
    y = snapToGrid(y, GRID_SIZE);
    w = snapToGrid(w, GRID_SIZE);
    h = snapToGrid(h, GRID_SIZE);
  }
  return { ...f, x, y, pxW: w, pxH: h };
}
