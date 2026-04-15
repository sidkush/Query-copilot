import type { ChartSpec, Encoding, FieldRef, Transform } from '../types';
import type { Dimension, Measure, Metric, SemanticFieldRef, SemanticModel } from './types';

/**
 * Resolve a SemanticFieldRef ({ metric } / { measure } / { dimension })
 * against a SemanticModel and return a concrete FieldRef (plus any
 * required transforms to materialize metric formulas).
 */

export interface ResolveResult {
  fieldRef: FieldRef;
  /** Transforms that must be added to spec.transform[] when this ref is used. */
  extraTransforms: Transform[];
}

export class SemanticResolutionError extends Error {}

export function resolveSemanticRef(
  model: SemanticModel,
  ref: SemanticFieldRef,
): ResolveResult {
  if (ref.dimension) {
    const dim = findDimension(model, ref.dimension);
    if (!dim) throw new SemanticResolutionError(`Unknown dimension: ${ref.dimension}`);
    return {
      fieldRef: {
        field: dim.field,
        type: dim.semanticType,
        title: dim.label,
      },
      extraTransforms: [],
    };
  }
  if (ref.measure) {
    const ms = findMeasure(model, ref.measure);
    if (!ms) throw new SemanticResolutionError(`Unknown measure: ${ref.measure}`);
    return {
      fieldRef: {
        field: ms.field,
        type: 'quantitative',
        aggregate: ms.aggregate,
        title: ms.label,
        format: ms.format,
      },
      extraTransforms: [],
    };
  }
  if (ref.metric) {
    const mt = findMetric(model, ref.metric);
    if (!mt) throw new SemanticResolutionError(`Unknown metric: ${ref.metric}`);
    // Metrics compile to a Vega-Lite calculate transform producing
    // a synthetic field named after the metric id. The consumer
    // encoding then references that synthetic field.
    return {
      fieldRef: {
        field: mt.id,
        type: 'quantitative',
        title: mt.label,
        format: mt.format,
      },
      extraTransforms: [
        {
          calculate: {
            as: mt.id,
            expr: mt.formula,
          },
        },
      ],
    };
  }
  throw new SemanticResolutionError(
    'SemanticFieldRef must have exactly one of dimension / measure / metric',
  );
}

function findDimension(model: SemanticModel, id: string): Dimension | undefined {
  return model.dimensions.find((d) => d.id === id);
}
function findMeasure(model: SemanticModel, id: string): Measure | undefined {
  return model.measures.find((d) => d.id === id);
}
function findMetric(model: SemanticModel, id: string): Metric | undefined {
  return model.metrics.find((d) => d.id === id);
}

/**
 * Compile a semantic-aware ChartSpec (encoding channels that use
 * SemanticFieldRef shapes) into a raw ChartSpec that the existing
 * compileToVegaLite pipeline can consume.
 *
 * Walks spec.encoding entries; when an entry has `{ dimension/measure/metric }`
 * instead of `{ field }`, resolves it via resolveSemanticRef and
 * replaces the encoding. Accumulates any extraTransforms (metric
 * calculate steps) into the spec's transform array, deduplicating by
 * calculate.as.
 */
export function compileSemanticSpec(
  spec: ChartSpec,
  model: SemanticModel,
): ChartSpec {
  if (!spec.encoding) return spec;
  const nextEncoding: Encoding = { ...spec.encoding };
  const extraTransforms: Transform[] = [];

  for (const [channel, value] of Object.entries(spec.encoding)) {
    if (!value || typeof value !== 'object') continue;
    const semantic = value as SemanticFieldRef & FieldRef;
    if (semantic.dimension || semantic.measure || semantic.metric) {
      const resolved = resolveSemanticRef(model, {
        dimension: semantic.dimension,
        measure: semantic.measure,
        metric: semantic.metric,
      });
      (nextEncoding as Record<string, unknown>)[channel] = resolved.fieldRef;
      extraTransforms.push(...resolved.extraTransforms);
    }
  }

  if (extraTransforms.length === 0) {
    return { ...spec, encoding: nextEncoding };
  }

  // Dedupe transforms by calculate.as.
  const existing = Array.isArray(spec.transform) ? [...spec.transform] : [];
  const seen = new Set<string>();
  for (const t of existing) {
    if (t.calculate?.as) seen.add(t.calculate.as);
  }
  for (const t of extraTransforms) {
    if (t.calculate && !seen.has(t.calculate.as)) {
      existing.push(t);
      seen.add(t.calculate.as);
    }
  }
  return {
    ...spec,
    encoding: nextEncoding,
    transform: existing,
  };
}
