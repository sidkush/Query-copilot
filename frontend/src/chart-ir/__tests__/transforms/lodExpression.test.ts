/**
 * Tests for LOD expression engine.
 *
 * Uses a realistic sales dataset to verify FIXED / INCLUDE / EXCLUDE
 * LOD expressions produce correct results, matching the expected SQL
 * window function equivalents.
 */
import { describe, it, expect } from 'vitest';
import {
  executeLodExpression,
  executeLodPipeline,
  resolvePartitionDimensions,
  fixed,
  include,
  exclude,
  total,
  percentOfTotal,
  indexToAverage,
} from '../../transforms/lodExpression';
import type { LodExpression, LodContext } from '../../transforms/lodExpression';

// ── Test dataset ────────────────────────────────────────────────────────────
// Simulates: SELECT Region, Month, Product, Sales FROM orders
const SALES_DATA = [
  { Region: 'East', Month: 'Jan', Product: 'A', Sales: 100 },
  { Region: 'East', Month: 'Jan', Product: 'B', Sales: 150 },
  { Region: 'East', Month: 'Feb', Product: 'A', Sales: 120 },
  { Region: 'East', Month: 'Feb', Product: 'B', Sales: 180 },
  { Region: 'West', Month: 'Jan', Product: 'A', Sales: 200 },
  { Region: 'West', Month: 'Jan', Product: 'B', Sales: 250 },
  { Region: 'West', Month: 'Feb', Product: 'A', Sales: 220 },
  { Region: 'West', Month: 'Feb', Product: 'B', Sales: 280 },
];

// ── resolvePartitionDimensions ──────────────────────────────────────────────

describe('resolvePartitionDimensions', () => {
  const ctx: LodContext = { viewDimensions: ['Region', 'Month'] };

  it('FIXED uses only expression dimensions', () => {
    const expr = fixed(['Region'], 'Sales', 'sum', 'x');
    expect(resolvePartitionDimensions(expr, ctx)).toEqual(['Region']);
  });

  it('FIXED with empty dims = grand total', () => {
    const expr = total('Sales', 'sum', 'x');
    expect(resolvePartitionDimensions(expr, ctx)).toEqual([]);
  });

  it('INCLUDE adds dimensions to view', () => {
    const expr = include(['Product'], 'Sales', 'avg', 'x');
    const dims = resolvePartitionDimensions(expr, ctx);
    expect(dims).toContain('Region');
    expect(dims).toContain('Month');
    expect(dims).toContain('Product');
    expect(dims).toHaveLength(3);
  });

  it('INCLUDE does not duplicate existing view dims', () => {
    const expr = include(['Region'], 'Sales', 'avg', 'x');
    const dims = resolvePartitionDimensions(expr, ctx);
    expect(dims).toEqual(['Region', 'Month']);
  });

  it('EXCLUDE removes dimensions from view', () => {
    const expr = exclude(['Month'], 'Sales', 'avg', 'x');
    expect(resolvePartitionDimensions(expr, ctx)).toEqual(['Region']);
  });

  it('EXCLUDE with non-existent dim is a no-op', () => {
    const expr = exclude(['Product'], 'Sales', 'avg', 'x');
    expect(resolvePartitionDimensions(expr, ctx)).toEqual(['Region', 'Month']);
  });
});

// ── FIXED LOD ───────────────────────────────────────────────────────────────

describe('FIXED LOD expressions', () => {
  it('FIXED [Region] : SUM([Sales]) — region totals', () => {
    // SQL: SUM(Sales) OVER (PARTITION BY Region)
    const expr = fixed(['Region'], 'Sales', 'sum', 'region_total');
    const result = executeLodExpression(SALES_DATA, expr);

    // East total: 100 + 150 + 120 + 180 = 550
    // West total: 200 + 250 + 220 + 280 = 950
    const eastRows = result.filter(r => r.Region === 'East');
    const westRows = result.filter(r => r.Region === 'West');
    expect(eastRows.every(r => r.region_total === 550)).toBe(true);
    expect(westRows.every(r => r.region_total === 950)).toBe(true);
  });

  it('FIXED [Region, Month] : AVG([Sales]) — region-month averages', () => {
    const expr = fixed(['Region', 'Month'], 'Sales', 'avg', 'rm_avg');
    const result = executeLodExpression(SALES_DATA, expr);

    // East Jan: (100 + 150) / 2 = 125
    const eastJan = result.filter(r => r.Region === 'East' && r.Month === 'Jan');
    expect(eastJan[0].rm_avg).toBe(125);

    // West Feb: (220 + 280) / 2 = 250
    const westFeb = result.filter(r => r.Region === 'West' && r.Month === 'Feb');
    expect(westFeb[0].rm_avg).toBe(250);
  });

  it('FIXED : SUM([Sales]) — grand total (no dims)', () => {
    // SQL: SUM(Sales) OVER ()
    const expr = total('Sales', 'sum', 'grand_total');
    const result = executeLodExpression(SALES_DATA, expr);

    const grandTotal = 100 + 150 + 120 + 180 + 200 + 250 + 220 + 280; // 1500
    expect(result.every(r => r.grand_total === grandTotal)).toBe(true);
  });

  it('FIXED [Region] : COUNT([Sales])', () => {
    const expr = fixed(['Region'], 'Sales', 'count', 'region_count');
    const result = executeLodExpression(SALES_DATA, expr);

    expect(result.filter(r => r.Region === 'East').every(r => r.region_count === 4)).toBe(true);
    expect(result.filter(r => r.Region === 'West').every(r => r.region_count === 4)).toBe(true);
  });

  it('FIXED [Region] : MIN([Sales])', () => {
    const expr = fixed(['Region'], 'Sales', 'min', 'region_min');
    const result = executeLodExpression(SALES_DATA, expr);

    expect(result.filter(r => r.Region === 'East')[0].region_min).toBe(100);
    expect(result.filter(r => r.Region === 'West')[0].region_min).toBe(200);
  });

  it('FIXED [Region] : MAX([Sales])', () => {
    const expr = fixed(['Region'], 'Sales', 'max', 'region_max');
    const result = executeLodExpression(SALES_DATA, expr);

    expect(result.filter(r => r.Region === 'East')[0].region_max).toBe(180);
    expect(result.filter(r => r.Region === 'West')[0].region_max).toBe(280);
  });

  it('FIXED [Product] : MEDIAN([Sales])', () => {
    const expr = fixed(['Product'], 'Sales', 'median', 'product_median');
    const result = executeLodExpression(SALES_DATA, expr);

    // Product A: [100, 120, 200, 220] → median = (120 + 200) / 2 = 160
    // Product B: [150, 180, 250, 280] → median = (180 + 250) / 2 = 215
    expect(result.filter(r => r.Product === 'A')[0].product_median).toBe(160);
    expect(result.filter(r => r.Product === 'B')[0].product_median).toBe(215);
  });
});

// ── INCLUDE LOD ─────────────────────────────────────────────────────────────

describe('INCLUDE LOD expressions', () => {
  const ctx: LodContext = { viewDimensions: ['Region'] };

  it('INCLUDE [Month] : SUM([Sales]) with view=[Region]', () => {
    // Effective partition: Region + Month
    // SQL: SUM(Sales) OVER (PARTITION BY Region, Month)
    const expr = include(['Month'], 'Sales', 'sum', 'region_month_sum');
    const result = executeLodExpression(SALES_DATA, expr, ctx);

    // East Jan: 100 + 150 = 250
    const eastJan = result.filter(r => r.Region === 'East' && r.Month === 'Jan');
    expect(eastJan.every(r => r.region_month_sum === 250)).toBe(true);

    // West Feb: 220 + 280 = 500
    const westFeb = result.filter(r => r.Region === 'West' && r.Month === 'Feb');
    expect(westFeb.every(r => r.region_month_sum === 500)).toBe(true);
  });

  it('INCLUDE [Month, Product] : AVG([Sales]) with view=[Region]', () => {
    // Effective partition: Region + Month + Product
    // Each group has exactly one row in this dataset.
    const expr = include(['Month', 'Product'], 'Sales', 'avg', 'detail_avg');
    const result = executeLodExpression(SALES_DATA, expr, ctx);

    // Each row is its own group, so avg = the row's Sales.
    expect(result[0].detail_avg).toBe(100);
    expect(result[4].detail_avg).toBe(200);
  });
});

// ── EXCLUDE LOD ─────────────────────────────────────────────────────────────

describe('EXCLUDE LOD expressions', () => {
  const ctx: LodContext = { viewDimensions: ['Region', 'Month'] };

  it('EXCLUDE [Month] : AVG([Sales]) with view=[Region, Month]', () => {
    // Effective partition: Region (Month removed)
    // SQL: AVG(Sales) OVER (PARTITION BY Region)
    const expr = exclude(['Month'], 'Sales', 'avg', 'region_avg');
    const result = executeLodExpression(SALES_DATA, expr, ctx);

    // East avg: 550 / 4 = 137.5
    // West avg: 950 / 4 = 237.5
    expect(result.filter(r => r.Region === 'East')[0].region_avg).toBe(137.5);
    expect(result.filter(r => r.Region === 'West')[0].region_avg).toBe(237.5);
  });

  it('EXCLUDE [Region, Month] : SUM([Sales]) — becomes grand total', () => {
    // Remove all view dims → partition by nothing → grand total
    const expr = exclude(['Region', 'Month'], 'Sales', 'sum', 'total');
    const result = executeLodExpression(SALES_DATA, expr, ctx);

    expect(result.every(r => r.total === 1500)).toBe(true);
  });
});

// ── Pipeline ────────────────────────────────────────────────────────────────

describe('executeLodPipeline', () => {
  it('chains FIXED total + per-row ratio', () => {
    const expressions: LodExpression[] = [
      total('Sales', 'sum', 'grand_total'),
      fixed(['Region'], 'Sales', 'sum', 'region_total'),
    ];
    const result = executeLodPipeline(SALES_DATA, expressions);

    expect(result[0].grand_total).toBe(1500);
    expect(result[0].region_total).toBe(550); // East
    expect(result[4].region_total).toBe(950); // West
  });
});

// ── Derived calculations ────────────────────────────────────────────────────

describe('percentOfTotal', () => {
  it('computes global percent of total', () => {
    const result = percentOfTotal(SALES_DATA, 'Sales', 'pct');
    // Row 0: Sales=100, total=1500 → 100/1500 ≈ 0.0667
    expect(result[0].pct).toBeCloseTo(100 / 1500, 10);
    // All percents should sum to ~1.0
    const sumPct = result.reduce((s, r) => s + (r.pct as number), 0);
    expect(sumPct).toBeCloseTo(1.0, 10);
  });

  it('computes percent of total within Region', () => {
    const result = percentOfTotal(SALES_DATA, 'Sales', 'pct', ['Region']);

    // East row 0: 100 / 550 ≈ 0.1818
    const eastRow = result.find(r => r.Region === 'East' && r.Product === 'A' && r.Month === 'Jan');
    expect(eastRow!.pct).toBeCloseTo(100 / 550, 10);

    // East percents should sum to ~1.0
    const eastPct = result
      .filter(r => r.Region === 'East')
      .reduce((s, r) => s + (r.pct as number), 0);
    expect(eastPct).toBeCloseTo(1.0, 10);
  });
});

describe('indexToAverage', () => {
  it('computes ratio to global average', () => {
    const result = indexToAverage(SALES_DATA, 'Sales', 'idx');
    // Global avg: 1500 / 8 = 187.5
    // Row 0 (Sales=100): 100 / 187.5 ≈ 0.5333
    expect(result[0].idx).toBeCloseTo(100 / 187.5, 10);
  });

  it('computes ratio to region average', () => {
    const result = indexToAverage(SALES_DATA, 'Sales', 'idx', ['Region']);
    // East avg: 137.5. Row 0 (Sales=100): 100 / 137.5 ≈ 0.7273
    const eastRow = result.find(r => r.Region === 'East' && r.Product === 'A' && r.Month === 'Jan');
    expect(eastRow!.idx).toBeCloseTo(100 / 137.5, 10);
  });
});

// ── Edge cases ──────────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('handles empty dataset', () => {
    const result = executeLodExpression([], fixed(['R'], 'S', 'sum', 'x'));
    expect(result).toEqual([]);
  });

  it('handles single row', () => {
    const data = [{ Region: 'East', Sales: 100 }];
    const result = executeLodExpression(data, fixed(['Region'], 'Sales', 'sum', 'total'));
    expect(result[0].total).toBe(100);
  });

  it('handles null/undefined measure values', () => {
    const data = [
      { Region: 'East', Sales: 100 },
      { Region: 'East', Sales: null },
      { Region: 'East', Sales: undefined },
    ];
    const result = executeLodExpression(
      data,
      fixed(['Region'], 'Sales', 'sum', 'total'),
    );
    // null and undefined parse to NaN, which is skipped.
    expect(result[0].total).toBe(100);
  });

  it('handles null dimension values', () => {
    const data = [
      { Region: null, Sales: 100 },
      { Region: null, Sales: 200 },
      { Region: 'East', Sales: 50 },
    ];
    const result = executeLodExpression(
      data,
      fixed(['Region'], 'Sales', 'sum', 'total'),
    );
    expect(result[0].total).toBe(300); // null group
    expect(result[2].total).toBe(50);
  });

  it('count_distinct works', () => {
    const data = [
      { Region: 'East', Product: 'A' },
      { Region: 'East', Product: 'A' },
      { Region: 'East', Product: 'B' },
      { Region: 'West', Product: 'C' },
    ];
    const result = executeLodExpression(
      data,
      fixed(['Region'], 'Product', 'count_distinct', 'distinct_products'),
    );
    expect(result[0].distinct_products).toBe(2); // East: A, B
    expect(result[3].distinct_products).toBe(1); // West: C
  });

  it('does not mutate original rows', () => {
    const original = SALES_DATA.map(r => ({ ...r }));
    executeLodExpression(SALES_DATA, fixed(['Region'], 'Sales', 'sum', 'total'));
    expect(SALES_DATA).toEqual(original);
  });
});
