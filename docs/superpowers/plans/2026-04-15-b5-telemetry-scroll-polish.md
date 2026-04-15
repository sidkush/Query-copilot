# Sub-project B Phase B5 — Telemetry, Dashboard Scroll, Polish

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the B performance loop — renderer telemetry so we can tune RSR thresholds from real data, bidirectional viewport-mount so 500-tile dashboards stay at 60fps, and a dev-mode tier badge for debugging.

**Architecture:** New frontend module `rendererTelemetry.ts` collects per-render timings and POSTs fire-and-forget to a new backend endpoint. `useViewportMount` upgraded to bidirectional (unmount on scroll-away to release pool slots). Dev-mode overlay badge toggled via `Cmd+Alt+P`. `CHART_PERF_ENABLED` flipped to true in staging.

**Tech Stack:** Existing `audit_trail.py` JSONL pattern (backend), IntersectionObserver (frontend), existing Zustand store + InstancePool.

**Spec:** [`docs/superpowers/specs/2026-04-15-chart-system-sub-project-b-performance-design.md`](../specs/2026-04-15-chart-system-sub-project-b-performance-design.md) §7, §Phase B5.

---

## File Structure

### New backend files
```
backend/
  tests/
    test_chart_perf_telemetry.py         # Tests for telemetry endpoint
```

### Modified backend files
```
backend/
  routers/agent_routes.py                # +POST /api/v1/perf/telemetry
```

### New frontend files
```
frontend/src/
  chart-ir/perf/rendererTelemetry.ts     # Fire-and-forget telemetry POST
  chart-ir/__tests__/perf/rendererTelemetry.test.ts
  components/editor/TierBadge.jsx        # Dev-mode overlay badge
```

### Modified frontend files
```
frontend/src/
  lib/useViewportMount.js                # Upgrade to bidirectional (unmount on scroll-away)
  components/dashboard/lib/DashboardTileCanvas.jsx  # Wire useViewportMount
  components/editor/renderers/VegaRenderer.tsx       # Emit telemetry on render
  components/editor/EditorCanvas.jsx                 # Mount TierBadge overlay
  store.js                                           # +showTierBadge toggle
```

---

## Task 1: Backend telemetry endpoint `POST /api/v1/perf/telemetry`

**Files:**
- Modify: `backend/routers/agent_routes.py`
- Create: `backend/tests/test_chart_perf_telemetry.py`

- [ ] **Step 1: Write tests**

```python
# backend/tests/test_chart_perf_telemetry.py
"""Tests for POST /api/v1/perf/telemetry fire-and-forget endpoint."""
import json
import os
import pytest
from pathlib import Path
from unittest.mock import patch
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    from main import app
    from routers.auth_routes import get_current_user
    app.dependency_overrides[get_current_user] = lambda: {"email": "test@example.com"}
    with TestClient(app) as c:
        yield c
    app.dependency_overrides = {}


SAMPLE_PAYLOAD = {
    "session_id": "abc123",
    "tile_id": "def456",
    "tier": "t1",
    "renderer_family": "vega",
    "renderer_backend": "canvas",
    "row_count": 5000,
    "downsample_method": "lttb",
    "target_points": 4000,
    "first_paint_ms": 120.5,
    "median_frame_ms": 11.2,
    "p95_frame_ms": 15.8,
    "escalations": [],
    "evictions": 0,
    "instance_pressure_at_mount": 0.3,
    "gpu_tier": "medium",
}


class TestPerfTelemetry:
    def test_accepts_valid_payload_and_returns_204(self, client):
        resp = client.post("/api/v1/perf/telemetry", json=SAMPLE_PAYLOAD)
        assert resp.status_code == 204

    def test_writes_to_chart_perf_jsonl(self, client, tmp_path):
        log_file = tmp_path / "chart_perf.jsonl"
        with patch("routers.agent_routes._CHART_PERF_LOG_PATH", log_file):
            client.post("/api/v1/perf/telemetry", json=SAMPLE_PAYLOAD)
            assert log_file.exists()
            lines = log_file.read_text().strip().split("\n")
            assert len(lines) == 1
            entry = json.loads(lines[0])
            assert entry["tier"] == "t1"
            assert entry["row_count"] == 5000
            assert "timestamp" in entry

    def test_rejects_missing_required_fields(self, client):
        resp = client.post("/api/v1/perf/telemetry", json={"tier": "t0"})
        assert resp.status_code == 422

    def test_accepts_empty_escalations_array(self, client):
        resp = client.post("/api/v1/perf/telemetry", json=SAMPLE_PAYLOAD)
        assert resp.status_code == 204

    def test_no_pii_in_logged_entry(self, client, tmp_path):
        log_file = tmp_path / "chart_perf.jsonl"
        payload_with_email = {**SAMPLE_PAYLOAD, "email": "should-not-appear@example.com"}
        with patch("routers.agent_routes._CHART_PERF_LOG_PATH", log_file):
            client.post("/api/v1/perf/telemetry", json=payload_with_email)
            content = log_file.read_text()
            assert "should-not-appear" not in content
```

- [ ] **Step 2: Run tests — expect failures (endpoint missing)**

Run: `cd backend && python -m pytest tests/test_chart_perf_telemetry.py -v`

- [ ] **Step 3: Implement the endpoint in `agent_routes.py`**

Add near the chart_stream endpoint:

```python
# ─── Chart performance telemetry (Sub-project B Phase B5) ───────
import threading
from datetime import datetime, timezone

_CHART_PERF_LOG_DIR = Path(".data/audit")
_CHART_PERF_LOG_PATH = _CHART_PERF_LOG_DIR / "chart_perf.jsonl"
_CHART_PERF_MAX_SIZE = 50 * 1024 * 1024  # 50 MB
_perf_write_lock = threading.Lock()

# Allowlisted fields — only these get persisted. PII never enters.
_PERF_FIELDS = frozenset({
    "session_id", "tile_id", "tier", "renderer_family", "renderer_backend",
    "row_count", "downsample_method", "target_points", "first_paint_ms",
    "median_frame_ms", "p95_frame_ms", "escalations", "evictions",
    "instance_pressure_at_mount", "gpu_tier",
})


class ChartPerfTelemetry(BaseModel):
    session_id: str
    tile_id: str
    tier: str
    renderer_family: str
    renderer_backend: str
    row_count: int
    downsample_method: str = "none"
    target_points: int = 0
    first_paint_ms: float = 0.0
    median_frame_ms: float = 0.0
    p95_frame_ms: float = 0.0
    escalations: list = Field(default_factory=list)
    evictions: int = 0
    instance_pressure_at_mount: float = 0.0
    gpu_tier: str = "medium"


@router.post("/perf/telemetry", status_code=204)
async def perf_telemetry(payload: ChartPerfTelemetry):
    """Fire-and-forget telemetry for chart render performance.

    Appends to .data/audit/chart_perf.jsonl. No PII — only timings,
    sizes, tier names. Rotation at 50MB (same pattern as audit_trail.py).
    No auth required — telemetry is anonymous by design.
    """
    entry = {k: v for k, v in payload.model_dump().items() if k in _PERF_FIELDS}
    entry["timestamp"] = datetime.now(timezone.utc).isoformat()

    line = json.dumps(entry, default=str) + "\n"
    with _perf_write_lock:
        _CHART_PERF_LOG_DIR.mkdir(parents=True, exist_ok=True)
        log_path = _CHART_PERF_LOG_PATH
        # Rotate if over size limit
        if log_path.exists() and log_path.stat().st_size > _CHART_PERF_MAX_SIZE:
            n = 1
            while (_CHART_PERF_LOG_DIR / f"chart_perf.{n}.jsonl").exists():
                n += 1
            log_path.rename(_CHART_PERF_LOG_DIR / f"chart_perf.{n}.jsonl")
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(line)
```

Make sure `Path` is imported from `pathlib` and `BaseModel`/`Field` from pydantic at the top of the file (or reuse existing imports).

- [ ] **Step 4: Run tests — expect pass**

Run: `cd backend && python -m pytest tests/test_chart_perf_telemetry.py -v`
Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
cd "QueryCopilot V1" && git add backend/routers/agent_routes.py backend/tests/test_chart_perf_telemetry.py && git commit -m "feat(b5): POST /api/v1/perf/telemetry — fire-and-forget chart render telemetry"
```

---

## Task 2: Frontend `rendererTelemetry.ts`

**Files:**
- Create: `frontend/src/chart-ir/perf/rendererTelemetry.ts`
- Create: `frontend/src/chart-ir/__tests__/perf/rendererTelemetry.test.ts`
- Modify: `frontend/src/chart-ir/index.ts` (add exports)

- [ ] **Step 1: Write tests**

```typescript
// frontend/src/chart-ir/__tests__/perf/rendererTelemetry.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { reportRenderTelemetry, type RenderTelemetryPayload } from '../../perf/rendererTelemetry';

describe('reportRenderTelemetry', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('POSTs payload to /api/v1/perf/telemetry', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));

    const payload: RenderTelemetryPayload = {
      session_id: 'sess1',
      tile_id: 'tile1',
      tier: 't1',
      renderer_family: 'vega',
      renderer_backend: 'canvas',
      row_count: 5000,
      downsample_method: 'lttb',
      target_points: 4000,
      first_paint_ms: 120,
      median_frame_ms: 11,
      p95_frame_ms: 16,
      escalations: [],
      evictions: 0,
      instance_pressure_at_mount: 0.3,
      gpu_tier: 'medium',
    };

    await reportRenderTelemetry(payload);

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('/api/v1/perf/telemetry');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toMatchObject({ tier: 't1', row_count: 5000 });
  });

  it('does not throw on network failure (fire-and-forget)', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network down'));
    await expect(
      reportRenderTelemetry({
        session_id: 's', tile_id: 't', tier: 't0',
        renderer_family: 'vega', renderer_backend: 'svg',
        row_count: 100, first_paint_ms: 10, median_frame_ms: 5,
        p95_frame_ms: 8, escalations: [], evictions: 0,
        instance_pressure_at_mount: 0, gpu_tier: 'low',
      }),
    ).resolves.not.toThrow();
  });

  it('does not throw on non-204 response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 500 }));
    await expect(
      reportRenderTelemetry({
        session_id: 's', tile_id: 't', tier: 't0',
        renderer_family: 'vega', renderer_backend: 'svg',
        row_count: 100, first_paint_ms: 10, median_frame_ms: 5,
        p95_frame_ms: 8, escalations: [], evictions: 0,
        instance_pressure_at_mount: 0, gpu_tier: 'low',
      }),
    ).resolves.not.toThrow();
  });
});
```

- [ ] **Step 2: Run tests — expect module not found**

- [ ] **Step 3: Implement `rendererTelemetry.ts`**

```typescript
// frontend/src/chart-ir/perf/rendererTelemetry.ts
/**
 * rendererTelemetry.ts — fire-and-forget POST to /api/v1/perf/telemetry.
 *
 * Collects per-render timings, tier decisions, pool pressure.
 * No PII — only sizes, timings, tier names.
 * Failures are silently swallowed (fire-and-forget).
 */

export interface RenderTelemetryPayload {
  session_id: string;
  tile_id: string;
  tier: string;
  renderer_family: string;
  renderer_backend: string;
  row_count: number;
  downsample_method?: string;
  target_points?: number;
  first_paint_ms: number;
  median_frame_ms: number;
  p95_frame_ms: number;
  escalations: { from: string; to: string; reason: string }[];
  evictions: number;
  instance_pressure_at_mount: number;
  gpu_tier: string;
}

export async function reportRenderTelemetry(payload: RenderTelemetryPayload): Promise<void> {
  try {
    await fetch('/api/v1/perf/telemetry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      // No auth header — telemetry is anonymous
    });
  } catch {
    // Fire-and-forget. Swallow all errors.
  }
}
```

- [ ] **Step 4: Export from `chart-ir/index.ts`**

Add:
```typescript
export { reportRenderTelemetry } from './perf/rendererTelemetry';
export type { RenderTelemetryPayload } from './perf/rendererTelemetry';
```

- [ ] **Step 5: Run tests — expect 3 passed**

- [ ] **Step 6: Commit**

```bash
cd "QueryCopilot V1" && git add frontend/src/chart-ir/perf/rendererTelemetry.ts frontend/src/chart-ir/__tests__/perf/rendererTelemetry.test.ts frontend/src/chart-ir/index.ts && git commit -m "feat(b5): rendererTelemetry.ts — fire-and-forget chart render telemetry client"
```

---

## Task 3: Upgrade `useViewportMount` to bidirectional

**Files:**
- Modify: `frontend/src/lib/useViewportMount.js`

The current hook is mount-once-on-first-appear. B5 needs it bidirectional: mount when scrolled into view, unmount when scrolled away. This lets dashboard tiles release their InstancePool slots when off-screen.

- [ ] **Step 1: Upgrade `useViewportMount.js`**

Replace the hook with a bidirectional version:

```javascript
import { useState, useEffect, useRef } from 'react';

/**
 * useViewportMount — IntersectionObserver-based mount/unmount for
 * expensive chart renderers on dashboard tiles.
 *
 * Bidirectional: mounts when scrolled into view (with rootMargin head-start),
 * unmounts when scrolled fully out of view. This lets InstancePool reclaim
 * slots from off-screen tiles on 500-tile dashboards.
 *
 * Options:
 *   rootMargin: string  — IntersectionObserver rootMargin (default '200px')
 *   once: boolean       — if true, revert to mount-once behavior (never unmount)
 *
 * Usage:
 *   const { ref, mounted } = useViewportMount();
 *   return (
 *     <div ref={ref} style={{ height: 400 }}>
 *       {mounted ? <ExpensiveChart /> : <SkeletonPlaceholder />}
 *     </div>
 *   );
 */
export default function useViewportMount({ rootMargin = '200px', once = false } = {}) {
  const ref = useRef(null);
  const [mounted, setMounted] = useState(
    typeof window === 'undefined' || typeof IntersectionObserver === 'undefined'
  );

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined' || !ref.current) return;

    const node = ref.current;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setMounted(true);
            if (once) {
              observer.disconnect();
            }
          } else if (!once) {
            setMounted(false);
          }
        }
      },
      { rootMargin }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [rootMargin, once]);

  return { ref, mounted };
}
```

Key changes from the original:
- Added `once` option (default `false`) — when `false`, the observer stays connected and toggles `mounted` on/off as the element enters/exits the viewport
- When `once` is `true`, preserves the old behavior exactly (disconnect after first intersection)
- The `mounted` state starts as `false` (unless SSR/no IntersectionObserver) — this is a behavior change from the original which started `true` only when IntersectionObserver was missing

- [ ] **Step 2: Verify existing consumers still work**

Grep for `useViewportMount` to find existing callers — they may need the `once: true` option to preserve their old behavior:
```bash
cd "QueryCopilot V1/frontend" && grep -r "useViewportMount" --include="*.jsx" --include="*.tsx" --include="*.js" --include="*.ts" -l
```

If any existing callers exist beyond the Three.js engines, add `{ once: true }` to their call to preserve backward compat.

- [ ] **Step 3: Commit**

```bash
cd "QueryCopilot V1" && git add frontend/src/lib/useViewportMount.js && git commit -m "feat(b5): upgrade useViewportMount to bidirectional — unmount on scroll-away for pool slot release"
```

---

## Task 4: Wire `useViewportMount` into `DashboardTileCanvas`

**Files:**
- Modify: `frontend/src/components/dashboard/lib/DashboardTileCanvas.jsx`

- [ ] **Step 1: Add viewport mount to DashboardTileCanvas**

Import `useViewportMount` and wrap the EditorCanvas mount:

```javascript
import useViewportMount from '../../../lib/useViewportMount';
```

Inside the component body, add:
```javascript
const { ref: viewportRef, mounted: inViewport } = useViewportMount({ rootMargin: '300px' });
```

Wrap the returned JSX's outermost div with `ref={viewportRef}`. When `!inViewport`, render a lightweight skeleton placeholder instead of `<EditorCanvas>`. This is the key optimization — off-screen tiles don't mount their Vega/deck.gl/MapLibre renderers.

The skeleton should maintain the tile's height so scroll position doesn't jump:
```jsx
{inViewport ? (
  <EditorCanvas spec={spec} resultSet={resultSet} ... />
) : (
  <div
    data-testid="tile-viewport-skeleton"
    style={{
      height: '100%',
      background: 'rgba(255,255,255,0.02)',
      borderRadius: 6,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--text-muted, rgba(255,255,255,0.3))',
      fontSize: 11,
    }}
  >
    Scroll to load
  </div>
)}
```

- [ ] **Step 2: Commit**

```bash
cd "QueryCopilot V1" && git add frontend/src/components/dashboard/lib/DashboardTileCanvas.jsx && git commit -m "feat(b5): wire useViewportMount into DashboardTileCanvas — off-screen tiles unmount renderers"
```

---

## Task 5: Dev-mode tier badge overlay

**Files:**
- Create: `frontend/src/components/editor/TierBadge.jsx`
- Modify: `frontend/src/components/editor/EditorCanvas.jsx`
- Modify: `frontend/src/store.js`

- [ ] **Step 1: Create `TierBadge.jsx`**

```jsx
// frontend/src/components/editor/TierBadge.jsx
/**
 * TierBadge — dev-mode overlay showing current RSR tier + reason.
 * Toggled via Cmd+Alt+P. Only visible in dev mode.
 */
import useStore from '../../store';

export default function TierBadge({ strategy }) {
  const show = useStore((s) => s.showTierBadge);
  if (!show || !strategy) return null;

  const tier = strategy.tier || '?';
  const family = strategy.rendererFamily || '?';
  const backend = strategy.rendererBackend || '?';
  const reason = strategy.reason || '';
  const ds = strategy.downsample;
  const streaming = strategy.streaming?.enabled ? 'stream' : 'bulk';

  return (
    <div
      data-testid="tier-badge"
      style={{
        position: 'absolute',
        top: 6,
        right: 6,
        zIndex: 50,
        padding: '3px 8px',
        borderRadius: 4,
        fontSize: 10,
        fontFamily: 'monospace',
        lineHeight: 1.4,
        background: 'rgba(0, 0, 0, 0.75)',
        color: '#a0ffa0',
        border: '1px solid rgba(160, 255, 160, 0.2)',
        pointerEvents: 'none',
        maxWidth: 260,
        whiteSpace: 'pre-wrap',
      }}
    >
      {`${tier} · ${family}/${backend} · ${streaming}`}
      {ds?.enabled && `\n↓ ${ds.method} → ${ds.targetPoints}pts`}
      {reason && `\n${reason}`}
    </div>
  );
}
```

- [ ] **Step 2: Add `showTierBadge` toggle to store.js**

Add to the Zustand store:
```javascript
showTierBadge: false,
toggleTierBadge: () => set((s) => ({ showTierBadge: !s.showTierBadge })),
```

- [ ] **Step 3: Add keyboard shortcut `Cmd+Alt+P`**

In `EditorCanvas.jsx` (or wherever global keyboard shortcuts are registered), add:
```javascript
useEffect(() => {
  const handler = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.altKey && e.key === 'p') {
      e.preventDefault();
      useStore.getState().toggleTierBadge();
    }
  };
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}, []);
```

- [ ] **Step 4: Mount TierBadge in EditorCanvas**

Import `TierBadge` in `EditorCanvas.jsx` and render it as a positioned overlay inside the canvas container div, passing the current `strategy` prop. The canvas container must have `position: relative` for the absolute-positioned badge to anchor correctly.

- [ ] **Step 5: Commit**

```bash
cd "QueryCopilot V1" && git add frontend/src/components/editor/TierBadge.jsx frontend/src/components/editor/EditorCanvas.jsx frontend/src/store.js && git commit -m "feat(b5): dev-mode tier badge overlay — Cmd+Alt+P toggles RSR tier display"
```

---

## Task 6: Emit telemetry from VegaRenderer

**Files:**
- Modify: `frontend/src/components/editor/renderers/VegaRenderer.tsx`

- [ ] **Step 1: Add telemetry emission on render complete**

Import `reportRenderTelemetry` from `../../../chart-ir`. After the existing `handleNewView` callback (which records frame times), add a `useEffect` that fires telemetry when the component finishes its first meaningful render:

```typescript
const firstPaintRef = useRef<number>(0);
const telemetryFiredRef = useRef(false);

// Record first paint time when the view first mounts
useEffect(() => {
  if (viewRef.current && !firstPaintRef.current) {
    firstPaintRef.current = performance.now();
  }
}, [compiled]);

// Fire telemetry once after first render stabilizes (debounced 2s)
useEffect(() => {
  if (telemetryFiredRef.current || !strategy) return;
  const timer = setTimeout(() => {
    if (telemetryFiredRef.current) return;
    telemetryFiredRef.current = true;
    reportRenderTelemetry({
      session_id: (window as any).__askdb_session_id ?? '',
      tile_id: slotIdRef.current,
      tier: strategy.tier,
      renderer_family: strategy.rendererFamily,
      renderer_backend: strategy.rendererBackend,
      row_count: rowObjects.length,
      downsample_method: strategy.downsample?.method ?? 'none',
      target_points: strategy.downsample?.targetPoints ?? 0,
      first_paint_ms: firstPaintRef.current
        ? performance.now() - firstPaintRef.current
        : 0,
      median_frame_ms: 0, // filled by FrameBudgetTracker in future
      p95_frame_ms: 0,
      escalations: [],
      evictions: 0,
      instance_pressure_at_mount: 0,
      gpu_tier: 'medium', // from gpuDetect in future
    });
  }, 2000);
  return () => clearTimeout(timer);
}, [strategy, rowObjects.length]);
```

- [ ] **Step 2: Commit**

```bash
cd "QueryCopilot V1" && git add frontend/src/components/editor/renderers/VegaRenderer.tsx && git commit -m "feat(b5): VegaRenderer emits render telemetry after first paint"
```

---

## Task 7: Flip `CHART_PERF_ENABLED` and phase checkpoint

- [ ] **Step 1: Change default in config.py**

In `backend/config.py`, change:
```python
CHART_PERF_ENABLED: bool = Field(default=True)
```
(was `default=False`)

- [ ] **Step 2: Run full backend test suite**

```bash
cd "QueryCopilot V1/backend" && python -m pytest tests/ -v --timeout=60 2>&1 | tail -10
```
Expected: all pass

- [ ] **Step 3: Run frontend lint + tests**

```bash
cd "QueryCopilot V1/frontend" && npm run lint 2>&1 | tail -5 && npx vitest run 2>&1 | tail -10
```

- [ ] **Step 4: Commit config change**

```bash
cd "QueryCopilot V1" && git add backend/config.py && git commit -m "feat(b5): flip CHART_PERF_ENABLED to true by default"
```

- [ ] **Step 5: Tag checkpoint**

```bash
cd "QueryCopilot V1" && git tag b5-polish
```

---

## Notes for Phase B6

After B5 ships and runs in staging for 7 days:

**B6 (Production rollout, ~3 days):**
- Monitor telemetry JSONL for unexpected patterns (escalation storms, high eviction counts, OOM-like memory pressure)
- If metrics healthy → tag `chart-perf-v1`
- Optional: brush-to-detail re-query spike (Approach B from spec §4)
- B is done. Move to D (semantic layer) then C (user-authored types).
