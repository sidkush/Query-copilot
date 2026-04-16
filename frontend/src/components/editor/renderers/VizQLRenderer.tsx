/**
 * VizQLRenderer — React wrapper for the VizQL Canvas 2D / WebGL engine.
 *
 * Replaces VegaRenderer for cartesian specs routed to the VizQL pipeline.
 * Handles:
 *   1. ChartSpec → VizQLSpec compilation (compileToVizQL)
 *   2. resultSet → row-object data conversion
 *   3. Canvas sizing with devicePixelRatio via ResizeObserver
 *   4. Render pipeline (unit path + composition path)
 *   5. WebGL scatter via regl for >10k point marks, with Canvas 2D fallback
 *   6. Tooltip hit-testing via SpatialHash
 *   7. Drillthrough click handler
 */

import { useEffect, useMemo, useRef, useCallback, useState } from 'react';
import { compileToVizQL } from '../../../chart-ir/compiler/toVizQL';
import type { VizQLSpec } from '../../../chart-ir/compiler/toVizQL';
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

// ---------------------------------------------------------------------------
// Regl initialisation — one-time, module-level
// ---------------------------------------------------------------------------

let _reglInitialized = false;

function ensureReglInit(): void {
  if (_reglInitialized) return;
  _reglInitialized = true;
  // Dynamic import avoids hard crash on SSR / Node environments where
  // the regl package may not be installed. We fire-and-forget; isWebGLAvailable()
  // gates the actual draw path.
  // Dynamic import — regl may not be installed in all environments.
  // We use a string-keyed path to avoid TS module resolution errors.
  const reglPath = 'regl';
  import(/* @vite-ignore */ reglPath).then((mod: unknown) => {
    const createREGL = (mod as { default?: unknown }).default ?? mod;
    if (typeof createREGL === 'function') {
      initRegl(createREGL);
    }
  }).catch(() => {
    // regl not installed — WebGL path silently disabled; Canvas 2D fallback active
  });
}

// ---------------------------------------------------------------------------
// SpatialHash — O(1) nearest-neighbour lookup for tooltip hit-testing
// ---------------------------------------------------------------------------

interface SpatialPoint {
  x: number;
  y: number;
  row: Record<string, unknown>;
}

class SpatialHash {
  private readonly cellSize: number;
  private readonly cells: Map<string, SpatialPoint[]>;
  private readonly points: SpatialPoint[];

  constructor(points: SpatialPoint[], bounds: { x: number; y: number; width: number; height: number }, targetCells = 50) {
    this.points = points;
    const longer = Math.max(bounds.width, bounds.height, 1);
    this.cellSize = Math.max(longer / targetCells, 4);
    this.cells = new Map();
    for (const pt of points) {
      const key = this.cellKey(pt.x, pt.y);
      let cell = this.cells.get(key);
      if (!cell) { cell = []; this.cells.set(key, cell); }
      cell.push(pt);
    }
  }

  private cellKey(x: number, y: number): string {
    return `${Math.floor(x / this.cellSize)},${Math.floor(y / this.cellSize)}`;
  }

  nearest(mx: number, my: number, maxDist: number): SpatialPoint | null {
    const cs = this.cellSize;
    const gcx = Math.floor(mx / cs);
    const gcy = Math.floor(my / cs);
    let best: SpatialPoint | null = null;
    let bestD2 = maxDist * maxDist;

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const key = `${gcx + dx},${gcy + dy}`;
        const cell = this.cells.get(key);
        if (!cell) continue;
        for (const pt of cell) {
          const d2 = (pt.x - mx) ** 2 + (pt.y - my) ** 2;
          if (d2 < bestD2) { bestD2 = d2; best = pt; }
        }
      }
    }
    return best;
  }

  isEmpty(): boolean {
    return this.points.length === 0;
  }
}

const EMPTY_SPATIAL_HASH = new SpatialHash([], { x: 0, y: 0, width: 0, height: 0 });

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface VizQLRendererProps {
  spec: ChartSpec;
  resultSet?: {
    columns: string[];
    rows: unknown[][];
  };
  strategy?: Record<string, unknown>;
  colorMap?: Record<string, string>;
  onDrillthrough?: (event: { filters: { field: string; value: unknown }[] }) => void;
  onBrush?: (field: string, range: [number, number] | null) => void;
}

type Row = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resultSetToRows(
  columns: string[] | undefined,
  rows: unknown[] | undefined,
): Row[] {
  if (!columns?.length || !rows?.length) return [];
  return rows.map((row) => {
    // Handle both formats:
    // - Array rows: [val1, val2, ...] — map by column index
    // - Object rows: {col1: val1, col2: val2} — already keyed, passthrough
    if (row && typeof row === 'object' && !Array.isArray(row)) {
      return row as Row;
    }
    const obj: Row = {};
    const arr = row as unknown[];
    columns.forEach((col, i) => { obj[col] = arr[i]; });
    return obj;
  });
}

/** Mark types that support spatial hit-testing */
const HITTABLE_MARKS = new Set(['point', 'circle', 'square', 'tick']);

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function VizQLRenderer({
  spec,
  resultSet,
  strategy,
  colorMap: _colorMap,
  onDrillthrough,
  onBrush: _onBrush,
}: VizQLRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const spatialHashRef = useRef<SpatialHash>(EMPTY_SPATIAL_HASH);

  const [canvasSize, setCanvasSize] = useState({ width: 520, height: 320 });

  // -- One-time regl init -------------------------------------------------
  useEffect(() => { ensureReglInit(); }, []);

  // -- Data conversion ----------------------------------------------------
  const data = useMemo<Row[]>(
    () => resultSetToRows(resultSet?.columns, resultSet?.rows),
    [resultSet],
  );

  // -- Spec compilation ---------------------------------------------------
  const vizqlSpec = useMemo<VizQLSpec | null>(() => {
    if (spec.type !== 'cartesian') return null;
    try {
      return compileToVizQL(spec);
    } catch (err) {
      console.warn('[VizQLRenderer] compileToVizQL error:', err);
      return null;
    }
  }, [spec]);

  // -- ResizeObserver (debounced to avoid thrashing during drag-resize) ----
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let rafId: number | null = null;
    const obs = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width <= 0 || height <= 0) return;
      const w = Math.floor(width);
      const h = Math.floor(height);
      // Debounce via rAF — coalesce rapid resize events into one state update
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        setCanvasSize((prev) =>
          prev.width === w && prev.height === h ? prev : { width: w, height: h }
        );
        rafId = null;
      });
    });
    obs.observe(container);
    return () => {
      obs.disconnect();
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  // -- Render effect -------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !vizqlSpec) return;

    const dpr = window.devicePixelRatio || 1;
    const w = Math.floor(canvasSize.width * dpr);
    const h = Math.floor(canvasSize.height * dpr);
    if (w <= 0 || h <= 0) return;

    // Sync canvas physical + CSS dimensions atomically before drawing
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = `${canvasSize.width}px`;
    canvas.style.height = `${canvasSize.height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const t0 = performance.now();

    // Scale context for HiDPI
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Logical dimensions (CSS pixels)
    const lw = canvasSize.width;
    const lh = canvasSize.height;

    // Clear
    ctx.clearRect(0, 0, lw, lh);
    ctx.fillStyle = CHART_BG;
    ctx.fillRect(0, 0, lw, lh);

    const rawSpec = vizqlSpec as Record<string, unknown>;

    // -- Composition path --------------------------------------------------
    if (rawSpec.layer && Array.isArray(rawSpec.layer)) {
      renderLayer(ctx, rawSpec.layer as Record<string, unknown>[], data, 0, 0, lw, lh);
      console.debug(`[VizQLRenderer] layer render ${(performance.now() - t0).toFixed(1)}ms`);
      return;
    }

    if (rawSpec.hconcat && Array.isArray(rawSpec.hconcat)) {
      renderHConcat(ctx, rawSpec.hconcat as Record<string, unknown>[], data, 0, 0, lw, lh);
      console.debug(`[VizQLRenderer] hconcat render ${(performance.now() - t0).toFixed(1)}ms`);
      return;
    }

    if (rawSpec.vconcat && Array.isArray(rawSpec.vconcat)) {
      renderVConcat(ctx, rawSpec.vconcat as Record<string, unknown>[], data, 0, 0, lw, lh);
      console.debug(`[VizQLRenderer] vconcat render ${(performance.now() - t0).toFixed(1)}ms`);
      return;
    }

    if (rawSpec.facet && rawSpec.spec) {
      const facetObj = rawSpec.facet as { field: string; type: string; columns?: number };
      renderFacet(
        ctx,
        facetObj.field,
        rawSpec.spec as Record<string, unknown>,
        data,
        0, 0, lw, lh,
        facetObj.columns,
      );
      console.debug(`[VizQLRenderer] facet render ${(performance.now() - t0).toFixed(1)}ms`);
      return;
    }

    // -- Unit spec path ----------------------------------------------------
    const compiled = compileSpec(rawSpec, lw, lh);
    const aggregated = aggregate(data, compiled);
    const rsrStrategy = pickRenderStrategy(compiled, aggregated.rows.length);

    const margin = {
      top: 30,
      right: compiled.encoding.color ? 130 : 20,
      bottom: 50,
      left: 60,
    };
    const plotW = lw - margin.left - margin.right;
    const plotH = lh - margin.top - margin.bottom;
    const scales = buildScales(aggregated, compiled, plotW, plotH);
    const layout = computeLayout(compiled, scales, aggregated, lw, lh);

    drawGridLines(ctx, layout);

    if (rsrStrategy.useBufferPipeline) {
      const buffers = prepareInstanceBuffers(aggregated.rows, compiled, scales, layout);
      const plotBounds = {
        left: layout.plot.x,
        right: layout.plot.x + layout.plot.width,
        top: layout.plot.y,
        bottom: layout.plot.y + layout.plot.height,
      };

      // Try WebGL first for large scatter; fall back to Canvas 2D sprites
      const usedWebGL = isWebGLAvailable()
        ? renderScatterWebGL(ctx, buffers, plotBounds, lw, lh)
        : false;

      if (!usedWebGL) {
        renderBuffersToCanvas(ctx, buffers, plotBounds);
      }

      // Build spatial hash for hit-testing (scatter/point/circle marks)
      if (HITTABLE_MARKS.has(compiled.mark.type)) {
        const pts: SpatialPoint[] = [];
        for (let i = 0; i < buffers.count; i++) {
          pts.push({ x: buffers.x[i] ?? 0, y: buffers.y[i] ?? 0, row: aggregated.rows[i] ?? {} });
        }
        spatialHashRef.current = new SpatialHash(pts, {
          x: plotBounds.left,
          y: plotBounds.top,
          width: layout.plot.width,
          height: layout.plot.height,
        });
      } else {
        spatialHashRef.current = EMPTY_SPATIAL_HASH;
      }
    } else {
      drawMarks(ctx, aggregated, compiled, scales, layout);
      spatialHashRef.current = EMPTY_SPATIAL_HASH;
    }

    drawAxes(ctx, layout);
    drawLegend(ctx, layout);

    const elapsed = performance.now() - t0;
    console.debug(
      `[VizQLRenderer] unit render ${elapsed.toFixed(1)}ms ` +
      `(${aggregated.rows.length} rows, tier=${rsrStrategy.tier}, ` +
      `strategy=${strategy?.tier ?? 'n/a'})`,
    );
  }, [vizqlSpec, data, canvasSize, strategy]);

  // -- Tooltip (mousemove) -----------------------------------------------
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const tooltip = tooltipRef.current;
    if (!tooltip) return;

    const rect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const hit = spatialHashRef.current.nearest(mx, my, 20);
    if (!hit) {
      tooltip.style.display = 'none';
      return;
    }

    // Build tooltip content safely (no innerHTML)
    tooltip.style.display = 'block';
    tooltip.style.left = `${e.clientX + 12}px`;
    tooltip.style.top = `${e.clientY - 8}px`;

    // Clear existing children
    while (tooltip.firstChild) tooltip.removeChild(tooltip.firstChild);

    for (const [key, val] of Object.entries(hit.row)) {
      const line = document.createElement('div');
      line.style.cssText = 'font-size:11px;line-height:1.5;color:inherit;';
      const keySpan = document.createElement('span');
      keySpan.style.cssText = 'opacity:0.6;margin-right:4px;';
      keySpan.textContent = `${key}:`;
      const valSpan = document.createElement('span');
      valSpan.style.fontWeight = '600';
      valSpan.textContent = String(val ?? '');
      line.appendChild(keySpan);
      line.appendChild(valSpan);
      tooltip.appendChild(line);
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    const tooltip = tooltipRef.current;
    if (tooltip) tooltip.style.display = 'none';
  }, []);

  // -- Drillthrough (click) -----------------------------------------------
  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onDrillthrough) return;
    const rect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const hit = spatialHashRef.current.nearest(mx, my, 20);
    if (!hit) return;

    const filters = Object.entries(hit.row).map(([field, value]) => ({ field, value }));
    onDrillthrough({ filters });
  }, [onDrillthrough]);

  // -- Error state --------------------------------------------------------
  if (spec.type !== 'cartesian') {
    return (
      <div
        data-testid="vizql-renderer-error"
        style={{
          padding: 12,
          borderRadius: 6,
          background: 'rgba(229,62,62,0.08)',
          border: '1px solid rgba(229,62,62,0.25)',
          color: '#f87171',
          fontSize: 12,
          fontFamily: 'monospace',
        }}
      >
        VizQLRenderer only handles cartesian specs (got: {spec.type})
      </div>
    );
  }

  if (!vizqlSpec) {
    return (
      <div
        data-testid="vizql-renderer-error"
        style={{
          padding: 12,
          borderRadius: 6,
          background: 'rgba(229,62,62,0.08)',
          border: '1px solid rgba(229,62,62,0.25)',
          color: '#f87171',
          fontSize: 12,
          fontFamily: 'monospace',
        }}
      >
        VizQL compile error — check console
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      data-testid="vizql-renderer"
      style={{ position: 'relative', width: '100%', height: '100%', minHeight: 280 }}
    >
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: '100%' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
      />
      {/* Tooltip — rendered outside the canvas, positioned fixed */}
      <div
        ref={tooltipRef}
        style={{
          display: 'none',
          position: 'fixed',
          zIndex: 9999,
          background: 'rgba(20,20,30,0.92)',
          color: '#f0f0f5',
          padding: '7px 10px',
          borderRadius: 6,
          pointerEvents: 'none',
          boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
          backdropFilter: 'blur(6px)',
          border: '1px solid rgba(255,255,255,0.08)',
          maxWidth: 260,
          wordBreak: 'break-word',
        }}
      />
    </div>
  );
}
