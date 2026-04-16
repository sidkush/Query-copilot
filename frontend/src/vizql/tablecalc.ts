/**
 * Table Calculation Engine — post-aggregation computations.
 *
 * Table calcs run AFTER SQL aggregation, on the result set in memory.
 * They use partition/address semantics:
 *   - partition: dimensions that define independent calculation groups
 *   - address: dimensions that define the direction of computation
 *
 * This matches Tableau's "Compute Using" model.
 *
 * Each calc type is a pure function: (values[], partition context) → computed[]
 */

type Row = Record<string, unknown>;

export type TableCalcType =
  | 'running_sum' | 'running_avg' | 'running_min' | 'running_max'
  | 'pct_of_total' | 'pct_difference' | 'difference'
  | 'moving_avg' | 'moving_sum'
  | 'rank' | 'dense_rank' | 'percentile'
  | 'pct_change'
  | 'index' | 'first' | 'last'
  | 'window_sum' | 'window_avg' | 'window_min' | 'window_max'
  // ── New: Tableau-parity additions ──
  | 'running_count' | 'running_product'
  | 'window_median' | 'window_stdev' | 'window_var'
  | 'lag' | 'lead'
  | 'year_over_year' | 'zscore' | 'cumulative_pct';

export interface TableCalcDef {
  type: TableCalcType;
  /** Source field to compute on */
  field: string;
  /** Result field name */
  as: string;
  /** Fields that define independent calculation groups */
  partition?: string[];
  /** Sort order within each partition */
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  /** Window size for moving calculations */
  windowSize?: number;
}

// ── Partitioning ────────────────────────────────────────────

function partitionRows(
  rows: Row[],
  partitionFields: string[],
): Map<string, Row[]> {
  if (partitionFields.length === 0) {
    return new Map([['__all__', rows]]);
  }

  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const key = partitionFields.map(f => String(row[f] ?? '')).join('|');
    let g = groups.get(key);
    if (!g) { g = []; groups.set(key, g); }
    g.push(row);
  }
  return groups;
}

function sortPartition(rows: Row[], sortBy: string, order: 'asc' | 'desc'): Row[] {
  const sorted = [...rows];
  const dir = order === 'desc' ? -1 : 1;
  sorted.sort((a, b) => {
    const av = a[sortBy], bv = b[sortBy];
    if (typeof av === 'string' && typeof bv === 'string') return av.localeCompare(bv) * dir;
    return (Number(av) - Number(bv)) * dir;
  });
  return sorted;
}

// ── Calculation Functions ───────────────────────────────────

function runningSum(values: number[]): number[] {
  const result = new Array(values.length);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    result[i] = sum;
  }
  return result;
}

function runningAvg(values: number[]): number[] {
  const result = new Array(values.length);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    result[i] = sum / (i + 1);
  }
  return result;
}

function runningMin(values: number[]): number[] {
  const result = new Array(values.length);
  let min = Infinity;
  for (let i = 0; i < values.length; i++) {
    if (values[i] < min) min = values[i];
    result[i] = min;
  }
  return result;
}

function runningMax(values: number[]): number[] {
  const result = new Array(values.length);
  let max = -Infinity;
  for (let i = 0; i < values.length; i++) {
    if (values[i] > max) max = values[i];
    result[i] = max;
  }
  return result;
}

function pctOfTotal(values: number[]): number[] {
  const total = values.reduce((s, v) => s + v, 0);
  return total === 0 ? values.map(() => 0) : values.map(v => (v / total) * 100);
}

function difference(values: number[]): number[] {
  return values.map((v, i) => i === 0 ? 0 : v - values[i - 1]);
}

function pctDifference(values: number[]): number[] {
  return values.map((v, i) => {
    if (i === 0 || values[i - 1] === 0) return 0;
    return ((v - values[i - 1]) / Math.abs(values[i - 1])) * 100;
  });
}

function pctChange(values: number[]): number[] {
  return pctDifference(values); // same computation
}

function movingAvg(values: number[], windowSize: number): number[] {
  const result = new Array(values.length);
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - windowSize + 1);
    let sum = 0, count = 0;
    for (let j = start; j <= i; j++) { sum += values[j]; count++; }
    result[i] = sum / count;
  }
  return result;
}

function movingSum(values: number[], windowSize: number): number[] {
  const result = new Array(values.length);
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - windowSize + 1);
    let sum = 0;
    for (let j = start; j <= i; j++) sum += values[j];
    result[i] = sum;
  }
  return result;
}

function rank(values: number[]): number[] {
  const indexed = values.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => b.v - a.v); // descending
  const result = new Array(values.length);
  for (let r = 0; r < indexed.length; r++) {
    result[indexed[r].i] = r + 1;
  }
  return result;
}

function denseRank(values: number[]): number[] {
  const unique = [...new Set(values)].sort((a, b) => b - a);
  const rankMap = new Map<number, number>();
  unique.forEach((v, i) => rankMap.set(v, i + 1));
  return values.map(v => rankMap.get(v) ?? 0);
}

function percentile(values: number[]): number[] {
  const n = values.length;
  const ranks = rank(values);
  return ranks.map(r => ((n - r) / (n - 1)) * 100);
}

function indexCalc(values: number[]): number[] {
  if (values.length === 0 || values[0] === 0) return values.map(() => 0);
  const base = values[0];
  return values.map(v => (v / base) * 100);
}

function firstCalc(values: number[]): number[] {
  return values.map(() => values[0] ?? 0);
}

function lastCalc(values: number[]): number[] {
  return values.map(() => values[values.length - 1] ?? 0);
}

function windowSum(values: number[], windowSize: number): number[] {
  return movingSum(values, windowSize);
}

function windowAvg(values: number[], windowSize: number): number[] {
  return movingAvg(values, windowSize);
}

function windowMin(values: number[], windowSize: number): number[] {
  const result = new Array(values.length);
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - windowSize + 1);
    let min = Infinity;
    for (let j = start; j <= i; j++) if (values[j] < min) min = values[j];
    result[i] = min;
  }
  return result;
}

function windowMax(values: number[], windowSize: number): number[] {
  const result = new Array(values.length);
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - windowSize + 1);
    let max = -Infinity;
    for (let j = start; j <= i; j++) if (values[j] > max) max = values[j];
    result[i] = max;
  }
  return result;
}

// ── New calculation functions (Tableau parity) ─────────────

function runningCount(values: number[]): number[] {
  return values.map((_, i) => i + 1);
}

function runningProduct(values: number[]): number[] {
  const result = new Array(values.length);
  let prod = 1;
  for (let i = 0; i < values.length; i++) {
    prod *= values[i];
    result[i] = prod;
  }
  return result;
}

function windowMedian(values: number[], windowSize: number): number[] {
  const result = new Array(values.length);
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - windowSize + 1);
    const win = values.slice(start, i + 1).sort((a, b) => a - b);
    const mid = Math.floor(win.length / 2);
    result[i] = win.length % 2 === 0 ? (win[mid - 1] + win[mid]) / 2 : win[mid];
  }
  return result;
}

function windowStdev(values: number[], windowSize: number): number[] {
  const result = new Array(values.length);
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - windowSize + 1);
    const win = values.slice(start, i + 1);
    const mean = win.reduce((s, v) => s + v, 0) / win.length;
    const variance = win.reduce((s, v) => s + (v - mean) ** 2, 0) / win.length;
    result[i] = Math.sqrt(variance);
  }
  return result;
}

function windowVar(values: number[], windowSize: number): number[] {
  const result = new Array(values.length);
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - windowSize + 1);
    const win = values.slice(start, i + 1);
    const mean = win.reduce((s, v) => s + v, 0) / win.length;
    result[i] = win.reduce((s, v) => s + (v - mean) ** 2, 0) / win.length;
  }
  return result;
}

function lag(values: number[], offset: number): number[] {
  const n = offset ?? 1;
  return values.map((_, i) => i >= n ? values[i - n] : 0);
}

function lead(values: number[], offset: number): number[] {
  const n = offset ?? 1;
  return values.map((_, i) => i + n < values.length ? values[i + n] : 0);
}

function yearOverYear(values: number[]): number[] {
  // Assumes data sorted by time with 12 periods per year
  return values.map((v, i) => {
    if (i < 12 || values[i - 12] === 0) return 0;
    return ((v - values[i - 12]) / Math.abs(values[i - 12])) * 100;
  });
}

function zscore(values: number[]): number[] {
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  const sd = Math.sqrt(variance);
  return sd === 0 ? values.map(() => 0) : values.map(v => (v - mean) / sd);
}

function cumulativePct(values: number[]): number[] {
  const total = values.reduce((s, v) => s + v, 0);
  if (total === 0) return values.map(() => 0);
  let cum = 0;
  return values.map(v => { cum += v; return (cum / total) * 100; });
}

// ── Dispatcher ──────────────────────────────────────────────

const CALC_FNS: Record<string, (values: number[], windowSize?: number) => number[]> = {
  running_sum: runningSum,
  running_avg: runningAvg,
  running_min: runningMin,
  running_max: runningMax,
  running_count: runningCount,
  running_product: runningProduct,
  pct_of_total: pctOfTotal,
  difference,
  pct_difference: pctDifference,
  pct_change: pctChange,
  moving_avg: (v, w) => movingAvg(v, w ?? 3),
  moving_sum: (v, w) => movingSum(v, w ?? 3),
  rank,
  dense_rank: denseRank,
  percentile,
  index: indexCalc,
  first: firstCalc,
  last: lastCalc,
  window_sum: (v, w) => windowSum(v, w ?? 5),
  window_avg: (v, w) => windowAvg(v, w ?? 5),
  window_min: (v, w) => windowMin(v, w ?? 5),
  window_max: (v, w) => windowMax(v, w ?? 5),
  window_median: (v, w) => windowMedian(v, w ?? 5),
  window_stdev: (v, w) => windowStdev(v, w ?? 5),
  window_var: (v, w) => windowVar(v, w ?? 5),
  lag: (v, w) => lag(v, w ?? 1),
  lead: (v, w) => lead(v, w ?? 1),
  year_over_year: yearOverYear,
  zscore,
  cumulative_pct: cumulativePct,
};

/**
 * Apply a table calculation to aggregated rows.
 *
 * @param rows Aggregated data rows (already GROUP BY'd)
 * @param calc Table calculation definition
 * @returns Rows with the computed field added
 */
export function applyTableCalc(rows: Row[], calc: TableCalcDef): Row[] {
  const fn = CALC_FNS[calc.type];
  if (!fn) return rows;

  const partitions = partitionRows(rows, calc.partition ?? []);
  const result: Row[] = [];

  for (const [, partRows] of partitions) {
    // Sort within partition if specified
    const sorted = calc.sortBy
      ? sortPartition(partRows, calc.sortBy, calc.sortOrder ?? 'asc')
      : partRows;

    // Extract numeric values
    const values = sorted.map(r => Number(r[calc.field] ?? 0));

    // Compute
    const computed = fn(values, calc.windowSize);

    // Write results back
    for (let i = 0; i < sorted.length; i++) {
      result.push({ ...sorted[i], [calc.as]: computed[i] });
    }
  }

  return result;
}

/**
 * Apply multiple table calculations in sequence.
 */
export function applyTableCalcs(rows: Row[], calcs: TableCalcDef[]): Row[] {
  let result = rows;
  for (const calc of calcs) {
    result = applyTableCalc(result, calc);
  }
  return result;
}
