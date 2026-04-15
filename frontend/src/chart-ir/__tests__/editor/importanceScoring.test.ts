import { describe, it, expect } from 'vitest';
import {
  scoreTile,
  sortByImportance,
  packIntoSlides,
  briefingGridPlacement,
} from '../../../components/dashboard/lib/importanceScoring';

describe('importanceScoring.scoreTile', () => {
  it('returns 0 for empty tiles', () => {
    expect(scoreTile(null as unknown as object)).toBe(0);
    expect(scoreTile({})).toBe(0);
    expect(scoreTile({ title: 'no data', rows: [] })).toBe(0);
  });

  it('scores legacy KPI tiles at 100', () => {
    expect(scoreTile({ chartType: 'kpi', rows: [[1]] })).toBe(100);
  });

  it('scores legacy table tiles at 30', () => {
    expect(scoreTile({ chartType: 'table', rows: [[1, 2]] })).toBe(30);
  });

  it('scores legacy chart tiles with data at 70', () => {
    expect(scoreTile({ chartType: 'bar', rows: [[1, 2]] })).toBe(70);
  });

  it('scores SQL-only tiles at 20', () => {
    expect(scoreTile({ chartType: 'bar', sql: 'SELECT 1' })).toBe(20);
  });

  it('scores new-shape tiles with a chart_spec at 70', () => {
    expect(
      scoreTile({
        id: 'a',
        chart_spec: {
          $schema: 'askdb/chart-spec/v1',
          type: 'cartesian',
          mark: 'bar',
          encoding: { x: { field: 'region', type: 'nominal' } },
        },
      }),
    ).toBe(70);
  });

  it('detects new-shape text-mark KPI tiles at 100', () => {
    expect(
      scoreTile({
        id: 'k',
        chart_spec: {
          $schema: 'askdb/chart-spec/v1',
          type: 'cartesian',
          mark: 'text',
          encoding: { text: { field: 'revenue', type: 'quantitative' } },
        },
      }),
    ).toBe(100);
  });
});

describe('importanceScoring.sortByImportance', () => {
  it('sorts descending by score with stable tie-break', () => {
    const tiles = [
      { id: 'a', chartType: 'bar', rows: [[1]] }, // 70
      { id: 'b', chartType: 'kpi', rows: [[2]] }, // 100
      { id: 'c', chartType: 'table', rows: [[3]] }, // 30
      { id: 'd', chartType: 'bar', rows: [[4]] }, // 70 (ties with a)
    ];
    const sorted = sortByImportance(tiles);
    expect(sorted.map((t: { id: string }) => t.id)).toEqual(['b', 'a', 'd', 'c']);
  });
});

describe('importanceScoring.packIntoSlides', () => {
  it('packs importance-sorted tiles into slides of at most N', () => {
    const tiles = Array.from({ length: 7 }).map((_, i) => ({
      id: `t${i}`,
      chartType: 'bar',
      rows: [[i]],
    }));
    const slides = packIntoSlides(tiles, 6);
    expect(slides).toHaveLength(2);
    expect(slides[0]).toHaveLength(6);
    expect(slides[1]).toHaveLength(1);
  });

  it('skips zero-score tiles', () => {
    const tiles = [
      { id: 'a', chartType: 'kpi', rows: [[1]] }, // 100
      { id: 'b', chartType: 'bar' }, // 0 — empty
      { id: 'c', chartType: 'bar', rows: [[2]] }, // 70
    ];
    const slides = packIntoSlides(tiles, 6);
    const firstSlide = slides[0] ?? [];
    expect(firstSlide.map((t: { id: string }) => t.id)).toEqual(['a', 'c']);
  });
});

describe('importanceScoring.briefingGridPlacement', () => {
  it('places KPIs at 3 cols, hero chart at 12 cols, subsequent charts at 6 cols, tables at 12 cols', () => {
    const tiles = [
      { id: 'k1', chartType: 'kpi', rows: [[1]] },
      { id: 'k2', chartType: 'kpi', rows: [[2]] },
      { id: 'c1', chartType: 'bar', rows: [[3]] },
      { id: 'c2', chartType: 'bar', rows: [[4]] },
      { id: 't1', chartType: 'table', rows: [[5]] },
    ];
    const placement = briefingGridPlacement(tiles);
    // Importance order: KPIs first, then charts, then tables.
    expect(placement[0]).toMatchObject({ colSpan: 3, rowHint: 'kpi' });
    expect(placement[1]).toMatchObject({ colSpan: 3, rowHint: 'kpi' });
    // First chart is hero (12 cols).
    expect(placement[2]).toMatchObject({ colSpan: 12, rowHint: 'hero' });
    // Second chart is 6 cols.
    expect(placement[3]).toMatchObject({ colSpan: 6, rowHint: 'chart' });
    // Table is full-width.
    expect(placement[4]).toMatchObject({ colSpan: 12, rowHint: 'table' });
  });

  it('returns empty array when all tiles score 0', () => {
    const placement = briefingGridPlacement([
      { id: 'a', chartType: 'bar' },
      { id: 'b', chartType: 'bar' },
    ]);
    expect(placement).toEqual([]);
  });
});
