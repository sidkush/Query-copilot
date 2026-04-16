/**
 * ChartSpec → VizQL spec compiler.
 *
 * Translates AskDB's ChartSpec v1 IR into the Vega-Lite-shaped format
 * consumed by the VizQL engine's compileSpec() function
 * (frontend/src/vizql/compiler.ts).
 *
 * Only handles 'cartesian' spec types. Map, geo-overlay, and creative
 * specs route to their own renderers via the IR router.
 *
 * VizQL encoding channels use `scale: { scheme }` (not a top-level
 * `scheme` property) — mirroring the Vega-Lite convention that the
 * VizQL renderer's parseChannel() unwraps.
 */

import type { ChartSpec, FieldRef, Encoding } from '../types';

// ---------------------------------------------------------------------------
// Output interfaces
// ---------------------------------------------------------------------------

/**
 * A single encoding channel in the VizQL output.
 *
 * The VizQL renderer's parseChannel() reads `scale.scheme` for color
 * palette selection, so `scheme` is carried inside `scale` rather than
 * as a top-level property.
 */
export interface VizQLField {
  field: string;
  type: string;
  aggregate?: string;
  bin?: boolean | { maxbins: number };
  timeUnit?: string;
  sort?: unknown;
  /** Color scheme name, wrapped in `scale` so the VizQL renderer can unwrap it. */
  scale?: { scheme: string } & Record<string, unknown>;
}

/**
 * Encoding map produced by this compiler.
 *
 * Single-value channels hold one VizQLField; array channels (detail,
 * tooltip) hold VizQLField[].
 */
export type VizQLEncoding = Record<string, VizQLField | VizQLField[]>;

/**
 * Top-level output spec consumed by the VizQL engine's compileSpec().
 *
 * Composition forms are represented by mutually exclusive properties:
 * - `layer[]`   → overlaid unit specs
 * - `hconcat[]` → side-by-side specs
 * - `vconcat[]` → stacked specs
 * - `facet` + `spec` → small-multiples wrapper
 *
 * `lod` and `tableCalcs` are pass-through slots for future VizQL engine
 * support — they are not populated by this compiler in v1 but are typed
 * here so callers can augment the output post-compilation without
 * needing a separate type cast.
 */
export interface VizQLSpec {
  mark?: string | Record<string, unknown>;
  encoding?: VizQLEncoding;
  layer?: VizQLSpec[];
  hconcat?: VizQLSpec[];
  vconcat?: VizQLSpec[];
  /** Facet field description — single field (row or column, row takes precedence). */
  facet?: { field: string; type: string; columns?: number };
  /** Inner spec for facet composition. */
  spec?: VizQLSpec;
  /** Reserved: repeat spec (not produced by this compiler in v1). */
  repeat?: unknown;
  /** Reserved: LOD expressions (pass-through, not compiled from ChartSpec v1). */
  lod?: unknown[];
  /** Reserved: table calculations (pass-through, not compiled from ChartSpec v1). */
  tableCalcs?: unknown[];
}

// ---------------------------------------------------------------------------
// Field compilation
// ---------------------------------------------------------------------------

/**
 * Convert a single FieldRef to a VizQLField.
 *
 * - `geographic` type is mapped to `nominal` — geographic rendering goes
 *   through map/geo-overlay renderers, not the VizQL cartesian engine.
 * - `aggregate: 'none'` is dropped (VizQL treats absence as no aggregation).
 * - Color `scheme` is wrapped inside `scale` to match the VizQL renderer's
 *   parseChannel() extraction path (`(obj.scale as ...)?.scheme`).
 */
export function compileField(f: FieldRef & { scheme?: string }): VizQLField {
  const out: VizQLField = {
    field: f.field,
    type: f.type === 'geographic' ? 'nominal' : f.type,
  };

  if (f.aggregate && f.aggregate !== 'none') out.aggregate = f.aggregate;
  if (f.bin !== undefined) out.bin = f.bin;
  if (f.timeUnit) out.timeUnit = f.timeUnit;
  if (f.sort) out.sort = f.sort;

  // Carry scheme inside `scale` so VizQL's parseChannel() can unwrap it.
  if (f.scheme) {
    out.scale = { scheme: f.scheme };
  }

  return out;
}

// ---------------------------------------------------------------------------
// Encoding compilation
// ---------------------------------------------------------------------------

/**
 * Compile an Encoding to a flat VizQLEncoding record.
 *
 * All single-value channels (x, y, x2, y2, color, size, shape, opacity,
 * text, row, column, order) produce a single VizQLField.
 *
 * Array channels (detail, tooltip) produce VizQLField[].
 */
export function compileEncoding(enc: Encoding): VizQLEncoding {
  const out: VizQLEncoding = {};

  if (enc.x) out.x = compileField(enc.x);
  if (enc.y) out.y = compileField(enc.y);
  if (enc.x2) out.x2 = compileField(enc.x2);
  if (enc.y2) out.y2 = compileField(enc.y2);
  if (enc.color) out.color = compileField(enc.color);
  if (enc.size) out.size = compileField(enc.size);
  if (enc.shape) out.shape = compileField(enc.shape);
  if (enc.opacity) out.opacity = compileField(enc.opacity);
  if (enc.text) out.text = compileField(enc.text);
  if (enc.row) out.row = compileField(enc.row);
  if (enc.column) out.column = compileField(enc.column);
  if (enc.order) out.order = compileField(enc.order);

  // Array channels
  if (enc.detail && enc.detail.length > 0) {
    out.detail = enc.detail.map(compileField);
  }
  if (enc.tooltip && enc.tooltip.length > 0) {
    out.tooltip = enc.tooltip.map(compileField);
  }

  return out;
}

// ---------------------------------------------------------------------------
// Unit spec compilation
// ---------------------------------------------------------------------------

/**
 * Compile a unit (non-composition) ChartSpec to a VizQLSpec.
 *
 * Handles mark + encoding only. Composition forms (layer, facet, hconcat,
 * vconcat) are handled by compileToVizQL which delegates here for leaf specs.
 */
export function compileUnit(spec: ChartSpec): VizQLSpec {
  const out: VizQLSpec = {};

  if (spec.mark !== undefined) {
    // Mark can be a string or an object with a `type` property.
    // Pass through as-is — the VizQL renderer's parseMark() handles both forms.
    out.mark = spec.mark as string | Record<string, unknown>;
  }

  if (spec.encoding) {
    out.encoding = compileEncoding(spec.encoding);
  }

  return out;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Compile a ChartSpec to a VizQL-compatible spec object.
 *
 * Throws on non-cartesian spec types — those are handled by dedicated
 * renderers (MapLibre, deck.gl, Three.js/r3f) via the IR router.
 *
 * Handles all cartesian composition forms by recursion:
 * - `layer[]`   → each member compiled and assembled under `layer`
 * - `hconcat[]` → each member compiled and assembled under `hconcat`
 * - `vconcat[]` → each member compiled and assembled under `vconcat`
 * - `facet`     → inner spec compiled; row or column FieldRef becomes the
 *                 flat `facet: { field, type, columns? }` the VizQL
 *                 renderer expects. Row takes precedence over column when
 *                 both are present.
 *
 * Falls through to compileUnit() for simple single-mark specs.
 */
export function compileToVizQL(spec: ChartSpec): VizQLSpec {
  if (spec.type !== 'cartesian') {
    throw new Error(
      `compileToVizQL: cannot compile non-cartesian spec (type: "${spec.type}"). ` +
        `Use the appropriate renderer via the IR router.`,
    );
  }

  // Layered composition
  if (spec.layer && spec.layer.length > 0) {
    return {
      layer: spec.layer.map(compileToVizQL),
    };
  }

  // Horizontal concatenation
  if (spec.hconcat && spec.hconcat.length > 0) {
    return {
      hconcat: spec.hconcat.map(compileToVizQL),
    };
  }

  // Vertical concatenation
  if (spec.vconcat && spec.vconcat.length > 0) {
    return {
      vconcat: spec.vconcat.map(compileToVizQL),
    };
  }

  // Faceted composition
  if (spec.facet) {
    const { row, column, spec: innerSpec } = spec.facet;

    // Determine the facet field: row takes precedence over column.
    const facetFieldRef = row ?? column;
    if (!facetFieldRef) {
      // Degenerate facet with no partitioning field — fall through to unit.
      return compileUnit(spec);
    }

    const facetEntry: VizQLSpec['facet'] = {
      field: facetFieldRef.field,
      type: facetFieldRef.type === 'geographic' ? 'nominal' : facetFieldRef.type,
    };

    // `columns` lives on the facet object (wraps grid width for row facets).
    const columns = (spec.facet as { columns?: number }).columns;
    if (columns !== undefined) {
      facetEntry.columns = columns;
    }

    return {
      facet: facetEntry,
      spec: compileToVizQL(innerSpec),
    };
  }

  // Simple unit spec
  return compileUnit(spec);
}
