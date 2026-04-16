/**
 * Render Strategy Router (RSR) — decides Canvas 2D vs WebGL instanced path.
 *
 * Pure function. No DOM, no globals. Decision based on:
 * - Mark count (after aggregation)
 * - Mark type (only point/circle/rect are WebGL-eligible)
 * - Chart type (line/area always Canvas — path rendering)
 *
 * In Node.js: WebGL path uses typed array buffers + Canvas 2D fallback renderer.
 * In browser: WebGL path would use actual regl instanced draws.
 */

import type { CompiledSpec, MarkType } from '../types';

export type RenderTier = 'canvas-quality' | 'canvas-fast' | 'webgl-instanced';

export interface RenderStrategy {
  tier: RenderTier;
  /** Use typed array buffer pipeline instead of row-based rendering */
  useBufferPipeline: boolean;
  /** Apply M4 downsampling before rendering */
  downsample: boolean;
  /** Point size for fillRect fast path */
  pointSize: number;
  /** Reason string for debugging */
  reason: string;
}

/** Mark types that can be rendered via instanced WebGL (or typed array buffers) */
const BUFFER_ELIGIBLE_MARKS = new Set<MarkType>([
  'point', 'circle', 'square', 'rect', 'tick',
]);

/** Mark types that require path rendering (Canvas only) */
const PATH_MARKS = new Set<MarkType>([
  'line', 'area', 'trail', 'rule',
]);

export function pickRenderStrategy(
  spec: CompiledSpec,
  rowCount: number,
): RenderStrategy {
  const markType = spec.mark.type;

  // Layers always use Canvas (mixed mark types)
  if (spec.layers && spec.layers.length > 0) {
    return {
      tier: rowCount > 10_000 ? 'canvas-fast' : 'canvas-quality',
      useBufferPipeline: false,
      downsample: rowCount > 3000,
      pointSize: rowCount > 50_000 ? 1 : rowCount > 10_000 ? 2 : 3,
      reason: 'layer spec — Canvas path rendering',
    };
  }

  // Path marks (line, area) always use Canvas but with M4 downsampling
  if (PATH_MARKS.has(markType)) {
    return {
      tier: rowCount > 10_000 ? 'canvas-fast' : 'canvas-quality',
      useBufferPipeline: false,
      downsample: rowCount > 3000,
      pointSize: 3,
      reason: `path mark '${markType}' — Canvas with M4 downsample at ${rowCount > 3000 ? 'active' : 'off'}`,
    };
  }

  // Buffer-eligible marks: dispatch based on row count
  if (BUFFER_ELIGIBLE_MARKS.has(markType)) {
    if (rowCount > 10_000) {
      return {
        tier: 'webgl-instanced',
        useBufferPipeline: true,
        downsample: false,
        pointSize: rowCount > 50_000 ? 1 : 2,
        reason: `${rowCount} rows — WebGL instanced buffer pipeline`,
      };
    }
    if (rowCount > 500) {
      return {
        tier: 'canvas-fast',
        useBufferPipeline: true,
        downsample: false,
        pointSize: rowCount > 5_000 ? 3 : 4,
        reason: `${rowCount} rows — Canvas fast with sprite drawImage`,
      };
    }
    return {
      tier: 'canvas-quality',
      useBufferPipeline: false,
      downsample: false,
      pointSize: 5,
      reason: `${rowCount} rows — Canvas quality (arc circles)`,
    };
  }

  // Composite marks (boxplot, arc, text) — always Canvas
  return {
    tier: rowCount > 5_000 ? 'canvas-fast' : 'canvas-quality',
    useBufferPipeline: false,
    downsample: false,
    pointSize: 3,
    reason: `composite mark '${markType}' — Canvas rendering`,
  };
}
