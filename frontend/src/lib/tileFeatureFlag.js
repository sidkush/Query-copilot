/**
 * tileFeatureFlag — per-chart-type kill switch via localStorage.
 *
 * Production safety net. If a specific chart type starts crashing
 * (say, the globe engine OOMs on a low-end laptop) we can kill it
 * without a redeploy by running in DevTools:
 *
 *   localStorage.setItem('ff.sparkline_kpi', 'disabled')
 *
 * Disabled tiles render a neutral "this chart type is currently
 * disabled" message instead of crashing. Enabled is the default; we
 * only track disabled state so rolled-out flags don't need an entry.
 */

const PREFIX = 'ff.';

/** Returns true if the chart type is currently enabled. */
export function isEnabled(chartType) {
  if (!chartType) return true;
  try {
    return localStorage.getItem(PREFIX + chartType) !== 'disabled';
  } catch {
    // localStorage may throw in private mode / sandboxed iframes
    return true;
  }
}

/** Kill a chart type for this browser only (call from DevTools). */
export function disable(chartType) {
  if (!chartType) return;
  try {
    localStorage.setItem(PREFIX + chartType, 'disabled');
  } catch {
    // ignore
  }
}

/** Re-enable a previously disabled chart type. */
export function enable(chartType) {
  if (!chartType) return;
  try {
    localStorage.removeItem(PREFIX + chartType);
  } catch {
    // ignore
  }
}

/** List every currently-disabled chart type (for admin UIs). */
export function listDisabled() {
  try {
    const out = [];
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith(PREFIX) && localStorage.getItem(k) === 'disabled') {
        out.push(k.slice(PREFIX.length));
      }
    }
    return out;
  } catch {
    return [];
  }
}
