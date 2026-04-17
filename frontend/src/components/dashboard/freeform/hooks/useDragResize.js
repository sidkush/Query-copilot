// frontend/src/components/dashboard/freeform/hooks/useDragResize.js
import { useCallback, useRef } from 'react';
import { useStore } from '../../../../store';
import { reorderZone, resizeZone } from '../lib/zoneTreeOps';
import { snapToGrid, snapToEdges, snapAndReport } from '../lib/snapMath';
import { hitTestContainer, classifyDropEdge } from '../lib/hitTest';

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
 * Tiled zones: wired in Tasks 10/11 (resize via resizeZone, reorder via reorderZone).
 */
export function useDragResize({ canvasRef, resolvedMap, siblingsFloating, resolvedList }) {
  const rafRef = useRef(0);
  const startRef = useRef(null);

  const snapEnabled = useStore((s) => s.analystProSnapEnabled);
  const dashboard = useStore((s) => s.analystProDashboard);
  const setDashboard = useStore((s) => s.setAnalystProDashboard);
  const pushHistory = useStore((s) => s.pushAnalystProHistory);

  const onZonePointerDown = useCallback((zoneId, event, resolvedZone, mode = 'move', handle = null) => {
    const canvas = canvasRef.current;
    if (!canvas || !dashboard) return;

    // T5: block drag/resize on locked zones — check both floating and tiled layers.
    const floatingZone = (dashboard.floatingLayer || []).find((f) => f.id === zoneId);
    if (floatingZone?.locked === true) return;
    if (!floatingZone && resolvedZone?.zone?.locked === true) return;

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
      resolvedList: Array.isArray(resolvedList) ? resolvedList : [],
    };

    const onMove = (ev) => {
      if (!startRef.current) return;
      // Plan 6a — convert client-space delta to sheet-space so canvas zoom
      // doesn't amplify or shrink drag distance.
      const zoomNow = useStore.getState().analystProCanvasZoom || 1;
      const dx = (ev.clientX - startRef.current.startX) / zoomNow;
      const dy = (ev.clientY - startRef.current.startY) / zoomNow;

      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        applyDragDelta(startRef.current, dx, dy, snapEnabled, siblingsFloating, dashboard, setDashboard);
      });
    };

    const onUp = () => {
      if (!startRef.current) return;
      const drag = useStore.getState().analystProDragState;
      // Commit tiled reorder: compute target index from final dx/dy, then
      // translate to reorderZone(sourceId, targetId, before|after) — shared
      // primitive with LayoutTreePanel drag-drop.
      if (drag && startRef.current.mode === 'move' && !startRef.current.isFloating) {
        const dashAtEnd = useStore.getState().analystProDashboard;
        if (dashAtEnd?.tiledRoot) {
          const wrapAction = useStore.getState().wrapInContainerAnalystPro;
          const moveAcrossAction = useStore.getState().moveZoneAcrossContainersAnalystPro;

          // Case 1 — leaf-edge drop → wrap in new split container.
          if (drag.dropEdge && drag.dropEdge !== 'center'
              && drag.targetContainerId && drag.targetContainerId !== drag.zoneId) {
            const sourceZone = findById(dashAtEnd.tiledRoot, drag.zoneId);
            if (sourceZone) wrapAction(drag.targetContainerId, sourceZone, drag.dropEdge);
          }
          // Case 2 — drop into a different container at an index.
          else if (drag.targetContainerId
                   && drag.targetContainerId !== drag.parentId
                   && typeof drag.targetIndex === 'number'
                   && !drag.dropEdge) {
            moveAcrossAction(drag.zoneId, drag.targetContainerId, drag.targetIndex);
          }
          // Case 3 — same-parent reorder (existing heuristic).
          else {
            const parent = findParentContainer(dashAtEnd.tiledRoot, drag.zoneId);
            if (parent) {
              const currentIdx = parent.children.findIndex((c) => c.id === drag.zoneId);
              let targetIdx = currentIdx;
              const axis = parent.type === 'container-horz' ? drag.dx : drag.dy;
              if (axis > 40) targetIdx = Math.min(parent.children.length - 1, currentIdx + 1);
              else if (axis < -40) targetIdx = Math.max(0, currentIdx - 1);
              if (targetIdx !== currentIdx) {
                const targetId = parent.children[targetIdx].id;
                const position = targetIdx > currentIdx ? 'after' : 'before';
                const next = reorderZone(dashAtEnd.tiledRoot, drag.zoneId, targetId, position);
                setDashboard({ ...dashAtEnd, tiledRoot: next });
              }
            }
          }
        }
      }
      useStore.getState().setAnalystProDragState(null);

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
  }, [canvasRef, resolvedMap, dashboard, snapEnabled, setDashboard, pushHistory, siblingsFloating, resolvedList]);

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

  // Tiled move (Plan 5b): hit-test containers, classify drop edge on leaves,
  // compute snap-guide lines, record all into drag state for the overlay.
  if (!start.isFloating && start.mode === 'move' && dashboard.tiledRoot) {
    const parent = findParentContainer(dashboard.tiledRoot, start.zoneId);
    if (!parent) return;

    const cursorX = (start.initialZone?.x ?? 0) + dx;
    const cursorY = (start.initialZone?.y ?? 0) + dy;

    let targetContainerId = null;
    let targetIndex = null;
    let dropEdge = null;
    let activeGuides = [];

    const list = start.resolvedList || [];
    if (list.length) {
      // Container hit test (deepest container wins).
      const hitContainer = hitTestContainer(list, cursorX, cursorY);
      if (hitContainer && hitContainer.zone.id !== start.zoneId) {
        targetContainerId = hitContainer.zone.id;
        const children = hitContainer.zone.children || [];
        const primary = hitContainer.zone.type === 'container-horz' ? 'x' : 'y';
        const primaryLen = primary === 'x' ? 'width' : 'height';
        let idx = children.length;
        for (let i = 0; i < children.length; i++) {
          const childResolved = list.find((r) => r.zone.id === children[i].id);
          if (!childResolved) continue;
          const mid = childResolved[primary] + childResolved[primaryLen] / 2;
          if ((primary === 'x' ? cursorX : cursorY) < mid) { idx = i; break; }
        }
        targetIndex = idx;
      }

      // Leaf-edge classification (overrides container drop into wrap intent).
      const hitLeafResolved = list.find((r) => {
        const t = r.zone?.type;
        if (!t || t.startsWith('container-')) return false;
        if (r.zone.id === start.zoneId) return false;
        if (r.depth < 0) return false;
        return cursorX >= r.x && cursorX <= r.x + r.width
            && cursorY >= r.y && cursorY <= r.y + r.height;
      });
      if (hitLeafResolved) {
        dropEdge = classifyDropEdge(hitLeafResolved, cursorX, cursorY);
        targetContainerId = hitLeafResolved.zone.id;
        targetIndex = null;
      }

      // Smart-guide snap report.
      const initialW = start.initialZone?.width ?? 80;
      const initialH = start.initialZone?.height ?? 60;
      const siblingRects = list
        .filter((r) => r.zone.id !== start.zoneId && r.depth >= 0)
        .map((r) => ({ x: r.x, y: r.y, width: r.width, height: r.height }));
      const SNAP_THRESHOLD_PX = 6;
      const report = snapAndReport(
        { x: cursorX, y: cursorY, width: initialW, height: initialH },
        siblingRects,
        SNAP_THRESHOLD_PX,
      );
      activeGuides = report.guideLines;
    }

    useStore.getState().setAnalystProDragState({
      zoneId: start.zoneId,
      parentId: parent.id,
      dx,
      dy,
      targetContainerId,
      targetIndex,
      dropEdge,
      activeGuides,
    });
  }
}

function findParentContainer(root, childId) {
  if (root.children) {
    for (const c of root.children) {
      if (c.id === childId) return root;
    }
    for (const c of root.children) {
      if (c.children) {
        const f = findParentContainer(c, childId);
        if (f) return f;
      }
    }
  }
  return null;
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
