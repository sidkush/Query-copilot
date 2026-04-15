/**
 * AskDB Chart IR — public API.
 *
 * Import everything chart-ir-related from this module:
 *   import { ChartSpec, validateChartSpec, recommendCharts } from '@/chart-ir';
 */
export type {
  Mark,
  SemanticType,
  Aggregate,
  FieldRef,
  Encoding,
  Transform,
  Selection,
  ChartSpec,
  SpecType,
  MapProvider,
  MapLayer,
  DeckLayer,
} from './types';

export { chartSpecSchema, validateChartSpec, assertValidChartSpec } from './schema';
export type { ValidationResult } from './schema';

export { routeSpec, routeSpecWithStrategy } from './router';
export type {
  RendererId,
  RouteWithStrategyInput,
  RouteWithStrategyResult,
} from './router';

// Sub-project B — Render Strategy Router + perf subsystem
export { pickRenderStrategy } from './rsr/renderStrategyRouter';
export { THRESHOLDS, DECK_ELIGIBLE_MARKS } from './rsr/thresholds';
export type {
  StrategyTier,
  RendererFamily,
  RendererBackend,
  DownsampleMethod,
  FrameBudgetState,
  GpuTier,
  ResultProfile,
  InstancePressure,
  RenderStrategyInput,
  DownsampleDecision,
  StreamingDecision,
  RenderStrategy,
} from './rsr/strategy';

export { FrameBudgetTracker, globalFrameBudgetTracker } from './perf/frameBudgetTracker';
export type { FrameBudgetTrackerOptions } from './perf/frameBudgetTracker';

export { InstancePool, globalInstancePool } from './perf/instancePool';
export type { InstanceKind, InstancePoolOptions } from './perf/instancePool';

export { compileToVegaLite } from './compiler/toVegaLite';

export { applySpecPatch, parsePointer, PatchError } from './applySpecPatch';
export type { Patch, PatchOp } from './applySpecPatch';

export { lttb, uniformSample, lttbRows } from './transforms/lttb';
export type { Point } from './transforms/lttb';

// Voice — Phase 3 tier abstraction + stub adapters
export {
  registerVoiceProvider,
  getVoiceProviderFactory,
  availableVoiceTiers,
  createVoiceProvider,
} from './voice/voiceProvider';
export type {
  VoiceTier,
  VoiceTranscript,
  TranscriptListener,
  VoiceProvider,
  VoiceProviderOptions,
  VoiceProviderFactory,
} from './voice/voiceProvider';
export { StubVoiceProvider } from './voice/stubs';
export {
  isWakeWordAvailable,
  startWakeWordSession,
} from './voice/wakeWord';
export type { WakeWordTrigger, WakeWordOptions, WakeWordSession } from './voice/wakeWord';
export { mintEphemeralToken } from './voice/ephemeralToken';
export type { EphemeralTokenResponse } from './voice/ephemeralToken';

export {
  analyzeResultShape,
  HIGH_CARDINALITY_THRESHOLD,
} from './recommender/resultShape';
export type { ColumnProfile, ResultShapeInput, ResultShape } from './recommender/resultShape';

export { recommendCharts, availableChartTypes } from './recommender/showMe';
export type { ChartRecommendation, ChartAvailability } from './recommender/showMe';

export { CHART_TYPES } from './recommender/chartTypes';
export type { ChartCategory, ChartTypeRequirements, ChartTypeDef } from './recommender/chartTypes';
