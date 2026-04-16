/**
 * Tests for table calculation engine.
 *
 * Uses a realistic time-series sales dataset to verify all table calculation
 * types produce correct results matching their SQL window function equivalents.
 */
import { describe, it, expect } from 'vitest';
import {
  executeTableCalc,
  executeTableCalcPipeline,
  resolvePartitionAddress,
  runningSum,
  rank,
  pctOfTotal,
  movingAvg,
  difference,
  pctChange,
  cumulativePct,
} from '../../transforms/tableCalc';
import type { TableCalcDef } from '../../transforms/tableCalc';

// ── Test dataset ────────────────────────────────────────────────────────────
// Monthly sales by region — 8 rows, 2 regions x 4 months.
const MONTHLY_SALES = [
  { Region: 'East', Month: '2024-01', Sales: 100 },
  { Region: 'East', Month: '2024-02', Sales: 150 },
  { Region: 'East', Month: '2024-03', Sales: 120 },
  { Region: 'East', Month: '2024-04', Sales: 180 },
  { Region: 'West', Month: '2024-01', Sales: 200 },
  { Region: 'West', Month: '2024-02', Sales: 250 },
  { Region: 'West', Month: '2024-03', Sales: 220 },
  { Region: 'West', Month: '2024-04', Sales: 280 },
];

// ── resolvePartitionAddress ─────────────────────────────────────────────────

describe('resolvePartitionAddress', () => {
  it('compute using one field = that field is address, rest partition', () => {
    const { partitionBy, orderBy } = resolvePartitionAddress(
      ['Region', 'Month', 'Product'],
      ['Month'],
    );
    expect(partitionBy).toEqual(['Region', 'Product']);
    expect(orderBy).toBe('Month');
  });

  it('compute using multiple fields', () => {
    const { partitionBy, orderBy } = resolvePartitionAddress(
      ['Region', 'Month', 'Product'],
      ['Month', 'Product'],
    );
    expect(partitionBy).toEqual(['Region']);
    expect(orderBy).toBe('Month');
  });

  it('empty compute using = everything is partition', () => {
    const { partitionBy, orderBy } = resolvePartitionAddress(
      ['Region', 'Month'],
      [],
    );
    expect(partitionBy).toEqual(['Region', 'Month']);
    expect(orderBy).toBeUndefined();
  });
});

// ── Running sum ─────────────────────────────────────────────────────────────

describe('running_sum', () => {
  it('cumulative sum within each Region partition, ordered by Month', () => {
    // SQL: SUM(Sales) OVER (PARTITION BY Region ORDER BY Month
    //       ROWS UNBOUNDED PRECEDING)
    const def = runningSum('Sales', 'cum_sales', ['Region'], 'Month');
    const result = executeTableCalc(MONTHLY_SALES, def);

    // East: 100, 250, 370, 550
    const east = result.filter(r => r.Region === 'East').map(r => r.cum_sales);
    expect(east).toEqual([100, 250, 370, 550]);

    // West: 200, 450, 670, 950
    const west = result.filter(r => r.Region === 'West').map(r => r.cum_sales);
    expect(west).toEqual([200, 450, 670, 950]);
  });

  it('grand running sum (no partition)', () => {
    const def = runningSum('Sales', 'cum', [], 'Month');
    const result = executeTableCalc(MONTHLY_SALES, def);
    // Without partitioning, all 8 rows are in one group.
    // Sorted by Month, East/West interleave depends on stable sort.
    const last = result[result.length - 1].cum as number;
    expect(last).toBe(1500); // sum of all
  });
});

// ── Running avg ─────────────────────────────────────────────────────────────

describe('running_avg', () => {
  it('cumulative average within each Region', () => {
    const def: TableCalcDef = {
      type: 'running_avg', measure: 'Sales', as: 'cum_avg',
      partitionBy: ['Region'], orderBy: 'Month',
    };
    const result = executeTableCalc(MONTHLY_SALES, def);

    const east = result.filter(r => r.Region === 'East').map(r => r.cum_avg);
    // East: 100/1, 250/2, 370/3, 550/4
    expect(east[0]).toBeCloseTo(100, 10);
    expect(east[1]).toBeCloseTo(125, 10);
    expect(east[2]).toBeCloseTo(370 / 3, 10);
    expect(east[3]).toBeCloseTo(137.5, 10);
  });
});

// ── Running min / max ───────────────────────────────────────────────────────

describe('running_min / running_max', () => {
  it('tracks minimum within partition', () => {
    const def: TableCalcDef = {
      type: 'running_min', measure: 'Sales', as: 'cum_min',
      partitionBy: ['Region'], orderBy: 'Month',
    };
    const result = executeTableCalc(MONTHLY_SALES, def);
    const east = result.filter(r => r.Region === 'East').map(r => r.cum_min);
    // East sales: 100, 150, 120, 180 → running min: 100, 100, 100, 100
    expect(east).toEqual([100, 100, 100, 100]);
  });

  it('tracks maximum within partition', () => {
    const def: TableCalcDef = {
      type: 'running_max', measure: 'Sales', as: 'cum_max',
      partitionBy: ['Region'], orderBy: 'Month',
    };
    const result = executeTableCalc(MONTHLY_SALES, def);
    const east = result.filter(r => r.Region === 'East').map(r => r.cum_max);
    // East sales: 100, 150, 120, 180 → running max: 100, 150, 150, 180
    expect(east).toEqual([100, 150, 150, 180]);
  });
});

// ── Rank ────────────────────────────────────────────────────────────────────

describe('rank', () => {
  it('ranks within each Region (desc = highest first)', () => {
    // SQL: RANK() OVER (PARTITION BY Region ORDER BY Sales DESC)
    const def = rank('Sales', 'sales_rank', ['Region'], 'desc');
    const result = executeTableCalc(MONTHLY_SALES, def);

    // East sales: 100, 150, 120, 180 → ranked desc: 180=1, 150=2, 120=3, 100=4
    const eastRanks = result
      .filter(r => r.Region === 'East')
      .sort((a, b) => (b.Sales as number) - (a.Sales as number))
      .map(r => r.sales_rank);
    expect(eastRanks).toEqual([1, 2, 3, 4]);
  });

  it('handles ties with standard ranking (skip)', () => {
    const data = [
      { Category: 'A', Sales: 100 },
      { Category: 'A', Sales: 200 },
      { Category: 'A', Sales: 200 },
      { Category: 'A', Sales: 300 },
    ];
    const def = rank('Sales', 'r', ['Category'], 'desc');
    const result = executeTableCalc(data, def);

    // 300=1, 200=2, 200=2, 100=4 (standard ranking skips 3)
    const sorted = result.slice().sort((a, b) => (b.Sales as number) - (a.Sales as number));
    expect(sorted.map(r => r.r)).toEqual([1, 2, 2, 4]);
  });
});

// ── Dense rank ──────────────────────────────────────────────────────────────

describe('dense_rank', () => {
  it('no gaps in ranking', () => {
    const data = [
      { Category: 'A', Sales: 100 },
      { Category: 'A', Sales: 200 },
      { Category: 'A', Sales: 200 },
      { Category: 'A', Sales: 300 },
    ];
    const def: TableCalcDef = {
      type: 'dense_rank', measure: 'Sales', as: 'dr',
      partitionBy: ['Category'], sortDirection: 'desc',
    };
    const result = executeTableCalc(data, def);

    // 300=1, 200=2, 200=2, 100=3 (no gap!)
    const sorted = result.slice().sort((a, b) => (b.Sales as number) - (a.Sales as number));
    expect(sorted.map(r => r.dr)).toEqual([1, 2, 2, 3]);
  });
});

// ── Percent of total ────────────────────────────────────────────────────────

describe('pct_of_total', () => {
  it('computes share within partition', () => {
    // SQL: Sales / SUM(Sales) OVER (PARTITION BY Region)
    const def = pctOfTotal('Sales', 'pct', ['Region']);
    const result = executeTableCalc(MONTHLY_SALES, def);

    // East total: 550
    const eastRow0 = result.find(r => r.Region === 'East' && r.Month === '2024-01');
    expect(eastRow0!.pct).toBeCloseTo(100 / 550, 10);

    // Percents within East should sum to 1.0
    const eastSum = result
      .filter(r => r.Region === 'East')
      .reduce((s, r) => s + (r.pct as number), 0);
    expect(eastSum).toBeCloseTo(1.0, 10);
  });

  it('global percent (no partition)', () => {
    const def = pctOfTotal('Sales', 'pct');
    const result = executeTableCalc(MONTHLY_SALES, def);
    const totalPct = result.reduce((s, r) => s + (r.pct as number), 0);
    expect(totalPct).toBeCloseTo(1.0, 10);
  });
});

// ── Moving average ──────────────────────────────────────────────────────────

describe('moving_avg', () => {
  it('3-period moving average within partition', () => {
    // SQL: AVG(Sales) OVER (PARTITION BY Region ORDER BY Month
    //       ROWS BETWEEN 2 PRECEDING AND CURRENT ROW)
    const def = movingAvg('Sales', 'ma3', 3, ['Region'], 'Month');
    const result = executeTableCalc(MONTHLY_SALES, def);

    const east = result.filter(r => r.Region === 'East').map(r => r.ma3);
    // Row 0: avg(100) = 100
    // Row 1: avg(100, 150) = 125
    // Row 2: avg(100, 150, 120) = 123.33...
    // Row 3: avg(150, 120, 180) = 150
    expect(east[0]).toBeCloseTo(100, 10);
    expect(east[1]).toBeCloseTo(125, 10);
    expect(east[2]).toBeCloseTo(370 / 3, 10);
    expect(east[3]).toBeCloseTo(150, 10);
  });

  it('window size 1 = identity', () => {
    const def = movingAvg('Sales', 'ma1', 1, ['Region'], 'Month');
    const result = executeTableCalc(MONTHLY_SALES, def);
    const east = result.filter(r => r.Region === 'East');
    expect(east[0].ma1).toBe(100);
    expect(east[1].ma1).toBe(150);
  });
});

// ── Difference ──────────────────────────────────────────────────────────────

describe('difference', () => {
  it('period-over-period difference within partition', () => {
    // SQL: Sales - LAG(Sales, 1) OVER (PARTITION BY Region ORDER BY Month)
    const def = difference('Sales', 'diff', ['Region'], 'Month');
    const result = executeTableCalc(MONTHLY_SALES, def);

    const east = result.filter(r => r.Region === 'East').map(r => r.diff);
    // null, 150-100=50, 120-150=-30, 180-120=60
    expect(east).toEqual([null, 50, -30, 60]);
  });

  it('offset=2 computes 2-period lag', () => {
    const def = difference('Sales', 'diff2', ['Region'], 'Month', 2);
    const result = executeTableCalc(MONTHLY_SALES, def);

    const east = result.filter(r => r.Region === 'East').map(r => r.diff2);
    // null, null, 120-100=20, 180-150=30
    expect(east).toEqual([null, null, 20, 30]);
  });
});

// ── Percent change ──────────────────────────────────────────────────────────

describe('pct_change', () => {
  it('relative change from previous period', () => {
    // SQL: (Sales - LAG(Sales, 1)) / ABS(LAG(Sales, 1))
    const def = pctChange('Sales', 'chg', ['Region'], 'Month');
    const result = executeTableCalc(MONTHLY_SALES, def);

    const east = result.filter(r => r.Region === 'East').map(r => r.chg);
    // null, (150-100)/100 = 0.5, (120-150)/150 = -0.2, (180-120)/120 = 0.5
    expect(east[0]).toBeNull();
    expect(east[1]).toBeCloseTo(0.5, 10);
    expect(east[2]).toBeCloseTo(-0.2, 10);
    expect(east[3]).toBeCloseTo(0.5, 10);
  });

  it('returns null when previous value is zero', () => {
    const data = [
      { Region: 'A', Month: '01', Sales: 0 },
      { Region: 'A', Month: '02', Sales: 100 },
    ];
    const def = pctChange('Sales', 'chg', ['Region'], 'Month');
    const result = executeTableCalc(data, def);
    expect(result[1].chg).toBeNull();
  });
});

// ── First / Last value ──────────────────────────────────────────────────────

describe('first_value / last_value', () => {
  it('first_value is constant across partition', () => {
    const def: TableCalcDef = {
      type: 'first_value', measure: 'Sales', as: 'first',
      partitionBy: ['Region'], orderBy: 'Month',
    };
    const result = executeTableCalc(MONTHLY_SALES, def);
    const east = result.filter(r => r.Region === 'East');
    expect(east.every(r => r.first === 100)).toBe(true);
  });

  it('last_value is constant across partition', () => {
    const def: TableCalcDef = {
      type: 'last_value', measure: 'Sales', as: 'last',
      partitionBy: ['Region'], orderBy: 'Month',
    };
    const result = executeTableCalc(MONTHLY_SALES, def);
    const east = result.filter(r => r.Region === 'East');
    expect(east.every(r => r.last === 180)).toBe(true);
  });
});

// ── Ntile ───────────────────────────────────────────────────────────────────

describe('ntile', () => {
  it('divides partition into 4 quartiles', () => {
    const def: TableCalcDef = {
      type: 'ntile', measure: 'Sales', as: 'quartile',
      partitionBy: ['Region'], orderBy: 'Month', ntileBuckets: 4,
    };
    const result = executeTableCalc(MONTHLY_SALES, def);
    const east = result.filter(r => r.Region === 'East').map(r => r.quartile);
    // 4 rows, 4 buckets → 1 row each → [1, 2, 3, 4]
    expect(east).toEqual([1, 2, 3, 4]);
  });

  it('handles uneven distribution', () => {
    const data = [
      { G: 'A', V: 1 }, { G: 'A', V: 2 }, { G: 'A', V: 3 },
      { G: 'A', V: 4 }, { G: 'A', V: 5 },
    ];
    const def: TableCalcDef = {
      type: 'ntile', measure: 'V', as: 'tile',
      partitionBy: ['G'], ntileBuckets: 3,
    };
    const result = executeTableCalc(data, def);
    const tiles = result.map(r => r.tile);
    // 5 rows / 3 buckets: sizes 2, 2, 1 → [1, 1, 2, 2, 3]
    expect(tiles).toEqual([1, 1, 2, 2, 3]);
  });
});

// ── Index (indexed to base) ─────────────────────────────────────────────────

describe('index', () => {
  it('computes ratio to first value', () => {
    const def: TableCalcDef = {
      type: 'index', measure: 'Sales', as: 'idx',
      partitionBy: ['Region'], orderBy: 'Month',
    };
    const result = executeTableCalc(MONTHLY_SALES, def);

    const east = result.filter(r => r.Region === 'East').map(r => r.idx);
    // Base = 100. Values: 100/100, 150/100, 120/100, 180/100
    expect(east[0]).toBeCloseTo(1.0, 10);
    expect(east[1]).toBeCloseTo(1.5, 10);
    expect(east[2]).toBeCloseTo(1.2, 10);
    expect(east[3]).toBeCloseTo(1.8, 10);
  });
});

// ── Cumulative percent ──────────────────────────────────────────────────────

describe('cumulative_pct', () => {
  it('computes running sum / total within partition (Pareto)', () => {
    const def = cumulativePct('Sales', 'cum_pct', ['Region'], 'Month');
    const result = executeTableCalc(MONTHLY_SALES, def);

    const east = result.filter(r => r.Region === 'East').map(r => r.cum_pct);
    // East total: 550
    // Cum: 100/550, 250/550, 370/550, 550/550
    expect(east[0]).toBeCloseTo(100 / 550, 10);
    expect(east[1]).toBeCloseTo(250 / 550, 10);
    expect(east[2]).toBeCloseTo(370 / 550, 10);
    expect(east[3]).toBeCloseTo(1.0, 10);
  });
});

// ── Pipeline ────────────────────────────────────────────────────────────────

describe('executeTableCalcPipeline', () => {
  it('chains multiple calcs — running sum then rank on the cumulative', () => {
    const defs: TableCalcDef[] = [
      runningSum('Sales', 'cum_sales', ['Region'], 'Month'),
      rank('cum_sales', 'cum_rank', ['Region'], 'desc'),
    ];
    const result = executeTableCalcPipeline(MONTHLY_SALES, defs);

    // East cum_sales: 100, 250, 370, 550 → ranked desc: 550=1, 370=2, 250=3, 100=4
    const eastByMonth = result
      .filter(r => r.Region === 'East')
      .sort((a, b) => (b.cum_sales as number) - (a.cum_sales as number));
    expect(eastByMonth.map(r => r.cum_rank)).toEqual([1, 2, 3, 4]);
  });
});

// ── Edge cases ──────────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('empty dataset returns empty', () => {
    const result = executeTableCalc([], runningSum('Sales', 'x'));
    expect(result).toEqual([]);
  });

  it('single row — running sum = the value', () => {
    const data = [{ Sales: 42 }];
    const result = executeTableCalc(data, runningSum('Sales', 'cum'));
    expect(result[0].cum).toBe(42);
  });

  it('single row — difference = null', () => {
    const data = [{ Sales: 42 }];
    const result = executeTableCalc(data, difference('Sales', 'diff'));
    expect(result[0].diff).toBeNull();
  });

  it('single row — pct_of_total = 1.0', () => {
    const data = [{ Sales: 42 }];
    const result = executeTableCalc(data, pctOfTotal('Sales', 'pct'));
    expect(result[0].pct).toBe(1.0);
  });

  it('does not mutate original rows', () => {
    const original = MONTHLY_SALES.map(r => ({ ...r }));
    executeTableCalc(MONTHLY_SALES, runningSum('Sales', 'cum', ['Region'], 'Month'));
    expect(MONTHLY_SALES).toEqual(original);
  });

  it('throws on unknown calc type', () => {
    const badDef = { type: 'nonexistent' as any, measure: 'Sales', as: 'x' };
    expect(() => executeTableCalc(MONTHLY_SALES, badDef)).toThrow('Unknown table calculation type');
  });
});
