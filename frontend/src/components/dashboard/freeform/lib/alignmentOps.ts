// frontend/src/components/dashboard/freeform/lib/alignmentOps.ts
import type { FloatingZone } from './types';

export type AlignOp =
  | 'left'
  | 'right'
  | 'h-center'
  | 'top'
  | 'bottom'
  | 'v-center';

export type DistributeAxis = 'horizontal' | 'vertical';

/**
 * Aligns floating zones along the specified axis.
 *
 * - `left`: all x = min(x)
 * - `right`: all right edges align → x = max(x+pxW) - pxW
 * - `h-center`: all centers align → x + pxW/2 = average center
 * - `top`: all y = min(y)
 * - `bottom`: all bottom edges align → y = max(y+pxH) - pxH
 * - `v-center`: all centers align → y + pxH/2 = average center
 *
 * Input length 0 or 1 → returns identity (new array, same contents).
 * Never mutates input zones; returns new array with new zone objects.
 */
export function alignZones(zones: FloatingZone[], op: AlignOp): FloatingZone[] {
  if (zones.length <= 1) {
    return zones.map(z => ({ ...z }));
  }

  switch (op) {
    case 'left': {
      const minX = Math.min(...zones.map(z => z.x));
      return zones.map(z => ({ ...z, x: minX }));
    }

    case 'right': {
      const maxRightEdge = Math.max(...zones.map(z => z.x + z.pxW));
      return zones.map(z => ({ ...z, x: maxRightEdge - z.pxW }));
    }

    case 'h-center': {
      const avgCenter = zones.reduce((sum, z) => sum + (z.x + z.pxW / 2), 0) / zones.length;
      return zones.map(z => ({ ...z, x: avgCenter - z.pxW / 2 }));
    }

    case 'top': {
      const minY = Math.min(...zones.map(z => z.y));
      return zones.map(z => ({ ...z, y: minY }));
    }

    case 'bottom': {
      const maxBottomEdge = Math.max(...zones.map(z => z.y + z.pxH));
      return zones.map(z => ({ ...z, y: maxBottomEdge - z.pxH }));
    }

    case 'v-center': {
      const avgCenter = zones.reduce((sum, z) => sum + (z.y + z.pxH / 2), 0) / zones.length;
      return zones.map(z => ({ ...z, y: avgCenter - z.pxH / 2 }));
    }

    default: {
      const _exhaustive: never = op;
      return _exhaustive;
    }
  }
}

/**
 * Distributes floating zones evenly along the specified axis.
 *
 * Input length < 3 → returns identity (new array, same contents).
 *
 * For length >= 3:
 * - Sort zones by position (x for horizontal, y for vertical)
 * - Endpoints keep their position
 * - Inner zones placed so gap between successive LEADING EDGES is uniform
 * - Formula: totalSpan = sorted[N].pos - sorted[0].pos
 *           step = totalSpan / N
 *           sorted[i].newPos = sorted[0].pos + i * step
 * - Returns array in original input order (not sorted order)
 *
 * Never mutates input zones; returns new array with new zone objects.
 */
export function distributeZones(zones: FloatingZone[], axis: DistributeAxis): FloatingZone[] {
  if (zones.length < 3) {
    return zones.map(z => ({ ...z }));
  }

  // Create indexed array to track original order
  const indexed = zones.map((z, idx) => ({ zone: z, originalIndex: idx }));

  // Sort by position (x or y)
  const getPos = (z: FloatingZone): number => (axis === 'horizontal' ? z.x : z.y);
  const setPos = (z: FloatingZone, pos: number): FloatingZone =>
    axis === 'horizontal' ? { ...z, x: pos } : { ...z, y: pos };

  const sorted = indexed.sort((a, b) => getPos(a.zone) - getPos(b.zone));

  // Calculate distribution
  const p0 = getPos(sorted[0].zone);
  const pN = getPos(sorted[sorted.length - 1].zone);
  const totalSpan = pN - p0;
  const N = sorted.length;
  const step = totalSpan / N;

  // Assign new positions in sorted order
  const distributed = sorted.map((item, i) => ({
    ...item,
    zone: setPos(item.zone, p0 + i * step),
  }));

  // Reorder back to original order
  const result = new Array<FloatingZone>(zones.length);
  for (const item of distributed) {
    result[item.originalIndex] = item.zone;
  }

  return result;
}
