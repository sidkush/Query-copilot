// frontend/src/components/dashboard/freeform/lib/canvasTransform.ts
//
// Plan 6a — screen ↔ sheet coordinate conversion for the Analyst Pro canvas.
//
// The sheet element carries `transform: translate(panX, panY) scale(zoom)`.
// All resolved layout coords are in pre-transform sheet space. Pointer events
// deliver client (screen) coords. Every hit-test must convert client→sheet
// before comparing.
//
// The rect argument is the sheet element's getBoundingClientRect() — which
// already includes the transform. That IS the correct origin because the
// rect's top-left is the on-screen position of sheet-space (0,0) AFTER the
// translate+scale; subtracting rect.top/left cancels translate, dividing by
// zoom cancels scale.

export interface PanVector { x: number; y: number; }
export interface ScreenPoint { clientX: number; clientY: number; }
export interface SheetPoint { x: number; y: number; }

export function screenToSheet(
  ev: ScreenPoint,
  rect: { left: number; top: number },
  zoom: number,
  pan: PanVector,
): SheetPoint {
  const safeZoom = zoom > 0 ? zoom : 1;
  return {
    x: (ev.clientX - rect.left - pan.x) / safeZoom,
    y: (ev.clientY - rect.top - pan.y) / safeZoom,
  };
}

export function sheetToScreen(
  pt: SheetPoint,
  rect: { left: number; top: number },
  zoom: number,
  pan: PanVector,
): ScreenPoint {
  return {
    clientX: pt.x * zoom + pan.x + rect.left,
    clientY: pt.y * zoom + pan.y + rect.top,
  };
}

// Derivation: sheetPt = screenToSheet(cursor, rect, zoomOld, panOld);
// panNew.x = cursor.x - rect.left - sheetPt.x * zoomNew
export function zoomAtAnchor(
  zoomOld: number,
  panOld: PanVector,
  zoomNew: number,
  cursor: ScreenPoint,
  rect: { left: number; top: number },
): { zoom: number; pan: PanVector } {
  const clamped = Math.max(0.1, Math.min(4.0, zoomNew));
  const sheetPt = screenToSheet(cursor, rect, zoomOld, panOld);
  return {
    zoom: clamped,
    pan: {
      x: cursor.clientX - rect.left - sheetPt.x * clamped,
      y: cursor.clientY - rect.top - sheetPt.y * clamped,
    },
  };
}
