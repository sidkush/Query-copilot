/**
 * Spec compiler — parses Vega-Lite-shaped JSON specs into CompiledSpec.
 *
 * Handles: mark extraction, encoding channel parsing, layer/facet decomposition.
 * Does NOT handle data — that's the aggregator's job.
 */

import type { CompiledSpec, CompiledEncoding, EncodingChannel, MarkConfig, MarkType } from './types';

const KNOWN_MARKS = new Set<string>([
  'bar', 'line', 'area', 'point', 'circle', 'square', 'tick',
  'rect', 'arc', 'text', 'rule', 'trail', 'boxplot', 'geoshape',
]);

function parseMark(raw: unknown): MarkConfig {
  if (typeof raw === 'string') {
    const type = KNOWN_MARKS.has(raw) ? (raw as MarkType) : 'point';
    return { type, filled: type !== 'line' };
  }
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    const type = KNOWN_MARKS.has(obj.type as string) ? (obj.type as MarkType) : 'point';
    return {
      type,
      filled: (obj.filled as boolean) ?? type !== 'line',
      point: obj.point as boolean | { size?: number } | undefined,
      color: obj.color as string | undefined,
      strokeDash: obj.strokeDash as number[] | undefined,
      strokeWidth: obj.strokeWidth as number | undefined,
    };
  }
  return { type: 'point', filled: true };
}

function parseChannel(raw: unknown): EncodingChannel | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;
  // Handle aggregate-only channels like { aggregate: 'count' }
  if (!obj.field && !obj.aggregate) return undefined;
  return {
    field: (obj.field as string) ?? '__count__',
    type: (obj.type as EncodingChannel['type']) ?? 'quantitative',
    aggregate: obj.aggregate as string | undefined,
    bin: obj.bin as boolean | { maxbins: number } | undefined,
    timeUnit: obj.timeUnit as string | undefined,
    format: obj.format as string | undefined,
    title: obj.title as string | undefined,
    sort: obj.sort,
    scheme: (obj.scale as Record<string, unknown>)?.scheme as string | undefined,
  };
}

function parseEncoding(raw: unknown): CompiledEncoding {
  if (!raw || typeof raw !== 'object') return {};
  const obj = raw as Record<string, unknown>;
  const enc: CompiledEncoding = {};

  enc.x = parseChannel(obj.x);
  enc.y = parseChannel(obj.y);
  enc.x2 = parseChannel(obj.x2);
  enc.y2 = parseChannel(obj.y2);
  enc.color = parseChannel(obj.color);
  enc.size = parseChannel(obj.size);
  enc.shape = parseChannel(obj.shape);
  enc.opacity = parseChannel(obj.opacity);
  enc.text = parseChannel(obj.text);
  enc.theta = parseChannel(obj.theta);
  enc.row = parseChannel(obj.row);
  enc.column = parseChannel(obj.column);
  enc.xOffset = parseChannel(obj.xOffset);

  if (Array.isArray(obj.detail)) {
    enc.detail = obj.detail.map(parseChannel).filter(Boolean) as EncodingChannel[];
  }
  if (Array.isArray(obj.tooltip)) {
    enc.tooltip = obj.tooltip.map(parseChannel).filter(Boolean) as EncodingChannel[];
  }
  return enc;
}

/**
 * Compile a Vega-Lite-shaped spec into our internal representation.
 */
export function compileSpec(
  raw: Record<string, unknown>,
  width = 800,
  height = 600,
): CompiledSpec {
  // Handle layer specs
  if (Array.isArray(raw.layer)) {
    const layers = (raw.layer as Record<string, unknown>[]).map((l) =>
      compileSpec(l, width, height),
    );
    return {
      mark: layers[0]?.mark ?? { type: 'point', filled: true },
      encoding: layers[0]?.encoding ?? {},
      layers,
      width,
      height,
    };
  }

  // Handle facet specs
  if (raw.facet && typeof raw.facet === 'object') {
    const facetObj = raw.facet as Record<string, unknown>;
    const innerSpec = raw.spec as Record<string, unknown> | undefined;
    const inner = innerSpec ? compileSpec(innerSpec, width, height) : undefined;
    return {
      mark: inner?.mark ?? { type: 'bar', filled: true },
      encoding: inner?.encoding ?? {},
      facet: {
        field: facetObj.field as string,
        type: (facetObj.type as string) ?? 'nominal',
        columns: facetObj.columns as number | undefined,
        spec: inner!,
      },
      width,
      height,
    };
  }

  return {
    mark: parseMark(raw.mark),
    encoding: parseEncoding(raw.encoding),
    width,
    height,
  };
}
