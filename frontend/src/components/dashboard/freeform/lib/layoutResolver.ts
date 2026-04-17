import type { Zone, ContainerZone, FloatingZone, ResolvedZone } from './types';
import { isContainer } from './zoneTree';

/**
 * Recursively resolve a zone tree + floating layer to absolute pixel coordinates.
 *
 * Algorithm (matches Tableau's model):
 *   - Container-horz splits availW among children by their `w` (normalized to sum 100000);
 *     each child gets full availH as height budget. Child's own `h` ignored inside horz.
 *   - Container-vert: mirror — splits availH by `h`; each child gets full availW.
 *   - Floating zones use explicit pixel coords (x, y, pxW, pxH), ignore the tree.
 *
 * Output is a flat array of ResolvedZone, one per zone in the tree + one per floating zone.
 */
export function resolveLayout(
  root: ContainerZone,
  floatingLayer: FloatingZone[],
  canvasWidth: number,
  canvasHeight: number,
): ResolvedZone[] {
  const result: ResolvedZone[] = [];
  resolveTiledRecursive(root, 0, 0, canvasWidth, canvasHeight, 0, result);
  for (const f of floatingLayer) {
    result.push({
      zone: f,
      x: f.x,
      y: f.y,
      width: f.pxW,
      height: f.pxH,
      depth: -1, // floating layer is not in the tree
    });
  }
  return result;
}

function resolveTiledRecursive(
  zone: Zone,
  x: number,
  y: number,
  width: number,
  height: number,
  depth: number,
  out: ResolvedZone[],
): void {
  out.push({ zone, x, y, width, height, depth });
  if (!isContainer(zone) || zone.children.length === 0) return;

  // Children's split-axis values are expected to be pre-normalized so they sum to 100000
  // (via normalizeContainer). We use 100000 as the fixed denominator so an under-specified
  // tree (children summing < 100000) leaves empty trailing space rather than stretching.
  // If all children are zero (degenerate), fall back to equal-split via their actual sum.
  const DENOM = 100000;

  if (zone.type === 'container-horz') {
    const actualSum = zone.children.reduce((s, c) => s + c.w, 0);
    const denom = actualSum > 0 ? Math.max(DENOM, actualSum) : 1;
    let cursor = x;
    for (const child of zone.children) {
      const childWidth = Math.round((child.w / denom) * width);
      resolveTiledRecursive(child, cursor, y, childWidth, height, depth + 1, out);
      cursor += childWidth;
    }
  } else {
    // container-vert
    const actualSum = zone.children.reduce((s, c) => s + c.h, 0);
    const denom = actualSum > 0 ? Math.max(DENOM, actualSum) : 1;
    let cursor = y;
    for (const child of zone.children) {
      const childHeight = Math.round((child.h / denom) * height);
      resolveTiledRecursive(child, x, cursor, width, childHeight, depth + 1, out);
      cursor += childHeight;
    }
  }
}
