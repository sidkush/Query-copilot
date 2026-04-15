/**
 * aggregateBin — pre-aggregation downsampler for the RSR path.
 *
 * When the RSR picks `downsample.method === 'aggregate_bin'`, the rows
 * are pre-aggregated by the spec's x encoding into a fixed number of
 * bins before they reach Vega. This duplicates work Vega-Lite could
 * do itself via `transform.aggregate`, but running it client-side
 * before the Vega view is built means:
 *
 *   1. The Vega view only sees targetPoints rows, not the raw N rows,
 *      so the DOM node count stays bounded even for tables with
 *      millions of rows behind them.
 *   2. The downsampling decision is observable from the RSR audit
 *      trail rather than buried inside Vega's internal transform run.
 *
 * Algorithm:
 *   - Partition the range [minX, maxX] into `targetPoints` equal-
 *     width bins.
 *   - For each row, find its bin index and update the running
 *     aggregate for that bin (sum + count, tracked per-row so min/
 *     max/avg are cheap).
 *   - Emit one synthetic row per non-empty bin, with the bin's x
 *     midpoint and the aggregated y value.
 *
 * The aggregate function is resolved from the spec's y encoding
 * (`spec.encoding.y.aggregate`) — if not set, defaults to 'avg'.
 */

export type BinAggregate = 'sum' | 'avg' | 'min' | 'max' | 'count';

export interface AggregateBinOptions {
  targetPoints: number;
  aggregate?: BinAggregate;
  xField: string;
  yField: string;
}

interface BinSlot {
  count: number;
  sum: number;
  min: number;
  max: number;
  xMid: number;
}

export function aggregateBinRows<Row extends Record<string, unknown>>(
  rows: Row[],
  options: AggregateBinOptions,
): Row[] {
  const n = rows.length;
  const targetPoints = Math.max(2, Math.floor(options.targetPoints));
  if (n <= targetPoints) return rows.slice();

  const { xField, yField, aggregate = 'avg' } = options;

  // Range scan.
  let minX = Infinity;
  let maxX = -Infinity;
  for (const row of rows) {
    const x = Number(row[xField]);
    if (Number.isNaN(x)) continue;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
  }
  if (!isFinite(minX) || !isFinite(maxX) || minX === maxX) {
    return rows.slice();
  }
  const span = maxX - minX;
  const binWidth = span / targetPoints;

  // Allocate bins.
  const bins: (BinSlot | null)[] = new Array(targetPoints).fill(null);
  for (const row of rows) {
    const x = Number(row[xField]);
    const y = Number(row[yField]);
    if (Number.isNaN(x) || Number.isNaN(y)) continue;
    let idx = Math.floor((x - minX) / binWidth);
    if (idx < 0) idx = 0;
    if (idx >= targetPoints) idx = targetPoints - 1;
    let slot = bins[idx];
    if (!slot) {
      slot = {
        count: 0,
        sum: 0,
        min: y,
        max: y,
        xMid: minX + (idx + 0.5) * binWidth,
      };
      bins[idx] = slot;
    }
    slot.count += 1;
    slot.sum += y;
    if (y < slot.min) slot.min = y;
    if (y > slot.max) slot.max = y;
  }

  // Emit one row per non-empty bin.
  const result: Row[] = [];
  for (const slot of bins) {
    if (!slot) continue;
    const yValue =
      aggregate === 'sum'
        ? slot.sum
        : aggregate === 'min'
          ? slot.min
          : aggregate === 'max'
            ? slot.max
            : aggregate === 'count'
              ? slot.count
              : slot.sum / slot.count;
    const out = { [xField]: slot.xMid, [yField]: yValue } as Row;
    result.push(out);
  }
  return result;
}
