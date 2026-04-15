/**
 * ChartSpec — AskDB's grammar-of-graphics intermediate representation.
 *
 * Vega-Lite-compatible subset extended with map and geo-overlay spec types.
 * The agent emits ChartSpec, the user edits it via Marks card, the renderer
 * compiles it to Vega-Lite / MapLibre / deck.gl / Three.js depending on type.
 *
 * Spec source of truth:
 * docs/superpowers/specs/2026-04-15-chart-system-sub-project-a-design.md §9
 */

/** Mark types — visual primitives that compose into chart shapes. */
export type Mark =
  | 'bar'
  | 'line'
  | 'area'
  | 'point'
  | 'circle'
  | 'square'
  | 'tick'
  | 'rect'
  | 'arc'
  | 'text'
  | 'geoshape'
  | 'boxplot'
  | 'errorbar'
  | 'rule'
  | 'trail'
  | 'image';

/**
 * Semantic type for a data field — drives axis scale, legend rendering,
 * and Show Me chart recommendation rules.
 */
export type SemanticType =
  | 'nominal'      // unordered categorical (e.g., country, product)
  | 'ordinal'      // ordered categorical (e.g., low/medium/high)
  | 'quantitative' // numeric (e.g., revenue, count, percentage)
  | 'temporal'     // dates and timestamps
  | 'geographic';  // lat/lng pairs, country codes, postal codes

/**
 * Aggregation operator applied to a measure field before rendering.
 * The 'none' value disables aggregation (raw row-level rendering).
 */
export type Aggregate =
  | 'sum'
  | 'avg'
  | 'min'
  | 'max'
  | 'count'
  | 'distinct'
  | 'median'
  | 'stdev'
  | 'variance'
  | 'p25'
  | 'p75'
  | 'p95'
  | 'none';

/**
 * Reference to a data field in the result set, with optional encoding
 * modifiers (aggregation, binning, time bucketing, sort, format).
 */
export interface FieldRef {
  /** Column name in the result set. Must match a column from column_profile. */
  field: string;
  /** Semantic type — drives scale and rendering decisions. */
  type: SemanticType;
  /** Aggregation operator. Defaults to 'sum' for measures, 'none' for dimensions. */
  aggregate?: Aggregate;
  /** Bin a quantitative field into buckets. true for auto, or specify maxbins. */
  bin?: boolean | { maxbins: number };
  /** Time bucketing for temporal fields. */
  timeUnit?: 'year' | 'quarter' | 'month' | 'week' | 'day' | 'hour';
  /** Sort order. String for direction, object for sort-by-other-field. */
  sort?: 'asc' | 'desc' | { field: string; op: Aggregate };
  /** d3-format / d3-time-format string for axis labels and tooltips. */
  format?: string;
  /** Display title — overrides the field name in axis labels and legends. */
  title?: string;
}
