/**
 * LOD (Level of Detail) Expression Engine.
 *
 * Implements Tableau-style FIXED/INCLUDE/EXCLUDE semantics
 * as in-memory computations on aggregated data.
 *
 * LOD expressions compute aggregates at a different granularity
 * than the view's level of detail:
 *
 * FIXED [dims] : AGG(field)
 *   → Compute at exactly the specified dimensions, ignoring view LOD.
 *   → Example: {FIXED [Region] : SUM([Sales])} — region-level totals
 *     even when the view shows monthly data.
 *
 * INCLUDE [dims] : AGG(field)
 *   → Add dimensions to the view's LOD (finer grain).
 *   → Example: {INCLUDE [Customer] : SUM([Sales])} — per-customer
 *     totals even when Customer isn't on any shelf.
 *
 * EXCLUDE [dims] : AGG(field)
 *   → Remove dimensions from the view's LOD (coarser grain).
 *   → Example: {EXCLUDE [Month] : AVG([Sales])} — averages across
 *     months even when Month is on a shelf.
 *
 * Execution order (matches Tableau):
 *   1. FIXED LOD expressions (before dimension filters)
 *   2. Dimension filters
 *   3. INCLUDE/EXCLUDE LOD expressions
 *   4. View-level aggregation
 *   5. Table calculations
 */

type Row = Record<string, unknown>;

export type LODType = 'fixed' | 'include' | 'exclude';

export interface LODExprDef {
  type: LODType;
  /** Dimensions that define the LOD scope */
  dimensions: string[];
  /** The aggregate computation */
  field: string;
  op: 'sum' | 'avg' | 'min' | 'max' | 'count' | 'countd' | 'median';
  /** Result field name */
  as: string;
}

// ── Aggregation helpers ─────────────────────────────────────

function aggFn(op: string, values: number[]): number {
  if (values.length === 0) return 0;
  switch (op) {
    case 'sum': {
      let s = 0; for (let i = 0; i < values.length; i++) s += values[i]; return s;
    }
    case 'avg':
    case 'mean': {
      let s = 0; for (let i = 0; i < values.length; i++) s += values[i]; return s / values.length;
    }
    case 'min': {
      let m = Infinity; for (let i = 0; i < values.length; i++) if (values[i] < m) m = values[i]; return m;
    }
    case 'max': {
      let m = -Infinity; for (let i = 0; i < values.length; i++) if (values[i] > m) m = values[i]; return m;
    }
    case 'count': return values.length;
    case 'countd': return new Set(values).size;
    case 'median': {
      const sorted = [...values].sort((a, b) => a - b);
      const mid = sorted.length >> 1;
      return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }
    default: {
      let s = 0; for (let i = 0; i < values.length; i++) s += values[i]; return s;
    }
  }
}

// ── FIXED ───────────────────────────────────────────────────

/**
 * FIXED LOD: compute aggregate at specified dimensions only.
 * Generates a lookup table keyed by the FIXED dimensions,
 * then joins back to every row.
 */
function applyFixed(rows: Row[], expr: LODExprDef): Row[] {
  // Step 1: Group by FIXED dimensions
  const groups = new Map<string, number[]>();
  for (const row of rows) {
    const key = expr.dimensions.map(d => String(row[d] ?? '')).join('|');
    let g = groups.get(key);
    if (!g) { g = []; groups.set(key, g); }
    g.push(Number(row[expr.field] ?? 0));
  }

  // Step 2: Compute aggregate per group
  const lookup = new Map<string, number>();
  for (const [key, values] of groups) {
    lookup.set(key, aggFn(expr.op, values));
  }

  // Step 3: Join back to every row
  return rows.map(row => {
    const key = expr.dimensions.map(d => String(row[d] ?? '')).join('|');
    return { ...row, [expr.as]: lookup.get(key) ?? 0 };
  });
}

// ── INCLUDE ─────────────────────────────────────────────────

/**
 * INCLUDE LOD: add dimensions to the view's LOD.
 * The view dimensions + INCLUDE dimensions define groups.
 * Each row gets the aggregate computed at the finer grain.
 */
function applyInclude(
  rows: Row[],
  expr: LODExprDef,
  viewDimensions: string[],
): Row[] {
  // Group by (view dimensions + include dimensions)
  const allDims = [...new Set([...viewDimensions, ...expr.dimensions])];
  const groups = new Map<string, number[]>();

  for (const row of rows) {
    const key = allDims.map(d => String(row[d] ?? '')).join('|');
    let g = groups.get(key);
    if (!g) { g = []; groups.set(key, g); }
    g.push(Number(row[expr.field] ?? 0));
  }

  const lookup = new Map<string, number>();
  for (const [key, values] of groups) {
    lookup.set(key, aggFn(expr.op, values));
  }

  return rows.map(row => {
    const key = allDims.map(d => String(row[d] ?? '')).join('|');
    return { ...row, [expr.as]: lookup.get(key) ?? 0 };
  });
}

// ── EXCLUDE ─────────────────────────────────────────────────

/**
 * EXCLUDE LOD: remove dimensions from the view's LOD.
 * View dimensions MINUS exclude dimensions define groups.
 * Each row gets the aggregate computed at the coarser grain.
 */
function applyExclude(
  rows: Row[],
  expr: LODExprDef,
  viewDimensions: string[],
): Row[] {
  const excludeSet = new Set(expr.dimensions);
  const remainingDims = viewDimensions.filter(d => !excludeSet.has(d));

  const groups = new Map<string, number[]>();
  for (const row of rows) {
    const key = remainingDims.length > 0
      ? remainingDims.map(d => String(row[d] ?? '')).join('|')
      : '__all__';
    let g = groups.get(key);
    if (!g) { g = []; groups.set(key, g); }
    g.push(Number(row[expr.field] ?? 0));
  }

  const lookup = new Map<string, number>();
  for (const [key, values] of groups) {
    lookup.set(key, aggFn(expr.op, values));
  }

  return rows.map(row => {
    const key = remainingDims.length > 0
      ? remainingDims.map(d => String(row[d] ?? '')).join('|')
      : '__all__';
    return { ...row, [expr.as]: lookup.get(key) ?? 0 };
  });
}

// ── Public API ──────────────────────────────────────────────

/**
 * Apply a single LOD expression to data rows.
 *
 * @param rows Raw or aggregated data
 * @param expr LOD expression definition
 * @param viewDimensions Current view's dimension fields (needed for INCLUDE/EXCLUDE)
 */
export function applyLOD(
  rows: Row[],
  expr: LODExprDef,
  viewDimensions: string[] = [],
): Row[] {
  switch (expr.type) {
    case 'fixed': return applyFixed(rows, expr);
    case 'include': return applyInclude(rows, expr, viewDimensions);
    case 'exclude': return applyExclude(rows, expr, viewDimensions);
    default: return rows;
  }
}

/**
 * Apply multiple LOD expressions in correct execution order.
 * FIXED first, then INCLUDE/EXCLUDE.
 */
export function applyLODExpressions(
  rows: Row[],
  exprs: LODExprDef[],
  viewDimensions: string[] = [],
): Row[] {
  let result = rows;

  // FIXED first (before dimension filters)
  for (const expr of exprs) {
    if (expr.type === 'fixed') {
      result = applyLOD(result, expr, viewDimensions);
    }
  }

  // INCLUDE/EXCLUDE after (after dimension filters)
  for (const expr of exprs) {
    if (expr.type !== 'fixed') {
      result = applyLOD(result, expr, viewDimensions);
    }
  }

  return result;
}
