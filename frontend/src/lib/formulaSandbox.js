/**
 * Formula sandbox — runs metric evaluations in a Web Worker with 500ms timeout.
 * Falls back to main-thread evaluation if Web Workers are unavailable.
 */

import { computeMetricForRows, injectMetricColumns } from './metricEvaluator';

let worker = null;
let msgId = 0;
const pending = new Map();

const TIMEOUT_MS = 500;

function getWorker() {
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./formulaWorker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const { id, ...result } = e.data;
      const entry = pending.get(id);
      if (entry) {
        clearTimeout(entry.timer);
        pending.delete(id);
        entry.resolve(result);
      }
    };
    worker.onerror = () => {
      // Worker failed to load — disable it
      worker = null;
    };
    return worker;
  } catch {
    return null;
  }
}

function postToWorker(data) {
  return new Promise((resolve) => {
    const w = getWorker();
    if (!w) {
      // Fallback to main thread
      resolve(null);
      return;
    }
    const id = ++msgId;
    const timer = setTimeout(() => {
      pending.delete(id);
      // Timeout — terminate and recreate worker
      w.terminate();
      worker = null;
      resolve(null); // fallback to main thread
    }, TIMEOUT_MS);
    pending.set(id, { resolve, timer });
    w.postMessage({ id, ...data });
  });
}

/**
 * Compute a single metric formula with sandbox protection.
 * @param {string} formula
 * @param {object[]} rows
 * @returns {Promise<{value: number|null, error: string|null}>}
 */
export async function sandboxComputeMetric(formula, rows) {
  const result = await postToWorker({ type: 'compute', formula, rows });
  if (result && result.error === null) {
    return { value: result.value, error: null };
  }
  if (result && result.error) {
    return { value: null, error: result.error };
  }
  // Fallback to main thread
  return computeMetricForRows(formula, rows);
}

/**
 * Inject custom metric columns with sandbox protection.
 * @param {Array<{id, name, formula}>} metrics
 * @param {string[]} columns
 * @param {object[]} rows
 * @returns {Promise<{columns: string[], rows: object[]}>}
 */
export async function sandboxInjectMetrics(metrics, columns, rows) {
  if (!metrics?.length || !rows?.length) return { columns, rows };
  const result = await postToWorker({ type: 'inject', metrics, columns, rows });
  if (result && !result.error) {
    return { columns: result.columns, rows: result.rows };
  }
  // Fallback to main thread
  return injectMetricColumns(metrics, columns, rows);
}

/**
 * Terminate the worker (cleanup on unmount).
 */
export function terminateFormulaWorker() {
  if (worker) {
    worker.terminate();
    worker = null;
  }
  for (const [, entry] of pending) {
    clearTimeout(entry.timer);
  }
  pending.clear();
}
