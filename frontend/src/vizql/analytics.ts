/**
 * Analytics module — trend lines, forecasting, clustering, density estimation.
 *
 * These run post-aggregation and produce overlay data for rendering
 * as additional marks on the chart.
 */

type Row = Record<string, unknown>;

// ── Trend Lines ────────────────────────────────────────────

export interface TrendLineResult {
  type: string;
  coefficients: number[];
  rSquared: number;
  /** Evenly spaced points along the trend line for rendering */
  points: { x: number; y: number }[];
}

/**
 * Linear regression: y = a + b*x
 * Uses numerically stable single-pass algorithm.
 */
export function linearRegression(xs: number[], ys: number[]): TrendLineResult {
  const n = xs.length;
  if (n < 2) return { type: 'linear', coefficients: [0, 0], rSquared: 0, points: [] };

  // Numerically stable: center x first to avoid catastrophic cancellation
  let sx = 0, sy = 0;
  for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; }
  const mx = sx / n, my = sy / n;

  let sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }

  const b = sxx === 0 ? 0 : sxy / sxx;
  const a = my - b * mx;

  // R-squared
  const ssRes = syy - b * sxy;
  const rSquared = syy === 0 ? 1 : 1 - ssRes / syy;

  // Generate points
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const steps = 50;
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const x = xMin + (xMax - xMin) * (i / steps);
    points.push({ x, y: a + b * x });
  }

  return { type: 'linear', coefficients: [a, b], rSquared, points };
}

/**
 * Polynomial regression: y = a0 + a1*x + a2*x^2 + ... + an*x^n
 * Uses normal equations with Gaussian elimination.
 */
export function polynomialRegression(xs: number[], ys: number[], degree = 2): TrendLineResult {
  const n = xs.length;
  if (n < degree + 1) return { type: `poly-${degree}`, coefficients: [], rSquared: 0, points: [] };

  const k = degree + 1;

  // Build Vandermonde-like normal equation: (X^T X) a = X^T y
  const A: number[][] = Array.from({ length: k }, () => new Array(k).fill(0));
  const B: number[] = new Array(k).fill(0);

  for (let i = 0; i < n; i++) {
    let xp = 1;
    for (let j = 0; j < k; j++) {
      B[j] += xp * ys[i];
      let xp2 = xp;
      for (let l = j; l < k; l++) {
        A[j][l] += xp2;
        A[l][j] = A[j][l]; // symmetric
        xp2 *= xs[i];
      }
      xp *= xs[i];
    }
  }

  // Gaussian elimination with partial pivoting
  const coefficients = solveLinearSystem(A, B);
  if (!coefficients) return { type: `poly-${degree}`, coefficients: [], rSquared: 0, points: [] };

  // R-squared
  let ssTot = 0, ssRes = 0;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  for (let i = 0; i < n; i++) {
    let yHat = 0, xp = 1;
    for (let j = 0; j < k; j++) { yHat += coefficients[j] * xp; xp *= xs[i]; }
    ssRes += (ys[i] - yHat) ** 2;
    ssTot += (ys[i] - my) ** 2;
  }
  const rSquared = ssTot === 0 ? 1 : 1 - ssRes / ssTot;

  // Generate points
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const steps = 80;
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const x = xMin + (xMax - xMin) * (i / steps);
    let y = 0, xp = 1;
    for (let j = 0; j < k; j++) { y += coefficients[j] * xp; xp *= x; }
    points.push({ x, y });
  }

  return { type: `poly-${degree}`, coefficients, rSquared, points };
}

/**
 * Logarithmic regression: y = a + b * ln(x)
 */
export function logarithmicRegression(xs: number[], ys: number[]): TrendLineResult {
  const lnX = xs.map(x => Math.log(Math.max(x, 1e-10)));
  const result = linearRegression(lnX, ys);
  const [a, b] = result.coefficients;

  const xMin = Math.max(Math.min(...xs), 1e-10), xMax = Math.max(...xs);
  const steps = 50;
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const x = xMin + (xMax - xMin) * (i / steps);
    points.push({ x, y: a + b * Math.log(x) });
  }

  return { type: 'logarithmic', coefficients: [a, b], rSquared: result.rSquared, points };
}

/**
 * Exponential regression: y = a * e^(b*x)
 * Linearize: ln(y) = ln(a) + b*x
 */
export function exponentialRegression(xs: number[], ys: number[]): TrendLineResult {
  const posYs = ys.filter(y => y > 0);
  if (posYs.length < 2) return { type: 'exponential', coefficients: [0, 0], rSquared: 0, points: [] };

  const filteredXs: number[] = [];
  const lnYs: number[] = [];
  for (let i = 0; i < xs.length; i++) {
    if (ys[i] > 0) { filteredXs.push(xs[i]); lnYs.push(Math.log(ys[i])); }
  }

  const result = linearRegression(filteredXs, lnYs);
  const a = Math.exp(result.coefficients[0]);
  const b = result.coefficients[1];

  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const steps = 50;
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const x = xMin + (xMax - xMin) * (i / steps);
    points.push({ x, y: a * Math.exp(b * x) });
  }

  return { type: 'exponential', coefficients: [a, b], rSquared: result.rSquared, points };
}

/**
 * Power regression: y = a * x^b
 * Linearize: ln(y) = ln(a) + b*ln(x)
 */
export function powerRegression(xs: number[], ys: number[]): TrendLineResult {
  const filteredXs: number[] = [];
  const filteredYs: number[] = [];
  for (let i = 0; i < xs.length; i++) {
    if (xs[i] > 0 && ys[i] > 0) { filteredXs.push(xs[i]); filteredYs.push(ys[i]); }
  }
  if (filteredXs.length < 2) return { type: 'power', coefficients: [0, 0], rSquared: 0, points: [] };

  const lnX = filteredXs.map(x => Math.log(x));
  const lnY = filteredYs.map(y => Math.log(y));
  const result = linearRegression(lnX, lnY);
  const a = Math.exp(result.coefficients[0]);
  const b = result.coefficients[1];

  const xMin = Math.max(Math.min(...xs), 1e-10), xMax = Math.max(...xs);
  const steps = 50;
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const x = xMin + (xMax - xMin) * (i / steps);
    points.push({ x, y: a * Math.pow(x, b) });
  }

  return { type: 'power', coefficients: [a, b], rSquared: result.rSquared, points };
}

/**
 * Auto-detect best trend line type by R-squared.
 */
export function bestFitTrend(xs: number[], ys: number[]): TrendLineResult {
  const candidates = [
    linearRegression(xs, ys),
    polynomialRegression(xs, ys, 2),
    logarithmicRegression(xs, ys),
    exponentialRegression(xs, ys),
    powerRegression(xs, ys),
  ];
  return candidates.reduce((best, c) => c.rSquared > best.rSquared ? c : best);
}

// ── Forecasting ────────────────────────────────────────────

export interface ForecastResult {
  /** Forecasted values beyond the data */
  forecast: { x: number; y: number }[];
  /** Upper confidence bound */
  upper: { x: number; y: number }[];
  /** Lower confidence bound */
  lower: { x: number; y: number }[];
  method: string;
}

/**
 * Simple Exponential Smoothing (SES).
 * Best for data without trend or seasonality.
 */
export function simpleExponentialSmoothing(
  values: number[],
  alpha = 0.3,
  periods = 10,
  xStart = 0,
  xStep = 1,
): ForecastResult {
  const n = values.length;
  if (n < 2) return { forecast: [], upper: [], lower: [], method: 'ses' };

  // Fit: compute smoothed values
  let s = values[0];
  let sumSqErr = 0;
  for (let i = 1; i < n; i++) {
    const err = values[i] - s;
    sumSqErr += err * err;
    s = alpha * values[i] + (1 - alpha) * s;
  }
  const rmse = Math.sqrt(sumSqErr / (n - 1));

  // Forecast: flat from last smoothed value
  const forecast: { x: number; y: number }[] = [];
  const upper: { x: number; y: number }[] = [];
  const lower: { x: number; y: number }[] = [];
  for (let h = 1; h <= periods; h++) {
    const x = xStart + (n - 1 + h) * xStep;
    const ci = 1.96 * rmse * Math.sqrt(h); // 95% CI widens with horizon
    forecast.push({ x, y: s });
    upper.push({ x, y: s + ci });
    lower.push({ x, y: s - ci });
  }

  return { forecast, upper, lower, method: 'ses' };
}

/**
 * Holt's Linear Trend (double exponential smoothing).
 * For data with trend but no seasonality.
 */
export function holtLinearTrend(
  values: number[],
  alpha = 0.3,
  beta = 0.1,
  periods = 10,
  xStart = 0,
  xStep = 1,
): ForecastResult {
  const n = values.length;
  if (n < 3) return { forecast: [], upper: [], lower: [], method: 'holt' };

  // Initialize
  let level = values[0];
  let trend = values[1] - values[0];
  let sumSqErr = 0;

  for (let i = 1; i < n; i++) {
    const err = values[i] - (level + trend);
    sumSqErr += err * err;
    const newLevel = alpha * values[i] + (1 - alpha) * (level + trend);
    trend = beta * (newLevel - level) + (1 - beta) * trend;
    level = newLevel;
  }
  const rmse = Math.sqrt(sumSqErr / (n - 1));

  const forecast: { x: number; y: number }[] = [];
  const upper: { x: number; y: number }[] = [];
  const lower: { x: number; y: number }[] = [];
  for (let h = 1; h <= periods; h++) {
    const x = xStart + (n - 1 + h) * xStep;
    const yHat = level + h * trend;
    const ci = 1.96 * rmse * Math.sqrt(h);
    forecast.push({ x, y: yHat });
    upper.push({ x, y: yHat + ci });
    lower.push({ x, y: yHat - ci });
  }

  return { forecast, upper, lower, method: 'holt' };
}

// ── K-Means Clustering ─────────────────────────────────────

export interface ClusterResult {
  /** Cluster assignment for each point (0-based) */
  labels: number[];
  /** Cluster centroids */
  centroids: { x: number; y: number }[];
  /** Number of iterations */
  iterations: number;
}

/**
 * K-means clustering (Lloyd's algorithm).
 * Optimized for 10k-100k points with typed arrays.
 */
export function kMeansClustering(
  xs: number[],
  ys: number[],
  k = 3,
  maxIter = 50,
): ClusterResult {
  const n = xs.length;
  if (n < k) return { labels: Array(n).fill(0), centroids: [{ x: 0, y: 0 }], iterations: 0 };

  // Initialize centroids via k-means++ seeding
  const centroids: { x: number; y: number }[] = [];
  centroids.push({ x: xs[0], y: ys[0] });

  for (let c = 1; c < k; c++) {
    // Compute distance to nearest centroid for each point
    let totalDist = 0;
    const dists = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let minD = Infinity;
      for (const cent of centroids) {
        const d = (xs[i] - cent.x) ** 2 + (ys[i] - cent.y) ** 2;
        if (d < minD) minD = d;
      }
      dists[i] = minD;
      totalDist += minD;
    }
    // Weighted random selection
    let r = Math.random() * totalDist;
    for (let i = 0; i < n; i++) {
      r -= dists[i];
      if (r <= 0) { centroids.push({ x: xs[i], y: ys[i] }); break; }
    }
    if (centroids.length <= c) centroids.push({ x: xs[n - 1], y: ys[n - 1] });
  }

  const labels = new Int32Array(n);
  let iterations = 0;

  for (let iter = 0; iter < maxIter; iter++) {
    iterations = iter + 1;
    let changed = false;

    // Assign points to nearest centroid
    for (let i = 0; i < n; i++) {
      let bestC = 0, bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const d = (xs[i] - centroids[c].x) ** 2 + (ys[i] - centroids[c].y) ** 2;
        if (d < bestD) { bestD = d; bestC = c; }
      }
      if (labels[i] !== bestC) { labels[i] = bestC; changed = true; }
    }

    if (!changed) break;

    // Update centroids
    const sumX = new Float64Array(k);
    const sumY = new Float64Array(k);
    const counts = new Int32Array(k);
    for (let i = 0; i < n; i++) {
      const c = labels[i];
      sumX[c] += xs[i]; sumY[c] += ys[i]; counts[c]++;
    }
    for (let c = 0; c < k; c++) {
      if (counts[c] > 0) {
        centroids[c].x = sumX[c] / counts[c];
        centroids[c].y = sumY[c] / counts[c];
      }
    }
  }

  return { labels: Array.from(labels), centroids, iterations };
}

// ── Helpers ────────────────────────────────────────────────

function solveLinearSystem(A: number[][], B: number[]): number[] | null {
  const n = A.length;
  const aug = A.map((row, i) => [...row, B[i]]);

  for (let col = 0; col < n; col++) {
    // Partial pivoting
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) maxRow = row;
    }
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];

    if (Math.abs(aug[col][col]) < 1e-12) return null;

    // Eliminate below
    for (let row = col + 1; row < n; row++) {
      const factor = aug[row][col] / aug[col][col];
      for (let j = col; j <= n; j++) aug[row][j] -= factor * aug[col][j];
    }
  }

  // Back substitution
  const result = new Array(n);
  for (let row = n - 1; row >= 0; row--) {
    result[row] = aug[row][n];
    for (let col = row + 1; col < n; col++) result[row] -= aug[row][col] * result[col];
    result[row] /= aug[row][row];
  }

  return result;
}

/**
 * Extract numeric x/y arrays from row data for a given spec.
 */
export function extractXY(
  rows: Row[],
  xField: string,
  yField: string,
): { xs: number[]; ys: number[] } {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const row of rows) {
    const xv = Number(row[xField]);
    const yv = Number(row[yField]);
    if (!isNaN(xv) && !isNaN(yv)) { xs.push(xv); ys.push(yv); }
  }
  return { xs, ys };
}
