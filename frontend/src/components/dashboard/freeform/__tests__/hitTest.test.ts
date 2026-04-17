// frontend/src/components/dashboard/freeform/__tests__/hitTest.test.ts
import { describe, it, expect } from 'vitest';
import { hitTestPoint, hitTestContainer, classifyDropEdge } from '../lib/hitTest';
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

function container(id: string, x: number, y: number, w: number, h: number, depth: number, children: unknown[] = []): ResolvedZone {
  return { zone: { id, type: 'container-horz', w: 0, h: 0, children } as unknown as ResolvedZone['zone'], x, y, width: w, height: h, depth };
}
function leafR(id: string, x: number, y: number, w: number, h: number, depth: number): ResolvedZone {
  return { zone: { id, type: 'worksheet', w: 0, h: 0 } as unknown as ResolvedZone['zone'], x, y, width: w, height: h, depth };
}

describe('hitTestContainer', () => {
  it('returns the deepest container under the point, skipping leaves', () => {
    const inner = container('inner', 100, 100, 400, 300, 1, [{ id: 'L1' }, { id: 'L2' }]);
    const root = container('root', 0, 0, 800, 600, 0, [inner.zone]);
    const list: ResolvedZone[] = [root, inner, leafR('L1', 100, 100, 200, 300, 2)];
    expect(hitTestContainer(list, 150, 150)?.zone.id).toBe('inner');
  });

  it('returns null when no container covers the point', () => {
    const list: ResolvedZone[] = [container('root', 0, 0, 100, 100, 0)];
    expect(hitTestContainer(list, 500, 500)).toBeNull();
  });

  it('ignores floating zones (depth -1)', () => {
    const list: ResolvedZone[] = [container('f', 0, 0, 100, 100, -1)];
    expect(hitTestContainer(list, 50, 50)).toBeNull();
  });
});

describe('classifyDropEdge', () => {
  const rz = leafR('z', 100, 100, 200, 100, 2);

  it('classifies top edge within 20% of zone height', () => {
    expect(classifyDropEdge(rz, 150, 105)).toBe('top');
  });
  it('classifies bottom edge', () => {
    expect(classifyDropEdge(rz, 150, 195)).toBe('bottom');
  });
  it('classifies left edge within 20% of zone width', () => {
    expect(classifyDropEdge(rz, 110, 150)).toBe('left');
  });
  it('classifies right edge', () => {
    expect(classifyDropEdge(rz, 290, 150)).toBe('right');
  });
  it('classifies center when inside the inner 60% rectangle', () => {
    expect(classifyDropEdge(rz, 200, 150)).toBe('center');
  });
});
