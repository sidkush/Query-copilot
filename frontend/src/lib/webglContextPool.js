/**
 * webglContextPool — LRU pool for WebGL contexts.
 *
 * Browsers cap concurrent WebGL contexts (Chrome ~16, Safari ~8, Firefox ~12).
 * A dense dashboard with 10+ three.js tiles can blow that cap and start
 * losing contexts silently (old canvases go black). This module front-runs
 * that by:
 *
 *   1. Capping our own concurrent count at 8 (under the lowest browser limit)
 *   2. Evicting the least-recently-used tile when a 9th tries to register
 *   3. Calling its `onEvict` callback so the engine can gracefully fall
 *      back to 2D / un-mount
 *   4. Listening for the global `webglcontextlost` event and notifying
 *      subscribers so individual engines can recover
 *
 * Infrastructure only — no consumers until Phase 4 ships 3D engines.
 */

const MAX_CONTEXTS = 8;

/** id -> { lastUsed, onEvict } */
const active = new Map();
const lostListeners = new Set();

/**
 * Register a WebGL consumer. `onEvict` fires if this id is chosen as the
 * LRU victim when a new consumer registers. The engine should release its
 * renderer and render a 2D fallback (or null) from its onEvict handler.
 */
export function acquireContext(id, onEvict) {
  if (!id) return;
  active.set(id, { lastUsed: Date.now(), onEvict });
  enforceCap();
}

/** Update the last-used timestamp — call on interaction / data refresh. */
export function touchContext(id) {
  const entry = active.get(id);
  if (entry) entry.lastUsed = Date.now();
}

/** Release a context when the tile unmounts. */
export function releaseContext(id) {
  active.delete(id);
}

/** Current count — used by tests and stress checks. */
export function activeCount() {
  return active.size;
}

function enforceCap() {
  if (active.size <= MAX_CONTEXTS) return;
  let victimId = null;
  let victimTs = Infinity;
  for (const [id, entry] of active) {
    if (entry.lastUsed < victimTs) {
      victimTs = entry.lastUsed;
      victimId = id;
    }
  }
  if (victimId) {
    const entry = active.get(victimId);
    try {
      entry?.onEvict?.();
    } catch {
      // onEvict handlers must not crash the pool — swallow and continue
    }
    active.delete(victimId);
  }
}

/**
 * Subscribe to global webglcontextlost events. Returns an unsubscribe fn.
 * Engines call this to know when to re-initialize after GPU hiccups.
 */
export function onContextLost(listener) {
  lostListeners.add(listener);
  return () => lostListeners.delete(listener);
}

if (typeof window !== 'undefined') {
  window.addEventListener(
    'webglcontextlost',
    (event) => {
      for (const listener of lostListeners) {
        try {
          listener(event);
        } catch {
          // one broken listener must not poison the rest
        }
      }
    },
    true
  );
}
