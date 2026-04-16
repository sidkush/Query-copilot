/**
 * lodExpression — Level-of-Detail expression engine for the chart renderer.
 *
 * Implements Tableau-style FIXED / INCLUDE / EXCLUDE LOD expressions that
 * compute aggregates at a different granularity than the view's current
 * level of detail. These run client-side on already-fetched data rows,
 * producing a new column that can be used in encodings or further calcs.
 *
 * ── Execution model ──
 *
 * Tableau's order of operations for LOD expressions:
 *   1. Extract / Data Source filters
 *   2. Context filters
 *   3. FIXED LOD expressions  (ignore dimension filters)
 *   4. Dimension filters
 *   5. INCLUDE / EXCLUDE LOD expressions  (respect dimension filters)
 *   6. Measure filters
 *   7. Table calculations
 *
 * In our chart renderer, the caller is responsible for applying filters
 * in the correct order. This module is a pure computation engine:
 *   - Give it rows + an LOD definition → get back rows with a new column.
 *
 * ── SQL equivalents (for reference) ──
 *
 * FIXED [Region] : SUM([Sales])
 *   → SELECT *, SUM(Sales) OVER (PARTITION BY Region) AS lod_result
 *     FROM data
 *   OR as subquery:
 *   → SELECT d.*, f.lod_result
 *     FROM data d
 *     JOIN (SELECT Region, SUM(Sales) as lod_result
 *           FROM data GROUP BY Region) f
 *     ON d.Region = f.Region
 *
 * INCLUDE [Month] : AVG([Sales])   (view has [Region])
 *   → Adds Month to the view's grain: GROUP BY Region, Month
 *   → Then the result is joined back at the view level (Region)
 *   → SELECT *, AVG(Sales) OVER (PARTITION BY Region, Month) AS lod_result
 *
 * EXCLUDE [Month] : AVG([Sales])   (view has [Region, Month])
 *   → Removes Month from the view's grain: GROUP BY Region
 *   → SELECT *, AVG(Sales) OVER (PARTITION BY Region) AS lod_result
 *
 * ── DuckDB window function mapping ──
 *
 * All three LOD types compile naturally to window functions:
 *   FIXED  → PARTITION BY <fixed_dims>
 *   INCLUDE → PARTITION BY <view_dims + include_dims>
 *   EXCLUDE → PARTITION BY <view_dims - exclude_dims>
 *
 * Since we run client-side, we implement the equivalent logic in TypeScript
 * using hash-based grouping (O(n) single pass for grouping, O(n) for join-back).
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type LodType = 'fixed' | 'include' | 'exclude';

export type LodAggregate =
  | 'sum'
  | 'avg'
  | 'min'
  | 'max'
  | 'count'
  | 'count_distinct'
  | 'median';

/**
 * Definition of a single LOD expression.
 *
 * Examples:
 *   { type: 'fixed', dimensions: ['Region'], measure: 'Sales', aggregate: 'sum', as: 'region_total' }
 *   { type: 'include', dimensions: ['Month'], measure: 'Sales', aggregate: 'avg', as: 'monthly_avg' }
 *   { type: 'exclude', dimensions: ['Month'], measure: 'Sales', aggregate: 'avg', as: 'overall_avg' }
 */
export interface LodExpression {
  /** LOD type: fixed ignores view dims, include adds dims, exclude removes dims. */
  type: LodType;
  /** Dimension fields referenced by the expression. */
  dimensions: string[];
  /** Measure field to aggregate. */
  measure: string;
  /** Aggregation function. */
  aggregate: LodAggregate;
  /** Output column name for the computed value. */
  as: string;
}

/**
 * The set of dimensions currently in the view (i.e., the fields on rows,
 * columns, color, detail shelves). Required for INCLUDE and EXCLUDE to
 * resolve their effective partition dimensions.
 */
export interface LodContext {
  /** Dimension field names currently defining the view's grain. */
  viewDimensions: string[];
}

// ─── Internal helpers ───────────────────────────────────────────────────────

type Row = Record<string, unknown>;

/** Build a composite key from dimension values. Handles null/undefined. */
function compositeKey(row: Row, dims: string[]): string {
  if (dims.length === 0) return '__ALL__';
  if (dims.length === 1) return String(row[dims[0]] ?? '__NULL__');
  return dims.map(d => String(row[d] ?? '__NULL__')).join('\x00');
}

/** Accumulator for streaming aggregation. */
interface Accumulator {
  sum: number;
  count: number;
  min: number;
  max: number;
  values: number[];            // only populated for median / count_distinct
  distinctSet: Set<unknown>;   // only populated for count_distinct
}

function newAccumulator(): Accumulator {
  return {
    sum: 0,
    count: 0,
    min: Infinity,
    max: -Infinity,
    values: [],
    distinctSet: new Set(),
  };
}

function accumulate(
  acc: Accumulator,
  value: unknown,
  aggregate: LodAggregate,
): void {
  // count_distinct tracks raw values regardless of numeric-ness.
  if (aggregate === 'count_distinct') {
    if (value != null) {
      acc.count += 1;
      acc.distinctSet.add(value);
    }
    return;
  }

  const num = Number(value);
  if (Number.isNaN(num)) return;

  acc.sum += num;
  acc.count += 1;
  if (num < acc.min) acc.min = num;
  if (num > acc.max) acc.max = num;

  // Only track arrays for aggregates that need them.
  if (aggregate === 'median') {
    acc.values.push(num);
  }
}

function finalize(acc: Accumulator, aggregate: LodAggregate): number {
  if (acc.count === 0) return 0;

  switch (aggregate) {
    case 'sum':
      return acc.sum;
    case 'avg':
      return acc.sum / acc.count;
    case 'min':
      return acc.min;
    case 'max':
      return acc.max;
    case 'count':
      return acc.count;
    case 'count_distinct':
      return acc.distinctSet.size;
    case 'median': {
      const sorted = acc.values.slice().sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
    }
    default:
      return acc.sum;
  }
}

// ─── Core engine ────────────────────────────────────────────────────────────

/**
 * Resolve the effective partition dimensions for an LOD expression.
 *
 * FIXED  → uses exactly the expression's dimensions (ignores view).
 * INCLUDE → view dimensions UNION expression dimensions.
 * EXCLUDE → view dimensions MINUS expression dimensions.
 */
export function resolvePartitionDimensions(
  expr: LodExpression,
  ctx: LodContext,
): string[] {
  switch (expr.type) {
    case 'fixed':
      return expr.dimensions;
    case 'include': {
      const set = new Set(ctx.viewDimensions);
      for (const d of expr.dimensions) set.add(d);
      return Array.from(set);
    }
    case 'exclude': {
      const excludeSet = new Set(expr.dimensions);
      return ctx.viewDimensions.filter(d => !excludeSet.has(d));
    }
    default:
      return expr.dimensions;
  }
}

/**
 * Execute a single LOD expression against a dataset.
 *
 * Algorithm (two-pass, O(n)):
 *   Pass 1: Group rows by partition dims, accumulate aggregate per group.
 *   Pass 2: Join the computed value back onto every row by its group key.
 *
 * Returns a new array of rows — each row is a shallow copy of the original
 * with the LOD result added as `expr.as`. Original rows are not mutated.
 *
 * @param rows    - The dataset (array of objects).
 * @param expr    - The LOD expression to evaluate.
 * @param ctx     - View context (required for INCLUDE/EXCLUDE, ignored for FIXED).
 * @returns       - New rows with the computed LOD column appended.
 */
export function executeLodExpression<R extends Row>(
  rows: R[],
  expr: LodExpression,
  ctx: LodContext = { viewDimensions: [] },
): R[] {
  if (rows.length === 0) return [];

  const partitionDims = resolvePartitionDimensions(expr, ctx);

  // ── Pass 1: group + accumulate ──
  const groups = new Map<string, Accumulator>();
  for (const row of rows) {
    const key = compositeKey(row, partitionDims);
    let acc = groups.get(key);
    if (!acc) {
      acc = newAccumulator();
      groups.set(key, acc);
    }
    accumulate(acc, row[expr.measure], expr.aggregate);
  }

  // ── Finalize all groups ──
  const results = new Map<string, number>();
  for (const [key, acc] of groups) {
    results.set(key, finalize(acc, expr.aggregate));
  }

  // ── Pass 2: join back ──
  return rows.map(row => {
    const key = compositeKey(row, partitionDims);
    return { ...row, [expr.as]: results.get(key) ?? 0 };
  });
}

/**
 * Execute multiple LOD expressions in sequence (pipeline).
 *
 * Each expression can reference columns created by previous expressions.
 * Expressions are applied in the order given — the caller is responsible
 * for ordering FIXED before INCLUDE/EXCLUDE to match Tableau semantics.
 */
export function executeLodPipeline<R extends Row>(
  rows: R[],
  expressions: LodExpression[],
  ctx: LodContext = { viewDimensions: [] },
): R[] {
  let current = rows as Row[];
  for (const expr of expressions) {
    current = executeLodExpression(current, expr, ctx);
  }
  return current as R[];
}

// ─── Convenience builders ───────────────────────────────────────────────────

/**
 * Build a FIXED LOD expression.
 *
 * Example: fixed(['Region'], 'Sales', 'sum', 'region_total')
 *   Equivalent to Tableau: { FIXED [Region] : SUM([Sales]) }
 *   SQL: SUM(Sales) OVER (PARTITION BY Region)
 */
export function fixed(
  dimensions: string[],
  measure: string,
  aggregate: LodAggregate,
  as: string,
): LodExpression {
  return { type: 'fixed', dimensions, measure, aggregate, as };
}

/**
 * Build an INCLUDE LOD expression.
 *
 * Example: include(['Month'], 'Sales', 'avg', 'monthly_avg')
 *   Equivalent to Tableau: { INCLUDE [Month] : AVG([Sales]) }
 *   SQL: AVG(Sales) OVER (PARTITION BY <view_dims>, Month)
 */
export function include(
  dimensions: string[],
  measure: string,
  aggregate: LodAggregate,
  as: string,
): LodExpression {
  return { type: 'include', dimensions, measure, aggregate, as };
}

/**
 * Build an EXCLUDE LOD expression.
 *
 * Example: exclude(['Month'], 'Sales', 'avg', 'overall_avg')
 *   Equivalent to Tableau: { EXCLUDE [Month] : AVG([Sales]) }
 *   SQL: AVG(Sales) OVER (PARTITION BY <view_dims minus Month>)
 */
export function exclude(
  dimensions: string[],
  measure: string,
  aggregate: LodAggregate,
  as: string,
): LodExpression {
  return { type: 'exclude', dimensions, measure, aggregate, as };
}

/**
 * Build a dataset-level aggregate (no partition dimensions).
 *
 * Example: total('Sales', 'sum', 'grand_total')
 *   Equivalent to Tableau: { FIXED : SUM([Sales]) }
 *   SQL: SUM(Sales) OVER ()
 */
export function total(
  measure: string,
  aggregate: LodAggregate,
  as: string,
): LodExpression {
  return { type: 'fixed', dimensions: [], measure, aggregate, as };
}

// ─── Derived calculations ───────────────────────────────────────────────────

/**
 * Compute percent-of-total using a FIXED LOD at the total level
 * and a ratio calculation.
 *
 * Given rows with a measure field, produces a new column containing
 * each row's share of the grand total (0.0 – 1.0).
 *
 * Example:
 *   percentOfTotal(rows, 'Sales', 'pct_of_total')
 *   → each row gets pct_of_total = row.Sales / SUM(all Sales)
 *
 * To partition by a dimension (e.g., percent within Region):
 *   percentOfTotal(rows, 'Sales', 'pct_of_region', ['Region'])
 */
export function percentOfTotal<R extends Row>(
  rows: R[],
  measure: string,
  as: string,
  partitionBy: string[] = [],
): R[] {
  if (rows.length === 0) return [];

  const totalCol = `__pct_total_${as}`;
  const lodExpr = fixed(partitionBy, measure, 'sum', totalCol);
  const withTotal = executeLodExpression(rows, lodExpr);

  return withTotal.map(row => {
    const total = Number(row[totalCol]) || 0;
    const value = Number(row[measure]) || 0;
    const pct = total === 0 ? 0 : value / total;
    const { [totalCol]: _omit, ...rest } = row;
    return { ...rest, [as]: pct } as R;
  });
}

/**
 * Compute index (ratio to average) using a FIXED LOD.
 *
 * Produces a column where 1.0 = at average, >1 = above, <1 = below.
 *
 * Example:
 *   indexToAverage(rows, 'Sales', 'sales_index', ['Region'])
 *   → sales_index = row.Sales / AVG(Sales within Region)
 */
export function indexToAverage<R extends Row>(
  rows: R[],
  measure: string,
  as: string,
  partitionBy: string[] = [],
): R[] {
  if (rows.length === 0) return [];

  const avgCol = `__idx_avg_${as}`;
  const lodExpr = fixed(partitionBy, measure, 'avg', avgCol);
  const withAvg = executeLodExpression(rows, lodExpr);

  return withAvg.map(row => {
    const avg = Number(row[avgCol]) || 0;
    const value = Number(row[measure]) || 0;
    const idx = avg === 0 ? 0 : value / avg;
    const { [avgCol]: _omit, ...rest } = row;
    return { ...rest, [as]: idx } as R;
  });
}
