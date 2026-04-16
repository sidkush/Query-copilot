/**
 * WebGL-style instanced buffer preparation.
 *
 * Prepares columnar Float32Array buffers from row data — the same
 * format regl/WebGL instanced rendering needs. In Node.js benchmarks
 * these buffers feed the Canvas 2D fast path. In browser they'd feed
 * actual GPU instanced draw calls.
 *
 * Key insight from deck.gl research: the bottleneck isn't the GPU draw
 * call (which is <1ms for 1M instances). It's the CPU-side buffer
 * preparation. By preparing columnar typed arrays we:
 * 1. Avoid per-row object property access in the draw loop
 * 2. Enable sequential memory access (L1 cache friendly)
 * 3. Prepare data in the exact format WebGL needs (no conversion later)
 */

import type { CompiledSpec, ScaleSet, ChartLayout, LinearScale, BandScale, TimeScale } from '../types';

export interface InstanceBuffers {
  /** X pixel positions */
  x: Float32Array;
  /** Y pixel positions */
  y: Float32Array;
  /** Mark sizes (radius or width) */
  size: Float32Array;
  /** Color indices (into palette lookup) */
  colorIdx: Uint8Array;
  /** Number of active instances */
  count: number;
  /** Color palette (hex strings indexed by colorIdx) */
  palette: string[];
}

type Row = Record<string, unknown>;

/**
 * Prepare instanced buffers from aggregated data.
 * Single pass — O(n) with sequential typed array writes.
 */
export function prepareInstanceBuffers(
  rows: Row[],
  spec: CompiledSpec,
  scales: ScaleSet,
  layout: ChartLayout,
): InstanceBuffers {
  const n = rows.length;
  const x = new Float32Array(n);
  const y = new Float32Array(n);
  const size = new Float32Array(n);
  const colorIdx = new Uint8Array(n);

  // Pre-compute scale transform: factor + offset
  const xEnc = spec.encoding.x;
  const yEnc = spec.encoding.y;
  const colorEnc = spec.encoding.color;
  const sizeEnc = spec.encoding.size;

  // X transform
  let xFactor = 0, xOffset = layout.plot.x;
  const xField = xEnc?.field;
  let xIsBand = false;
  let xBand: BandScale | null = null;

  if (scales.x) {
    if (scales.x.kind === 'linear') {
      const ls = scales.x as LinearScale;
      // Extract factor/offset from the pre-computed scale
      // map(v) = v * factor + offset, where factor = rSpan/dSpan, offset = r0 - d0*factor
      const r0 = ls.range[0], r1 = ls.range[1];
      const d0 = ls.domain[0], d1 = ls.domain[1];
      const dSpan = d1 - d0 || 1;
      xFactor = (r1 - r0) / dSpan;
      xOffset = layout.plot.x + r0 - d0 * xFactor;
    } else if (scales.x.kind === 'time') {
      const ts = scales.x as TimeScale;
      const r0 = ts.range[0], r1 = ts.range[1];
      const d0 = ts.domain[0], d1 = ts.domain[1];
      const dSpan = d1 - d0 || 1;
      xFactor = (r1 - r0) / dSpan;
      xOffset = layout.plot.x + r0 - d0 * xFactor;
    } else if (scales.x.kind === 'band') {
      xIsBand = true;
      xBand = scales.x as BandScale;
    }
  }

  // Y transform
  let yFactor = 0, yOffset = layout.plot.y;
  const yField = yEnc?.field;

  if (scales.y?.kind === 'linear') {
    const ls = scales.y as LinearScale;
    const r0 = ls.range[0], r1 = ls.range[1];
    const d0 = ls.domain[0], d1 = ls.domain[1];
    const dSpan = d1 - d0 || 1;
    yFactor = (r1 - r0) / dSpan;
    yOffset = layout.plot.y + r0 - d0 * yFactor;
  }

  // Color dictionary encoding
  const colorField = colorEnc?.field;
  const colorMap = new Map<string, number>();
  const palette: string[] = [];
  const TABLEAU_10 = [
    '#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f',
    '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac',
  ];

  // Size transform
  let sizeFactor = 0, sizeOffset = 3;
  const sizeField = sizeEnc?.field;
  if (scales.size?.kind === 'linear') {
    const ls = scales.size as LinearScale;
    const r0 = ls.range[0], r1 = ls.range[1];
    const d0 = ls.domain[0], d1 = ls.domain[1];
    const dSpan = d1 - d0 || 1;
    sizeFactor = (r1 - r0) / dSpan;
    sizeOffset = r0 - d0 * sizeFactor;
  }

  // Single pass — fill all buffers
  for (let i = 0; i < n; i++) {
    const row = rows[i];

    // X position
    if (xIsBand && xBand && xField) {
      x[i] = layout.plot.x + xBand.map(String(row[xField])) + xBand.bandwidth / 2;
    } else if (xField) {
      const xType = xEnc?.type;
      if (xType === 'temporal') {
        const ms = new Date(row[xField] as string).getTime();
        x[i] = ms * xFactor + xOffset;
      } else {
        x[i] = Number(row[xField]) * xFactor + xOffset;
      }
    } else {
      x[i] = xOffset;
    }

    // Y position
    if (yField) {
      y[i] = Number(row[yField]) * yFactor + yOffset;
    } else {
      y[i] = yOffset;
    }

    // Color index
    if (colorField) {
      const cv = String(row[colorField] ?? '');
      let ci = colorMap.get(cv);
      if (ci === undefined) {
        ci = palette.length;
        colorMap.set(cv, ci);
        palette.push(TABLEAU_10[ci % TABLEAU_10.length]);
      }
      colorIdx[i] = ci;
    } else {
      colorIdx[i] = 0;
      if (palette.length === 0) palette.push(TABLEAU_10[0]);
    }

    // Size
    if (sizeField) {
      size[i] = Number(row[sizeField]) * sizeFactor + sizeOffset;
    } else {
      size[i] = 3;
    }
  }

  return { x, y, size, colorIdx, count: n, palette };
}

// ── Sprite cache for anti-aliased circles in buffer pipeline ──
import { createPortableCanvas } from '../canvas-factory';

const _bufferSpriteCache = new Map<string, { img: ReturnType<typeof createPortableCanvas>; s: number }>();

function getBufferSprite(color: string, radius: number): { img: ReturnType<typeof createPortableCanvas>; s: number } {
  const r = Math.max(1, Math.round(radius));
  const key = `${color}|${r}`;
  let e = _bufferSpriteCache.get(key);
  if (e) return e;

  const pad = 2;
  const s = r * 2 + pad * 2;
  const c = createPortableCanvas(s, s);
  const cx = c.getContext('2d');
  cx.fillStyle = color;
  cx.beginPath();
  cx.arc(r + pad, r + pad, r, 0, Math.PI * 2);
  cx.fill();

  e = { img: c, s };
  _bufferSpriteCache.set(key, e);
  if (_bufferSpriteCache.size > 300) {
    const oldest = _bufferSpriteCache.keys().next().value;
    if (oldest) _bufferSpriteCache.delete(oldest);
  }
  return e;
}

/**
 * Render instance buffers to Canvas 2D.
 *
 * Three quality tiers:
 * - >50k marks: 1-2px fillRect (fastest, WebGL preferred in browser)
 * - 500-50k marks: sprite drawImage (anti-aliased circles, fast)
 * - <500 marks: arc() path batching (highest quality, variable sizes)
 *
 * Sprite drawImage is only ~10% slower than fillRect but produces
 * anti-aliased circles instead of pixelated squares — closing the
 * visual quality gap vs Tableau at mid-scale.
 */
export function renderBuffersToCanvas(
  ctx: CanvasRenderingContext2D,
  buffers: InstanceBuffers,
  plotBounds: { left: number; right: number; top: number; bottom: number },
): void {
  const { x, y, size, colorIdx, count, palette } = buffers;
  const { left, right, top, bottom } = plotBounds;

  // Group by color index for batch rendering
  const groups = new Map<number, number[]>();
  for (let i = 0; i < count; i++) {
    const px = x[i], py = y[i];
    if (px < left || px > right || py < top || py > bottom) continue;
    const ci = colorIdx[i];
    let g = groups.get(ci);
    if (!g) { g = []; groups.set(ci, g); }
    g.push(i);
  }

  if (count > 50_000) {
    // Ultra-fast path — tiny fillRect (WebGL preferred at this tier)
    const markSize = count > 100_000 ? 1 : 2;
    for (const [ci, indices] of groups) {
      ctx.fillStyle = palette[ci];
      for (let j = 0; j < indices.length; j++) {
        const i = indices[j];
        ctx.fillRect(x[i] | 0, y[i] | 0, markSize, markSize);
      }
    }
  } else if (count > 500) {
    // Sprite path — anti-aliased circles via drawImage (500-50k)
    const r = count > 10_000 ? 2 : count > 5_000 ? 3 : 4;
    for (const [ci, indices] of groups) {
      const sprite = getBufferSprite(palette[ci], r);
      const offset = sprite.s / 2;
      for (let j = 0; j < indices.length; j++) {
        const i = indices[j];
        ctx.drawImage(sprite.img as any, (x[i] | 0) - offset, (y[i] | 0) - offset);
      }
    }
  } else {
    // Quality path — full arc() circles with variable sizes
    for (const [ci, indices] of groups) {
      ctx.fillStyle = palette[ci];
      ctx.beginPath();
      for (let j = 0; j < indices.length; j++) {
        const i = indices[j];
        const r = size[i];
        ctx.moveTo(x[i] + r, y[i]);
        ctx.arc(x[i], y[i], r, 0, Math.PI * 2);
      }
      ctx.fill();
    }
  }
}
