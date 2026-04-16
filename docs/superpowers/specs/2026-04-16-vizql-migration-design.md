# VizQL Migration: Replace Vega-Lite with Proprietary VizQL Engine

**Date:** 2026-04-16
**Status:** Approved — ready for implementation planning
**Scope:** Full replacement of Vega-Lite for all cartesian chart rendering in QueryCopilot V1

---

## 1. Context

QueryCopilot V1 (AskDB) currently uses Vega-Lite v5.23 via `react-vega` for all cartesian chart rendering. ECharts was already removed in Phase 4c. The charting pipeline is:

```
Query Result → chart_hints.py → chart_recommender.py → ChartSpec v1 IR
  → toVegaLite.ts compiler → react-vega <VegaLite /> → Browser
```

A proprietary VizQL engine (v0.9) was built in `files/VizQL/` with:
- 49/49 benchmark wins vs Vega-Lite (1,000-350,000x faster)
- Estimated 100-10,000x faster than Tableau Desktop
- 30 table calculations, LOD expressions (FIXED/INCLUDE/EXCLUDE)
- Browser interactivity: tooltips, brush, lasso, point selection, zoom/pan, cross-filter
- WebGL instanced rendering (regl SDF circles) for >10k marks
- Trend lines (6 regression types), forecasting, k-means clustering
- Anti-aliased rendering at all mark counts (sprite cache + WebGL SDF)

**Decision:** Full replacement. Vega-Lite removed from cartesian rendering. deck.gl/MapLibre/Three.js stay for their respective spec types.

---

## 2. Architecture

### 2.1 New Pipeline

```
Query Result → chart_hints.py → chart_recommender.py → ChartSpec v1 IR
  → toVizQL.ts compiler → VizQLRenderer.tsx → Canvas 2D / WebGL → Browser
```

The ChartSpec v1 IR layer is unchanged. Only the compiler target and renderer swap.

### 2.2 Rendering Tier Changes

| Tier | Before | After |
|------|--------|-------|
| t0 (≤10k rows) | Vega-Lite SVG | **VizQL canvas-quality** (sprite cache circles) |
| t1 (≤100k rows) | Vega-Lite Canvas | **VizQL webgl-instanced** (regl SDF) |
| t2 (≤10M rows) | deck.gl WebGL | deck.gl WebGL (unchanged) |
| t3 (>10M rows) | deck.gl streaming | deck.gl streaming (unchanged) |

VizQL's internal RSR handles sub-dispatch within t0/t1:
- <500 marks → canvas-quality (arc sprites)
- 500-10k → canvas-fast (sprite drawImage)
- >10k → webgl-instanced (regl SDF instanced draw)

### 2.3 Spec Type Routing

| Spec Type | Renderer | Changed? |
|-----------|----------|----------|
| cartesian | VizQL (was Vega-Lite) | **Yes** |
| map | MapLibre | No |
| geo-overlay | deck.gl | No |
| creative | Three.js | No |

---

## 3. File Structure

### 3.1 New Files

```
frontend/src/
  vizql/                              ← Copied from files/VizQL/renderer/
    index.ts                          ← renderVizQL() entry point
    compiler.ts                       ← VizQL spec parser
    aggregator.ts                     ← Datavore typed-array aggregation
    scales.ts                         ← Linear/band/time/color/size scales
    layout.ts                         ← Axis/legend/pane layout
    marks.ts                          ← Canvas 2D mark renderers (10 types)
    axes.ts                           ← Axis tick/label rendering
    legend.ts                         ← Color/size/shape legends
    labels.ts                         ← Label collision avoidance
    palettes.ts                       ← Tableau 10 + sequential palettes
    types.ts                          ← Internal types
    analytics.ts                      ← Trend lines, forecasting, clustering
    lod.ts                            ← LOD expressions
    tablecalc.ts                      ← 30 table calculations
    composition.ts                    ← Layer/concat/facet/repeat
    canvas-factory.ts                 ← Browser-only (Node.js path removed)
    webgl/
      rsr.ts                          ← VizQL render strategy router
      buffers.ts                      ← Typed array buffer pipeline + sprites
      regl-scatter.ts                 ← WebGL instanced SDF circles

  chart-ir/compiler/
    toVizQL.ts                        ← NEW: ChartSpec v1 → VizQL spec

  components/editor/renderers/
    VizQLRenderer.tsx                  ← NEW: React wrapper for VizQL canvas
```

### 3.2 Modified Files

| File | Change |
|------|--------|
| `chart-ir/router.ts` | `cartesian` routes to `'vizql'` instead of `'vega-lite'` |
| `chart-ir/rsr/renderStrategyRouter.ts` | t0/t1 return `vizql` family instead of `vega` |
| `components/editor/EditorCanvas.jsx` | Import + render `VizQLRenderer` for vizql route |
| `frontend/package.json` | Remove react-vega/vega/vega-lite, add regl |
| `vite.config.js` | Remove `vendor-vega` chunk |

### 3.3 Removed Dependencies

| Package | Version | Reason |
|---------|---------|--------|
| react-vega | ^7.7.1 | Replaced by VizQLRenderer |
| vega | ^5.33.1 | No longer needed |
| vega-lite | ^5.23.0 | Replaced by VizQL engine |

### 3.4 Added Dependencies

| Package | Version | Reason |
|---------|---------|--------|
| regl | ^2.1.1 | WebGL instanced rendering for >10k marks |

---

## 4. Component Design

### 4.1 toVizQL.ts Compiler

**Input:** `ChartSpec` (v1 IR from `chart-ir/types.ts`)
**Output:** VizQL-compatible spec object (mark + encoding + composition)

Mapping:
- `spec.type === 'cartesian'` → proceed (reject map/geo-overlay/creative)
- `spec.mark` → VizQL mark type string
- `spec.encoding.{x,y,color,size,shape,opacity,detail,tooltip,text,row,column}` → VizQL encoding channels
- Each `FieldRef` → `{ field, type, aggregate?, bin?, timeUnit?, sort? }`
- `spec.layer[]` → `{ layer: [...compiledSpecs] }`
- `spec.facet` → `{ facet: { field, type, columns }, spec: compiledInner }`
- `spec.hconcat/vconcat` → `{ hconcat/vconcat: [...compiledSpecs] }`
- `spec.transform[]` → applied to data before rendering (filter, calculate, bin)
- `spec.selection[]` → mapped to VizQL interaction state

### 4.2 VizQLRenderer.tsx

React component wrapping VizQL canvas rendering with full interactivity.

**Props:**
```typescript
interface VizQLRendererProps {
  spec: ChartSpec;
  data: Record<string, unknown>[];
  width: number;
  height: number;
  strategy: RenderStrategy;
  onBrushSelection?: (selection: BrushSelection) => void;
  onPointClick?: (row: Record<string, unknown>, index: number) => void;
  onDrillthrough?: (filters: DrillthroughFilter[]) => void;
  trendLine?: TrendLineType;
  interactionMode?: InteractionMode;
}
```

**Internal structure:**
- `useRef<HTMLCanvasElement>` for the render target
- `useEffect` on [spec, data] → compile + render pipeline
- `useMemo` for compiled spec (avoid recompile on interaction)
- Mouse event handlers: tooltip, brush, lasso, zoom/pan, point select
- `ResizeObserver` for responsive canvas sizing
- `useEffect` cleanup: destroy regl context

**Feature mapping from VegaRenderer:**

| VegaRenderer Feature | VizQLRenderer Implementation |
|---------------------|-------------------------------|
| react-vega `<VegaLite />` | Direct canvas rendering via `renderVizQL()` |
| Arrow chunk streaming | Append rows to data array, re-render |
| Drillthrough (click-to-filter) | `onPointClick` → parent applies filter |
| Brush-to-detail | `onBrushSelection` → parent narrows view |
| Mini sparkline tooltips | SpatialHash + DOM tooltip (textContent, no innerHTML) |
| Instance pooling (LRU) | Single canvas per component (no pooling needed — VizQL is fast) |
| Frame budget tracking | `performance.now()` timing → telemetry callback |
| RSR backend selection | VizQL internal RSR (canvas-quality/fast/webgl) |
| Downsampling transforms | VizQL aggregator handles natively (M4 downsample built-in) |

### 4.3 RSR Changes

**router.ts:**
- Add `'vizql'` to `RendererId` union type
- `routeSpec()`: `cartesian` → `'vizql'`

**renderStrategyRouter.ts:**
- t0 (≤10k): `{ rendererId: 'vizql', strategy: { tier: 't0', backend: 'canvas' } }`
- t1 (≤100k): `{ rendererId: 'vizql', strategy: { tier: 't1', backend: 'webgl' } }`
- t2/t3: unchanged (deck.gl)
- Remove Vega-specific downsample decisions (VizQL handles its own)

**EditorCanvas.jsx:**
- New case in renderer dispatch: `vizql` → `<VizQLRenderer />`
- Pass `spec`, `data`, `strategy`, interaction callbacks
- Wire `onBrushSelection` to store's selection state
- Wire `onPointClick` to drillthrough handler
- Remove or skip `vega-lite` case

---

## 5. Data Flow

### 5.1 Query → Chart Render

```
1. User asks natural language question
2. Agent generates SQL via agent_engine.py
3. SQL executes → result rows
4. chart_hints.py infers x/y columns + types
5. chart_recommender.py picks mark + encoding → ChartSpec v1
6. SSE streams ChartSpec to frontend
7. store.js chartEditor slice receives spec
8. EditorCanvas calls routeSpecWithStrategy() → 'vizql'
9. VizQLRenderer receives spec + data
10. toVizQL() compiles ChartSpec → VizQL spec
11. VizQL pipeline: compile → aggregate → scales → layout → draw
12. Canvas renders in browser
```

### 5.2 User Interaction

```
Tooltip hover: mousemove → SpatialHash.nearest() → show tooltip DOM
Brush select: mousedown/move/up → pixel→data inversion → onBrushSelection callback
Point select: click → SpatialHash.nearest() → onPointClick callback
Lasso select: mousedown/move/up → polygon path → ray-cast PIP → selection set
Zoom/pan: wheel/drag → viewport transform → re-render
Cross-filter: selection callback → parent filters linked chart data → re-render
Drillthrough: pointClick → parent applies filter to query → re-execute
```

---

## 6. What's NOT Changing

- **Backend** — No changes to chart_recommender.py, chart_hints.py, agent_engine.py, chart_downsampler.py, dashboard_migration.py, or any backend routes. They all produce ChartSpec v1 IR which is unchanged.
- **ChartSpec v1 IR** — The intermediate representation is the same. Only the compiler target changes.
- **ChartEditor shell** — The 3-pane editor (DataRail, Canvas, Inspector) is unchanged. Only the Canvas pane's renderer swaps.
- **Dashboard system** — DashboardTileCanvas mounts ChartEditor per tile, which internally uses the new renderer. No dashboard code changes.
- **Map/Geo/Creative renderers** — MapLibre, deck.gl, Three.js renderers are unchanged.
- **Store/state management** — Zustand store is unchanged. chartEditor slice still holds spec + undo/redo.

---

## 7. Testing Strategy

### 7.1 New Tests

| Test | Purpose |
|------|---------|
| `toVizQL.test.ts` | Compile each canonical chart type (bar, line, scatter, area, etc.) |
| `VizQLRenderer.test.tsx` | Mount component, verify canvas element exists |
| `vegaGuard.test.ts` | Ensure no vega/vega-lite imports in editor paths |

### 7.2 Updated Tests

| Test | Change |
|------|--------|
| `toVegaLite.test.ts` | Skip or remove (legacy) |
| `echartsGuard.test.ts` | Already passing — no change |
| `chartEditor.test.tsx` | May need mock updates for new renderer |

### 7.3 Smoke Test Checklist

1. `npm run dev` — frontend starts without errors
2. `npm run build` — production build succeeds
3. Load app → connect to a database → run a query → chart renders
4. Click different chart types (bar, line, scatter, area, pie)
5. Hover → tooltip appears
6. Brush select → selection highlights
7. Double-click → selection clears
8. HConcat/Facet compositions render correctly
9. Dashboard with multiple chart tiles renders
10. Agent suggests chart → chart appears in conversation

---

## 8. Rollback Plan

If critical issues found during testing:
1. `toVegaLite.ts` is kept (not deleted)
2. `VegaRenderer.tsx` is kept (not deleted)
3. `router.ts` change is a one-line revert: `'cartesian' → 'vega-lite'`
4. Re-add vega dependencies to package.json
5. Total rollback time: <5 minutes
