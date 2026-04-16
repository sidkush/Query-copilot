// sw-chart-prewarm.js — pre-warm chart rendering bundles
//
// This service worker caches chart-related JS assets so that the
// ChartEditor and VegaRenderer load instantly after the first visit.
//
// CHART_ASSETS is intentionally kept as a commented template; the build
// system (or a post-build script) should replace the placeholder comments
// with the actual hashed filenames emitted by Vite. Until then only
// explicitly listed paths are cached — the list is safe to leave empty.
const CHART_ASSETS = [
  // Populated by the build system — add hashed filenames here, e.g.:
  // '/assets/vega-lite-<hash>.js',
  // '/assets/chart-ir-<hash>.js',
  // '/assets/react-vega-<hash>.js',
];

const CACHE_NAME = 'askdb-chart-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      const validAssets = CHART_ASSETS.filter(Boolean);
      if (validAssets.length === 0) return Promise.resolve();
      return cache.addAll(validAssets);
    })
  );
  // Activate immediately — don't wait for existing tabs to close.
  self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  // Only intercept GET requests for chart assets.
  if (request.method !== 'GET') return;
  const isChartAsset = CHART_ASSETS.some((asset) => asset && request.url.includes(asset));
  if (!isChartAsset) return;

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
  );
});

self.addEventListener('activate', (event) => {
  // Purge stale caches from previous versions.
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('askdb-chart-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});
