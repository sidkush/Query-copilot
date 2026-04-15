/**
 * Sub-project D — semantic layer.
 *
 * A SemanticModel is a named, versioned collection of dimensions,
 * measures, and metrics that the agent + the MarksCard consume as
 * first-class "fields" instead of raw column references. It's the
 * layer that makes `color by country` and `sum of ARPU` work the
 * same way in both natural language and the editor.
 *
 * Design intent (Phase D foundation):
 *   - Dimensions: named groupings backed by a column or a SQL fragment.
 *     The agent can drop a dimension into spec.encoding.x/color/row/col
 *     without knowing which column it maps to.
 *   - Measures: simple aggregated columns. Each measure declares an
 *     aggregate ('sum' / 'avg' / 'count' / …) so the caller doesn't
 *     have to pick one. If a measure declares a `sql` fragment, that
 *     fragment stands in for the column expression.
 *   - Metrics: calculated fields composed of other measures (or raw
 *     SQL). Example: `arpu = revenue / users`. The compiler resolves
 *     metric refs into Vega-Lite `calculate` transforms at chart-spec
 *     compile time.
 *
 * Deferred to Phase D+1:
 *   - Join graph / relationships. A semantic model today must live
 *     within a single table (or a single query result). The
 *     multi-table join graph is Phase D+1 work.
 *   - Row-level access policies.
 *   - Cube-style drill paths.
 *   - Unit / currency / timezone descriptors.
 */

import type { SemanticType, Aggregate } from '../types';

export interface Dimension {
  id: string;
  label: string;
  field: string;
  semanticType: SemanticType;
  sql?: string;
  description?: string;
}

export interface Measure {
  id: string;
  label: string;
  field: string;
  aggregate: Aggregate;
  sql?: string;
  format?: string;
  description?: string;
}

export interface Metric {
  id: string;
  label: string;
  /**
   * A formula expression in Vega-Lite's `calculate` syntax (a subset of
   * JavaScript). Refers to other measures via `datum.<measureId>`.
   * Example: `datum.revenue / datum.users` for ARPU.
   */
  formula: string;
  /**
   * Explicit list of measure ids this metric depends on. The compiler
   * uses this to ensure all referenced measures are materialized as
   * encodings before the metric's calculate transform runs.
   */
  dependencies: string[];
  description?: string;
  format?: string;
}

export interface SemanticModel {
  /** Unique id (usually `{org}:{model-slug}`). */
  id: string;
  /** Human-readable name for the picker. */
  name: string;
  /** Monotonic version for forward-compat. Phase D foundation = 1. */
  version: 1;
  description?: string;
  /** Dataset / table this model binds to (for the primary table case). */
  dataset?: string;
  dimensions: Dimension[];
  measures: Measure[];
  metrics: Metric[];
}

/**
 * A semantic field reference used inside ChartSpec encodings, e.g.
 * `{ metric: 'arpu' }` in place of `{ field: 'revenue', aggregate: 'sum' }`.
 */
export interface SemanticFieldRef {
  metric?: string;
  measure?: string;
  dimension?: string;
}
