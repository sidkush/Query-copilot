# Chart System Redesign — Sub-project B — Performance Ceiling

**Date:** 2026-04-15
**Author:** Drafted autonomously via scheduled task `brainstorm-chart-sub-project-b-performance` invoking `superpowers:brainstorming` (no live user — sid23 absent for this run; assumptions tagged).
**Status:** Awaiting user review · spec self-reviewed inline
**Research base:** `docs/chart_systems_research.md` (§2.8, §3.10, §5.4, §5.13) · `docs/chart_ux_implementation_plan.md` · `docs/superpowers/specs/2026-04-15-chart-system-sub-project-a-design.md`
**Scope:** Sub-project B of four — the performance ceiling. A=editor+dashboards, **B=performance**, C=user-authored chart types, D=semantic layer.

---

## 0. Pre-Read — Why This Spec Exists Now and What It Assumes

### 0.1 State of Sub-project A

Sub-project A is **specced and planned but not yet implemented** as of 2026-04-15. Git history of branch `chart-system-redesign` (or the active dev branch) shows three commits:

- `d5f37be` — spec: chart system redesign sub-project A design
- `a1a6360` — spec: resolve 9 open questions for chart redesign sub-project A
- `aa27ea8` — plan: chart system sub-project A implementation plan (Phase 0 detailed)

No code changes from A are merged. `frontend/src/chart-ir/` and `frontend/src/components/editor/` do not exist on disk. Per task instructions the brainstorm should STOP if A isn't implemented; sid23 explicitly overrode that during this session ("continue") so B is being designed treating A's spec as the contractual foundation. **B's Phase 0 is gated on A reaching at least its own Phase 0–1 (`v0-foundations` + `v1-editor-shell`).** B cannot land in main before A's IR + renderer router exist.

### 0.2 Why A creates the gap B has to close

A drops ECharts entirely and consolidates on Vega-Lite (cartesian) + MapLibre (maps) + deck.gl (geo overlay) + Three.js (Stage Mode creative). The hidden cost of dropping ECharts is **losing its mature performance modes** that AskDB never actually wired up:

- `large: true` / `largeThreshold: 2000` — batched draw call mode
- `progressive: 400` / `progressiveThreshold: 3000` — chunked async render
- `sampling: 'lttb'` — Largest Triangle Three Buckets downsampling on line series

`ResultsChart.jsx` (the file A is replacing) sets none of those today. So the current production state is *already* slow on >50k points; A keeps it functional but defers the speed floor to B. Vega-Lite's default renderer is **SVG**, and SVG hits a render bottleneck around 1k–5k DOM nodes (research §3.10, §5.13). Without B, an A-shipped AskDB is *qualitatively* better (composable IR, voice, agent edits) but *quantitatively* slower than today's already-mediocre baseline on any large result.

### 0.3 What "better than Tableau / Power BI / Looker on raw rendering speed" means concretely

Three benchmark scenarios that all three competitors fail or struggle on, and that B must clear:

| # | Scenario | Tableau | Power BI | Looker | B target |
|---|---|---|---|---|---|
| 1 | 10M-row line chart (single time series) over 2 years of minute-bin metrics | Hyper extract pre-aggregates; client renders ~50k–100k points; pan jank | 30k point cap, falls back to `top` reduction; choppy | Highcharts hard cap; backend pre-aggregates | **Server LTTB in DuckDB twin → ≤20k points → Canvas Vega → 60fps pan/zoom** |
| 2 | 1M-point scatter (e.g. customers × spend) | WebGL `densityMap` only (loses identity) | Auto-bins to histogram; loses discoverability | Native scatter caps at ~10k | **deck.gl `ScatterplotLayer` → 60fps interactive identity preserved → bitmap-overlay tooltip** |
| 3 | 100k-row table with sparkline column per row | Doesn't ship | Slow row virtualization | Doesn't ship | **`canvas` sparkline batched into one `<canvas>` per page of virtualized rows** |
| 4 | 500-tile dashboard (analyst workbench archetype, scrolled) | Tableau hard caps at ~50 worksheets/dash | Power BI similar | Looker similar | **Viewport-mounted tiles + unified InstancePool + frame budget escalation → 60fps scroll, off-screen tiles park** |

A 5th implicit target — **smooth interactive editing** — falls out of frame budget tracking: the Marks card pill drag must keep the ≤16ms frame budget while the chart re-renders.

### 0.4 Scope guardrails

In scope for B:
- Server-side downsampling in DuckDB twin (LTTB + uniform fallback)
- Render strategy router that picks SVG / Canvas / WebGL per chart based on data shape, GPU tier, and live frame budget
- Progressive SSE streaming of large results into the chart canvas
- Frame budget tracker (≤16ms editing, ≤33ms view mode) wired into the strategy router
- Unified InstancePool extending `webglContextPool.js` to also count Vega/MapLibre/deck.gl
- Benchmark harness for the four scenarios above
- Telemetry: render time, FPS, eviction count, downsample triggers

Out of scope for B (each captured elsewhere):
- User-authored chart types and the custom-marks SDK → Sub-project C
- Semantic layer / persistent metric definitions → Sub-project D
- Proprietary VizQL clone → future research project
- Backend Arrow Flight / DuckDB-WASM mirroring → enhancement spike (noted §10)
- Service-worker pre-warming of chart bundles → polish, not blocking

---

## 1. Executive Summary

Sub-project B turns AskDB's chart system from "functional at small data sizes" into the **fastest mainstream BI chart engine on big data**. It rests on three pillars:

1. **Push the work to the server.** Use the existing DuckDB twin to LTTB-downsample line charts and uniformly downsample everything else **before bytes leave the backend**. The frontend never receives more points than it can render at the target frame budget. Arrow IPC is the wire format (already supported by `query_twin`).

2. **Pick the right renderer at render time, not at code-write time.** A new **Render Strategy Router (RSR)** sits one layer below A's IR router. A's router maps `spec.type → renderer family` (Vega / MapLibre / deck.gl / Creative). RSR maps `(spec, rowCount, GPU tier, frame budget, instance pressure) → concrete backend` inside that family — SVG vs Canvas vs WebGL. Same IR, different pixels.

3. **Stay smooth under load with a closed feedback loop.** A frame-budget tracker measures real frame times. When edits or data updates push frame time past 16ms, RSR escalates the renderer (e.g. SVG → Canvas, Canvas → WebGL). When idle, the unified InstancePool evicts off-screen tiles to free WebGL contexts. The system self-tunes — analysts don't have to know about render modes.

These three pillars deliver the four benchmark targets in §0.3 without expanding bundle size or breaking A's IR contract. B adds two backend modules, three frontend modules, one Playwright benchmark suite, and modifies six existing files. **Six phases, ~5–7 weeks.**

---

## 2. Architecture Overview

### 2.1 The renderer escalation ladder

Every chart goes through a four-tier ladder. RSR picks the entry tier from `(rowCount, chartType, GPU tier, current frame budget, instance pressure)` and can escalate up under load. Higher tier = more performance budget but heavier setup cost.

| Tier | Backend | Marks budget | Use cases | Cost / setup |
|---|---|---|---|---|
| **T0** | Vega-Lite SVG | ≤ 4k marks | Static thumbnails, KPI cards, sparklines that must export crisp, anything ≤4k where the editor needs DOM hit-testing for on-object editing | Cheapest, free hit-testing, accessible |
| **T1** | Vega-Lite Canvas | ≤ 80k marks | The 80% case for analyst workbench charts, especially after server LTTB | Moderate; manual hit-testing via Vega's signal API |
| **T2** | deck.gl `ScatterplotLayer` / `LineLayer` / `SolidPolygonLayer` driven by IR compiler `chart-ir/renderers/DeckRenderer.tsx` | ≤ 2M marks | Dense scatter, geo overlays already on this path, time series after progressive load, big network/graph layouts | Highest setup cost, eats one WebGL context |
| **T3** | deck.gl + **Arrow IPC streaming** (raw record batches piped from server, no JSON serialization on hot path) | Practically unbounded rowcount, output capped at point budget | The "10M-row line chart" benchmark; live operations dashboards with 5s refresh | Highest cost, requires server-side LTTB to pre-shape |

T0–T2 share the IR. T3 is T2 with a different data delivery path (Arrow over SSE instead of JSON in the query result envelope).

A's renderer matrix (§9.3 of A spec) maps `spec.type` to a *renderer family*:

```
spec.type === 'cartesian' → react-vega
spec.type === 'map'        → MapLibreCanvas
spec.type === 'geo-overlay'→ DeckGLCanvas
spec.type === 'creative'   → CreativeCanvas (three/r3f)
```

B keeps A's mapping and adds the strategy decision:

```
'cartesian'   → react-vega (T0/T1) OR DeckGLCanvas (T2/T3) ← RSR picks
'map'         → MapLibreCanvas (always — MapLibre is its own renderer)
'geo-overlay' → DeckGLCanvas (T2/T3)
'creative'    → CreativeCanvas (Three/r3f) (own pool slot)
```

This means the `cartesian` spec type can render through **either** Vega *or* deck.gl depending on the strategy. The IR doesn't have to change — RSR's job is to translate the same `ChartSpec.encoding` into either Vega-Lite spec or deck.gl Layer instances. This requires a small **deck.gl IR compiler** (new file: `chart-ir/renderers/DeckRenderer.tsx` plus `chart-ir/compilers/specToDeckLayers.ts`) that handles the seven mark types deck.gl can express natively (point, line, area, rect, geoshape, arc, trail). Marks deck.gl can't express (boxplot, errorbar, violin, etc.) stay on Vega — RSR knows which marks are deck.gl-eligible and refuses to escalate beyond T1 for them.

### 2.2 New backend modules

```
backend/
  chart_downsampler.py                          # NEW
    DownsampleStrategy enum: lttb | uniform | min_max_pixel | aggregate_bin | none
    pick_strategy(column_profile, target_points) -> DownsampleStrategy
    lttb_sql(table_name, x_col, y_col, target_points) -> str   # DuckDB SQL fragment
    uniform_sql(table_name, target_points) -> str
    pixel_min_max_sql(table_name, x_col, y_col, pixel_width)   # Grafana-style
  arrow_stream.py                               # NEW
    AsyncIterator[bytes] over Arrow RecordBatch IPC frames
    stream_query(conn_id, sql, target_points, batch_rows) -> AsyncIterator[bytes]
    Use cases: SSE chart_chunk events; T3 progressive render
```

`chart_downsampler.py` does **not** call DuckDB itself — it returns SQL fragments that the existing `DuckDBTwin.query_twin()` runs. This keeps the security envelope intact (existing SQLValidator path) and reuses the Arrow zero-copy bridge already in `query_twin()`.

`arrow_stream.py` is a thin wrapper over `query_twin()` that splits a result into N row batches and yields each as an Arrow IPC frame. Its consumer is a new SSE endpoint on `agent_routes.py` (`POST /api/v1/charts/stream`). The existing agent SSE infrastructure (used by `AgentEngine`) is reused — same SSE serialization, same auth.

### 2.3 New frontend modules

```
frontend/src/
  chart-ir/
    rsr/                                        # NEW
      renderStrategyRouter.ts                   # RSR core: (spec, profile, gpu, budget, pressure) → strategy
      strategy.ts                               # RenderStrategy type + escalation rules
      thresholds.ts                             # configurable T0/T1/T2/T3 cutoffs (also surfaced via env)
    renderers/
      DeckRenderer.tsx                          # NEW — react component wrapping deck.gl
      ProgressiveVegaCanvas.tsx                 # NEW — Vega Canvas with progressive batch ingest
    compilers/                                  # NEW
      specToDeckLayers.ts                       # ChartSpec → deck.gl Layer[]
      specToVegaLite.ts                         # ChartSpec → VL spec (already part of A — extend, don't duplicate)
    perf/                                       # NEW
      frameBudgetTracker.ts                     # rAF-based rolling FPS measurement
      instancePool.ts                           # supersedes webglContextPool, manages Vega/MapLibre/deck.gl/Three slots
      arrowChunkReceiver.ts                     # SSE Arrow IPC receiver, wires into ProgressiveVegaCanvas / DeckRenderer
      rendererTelemetry.ts                      # per-render timing, FPS, escalation events → POST /api/v1/perf/telemetry (fire-and-forget)
  perf/                                         # NEW — benchmark harness
    bench-10m-line.spec.ts
    bench-1m-scatter.spec.ts
    bench-100k-table-sparklines.spec.ts
    bench-500-tile-dashboard.spec.ts
    fixtures/                                   # synthetic data generators (no external network)
```

### 2.4 Existing files modified

| File | Change |
|---|---|
| `chart-ir/router.ts` (from A) | Inject RSR call before dispatching to a renderer. Pass strategy result down to renderer component. |
| `chart-ir/types.ts` (from A) | Extend `Transform.sample` schema to carry `target_points` and `pixel_width` hints. Add optional `strategyHint?: 't0' \| 't1' \| 't2' \| 't3'` on `ChartSpec.config` for power users / tests. |
| `chart-ir/renderers/VegaRenderer.tsx` (from A) | Accept `renderer: 'svg' \| 'canvas'` prop from RSR. Wire frame budget tracker around the render call. |
| `lib/webglContextPool.js` | Replaced by `chart-ir/perf/instancePool.ts`. Existing API (`acquireContext`, `releaseContext`, `touchContext`, `onContextLost`) preserved as re-exports for backward compat with existing Three.js engines. New API: `acquireSlot(kind, id, weight, onEvict)` where `kind` ∈ `'vega-canvas' \| 'maplibre' \| 'deck' \| 'three'` and `weight` is a memory-pressure number. |
| `agent_routes.py` | New SSE endpoint `POST /api/v1/charts/stream` that bridges `arrow_stream.py` to the existing SSE pipeline. Auth + dialect-aware behavior reused. |
| `query_engine.py` | When the query engine returns a result destined for a chart, also return `chart_hints: {row_count_estimate, x_column, y_column}` so the frontend can pre-compute a strategy without parsing the result. |
| `duckdb_twin.py` | Add `query_twin_downsampled(conn_id, sql, target_points, x_col, y_col, strategy)` — wraps the original query in a DuckDB CTE that applies the SQL fragment from `chart_downsampler.py`. Still validates via `SQLValidator`. Still respects `_MAX_RESULT_ROWS` cap. |
| `config.py` | New flags: `CHART_DOWNSAMPLE_ENABLED` (default True), `CHART_DOWNSAMPLE_DEFAULT_TARGET_POINTS` (default 4000), `CHART_STREAM_BATCH_ROWS` (default 5000), `CHART_FRAME_BUDGET_TIGHT_MS` (16), `CHART_FRAME_BUDGET_LOOSE_MS` (33), `CHART_INSTANCE_POOL_MAX` (12 — was 8 in webglContextPool, raised to fit MapLibre + deck + Three coexistence on modern laptops, downshifted on `gpuTier === 'low'` to 6 at runtime). |

### 2.5 Why not just use ECharts after all

Three reasons B does not undo A's ECharts removal:

1. **A's editor depends on Vega-Lite specifically** — Marks card binding, on-object editing, JSON-Patch undo/redo, and the agent's edit tools all assume the Vega-Lite spec shape. Re-introducing ECharts means writing two compilers and breaking the unified IR.
2. **deck.gl already covers the >100k point territory** that ECharts-GL would cover, with better React integration and an existing `webglContextPool` story.
3. **The actual ECharts perf wins (`large`, `progressive`, `sampling: lttb`)** are *patterns*, not magic — server-side LTTB and progressive Canvas batching are reproducible in Vega Canvas with a thin progressive wrapper. B implements those patterns directly.

If a future benchmark proves Vega Canvas can't hit the targets even with progressive batching and LTTB pre-shaping, the contingency is **bring back ECharts as a fourth renderer family in A's router** (alongside Vega/MapLibre/deck/Creative), gated behind a `STRATEGY_USE_ECHARTS_FALLBACK` flag. Decision deferred to the Phase-3 benchmark gate (§4).

---

## 3. Component Designs

### 3.1 Render Strategy Router (RSR)

**File:** `chart-ir/rsr/renderStrategyRouter.ts`

**Purpose:** Single pure function. Given the inputs, return a `RenderStrategy` object.

```typescript
interface RenderStrategyInput {
  spec: ChartSpec;
  resultProfile: { rowCount: number; xType?: SemanticType; yType?: SemanticType; markEligibleForDeck: boolean };
  gpuTier: 'low' | 'medium' | 'high';
  frameBudgetState: 'tight' | 'normal' | 'loose';
  instancePressure: { activeContexts: number; max: number; pressureRatio: number };
  hint?: 't0' | 't1' | 't2' | 't3';
}

interface RenderStrategy {
  tier: 't0' | 't1' | 't2' | 't3';
  rendererFamily: 'vega' | 'deck' | 'maplibre' | 'creative';
  rendererBackend: 'svg' | 'canvas' | 'webgl';
  downsample: { enabled: boolean; method: 'lttb' | 'uniform' | 'pixel_min_max' | 'none'; targetPoints: number };
  streaming: { enabled: boolean; batchRows: number };
  reason: string;  // human-readable, surfaced in dev mode + telemetry
}

function pickRenderStrategy(input: RenderStrategyInput): RenderStrategy
```

**Decision tree (in priority order):**

1. **Hint override.** If `hint` set, honor it but only after a sanity check (refuse `t2`/`t3` for non-deck-eligible marks). Used by tests + power users.
2. **Family fixed by spec.type.** `map` → maplibre always, `creative` → Three always. Cannot be escalated; their performance work happens inside the renderer itself, not via RSR.
3. **GPU tier `low` clamp.** If `gpuTier === 'low'`, max tier is T1. No WebGL escalation — these users are on integrated graphics or older hardware where WebGL contexts are unstable. Server LTTB still applies.
4. **Row count thresholds (config-driven, defaults shown).**
   - `rowCount <= 4_000` → T0 SVG (also: smaller marks budget if `frameBudgetState === 'tight'`)
   - `rowCount <= 80_000` → T1 Canvas
   - `rowCount <= 500_000` and mark eligible → T2 deck.gl
   - `rowCount > 500_000` and mark eligible → T3 deck.gl + Arrow streaming + server LTTB
   - `rowCount > 80_000` and NOT mark eligible → T1 Canvas + server LTTB to ≤4_000 (the boxplot/violin case — downsample then render statically)
5. **Instance pressure clamp.** If `pressureRatio > 0.85`, downshift one tier (e.g. T2 → T1) to free a WebGL slot. The frame budget tracker may then escalate back if pressure relaxes.
6. **Frame budget escalation.** If `frameBudgetState === 'tight'` and chart rerenders are happening (e.g. Marks card drag), escalate one tier at the cost of redraw cycles — net wins if the new tier is faster per redraw.
7. **Streaming gate.** Streaming is enabled iff `tier === 't3'` OR `tier === 't2' && rowCount > 200_000`. Below that the synchronous Arrow path beats the streaming setup cost.

**Why pure function:** Easy to unit test (no DOM), easy to log in telemetry, easy for the agent to ask "which tier are you on?" via an inspector overlay.

### 3.2 Frame Budget Tracker

**File:** `chart-ir/perf/frameBudgetTracker.ts`

**Purpose:** Continuously measure how long the browser is taking to paint frames. Expose three states.

**Mechanism:**
- Single `requestAnimationFrame` loop running for the lifetime of the editor. Records `performance.now()` deltas into a 60-frame circular buffer (one second of history at 60fps).
- Computes p95 frame time over the buffer.
- States:
  - `'loose'`: p95 < 12ms (room to spare)
  - `'normal'`: 12ms ≤ p95 < 28ms
  - `'tight'`: p95 ≥ 28ms (frames being dropped — escalate)
- Emits state-change events to a Zustand selector that RSR reads. Hysteresis: state must hold for ≥ 200ms before emitting, so a single GC pause doesn't cause an escalation oscillation.
- One global instance per browser tab. Collected across all charts on screen — if any tile is causing the drop, the whole editor reacts. Acceptable trade-off for v1; per-tile tracking is a polish item.

**Cost:** ~0.02ms per frame. Dwarfed by anything else happening.

### 3.3 Unified InstancePool (replaces webglContextPool)

**File:** `chart-ir/perf/instancePool.ts`

**Purpose:** Track *all* renderer instances across the editor — not just WebGL — so eviction decisions account for memory pressure, not just GPU context count.

**API:**
```typescript
type InstanceKind = 'vega-canvas' | 'vega-svg' | 'maplibre' | 'deck' | 'three';

interface InstanceWeight {
  webglContext: 0 | 1;       // count toward browser's WebGL context cap
  estimatedMb: number;       // rough memory footprint
}

const WEIGHTS: Record<InstanceKind, InstanceWeight> = {
  'vega-svg':    { webglContext: 0, estimatedMb: 5 },
  'vega-canvas': { webglContext: 0, estimatedMb: 12 },
  'maplibre':    { webglContext: 1, estimatedMb: 60 },
  'deck':        { webglContext: 1, estimatedMb: 80 },
  'three':       { webglContext: 1, estimatedMb: 50 },
};

function acquireSlot(kind, id, onEvict): SlotHandle
function touchSlot(id)
function releaseSlot(id)
function activeWebglContexts(): number
function estimatedMemoryMb(): number
function pressureRatio(): number   // weighted: max(webglRatio, memoryRatio)
```

**Eviction policy:** LRU plus a weighted preference — when both a `vega-canvas` slot and a `deck` slot are LRU candidates, evict `deck` first because it frees a WebGL context (which is the scarce resource on most GPUs). Engines unmount and re-mount on revisit — the editor wraps every renderer in `useViewportMount` so off-screen tiles are evicted naturally during scroll.

**Backward compatibility:** `webglContextPool.js` becomes a 10-line shim that calls into `instancePool.ts` so existing Three engines keep working. The new pool is configured via `config.CHART_INSTANCE_POOL_MAX`. Total memory cap is implicit: pool tracks `estimatedMemoryMb()` and starts evicting if it exceeds `gpuTier === 'low' ? 300 : 700`. These are heuristics — telemetry reports actual values for tuning.

**Why not just count WebGL contexts:** because Vega Canvas tiles also consume real memory (`<canvas>` backing stores, Vega scenegraphs) and on a 500-tile dashboard you can OOM the renderer process even if zero WebGL contexts are open.

### 3.4 Server-side downsampling — `chart_downsampler.py`

**Purpose:** Decide which downsampling strategy applies to a query result, and produce a SQL fragment that does it inside DuckDB.

**Strategies:**

| Strategy | Use case | SQL approach |
|---|---|---|
| `lttb` | Time-series line/area with one continuous x and one y | DuckDB UDF or pure-SQL implementation (see §3.5) — preserves visual peaks/troughs |
| `uniform` | Anything with no clear x ordering — random sample | `USING SAMPLE n ROWS` (DuckDB has this natively) |
| `pixel_min_max` | Time series where pixel width is known — Grafana approach | Bucket by `floor(x_pixel)` and emit `MIN(y), MAX(y)` per bucket; renders as tight error bands without losing range |
| `aggregate_bin` | Histogram-shaped dimensions (`spec.transform.bin` set) | `GROUP BY bin_id` — already idiomatic DuckDB |
| `none` | rowCount below `target_points` already | identity passthrough |

**`pick_strategy(column_profile, target_points)`:**

```
if rowCount <= target_points: return 'none'
if spec.transform.bin is set: return 'aggregate_bin'
if x is temporal/quantitative monotonic and y is quantitative: return 'lttb'
if pixel_width hint provided and x is temporal: return 'pixel_min_max'
return 'uniform'
```

`pick_strategy` is called by the new `query_twin_downsampled()` method on `DuckDBTwin`, not by the LLM. The agent doesn't need to think about downsampling — it just emits IR.

### 3.5 LTTB in pure SQL (DuckDB)

DuckDB doesn't ship LTTB natively (as of the version in `requirements.txt`). Three options ranked by complexity:

- **A. Pure-SQL LTTB via window functions.** ~50 lines of SQL with `NTILE(target_points)`, lateral joins for triangle area maximization. Slowest but zero install cost. Targets ~10M rows in ~400ms on a laptop in informal testing of similar implementations.
- **B. DuckDB Python UDF written in numpy/numba.** Imports numpy (already in requirements via pandas), registers a scalar UDF on first use. Faster than (A) but introduces a per-query UDF registration cost.
- **C. DuckDB extension `tsm-lttb`** (community extension if available). Cleanest but extension availability is fragile across DuckDB versions. **Assumption: avoided for v1** to keep the dependency graph simple. Re-evaluate if (A) is too slow at 10M rows.

**B picks A for v1.** The SQL lives as a string template in `chart_downsampler.py::lttb_sql()`. Tests cover the 10M-row benchmark. If Phase-3 benchmarks miss the 60fps target the contingency is to switch to (B) — single-file change.

### 3.6 Progressive SSE streaming

**Server side:** `arrow_stream.py::stream_query(conn_id, sql, target_points, batch_rows)` runs the query through `query_twin_downsampled`, then iterates the resulting Arrow Table in `batch_rows`-sized record batches, serializing each via the Arrow IPC stream format and yielding bytes. The new `POST /api/v1/charts/stream` route on `agent_routes.py` adapts this to SSE: each yielded chunk becomes an SSE event with `event: chart_chunk` and `data: <base64-Arrow-IPC>`. A terminal `event: chart_done` carries summary metadata (total rows, downsample applied, server time).

**Client side:** `chart-ir/perf/arrowChunkReceiver.ts` opens the SSE, decodes Arrow batches via the existing `apache-arrow` JS package (already in deps via the global-comp Arrow bridge), and feeds each batch to whichever renderer subscribed:

- `ProgressiveVegaCanvas.tsx` calls `view.change('source', vega.changeset().insert(rows))` and triggers a partial redraw (Vega's built-in incremental update path).
- `DeckRenderer.tsx` updates the layer's `data` prop with the accumulated Arrow Table and lets deck.gl re-buffer the GPU side.

**Why not WebSocket:** SSE matches the existing agent SSE infra (auth, reconnect, backpressure semantics). One transport story for the whole product. WebSocket would also work but doubles the surface area.

**Backpressure:** if the client is too slow to consume (unlikely with Arrow's binary path), the server's async generator naturally pauses on the SSE write — Starlette handles this. No queue, no buffer overflow.

### 3.7 IR contract additions (minimal, additive)

Two additions to `chart-ir/types.ts`:

```typescript
interface Transform {
  // ...existing fields from A...
  sample?: {
    n: number;
    method: 'lttb' | 'uniform' | 'pixel_min_max';
    pixelWidth?: number;       // hint for pixel_min_max
    targetPoints?: number;     // if absent, server uses default
  };
}

interface ChartSpec {
  // ...existing fields from A...
  config?: {
    // ...existing config fields from A...
    strategyHint?: 't0' | 't1' | 't2' | 't3';   // power user / test override
  };
}
```

Both fields are optional. A ChartSpec emitted by the agent that knows nothing about B still works — RSR computes a strategy from the result profile and chooses `targetPoints` from `CHART_DOWNSAMPLE_DEFAULT_TARGET_POINTS`.

---

## 4. Approaches Considered (and Why This One)

Three approaches were laid out before settling. Recording all three so the reasoning is auditable.

### Approach A — "Server truth + adaptive ladder" (chosen)
- Server-side LTTB / uniform / pixel_min_max in DuckDB twin is the single source of truth.
- RSR picks the renderer at render time from a deterministic decision tree.
- Frame budget tracker drives runtime escalation.
- Pros: deterministic, testable, predictable cost, minimal IR change, minimal new infra. Closes 100% of the benchmark gap with one new backend module + one new frontend strategy module.
- Cons: detail-on-zoom requires a re-query (round trip), so very long pans on a 10M-row time series feel like discrete zoom levels rather than continuous detail.
- Why chosen: this is the lowest-risk path that meets every benchmark in §0.3, fits the existing waterfall + Arrow infra cleanly, and reuses A's IR with two additive fields.

### Approach B — "Hybrid lazy zoom"
- Same server LTTB, but the frontend also receives an Arrow IPC handle to the *full* dataset (not just the downsample) and re-queries detail on brush/zoom.
- Pros: feels like Datadog/Grafana — continuous zoom into detail without extra latency.
- Cons: doubles the wire payload for big results. Memory pressure in the browser. Brush-to-detail UX is a separate design problem (overshoot, debounce, query coalescing). Not necessary to clear the §0.3 benchmarks. Better as a polish phase after B ships.
- Verdict: **defer to B Phase 6** if benchmarks pass without it. Otherwise pull forward.

### Approach C — "Pure progressive streaming"
- No upfront downsample. Server streams Arrow batches as fast as it can read them; client renders progressively into a Canvas using Vega's progressive mode.
- Pros: best perceived latency — first paint within hundreds of ms.
- Cons: most complex, hardest to test, fragile under network jitter, doesn't actually *fit more data on screen* — it just paints the same data sooner. The 10M-row scenario still needs LTTB or you're rendering 10M points eventually.
- Verdict: the streaming *transport* is taken from C and bolted onto A as the T3 path. The "no upfront downsample" idea is rejected because it doesn't solve the actual rendering ceiling.

The chosen path is **A with C's streaming transport reused for T3**.

---

## 5. Build Sequence — Six Phases (~5–7 weeks)

Each phase ends with a git checkpoint commit + tag and lives behind a `CHART_PERF_ENABLED` feature flag (default `false` in B Phase 0–4, default `true` after Phase 5 staging dogfood). All six phases must wait until A has reached at least its own Phase 1 (`v1-editor-shell`) so RSR has a router to extend.

### Phase B0 — Foundations (~3–5 days)
- Create `chart-ir/rsr/`, `chart-ir/perf/`, `chart-ir/compilers/specToDeckLayers.ts`, and `chart-ir/renderers/DeckRenderer.tsx` skeletons.
- Add config flags to `config.py`.
- Stub `chart_downsampler.py` and `arrow_stream.py` with type signatures + docstrings.
- Define `RenderStrategy` type, `RenderStrategyInput` type, and the decision tree as a pure function with 30+ unit tests for the decision matrix.
- **Checkpoint:** `b0-foundations`. Tests: every cell of the decision matrix exercised. RSR + frame budget tracker importable and round-trip with no-op inputs.

### Phase B1 — Server-side downsampling (~1 week)
- Implement `chart_downsampler.py::pick_strategy()` and `lttb_sql()`, `uniform_sql()`, `pixel_min_max_sql()`, `aggregate_bin_sql()`.
- Add `DuckDBTwin.query_twin_downsampled()` that builds a CTE around the user's SQL and applies the chosen fragment.
- Add `column_profile`-derived `chart_hints` to `query_engine.py` query response.
- Backend tests: each strategy on a synthetic 10M-row time series and a 1M-row scatter. Assert: result row count matches `target_points ± 1%`, p95 query time < 1s on the laptop fixture.
- **Checkpoint:** `b1-downsampling`. Telemetry: log each strategy chosen with rowcount + time.

### Phase B2 — RSR + Vega Canvas wiring (~1 week)
- Implement `frameBudgetTracker.ts` and wire to a Zustand selector.
- Implement `instancePool.ts` and migrate `webglContextPool.js` to a shim.
- Wire RSR into `chart-ir/router.ts`: every renderer mount goes through RSR first.
- Extend `VegaRenderer.tsx` to accept and respect `rendererBackend: 'svg' | 'canvas'`.
- Build `ProgressiveVegaCanvas.tsx` with non-streaming bulk path first (streaming added in B4).
- **Checkpoint:** `b2-rsr-vega`. Tests: synthetic 80k-point line chart renders T1 Canvas at 60fps. Synthetic 4k-point bar chart renders T0 SVG. Mode-switch when `frameBudgetState` flips to `tight`.

### Phase B3 — deck.gl renderer for cartesian (~1 week)
- Implement `compilers/specToDeckLayers.ts`: ChartSpec → deck.gl Layer instances for the 7 deck-eligible mark types (point, line, area, rect, geoshape, arc, trail).
- Build `DeckRenderer.tsx` — a React wrapper around deck.gl that subscribes to the InstancePool, registers as `'deck'` kind.
- Hit-testing via deck.gl's `pickObject()` mapped back to IR `selection` events so on-object editing still works on T2/T3.
- **Benchmark gate:** the four §0.3 benchmarks must all pass at 60fps on the laptop fixture. Failing benchmarks trigger the `STRATEGY_USE_ECHARTS_FALLBACK` contingency decision (re-evaluate ECharts as a fourth family).
- **Checkpoint:** `b3-deck-cartesian`.

### Phase B4 — Progressive Arrow streaming (~1 week)
- Implement `arrow_stream.py::stream_query()`.
- Add `POST /api/v1/charts/stream` SSE route to `agent_routes.py`.
- Implement `chart-ir/perf/arrowChunkReceiver.ts`.
- Wire `ProgressiveVegaCanvas.tsx` and `DeckRenderer.tsx` to the receiver.
- T3 strategy now actually engages — 10M-row benchmark re-runs through the streaming path, target: first paint < 500ms, full data < 2s.
- **Checkpoint:** `b4-streaming`. Test: streaming reconnect on simulated network drop.

### Phase B5 — Telemetry, dashboard scroll, polish (~1 week)
- Implement `rendererTelemetry.ts` and `POST /api/v1/perf/telemetry` (fire-and-forget).
- Wire `useViewportMount` into every renderer so off-screen tiles release their pool slots.
- Profile + tune the 500-tile dashboard benchmark. Likely fixes: render-strategy hysteresis, viewport-mount root margin, debounced resize.
- Dev-mode overlay: small badge in chart corner showing current tier + reason. Toggled by `Cmd+Alt+P`.
- Flip `CHART_PERF_ENABLED` to true in staging.
- **Checkpoint:** `b5-polish`. All four benchmarks green, 7 days of staging dogfood pass.

### Phase B6 — Production rollout + Approach B exploration (~3 days)
- Flip `CHART_PERF_ENABLED` to true in production.
- Monitor telemetry for unexpected escalation patterns, eviction storms, OOM signals.
- Spike: prototype the brush-to-detail re-query path (Approach B) for a polish PR. If clean, ship as B.5; otherwise leave as a follow-up.
- **Checkpoint:** `b6-prod-rollout`. Tag `chart-perf-v1`.

**Total: ~5–7 weeks** assuming A's Phase 0–1 is done and one strong full-stack engineer + AI assist.

---

## 6. Benchmarks — The Acceptance Suite

`frontend/perf/` contains four Playwright benchmarks. Each runs against a local backend with synthetic data generated by a fixture script. Targets are p95 over 5 runs. Each benchmark must fail loudly in CI, not be graded "kinda fast" by hand.

| Benchmark | Generator | Target |
|---|---|---|
| `bench-10m-line.spec.ts` | `gen_minute_metrics(10_000_000)` — synthetic 10M-row 2-year minute time series, single y column | First paint < 500ms; pan/zoom 60fps; LTTB downsample to ≤4k points; T3 path |
| `bench-1m-scatter.spec.ts` | `gen_customer_spend(1_000_000)` — 1M rows, 3 measures + 1 dim | First paint < 800ms; 60fps pan/zoom/brush; T2 deck.gl path |
| `bench-100k-table-sparklines.spec.ts` | `gen_inventory_history(100_000)` — 100k rows, each row has a 30-bucket sparkline | Scroll 60fps with 50 visible rows + 20-row buffer; sparklines drawn on shared `<canvas>` per page |
| `bench-500-tile-dashboard.spec.ts` | `gen_analyst_workbench(500)` — 500 mixed tiles synthesized from the analyst-workbench mockup | Scroll 60fps; ≤12 active pool slots at any time; off-screen tiles released within 200ms |

**Mid-spec laptop fixture:** Intel i5 / 8GB RAM / Intel Iris Xe integrated GPU. CI runs on a containerized equivalent. If CI hardware is fundamentally different, document the fixture and add a hardware-correction factor.

**FPS measurement:** Playwright + `requestAnimationFrame` instrumentation injected as a script on page load. Counts frames during a scripted interaction (pan, scroll, brush). p5 (5th percentile) must be ≥ 50fps to pass — equivalent to "no visible jank during the interaction."

---

## 7. Telemetry & Observability

`POST /api/v1/perf/telemetry` (fire-and-forget) accepts:

```json
{
  "session_id": "abc123",
  "tile_id": "def456",
  "tier": "t2",
  "renderer_family": "deck",
  "renderer_backend": "webgl",
  "row_count": 1247000,
  "downsample_method": "uniform",
  "target_points": 80000,
  "first_paint_ms": 642,
  "median_frame_ms": 11.8,
  "p95_frame_ms": 16.2,
  "escalations": [{"from": "t1", "to": "t2", "reason": "frame_budget_tight"}],
  "evictions": 0,
  "instance_pressure_at_mount": 0.45,
  "gpu_tier": "medium"
}
```

Server appends to `.data/audit/chart_perf.jsonl` (atomic JSONL append, rotates at 50MB — same pattern as `query_decisions.jsonl`). Used for:
- Tuning the RSR thresholds based on real distributions
- Catching regression: per-tile p95 frame time should never increase across releases
- User research: which charts hit T3? Are our customers really on big data?

Privacy: telemetry contains zero user data — only sizes, timings, tier names. PII never enters this stream.

---

## 8. Risks + Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Pure-SQL LTTB too slow at 10M rows on the laptop fixture | Medium | High | Phase B3 benchmark gate. Contingency: numpy UDF (option B in §3.5). One-file change. |
| Vega Canvas can't hit 60fps even at T1 with downsampled data | Low | High | Phase B3 benchmark gate. Contingency: ECharts 4th family behind `STRATEGY_USE_ECHARTS_FALLBACK` flag. |
| Frame budget tracker oscillates between tight/normal causing re-mount thrash | Medium | Medium | Hysteresis (200ms hold) + unidirectional escalation cooldown (30s). Telemetry catches oscillation patterns. |
| InstancePool eviction kills a tile a user is actively viewing | Low | Medium | LRU is biased by `touchSlot()` calls inside renderer hover/edit/data-update handlers. Active tiles have very recent timestamps. |
| MapLibre + deck.gl + Three coexistence on a 500-tile dashboard exceeds browser WebGL cap | High | Medium | Pool max set conservatively (12 default, 6 on low GPU). Aggressive viewport-mount eviction. Three-mode tiles capped per dashboard. |
| Arrow JS bundle size regression | Low | Low | Already in deps via global-comp Arrow bridge. Lazy-loaded only on T3 mount. |
| SSE streaming reconnect on network drop loses partial state | Medium | Low | Server includes `chunk_index` in each chart_chunk event. Client requests resume from `chunk_index + 1` on reconnect. |
| Strategy "tier change in flight" race when data update arrives mid-render | Medium | Low | Renderer mounts are idempotent on (spec, strategy, data) tuple. Mid-flight changes drop the in-progress render and start fresh. |
| Telemetry write contention on busy backends | Low | Low | Reuse the buffered append-with-flush pattern from `audit_trail.py`. |
| Sub-project A's Phase 1 slips and B can't start | High | Medium | B0 can prototype against a stub IR router. B1 (server work) is independent of A entirely. Worst case: B1+B2 work in parallel with A1. |
| Brush-to-detail (Approach B) added later breaks T3 streaming assumptions | Low | Low | T3 contract is "input rowcount unbounded, output point budget fixed." Brush-to-detail is "request a different SQL with narrower x range" — separate code path, doesn't touch RSR. |
| `pixel_min_max` requires knowing the chart's pixel width at SQL time | Medium | Low | Frontend computes chart width from the wrapper element on mount and passes it via the new `chart_hints.pixelWidth` field. RSR falls back to `lttb` if pixel width is missing. |

---

## 9. Success Metrics

Measured 4 weeks after Phase B6 production rollout:

- **All 4 benchmarks green in CI for 2 consecutive weeks.**
- **p95 first-paint for charts in production:** target < 800ms (current baseline measured during Phase B0).
- **p95 frame time during chart interaction in production:** target < 28ms.
- **Zero "chart turned white" / "tile unmounted itself" support tickets** within 30 days of rollout.
- **Telemetry distribution shows healthy tier mix:** ~70% T0/T1, ~25% T2, ~5% T3 (sanity check that the ladder is being used, not always pinned at one tier).
- **Eviction count per session p95 < 5** — pool isn't thrashing.
- **Dashboard scroll FPS at ≥150 tiles:** p5 ≥ 50fps.

---

## 10. Future Work / Out of Scope

- **Brush-to-detail re-query** (Approach B from §4) — polish phase, B6 spike.
- **DuckDB-WASM frontend mirror** — would let RSR fall back to client-side LTTB if the network is slow, eliminating server round trips for downsampling. Big infra spike, separate spec.
- **Arrow Flight RPC** to replace SSE for very large streams — only matters if 10M+ row scenarios become common.
- **Per-tile frame budget tracker** instead of one global tracker — finer-grained escalation. Punted to polish.
- **Service-worker pre-warming of chart bundles** — cuts first-load TTFB. Polish.
- **GPU memory measurement on browsers that expose `WEBGL_debug_renderer_info`** for smarter pool sizing. Browser support is uneven; not blocking.
- **Proprietary VizQL clone** — still a future research project. B's benchmarks may make it unnecessary.

---

## 11. Assumptions Made During Autonomous Drafting

This spec was drafted without sid23 present. Decisions below are reasonable defaults; sid23 may override any of them at the spec-review gate.

1. **Sub-project A is treated as the foundation even though unmerged.** Per the user's "continue" override at the start of this session.
2. **Vega-Lite stays as the cartesian renderer for T0/T1.** ECharts is not reintroduced in Phase B0–B5. The contingency `STRATEGY_USE_ECHARTS_FALLBACK` is documented but not implemented unless Phase B3 benchmarks fail.
3. **deck.gl handles all T2/T3 cartesian.** Plotly `scattergl` was considered and rejected — adds another renderer family for the same job, and deck.gl is already on the asset list from A.
4. **LTTB implemented as pure-SQL in DuckDB for v1.** numpy UDF and DuckDB extension paths are documented as contingencies.
5. **SSE is the streaming transport.** WebSocket/Arrow-Flight would also work. SSE chosen to reuse the existing agent SSE infra.
6. **Frame budget targets: 16ms tight / 33ms loose.** Standard 60fps and 30fps thresholds. No user-facing knob in v1.
7. **InstancePool max 12 (low GPU: 6).** Conservative under observed browser WebGL caps (Chrome ~16, Safari ~8, Firefox ~12). Telemetry will tune.
8. **Pixel-min-max strategy gated on pixel width hint** — falls back to LTTB if hint absent. Avoids defaulting to a less robust algorithm.
9. **Telemetry is fire-and-forget, no PII** — same privacy posture as existing audit trail.
10. **No frontend test framework added** — benchmark suite uses Playwright only (no Vitest/Jest). Matches CLAUDE.md note: "No frontend test suite (no Vitest/Jest)."
11. **Total timeline 5–7 weeks** assumes one strong full-stack engineer + AI assist, A reaching v1 first, no parallel epic disruption.
12. **Scheduled tasks for sub-project C and D are NOT triggered by this spec.** They have their own ad-hoc scheduled tasks that sid23 fires when ready.

---

## 12. References

- **Sub-project A spec:** `docs/superpowers/specs/2026-04-15-chart-system-sub-project-a-design.md` — IR types, renderer matrix, dropped/kept components.
- **Sub-project A plan:** `docs/superpowers/plans/2026-04-15-chart-system-sub-project-a.md` — Phase 0 detail, will define when A's IR router is mountable.
- **Chart systems research:** `docs/chart_systems_research.md`
  - §2.8 Tableau density (Viz-in-Tooltip is the cited density multiplier; deferred to Sub-project A polish, irrelevant to B).
  - §3.10 Power BI rendering stack — SVG/Canvas/WebGL split; data reduction algorithms (`top`, `sample`, `window`); the pattern B's RSR copies.
  - §5.4 ECharts performance modes (`large`, `progressive: 400`, `sampling: 'lttb'`) — patterns B reproduces in Vega Canvas + deck.gl.
  - §5.13 Canvas vs SVG vs WebGL tradeoffs — the table that justifies the renderer escalation ladder.
- **Existing AskDB code:**
  - `backend/duckdb_twin.py::query_twin()` — Arrow zero-copy bridge already implemented (lines 598–700). New `query_twin_downsampled()` extends this without touching the security envelope.
  - `backend/waterfall_router.py` — strategy pattern, sub-100ms tier-routing baseline. Not touched by B but informs the design pattern.
  - `frontend/src/lib/webglContextPool.js` — replaced by `chart-ir/perf/instancePool.ts`, kept as shim.
  - `frontend/src/components/charts/engines/ThreeScatter3D.jsx` — example of an existing engine that already uses the pool. Migrates cleanly to the new `acquireSlot('three', ...)` API via the shim.
  - `frontend/src/components/ResultsChart.jsx` — current production chart renderer; uses no perf modes; replaced by A's editor; B fills the perf hole.
- **Original chart UX implementation plan:** `docs/chart_ux_implementation_plan.md` — partly stale (still references ECharts compiler in Step 0.2). Cross-referenced for Phase numbering only; not authoritative after A.

---

## 13. Sign-off

This spec is **awaiting sid23's review**. Because it was drafted autonomously during a scheduled task run, no live brainstorm questions were asked — all open decisions are listed in §11 with their default choices and the reasoning. Sid23 should review §0.1 (A status), §1 (executive summary), §2.1 (renderer ladder), §3.1 (RSR decision tree), §4 (approach choice), §5 (six phases), §6 (benchmark targets), and §11 (assumptions) at minimum.

After review, the next step is invocation of `superpowers:writing-plans` to produce the per-task implementation plan. No code is written before that plan exists and sid23 approves it.

— end of spec —
