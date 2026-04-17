// frontend/src/components/dashboard/freeform/__tests__/snapMath.test.ts
import { describe, it, expect } from 'vitest';
import { snapToGrid, snapToEdges, snapAndReport } from '../lib/snapMath';

describe('snapToGrid', () => {
  it('rounds a value to nearest multiple of gridSize', () => {
    expect(snapToGrid(17, 8)).toBe(16);
    expect(snapToGrid(12, 8)).toBe(16);
    expect(snapToGrid(3, 8)).toBe(0);
    expect(snapToGrid(0, 8)).toBe(0);
  });

  it('handles negative values', () => {
    expect(snapToGrid(-3, 8)).toBe(0);
    expect(snapToGrid(-5, 8)).toBe(-8);
  });

  it('returns the value unchanged when gridSize <= 0', () => {
    expect(snapToGrid(17, 0)).toBe(17);
    expect(snapToGrid(17, -8)).toBe(17);
  });
});

describe('snapToEdges', () => {
  it('snaps a target position to nearby sibling edges within threshold', () => {
    const siblings = [
      { x: 0, y: 0, width: 100, height: 100 },
      { x: 200, y: 0, width: 100, height: 100 },
    ];
    // Dragging a 50x50 element to approximately (97, 0) — near right edge of first sibling (x=100).
    const result = snapToEdges({ x: 97, y: 0, width: 50, height: 50 }, siblings, 5);
    expect(result.x).toBe(100); // snapped to right edge of sibling at x=100
    expect(result.y).toBe(0);
  });

  it('returns unchanged position when no sibling edge is within threshold', () => {
    const siblings = [{ x: 0, y: 0, width: 100, height: 100 }];
    const result = snapToEdges({ x: 500, y: 500, width: 50, height: 50 }, siblings, 5);
    expect(result.x).toBe(500);
    expect(result.y).toBe(500);
  });

  it('handles empty sibling list', () => {
    const result = snapToEdges({ x: 100, y: 100, width: 50, height: 50 }, [], 5);
    expect(result.x).toBe(100);
    expect(result.y).toBe(100);
  });
});

describe('snapAndReport', () => {
  const sib = { x: 100, y: 100, width: 200, height: 150 };

  it('returns input position when no snap is within threshold', () => {
    const target = { x: 400, y: 400, width: 50, height: 50 };
    const out = snapAndReport(target, [sib], 6);
    expect(out.x).toBe(400);
    expect(out.y).toBe(400);
    expect(out.guideLines).toEqual([]);
  });

  it('snaps target.x to sibling.left and reports an x-axis guide', () => {
    const target = { x: 103, y: 400, width: 50, height: 50 };
    const out = snapAndReport(target, [sib], 6);
    expect(out.x).toBe(100);
    expect(out.guideLines.some((g) => g.axis === 'x' && g.position === 100)).toBe(true);
  });

  it('snaps target.y to sibling.bottom and reports a y-axis guide', () => {
    const target = { x: 400, y: 248, width: 50, height: 50 };
    const out = snapAndReport(target, [sib], 6);
    expect(out.y).toBe(250);
    expect(out.guideLines.some((g) => g.axis === 'y' && g.position === 250)).toBe(true);
  });

  it('caps guideLines at 4 entries even with many snapping siblings', () => {
    const siblings = Array.from({ length: 10 }, (_, i) => ({
      x: 100, y: 100 + i * 5, width: 50, height: 50,
    }));
    const target = { x: 103, y: 103, width: 10, height: 10 };
    const out = snapAndReport(target, siblings, 6);
    expect(out.guideLines.length).toBeLessThanOrEqual(4);
  });
});
