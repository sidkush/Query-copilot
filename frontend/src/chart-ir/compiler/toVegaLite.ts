/**
 * ChartSpec → Vega-Lite spec compiler.
 *
 * Vega-Lite's spec format is very close to AskDB's ChartSpec for the
 * cartesian type — the main difference is that Vega-Lite uses
 * `data: {values: [...]}` for inline data, whereas AskDB injects the
 * result set at render time. The compiler outputs a Vega-Lite spec
 * with `data: {name: "askdb_data"}` and the renderer wires up the
 * actual rows via `react-vega`'s `data` prop.
 *
 * Reference: https://vega.github.io/vega-lite/docs/spec.html
 */
import type { ChartSpec, FieldRef, Encoding } from '../types';

/**
 * A single encoding channel in the Vega-Lite output.
 *
 * We keep this deliberately loose: the shape is a superset of
 * Vega-Lite's FieldDef that covers only the properties this compiler
 * emits. Unknown-keyed indexer (`[key: string]: unknown`) allows callers
 * and tests to access arbitrary extension fields (e.g. scale overrides)
 * without fighting the type checker.
 */
export interface VegaLiteEncodingEntry {
  field?: string;
  type?: string;
  aggregate?: string;
  bin?: boolean | { maxbins: number };
  timeUnit?: string;
  sort?: unknown;
  format?: string;
  title?: string;
  scale?: { scheme?: string } & Record<string, unknown>;
  [key: string]: unknown;
}

/** Encoding object mapping channel name → encoding entry. */
export interface VegaLiteEncoding {
  x?: VegaLiteEncodingEntry;
  y?: VegaLiteEncodingEntry;
  x2?: VegaLiteEncodingEntry;
  y2?: VegaLiteEncodingEntry;
  color?: VegaLiteEncodingEntry;
  size?: VegaLiteEncodingEntry;
  shape?: VegaLiteEncodingEntry;
  opacity?: VegaLiteEncodingEntry;
  detail?: VegaLiteEncodingEntry[];
  tooltip?: VegaLiteEncodingEntry[];
  text?: VegaLiteEncodingEntry;
  row?: VegaLiteEncodingEntry;
  column?: VegaLiteEncodingEntry;
  order?: VegaLiteEncodingEntry;
}

/** Vega-Lite TopLevelSpec subset we emit. */
export interface VegaLiteSpec {
  $schema?: string;
  data?: { name: string } | { values: unknown[] };
  mark?: unknown;
  encoding?: VegaLiteEncoding;
  transform?: unknown[];
  params?: unknown;
  layer?: VegaLiteSpec[];
  facet?: { row?: VegaLiteEncodingEntry; column?: VegaLiteEncodingEntry };
  spec?: VegaLiteSpec;
  hconcat?: VegaLiteSpec[];
  vconcat?: VegaLiteSpec[];
  config?: unknown;
  title?: string;
  description?: string;
}

/** Compile a single FieldRef to a Vega-Lite encoding entry. */
function compileField(f: FieldRef): VegaLiteEncodingEntry {
  const out: VegaLiteEncodingEntry = {
    field: f.field,
    // Vega-Lite has no 'geographic' type; treat as nominal
    // (geo rendering goes through map/geo-overlay renderers, not Vega-Lite).
    type: f.type === 'geographic' ? 'nominal' : f.type,
  };
  if (f.aggregate && f.aggregate !== 'none') out.aggregate = f.aggregate;
  if (f.bin !== undefined) out.bin = f.bin;
  if (f.timeUnit) out.timeUnit = f.timeUnit;
  if (f.sort) out.sort = f.sort;
  if (f.format) out.format = f.format;
  if (f.title) out.title = f.title;
  return out;
}

/** Compile an Encoding to a Vega-Lite encoding object. */
function compileEncoding(enc: Encoding): VegaLiteEncoding {
  const out: VegaLiteEncoding = {};
  if (enc.x) out.x = compileField(enc.x);
  if (enc.y) out.y = compileField(enc.y);
  if (enc.x2) out.x2 = compileField(enc.x2);
  if (enc.y2) out.y2 = compileField(enc.y2);
  if (enc.color) {
    const color = compileField(enc.color);
    if (enc.color.scheme) color.scale = { scheme: enc.color.scheme };
    out.color = color;
  }
  if (enc.size) out.size = compileField(enc.size);
  if (enc.shape) out.shape = compileField(enc.shape);
  if (enc.opacity) out.opacity = compileField(enc.opacity);
  if (enc.detail) out.detail = enc.detail.map(compileField);
  if (enc.tooltip) out.tooltip = enc.tooltip.map(compileField);
  if (enc.text) out.text = compileField(enc.text);
  if (enc.row) out.row = compileField(enc.row);
  if (enc.column) out.column = compileField(enc.column);
  if (enc.order) out.order = compileField(enc.order);
  return out;
}

/**
 * Compile a ChartSpec to a Vega-Lite spec. Handles cartesian + layered +
 * faceted + concat shapes. Throws on non-cartesian spec types.
 *
 * The output uses a named data source ('askdb_data') — the renderer
 * injects actual rows via react-vega's data prop.
 *
 * `$schema` and `data` are only emitted on the root spec. Recursive
 * children (layers, faceted inner specs, hconcat/vconcat members)
 * inherit `data` from the parent and must not redeclare `$schema`
 * per Vega-Lite convention.
 */
export function compileToVegaLite(spec: ChartSpec): VegaLiteSpec {
  if (spec.type !== 'cartesian') {
    throw new Error(
      `Cannot compile non-cartesian spec to Vega-Lite (type: ${spec.type}). ` +
        `Use the appropriate renderer via the IR router.`,
    );
  }

  const inner = compileInner(spec);
  // Faceted root specs omit top-level `data` — the inner spec
  // inherits it from the renderer-provided dataset at render time,
  // and redeclaring it here would shadow that inheritance.
  if (inner.facet) {
    return {
      $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
      ...inner,
    };
  }
  return {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    data: { name: 'askdb_data' },
    ...inner,
  };
}

/**
 * Compile a cartesian ChartSpec without emitting `$schema` or `data`.
 * Used recursively for children (layers, facet inner, hconcat/vconcat)
 * that inherit those fields from the root spec.
 */
function compileInner(spec: ChartSpec): VegaLiteSpec {
  if (spec.type !== 'cartesian') {
    throw new Error(
      `Cannot compile non-cartesian spec to Vega-Lite (type: ${spec.type}). ` +
        `Use the appropriate renderer via the IR router.`,
    );
  }

  const out: VegaLiteSpec = {};

  if (spec.title) out.title = spec.title;
  if (spec.description) out.description = spec.description;

  // Layered specs — children inherit data from parent.
  if (spec.layer) {
    out.layer = spec.layer.map((s) => compileInner(s));
    return out;
  }

  // Faceted specs — the inner spec inherits the data source from
  // the faceted parent, so no data field is emitted at either level
  // of the facet wrapper here.
  if (spec.facet) {
    out.facet = {};
    if (spec.facet.row) out.facet.row = compileField(spec.facet.row);
    if (spec.facet.column) out.facet.column = compileField(spec.facet.column);
    out.spec = compileInner(spec.facet.spec);
    return out;
  }

  // Concat specs — children inherit data from parent.
  if (spec.hconcat) {
    out.hconcat = spec.hconcat.map((s) => compileInner(s));
    return out;
  }
  if (spec.vconcat) {
    out.vconcat = spec.vconcat.map((s) => compileInner(s));
    return out;
  }

  // Single mark + encoding
  if (spec.mark) out.mark = spec.mark;
  if (spec.encoding) out.encoding = compileEncoding(spec.encoding);
  if (spec.transform) out.transform = spec.transform;
  if (spec.selection) {
    // Vega-Lite v5 uses 'params' with nested 'select' object.
    // AskDB's Selection has flat fields (name/type/on/encodings/clear);
    // we reshape into { name, select: { type, on, clear, encodings } }.
    (out as Record<string, unknown>).params = spec.selection.map((s) => ({
      name: s.name,
      select: {
        type: s.type,
        ...(s.on !== undefined && { on: s.on }),
        ...(s.clear !== undefined && { clear: s.clear }),
        ...(s.encodings !== undefined && { encodings: s.encodings }),
      },
    }));
  }
  if (spec.config) out.config = spec.config;

  return out;
}
