/**
 * Color palettes — Tableau 10 categorical + Viridis sequential + RdBu diverging.
 */

/** Tableau 10 — the industry-standard categorical palette */
export const TABLEAU_10 = [
  '#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f',
  '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac',
];

/** Extended 20-color palette for high-cardinality dimensions */
export const TABLEAU_20 = [
  '#4e79a7', '#a0cbe8', '#f28e2b', '#ffbe7d', '#59a14f',
  '#8cd17d', '#b6992d', '#f1ce63', '#499894', '#86bcb6',
  '#e15759', '#ff9d9a', '#79706e', '#bab0ac', '#d37295',
  '#fabfd2', '#b07aa1', '#d4a6c8', '#9d7660', '#d7b5a6',
];

/** Viridis — perceptually uniform, colorblind-safe sequential */
export const VIRIDIS_10 = [
  '#440154', '#482777', '#3e4989', '#31688e', '#26838f',
  '#1f9d8a', '#6cce5a', '#b6de2b', '#fee825', '#fee825',
];

/** RdBu diverging — red negative, blue positive */
export const RDBU_10 = [
  '#67001f', '#b2182b', '#d6604d', '#f4a582', '#fddbc7',
  '#d1e5f0', '#92c5de', '#4393c3', '#2166ac', '#053061',
];

/** Default gray for single-series charts */
export const DEFAULT_MARK_COLOR = '#4e79a7';

/** Background/grid colors */
export const CHART_BG = '#ffffff';
export const GRID_COLOR = '#e8e8e8';
export const AXIS_COLOR = '#333333';
export const TICK_COLOR = '#888888';
export const LABEL_COLOR = '#555555';

/**
 * Get a categorical color for a value index.
 */
export function categoricalColor(index: number, palette = TABLEAU_10): string {
  return palette[index % palette.length];
}

/**
 * Interpolate a sequential color from a 0-1 normalized value.
 * Simple linear interpolation between Viridis stops.
 */
export function sequentialColor(t: number, palette = VIRIDIS_10): string {
  const clamped = Math.max(0, Math.min(1, t));
  const idx = clamped * (palette.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(lo + 1, palette.length - 1);
  const frac = idx - lo;

  if (frac < 0.01) return palette[lo];
  return lerpColor(palette[lo], palette[hi], frac);
}

function lerpColor(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `rgb(${r},${g},${bl})`;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}
