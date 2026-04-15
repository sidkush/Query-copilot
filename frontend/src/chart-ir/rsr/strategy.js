/**
 * RenderStrategy — the output of the Render Strategy Router (RSR).
 *
 * RSR decides at render time which renderer + backend + downsample method
 * to use for a given chart, based on the data shape, GPU tier, current
 * frame budget, and pool pressure. The strategy is recomputed when any of
 * those inputs changes.
 *
 * Note: This file uses JSDoc typedefs because the AskDB frontend is pure
 * JavaScript (no TypeScript toolchain). When sub-project A introduces a
 * TypeScript build step, these typedefs migrate to .ts type aliases.
 */

/**
 * @typedef {'t0' | 't1' | 't2' | 't3'} StrategyTier
 * @typedef {'vega' | 'deck' | 'maplibre' | 'creative'} RendererFamily
 * @typedef {'svg' | 'canvas' | 'webgl'} RendererBackend
 * @typedef {'lttb' | 'uniform' | 'pixel_min_max' | 'aggregate_bin' | 'none'} DownsampleMethod
 * @typedef {'tight' | 'normal' | 'loose'} FrameBudgetState
 * @typedef {'low' | 'medium' | 'high'} GpuTier
 * @typedef {'nominal' | 'ordinal' | 'quantitative' | 'temporal' | 'geographic'} SemanticType
 */

/**
 * @typedef {Object} ResultProfile
 * @property {number} rowCount
 * @property {SemanticType} [xType]
 * @property {SemanticType} [yType]
 * @property {boolean} markEligibleForDeck - True if the chart's mark type can be rendered by deck.gl
 */

/**
 * @typedef {Object} InstancePressure
 * @property {number} activeContexts
 * @property {number} max
 * @property {number} pressureRatio - max(webglRatio, memoryRatio). 0.0 = empty, 1.0 = full.
 */

/**
 * @typedef {Object} ChartSpecLite
 * @property {string} [type] - 'cartesian' | 'map' | 'geo-overlay' | 'creative'
 * @property {string | { type: string }} [mark]
 * @property {Object} [encoding]
 * @property {Object} [config]
 *
 * @description Minimal ChartSpec shape consumed by RSR. Sub-project A defines
 * the full ChartSpec type. RSR only needs `type`, `mark`, and `config.strategyHint`.
 */

/**
 * @typedef {Object} RenderStrategyInput
 * @property {ChartSpecLite} spec
 * @property {ResultProfile} resultProfile
 * @property {GpuTier} gpuTier
 * @property {FrameBudgetState} frameBudgetState
 * @property {InstancePressure} instancePressure
 * @property {number} [pixelWidth] - Optional pixel width hint for pixel_min_max strategy
 * @property {StrategyTier} [hint] - Power-user / test override. Refused if illegal for the chart.
 */

/**
 * @typedef {Object} DownsampleDecision
 * @property {boolean} enabled
 * @property {DownsampleMethod} method
 * @property {number} targetPoints
 */

/**
 * @typedef {Object} StreamingDecision
 * @property {boolean} enabled
 * @property {number} batchRows
 */

/**
 * @typedef {Object} RenderStrategy
 * @property {StrategyTier} tier
 * @property {RendererFamily} rendererFamily
 * @property {RendererBackend} rendererBackend
 * @property {DownsampleDecision} downsample
 * @property {StreamingDecision} streaming
 * @property {string} reason - Human-readable explanation, surfaced in dev overlay + telemetry
 */

// Mark this file as a module so JSDoc imports work
export {};
