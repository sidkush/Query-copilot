/**
 * Client-side anomaly detection using Z-score analysis.
 * Detects statistical outliers in tile data for the Anomaly Narrator feature.
 */

const Z_THRESHOLD = 2.5; // Only flag significant outliers

/**
 * Detect anomalies in numeric columns of tile data.
 * @param {string[]} columns
 * @param {object[]} rows
 * @returns {{ column: string, value: number, zScore: number, direction: 'high'|'low', rowIndex: number, mean: number, stddev: number }[]}
 */
export function detectAnomalies(columns, rows) {
  if (!columns?.length || !rows?.length || rows.length < 5) return [];

  const anomalies = [];

  for (const col of columns) {
    const values = rows.map(r => Number(r[col])).filter(n => isFinite(n));
    if (values.length < 5) continue;

    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
    const stddev = Math.sqrt(variance);

    if (stddev === 0) continue; // No variation

    // Check the last value (most recent data point) for anomaly
    const lastIdx = rows.length - 1;
    const lastVal = Number(rows[lastIdx][col]);
    if (!isFinite(lastVal)) continue;

    const z = (lastVal - mean) / stddev;

    if (Math.abs(z) >= Z_THRESHOLD) {
      anomalies.push({
        column: col,
        value: lastVal,
        zScore: z,
        direction: z > 0 ? 'high' : 'low',
        rowIndex: lastIdx,
        mean: Math.round(mean * 100) / 100,
        stddev: Math.round(stddev * 100) / 100,
      });
    }
  }

  // Return only the most significant anomaly (highest absolute Z-score)
  anomalies.sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore));
  return anomalies.slice(0, 1);
}

/**
 * Format a brief anomaly summary for display as a badge.
 * @param {object} anomaly - from detectAnomalies
 * @returns {string}
 */
export function formatAnomalyBadge(anomaly) {
  const pct = Math.abs(((anomaly.value - anomaly.mean) / anomaly.mean) * 100).toFixed(0);
  const dir = anomaly.direction === 'high' ? 'above' : 'below';
  return `${anomaly.column}: ${pct}% ${dir} average`;
}
