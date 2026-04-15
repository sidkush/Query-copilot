/**
 * FrameBudgetTracker — rolling p95 frame time measurement.
 *
 * Measures how long the browser is taking to paint frames and exposes
 * a three-way state (`loose` / `normal` / `tight`) that the Render Strategy
 * Router uses to decide whether to escalate a chart to a heavier-but-faster
 * renderer.
 *
 * Implementation notes:
 * - 60-frame circular buffer (one second of history at 60fps)
 * - p95 computed on sorted buffer
 * - Hysteresis hold prevents single-frame GC pauses from causing oscillation
 * - SSR-safe: rAF loop only starts when window + requestAnimationFrame exist
 * - Pub/sub for Zustand/React integration without introducing a dep
 */

import { THRESHOLDS } from '../rsr/thresholds.js';

const BUFFER_SIZE = 60;

/**
 * @typedef {import('../rsr/strategy.js').FrameBudgetState} FrameBudgetState
 */

/**
 * @typedef {Object} FrameBudgetTrackerOptions
 * @property {number} [holdMs] - Hysteresis hold time in ms before a state change propagates.
 */

export class FrameBudgetTracker {
  /**
   * @param {FrameBudgetTrackerOptions} [options]
   */
  constructor(options = {}) {
    /** @type {number[]} */
    this.buffer = [];
    this.writeIndex = 0;
    /** @type {FrameBudgetState} */
    this.state = 'normal';
    /** @type {FrameBudgetState} */
    this.pendingState = 'normal';
    this.pendingSince = 0;
    this.holdMs = options.holdMs ?? THRESHOLDS.FRAME_BUDGET_HYSTERESIS_MS;
    /** @type {Set<(state: FrameBudgetState) => void>} */
    this.listeners = new Set();
    /** @type {number | null} */
    this.rafId = null;
    this.lastFrameTs = 0;
  }

  /** Start the rAF loop. Safe to call multiple times. */
  start() {
    if (this.rafId !== null) return;
    if (typeof window === 'undefined' || typeof requestAnimationFrame === 'undefined') return;
    const tick = (ts) => {
      if (this.lastFrameTs > 0) this.recordFrameTime(ts - this.lastFrameTs);
      this.lastFrameTs = ts;
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  stop() {
    if (this.rafId !== null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.rafId);
    }
    this.rafId = null;
    this.lastFrameTs = 0;
  }

  /**
   * @param {number} ms
   */
  recordFrameTime(ms) {
    if (this.buffer.length < BUFFER_SIZE) {
      this.buffer.push(ms);
    } else {
      this.buffer[this.writeIndex] = ms;
      this.writeIndex = (this.writeIndex + 1) % BUFFER_SIZE;
    }
    this.evaluate();
  }

  /** @returns {FrameBudgetState} */
  getState() {
    return this.state;
  }

  /**
   * @param {(state: FrameBudgetState) => void} listener
   * @returns {() => void} unsubscribe fn
   */
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  evaluate() {
    if (this.buffer.length < 10) return; // wait for signal
    const sorted = [...this.buffer].sort((a, b) => a - b);
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    /** @type {FrameBudgetState} */
    let next;
    if (p95 >= THRESHOLDS.FRAME_BUDGET_TIGHT_MS) next = 'tight';
    else if (p95 < THRESHOLDS.FRAME_BUDGET_LOOSE_MS) next = 'loose';
    else next = 'normal';

    if (next === this.state) {
      this.pendingState = next;
      this.pendingSince = 0;
      return;
    }

    if (next !== this.pendingState) {
      this.pendingState = next;
      this.pendingSince = Date.now();
      return;
    }

    if (this.holdMs === 0 || (Date.now() - this.pendingSince) >= this.holdMs) {
      this.state = next;
      for (const l of this.listeners) {
        try {
          l(this.state);
        } catch {
          // swallow listener errors — one broken subscriber must not poison others
        }
      }
    }
  }
}

/** Process-wide singleton, lazily started on first import-with-DOM. */
export const globalFrameBudgetTracker = new FrameBudgetTracker();
