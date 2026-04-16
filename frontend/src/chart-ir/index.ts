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

// Sub-project B Phase B5 — renderer telemetry
export { reportRenderTelemetry } from './perf/rendererTelemetry';
export type { RenderTelemetryPayload } from './perf/rendererTelemetry';

// Sub-project B Phase B4 — Arrow streaming
export { ArrowChunkReceiver } from './perf/arrowChunkReceiver';
export type {
  ArrowChunkReceiverOptions,
  ChunkEvent,
  DoneEvent,
} from './perf/arrowChunkReceiver';

// DuckDB-WASM client-side LTTB fallback (dep: npm install @duckdb/duckdb-wasm)
export { initDuckDBWasm, localLttbDownsample, isDuckDBWasmAvailable } from './perf/duckdbWasm';

export { compileToVegaLite } from './compiler/toVegaLite';

export { applySpecPatch, parsePointer, PatchError } from './applySpecPatch';
export type { Patch, PatchOp } from './applySpecPatch';

export { lttb, uniformSample, lttbRows } from './transforms/lttb';
export type { Point } from './transforms/lttb';

export { pixelMinMaxRows } from './transforms/pixelMinMax';
export type { PixelMinMaxOptions } from './transforms/pixelMinMax';

export { aggregateBinRows } from './transforms/aggregateBin';
export type { BinAggregate, AggregateBinOptions } from './transforms/aggregateBin';

// LOD expressions — Tableau-style FIXED / INCLUDE / EXCLUDE
export {
  executeLodExpression,
  executeLodPipeline,
  resolvePartitionDimensions,
  fixed,
  include,
  exclude,
  total,
  percentOfTotal,
  indexToAverage,
} from './transforms/lodExpression';
export type {
  LodType,
  LodAggregate,
  LodExpression,
  LodContext,
} from './transforms/lodExpression';

// Table calculations — running_sum, rank, pct_of_total, moving_avg, etc.
export {
  executeTableCalc,
  executeTableCalcPipeline,
  resolvePartitionAddress,
  runningSum,
  rank,
  pctOfTotal,
  movingAvg,
  difference,
  pctChange,
  cumulativePct,
} from './transforms/tableCalc';
export type {
  TableCalcType,
  SortDirection,
  TableCalcDef,
} from './transforms/tableCalc';

// Sub-project D — semantic layer
export { validateLinguisticModel } from './semantic/linguistic';
export type {
  LinguisticModel,
  LinguisticSynonyms,
  LinguisticValidationResult,
  Phrasing,
  PhrasingType,
  SampleQuestion,
  SuggestionStatus,
  ChangelogEntry,
} from './semantic/linguistic';

export { validateSemanticModel } from './semantic/validator';
export type { SemanticValidationResult } from './semantic/validator';
export {
  resolveSemanticRef,
  compileSemanticSpec,
  SemanticResolutionError,
} from './semantic/resolver';
export type { ResolveResult } from './semantic/resolver';
export type {
  SemanticModel,
  Dimension,
  Measure,
  Metric,
  SemanticFieldRef,
} from './semantic/types';
export { resolveColor, validateColorMap, buildColorScale } from './semantic/colorMap';
export type { ColorMap, ColorMapValidationResult } from './semantic/colorMap';

export { detectCorrections } from './semantic/correctionDetector';
export type { CorrectionSuggestion, CorrectionType } from './semantic/correctionDetector';

// Sub-project C — user-authored chart types
export { validateUserChartType, collectPlaceholders } from './userTypes/schema';
export type { UserTypeValidationResult } from './userTypes/schema';
export {
  instantiateUserChartType,
  InstantiationError,
} from './userTypes/instantiate';
export {
  UserChartTypeRegistry,
  globalUserChartTypeRegistry,
} from './userTypes/registry';
export type { RegisterResult } from './userTypes/registry';
export type {
  UserChartType,
  UserChartTypeParam,
  UserChartTypeParamKind,
  InstantiateParams,
} from './userTypes/types';

// Sub-project C Phase C2 — Chart SDK types
export type { DataRole } from './sdk/types';
export type { FormattingProperty } from './sdk/types';
export type { FormattingGroup } from './sdk/types';
export type { ChartCapabilities } from './sdk/types';
export type { DataColumn } from './sdk/types';
export type { ChartDataView } from './sdk/types';
export type { ThemeTokens } from './sdk/types';
export type { Viewport } from './sdk/types';
export type { ChartRenderContext } from './sdk/types';
export type { IChartType } from './sdk/types';

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
// Real voice adapters are NOT barrel-exported here. They self-register
// via registerVoiceProvider() at import time, overriding the stubs.
// Import them explicitly where needed:
//   import '@/chart-ir/voice/whisperLocal';
//   import '@/chart-ir/voice/deepgramStreaming';
//   import '@/chart-ir/voice/openaiRealtime';
// This prevents the test environment from accidentally loading
// browser APIs (MediaStream, WebSocket) at barrel import time.
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

// Sub-project C2 — sandboxed chart SDK postMessage bridge
export { buildHostMessage, parseGuestMessage, buildSrcdoc } from './sdk/bridge';
export type { BridgeMessage, HostMessageType, GuestMessageType } from './sdk/bridge';
