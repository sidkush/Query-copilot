import '@testing-library/jest-dom/vitest';

/**
 * Vitest setup — global jsdom polyfills.
 *
 * jsdom v25 does not implement `window.matchMedia` (used by the Zustand
 * store slice + theme system) or `HTMLCanvasElement.prototype.getContext`
 * (used by `lib/gpuDetect.getGPUTier`). We stub them here so component
 * tests don't crash during module-load.
 *
 * This file is wired in via vitest.config.ts `test.setupFiles`.
 */

// window.matchMedia polyfill — returns a permanent "not matching" media query list
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

// HTMLCanvasElement.getContext stub — `getGPUTier` probes WebGL on every
// editor mount. jsdom's native `getContext` logs a "not implemented"
// warning to stderr, so we unconditionally override with a no-op that
// returns null. `getGPUTier` falls through to the CPU-core heuristic.
if (typeof HTMLCanvasElement !== 'undefined') {
  (HTMLCanvasElement.prototype as unknown as {
    getContext: (contextType: string) => unknown;
  }).getContext = () => null;
}

// ResizeObserver polyfill — jsdom v25 does not implement ResizeObserver
// which `react-grid-layout` + `AnalystWorkbenchLayout`'s container-width
// hook both use. A no-op stub is enough for component smoke tests.
if (typeof globalThis !== 'undefined' && typeof (globalThis as unknown as { ResizeObserver?: unknown }).ResizeObserver === 'undefined') {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;
}
