/**
 * Compositional grammar — layer, concat, facet, repeat.
 *
 * These operators compose multiple unit specs into complex displays.
 * Each produces a set of sub-renders positioned within the canvas.
 *
 * Implementation follows the Vega-Lite composition algebra:
 * - layer: shared axes, overlaid marks
 * - concat (h/v): independent axes, side-by-side
 * - facet: shared spec, partitioned data
 * - repeat: shared spec template, field substitution
 */

import { createPortableCanvas } from './canvas-factory';
import { compileSpec } from './compiler';
import { aggregate } from './aggregator';
import { buildScales } from './scales';
import { computeLayout } from './layout';
import { drawMarks } from './marks';
import { drawGridLines, drawAxes } from './axes';
import { drawLegend } from './legend';
import { CHART_BG, AXIS_COLOR, LABEL_COLOR, GRID_COLOR } from './palettes';
import { pickRenderStrategy } from './webgl/rsr';
import { prepareInstanceBuffers, renderBuffersToCanvas } from './webgl/buffers';
import type { CompiledSpec, AggregatedData, ScaleSet, ChartLayout } from './types';

type Row = Record<string, unknown>;
type Ctx = CanvasRenderingContext2D;

/**
 * Render a single unit spec into a region of an existing canvas context.
 * Used by all composition operators.
 */
function renderUnit(
  ctx: Ctx,
  spec: Record<string, unknown>,
  data: Row[],
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const compiled = compileSpec(spec, w, h);
  const aggregated = aggregate(data, compiled);
  const strategy = pickRenderStrategy(compiled, aggregated.rows.length);

  const margin = { top: 20, right: compiled.encoding.color ? 100 : 10, bottom: 35, left: 45 };
  const plotW = w - margin.left - margin.right;
  const plotH = h - margin.top - margin.bottom;
  const scales = buildScales(aggregated, compiled, plotW, plotH);
  const layout = computeLayout(compiled, scales, aggregated, w, h);

  // Offset layout to position within parent canvas
  layout.plot.x += x;
  layout.plot.y += y;
  layout.canvas.x += x;
  layout.canvas.y += y;
  if (layout.xAxis) {
    for (const t of layout.xAxis.ticks) t.pixel += 0; // already relative to plot
  }
  if (layout.yAxis) {
    for (const t of layout.yAxis.ticks) t.pixel += 0;
  }
  if (layout.legend) {
    layout.legend.rect.x += x;
    layout.legend.rect.y += y;
  }

  ctx.save();
  drawGridLines(ctx, layout);

  if (strategy.useBufferPipeline) {
    const buffers = prepareInstanceBuffers(aggregated.rows, compiled, scales, layout);
    renderBuffersToCanvas(ctx, buffers, {
      left: layout.plot.x,
      right: layout.plot.x + layout.plot.width,
      top: layout.plot.y,
      bottom: layout.plot.y + layout.plot.height,
    });
  } else {
    drawMarks(ctx, aggregated, compiled, scales, layout);
  }

  drawAxes(ctx, layout);
  drawLegend(ctx, layout);
  ctx.restore();
}

// ── Layer ────────────────────────────────────────────────────

/**
 * Layer composition — overlay multiple specs on shared axes.
 * All layers share the same data and coordinate space.
 */
export function renderLayer(
  ctx: Ctx,
  layers: Record<string, unknown>[],
  data: Row[],
  x: number, y: number, w: number, h: number,
): void {
  // First layer sets up axes, subsequent layers overlay marks
  for (const layerSpec of layers) {
    renderUnit(ctx, layerSpec, data, x, y, w, h);
  }
}

// ── Horizontal/Vertical Concat ──────────────────────────────

/**
 * Horizontal concatenation — specs side by side.
 */
export function renderHConcat(
  ctx: Ctx,
  specs: Record<string, unknown>[],
  data: Row[],
  x: number, y: number, w: number, h: number,
  gap = 10,
): void {
  const n = specs.length;
  const cellW = (w - gap * (n - 1)) / n;

  for (let i = 0; i < n; i++) {
    const cx = x + i * (cellW + gap);
    renderUnit(ctx, specs[i], data, cx, y, cellW, h);

    // Separator line
    if (i > 0) {
      ctx.strokeStyle = GRID_COLOR;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(cx - gap / 2, y);
      ctx.lineTo(cx - gap / 2, y + h);
      ctx.stroke();
    }
  }
}

/**
 * Vertical concatenation — specs stacked.
 */
export function renderVConcat(
  ctx: Ctx,
  specs: Record<string, unknown>[],
  data: Row[],
  x: number, y: number, w: number, h: number,
  gap = 10,
): void {
  const n = specs.length;
  const cellH = (h - gap * (n - 1)) / n;

  for (let i = 0; i < n; i++) {
    const cy = y + i * (cellH + gap);
    renderUnit(ctx, specs[i], data, x, cy, w, cellH);
  }
}

// ── Facet ───────────────────────────────────────────────────

/**
 * Facet composition — partition data by a field, render spec per partition.
 * Supports:
 * - Single field facet (wrap to columns)
 * - Row × Column cross-product facet (Polaris algebra: A × B)
 * - Data-driven (nest) or full-domain (cross) semantics
 */
export function renderFacet(
  ctx: Ctx,
  facetField: string,
  innerSpec: Record<string, unknown>,
  data: Row[],
  x: number, y: number, w: number, h: number,
  columns?: number,
  /** Optional second facet field for cross-product (row × column) */
  rowFacetField?: string,
  /** If true, show all domain combinations even if no data (Polaris cross ×) */
  crossProduct = false,
): void {
  // Two-field cross-product facet (Polaris A × B)
  if (rowFacetField) {
    return renderCrossProductFacet(ctx, facetField, rowFacetField, innerSpec, data, x, y, w, h, crossProduct);
  }

  // Single-field facet
  const partitions = new Map<string, Row[]>();
  const order: string[] = [];

  for (const row of data) {
    const key = String(row[facetField] ?? '');
    let p = partitions.get(key);
    if (!p) {
      p = [];
      partitions.set(key, p);
      order.push(key);
    }
    p.push(row);
  }

  const n = order.length;
  const cols = columns ?? Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const gap = 8;
  const cellW = (w - gap * (cols - 1)) / cols;
  const cellH = (h - gap * (rows - 1)) / rows;
  const headerH = 16;

  ctx.font = 'bold 10px Inter, system-ui, sans-serif';
  ctx.fillStyle = AXIS_COLOR;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  for (let i = 0; i < n; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = x + col * (cellW + gap);
    const cy = y + row * (cellH + gap);

    // Facet header
    ctx.fillStyle = AXIS_COLOR;
    ctx.fillText(order[i], cx + cellW / 2, cy);

    // Render inner spec with partitioned data
    const partData = partitions.get(order[i]) ?? [];
    renderUnit(ctx, innerSpec, partData, cx, cy + headerH, cellW, cellH - headerH);
  }
}

// ── Cross-Product Facet (Polaris A × B) ─────────────────────

/**
 * Two-field cross-product facet — Polaris table algebra cross operator.
 *
 * Creates a grid where columns = distinct values of colField,
 * rows = distinct values of rowField. Each cell gets the data
 * matching that (row, col) combination.
 *
 * With crossProduct=true, empty cells are shown (full domain grid).
 * With crossProduct=false, only cells with data are shown (nest semantics).
 */
function renderCrossProductFacet(
  ctx: Ctx,
  colField: string,
  rowField: string,
  innerSpec: Record<string, unknown>,
  data: Row[],
  x: number, y: number, w: number, h: number,
  crossProduct: boolean,
): void {
  // Extract unique values for each field
  const colValues = [...new Set(data.map(r => String(r[colField] ?? '')))];
  const rowValues = [...new Set(data.map(r => String(r[rowField] ?? '')))];

  // Index data by (row, col) key
  const cellData = new Map<string, Row[]>();
  for (const row of data) {
    const key = `${row[rowField]}|${row[colField]}`;
    let c = cellData.get(key);
    if (!c) { c = []; cellData.set(key, c); }
    c.push(row);
  }

  const nCols = colValues.length;
  const nRows = rowValues.length;
  const headerH = 18;
  const headerW = 50;
  const gap = 6;
  const cellW = (w - headerW - gap * (nCols - 1)) / nCols;
  const cellH = (h - headerH - gap * (nRows - 1)) / nRows;

  // Column headers
  ctx.font = 'bold 9px Inter, system-ui, sans-serif';
  ctx.fillStyle = AXIS_COLOR;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  for (let c = 0; c < nCols; c++) {
    const cx = x + headerW + c * (cellW + gap) + cellW / 2;
    ctx.fillText(colValues[c], cx, y + headerH - 2);
  }

  // Row headers
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let r = 0; r < nRows; r++) {
    const cy = y + headerH + r * (cellH + gap) + cellH / 2;
    ctx.fillText(rowValues[r], x + headerW - 4, cy);
  }

  // Render each cell
  for (let r = 0; r < nRows; r++) {
    for (let c = 0; c < nCols; c++) {
      const key = `${rowValues[r]}|${colValues[c]}`;
      const cellRows = cellData.get(key) ?? [];

      // Skip empty cells in nest mode
      if (!crossProduct && cellRows.length === 0) continue;

      const cx = x + headerW + c * (cellW + gap);
      const cy = y + headerH + r * (cellH + gap);

      if (cellRows.length > 0) {
        renderUnit(ctx, innerSpec, cellRows, cx, cy, cellW, cellH);
      } else {
        // Empty cell placeholder
        ctx.strokeStyle = GRID_COLOR;
        ctx.lineWidth = 0.5;
        ctx.strokeRect(cx, cy, cellW, cellH);
        ctx.fillStyle = LABEL_COLOR;
        ctx.font = '9px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('No data', cx + cellW / 2, cy + cellH / 2);
      }
    }
  }
}

// ── Repeat ──────────────────────────────────────────────────

/**
 * Repeat composition — replicate a spec template with field substitution.
 * Supports row-repeat, column-repeat, and layer-repeat.
 */
export function renderRepeat(
  ctx: Ctx,
  template: Record<string, unknown>,
  repeatConfig: { row?: string[]; column?: string[] },
  data: Row[],
  x: number, y: number, w: number, h: number,
): void {
  const rowFields = repeatConfig.row ?? ['__identity__'];
  const colFields = repeatConfig.column ?? ['__identity__'];
  const gap = 10;

  const nRows = rowFields.length;
  const nCols = colFields.length;
  const cellW = (w - gap * (nCols - 1)) / nCols;
  const cellH = (h - gap * (nRows - 1)) / nRows;

  for (let ri = 0; ri < nRows; ri++) {
    for (let ci = 0; ci < nCols; ci++) {
      const cx = x + ci * (cellW + gap);
      const cy = y + ri * (cellH + gap);

      // Substitute fields in template
      const spec = substituteFields(template, {
        row: rowFields[ri],
        column: colFields[ci],
      });

      renderUnit(ctx, spec, data, cx, cy, cellW, cellH);
    }
  }
}

/**
 * Deep-clone a spec and substitute repeat field references.
 */
function substituteFields(
  spec: Record<string, unknown>,
  subs: { row?: string; column?: string },
): Record<string, unknown> {
  const json = JSON.stringify(spec);
  let result = json;
  if (subs.row && subs.row !== '__identity__') {
    result = result.replace(/"field"\s*:\s*"\{repeat:row\}"/g, `"field":"${subs.row}"`);
  }
  if (subs.column && subs.column !== '__identity__') {
    result = result.replace(/"field"\s*:\s*"\{repeat:column\}"/g, `"field":"${subs.column}"`);
  }
  return JSON.parse(result);
}
