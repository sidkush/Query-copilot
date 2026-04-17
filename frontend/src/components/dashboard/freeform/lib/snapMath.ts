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

export type GuideLine = {
  axis: 'x' | 'y';
  /** pixel position of the guide line on the given axis */
  position: number;
  /** perpendicular extent start */
  start: number;
  /** perpendicular extent end */
  end: number;
};

export type SnapReport = {
  x: number;
  y: number;
  guideLines: GuideLine[];
};

type EdgeCandidate = {
  /** pixel position of the sibling's edge (the guide line to draw) */
  siblingEdge: number;
  /** target's new x or y so that its edge aligns to siblingEdge */
  newTargetOrigin: number;
  /** sibling rect for perpendicular extent */
  sibling: Rect;
};

/**
 * Like snapToEdges, but also returns guide-line metadata so an overlay can
 * draw dashed lines at the sibling edges the target snapped to.
 * Caps guideLines at 4 (closest per axis edge combo).
 */
export function snapAndReport(target: Rect, siblings: Rect[], threshold: number): SnapReport {
  const xHits: Array<{ dist: number; candidate: EdgeCandidate }> = [];
  const yHits: Array<{ dist: number; candidate: EdgeCandidate }> = [];

  for (const s of siblings) {
    const sibLeft = s.x;
    const sibRight = s.x + s.width;
    const sibTop = s.y;
    const sibBottom = s.y + s.height;

    // X-axis snap candidates: target.left → sibLeft / sibRight, target.right → sibLeft / sibRight.
    const xCandidates: EdgeCandidate[] = [
      { siblingEdge: sibLeft, newTargetOrigin: sibLeft, sibling: s },
      { siblingEdge: sibRight, newTargetOrigin: sibRight, sibling: s },
      { siblingEdge: sibLeft, newTargetOrigin: sibLeft - target.width, sibling: s },
      { siblingEdge: sibRight, newTargetOrigin: sibRight - target.width, sibling: s },
    ];
    for (const c of xCandidates) {
      const dist = Math.abs(target.x - c.newTargetOrigin);
      if (dist <= threshold) xHits.push({ dist, candidate: c });
    }

    // Y-axis snap candidates.
    const yCandidates: EdgeCandidate[] = [
      { siblingEdge: sibTop, newTargetOrigin: sibTop, sibling: s },
      { siblingEdge: sibBottom, newTargetOrigin: sibBottom, sibling: s },
      { siblingEdge: sibTop, newTargetOrigin: sibTop - target.height, sibling: s },
      { siblingEdge: sibBottom, newTargetOrigin: sibBottom - target.height, sibling: s },
    ];
    for (const c of yCandidates) {
      const dist = Math.abs(target.y - c.newTargetOrigin);
      if (dist <= threshold) yHits.push({ dist, candidate: c });
    }
  }

  xHits.sort((a, b) => a.dist - b.dist);
  yHits.sort((a, b) => a.dist - b.dist);

  const bestX = xHits[0]?.candidate ?? null;
  const bestY = yHits[0]?.candidate ?? null;

  const finalX = bestX ? bestX.newTargetOrigin : target.x;
  const finalY = bestY ? bestY.newTargetOrigin : target.y;

  const guideLines: GuideLine[] = [];
  if (bestX) {
    const s = bestX.sibling;
    guideLines.push({
      axis: 'x',
      position: bestX.siblingEdge,
      start: Math.min(s.y, finalY),
      end: Math.max(s.y + s.height, finalY + target.height),
    });
  }
  if (bestY) {
    const s = bestY.sibling;
    guideLines.push({
      axis: 'y',
      position: bestY.siblingEdge,
      start: Math.min(s.x, finalX),
      end: Math.max(s.x + s.width, finalX + target.width),
    });
  }

  return { x: finalX, y: finalY, guideLines: guideLines.slice(0, 4) };
}
