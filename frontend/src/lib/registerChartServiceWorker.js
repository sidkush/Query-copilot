/**
 * registerChartServiceWorker.js
 *
 * Registers the chart pre-warming service worker (sw-chart-prewarm.js).
 * Call once at app startup — after the React tree mounts — so that the SW
 * can begin caching chart bundles in the background without blocking the
 * initial render.
 *
 * The registration is silently skipped in environments where the Service
 * Worker API is unavailable (SSR, older browsers, insecure origins).
 */
export function registerChartServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  // Defer until after the page has loaded so registration work does not
  // compete with critical-path resources.
  const register = () => {
    navigator.serviceWorker
      .register('/sw-chart-prewarm.js', { scope: '/' })
      .then((reg) => {
        console.log('[SW] Chart pre-warm registered', reg.scope);
      })
      .catch((err) => {
        console.warn('[SW] Chart pre-warm registration failed', err);
      });
  };

  if (document.readyState === 'complete') {
    register();
  } else {
    window.addEventListener('load', register, { once: true });
  }
}
