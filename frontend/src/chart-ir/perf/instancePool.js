/**
 * InstancePool — unified pool for Vega Canvas, Vega SVG, MapLibre, deck.gl,
 * and Three.js renderer instances.
 *
 * Replaces the legacy `lib/webglContextPool.js`, which only counted WebGL
 * contexts. The new pool is also memory-aware so dashboards dense with
 * Vega Canvas tiles don't OOM the renderer process even if zero WebGL
 * contexts are open.
 *
 * Eviction policy: LRU, with a preference for WebGL-consuming kinds when
 * both a WebGL and a non-WebGL slot are eligible for eviction — because
 * WebGL contexts are the scarcer resource on most GPUs.
 */

/**
 * @typedef {'vega-svg' | 'vega-canvas' | 'maplibre' | 'deck' | 'three'} InstanceKind
 */

/**
 * @typedef {Object} SlotEntry
 * @property {InstanceKind} kind
 * @property {string} id
 * @property {number} lastUsed
 * @property {() => void} onEvict
 */

/**
 * @typedef {Object} InstanceWeight
 * @property {0 | 1} webglContext
 * @property {number} estimatedMb
 */

/** @type {Record<InstanceKind, InstanceWeight>} */
const WEIGHTS = {
  'vega-svg':    { webglContext: 0, estimatedMb: 5 },
  'vega-canvas': { webglContext: 0, estimatedMb: 12 },
  'maplibre':    { webglContext: 1, estimatedMb: 60 },
  'deck':        { webglContext: 1, estimatedMb: 80 },
  'three':       { webglContext: 1, estimatedMb: 50 },
};

/**
 * @typedef {Object} InstancePoolOptions
 * @property {number} [max]
 * @property {number} [memoryCapMb]
 */

export class InstancePool {
  /**
   * @param {InstancePoolOptions} [options]
   */
  constructor(options = {}) {
    /** @type {Map<string, SlotEntry>} */
    this.slots = new Map();
    this.max = options.max ?? 12;
    this.memoryCap = options.memoryCapMb ?? 700;
    this.sequenceCounter = 0;
  }

  /**
   * @param {InstanceKind} kind
   * @param {string} id
   * @param {() => void} onEvict
   */
  acquireSlot(kind, id, onEvict) {
    if (!id) return;
    this.slots.set(id, { kind, id, lastUsed: this.sequenceCounter++, onEvict });
    this.enforceCap();
  }

  /**
   * @param {string} id
   */
  touchSlot(id) {
    const entry = this.slots.get(id);
    if (entry) entry.lastUsed = this.sequenceCounter++;
  }

  /**
   * @param {string} id
   */
  releaseSlot(id) {
    this.slots.delete(id);
  }

  /** @returns {number} */
  activeWebglContexts() {
    let n = 0;
    for (const e of this.slots.values()) n += WEIGHTS[e.kind].webglContext;
    return n;
  }

  /** @returns {number} */
  estimatedMemoryMb() {
    let m = 0;
    for (const e of this.slots.values()) m += WEIGHTS[e.kind].estimatedMb;
    return m;
  }

  /** @returns {number} */
  pressureRatio() {
    const webglRatio = this.activeWebglContexts() / this.max;
    const memoryRatio = this.estimatedMemoryMb() / this.memoryCap;
    return Math.max(webglRatio, memoryRatio);
  }

  /** @returns {number} */
  size() {
    return this.slots.size;
  }

  enforceCap() {
    while (this.slots.size > this.max || this.estimatedMemoryMb() > this.memoryCap) {
      const victim = this.pickVictim();
      if (!victim) break;
      try {
        victim.onEvict();
      } catch {
        // swallow eviction handler errors
      }
      this.slots.delete(victim.id);
    }
  }

  /** @returns {SlotEntry | null} */
  pickVictim() {
    /** @type {SlotEntry | null} */
    let webglVictim = null;
    let webglTs = Infinity;
    /** @type {SlotEntry | null} */
    let anyVictim = null;
    let anyTs = Infinity;
    for (const e of this.slots.values()) {
      if (e.lastUsed < anyTs) {
        anyTs = e.lastUsed;
        anyVictim = e;
      }
      if (WEIGHTS[e.kind].webglContext === 1 && e.lastUsed < webglTs) {
        webglTs = e.lastUsed;
        webglVictim = e;
      }
    }
    return webglVictim ?? anyVictim;
  }
}

/** Process-wide singleton. */
export const globalInstancePool = new InstancePool();
