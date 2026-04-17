// frontend/src/components/dashboard/freeform/__tests__/hitTest.test.ts
import { describe, it, expect } from 'vitest';
import { hitTestPoint } from '../lib/hitTest';
import type { ResolvedZone } from '../lib/types';

function r(id: string, x: number, y: number, w: number, h: number, depth = 0): ResolvedZone {
  return { zone: { id, type: 'blank', w: 0, h: 0 }, x, y, width: w, height: h, depth };
}

describe('hitTestPoint', () => {
  it('returns null when point is outside all zones', () => {
    const resolved: ResolvedZone[] = [r('a', 0, 0, 100, 100)];
    expect(hitTestPoint(resolved, 200, 200)).toBeNull();
  });

  it('returns the innermost zone by tree depth', () => {
    const resolved: ResolvedZone[] = [
      r('root', 0, 0, 500, 500, 0),
      r('child', 100, 100, 200, 200, 1),
      r('grandchild', 150, 150, 100, 100, 2),
    ];
    const hit = hitTestPoint(resolved, 175, 175);
    expect(hit?.zone.id).toBe('grandchild');
  });

  it('prefers floating zones (depth -1) when overlapping a tiled zone', () => {
    const resolved: ResolvedZone[] = [
      r('tiled', 0, 0, 500, 500, 2),
      r('floating', 100, 100, 200, 200, -1),
    ];
    const hit = hitTestPoint(resolved, 150, 150);
    expect(hit?.zone.id).toBe('floating');
  });

  it('returns the last floating zone (top-most zIndex) when multiple overlap', () => {
    const resolved: ResolvedZone[] = [
      r('f1', 50, 50, 200, 200, -1),
      r('f2', 100, 100, 200, 200, -1),
    ];
    const hit = hitTestPoint(resolved, 150, 150);
    expect(hit?.zone.id).toBe('f2');
  });
});
