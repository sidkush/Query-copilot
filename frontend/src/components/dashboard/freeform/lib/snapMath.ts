// frontend/src/components/dashboard/freeform/lib/snapMath.ts

/** Snap a value to the nearest multiple of gridSize. */
export function snapToGrid(value: number, gridSize: number): number {
  if (gridSize <= 0) return value;
  // `+ 0` normalizes -0 → +0 so callers using strict equality/Object.is don't trip.
  return Math.round(value / gridSize) * gridSize + 0;
}

export type Rect = { x: number; y: number; width: number; height: number };

/**
 * Snap a target rect's (x, y) to nearby sibling edges within `threshold` pixels.
 * Checks left/right/top/bottom edges of each sibling against the target's edges.
 * First matching axis snap wins per dimension.
 */
export function snapToEdges(target: Rect, siblings: Rect[], threshold: number): Rect {
  let bestX = target.x;
  let bestY = target.y;
  let bestDx = threshold + 1;
  let bestDy = threshold + 1;

  for (const s of siblings) {
    // X-axis: align target.x to sibling.x, sibling.right, or align target.right to sibling.x/right.
    const candidatesX = [
      { pos: s.x, via: 'left' },
      { pos: s.x + s.width, via: 'right' },
    ];
    for (const c of candidatesX) {
      const dxLeft = Math.abs(target.x - c.pos);
      if (dxLeft < bestDx) { bestDx = dxLeft; bestX = c.pos; }
      const dxRight = Math.abs((target.x + target.width) - c.pos);
      if (dxRight < bestDx) { bestDx = dxRight; bestX = c.pos - target.width; }
    }
    // Y-axis
    const candidatesY = [
      { pos: s.y, via: 'top' },
      { pos: s.y + s.height, via: 'bottom' },
    ];
    for (const c of candidatesY) {
      const dyTop = Math.abs(target.y - c.pos);
      if (dyTop < bestDy) { bestDy = dyTop; bestY = c.pos; }
      const dyBottom = Math.abs((target.y + target.height) - c.pos);
      if (dyBottom < bestDy) { bestDy = dyBottom; bestY = c.pos - target.height; }
    }
  }

  return {
    ...target,
    x: bestDx <= threshold ? bestX : target.x,
    y: bestDy <= threshold ? bestY : target.y,
  };
}
