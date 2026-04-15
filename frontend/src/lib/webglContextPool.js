/**
 * webglContextPool — backward-compat shim over chart-ir/perf/instancePool.
 *
 * Existing Three.js engines (ThreeScatter3D, ThreeHologram, ThreeParticleFlow,
 * GeoMap) call acquireContext / releaseContext / touchContext / onContextLost.
 * Sub-project B replaces this with a unified pool that also tracks Vega
 * Canvas, MapLibre, and deck.gl instances. This shim preserves the old
 * surface so engines don't need to migrate.
 *
 * Three engines register with kind 'three'. Other renderer kinds
 * (vega-canvas/maplibre/deck) use the new InstancePool API directly.
 */

import { globalInstancePool } from '../chart-ir/perf/instancePool.js';

export function acquireContext(id, onEvict) {
  globalInstancePool.acquireSlot('three', id, onEvict ?? (() => {}));
}

export function touchContext(id) {
  globalInstancePool.touchSlot(id);
}

export function releaseContext(id) {
  globalInstancePool.releaseSlot(id);
}

export function activeCount() {
  return globalInstancePool.activeWebglContexts();
}

const lostListeners = new Set();

export function onContextLost(listener) {
  lostListeners.add(listener);
  return () => lostListeners.delete(listener);
}

if (typeof window !== 'undefined') {
  window.addEventListener('webglcontextlost', (event) => {
    for (const listener of lostListeners) {
      try {
        listener(event);
      } catch {
        // swallow listener errors
      }
    }
  }, true);
}
