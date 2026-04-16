/**
 * tableCalc — Table Calculation engine for the chart renderer.
 *
 * Implements Tableau-style table calculations that operate on aggregated
 * query results (not raw rows). These run AFTER all LOD expressions and
 * filters, as the last computation step before rendering.
 *
 * ── Partition / Address model ──
 *
 * Every table calculation splits the result set into two sets of dimensions:
 *
 *   Partitioning fields — define independent groups. The calculation
 *     restarts within each partition. Equivalent to SQL PARTITION BY.
 *
 *   Addressing fields — define the direction/order of computation
 *     WITHIN a partition. Equivalent to SQL ORDER BY.
 *     Tableau's "Compute Using" sets the addressing fields.
 *
 * Rule: every dimension in the view is either partitioning or addressing.
 * Partitioning = the "scope", Addressing = the "direction".
 *
 * Example — Running sum of Sales, compute using [Month]:
 *   Partition: [Region]  (one running sum per region)
 *   Address:   [Month]   (accumulate along months)
 *   SQL: SUM(Sales) OVER (PARTITION BY Region ORDER BY Month
 *         ROWS UNBOUNDED PRECEDING)
 *
 * ── SQL window function equivalents ──
 *
 * running_sum:  SUM(val) OVER (PARTITION BY ... ORDER BY ... ROWS UNBOUNDED PRECEDING)
 * running_avg:  AVG(val) OVER (PARTITION BY ... ORDER BY ... ROWS UNBOUNDED PRECEDING)
 * rank:         RANK() OVER (PARTITION BY ... ORDER BY val DESC)
 * dense_rank:   DENSE_RANK() OVER (PARTITION BY ... ORDER BY val DESC)
 * pct_of_total: val / SUM(val) OVER (PARTITION BY ...)
 * moving_avg:   AVG(val) OVER (PARTITION BY ... ORDER BY ...
 *                ROWS BETWEEN N PRECEDING AND CURRENT ROW)
 * difference:   val - LAG(val, 1) OVER (PARTITION BY ... ORDER BY ...)
 * pct_change:   (val - LAG(val, 1)) / LAG(val, 1) OVER (...)
 * running_min:  MIN(val) OVER (PARTITION BY ... ORDER BY ... ROWS UNBOUNDED PRECEDING)
 * running_max:  MAX(val) OVER (PARTITION BY ... ORDER BY ... ROWS UNBOUNDED PRECEDING)
 * first_value:  FIRST_VALUE(val) OVER (PARTITION BY ... ORDER BY ...)
 * last_value:   LAST_VALUE(val) OVER (PARTITION BY ... ORDER BY ...
 *                ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING)
 * ntile:        NTILE(N) OVER (PARTITION BY ... ORDER BY ...)
 *
 * ── Why client-side? ──
 *
 * Table calcs run on already-aggregated result sets (typically <10K rows).
 * Running them in JS avoids a round-trip to the DB and lets the chart
 * editor update them instantly when the user changes "Compute Using".
 * For >100K row result sets, these should be pushed to DuckDB/SQL.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type TableCalcType =
  | 'running_sum'
  | 'running_avg'
  | 'running_min'
  | 'running_max'
  | 'rank'
  | 'dense_rank'
  | 'pct_of_total'
  | 'moving_avg'
  | 'difference'
  | 'pct_change'
  | 'first_value'
  | 'last_value'
  | 'ntile'
  | 'index'
  | 'cumulative_pct';

export type SortDirection = 'asc' | 'desc';

/**
 * Definition of a table calculation.
 *
 * The partition/address model:
 *   - partitionBy: fields that define independent groups (PARTITION BY).
 *   - orderBy: field that defines computation direction (ORDER BY).
 *     This is what Tableau calls "Compute Using" / addressing.
 *   - sortDirection: 'asc' (default) or 'desc' for the ordering.
 *
 * Examples:
 *   Running total of Sales along Month, partitioned by Region:
 *   {
 *     type: 'running_sum', measure: 'Sales', as: 'cumulative_sales',
 *     partitionBy: ['Region'], orderBy: 'Month'
 *   }
 *
 *   Rank by Sales within each Region:
 *   {
 *     type: 'rank', measure: 'Sales', as: 'sales_rank',
 *     partitionBy: ['Region'], sortDirection: 'desc'
 *   }
 */
export interface TableCalcDef {
  /** Calculation type. */
  type: TableCalcType;
  /** Measure field to compute over. */
  measure: string;
  /** Output column name. */
  as: string;
  /** Partition dimensions — calculation restarts per group. */
  partitionBy?: string[];
  /** Ordering field — direction of computation. "Compute Using" equivalent. */
  orderBy?: string;
  /** Sort direction for ordering. Default: 'asc'. */
  sortDirection?: SortDirection;
  /** Window size for moving_avg. Default: 3. */
  windowSize?: number;
  /** Number of buckets for ntile. Default: 4 (quartiles). */
  ntileBuckets?: number;
  /** Lag/lead offset for difference/pct_change. Default: 1. */
  offset?: number;
}

// ─── Internal helpers ───────────────────────────────────────────────────────

type Row = Record<string, unknown>;

/** Build a composite key from dimension values. */
function compositeKey(row: Row, dims: string[]): string {
  if (dims.length === 0) return '__ALL__';
  if (dims.length === 1) return String(row[dims[0]] ?? '__NULL__');
  return dims.map(d => String(row[d] ?? '__NULL__')).join('\x00');
}

/**
 * Group rows by partition dimensions, preserving original indices.
 * Returns a map from partition key to array of { index, row } pairs.
 */
function partitionRows<R extends Row>(
  rows: R[],
  partitionBy: string[],
): Map<string, { index: number; row: R }[]> {
  const groups = new Map<string, { index: number; row: R }[]>();
  for (let i = 0; i < rows.length; i++) {
    const key = compositeKey(rows[i], partitionBy);
    let group = groups.get(key);
    if (!group) {
      group = [];
      groups.set(key, group);
    }
    group.push({ index: i, row: rows[i] });
  }
  return groups;
}

/**
 * Sort a partition group by the ordering field.
 * Returns a new sorted array (does not mutate).
 */
function sortGroup<R extends Row>(
  group: { index: number; row: R }[],
  orderBy: string | undefined,
  direction: SortDirection = 'asc',
): { index: number; row: R }[] {
  if (!orderBy) return group;
  const sorted = group.slice();
  const mult = direction === 'desc' ? -1 : 1;
  sorted.sort((a, b) => {
    const va = a.row[orderBy];
    const vb = b.row[orderBy];
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === 'number' && typeof vb === 'number') {
      return (va - vb) * mult;
    }
    if (typeof va === 'string' && typeof vb === 'string') {
      return va.localeCompare(vb) * mult;
    }
    // Date comparison
    const da = va instanceof Date ? va.getTime() : Number(va);
    const db = vb instanceof Date ? vb.getTime() : Number(vb);
    if (!Number.isNaN(da) && !Number.isNaN(db)) {
      return (da - db) * mult;
    }
    return String(va).localeCompare(String(vb)) * mult;
  });
  return sorted;
}

/** Safely extract numeric value from a row field. */
function num(row: Row, field: string): number {
  const v = row[field];
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}

// ─── Calculation implementations ────────────────────────────────────────────

/**
 * Running sum — cumulative sum within each partition, ordered by addressing field.
 * SQL: SUM(val) OVER (PARTITION BY ... ORDER BY ... ROWS UNBOUNDED PRECEDING)
 */
function computeRunningSum<R extends Row>(
  group: { index: number; row: R }[],
  def: TableCalcDef,
  output: (number | null)[],
): void {
  let cumSum = 0;
  for (const { index, row } of group) {
    cumSum += num(row, def.measure);
    output[index] = cumSum;
  }
}

/**
 * Running average — cumulative average within each partition.
 * SQL: AVG(val) OVER (PARTITION BY ... ORDER BY ... ROWS UNBOUNDED PRECEDING)
 */
function computeRunningAvg<R extends Row>(
  group: { index: number; row: R }[],
  def: TableCalcDef,
  output: (number | null)[],
): void {
  let cumSum = 0;
  for (let i = 0; i < group.length; i++) {
    cumSum += num(group[i].row, def.measure);
    output[group[i].index] = cumSum / (i + 1);
  }
}

/**
 * Running min — cumulative minimum within each partition.
 * SQL: MIN(val) OVER (PARTITION BY ... ORDER BY ... ROWS UNBOUNDED PRECEDING)
 */
function computeRunningMin<R extends Row>(
  group: { index: number; row: R }[],
  def: TableCalcDef,
  output: (number | null)[],
): void {
  let cumMin = Infinity;
  for (const { index, row } of group) {
    const v = num(row, def.measure);
    if (v < cumMin) cumMin = v;
    output[index] = cumMin;
  }
}

/**
 * Running max — cumulative maximum within each partition.
 * SQL: MAX(val) OVER (PARTITION BY ... ORDER BY ... ROWS UNBOUNDED PRECEDING)
 */
function computeRunningMax<R extends Row>(
  group: { index: number; row: R }[],
  def: TableCalcDef,
  output: (number | null)[],
): void {
  let cumMax = -Infinity;
  for (const { index, row } of group) {
    const v = num(row, def.measure);
    if (v > cumMax) cumMax = v;
    output[index] = cumMax;
  }
}

/**
 * Rank — standard competition ranking (1, 2, 2, 4 for ties).
 * SQL: RANK() OVER (PARTITION BY ... ORDER BY val DESC)
 *
 * Sorts by the measure (descending by default for ranking).
 */
function computeRank<R extends Row>(
  group: { index: number; row: R }[],
  def: TableCalcDef,
  output: (number | null)[],
): void {
  // Re-sort by measure for ranking (desc = highest gets rank 1).
  const rankDir = def.sortDirection ?? 'desc';
  const sorted = group.slice().sort((a, b) => {
    const va = num(a.row, def.measure);
    const vb = num(b.row, def.measure);
    return rankDir === 'desc' ? vb - va : va - vb;
  });

  let rank = 1;
  for (let i = 0; i < sorted.length; i++) {
    const currentVal = num(sorted[i].row, def.measure);
    if (i > 0) {
      const prevVal = num(sorted[i - 1].row, def.measure);
      if (currentVal !== prevVal) {
        rank = i + 1; // skip ranks for ties
      }
    }
    output[sorted[i].index] = rank;
  }
}

/**
 * Dense rank — no gaps in ranking (1, 2, 2, 3 for ties).
 * SQL: DENSE_RANK() OVER (PARTITION BY ... ORDER BY val DESC)
 */
function computeDenseRank<R extends Row>(
  group: { index: number; row: R }[],
  def: TableCalcDef,
  output: (number | null)[],
): void {
  const rankDir = def.sortDirection ?? 'desc';
  const sorted = group.slice().sort((a, b) => {
    const va = num(a.row, def.measure);
    const vb = num(b.row, def.measure);
    return rankDir === 'desc' ? vb - va : va - vb;
  });

  let rank = 1;
  for (let i = 0; i < sorted.length; i++) {
    const currentVal = num(sorted[i].row, def.measure);
    if (i > 0) {
      const prevVal = num(sorted[i - 1].row, def.measure);
      if (currentVal !== prevVal) {
        rank += 1; // increment by 1, no gaps
      }
    }
    output[sorted[i].index] = rank;
  }
}

/**
 * Percent of total — each value as a fraction of the partition total.
 * SQL: val / SUM(val) OVER (PARTITION BY ...)
 *
 * Returns values in [0, 1]. Multiply by 100 for percentage display.
 */
function computePctOfTotal<R extends Row>(
  group: { index: number; row: R }[],
  def: TableCalcDef,
  output: (number | null)[],
): void {
  let total = 0;
  for (const { row } of group) {
    total += num(row, def.measure);
  }
  for (const { index, row } of group) {
    output[index] = total === 0 ? 0 : num(row, def.measure) / total;
  }
}

/**
 * Moving average — trailing N-row average within each partition.
 * SQL: AVG(val) OVER (PARTITION BY ... ORDER BY ...
 *       ROWS BETWEEN (N-1) PRECEDING AND CURRENT ROW)
 *
 * windowSize defaults to 3.
 */
function computeMovingAvg<R extends Row>(
  group: { index: number; row: R }[],
  def: TableCalcDef,
  output: (number | null)[],
): void {
  const win = Math.max(1, def.windowSize ?? 3);
  const values: number[] = [];
  for (const { row } of group) {
    values.push(num(row, def.measure));
  }

  for (let i = 0; i < group.length; i++) {
    const start = Math.max(0, i - win + 1);
    let sum = 0;
    const count = i - start + 1;
    for (let j = start; j <= i; j++) {
      sum += values[j];
    }
    output[group[i].index] = sum / count;
  }
}

/**
 * Difference — value minus previous value (LAG).
 * SQL: val - LAG(val, offset) OVER (PARTITION BY ... ORDER BY ...)
 *
 * First `offset` rows in each partition are null (no predecessor).
 */
function computeDifference<R extends Row>(
  group: { index: number; row: R }[],
  def: TableCalcDef,
  output: (number | null)[],
): void {
  const offset = Math.max(1, def.offset ?? 1);
  for (let i = 0; i < group.length; i++) {
    if (i < offset) {
      output[group[i].index] = null;
    } else {
      const current = num(group[i].row, def.measure);
      const prev = num(group[i - offset].row, def.measure);
      output[group[i].index] = current - prev;
    }
  }
}

/**
 * Percent change — relative change from previous value.
 * SQL: (val - LAG(val, 1)) / ABS(LAG(val, 1)) OVER (...)
 *
 * Returns ratio (0.1 = 10% increase). Null for first row or when
 * previous value is zero.
 */
function computePctChange<R extends Row>(
  group: { index: number; row: R }[],
  def: TableCalcDef,
  output: (number | null)[],
): void {
  const offset = Math.max(1, def.offset ?? 1);
  for (let i = 0; i < group.length; i++) {
    if (i < offset) {
      output[group[i].index] = null;
    } else {
      const current = num(group[i].row, def.measure);
      const prev = num(group[i - offset].row, def.measure);
      if (prev === 0) {
        output[group[i].index] = null;
      } else {
        output[group[i].index] = (current - prev) / Math.abs(prev);
      }
    }
  }
}

/**
 * First value — the first value in the partition (by order).
 * SQL: FIRST_VALUE(val) OVER (PARTITION BY ... ORDER BY ...)
 */
function computeFirstValue<R extends Row>(
  group: { index: number; row: R }[],
  def: TableCalcDef,
  output: (number | null)[],
): void {
  if (group.length === 0) return;
  const first = num(group[0].row, def.measure);
  for (const { index } of group) {
    output[index] = first;
  }
}

/**
 * Last value — the last value in the partition (by order).
 * SQL: LAST_VALUE(val) OVER (PARTITION BY ... ORDER BY ...
 *       ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING)
 */
function computeLastValue<R extends Row>(
  group: { index: number; row: R }[],
  def: TableCalcDef,
  output: (number | null)[],
): void {
  if (group.length === 0) return;
  const last = num(group[group.length - 1].row, def.measure);
  for (const { index } of group) {
    output[index] = last;
  }
}

/**
 * Ntile — divide each partition into N roughly equal buckets.
 * SQL: NTILE(N) OVER (PARTITION BY ... ORDER BY ...)
 *
 * Returns bucket number 1..N.
 */
function computeNtile<R extends Row>(
  group: { index: number; row: R }[],
  def: TableCalcDef,
  output: (number | null)[],
): void {
  const buckets = Math.max(1, def.ntileBuckets ?? 4);
  const n = group.length;
  const baseSize = Math.floor(n / buckets);
  const remainder = n % buckets;
  // First `remainder` buckets get baseSize+1 rows, rest get baseSize.
  let bucket = 1;
  let rowsInBucket = 0;
  const currentBucketSize = () =>
    bucket <= remainder ? baseSize + 1 : baseSize;

  for (let i = 0; i < n; i++) {
    if (rowsInBucket >= currentBucketSize()) {
      bucket += 1;
      rowsInBucket = 0;
    }
    output[group[i].index] = bucket;
    rowsInBucket += 1;
  }
}

/**
 * Index — ratio of each value to the first value in the partition.
 * Useful for "indexed to 100" growth charts.
 *
 * Returns ratio where first value = 1.0. Multiply by 100 for "indexed to 100".
 */
function computeIndex<R extends Row>(
  group: { index: number; row: R }[],
  def: TableCalcDef,
  output: (number | null)[],
): void {
  if (group.length === 0) return;
  const base = num(group[0].row, def.measure);
  for (const { index, row } of group) {
    const val = num(row, def.measure);
    output[index] = base === 0 ? 0 : val / base;
  }
}

/**
 * Cumulative percent — running sum as a fraction of partition total.
 * Useful for Pareto charts.
 *
 * SQL: SUM(val) OVER (PARTITION BY ... ORDER BY ... ROWS UNBOUNDED PRECEDING)
 *      / SUM(val) OVER (PARTITION BY ...)
 */
function computeCumulativePct<R extends Row>(
  group: { index: number; row: R }[],
  def: TableCalcDef,
  output: (number | null)[],
): void {
  let total = 0;
  for (const { row } of group) {
    total += num(row, def.measure);
  }
  let cumSum = 0;
  for (const { index, row } of group) {
    cumSum += num(row, def.measure);
    output[index] = total === 0 ? 0 : cumSum / total;
  }
}

// ─── Dispatch map ───────────────────────────────────────────────────────────

type CalcFn<R extends Row> = (
  group: { index: number; row: R }[],
  def: TableCalcDef,
  output: (number | null)[],
) => void;

const CALC_DISPATCH: Record<TableCalcType, CalcFn<Row>> = {
  running_sum: computeRunningSum,
  running_avg: computeRunningAvg,
  running_min: computeRunningMin,
  running_max: computeRunningMax,
  rank: computeRank,
  dense_rank: computeDenseRank,
  pct_of_total: computePctOfTotal,
  moving_avg: computeMovingAvg,
  difference: computeDifference,
  pct_change: computePctChange,
  first_value: computeFirstValue,
  last_value: computeLastValue,
  ntile: computeNtile,
  index: computeIndex,
  cumulative_pct: computeCumulativePct,
};

// ─── Core engine ────────────────────────────────────────────────────────────

/**
 * Execute a single table calculation.
 *
 * Algorithm:
 *   1. Partition rows by `partitionBy` dimensions.
 *   2. Within each partition, sort by `orderBy` field.
 *   3. Apply the calculation function to produce one value per row.
 *   4. Join results back into a new row array.
 *
 * Returns new rows — originals are not mutated.
 *
 * @param rows - Aggregated result set (post-LOD, post-filter).
 * @param def  - Table calculation definition.
 * @returns    - New rows with the calculated column appended.
 */
export function executeTableCalc<R extends Row>(
  rows: R[],
  def: TableCalcDef,
): R[] {
  if (rows.length === 0) return [];

  const calcFn = CALC_DISPATCH[def.type];
  if (!calcFn) {
    throw new Error(`Unknown table calculation type: ${def.type}`);
  }

  const partitionBy = def.partitionBy ?? [];
  const groups = partitionRows(rows, partitionBy);
  const output: (number | null)[] = new Array(rows.length).fill(null);

  // For rank/dense_rank, don't sort by orderBy — they sort by measure internally.
  const needsOrderSort = def.type !== 'rank' && def.type !== 'dense_rank';

  for (const [, group] of groups) {
    const sorted = needsOrderSort
      ? sortGroup(group, def.orderBy, def.sortDirection)
      : group;
    calcFn(sorted, def, output);
  }

  return rows.map((row, i) => ({
    ...row,
    [def.as]: output[i],
  }));
}

/**
 * Execute multiple table calculations in sequence.
 *
 * Each calc can reference columns created by previous calcs.
 * Calcs are applied in array order.
 */
export function executeTableCalcPipeline<R extends Row>(
  rows: R[],
  definitions: TableCalcDef[],
): R[] {
  let current = rows as Row[];
  for (const def of definitions) {
    current = executeTableCalc(current, def);
  }
  return current as R[];
}

// ─── Convenience builders ───────────────────────────────────────────────────

/**
 * Build a running sum definition.
 *
 * Example: runningSum('Sales', 'cum_sales', ['Region'], 'Month')
 *   → SUM(Sales) OVER (PARTITION BY Region ORDER BY Month ROWS UNBOUNDED PRECEDING)
 */
export function runningSum(
  measure: string,
  as: string,
  partitionBy?: string[],
  orderBy?: string,
): TableCalcDef {
  return { type: 'running_sum', measure, as, partitionBy, orderBy };
}

/**
 * Build a rank definition.
 *
 * Example: rank('Sales', 'sales_rank', ['Category'], 'desc')
 *   → RANK() OVER (PARTITION BY Category ORDER BY Sales DESC)
 */
export function rank(
  measure: string,
  as: string,
  partitionBy?: string[],
  sortDirection: SortDirection = 'desc',
): TableCalcDef {
  return { type: 'rank', measure, as, partitionBy, sortDirection };
}

/**
 * Build a percent-of-total definition.
 *
 * Example: pctOfTotal('Sales', 'pct_sales', ['Category'])
 *   → Sales / SUM(Sales) OVER (PARTITION BY Category)
 */
export function pctOfTotal(
  measure: string,
  as: string,
  partitionBy?: string[],
): TableCalcDef {
  return { type: 'pct_of_total', measure, as, partitionBy };
}

/**
 * Build a moving average definition.
 *
 * Example: movingAvg('Sales', 'ma3_sales', 3, ['Region'], 'Month')
 *   → AVG(Sales) OVER (PARTITION BY Region ORDER BY Month
 *      ROWS BETWEEN 2 PRECEDING AND CURRENT ROW)
 */
export function movingAvg(
  measure: string,
  as: string,
  windowSize: number = 3,
  partitionBy?: string[],
  orderBy?: string,
): TableCalcDef {
  return { type: 'moving_avg', measure, as, windowSize, partitionBy, orderBy };
}

/**
 * Build a difference definition (period-over-period change).
 *
 * Example: difference('Sales', 'sales_diff', ['Region'], 'Month')
 *   → Sales - LAG(Sales, 1) OVER (PARTITION BY Region ORDER BY Month)
 */
export function difference(
  measure: string,
  as: string,
  partitionBy?: string[],
  orderBy?: string,
  offset: number = 1,
): TableCalcDef {
  return { type: 'difference', measure, as, partitionBy, orderBy, offset };
}

/**
 * Build a percent change definition.
 *
 * Example: pctChange('Sales', 'sales_pct_chg', ['Region'], 'Month')
 *   → (Sales - LAG(Sales, 1)) / ABS(LAG(Sales, 1))
 *     OVER (PARTITION BY Region ORDER BY Month)
 */
export function pctChange(
  measure: string,
  as: string,
  partitionBy?: string[],
  orderBy?: string,
  offset: number = 1,
): TableCalcDef {
  return { type: 'pct_change', measure, as, partitionBy, orderBy, offset };
}

/**
 * Build a cumulative percent definition (for Pareto charts).
 *
 * Example: cumulativePct('Sales', 'cum_pct', ['Category'], 'Product')
 *   → running_sum(Sales) / total(Sales) within each Category
 */
export function cumulativePct(
  measure: string,
  as: string,
  partitionBy?: string[],
  orderBy?: string,
): TableCalcDef {
  return { type: 'cumulative_pct', measure, as, partitionBy, orderBy };
}

// ─── Utility: auto-resolve partition vs address ─────────────────────────────

/**
 * Given all view dimensions and the "Compute Using" field(s), resolve
 * which dimensions are partitioning and which are addressing.
 *
 * This mirrors Tableau's behavior: the user picks "Compute Using"
 * (= addressing), and everything else becomes partitioning.
 *
 * @param viewDimensions - All dimension fields in the current view.
 * @param computeUsing   - Addressing fields ("compute using" selection).
 * @returns              - { partitionBy, orderBy } suitable for TableCalcDef.
 */
export function resolvePartitionAddress(
  viewDimensions: string[],
  computeUsing: string[],
): { partitionBy: string[]; orderBy: string | undefined } {
  const addressSet = new Set(computeUsing);
  const partitionBy = viewDimensions.filter(d => !addressSet.has(d));
  // The first addressing field becomes the orderBy.
  const orderBy = computeUsing.length > 0 ? computeUsing[0] : undefined;
  return { partitionBy, orderBy };
}
