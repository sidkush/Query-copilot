# Performance Optimization: Parallel Queries, Bundle Splitting & 3D Optimization

## Problem

Two compounding performance issues:

1. **Dashboard tile queries execute sequentially.** The backend `refresh_tile` endpoint calls synchronous `execute_query()` which blocks the FastAPI event loop thread. The frontend refreshes tiles in a `for...of await` loop (DashboardBuilder.jsx line 122), sending one HTTP request at a time. A 15-tile dashboard with 2s queries takes ~30s instead of ~3s.

2. **Page load times increased after 3D animation rollout.** The main JS bundle is 1.4MB (all 13 pages imported statically in App.jsx). Both `Background3D` and `SectionBackground3D` Canvas components default to `frameloop="always"` (60fps continuous rendering). The Landing page mounts 7 simultaneous WebGL contexts. Export libraries (jspdf + html2canvas, 600KB) are bundled globally despite being used only on export.

## Success Criteria

- Dashboard refresh: total time = `max(query_times)` instead of `sum(query_times)`
- Initial page load JS: under 250KB (down from 1.4MB)
- First Contentful Paint: HTML text renders before 3D canvases initialize
- 3D animations retained at full quality on capable hardware, auto-degraded on low-end devices
- Zero GPU cost when tab is inactive or 3D section is off-screen

---

## Design

### 1. Backend: Parallel Tile Execution

#### 1a. `asyncio.to_thread` wrapping in `refresh_tile`

**File:** `backend/routers/dashboard_routes.py`

Wrap every `entry.connector.execute_query(sql)` call in `await asyncio.to_thread(...)`:

- Line ~323 (KPI current query): `df_current = await asyncio.to_thread(entry.connector.execute_query, target_sql)`
- Line ~324 (KPI previous query): `df_prev = await asyncio.to_thread(entry.connector.execute_query, prev_sql)`
- Line ~397 (standard tile): `df = await asyncio.to_thread(entry.connector.execute_query, target_sql)`

For KPI twin queries, gather both concurrently:
```python
df_current, df_prev = await asyncio.gather(
    asyncio.to_thread(entry.connector.execute_query, current_sql),
    asyncio.to_thread(entry.connector.execute_query, prev_sql),
)
```

This unblocks FastAPI's event loop so concurrent HTTP requests from the frontend run on parallel threads instead of queuing.

#### 1b. New `POST /api/dashboards/{id}/refresh-all` bulk endpoint

**File:** `backend/routers/dashboard_routes.py`

Request body:
```json
{
  "tile_ids": ["abc123", "def456", ...],
  "conn_id": "optional-conn-id",
  "filters": { "dateColumn": "...", "range": "...", "fields": [...] }
}
```

Response:
```json
{
  "results": {
    "abc123": { "columns": [...], "rows": [...], "rowCount": 42 },
    "def456": { "columns": [...], "rows": [...], "rowCount": 18 },
    "ghi789": { "error": "Query timeout" }
  }
}
```

Implementation: Reuse the existing `refresh_tile` logic internally. For each tile_id, build an async coroutine that finds the tile, validates SQL, applies filters, and calls `asyncio.to_thread(execute_query)`. Dispatch all coroutines via `asyncio.gather(*tasks, return_exceptions=True)`. Failed tiles return error strings; successful tiles return data. All persist via `update_tile()`.

**File:** `frontend/src/api.js`

Add:
```js
refreshBulk: (dashboardId, tileIds, connId, filters) =>
  request(`/dashboards/${dashboardId}/refresh-all`, {
    method: "POST",
    body: JSON.stringify({ tile_ids: tileIds, conn_id: connId, filters }),
  }),
```

---

### 2. Frontend: Dashboard Refresh Fix

#### 2a. Replace sequential loop with bulk call

**File:** `frontend/src/pages/DashboardBuilder.jsx` (lines 106-148)

Replace the `for (const tileId of stale) { await api.refreshTile(...) }` loop with:

```js
const results = await api.refreshBulk(activeDashboard.id, stale, connId, filters);
// Apply all results to state in one setState call
setActiveDashboard(prev => {
  const tabs = prev.tabs.map(tab => ({
    ...tab,
    sections: tab.sections.map(sec => ({
      ...sec,
      tiles: sec.tiles.map(t =>
        results[t.id] && !results[t.id].error
          ? { ...t, ...results[t.id] }
          : t
      ),
    })),
  }));
  return { ...prev, tabs };
});
```

Fallback: If bulk endpoint returns 404 (older backend), fall back to `Promise.allSettled(stale.map(id => api.refreshTile(...)))`.

Also update `handleGlobalFiltersChange` (line 597) which currently uses `Promise.allSettled` with individual refresh calls — switch to `api.refreshBulk` for the same single-request benefit.

#### 2b. AbortController for dashboard/tab switches

**File:** `frontend/src/pages/DashboardBuilder.jsx`

Store an `AbortController` ref. Pass `signal` to the bulk fetch call. On useEffect cleanup (dashboard ID changes), call `controller.abort()`. Prevents stale results from overwriting fresh data and cancels wasted network/DB work.

---

### 3. Frontend: Bundle Size & Code Splitting

#### 3a. Route-level lazy loading

**File:** `frontend/src/App.jsx` (lines 4-17)

Replace all static page imports with `React.lazy()`:
```js
const Landing = lazy(() => import("./pages/Landing"));
const Login = lazy(() => import("./pages/Login"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Chat = lazy(() => import("./pages/Chat"));
const DashboardBuilder = lazy(() => import("./pages/DashboardBuilder"));
// ... all 13 pages
```

Wrap route outlet in `<Suspense fallback={<PageSkeleton />}>` where `PageSkeleton` is a lightweight full-page shimmer (no WebGL, no heavy dependencies).

Expected initial JS: ~200KB (React + Router + Zustand + active page chunk).

#### 3b. Dynamic import for export libraries

**File:** `frontend/src/components/dashboard/ExportModal.jsx`

Replace top-level `import jsPDF` and `import html2canvas` with dynamic imports triggered only when user initiates export:
```js
const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
  import('jspdf'),
  import('html2canvas'),
]);
```

Expected savings: ~600KB removed from main bundle.

#### 3c. Vite manual chunk splitting

**File:** `frontend/vite.config.js`

Add `build.rollupOptions.output.manualChunks`:
```js
manualChunks: {
  'vendor-react': ['react', 'react-dom', 'react-router-dom'],
  'vendor-three': ['three', '@react-three/fiber', '@react-three/drei'],
  'vendor-charts': ['recharts'],
  'vendor-motion': ['framer-motion'],
}
```

These vendor chunks are long-term cacheable. Page-specific code is in separate per-route chunks.

---

### 4. Frontend: 3D Performance Optimization

#### 4a. `frameloop="demand"`

**Files:** `frontend/src/components/animation/Background3D.jsx` (line 300), `frontend/src/components/animation/SectionBackground3D.jsx` (line 401)

Add `frameloop="demand"` to both `<Canvas>` elements. Inside each scene component, call `invalidate()` from `useFrame` callbacks to request re-renders only when animating. Add a `document.hidden` check — stop invalidating when the browser tab is inactive.

#### 4b. `startTransition` for Canvas mount

**Files:** `frontend/src/pages/Chat.jsx`, `frontend/src/pages/DashboardBuilder.jsx`, `frontend/src/pages/Landing.jsx`

Wrap 3D background mount in `React.startTransition(() => setShow3D(true))` via a useEffect. HTML content paints as high-priority; WebGL initializes as low-priority background task. Users see text and inputs instantly; 3D fades in 1-2 frames later.

#### 4c. IntersectionObserver for viewport-gated mounting

**New file:** `frontend/src/components/animation/LazyCanvas.jsx`

A thin wrapper that uses `IntersectionObserver` to only mount the Canvas when the container scrolls into the viewport (`rootMargin: "200px"` for pre-loading just before visible). Unmounts when scrolled out.

On Landing page, this means at most 1-2 active WebGL contexts instead of 7. Landing.jsx replaces direct `<SectionBackground3D>` usage with `<LazyCanvas><SectionBackground3D mode="..." /></LazyCanvas>`.

#### 4d. `PerformanceMonitor` from `@react-three/drei`

**Files:** `frontend/src/components/animation/Background3D.jsx`, `frontend/src/components/animation/SectionBackground3D.jsx`

Wrap scene children in `<PerformanceMonitor onDecline={() => setDegraded(true)} onIncline={() => setDegraded(false)}>`. When FPS drops below threshold:
- Reduce particle counts by 50%
- Drop `dpr` to `[1, 1]`

When FPS recovers, restore full quality. `@react-three/drei@^10.7.7` is already installed.

---

## Files to Create

| File | Purpose |
|---|---|
| `frontend/src/components/animation/LazyCanvas.jsx` | IntersectionObserver wrapper for viewport-gated 3D mounting |

## Files to Modify

| File | Change |
|---|---|
| `backend/routers/dashboard_routes.py` | `asyncio.to_thread` wrapping + new `/refresh-all` bulk endpoint |
| `frontend/src/api.js` | Add `refreshBulk()` API function |
| `frontend/src/pages/DashboardBuilder.jsx` | Replace `for...of await` with bulk call + AbortController |
| `frontend/src/App.jsx` | Route-level `React.lazy()` for all 13 page imports |
| `frontend/vite.config.js` | Manual chunk splitting config |
| `frontend/src/components/dashboard/ExportModal.jsx` | Dynamic import for jspdf + html2canvas |
| `frontend/src/components/animation/Background3D.jsx` | `frameloop="demand"`, `PerformanceMonitor`, `startTransition` |
| `frontend/src/components/animation/SectionBackground3D.jsx` | `frameloop="demand"`, `PerformanceMonitor` |
| `frontend/src/pages/Landing.jsx` | Wrap SectionBackground3D in LazyCanvas |
| `frontend/src/pages/Chat.jsx` | `startTransition` for 3D mount |
| `frontend/src/pages/DashboardBuilder.jsx` | `startTransition` for 3D mount |

---

## Verification

1. **Dashboard parallel queries** — Load a dashboard with 10+ tiles. Open browser Network tab. Confirm one `/refresh-all` request instead of N individual requests. Total load time should approximate the slowest single query, not the sum.

2. **Bundle size** — Run `npm run build`. Confirm main chunk is under 300KB. Confirm `vendor-three`, `vendor-charts`, `vendor-motion` are separate cached chunks. Confirm jspdf/html2canvas are NOT in the main bundle.

3. **First Contentful Paint** — Hard-refresh any page. HTML text and inputs should appear instantly. 3D background should fade in 100-200ms later (visible as a brief flash of the 2D fallback or empty space before 3D loads).

4. **Landing page GPU** — Open Chrome DevTools Performance tab. Scroll through Landing page. Confirm only 1-2 WebGL contexts are active at any time (not 7). Confirm GPU activity drops to near-zero when scrolled past all 3D sections.

5. **Tab inactive** — Open dashboard with 3D background. Switch to another browser tab. Confirm GPU usage drops to zero (Chrome Task Manager).

6. **Low-end device** — Throttle CPU to 4x slowdown in DevTools. 3D should auto-degrade (fewer particles, lower DPR) without UI jank.

7. **Abort on switch** — Load a dashboard with slow queries. Quickly switch to a different dashboard. Confirm the first dashboard's queries are cancelled (Network tab shows cancelled requests).
