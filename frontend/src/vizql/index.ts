/**
 * VizQL Renderer — Canvas 2D + WebGL buffer pipeline.
 *
 * Full pipeline: Spec → Compile → Aggregate → RSR → Scales → Layout → Draw
 *
 * v0.5: Added Render Strategy Router (RSR) dispatching between:
 * - canvas-quality: row-based mark rendering (arc circles, full paths)
 * - canvas-fast: typed array buffer pipeline (fillRect, batch paths)
 * - webgl-instanced: typed array buffers (same as canvas-fast in Node.js,
 *   real WebGL instanced draws in browser)
 */

import { createPortableCanvas, type PortableCanvas } from './canvas-factory';
import { compileSpec } from './compiler';
import { aggregate } from './aggregator';
import { buildScales } from './scales';
import { computeLayout } from './layout';
import { drawMarks } from './marks';
import { drawGridLines, drawAxes } from './axes';
import { drawLegend } from './legend';
import { CHART_BG } from './palettes';
import { pickRenderStrategy } from './webgl/rsr';
import { prepareInstanceBuffers, renderBuffersToCanvas } from './webgl/buffers';
import { renderLayer, renderHConcat, renderVConcat, renderFacet, renderRepeat } from './composition';
import { applyLODExpressions, type LODExprDef } from './lod';
import { applyTableCalcs, type TableCalcDef } from './tablecalc';

// ── Canvas Pool ─────────────────────────────────────────────
const canvasPool: PortableCanvas[] = [];
const POOL_MAX = 6;

function acquireCanvas(w: number, h: number): PortableCanvas {
  const c = canvasPool.pop();
  if (c) { c.width = w; c.height = h; return c; }
  return createPortableCanvas(w, h);
}

function releaseCanvas(c: PortableCanvas): void {
  if (canvasPool.length < POOL_MAX) canvasPool.push(c);
}

// ── Public API ──────────────────────────────────────────────

export interface VizQLRenderResult {
  png: null;
  renderTimeMs: number;
  renderOnlyMs: number;
  isStub: boolean;
  error?: string;
  /** Which render tier was used */
  tier?: string;
}

export function renderVizQL(
  spec: Record<string, unknown>,
  data: Record<string, unknown>[],
  width = 800,
  height = 600,
  skipPng = false,
): VizQLRenderResult {
  const start = performance.now();

  try {
    // Phase 0: Check for top-level composition operators
    const canvas = acquireCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = CHART_BG;
    ctx.fillRect(0, 0, width, height);

    const isComposition = !!(spec.layer || spec.hconcat || spec.vconcat ||
      (spec.facet && spec.spec) || spec.repeat);

    if (isComposition) {
      if (Array.isArray(spec.layer)) {
        renderLayer(ctx, spec.layer as Record<string, unknown>[], data, 0, 0, width, height);
      } else if (Array.isArray(spec.hconcat)) {
        renderHConcat(ctx, spec.hconcat as Record<string, unknown>[], data, 0, 0, width, height);
      } else if (Array.isArray(spec.vconcat)) {
        renderVConcat(ctx, spec.vconcat as Record<string, unknown>[], data, 0, 0, width, height);
      } else if (spec.facet && spec.spec) {
        const facetObj = spec.facet as Record<string, unknown>;
        renderFacet(
          ctx,
          facetObj.field as string,
          spec.spec as Record<string, unknown>,
          data, 0, 0, width, height,
          facetObj.columns as number | undefined,
        );
      } else if (spec.repeat) {
        const repeatObj = spec.repeat as { row?: string[]; column?: string[] };
        renderRepeat(ctx, spec.spec as Record<string, unknown> ?? spec, repeatObj, data, 0, 0, width, height);
      }

      const renderOnlyMs = performance.now() - start;
      const renderTimeMs = performance.now() - start;
      releaseCanvas(canvas);
      return { png: null, renderTimeMs, renderOnlyMs, isStub: false, tier: 'composition' };
    }

    // ── Unit spec path ──────────────────────────────────────
    // Phase 1: Compile
    const compiled = compileSpec(spec, width, height);

    // Phase 2: Aggregate
    const aggregated = aggregate(data, compiled);

    // Phase 2.1: LOD expressions (if spec contains them)
    if (spec.lod && Array.isArray(spec.lod)) {
      const viewDims = Object.values(compiled.encoding)
        .filter((ch): ch is NonNullable<typeof ch> => !!ch && (ch.type === 'nominal' || ch.type === 'ordinal'))
        .map(ch => ch.field);
      aggregated.rows = applyLODExpressions(
        aggregated.rows,
        spec.lod as LODExprDef[],
        viewDims,
      );

      // Recompute domains for LOD-computed fields
      for (const lod of spec.lod as LODExprDef[]) {
        const field = lod.as;
        let min = Infinity, max = -Infinity;
        for (const row of aggregated.rows) {
          const v = Number(row[field]);
          if (!isNaN(v)) {
            if (v < min) min = v;
            if (v > max) max = v;
          }
        }
        if (min !== Infinity) {
          aggregated.domains.set(field, { min, max, type: 'quantitative' });
        }
      }
    }

    // Phase 2.2: Table calculations (if spec contains them)
    if (spec.tableCalcs && Array.isArray(spec.tableCalcs)) {
      aggregated.rows = applyTableCalcs(aggregated.rows, spec.tableCalcs as TableCalcDef[]);

      // Recompute domains for computed fields — table calcs create new fields
      // that the original domain pass didn't see
      for (const tc of spec.tableCalcs as TableCalcDef[]) {
        const field = tc.as;
        let min = Infinity, max = -Infinity;
        for (const row of aggregated.rows) {
          const v = Number(row[field]);
          if (!isNaN(v)) {
            if (v < min) min = v;
            if (v > max) max = v;
          }
        }
        if (min !== Infinity) {
          aggregated.domains.set(field, { min, max, type: 'quantitative' });
        }
      }
    }

    // Phase 2.5: RSR — pick render strategy based on mark type + row count
    const strategy = pickRenderStrategy(compiled, aggregated.rows.length);

    // Phase 3: Scales
    const margin = { top: 30, right: compiled.encoding.color ? 140 : 20, bottom: 50, left: 60 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;
    const scales = buildScales(aggregated, compiled, plotW, plotH);

    // Phase 4: Layout
    const layout = computeLayout(compiled, scales, aggregated, width, height);

    // Phase 5: Render (canvas already acquired above)
    drawGridLines(ctx, layout);

    if (strategy.useBufferPipeline) {
      // WebGL/buffer path — typed array pipeline
      const buffers = prepareInstanceBuffers(aggregated.rows, compiled, scales, layout);
      renderBuffersToCanvas(ctx, buffers, {
        left: layout.plot.x,
        right: layout.plot.x + layout.plot.width,
        top: layout.plot.y,
        bottom: layout.plot.y + layout.plot.height,
      });
    } else {
      // Canvas path — row-based mark rendering
      drawMarks(ctx, aggregated, compiled, scales, layout);
    }

    drawAxes(ctx, layout);
    drawLegend(ctx, layout);

    const renderOnlyMs = performance.now() - start;
    const renderTimeMs = performance.now() - start;
    releaseCanvas(canvas);

    return { png: null, renderTimeMs, renderOnlyMs, isStub: false, tier: strategy.tier };
  } catch (err) {
    const elapsed = performance.now() - start;
    return { png: null, renderTimeMs: elapsed, renderOnlyMs: elapsed, isStub: false, error: (err as Error).message };
  }
}

export function isEngineReady(): boolean {
  return true;
}
