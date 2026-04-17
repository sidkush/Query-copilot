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
