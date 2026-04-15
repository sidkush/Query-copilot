import { describe, it, expect } from 'vitest';
import { pixelMinMaxRows } from '../../transforms/pixelMinMax';

describe('pixelMinMaxRows', () => {
  it('returns the input unchanged when row count <= 2 * pixelWidth', () => {
    const rows = [
      { x: 0, y: 0 },
      { x: 1, y: 5 },
      { x: 2, y: 3 },
    ];
    const out = pixelMinMaxRows(rows, (r) => r.x, (r) => r.y, { pixelWidth: 2 });
    expect(out).toEqual(rows);
  });

  it('always keeps the first and last rows', () => {
    const rows = Array.from({ length: 500 }, (_, i) => ({ x: i, y: Math.random() }));
    const out = pixelMinMaxRows(rows, (r) => r.x, (r) => r.y, { pixelWidth: 50 });
    expect(out[0]).toBe(rows[0]);
    expect(out[out.length - 1]).toBe(rows[rows.length - 1]);
  });

  it('preserves both a peak and a trough inside a single pixel bucket', () => {
    // 100 rows spread over x=[0,99], with a spike at i=50 and a dip at i=51.
    const rows: { x: number; y: number }[] = [];
    for (let i = 0; i < 100; i++) {
      let y = 5;
      if (i === 50) y = 1000; // peak
      if (i === 51) y = -1000; // trough
      rows.push({ x: i, y });
    }
    // pixelWidth = 10 => each bucket covers ~10 x units, so i=50 and i=51
    // land in the same bucket. Both extremes should survive.
    const out = pixelMinMaxRows(rows, (r) => r.x, (r) => r.y, { pixelWidth: 10 });
    const ys = out.map((r) => r.y);
    expect(ys).toContain(1000);
    expect(ys).toContain(-1000);
  });

  it('emits at most 2 * pixelWidth + 2 rows for long series', () => {
    const rows = Array.from({ length: 10000 }, (_, i) => ({ x: i, y: Math.sin(i / 100) }));
    const pixelWidth = 100;
    const out = pixelMinMaxRows(rows, (r) => r.x, (r) => r.y, { pixelWidth });
    expect(out.length).toBeLessThanOrEqual(2 * pixelWidth + 2);
  });

  it('bails to passthrough on degenerate x distribution', () => {
    const rows = Array.from({ length: 200 }, () => ({ x: 42, y: Math.random() }));
    const out = pixelMinMaxRows(rows, (r) => r.x, (r) => r.y, { pixelWidth: 20 });
    expect(out).toEqual(rows);
  });
});
