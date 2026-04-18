/**
 * Color palettes — Tableau 10 categorical + Viridis sequential + RdBu diverging.
 */

import { getPreset } from '../components/dashboard/presets/registry';

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

/**
 * Chart chrome colors — theme-reactive via ES-module `export let` live bindings.
 * Consumers use `import { CHART_BG } from './palettes'` as before; values update
 * automatically when the `.light` class is toggled on `<html>`.
 *
 * CHART_BG is `transparent` so the tile's own background shows through — this
 * fixes the "white chart on dark tile" visual clash across all dashboard modes.
 */
export let CHART_BG = 'transparent';
export let GRID_COLOR = 'rgba(255,255,255,0.06)';
export let AXIS_COLOR = 'rgba(235,238,245,0.72)';
export let TICK_COLOR = 'rgba(235,238,245,0.48)';
export let LABEL_COLOR = 'rgba(235,238,245,0.85)';
export let SLICE_SEPARATOR = 'rgba(20,22,30,0.9)';

function _applyChartTheme(scheme: 'dark' | 'light'): void {
  if (scheme === 'light') {
    CHART_BG = 'transparent';
    GRID_COLOR = 'rgba(15,23,42,0.10)';
    AXIS_COLOR = 'rgba(15,23,42,0.82)';
    TICK_COLOR = 'rgba(15,23,42,0.60)';
    LABEL_COLOR = 'rgba(15,23,42,0.92)';
    SLICE_SEPARATOR = 'rgba(255,255,255,0.95)';
  } else {
    CHART_BG = 'transparent';
    GRID_COLOR = 'rgba(255,255,255,0.06)';
    AXIS_COLOR = 'rgba(235,238,245,0.72)';
    TICK_COLOR = 'rgba(235,238,245,0.48)';
    LABEL_COLOR = 'rgba(235,238,245,0.85)';
    SLICE_SEPARATOR = 'rgba(20,22,30,0.9)';
  }
}

/**
 * Force a chart-chrome scheme. Called by the theme store subscriber and by
 * dashboard-mode enforcement logic (e.g. LiveOps forces dark, Story forces light).
 */
export function setChartChromeScheme(scheme: 'dark' | 'light'): void {
  _applyChartTheme(scheme);
}

/**
 * Force chart chrome from the active dashboard preset. Resolves the preset
 * via `getPreset()` (unknown ids fall back to the default analyst-pro preset)
 * and applies its `scheme`. Per-preset chrome palette overrides (phosphor
 * green for Operator Console, amber event markers for Editorial Brief) land
 * in Plans B-E; for now the scheme is all we need.
 *
 * Wave 2-C · Plan A · Task 13.
 */
export function setChartChromeFromPreset(presetId: string): void {
  const preset = getPreset(presetId);
  _applyChartTheme(preset.scheme);
}

// On load + whenever <html> class changes — sync to the active theme.
if (typeof document !== 'undefined') {
  const html = document.documentElement;
  const read = () => (html.classList.contains('light') ? 'light' : 'dark');
  _applyChartTheme(read());
  try {
    const obs = new MutationObserver(() => _applyChartTheme(read()));
    obs.observe(html, { attributes: true, attributeFilter: ['class'] });
  } catch {
    // SSR / restrictive env — one-shot apply is fine.
  }
}

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
