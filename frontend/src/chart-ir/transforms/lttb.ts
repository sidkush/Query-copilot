/**
 * Largest Triangle Three Buckets (LTTB) downsampling.
 *
 * Reference: Steinarsson, Sveinn (2013). "Downsampling Time Series for Visual
 * Representation." MSc thesis, University of Iceland.
 *
 * LTTB is the canonical downsampling method for time-series line/area charts
 * because it preserves peaks, troughs, and trend shape far better than
 * uniform sampling. The algorithm:
 *
 *   1. First and last points are always kept.
 *   2. The remaining points are split into `targetPoints - 2` equal-sized
 *      buckets.
 *   3. For each bucket, pick the point that forms the largest triangle
 *      with (a) the previously-chosen point and (b) the centroid of the
 *      next bucket.
 *   4. The picked points form the downsampled series.
 *
 * This is a pure TypeScript implementation with no dependencies. Inputs
 * are numeric (x, y) pairs; consumers are responsible for converting
 * temporal/categorical fields to numeric indices before calling.
 *
 * Companion methods live here too:
 *   - uniform: sample every Nth point
 *   - none:    passthrough
 */

export interface Point {
  x: number;
  y: number;
}

/**
 * LTTB core — returns a downsampled copy of `points` with exactly
 * `targetPoints` entries (or the original if targetPoints >= points.length
 * or targetPoints < 3).
 */
export function lttb(points: Point[], targetPoints: number): Point[] {
  const n = points.length;
  if (targetPoints >= n || targetPoints < 3) {
    return points.slice();
  }

  const sampled: Point[] = new Array(targetPoints);
  let sampledIndex = 0;
  const bucketSize = (n - 2) / (targetPoints - 2);

  // Always keep the first point.
  const first = points[0];
  if (!first) return points.slice();
  sampled[sampledIndex++] = first;

  let a = 0; // index of the previously-chosen point
  for (let i = 0; i < targetPoints - 2; i++) {
    // Next bucket range (for centroid calculation)
    const nextRangeStart = Math.floor((i + 1) * bucketSize) + 1;
    const nextRangeEnd = Math.min(Math.floor((i + 2) * bucketSize) + 1, n);

    let avgX = 0;
    let avgY = 0;
    const nextCount = nextRangeEnd - nextRangeStart;
    for (let j = nextRangeStart; j < nextRangeEnd; j++) {
      const p = points[j];
      if (!p) continue;
      avgX += p.x;
      avgY += p.y;
    }
    if (nextCount > 0) {
      avgX /= nextCount;
      avgY /= nextCount;
    }

    // Current bucket range
    const rangeStart = Math.floor(i * bucketSize) + 1;
    const rangeEnd = Math.min(Math.floor((i + 1) * bucketSize) + 1, n);

    const pa = points[a];
    if (!pa) continue;

    let maxArea = -1;
    let maxAreaIndex = rangeStart;
    for (let j = rangeStart; j < rangeEnd; j++) {
      const pj = points[j];
      if (!pj) continue;
      const area =
        Math.abs((pa.x - avgX) * (pj.y - pa.y) - (pa.x - pj.x) * (avgY - pa.y)) *
        0.5;
      if (area > maxArea) {
        maxArea = area;
        maxAreaIndex = j;
      }
    }

    const picked = points[maxAreaIndex];
    if (picked) {
      sampled[sampledIndex++] = picked;
      a = maxAreaIndex;
    }
  }

  // Always keep the last point.
  const last = points[n - 1];
  if (last) sampled[sampledIndex++] = last;

  return sampled.slice(0, sampledIndex);
}

/**
 * Uniform sampling — take every `stride`-th point. Deterministic, preserves
 * first + last. Much cheaper than LTTB but loses peaks.
 */
export function uniformSample<T>(points: T[], targetPoints: number): T[] {
  const n = points.length;
  if (targetPoints >= n || targetPoints < 2) {
    return points.slice();
  }
  const stride = Math.max(1, Math.floor(n / targetPoints));
  const result: T[] = [];
  for (let i = 0; i < n; i += stride) {
    const p = points[i];
    if (p !== undefined) result.push(p);
    if (result.length >= targetPoints - 1) break;
  }
  const last = points[n - 1];
  if (last !== undefined && result[result.length - 1] !== last) {
    result.push(last);
  }
  return result;
}

/**
 * Downsample row objects using LTTB over the (x, y) columns extracted via
 * the provided accessor functions. Non-numeric x values are coerced via
 * `Number(...)` — temporal columns stored as ISO strings should be
 * converted to epoch millis by the caller first (Vega does this itself
 * on ingest if the field is typed `temporal`, so for the pre-render
 * path we accept whatever ordering the rows already have).
 *
 * Returns the row objects at the chosen indices in their original order.
 */
export function lttbRows<Row>(
  rows: Row[],
  getX: (row: Row, index: number) => number,
  getY: (row: Row, index: number) => number,
  targetPoints: number,
): Row[] {
  if (rows.length <= targetPoints) return rows.slice();
  const points: Point[] = rows.map((r, i) => ({ x: getX(r, i), y: getY(r, i) }));
  const sampled = lttb(points, targetPoints);
  // Build a set of kept x-values so we can map back to rows. Because LTTB
  // preserves only the picked points and doesn't carry row indices, we
  // rebuild the row subset by walking both arrays in order.
  const keptXs = new Set(sampled.map((p) => p.x));
  const result: Row[] = [];
  const pointsArr = points;
  for (let i = 0; i < rows.length; i++) {
    const p = pointsArr[i];
    if (!p) continue;
    if (keptXs.has(p.x)) {
      const row = rows[i];
      if (row !== undefined) {
        result.push(row);
      }
    }
  }
  return result;
}
