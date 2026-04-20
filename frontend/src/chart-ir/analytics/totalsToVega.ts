/**
 * Plan 9a — merge totals `analytics_rows` entries into a crosstab row
 * array. Callers pipe the returned array straight into Vega-Lite's
 * data.values (or a tabular renderer). The markers `__is_grand_total__`
 * and `__is_subtotal__` drive bold styling + divider borders via
 * conditional formatting at render time.
 */

export type TotalsRow =
  | { kind: 'grand_total'; value: number | null;
      aggregation: string; position: 'before' | 'after' }
  | { kind: 'subtotal'; rows: Record<string, unknown>[];
      aggregation: string; position: 'before' | 'after' };

export interface ApplyTotalsCtx {
  measure_alias: string;
  row_dims: string[];
  column_dims: string[];
}

export function applyTotalsToCrosstab<Row extends Record<string, unknown>>(
  baseRows: Row[],
  analytics: TotalsRow[],
  ctx: ApplyTotalsCtx,
): (Row & Record<string, unknown>)[] {
  if (analytics.length === 0) return baseRows;

  let out: (Row & Record<string, unknown>)[] = [...baseRows];

  // Insert subtotals first (inline, at the boundary of their owning dim).
  for (const t of analytics) {
    if (t.kind !== 'subtotal') continue;
    out = insertSubtotals(out, t.rows, ctx);
  }

  // Then grand totals (outermost).
  for (const t of analytics) {
    if (t.kind !== 'grand_total') continue;
    const gt: Record<string, unknown> = {
      __is_grand_total__: true,
      [ctx.measure_alias]: t.value,
    };
    if (t.position === 'before') out = [gt as Row & Record<string, unknown>, ...out];
    else out = [...out, gt as Row & Record<string, unknown>];
  }

  return out;
}

function insertSubtotals<Row extends Record<string, unknown>>(
  rows: (Row & Record<string, unknown>)[],
  subtotals: Record<string, unknown>[],
  ctx: ApplyTotalsCtx,
): (Row & Record<string, unknown>)[] {
  if (subtotals.length === 0) return rows;
  // Assume subtotal.rows carry the single grouping dim + __subtotal_value__.
  const dim = Object.keys(subtotals[0]).find(
    (k) => k !== '__subtotal_value__',
  );
  if (!dim) return rows;

  const byDim = new Map<unknown, Record<string, unknown>>();
  for (const s of subtotals) byDim.set(s[dim], s);

  const result: (Row & Record<string, unknown>)[] = [];
  let prev: unknown = Symbol.for('init');
  for (const r of rows) {
    const cur = r[dim];
    if (prev !== Symbol.for('init') && prev !== cur && byDim.has(prev)) {
      const s = byDim.get(prev)!;
      result.push({
        __is_subtotal__: true,
        [dim]: prev,
        [ctx.measure_alias]: s['__subtotal_value__'],
      } as unknown as Row & Record<string, unknown>);
    }
    result.push(r);
    prev = cur;
  }
  // Flush final group.
  if (prev !== Symbol.for('init') && byDim.has(prev)) {
    const s = byDim.get(prev)!;
    result.push({
      __is_subtotal__: true,
      [dim]: prev,
      [ctx.measure_alias]: s['__subtotal_value__'],
    } as unknown as Row & Record<string, unknown>);
  }
  return result;
}
