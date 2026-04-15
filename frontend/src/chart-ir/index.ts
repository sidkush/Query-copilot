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

export { routeSpec } from './router';
export type { RendererId } from './router';

export { compileToVegaLite } from './compiler/toVegaLite';

export {
  analyzeResultShape,
  HIGH_CARDINALITY_THRESHOLD,
} from './recommender/resultShape';
export type { ColumnProfile, ResultShapeInput, ResultShape } from './recommender/resultShape';

export { recommendCharts, availableChartTypes } from './recommender/showMe';
export type { ChartRecommendation, ChartAvailability } from './recommender/showMe';

export { CHART_TYPES } from './recommender/chartTypes';
export type { ChartCategory, ChartTypeRequirements, ChartTypeDef } from './recommender/chartTypes';
