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
