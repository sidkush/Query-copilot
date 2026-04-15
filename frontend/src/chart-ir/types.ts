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

/**
 * Visual encoding channels — map data fields to visual properties.
 * Mirrors Vega-Lite encoding shape with AskDB-specific constraints.
 *
 * The 'detail' channel is special: it splits marks by the field WITHOUT
 * any visible encoding (no color, size, or position change). Used for
 * level-of-detail aggregation control. Tableau-equivalent: Marks card
 * Detail well.
 */
export interface Encoding {
  /** Horizontal position. */
  x?: FieldRef;
  /** Vertical position. */
  y?: FieldRef;
  /** End of horizontal range (for bars, area). */
  x2?: FieldRef;
  /** End of vertical range. */
  y2?: FieldRef;
  /** Color encoding. Optional 'scheme' property names a palette. */
  color?: FieldRef & { scheme?: string };
  /** Mark size (radius for points, thickness for bars). */
  size?: FieldRef;
  /** Glyph shape for point marks. */
  shape?: FieldRef;
  /** Mark transparency. */
  opacity?: FieldRef;
  /**
   * Level-of-detail split with no visible encoding. Multiple fields stack.
   * Use to disaggregate marks without introducing a color/shape encoding.
   */
  detail?: FieldRef[];
  /** Fields surfaced in hover tooltip. Order matters — first field is title. */
  tooltip?: FieldRef[];
  /** Text content for text marks. */
  text?: FieldRef;
  /** Facet by row (small multiples). */
  row?: FieldRef;
  /** Facet by column (small multiples). */
  column?: FieldRef;
  /** Mark drawing order (e.g., line connection order, stack order). */
  order?: FieldRef;
}

/**
 * Data transformation step applied before rendering.
 * Executed in order. Multiple transforms compose into a pipeline.
 */
export interface Transform {
  /** Filter rows where field matches the predicate. */
  filter?: { field: string; op: string; value: unknown };
  /** Bin a quantitative field into buckets. */
  bin?: { field: string; maxbins?: number };
  /** Compute an aggregate, output as new field. */
  aggregate?: { field: string; op: Aggregate; as: string };
  /** Sample N rows. method='lttb' preserves visual peaks; 'uniform' is random. */
  sample?: { n: number; method: 'lttb' | 'uniform' };
  /** Calculate a derived field via sandboxed expression. */
  calculate?: { as: string; expr: string };
}

/**
 * Interactive selection — drives cross-filtering, highlighting, brushing.
 * Vega-Lite-compatible selection grammar.
 */
export interface Selection {
  /** Unique selection name (referenced by other charts in dashboard). */
  name: string;
  /** 'interval' = brush rectangle; 'point' = click-to-select. */
  type: 'interval' | 'point';
  /** Trigger event. */
  on?: 'click' | 'hover';
  /** Which encoding channels participate in the selection. */
  encodings?: (keyof Encoding)[];
  /** How to clear the selection. */
  clear?: 'dblclick' | 'escape';
}

/** Top-level discriminator for which renderer pipeline handles the spec. */
export type SpecType = 'cartesian' | 'map' | 'geo-overlay' | 'creative';

/** Map tile provider. Default 'maplibre' uses OSM tiles (free, no key). */
export type MapProvider = 'maplibre' | 'mapbox' | 'google';

/** A single map layer (markers, choropleth, lines). */
export interface MapLayer {
  type: 'symbol' | 'fill' | 'line' | 'circle' | 'heatmap';
  source: 'data' | string;
  paint?: Record<string, unknown>;
  layout?: Record<string, unknown>;
  filter?: unknown[];
}

/** A single deck.gl layer for high-density geo overlays. */
export interface DeckLayer {
  type: 'ScatterplotLayer' | 'HexagonLayer' | 'ArcLayer' | 'PathLayer'
      | 'PolygonLayer' | 'TripsLayer' | 'GridLayer' | 'HeatmapLayer';
  data?: unknown[];
  props?: Record<string, unknown>;
}

/**
 * ChartSpec — the canonical AskDB chart description.
 *
 * Discriminated by `type`. Cartesian specs use Vega-Lite's grammar
 * (mark + encoding + transform + layer + facet + concat). Map specs route
 * to MapLibre. Geo-overlay specs render deck.gl layers over a base map.
 * Creative specs invoke registered Stage Mode visuals (Three.js / r3f).
 */
export interface ChartSpec {
  /** Schema version pin for forward-compat. */
  $schema: 'askdb/chart-spec/v1';

  /** Discriminator: which renderer handles this spec. */
  type: SpecType;

  /** Display title shown in tile header. */
  title?: string;
  /** Subtitle / description. */
  description?: string;

  // -------- Cartesian / statistical (Vega-Lite subset) --------

  /** Mark type — primitive shape. */
  mark?: Mark | { type: Mark; [prop: string]: unknown };

  /** Visual encoding channels. */
  encoding?: Encoding;

  /** Data transformation pipeline. */
  transform?: Transform[];

  /** Interactive selection definitions. */
  selection?: Selection[];

  /** Layered specs — each layer rendered on top of the previous. */
  layer?: ChartSpec[];

  /** Faceting (small multiples) — row, column, or both. */
  facet?: { row?: FieldRef; column?: FieldRef; spec: ChartSpec };

  /** Horizontal concatenation. */
  hconcat?: ChartSpec[];

  /** Vertical concatenation. */
  vconcat?: ChartSpec[];

  // -------- Map (MapLibre / Mapbox / Google) --------

  map?: {
    provider: MapProvider;
    /** Tile style URL or built-in style name. */
    style: string;
    /** Initial map center [lng, lat]. */
    center: [number, number];
    /** Initial zoom level (0–22). */
    zoom: number;
    /** Map layers. */
    layers: MapLayer[];
  };

  // -------- Geo overlay (deck.gl on top of base map) --------

  overlay?: {
    layers: DeckLayer[];
  };

  // -------- Creative (Stage Mode visuals) --------

  creative?: {
    /** Renderer engine. */
    engine: 'three' | 'r3f';
    /** Component identifier from the creative-lane registry. */
    component: string;
    /** Props passed to the component. */
    props: Record<string, unknown>;
  };

  // -------- Global config --------

  config?: {
    /** Theme name — 'light', 'dark', or one of the 6 Stage themes. */
    theme?: string;
    /** Color palette name. */
    palette?: string;
    /** Density preference. */
    density?: 'comfortable' | 'compact';
  };
}
