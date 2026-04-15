import { describe, it, expect } from 'vitest';
import { aggregateBinRows } from '../../transforms/aggregateBin';

describe('aggregateBinRows', () => {
  it('passes through when row count <= targetPoints', () => {
    const rows = [
      { x: 0, y: 1 },
      { x: 1, y: 2 },
    ];
    const out = aggregateBinRows(rows, {
      targetPoints: 10,
      xField: 'x',
      yField: 'y',
      aggregate: 'avg',
    });
    expect(out).toEqual(rows);
  });

  it('averages rows into the requested number of bins', () => {
    const rows = [];
    for (let i = 0; i < 100; i++) rows.push({ x: i, y: i });
    const out = aggregateBinRows(rows, {
      targetPoints: 10,
      xField: 'x',
      yField: 'y',
      aggregate: 'avg',
    });
    expect(out.length).toBeLessThanOrEqual(10);
    // Average of the first bin (rows 0..9) should be ~4.5
    const firstY = out[0]?.y as number;
    expect(firstY).toBeGreaterThan(3);
    expect(firstY).toBeLessThan(6);
  });

  it('sums rows when aggregate=sum', () => {
    const rows = [];
    for (let i = 0; i < 20; i++) rows.push({ x: i, y: 2 });
    const out = aggregateBinRows(rows, {
      targetPoints: 4,
      xField: 'x',
      yField: 'y',
      aggregate: 'sum',
    });
    // 20 rows / 4 bins = 5 per bin, each bin sum ~ 5 * 2 = 10
    for (const bin of out) {
      expect(bin.y).toBe(10);
    }
  });

  it('respects min/max aggregates', () => {
    const rows = [];
    for (let i = 0; i < 20; i++) rows.push({ x: i, y: i });
    const outMin = aggregateBinRows(rows, {
      targetPoints: 4,
      xField: 'x',
      yField: 'y',
      aggregate: 'min',
    });
    const outMax = aggregateBinRows(rows, {
      targetPoints: 4,
      xField: 'x',
      yField: 'y',
      aggregate: 'max',
    });
    expect(outMin[0]?.y).toBe(0);
    expect(outMax[0]?.y).toBeGreaterThanOrEqual(4);
  });

  it('bails to passthrough on degenerate x', () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({ x: 10, y: i }));
    const out = aggregateBinRows(rows, {
      targetPoints: 5,
      xField: 'x',
      yField: 'y',
    });
    expect(out).toEqual(rows);
  });
});
