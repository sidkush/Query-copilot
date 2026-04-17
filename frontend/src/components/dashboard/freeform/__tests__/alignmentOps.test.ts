// frontend/src/components/dashboard/freeform/__tests__/alignmentOps.test.ts
import { describe, it, expect } from 'vitest';
import { alignZones, distributeZones } from '../lib/alignmentOps';
import type { FloatingZone } from '../lib/types';

/**
 * Test fixture helper — builds a FloatingZone with sensible defaults.
 */
const fz = (overrides: Partial<FloatingZone>): FloatingZone => ({
  id: 'z',
  type: 'text',
  w: 0,
  h: 0,
  floating: true,
  x: 0,
  y: 0,
  pxW: 100,
  pxH: 100,
  zIndex: 0,
  ...overrides,
});

describe('alignZones', () => {
  it('returns empty array when input is empty', () => {
    const result = alignZones([], 'left');
    expect(result).toEqual([]);
  });

  it('returns single-element array unchanged (new array reference)', () => {
    const zone = fz({ id: 'a', x: 10, y: 20 });
    const result = alignZones([zone], 'left');
    expect(result).toEqual([zone]);
    expect(result).not.toBe([zone]); // new array reference
  });

  it('aligns left: all zones x = min(x)', () => {
    const a = fz({ id: 'a', x: 10 });
    const b = fz({ id: 'b', x: 50 });
    const c = fz({ id: 'c', x: 30 });
    const result = alignZones([a, b, c], 'left');
    expect(result[0].x).toBe(10);
    expect(result[1].x).toBe(10);
    expect(result[2].x).toBe(10);
  });

  it('aligns right: right edges align, new x = max(x+pxW) - pxW', () => {
    const a = fz({ id: 'a', x: 0, pxW: 100 }); // right edge = 100
    const b = fz({ id: 'b', x: 50, pxW: 200 }); // right edge = 250
    const result = alignZones([a, b], 'right');
    // max right edge = 250, so new x = 250 - pxW
    expect(result[0].x).toBe(150); // 250 - 100
    expect(result[1].x).toBe(50); // 250 - 200
    expect(result[0].pxW).toBe(100); // width unchanged
    expect(result[1].pxW).toBe(200); // width unchanged
  });

  it('aligns h-center: (x + pxW/2) equals average across inputs', () => {
    const a = fz({ id: 'a', x: 0, pxW: 100 }); // center = 50
    const b = fz({ id: 'b', x: 100, pxW: 200 }); // center = 200
    // avg center = (50 + 200) / 2 = 125
    const result = alignZones([a, b], 'h-center');
    const centerA = result[0].x + result[0].pxW / 2;
    const centerB = result[1].x + result[1].pxW / 2;
    expect(centerA).toBeCloseTo(125);
    expect(centerB).toBeCloseTo(125);
  });

  it('aligns top: all zones y = min(y)', () => {
    const a = fz({ id: 'a', y: 20 });
    const b = fz({ id: 'b', y: 80 });
    const c = fz({ id: 'c', y: 50 });
    const result = alignZones([a, b, c], 'top');
    expect(result[0].y).toBe(20);
    expect(result[1].y).toBe(20);
    expect(result[2].y).toBe(20);
  });

  it('aligns bottom: bottom edges align, new y = max(y+pxH) - pxH', () => {
    const a = fz({ id: 'a', y: 0, pxH: 100 }); // bottom edge = 100
    const b = fz({ id: 'b', y: 50, pxH: 200 }); // bottom edge = 250
    const result = alignZones([a, b], 'bottom');
    // max bottom edge = 250, so new y = 250 - pxH
    expect(result[0].y).toBe(150); // 250 - 100
    expect(result[1].y).toBe(50); // 250 - 200
    expect(result[0].pxH).toBe(100); // height unchanged
    expect(result[1].pxH).toBe(200); // height unchanged
  });

  it('aligns v-center: (y + pxH/2) equals average across inputs', () => {
    const a = fz({ id: 'a', y: 0, pxH: 100 }); // center = 50
    const b = fz({ id: 'b', y: 100, pxH: 200 }); // center = 200
    // avg center = (50 + 200) / 2 = 125
    const result = alignZones([a, b], 'v-center');
    const centerA = result[0].y + result[0].pxH / 2;
    const centerB = result[1].y + result[1].pxH / 2;
    expect(centerA).toBeCloseTo(125);
    expect(centerB).toBeCloseTo(125);
  });

  it('does not mutate input zones', () => {
    const a = fz({ id: 'a', x: 10 });
    const b = fz({ id: 'b', x: 50 });
    const original = [{ ...a }, { ...b }];
    alignZones([a, b], 'left');
    expect(a).toEqual(original[0]);
    expect(b).toEqual(original[1]);
  });

  it('preserves all other fields when aligning left', () => {
    const zone = fz({
      id: 'z1',
      x: 10,
      y: 20,
      pxW: 150,
      pxH: 200,
      zIndex: 5,
      type: 'worksheet',
    });
    const result = alignZones([zone], 'left');
    expect(result[0].y).toBe(20);
    expect(result[0].pxW).toBe(150);
    expect(result[0].pxH).toBe(200);
    expect(result[0].zIndex).toBe(5);
    expect(result[0].type).toBe('worksheet');
  });
});

describe('distributeZones', () => {
  it('returns identity for 0 zones', () => {
    const result = distributeZones([], 'horizontal');
    expect(result).toEqual([]);
  });

  it('returns identity for 1 zone', () => {
    const zone = fz({ id: 'a', x: 100 });
    const result = distributeZones([zone], 'horizontal');
    expect(result).toEqual([zone]);
  });

  it('returns identity for 2 zones', () => {
    const a = fz({ id: 'a', x: 0 });
    const b = fz({ id: 'b', x: 100 });
    const result = distributeZones([a, b], 'horizontal');
    expect(result).toHaveLength(2);
    expect(result[0].x).toBe(0);
    expect(result[1].x).toBe(100);
  });

  it('distributes 3 zones horizontally: outer zones keep position, middle zone centered', () => {
    const a = fz({ id: 'a', x: 0, pxW: 100 });
    const b = fz({ id: 'b', x: 999, pxW: 100 }); // rightmost position
    const c = fz({ id: 'c', x: 200, pxW: 100 }); // middle (unsorted)
    const result = distributeZones([a, b, c], 'horizontal');
    // Sorted by x: a(0), c(200), b(999)
    // Total span = 999 - 0 = 999
    // step = 999 / 3 = 333
    // Sorted positions: sorted[0].x = 0, sorted[1].x = 333, sorted[2].x = 666
    // But wait: formula is step = span / N, then sorted[i].x = p0 + i*step
    // So: sorted[0] = 0 + 0*333 = 0, sorted[1] = 0 + 1*333 = 333, sorted[2] = 0 + 2*333 = 666
    const sortedByX = result.sort((z1, z2) => z1.x - z2.x);
    expect(sortedByX[0].x).toBe(0);
    expect(sortedByX[1].x).toBeCloseTo(333);
    expect(sortedByX[2].x).toBeCloseTo(666);
  });

  it('preserves original input array order in returned array', () => {
    const a = fz({ id: 'a', x: 100 });
    const b = fz({ id: 'b', x: 0 });
    const c = fz({ id: 'c', x: 50 });
    const result = distributeZones([a, b, c], 'horizontal');
    expect(result[0].id).toBe('a');
    expect(result[1].id).toBe('b');
    expect(result[2].id).toBe('c');
  });

  it('distributes 3 zones vertically: outer zones keep position, middle zone centered', () => {
    const a = fz({ id: 'a', y: 0, pxH: 100 });
    const b = fz({ id: 'b', y: 999, pxH: 100 });
    const c = fz({ id: 'c', y: 200, pxH: 100 });
    const result = distributeZones([a, b, c], 'vertical');
    const sortedByY = result.sort((z1, z2) => z1.y - z2.y);
    expect(sortedByY[0].y).toBe(0);
    expect(sortedByY[1].y).toBeCloseTo(333);
    expect(sortedByY[2].y).toBeCloseTo(666);
  });

  it('does not mutate input zones', () => {
    const a = fz({ id: 'a', x: 100 });
    const b = fz({ id: 'b', x: 0 });
    const c = fz({ id: 'c', x: 50 });
    const original = [{ ...a }, { ...b }, { ...c }];
    distributeZones([a, b, c], 'horizontal');
    expect(a).toEqual(original[0]);
    expect(b).toEqual(original[1]);
    expect(c).toEqual(original[2]);
  });

  it('preserves all other fields during distribution', () => {
    const a = fz({ id: 'a', x: 0, y: 50, pxW: 150, pxH: 200, zIndex: 3 });
    const b = fz({ id: 'b', x: 500, y: 50, pxW: 150, pxH: 200, zIndex: 4 });
    const c = fz({ id: 'c', x: 250, y: 50, pxW: 150, pxH: 200, zIndex: 5 });
    const result = distributeZones([a, b, c], 'horizontal');
    result.forEach((zone) => {
      expect(zone.y).toBe(50);
      expect(zone.pxW).toBe(150);
      expect(zone.pxH).toBe(200);
    });
  });

  it('returns new array reference', () => {
    const a = fz({ id: 'a', x: 0 });
    const b = fz({ id: 'b', x: 100 });
    const input = [a, b];
    const result = distributeZones(input, 'horizontal');
    expect(result).not.toBe(input);
  });
});
