/**
 * Pixel min/max downsampling — bucket rows by pixel column, emit one
 * (min, max) pair per bucket so the resulting series retains every
 * peak and trough the pixel grid can resolve.
 *
 * Used by the Render Strategy Router for dense time-series where LTTB
 * is too coarse (LTTB preserves shape but picks a single point per
 * bucket, losing peaks that LTTB's triangle heuristic didn't select).
 *
 * Algorithm:
 *   - Map each row's x value to a pixel column via:
 *       col = floor((x - minX) / (maxX - minX) * pixelWidth)
 *   - For each pixel column, keep the row with the min y AND the row
 *     with the max y. The emitted subset is up to `2 * pixelWidth`
 *     rows, but usually much less because most columns have < 2 rows.
 *   - Preserve the first + last rows regardless of pixel placement.
 *
 * Pure TypeScript. Generic over the row type; accessors map rows to
 * numeric (x, y).
 */

export interface PixelMinMaxOptions {
  pixelWidth: number;
}

export function pixelMinMaxRows<Row>(
  rows: Row[],
  getX: (row: Row, index: number) => number,
  getY: (row: Row, index: number) => number,
  options: PixelMinMaxOptions,
): Row[] {
  const n = rows.length;
  const pixelWidth = Math.max(1, Math.floor(options.pixelWidth));
  if (n <= 2 || n <= pixelWidth * 2) return rows.slice();

  // Extract (x, y) into a parallel typed array pair for speed.
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const r = rows[i];
    if (r === undefined) continue;
    xs[i] = Number(getX(r, i));
    ys[i] = Number(getY(r, i));
  }

  // Range of x.
  let minX = Infinity;
  let maxX = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = xs[i];
    if (x === undefined || Number.isNaN(x)) continue;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
  }
  if (!isFinite(minX) || !isFinite(maxX) || minX === maxX) {
    // Degenerate x distribution — bail and return the full series.
    return rows.slice();
  }
  const span = maxX - minX;

  // Bucket accumulator: per-pixel (minIdx, maxIdx).
  const minIdx = new Int32Array(pixelWidth).fill(-1);
  const maxIdx = new Int32Array(pixelWidth).fill(-1);

  for (let i = 0; i < n; i++) {
    const x = xs[i];
    const y = ys[i];
    if (x === undefined || y === undefined || Number.isNaN(x)) continue;
    let col = Math.floor(((x - minX) / span) * pixelWidth);
    if (col < 0) col = 0;
    if (col >= pixelWidth) col = pixelWidth - 1;
    const curMinIdx = minIdx[col];
    const curMaxIdx = maxIdx[col];
    if (curMinIdx === undefined || curMinIdx === -1) {
      minIdx[col] = i;
    } else {
      const curMinY = ys[curMinIdx];
      if (curMinY !== undefined && y < curMinY) minIdx[col] = i;
    }
    if (curMaxIdx === undefined || curMaxIdx === -1) {
      maxIdx[col] = i;
    } else {
      const curMaxY = ys[curMaxIdx];
      if (curMaxY !== undefined && y > curMaxY) maxIdx[col] = i;
    }
  }

  // Collect kept indices + always keep first + last.
  const keptSet = new Set<number>();
  keptSet.add(0);
  keptSet.add(n - 1);
  for (let c = 0; c < pixelWidth; c++) {
    const miIdx = minIdx[c];
    const maIdx = maxIdx[c];
    if (miIdx !== undefined && miIdx !== -1) keptSet.add(miIdx);
    if (maIdx !== undefined && maIdx !== -1) keptSet.add(maIdx);
  }

  // Emit in original order.
  const result: Row[] = [];
  for (let i = 0; i < n; i++) {
    if (keptSet.has(i)) {
      const row = rows[i];
      if (row !== undefined) result.push(row);
    }
  }
  return result;
}
