// frontend/src/components/dashboard/freeform/lib/hitTest.ts
import type { ResolvedZone } from './types';

/**
 * Point-in-zone hit test against a flat list of ResolvedZone.
 *
 * Priority rules:
 *   1. Floating zones (depth = -1) beat tiled zones at the same point.
 *      Among overlapping floating zones, the LAST in the list wins (higher zIndex
 *      paints later — the resolver preserves zIndex ordering).
 *   2. Among tiled zones, innermost wins (highest depth).
 *
 * Returns the winning zone or null if no hit.
 *
 * Complexity: O(n). For ≤ 50 tiles the naive sweep is well under 1ms per call.
 * Plan 2b may introduce an R-tree when tile count scales; not needed now.
 */
export function hitTestPoint(resolved: ResolvedZone[], x: number, y: number): ResolvedZone | null {
  let bestTiled: ResolvedZone | null = null;
  let bestTiledDepth = -Infinity;
  let bestFloating: ResolvedZone | null = null;

  for (const r of resolved) {
    if (!isInside(x, y, r)) continue;
    if (r.depth === -1) {
      // Floating — last hit wins.
      bestFloating = r;
    } else if (r.depth > bestTiledDepth) {
      bestTiled = r;
      bestTiledDepth = r.depth;
    }
  }

  return bestFloating ?? bestTiled;
}

function isInside(x: number, y: number, r: ResolvedZone): boolean {
  return x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;
}

export type DropEdge = 'top' | 'bottom' | 'left' | 'right' | 'center';

/**
 * Like hitTestPoint, but only returns tiled (depth >= 0) container zones.
 * Innermost (deepest) wins. Used by canvas drag to classify the cursor's
 * enclosing container for drop-into-container UX.
 */
export function hitTestContainer(resolved: ResolvedZone[], x: number, y: number): ResolvedZone | null {
  let best: ResolvedZone | null = null;
  let bestDepth = -Infinity;
  for (const r of resolved) {
    if (r.depth < 0) continue;
    const t = (r.zone as { type?: string }).type;
    if (!t || !t.startsWith('container-')) continue;
    if (!isInside(x, y, r)) continue;
    if (r.depth > bestDepth) {
      best = r;
      bestDepth = r.depth;
    }
  }
  return best;
}

/**
 * Classify where within a zone the cursor sits.
 * Outer 20% band per side → top/bottom/left/right. Inner 60% → center.
 * Ambiguous corners resolve to the band with smaller normalized distance.
 */
export function classifyDropEdge(r: ResolvedZone, x: number, y: number): DropEdge {
  const dx = (x - r.x) / r.width;
  const dy = (y - r.y) / r.height;
  const THRESHOLD = 0.2;
  const distTop = dy;
  const distBottom = 1 - dy;
  const distLeft = dx;
  const distRight = 1 - dx;
  const minDist = Math.min(distTop, distBottom, distLeft, distRight);
  if (minDist >= THRESHOLD) return 'center';
  if (minDist === distTop) return 'top';
  if (minDist === distBottom) return 'bottom';
  if (minDist === distLeft) return 'left';
  return 'right';
}
