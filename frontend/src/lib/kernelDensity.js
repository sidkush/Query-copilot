/**
 * kernelDensity — tiny Gaussian KDE + Silverman bandwidth helper.
 *
 * Used by D3Ridgeline to convert raw per-category value samples into
 * smooth density curves. No dependencies — pure math over native arrays
 * so we don't pull in d3-random or d3-array for this alone.
 *
 * Only Gaussian kernels are supported; other kernels aren't needed for
 * the flagship ridgeline aesthetic. The default `points=60` sample rate
 * keeps the SVG path under ~120 characters per ridge while remaining
 * visually smooth after d3-shape's curveBasis smoothing.
 */

/**
 * Gaussian KDE evaluated at `points` equally-spaced x values over the
 * data range. Returns `[{ x, density }]`.
 *
 * Complexity is O(n × points) — keep `data` under a few thousand
 * samples per ridge for per-frame rendering.
 */
export function gaussianKDE(data, bandwidth, points = 60) {
  if (!Array.isArray(data) || data.length === 0 || !Number.isFinite(bandwidth) || bandwidth <= 0) {
    return [];
  }
  const n = data.length;
  const min = Math.min(...data);
  const max = Math.max(...data);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    return [{ x: min, density: 0 }];
  }

  const step = (max - min) / (points - 1);
  const sqrt2pi = Math.sqrt(2 * Math.PI);
  const out = new Array(points);
  for (let i = 0; i < points; i++) {
    const x = min + step * i;
    let sum = 0;
    for (let j = 0; j < n; j++) {
      const u = (x - data[j]) / bandwidth;
      sum += Math.exp(-0.5 * u * u) / sqrt2pi;
    }
    out[i] = { x, density: sum / (n * bandwidth) };
  }
  return out;
}

/**
 * Silverman's rule-of-thumb bandwidth estimator.
 * `h = 1.06 × σ × n^(-1/5)`. Good default for unimodal-ish data.
 */
export function silvermanBandwidth(data) {
  if (!Array.isArray(data) || data.length < 2) return 1;
  const n = data.length;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += data[i];
  mean /= n;
  let variance = 0;
  for (let i = 0; i < n; i++) {
    const d = data[i] - mean;
    variance += d * d;
  }
  variance /= n;
  const std = Math.sqrt(variance);
  return Math.max(1.06 * std * Math.pow(n, -1 / 5), 1e-6);
}
