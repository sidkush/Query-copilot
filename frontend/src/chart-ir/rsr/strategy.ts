/**
 * RenderStrategy — output type of the Render Strategy Router (RSR).
 *
 * RSR picks a rendering strategy from (spec, data shape, GPU, frame budget,
 * pool pressure). Re-computed when any input changes. See renderStrategyRouter.ts
 * for the pure decision function.
 */

import type { ChartSpec, SemanticType } from '../types';

export type StrategyTier = 't0' | 't1' | 't2' | 't3';
export type RendererFamily = 'vega' | 'deck' | 'maplibre' | 'creative';
export type RendererBackend = 'svg' | 'canvas' | 'webgl';
export type DownsampleMethod =
  | 'lttb'
  | 'uniform'
  | 'pixel_min_max'
  | 'aggregate_bin'
  | 'none';
export type FrameBudgetState = 'tight' | 'normal' | 'loose';
export type GpuTier = 'low' | 'medium' | 'high';

export interface ResultProfile {
  rowCount: number;
  xType?: SemanticType;
  yType?: SemanticType;
  /** True if the chart's mark type can be rendered by deck.gl. */
  markEligibleForDeck: boolean;
}

export interface InstancePressure {
  activeContexts: number;
  max: number;
  /** max(webglRatio, memoryRatio). 0.0 = empty, 1.0 = full. */
  pressureRatio: number;
}

export interface RenderStrategyInput {
  spec: ChartSpec;
  resultProfile: ResultProfile;
  gpuTier: GpuTier;
  frameBudgetState: FrameBudgetState;
  instancePressure: InstancePressure;
  /** Optional pixel width hint for pixel_min_max strategy. */
  pixelWidth?: number;
  /** Power-user / test override. Refused if illegal for the chart. */
  hint?: StrategyTier;
}

export interface DownsampleDecision {
  enabled: boolean;
  method: DownsampleMethod;
  targetPoints: number;
}

export interface StreamingDecision {
  enabled: boolean;
  batchRows: number;
}

export interface RenderStrategy {
  tier: StrategyTier;
  rendererFamily: RendererFamily;
  rendererBackend: RendererBackend;
  downsample: DownsampleDecision;
  streaming: StreamingDecision;
  /** Human-readable explanation. Surfaced in dev overlay + telemetry. */
  reason: string;
}
