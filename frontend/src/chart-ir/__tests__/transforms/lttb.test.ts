import { describe, it, expect } from 'vitest';
import { lttb, uniformSample, lttbRows, type Point } from '../../transforms/lttb';

describe('lttb', () => {
  it('returns the input unchanged when targetPoints >= points.length', () => {
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
    ];
    expect(lttb(points, 5)).toEqual(points);
    expect(lttb(points, 3)).toEqual(points);
  });

  it('returns the input unchanged when targetPoints < 3 (degenerate)', () => {
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 3 },
    ];
    expect(lttb(points, 2)).toEqual(points);
    expect(lttb(points, 0)).toEqual(points);
  });

  it('always keeps the first and last points', () => {
    const points: Point[] = Array.from({ length: 100 }, (_, i) => ({
      x: i,
      y: Math.sin(i / 10),
    }));
    const downsampled = lttb(points, 10);
    expect(downsampled[0]).toEqual(points[0]);
    expect(downsampled[downsampled.length - 1]).toEqual(points[points.length - 1]);
  });

  it('returns exactly targetPoints entries for non-degenerate inputs', () => {
    const points: Point[] = Array.from({ length: 500 }, (_, i) => ({
      x: i,
      y: Math.random(),
    }));
    const downsampled = lttb(points, 50);
    expect(downsampled).toHaveLength(50);
  });

  it('preserves the peak of a sharp spike in a noisy series', () => {
    // Construct a noisy series with one extreme peak at index 250.
    const points: Point[] = Array.from({ length: 500 }, (_, i) => ({
      x: i,
      y: i === 250 ? 1000 : Math.random() * 10,
    }));
    const downsampled = lttb(points, 50);
    // LTTB should retain the peak because it maximizes the triangle area.
    const peakY = Math.max(...downsampled.map((p) => p.y));
    expect(peakY).toBe(1000);
  });
});

describe('uniformSample', () => {
  it('passes through when targetPoints >= length', () => {
    const arr = [1, 2, 3, 4];
    expect(uniformSample(arr, 10)).toEqual(arr);
  });

  it('returns a deterministic every-Nth subset', () => {
    const arr = Array.from({ length: 100 }, (_, i) => i);
    const sampled = uniformSample(arr, 10);
    // First element kept, stride ~10, last element kept.
    expect(sampled[0]).toBe(0);
    expect(sampled[sampled.length - 1]).toBe(99);
    expect(sampled.length).toBeLessThanOrEqual(10);
  });

  it('keeps the last element even when stride would skip it', () => {
    const arr = Array.from({ length: 101 }, (_, i) => i);
    const sampled = uniformSample(arr, 10);
    expect(sampled[sampled.length - 1]).toBe(100);
  });
});

describe('lttbRows', () => {
  it('returns a subset of the original row objects', () => {
    const rows = Array.from({ length: 200 }, (_, i) => ({
      date: i,
      revenue: Math.sin(i / 20) * 100,
    }));
    const downsampled = lttbRows(
      rows,
      (r) => r.date,
      (r) => r.revenue,
      20,
    );
    expect(downsampled.length).toBeLessThanOrEqual(20);
    expect(downsampled[0]).toBe(rows[0]);
    expect(downsampled[downsampled.length - 1]).toBe(rows[rows.length - 1]);
  });

  it('passes rows through when already small', () => {
    const rows = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ];
    const downsampled = lttbRows(rows, (r) => r.x, (r) => r.y, 50);
    expect(downsampled).toEqual(rows);
  });
});
