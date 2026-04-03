# Performance Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce dashboard load time from sum(query_times) to max(query_times) via parallel execution, cut initial JS bundle from 1.4MB to ~200KB via code splitting, and eliminate GPU waste from 3D backgrounds while retaining all animations.

**Architecture:** Backend gets `asyncio.to_thread` wrapping on all sync DB calls plus a new `/refresh-all` bulk endpoint. Frontend replaces sequential tile refresh with one bulk call, lazy-loads all routes, and adds `frameloop="demand"` + viewport-gating to 3D canvases.

**Tech Stack:** FastAPI (asyncio), React 19, Vite 8, @react-three/fiber, @react-three/drei (PerformanceMonitor)

---

### Task 1: Backend — Wrap execute_query in asyncio.to_thread

**Files:**
- Modify: `backend/routers/dashboard_routes.py`

This is the highest-impact single change. Every `entry.connector.execute_query()` call blocks the FastAPI event loop thread. Wrapping in `asyncio.to_thread` offloads to a worker thread, letting concurrent requests actually run concurrently.

- [ ] **Step 1: Add asyncio import**

At the top of `backend/routers/dashboard_routes.py`, add:

```python
import asyncio
```

(Place after line 5: `from typing import Optional`)

- [ ] **Step 2: Wrap KPI twin queries with asyncio.gather**

Replace the sequential KPI twin query execution (lines 323-324):

```python
# BEFORE (lines 323-324):
df_current = entry.connector.execute_query(target_sql)
df_prev = entry.connector.execute_query(prev_sql)
```

With concurrent execution:

```python
# AFTER:
df_current, df_prev = await asyncio.gather(
    asyncio.to_thread(entry.connector.execute_query, target_sql),
    asyncio.to_thread(entry.connector.execute_query, prev_sql),
)
```

- [ ] **Step 3: Wrap standard tile query**

Replace the standard execution (line 397):

```python
# BEFORE (line 397):
df = entry.connector.execute_query(target_sql)
```

With:

```python
# AFTER:
df = await asyncio.to_thread(entry.connector.execute_query, target_sql)
```

- [ ] **Step 4: Verify backend starts without errors**

Run:
```bash
cd "QueryCopilot V1/backend" && python -c "from routers.dashboard_routes import router; print('OK')"
```

Expected: `OK` (no import errors)

- [ ] **Step 5: Commit**

```bash
git add backend/routers/dashboard_routes.py
git commit -m "perf: wrap execute_query in asyncio.to_thread for non-blocking tile refresh"
```

---

### Task 2: Backend — New /refresh-all bulk endpoint

**Files:**
- Modify: `backend/routers/dashboard_routes.py`

One HTTP request refreshes all tiles concurrently. Eliminates N round-trips.

- [ ] **Step 1: Add Pydantic model for bulk refresh**

After the existing `RefreshTileBody` class (line ~70), add:

```python
class BulkRefreshBody(BaseModel):
    tile_ids: list
    conn_id: Optional[str] = None
    filters: Optional[dict] = None
```

- [ ] **Step 2: Create the bulk refresh endpoint**

Add before the annotations section (before `# ── Annotations`). This reuses the existing per-tile refresh logic by extracting it into a helper:

```python
@router.post("/{dashboard_id}/refresh-all")
async def refresh_all_tiles(dashboard_id: str, body: BulkRefreshBody, user=Depends(get_current_user)):
    """Refresh multiple tiles concurrently. Returns results keyed by tile_id."""
    d = load_dashboard(user["email"], dashboard_id)
    if not d:
        raise HTTPException(404, "Dashboard not found")

    email = user["email"]
    import main as app_module
    app = app_module.app
    connections = app.state.connections.get(email, {})

    conn_id = body.conn_id
    if conn_id and conn_id in connections:
        entry = connections[conn_id]
    elif connections:
        entry = next(iter(connections.values()))
    else:
        raise HTTPException(400, "No active database connection")

    async def refresh_one(tile_id):
        """Refresh a single tile. Returns (tile_id, result_dict) or (tile_id, error_str)."""
        # Find tile
        target_tile = None
        for tab in d.get("tabs", []):
            for sec in tab.get("sections", []):
                for tile in sec.get("tiles", []):
                    if tile["id"] == tile_id:
                        target_tile = tile
                        break
        if not target_tile or not target_tile.get("sql"):
            return tile_id, {"error": "Tile not found or has no SQL"}

        try:
            from sql_validator import SQLValidator
            from pii_masking import mask_dataframe
            validator = SQLValidator()
            target_sql = target_tile["sql"]
            is_valid, msg = validator.validate(target_sql)
            if not is_valid:
                return tile_id, {"error": f"SQL validation failed: {msg}"}

            # Apply filters if provided
            filters = body.filters
            if filters and filters.get("dateColumn") and filters.get("range") and filters.get("range") != "all_time":
                date_col = filters["dateColumn"]
                # Reuse existing date filter logic — wrap SQL
                from datetime import datetime, timedelta, timezone
                now = datetime.now(timezone.utc)
                date_range = filters["range"]
                start, end = None, now
                if date_range == "today":
                    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
                elif date_range == "yesterday":
                    start = (now - timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
                    end = now.replace(hour=0, minute=0, second=0, microsecond=0)
                elif date_range == "this_week":
                    start = now - timedelta(days=now.weekday())
                    start = start.replace(hour=0, minute=0, second=0, microsecond=0)
                elif date_range == "this_month":
                    start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
                elif date_range == "this_year":
                    start = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
                if start:
                    s_str = start.strftime('%Y-%m-%d %H:%M:%S')
                    e_str = end.strftime('%Y-%m-%d %H:%M:%S')
                    target_sql = f"SELECT * FROM ({target_sql}) sq_wrap WHERE {date_col} >= '{s_str}' AND {date_col} <= '{e_str}'"

            if filters and filters.get("fields"):
                import sqlglot
                _ALLOWED_OPS = {'=', '!=', '>', '<', '>=', '<=', 'LIKE', 'IN'}
                conditions = []
                for f in filters["fields"]:
                    col = f.get("column")
                    op = f.get("operator", "=").upper()
                    val = f.get("value", "")
                    if not col or op not in _ALLOWED_OPS:
                        continue
                    quoted_col = sqlglot.exp.column(col).sql()
                    if op == "IN":
                        parts = [v.strip() for v in val.split(",")]
                        vals = ", ".join(f"'{p}'" for p in parts)
                        conditions.append(f"{quoted_col} IN ({vals})")
                    else:
                        try:
                            float(val)
                            conditions.append(f"{quoted_col} {op} {val}")
                        except ValueError:
                            conditions.append(f"{quoted_col} {op} '{val}'")
                if conditions:
                    where_clause = " AND ".join(conditions)
                    target_sql = f"SELECT * FROM ({target_sql}) _field_filter WHERE {where_clause}"

            df = await asyncio.to_thread(entry.connector.execute_query, target_sql)
            df = mask_dataframe(df)
            from decimal import Decimal
            rows = df.head(100).to_dict("records")
            for row in rows:
                for k, v in row.items():
                    if isinstance(v, Decimal):
                        row[k] = float(v)
            columns = list(df.columns)
            update_tile(email, dashboard_id, tile_id, {"columns": columns, "rows": rows})
            return tile_id, {"columns": columns, "rows": rows, "rowCount": len(df)}
        except Exception as e:
            return tile_id, {"error": str(e)}

    # Dispatch all tiles concurrently
    tasks = [refresh_one(tid) for tid in body.tile_ids]
    results_list = await asyncio.gather(*tasks)
    results = {tid: result for tid, result in results_list}
    return {"results": results}
```

- [ ] **Step 3: Add refreshBulk to frontend API**

In `frontend/src/api.js`, after the existing `refreshTile` function (line 256), add:

```javascript
  refreshBulk: (dashboardId, tileIds, connId, filters = null) =>
    request(`/dashboards/${dashboardId}/refresh-all`, {
      method: "POST",
      body: JSON.stringify({ tile_ids: tileIds, conn_id: connId, filters }),
    }),
```

- [ ] **Step 4: Commit**

```bash
git add backend/routers/dashboard_routes.py frontend/src/api.js
git commit -m "feat: add /refresh-all bulk endpoint for concurrent tile queries"
```

---

### Task 3: Frontend — Replace sequential refresh with bulk call

**Files:**
- Modify: `frontend/src/pages/DashboardBuilder.jsx` (lines 105-148, lines 597-614)

- [ ] **Step 1: Replace the for...of await loop (lines 105-148)**

Replace the entire useEffect (lines 105-148) with:

```javascript
  // ── Auto-refresh tiles that have SQL but no data ──
  useEffect(() => {
    if (!activeDashboard?.tabs) return;
    const stale = [];
    for (const tab of activeDashboard.tabs) {
      for (const sec of tab.sections || []) {
        for (const tile of sec.tiles || []) {
          if (tile.sql && (!tile.rows || tile.rows.length === 0)) {
            stale.push(tile.id);
          }
        }
      }
    }
    if (stale.length === 0) return;

    const controller = new AbortController();
    (async () => {
      try {
        const res = await api.refreshBulk(
          activeDashboard.id, stale, activeConnId, null
        );
        if (controller.signal.aborted) return;
        const results = res?.results || {};
        setActiveDashboard((prev) => {
          if (!prev || prev.id !== activeDashboard.id) return prev;
          return {
            ...prev,
            tabs: prev.tabs.map((tab) => ({
              ...tab,
              sections: (tab.sections || []).map((sec) => ({
                ...sec,
                tiles: (sec.tiles || []).map((t) => {
                  const r = results[t.id];
                  return r && !r.error ? { ...t, ...r } : t;
                }),
              })),
            })),
          };
        });
      } catch (err) {
        if (err.name !== "AbortError") {
          console.error("Bulk refresh failed, falling back to individual:", err);
          // Fallback: parallel individual requests
          await Promise.allSettled(
            stale.map((tid) => api.refreshTile(activeDashboard.id, tid, activeConnId, null))
          );
        }
      }
    })();
    return () => controller.abort();
  }, [activeDashboard?.id, activeConnId]);
```

- [ ] **Step 2: Update handleGlobalFiltersChange to use bulk endpoint (line 597)**

Replace lines 610-613:

```javascript
    const tileIds = [];
    currentTab.sections.forEach(s => s.tiles.forEach(t => tileIds.push(t.id)));

    await Promise.allSettled(tileIds.map(tid => handleTileRefresh(tid, null, newFilters)));
```

With:

```javascript
    const tileIds = [];
    currentTab.sections.forEach((s) =>
      s.tiles.forEach((t) => { if (t.sql) tileIds.push(t.id); })
    );
    if (tileIds.length === 0) return;

    try {
      const res = await api.refreshBulk(dash.id, tileIds, activeConnId, newFilters);
      const results = res?.results || {};
      setActiveDashboard((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          tabs: prev.tabs.map((tab) => ({
            ...tab,
            sections: (tab.sections || []).map((sec) => ({
              ...sec,
              tiles: (sec.tiles || []).map((t) => {
                const r = results[t.id];
                return r && !r.error ? { ...t, ...r } : t;
              }),
            })),
          })),
        };
      });
    } catch {
      await Promise.allSettled(tileIds.map((tid) => handleTileRefresh(tid, activeConnId, newFilters)));
    }
```

- [ ] **Step 3: Verify build**

Run:
```bash
cd "QueryCopilot V1/frontend" && npx vite build --mode development 2>&1 | tail -3
```

Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/DashboardBuilder.jsx
git commit -m "perf: replace sequential tile refresh with bulk /refresh-all call"
```

---

### Task 4: Frontend — Route-level code splitting in App.jsx

**Files:**
- Modify: `frontend/src/App.jsx`

Splits 1.4MB main bundle into per-route chunks. Biggest single improvement to initial page load.

- [ ] **Step 1: Replace static imports with React.lazy**

Replace lines 1-18 of `frontend/src/App.jsx` with:

```javascript
import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { useStore } from "./store";
import AppLayout from "./components/AppLayout";
import PageTransition from "./components/animation/PageTransition";

// Lazy-loaded pages — each becomes its own chunk
const Landing = lazy(() => import("./pages/Landing"));
const Login = lazy(() => import("./pages/Login"));
const OAuthCallback = lazy(() => import("./pages/OAuthCallback"));
const Tutorial = lazy(() => import("./pages/Tutorial"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const SchemaView = lazy(() => import("./pages/SchemaView"));
const Chat = lazy(() => import("./pages/Chat"));
const Profile = lazy(() => import("./pages/Profile"));
const Account = lazy(() => import("./pages/Account"));
const Billing = lazy(() => import("./pages/Billing"));
const AdminLogin = lazy(() => import("./pages/AdminLogin"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const DashboardBuilder = lazy(() => import("./pages/DashboardBuilder"));
```

- [ ] **Step 2: Add Suspense wrapper around Routes**

In the `AnimatedRoutes` function, wrap the `<AnimatePresence>` contents in `<Suspense>`:

```javascript
function AnimatedRoutes() {
  const location = useLocation();

  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", background: "#06060e", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 24, height: 24, border: "2px solid #6366f1", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    }>
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          {/* ... all routes unchanged ... */}
        </Routes>
      </AnimatePresence>
    </Suspense>
  );
}
```

- [ ] **Step 3: Verify build produces multiple chunks**

Run:
```bash
cd "QueryCopilot V1/frontend" && npx vite build --mode development 2>&1 | grep -E "\.js\s" | head -20
```

Expected: Multiple page-level chunks (Landing-xxx.js, Chat-xxx.js, DashboardBuilder-xxx.js, etc.) instead of one monolithic index.js.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "perf: lazy-load all page routes for code splitting"
```

---

### Task 5: Frontend — Vite manual chunk splitting

**Files:**
- Modify: `frontend/vite.config.js`

Separates large vendor libraries into cacheable chunks.

- [ ] **Step 1: Add build config with manualChunks**

Replace the entire `frontend/vite.config.js` with:

```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://localhost:8002',
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-three': ['three', '@react-three/fiber', '@react-three/drei'],
          'vendor-charts': ['recharts'],
          'vendor-motion': ['framer-motion'],
        },
      },
    },
  },
})
```

- [ ] **Step 2: Verify build chunk separation**

Run:
```bash
cd "QueryCopilot V1/frontend" && npx vite build --mode development 2>&1 | grep -E "vendor|index"
```

Expected: Separate `vendor-react`, `vendor-three`, `vendor-charts`, `vendor-motion` chunks. Main index chunk should be significantly smaller.

- [ ] **Step 3: Commit**

```bash
git add frontend/vite.config.js
git commit -m "perf: split vendor libraries into cacheable chunks"
```

---

### Task 6: 3D — frameloop="demand" + invalidate()

**Files:**
- Modify: `frontend/src/components/animation/Background3D.jsx`
- Modify: `frontend/src/components/animation/SectionBackground3D.jsx`

Stops continuous 60fps rendering. Each `useFrame` callback calls `invalidate()` to request a frame only when actively animating.

- [ ] **Step 1: Update Background3D.jsx Canvas**

In `frontend/src/components/animation/Background3D.jsx`, change the Canvas element (line ~300) from:

```jsx
      <Canvas
        camera={{ position: [0, 0, 18], fov: 50 }}
        dpr={[1, 1.5]}
        gl={{ antialias: false, alpha: true, powerPreference: "high-performance" }}
      >
```

To:

```jsx
      <Canvas
        camera={{ position: [0, 0, 18], fov: 50 }}
        dpr={[1, 1.5]}
        frameloop="demand"
        gl={{ antialias: false, alpha: true, powerPreference: "high-performance" }}
      >
```

- [ ] **Step 2: Add invalidate() to every useFrame in Background3D.jsx**

There are 6 `useFrame` callbacks (lines 29, 48, 154, 226, 257, 280). Each one needs to call `invalidate()` at the end. The pattern is:

Change every `useFrame((s) => {` or `useFrame((state) => {` to include `invalidate`:

```javascript
// Example — apply this pattern to ALL 6 useFrame callbacks:
useFrame((state) => {
  // ... existing animation logic unchanged ...
  state.invalidate();  // <-- add this as the LAST line
});
```

Also add a visibility check to stop invalidating when the tab is hidden. Add this hook to the top-level Background3D component, before the `return`:

```javascript
// Inside Background3D, before the return statement:
const [visible, setVisible] = useState(true);
useEffect(() => {
  const handler = () => setVisible(!document.hidden);
  document.addEventListener("visibilitychange", handler);
  return () => document.removeEventListener("visibilitychange", handler);
}, []);
```

Then in each scene sub-component, the `invalidate()` call is unconditional (the Canvas won't render if nothing invalidates). The visibility check prevents invalidation by not rendering the Canvas at all — wrap Canvas children in `{visible && <>...</>}`:

Actually, simpler approach: Add an `AutoInvalidate` component inside the Canvas that handles this:

```javascript
function AutoInvalidate() {
  const { invalidate } = useThree();
  useEffect(() => {
    let running = true;
    const tick = () => {
      if (running && !document.hidden) invalidate();
      if (running) requestAnimationFrame(tick);
    };
    tick();
    return () => { running = false; };
  }, [invalidate]);
  return null;
}
```

Add `<AutoInvalidate />` as the first child inside each Canvas. This replaces the need to modify every individual `useFrame` callback — the component continuously invalidates when visible, stops when hidden.

Import `useThree` from `@react-three/fiber`:

```javascript
import { Canvas, useFrame, useThree } from "@react-three/fiber";
```

- [ ] **Step 3: Apply same changes to SectionBackground3D.jsx**

In `frontend/src/components/animation/SectionBackground3D.jsx`:

1. Add `useThree` to the fiber import (line 2)
2. Add the `AutoInvalidate` component (same code as above)
3. Change Canvas (line ~401) to add `frameloop="demand"`
4. Add `<AutoInvalidate />` as first child inside Canvas

- [ ] **Step 4: Verify build**

Run:
```bash
cd "QueryCopilot V1/frontend" && npx vite build --mode development 2>&1 | tail -3
```

Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/animation/Background3D.jsx frontend/src/components/animation/SectionBackground3D.jsx
git commit -m "perf: add frameloop=demand + visibility-gated invalidation to 3D canvases"
```

---

### Task 7: 3D — startTransition for deferred Canvas mounting

**Files:**
- Modify: `frontend/src/pages/Chat.jsx`
- Modify: `frontend/src/pages/DashboardBuilder.jsx`
- Modify: `frontend/src/pages/Landing.jsx`

HTML paints first, 3D initializes as low-priority background task.

- [ ] **Step 1: Add deferred 3D mount to Chat.jsx**

In `frontend/src/pages/Chat.jsx`, find the 3D background section (around line 831):

```jsx
        {/* 3D ambient background */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ opacity: 0.12, zIndex: 0 }}>
          <WebGLErrorBoundary fallback={<AnimatedBackground />}>
            <Suspense fallback={null}>
              <Background3D />
            </Suspense>
          </WebGLErrorBoundary>
        </div>
```

Add a `startTransition`-deferred mount. Add `startTransition` to the React import (line 1), then add state + effect:

```javascript
// Near top of Chat component, after other useState declarations:
const [show3D, setShow3D] = useState(false);
useEffect(() => {
  const id = requestAnimationFrame(() => {
    startTransition(() => setShow3D(true));
  });
  return () => cancelAnimationFrame(id);
}, []);
```

Then wrap the 3D block conditionally:

```jsx
        {/* 3D ambient background */}
        {show3D && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ opacity: 0.12, zIndex: 0 }}>
            <WebGLErrorBoundary fallback={<AnimatedBackground />}>
              <Suspense fallback={null}>
                <Background3D />
              </Suspense>
            </WebGLErrorBoundary>
          </div>
        )}
```

- [ ] **Step 2: Add deferred 3D mount to DashboardBuilder.jsx**

Same pattern. Find the 3D background section (around line 910):

```jsx
      <div style={{ position: "fixed", inset: 0, opacity: 0.08, pointerEvents: "none", zIndex: 0 }}>
        <WebGLBoundary fallback={<AnimatedBackground />}>
          <Suspense fallback={null}>
            <SectionBackground3D mode="stats" />
          </Suspense>
        </WebGLBoundary>
      </div>
```

Add `startTransition` to the React import (line 1). Add state + effect near top of component:

```javascript
const [show3D, setShow3D] = useState(false);
useEffect(() => {
  const id = requestAnimationFrame(() => {
    startTransition(() => setShow3D(true));
  });
  return () => cancelAnimationFrame(id);
}, []);
```

Wrap conditionally:

```jsx
      {show3D && (
        <div style={{ position: "fixed", inset: 0, opacity: 0.08, pointerEvents: "none", zIndex: 0 }}>
          <WebGLBoundary fallback={<AnimatedBackground />}>
            <Suspense fallback={null}>
              <SectionBackground3D mode="stats" />
            </Suspense>
          </WebGLBoundary>
        </div>
      )}
```

- [ ] **Step 3: Add deferred 3D mount to Landing.jsx**

Same pattern for the hero Background3D. Find line ~412:

```jsx
        <WebGLErrorBoundary fallback={<AnimatedBackground />}>
          <Suspense fallback={<AnimatedBackground />}>
            <Background3D />
          </Suspense>
        </WebGLErrorBoundary>
```

Add `startTransition` to React imports. Add state + effect in the Landing component. Wrap the hero 3D block conditionally.

- [ ] **Step 4: Verify build**

Run:
```bash
cd "QueryCopilot V1/frontend" && npx vite build --mode development 2>&1 | tail -3
```

Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Chat.jsx frontend/src/pages/DashboardBuilder.jsx frontend/src/pages/Landing.jsx
git commit -m "perf: defer 3D canvas mount via startTransition for instant HTML paint"
```

---

### Task 8: 3D — LazyCanvas with IntersectionObserver

**Files:**
- Create: `frontend/src/components/animation/LazyCanvas.jsx`
- Modify: `frontend/src/pages/Landing.jsx`

On Landing page, 7 SectionBackground3D instances mount simultaneously. This wrapper only mounts children when scrolled into viewport.

- [ ] **Step 1: Create LazyCanvas component**

Create `frontend/src/components/animation/LazyCanvas.jsx`:

```javascript
import { useState, useRef, useEffect } from "react";

/**
 * Viewport-gated wrapper. Only mounts children when the container
 * is within `rootMargin` of the viewport. Unmounts when scrolled away.
 */
export default function LazyCanvas({ children, rootMargin = "200px", className = "", style = {} }) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { rootMargin }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin]);

  return (
    <div ref={ref} className={className} style={{ ...style, position: "relative" }}>
      {inView ? children : null}
    </div>
  );
}
```

- [ ] **Step 2: Wrap SectionBackground3D instances on Landing page**

In `frontend/src/pages/Landing.jsx`, add the import:

```javascript
import LazyCanvas from "../components/animation/LazyCanvas";
```

Find each `<Suspense fallback={null}><SectionBackground3D mode="..." /></Suspense>` instance (there are 7, in the features, howItWorks, demo, stats, testimonials, pricing, and cta sections).

Wrap each one:

```jsx
{/* BEFORE: */}
<Suspense fallback={null}><SectionBackground3D mode="features" /></Suspense>

{/* AFTER: */}
<LazyCanvas className="absolute inset-0">
  <Suspense fallback={null}><SectionBackground3D mode="features" /></Suspense>
</LazyCanvas>
```

Apply this to all 7 instances. The SectionBackground3D already has `className="absolute inset-0"` internally, but the LazyCanvas wrapper needs to be the positioned container.

- [ ] **Step 3: Verify build**

Run:
```bash
cd "QueryCopilot V1/frontend" && npx vite build --mode development 2>&1 | tail -3
```

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/animation/LazyCanvas.jsx frontend/src/pages/Landing.jsx
git commit -m "perf: viewport-gate 3D canvases on Landing with IntersectionObserver"
```

---

### Task 9: 3D — PerformanceMonitor for adaptive quality

**Files:**
- Modify: `frontend/src/components/animation/Background3D.jsx`
- Modify: `frontend/src/components/animation/SectionBackground3D.jsx`

Auto-degrade particle count and DPR on low-end devices when FPS drops.

- [ ] **Step 1: Add PerformanceMonitor to Background3D.jsx**

In `frontend/src/components/animation/Background3D.jsx`, add import:

```javascript
import { PerformanceMonitor } from "@react-three/drei";
```

Add state to the Background3D component (before the return):

```javascript
const [degraded, setDegraded] = useState(false);
```

Change the `dpr` prop on Canvas to be dynamic:

```jsx
dpr={degraded ? [1, 1] : [1, 1.5]}
```

Wrap all scene children inside Canvas with PerformanceMonitor:

```jsx
      <Canvas
        camera={{ position: [0, 0, 18], fov: 50 }}
        dpr={degraded ? [1, 1] : [1, 1.5]}
        frameloop="demand"
        gl={{ antialias: false, alpha: true, powerPreference: "high-performance" }}
      >
        <PerformanceMonitor onDecline={() => setDegraded(true)} onIncline={() => setDegraded(false)}>
          <fog attach="fog" args={["#06060e", 15, 45]} />
          <AutoInvalidate />
          <Starfield />
          <DashboardScreen />
          <NeuralPulses />
          <OutgoingPulses />
          <OrbitalRings />
          <GridFloor />
        </PerformanceMonitor>
      </Canvas>
```

- [ ] **Step 2: Add PerformanceMonitor to SectionBackground3D.jsx**

Same pattern. Add import, add `degraded` state (needs to be inside the component), dynamic `dpr`, wrap scene in `<PerformanceMonitor>`:

```jsx
export default function SectionBackground3D({ mode = "features", className = "" }) {
  const SceneComponent = SCENES[mode];
  const [degraded, setDegraded] = useState(false);
  if (!SceneComponent) return null;

  return (
    <div className={`absolute inset-0 pointer-events-none ${className}`} aria-hidden="true" style={{ zIndex: 0 }}>
      <Canvas
        camera={{ position: [0, 0, 12], fov: 50 }}
        dpr={degraded ? [1, 1] : [1, 1.5]}
        frameloop="demand"
        gl={{ antialias: false, alpha: true, powerPreference: "high-performance" }}
      >
        <PerformanceMonitor onDecline={() => setDegraded(true)} onIncline={() => setDegraded(false)}>
          <fog attach="fog" args={["#06060e", 8, 25]} />
          <AutoInvalidate />
          <SceneComponent />
        </PerformanceMonitor>
      </Canvas>
    </div>
  );
}
```

Add the `useState` import if not already present, and the `PerformanceMonitor` import from drei.

- [ ] **Step 3: Verify build**

Run:
```bash
cd "QueryCopilot V1/frontend" && npx vite build --mode development 2>&1 | tail -3
```

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/animation/Background3D.jsx frontend/src/components/animation/SectionBackground3D.jsx
git commit -m "perf: add PerformanceMonitor for adaptive 3D quality on low-end devices"
```

---

### Task 10: Final verification

- [ ] **Step 1: Full build check**

Run:
```bash
cd "QueryCopilot V1/frontend" && npx vite build 2>&1
```

Confirm: No errors. Multiple chunks. Main chunk under 300KB. Vendor chunks separated.

- [ ] **Step 2: Backend import check**

Run:
```bash
cd "QueryCopilot V1/backend" && python -c "from routers.dashboard_routes import router; print('Routes:', len(router.routes))"
```

Confirm: No import errors. Route count increased by 1 (the new refresh-all endpoint).

- [ ] **Step 3: Commit all remaining changes**

```bash
git add -A
git status
git commit -m "perf: performance optimization — parallel queries, code splitting, 3D optimization"
```
