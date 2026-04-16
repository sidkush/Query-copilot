# VizQL Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Vega-Lite with the proprietary VizQL engine for all cartesian chart rendering in QueryCopilot V1.

**Architecture:** The ChartSpec v1 IR stays unchanged. A new `toVizQL.ts` compiler translates ChartSpec → VizQL-compatible specs. A new `VizQLRenderer.tsx` React component renders via Canvas 2D / WebGL. The RSR routes cartesian t0/t1 to VizQL instead of Vega-Lite. deck.gl/MapLibre/Three.js remain for their respective spec types.

**Tech Stack:** TypeScript, React 19, Canvas 2D, regl (WebGL), Vite

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `frontend/src/vizql/` (directory, 18 files) | VizQL engine copied from `files/VizQL/renderer/` |
| `frontend/src/chart-ir/compiler/toVizQL.ts` | ChartSpec → VizQL spec compiler |
| `frontend/src/components/editor/renderers/VizQLRenderer.tsx` | React component wrapping VizQL canvas |

### Modified Files
| File | Change |
|------|--------|
| `frontend/src/chart-ir/router.ts:31` | Add `'vizql'` to `RendererId` union |
| `frontend/src/chart-ir/router.ts:38-51` | Route `cartesian` → `'vizql'` |
| `frontend/src/chart-ir/router.ts:60-77` | Map `vega` family → `'vizql'` |
| `frontend/src/chart-ir/rsr/renderStrategyRouter.ts:88-134` | Change t0/t1 `rendererFamily` from `'vega'` to `'vizql'` |
| `frontend/src/components/editor/EditorCanvas.jsx:147-162` | Add `vizql` renderer dispatch case |
| `frontend/package.json:13-48` | Remove vega deps, add regl |
| `frontend/vite.config.js:16` | Remove `vendor-vega` chunk, add `vendor-vizql` |

---

### Task 1: Copy VizQL Engine into Frontend

**Files:**
- Create: `frontend/src/vizql/` (entire directory — 18 files from `files/VizQL/renderer/`)
- Modify: `frontend/src/vizql/canvas-factory.ts` (remove Node.js path)

- [ ] **Step 1: Copy renderer directory**

```bash
cp -r "files/VizQL/renderer/" "QueryCopilot V1/frontend/src/vizql/"
```

- [ ] **Step 2: Simplify canvas-factory.ts to browser-only**

Replace `frontend/src/vizql/canvas-factory.ts` with:

```typescript
/**
 * Canvas factory — browser-only.
 * Creates HTMLCanvasElement for the VizQL renderer.
 */

export const IS_BROWSER = true;

export interface PortableCanvas {
  width: number;
  height: number;
  getContext(type: '2d'): CanvasRenderingContext2D;
  toDataURL?(type?: string): string;
}

export function createPortableCanvas(width: number, height: number): PortableCanvas {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return c as unknown as PortableCanvas;
}

export function getOrCreateCanvas(
  target: HTMLCanvasElement | string | null,
  width: number,
  height: number,
): PortableCanvas {
  if (target) {
    const el = typeof target === 'string'
      ? document.querySelector<HTMLCanvasElement>(target)
      : target;
    if (el) { el.width = width; el.height = height; return el as unknown as PortableCanvas; }
  }
  return createPortableCanvas(width, height);
}
```

- [ ] **Step 3: Remove Node.js canvas pool pre-warming from index.ts**

In `frontend/src/vizql/index.ts`, remove the try/catch block that pre-warms the canvas pool (it uses `createPortableCanvas` which worked in Node.js but is unnecessary in browser — the pool will fill on demand):

Find and remove:
```typescript
// Pre-warm pool in Node.js only (browser creates canvases on demand)
try { for (let i = 0; i < 4; i++) releaseCanvas(createPortableCanvas(800, 600)); } catch { /* browser — skip */ }
```

- [ ] **Step 4: Remove Buffer references from index.ts**

In `frontend/src/vizql/index.ts`, change the `VizQLRenderResult` interface to remove Node.js `Buffer` type:

```typescript
export interface VizQLRenderResult {
  png: null;  // Browser doesn't produce PNG buffers
  renderTimeMs: number;
  renderOnlyMs: number;
  isStub: boolean;
  error?: string;
  tier?: string;
}
```

Also in the `renderVizQL` function, remove all `canvas.toBuffer('image/png')` calls — replace with `png: null`.

- [ ] **Step 5: Fix .js import extensions to work with Vite**

Vite resolves `.ts` files without extensions. The VizQL source uses `.js` extensions in imports (for Node.js ESM). Run a find-and-replace across all files in `frontend/src/vizql/`:

```bash
cd "QueryCopilot V1/frontend"
find src/vizql -name "*.ts" -exec sed -i "s/from '\.\(.*\)\.js'/from '.\1'/g" {} +
```

Or manually remove `.js` from all relative imports in the 18 files (e.g., `from './compiler.js'` → `from './compiler'`).

- [ ] **Step 6: Verify no TypeScript errors**

```bash
cd "QueryCopilot V1/frontend"
npx tsc --noEmit --project tsconfig.json 2>&1 | head -30
```

Expected: No errors in `src/vizql/` files (may have pre-existing errors elsewhere).

- [ ] **Step 7: Commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/vizql/
git commit -m "feat: copy VizQL engine into frontend src"
```

---

### Task 2: Write toVizQL.ts Compiler

**Files:**
- Create: `frontend/src/chart-ir/compiler/toVizQL.ts`

- [ ] **Step 1: Create the compiler**

```typescript
/**
 * ChartSpec v1 IR → VizQL-compatible spec compiler.
 *
 * Translates the AskDB ChartSpec intermediate representation into
 * the format consumed by the VizQL renderer pipeline.
 *
 * Key difference from toVegaLite.ts: VizQL specs are simpler —
 * no $schema, no named data source, encoding channels map 1:1.
 */

import type { ChartSpec, FieldRef, Encoding } from '../types';

/** VizQL encoding channel (matches VizQL renderer's EncodingChannel) */
interface VizQLField {
  field: string;
  type: 'nominal' | 'ordinal' | 'quantitative' | 'temporal';
  aggregate?: string;
  bin?: boolean | { maxbins: number };
  timeUnit?: string;
  sort?: unknown;
  scheme?: string;
}

/** VizQL-compatible spec object */
export interface VizQLSpec {
  mark: string | { type: string; [key: string]: unknown };
  encoding: Record<string, VizQLField | VizQLField[]>;
  layer?: VizQLSpec[];
  hconcat?: VizQLSpec[];
  vconcat?: VizQLSpec[];
  facet?: { field: string; type: string; columns?: number };
  spec?: VizQLSpec;
  repeat?: { row?: string[]; column?: string[] };
  lod?: unknown[];
  tableCalcs?: unknown[];
}

/**
 * Convert a FieldRef from ChartSpec IR to VizQL encoding channel.
 */
function compileField(f: FieldRef): VizQLField {
  const result: VizQLField = {
    field: f.field,
    type: f.type === 'geographic' ? 'nominal' : f.type as VizQLField['type'],
  };
  if (f.aggregate && f.aggregate !== 'none') result.aggregate = f.aggregate;
  if (f.bin) result.bin = f.bin === true ? true : { maxbins: 10 };
  if (f.timeUnit) result.timeUnit = f.timeUnit;
  if (f.sort) result.sort = f.sort;
  return result;
}

/**
 * Compile all encoding channels from ChartSpec Encoding.
 */
function compileEncoding(enc: Encoding): Record<string, VizQLField | VizQLField[]> {
  const result: Record<string, VizQLField | VizQLField[]> = {};
  const singleChannels = ['x', 'y', 'x2', 'y2', 'color', 'size', 'shape', 'opacity', 'text', 'row', 'column', 'order'] as const;

  for (const ch of singleChannels) {
    const f = enc[ch];
    if (f) result[ch] = compileField(f);
  }

  // Array channels
  if (enc.detail) {
    result.detail = Array.isArray(enc.detail) ? enc.detail.map(compileField) : [compileField(enc.detail)];
  }
  if (enc.tooltip) {
    result.tooltip = Array.isArray(enc.tooltip) ? enc.tooltip.map(compileField) : [compileField(enc.tooltip)];
  }

  return result;
}

/**
 * Compile a unit ChartSpec into a VizQL spec.
 */
function compileUnit(spec: ChartSpec): VizQLSpec {
  const mark = typeof spec.mark === 'string'
    ? spec.mark
    : spec.mark ?? 'point';

  return {
    mark,
    encoding: spec.encoding ? compileEncoding(spec.encoding) : {},
  };
}

/**
 * Main entry point: compile ChartSpec v1 IR → VizQL-compatible spec.
 *
 * @param spec - ChartSpec from the AskDB IR layer
 * @returns VizQL-compatible spec object ready for renderVizQL()
 * @throws Error if spec.type is not 'cartesian'
 */
export function compileToVizQL(spec: ChartSpec): VizQLSpec {
  if (spec.type && spec.type !== 'cartesian') {
    throw new Error(`compileToVizQL only handles cartesian specs, got '${spec.type}'`);
  }

  // Layer composition
  if (spec.layer && spec.layer.length > 0) {
    return {
      mark: 'point', // placeholder — layers define their own marks
      encoding: {},
      layer: spec.layer.map(layerSpec => compileUnit({ ...spec, ...layerSpec, layer: undefined } as ChartSpec)),
    };
  }

  // HConcat
  if (spec.hconcat && spec.hconcat.length > 0) {
    return {
      mark: 'point',
      encoding: {},
      hconcat: spec.hconcat.map(s => compileToVizQL(s as ChartSpec)),
    };
  }

  // VConcat
  if (spec.vconcat && spec.vconcat.length > 0) {
    return {
      mark: 'point',
      encoding: {},
      vconcat: spec.vconcat.map(s => compileToVizQL(s as ChartSpec)),
    };
  }

  // Facet
  if (spec.facet) {
    const facetField = spec.facet.row ?? spec.facet.column;
    if (facetField) {
      const innerSpec = spec.facet.spec
        ? compileUnit(spec.facet.spec as ChartSpec)
        : compileUnit(spec);
      return {
        mark: innerSpec.mark,
        encoding: innerSpec.encoding,
        facet: {
          field: facetField.field,
          type: facetField.type === 'geographic' ? 'nominal' : facetField.type,
          columns: (spec.facet as any).columns,
        },
        spec: innerSpec,
      };
    }
  }

  // Unit spec
  return compileUnit(spec);
}
```

- [ ] **Step 2: Commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/chart-ir/compiler/toVizQL.ts
git commit -m "feat: add ChartSpec → VizQL compiler"
```

---

### Task 3: Write VizQLRenderer React Component

**Files:**
- Create: `frontend/src/components/editor/renderers/VizQLRenderer.tsx`

- [ ] **Step 1: Create the renderer component**

```tsx
/**
 * VizQLRenderer — React component wrapping the proprietary VizQL engine.
 *
 * Replaces VegaRenderer for all cartesian chart rendering.
 * Uses Canvas 2D + WebGL instanced rendering (regl) for
 * anti-aliased marks at any scale.
 */

import { useRef, useEffect, useMemo, useCallback, useState } from 'react';
import { compileToVizQL } from '../../../chart-ir/compiler/toVizQL';
import { compileSpec } from '../../../vizql/compiler';
import { aggregate } from '../../../vizql/aggregator';
import { buildScales } from '../../../vizql/scales';
import { computeLayout } from '../../../vizql/layout';
import { drawMarks } from '../../../vizql/marks';
import { drawGridLines, drawAxes } from '../../../vizql/axes';
import { drawLegend } from '../../../vizql/legend';
import { CHART_BG } from '../../../vizql/palettes';
import { pickRenderStrategy } from '../../../vizql/webgl/rsr';
import { prepareInstanceBuffers, renderBuffersToCanvas } from '../../../vizql/webgl/buffers';
import { renderLayer, renderHConcat, renderVConcat, renderFacet } from '../../../vizql/composition';
import { initRegl, renderScatterWebGL, isWebGLAvailable } from '../../../vizql/webgl/regl-scatter';
import type { ChartSpec } from '../../../chart-ir/types';
import type { RenderStrategy } from '../../../chart-ir/rsr/strategy';
import type { LinearScale, BandScale, TimeScale, ChartLayout, ScaleSet, CompiledSpec, AggregatedData } from '../../../vizql/types';

// Lazy-init regl
let _reglInited = false;
let _webglAvailable = false;

function ensureReglInit() {
  if (_reglInited) return;
  _reglInited = true;
  try {
    const createREGL = (window as any).__regl_import__;
    if (createREGL) {
      initRegl(createREGL);
      _webglAvailable = isWebGLAvailable();
    }
  } catch {
    _webglAvailable = false;
  }
}

// ── Spatial hash for hit-testing ────────────────────────────

interface SpatialPoint { x: number; y: number; idx: number; }

class SpatialHash {
  private buckets = new Map<number, SpatialPoint[]>();
  private cellSize: number;
  private cols: number;

  constructor(points: SpatialPoint[], bounds: { x: number; y: number; w: number; h: number }) {
    this.cellSize = Math.max(10, Math.min(bounds.w, bounds.h) / 50);
    this.cols = Math.ceil(bounds.w / this.cellSize) + 1;
    for (const p of points) {
      const col = Math.floor((p.x - bounds.x) / this.cellSize);
      const row = Math.floor((p.y - bounds.y) / this.cellSize);
      const key = row * this.cols + col;
      let bucket = this.buckets.get(key);
      if (!bucket) { bucket = []; this.buckets.set(key, bucket); }
      bucket.push(p);
    }
  }

  nearest(mx: number, my: number, maxDist = 20): SpatialPoint | null {
    const col = Math.floor(mx / this.cellSize);
    const row = Math.floor(my / this.cellSize);
    let best: SpatialPoint | null = null;
    let bestDist = maxDist * maxDist;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const bucket = this.buckets.get((row + dr) * this.cols + (col + dc));
        if (!bucket) continue;
        for (const p of bucket) {
          const d2 = (p.x - mx) ** 2 + (p.y - my) ** 2;
          if (d2 < bestDist) { bestDist = d2; best = p; }
        }
      }
    }
    return best;
  }
}

// ── Props ──────────────────────────────────────────────────

export interface DrillthroughEvent {
  targetTileId?: string;
  filters: { field: string; value: unknown }[];
}

export interface VizQLRendererProps {
  spec: ChartSpec;
  resultSet?: { columns: string[]; rows: unknown[][] };
  strategy?: RenderStrategy;
  colorMap?: Record<string, string>;
  onDrillthrough?: (event: DrillthroughEvent) => void;
  onBrush?: (field: string, range: [number, number] | null) => void;
}

type Row = Record<string, unknown>;

// ── Component ──────────────────────────────────────────────

export default function VizQLRenderer({
  spec,
  resultSet,
  strategy,
  colorMap,
  onDrillthrough,
  onBrush,
}: VizQLRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const spatialIndexRef = useRef<SpatialHash | null>(null);
  const renderStateRef = useRef<{
    compiled: CompiledSpec;
    aggregated: AggregatedData;
    scales: ScaleSet;
    layout: ChartLayout;
  } | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 700, height: 500 });
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Convert resultSet to row objects
  const data: Row[] = useMemo(() => {
    if (!resultSet?.rows?.length || !resultSet?.columns?.length) return [];
    return resultSet.rows.map(row => {
      const obj: Row = {};
      resultSet.columns.forEach((col, i) => { obj[col] = row[i]; });
      return obj;
    });
  }, [resultSet]);

  // Compile ChartSpec → VizQL spec
  const vizqlSpec = useMemo(() => {
    try {
      return compileToVizQL(spec);
    } catch {
      return null;
    }
  }, [spec]);

  // Init regl on mount
  useEffect(() => { ensureReglInit(); }, []);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) {
        setCanvasSize({
          width: Math.round(width * window.devicePixelRatio),
          height: Math.round(height * window.devicePixelRatio),
        });
      }
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // Main render effect
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !vizqlSpec || data.length === 0) return;

    const w = canvasSize.width;
    const h = canvasSize.height;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;

    const start = performance.now();

    // Check for composition
    const isComposition = !!(vizqlSpec.layer || vizqlSpec.hconcat || vizqlSpec.vconcat ||
      (vizqlSpec.facet && vizqlSpec.spec));

    if (isComposition) {
      ctx.fillStyle = CHART_BG;
      ctx.fillRect(0, 0, w, h);

      if (vizqlSpec.layer) {
        renderLayer(ctx as any, vizqlSpec.layer as any[], data, 0, 0, w, h);
      } else if (vizqlSpec.hconcat) {
        renderHConcat(ctx as any, vizqlSpec.hconcat as any[], data, 0, 0, w, h);
      } else if (vizqlSpec.vconcat) {
        renderVConcat(ctx as any, vizqlSpec.vconcat as any[], data, 0, 0, w, h);
      } else if (vizqlSpec.facet && vizqlSpec.spec) {
        renderFacet(ctx as any, vizqlSpec.facet.field, vizqlSpec.spec as any, data, 0, 0, w, h, vizqlSpec.facet.columns);
      }

      spatialIndexRef.current = null;
      renderStateRef.current = null;
      return;
    }

    // Unit spec render
    const compiled = compileSpec(vizqlSpec as any, w, h);
    const aggregated = aggregate(data, compiled);
    const strat = pickRenderStrategy(compiled, aggregated.rows.length);

    const margin = { top: 30, right: compiled.encoding.color ? 140 : 20, bottom: 50, left: 60 };
    const plotW = w - margin.left - margin.right;
    const plotH = h - margin.top - margin.bottom;
    const scales = buildScales(aggregated, compiled, plotW, plotH);
    const layout = computeLayout(compiled, scales, aggregated, w, h);

    ctx.fillStyle = CHART_BG;
    ctx.fillRect(0, 0, w, h);
    drawGridLines(ctx, layout);

    if (strat.useBufferPipeline) {
      const buffers = prepareInstanceBuffers(aggregated.rows, compiled, scales, layout);
      const bounds = {
        left: layout.plot.x, right: layout.plot.x + layout.plot.width,
        top: layout.plot.y, bottom: layout.plot.y + layout.plot.height,
      };
      let usedWebGL = false;
      if (_webglAvailable && strat.tier === 'webgl-instanced') {
        usedWebGL = renderScatterWebGL(ctx, buffers, bounds, w, h);
      }
      if (!usedWebGL) {
        renderBuffersToCanvas(ctx, buffers, bounds);
      }
    } else {
      drawMarks(ctx, aggregated, compiled, scales, layout);
    }

    drawAxes(ctx, layout);
    drawLegend(ctx, layout);

    // Store render state for interactions
    renderStateRef.current = { compiled, aggregated, scales, layout };

    // Build spatial index for tooltips + click
    spatialIndexRef.current = null;
    if (['point', 'circle', 'square', 'tick'].includes(compiled.mark.type) && scales.x && scales.y) {
      const xF = compiled.encoding.x?.field;
      const yF = compiled.encoding.y?.field;
      if (xF && yF) {
        const pts: SpatialPoint[] = aggregated.rows.map((row, idx) => {
          let px: number;
          if (scales.x!.kind === 'linear') px = layout.plot.x + (scales.x as LinearScale).map(Number(row[xF]));
          else if (scales.x!.kind === 'time') px = layout.plot.x + (scales.x as TimeScale).map(row[xF] as string);
          else px = layout.plot.x + (scales.x as BandScale).map(String(row[xF]));
          const py = scales.y!.kind === 'linear'
            ? layout.plot.y + (scales.y as LinearScale).map(Number(row[yF]))
            : layout.plot.y;
          return { x: px, y: py, idx };
        });
        spatialIndexRef.current = new SpatialHash(pts, {
          x: layout.plot.x, y: layout.plot.y,
          w: layout.plot.width, h: layout.plot.height,
        });
      }
    }

    const elapsed = performance.now() - start;
    console.debug(`[VizQL] Rendered ${data.length} rows in ${elapsed.toFixed(1)}ms (${strat.tier})`);
  }, [vizqlSpec, data, canvasSize]);

  // Tooltip handler
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const tooltip = tooltipRef.current;
    if (!canvas || !tooltip || !spatialIndexRef.current) {
      if (tooltip) tooltip.style.display = 'none';
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    const mx = (e.clientX - rect.left) * sx;
    const my = (e.clientY - rect.top) * sy;

    const hit = spatialIndexRef.current.nearest(mx, my, 15);
    if (!hit || !renderStateRef.current) {
      tooltip.style.display = 'none';
      return;
    }

    const row = renderStateRef.current.aggregated.rows[hit.idx];
    tooltip.textContent = '';
    for (const [k, v] of Object.entries(row)) {
      if (k.startsWith('_')) continue;
      const line = document.createElement('div');
      const label = document.createElement('strong');
      label.textContent = `${k}: `;
      line.appendChild(label);
      line.appendChild(document.createTextNode(
        typeof v === 'number' ? v.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(v ?? '')
      ));
      tooltip.appendChild(line);
    }
    tooltip.style.display = 'block';
    tooltip.style.left = `${e.clientX + 12}px`;
    tooltip.style.top = `${e.clientY - 10}px`;
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (tooltipRef.current) tooltipRef.current.style.display = 'none';
  }, []);

  // Click handler for drillthrough
  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onDrillthrough || !spatialIndexRef.current || !renderStateRef.current) return;
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    const mx = (e.clientX - rect.left) * sx;
    const my = (e.clientY - rect.top) * sy;

    const hit = spatialIndexRef.current.nearest(mx, my, 15);
    if (!hit) return;

    const row = renderStateRef.current.aggregated.rows[hit.idx];
    const filters = Object.entries(row)
      .filter(([k]) => !k.startsWith('_'))
      .map(([field, value]) => ({ field, value }));
    onDrillthrough({ filters });
  }, [onDrillthrough]);

  if (!vizqlSpec) {
    return <div style={{ padding: 20, color: '#888' }}>Unable to compile chart spec</div>;
  }

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: '100%' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
      />
      <div
        ref={tooltipRef}
        style={{
          position: 'fixed', pointerEvents: 'none', display: 'none', zIndex: 100,
          background: 'rgba(0,0,0,0.85)', color: '#fff', padding: '6px 10px',
          borderRadius: 4, fontSize: 11, maxWidth: 200, lineHeight: 1.5,
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/components/editor/renderers/VizQLRenderer.tsx
git commit -m "feat: add VizQLRenderer React component"
```

---

### Task 4: Update RSR + Router to Route Cartesian → VizQL

**Files:**
- Modify: `frontend/src/chart-ir/router.ts`
- Modify: `frontend/src/chart-ir/rsr/renderStrategyRouter.ts`

- [ ] **Step 1: Add 'vizql' to RendererId and update routing**

In `frontend/src/chart-ir/router.ts`:

At line 31, change:
```typescript
export type RendererId = 'vega-lite' | 'maplibre' | 'deckgl' | 'three';
```
to:
```typescript
export type RendererId = 'vizql' | 'vega-lite' | 'maplibre' | 'deckgl' | 'three';
```

In function `mapTypeToRenderer` (lines 38-51), change the `cartesian` case:
```typescript
case 'cartesian': return 'vizql';
```

In function `familyToRendererId` (lines 60-77), change the `vega` case:
```typescript
case 'vega': return 'vizql';
```

Also add a new case:
```typescript
case 'vizql': return 'vizql';
```

- [ ] **Step 2: Update RSR to return 'vizql' family for t0/t1**

In `frontend/src/chart-ir/rsr/renderStrategyRouter.ts`, in the `pickRenderStrategy` function, find where t0 and t1 strategies are constructed (around lines 180-199) and change `rendererFamily: 'vega'` to `rendererFamily: 'vizql'` for both tiers.

Also update the `RendererFamily` type (if defined in `strategy.ts`) to include `'vizql'`.

- [ ] **Step 3: Commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/chart-ir/router.ts frontend/src/chart-ir/rsr/
git commit -m "feat: route cartesian specs to VizQL renderer"
```

---

### Task 5: Update EditorCanvas to Render VizQLRenderer

**Files:**
- Modify: `frontend/src/components/editor/EditorCanvas.jsx`

- [ ] **Step 1: Add VizQLRenderer import**

At the top of `EditorCanvas.jsx`, add:
```javascript
import VizQLRenderer from './renderers/VizQLRenderer';
```

- [ ] **Step 2: Add vizql case to renderer dispatch**

In the renderer dispatch block (around lines 147-162), add before or replace the `vega-lite` case:

```jsx
{rendererId === "vizql" && (
  <VizQLRenderer
    spec={spec}
    resultSet={resultSet}
    strategy={strategy}
    onDrillthrough={onDrillthrough}
  />
)}
```

Keep the `vega-lite` case for now (rollback safety) but it will never be reached since the router now returns `'vizql'` for cartesian.

- [ ] **Step 3: Commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/components/editor/EditorCanvas.jsx
git commit -m "feat: wire VizQLRenderer into EditorCanvas"
```

---

### Task 6: Update Dependencies

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/vite.config.js`

- [ ] **Step 1: Add regl, remove vega deps**

```bash
cd "QueryCopilot V1/frontend"
npm install regl@^2.1.1
npm uninstall react-vega vega vega-lite
```

- [ ] **Step 2: Setup regl global for VizQLRenderer**

The VizQLRenderer needs regl available. Add a setup file `frontend/src/vizql/setup-regl.ts`:

```typescript
/**
 * Initialize regl for browser use.
 * Import this once at app startup.
 */
import createREGL from 'regl';
import { initRegl } from './webgl/regl-scatter';

initRegl(createREGL);
```

Then in the app's entry point (likely `main.tsx` or `App.jsx`), add near the top:
```typescript
import './vizql/setup-regl';
```

- [ ] **Step 3: Update vite.config.js chunk splitting**

In `frontend/vite.config.js`, change line 16:

Replace:
```javascript
if (id.includes('node_modules/vega') || id.includes('node_modules/react-vega')) return 'vendor-vega';
```

With:
```javascript
if (id.includes('node_modules/regl')) return 'vendor-vizql';
```

- [ ] **Step 4: Commit**

```bash
cd "QueryCopilot V1"
git add frontend/package.json frontend/package-lock.json frontend/vite.config.js frontend/src/vizql/setup-regl.ts
git commit -m "feat: swap vega deps for regl, update Vite chunks"
```

---

### Task 7: Fix Imports and Type Compatibility

**Files:**
- Modify: Various files that import from vega/react-vega

- [ ] **Step 1: Find all remaining vega imports**

```bash
cd "QueryCopilot V1/frontend"
grep -rn "from.*['\"]react-vega['\"]" src/ --include="*.ts" --include="*.tsx" --include="*.jsx" --include="*.js"
grep -rn "from.*['\"]vega-lite['\"]" src/ --include="*.ts" --include="*.tsx" --include="*.jsx" --include="*.js"
grep -rn "from.*['\"]vega['\"]" src/ --include="*.ts" --include="*.tsx" --include="*.jsx" --include="*.js"
```

- [ ] **Step 2: Fix or remove each import**

For each file found:
- If it's `VegaRenderer.tsx` — leave it (dead code, kept for rollback)
- If it's a test file (`toVegaLite.test.ts`) — add `describe.skip` wrapper
- If it's a type import — remove or replace with VizQL types
- If it's `compileToVegaLite` usage — replace with `compileToVizQL`

- [ ] **Step 3: Verify build**

```bash
cd "QueryCopilot V1/frontend"
npm run build 2>&1 | tail -20
```

Expected: Build succeeds. Warnings about unused `VegaRenderer` are OK.

- [ ] **Step 4: Commit**

```bash
cd "QueryCopilot V1"
git add -A frontend/src/
git commit -m "fix: resolve all vega import references"
```

---

### Task 8: Smoke Test

**Files:** None (testing only)

- [ ] **Step 1: Start the frontend dev server**

```bash
cd "QueryCopilot V1/frontend"
npm run dev
```

Verify: Server starts on port 5173 without errors.

- [ ] **Step 2: Start backend**

```bash
cd "QueryCopilot V1/backend"
python -m uvicorn main:app --port 8002
```

- [ ] **Step 3: Open browser and test basic flow**

1. Navigate to `http://localhost:5173`
2. Connect to a database
3. Run a query that returns numeric data
4. Verify a chart renders in the canvas
5. Check browser console for `[VizQL] Rendered X rows in Yms` log

- [ ] **Step 4: Test chart type switching**

In the chart editor, switch between:
- Bar chart
- Line chart
- Scatter plot
- Area chart
- Pie chart

Each should render without errors.

- [ ] **Step 5: Test interactions**

- Hover over a data point → tooltip appears
- Click a data point → drillthrough fires (if configured)
- Verify no console errors during interaction

- [ ] **Step 6: Test composition**

If the agent suggests a faceted or layered chart, verify it renders as multi-pane.

- [ ] **Step 7: Run existing test suite**

```bash
cd "QueryCopilot V1/frontend"
npm test 2>&1 | tail -30
```

Fix any test failures related to the migration. Expected failures:
- `toVegaLite.test.ts` — skip these (legacy)
- Any test that imports `react-vega` or `VegaLite` component — mock or skip

- [ ] **Step 8: Commit final fixes**

```bash
cd "QueryCopilot V1"
git add -A
git commit -m "test: smoke test passes, fix migration issues"
```

---

### Task 9: Cleanup

**Files:**
- Modify: `frontend/src/components/editor/renderers/VegaRenderer.tsx` (add deprecation notice)

- [ ] **Step 1: Add deprecation header to VegaRenderer**

Add at top of `VegaRenderer.tsx`:
```typescript
/**
 * @deprecated Replaced by VizQLRenderer (2026-04-16).
 * Kept for rollback safety. Remove after 2 weeks of stable VizQL operation.
 */
```

- [ ] **Step 2: Final commit**

```bash
cd "QueryCopilot V1"
git add -A
git commit -m "chore: mark VegaRenderer as deprecated, migration complete"
```
