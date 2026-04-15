import type { SemanticModel, Metric } from './types';

/**
 * Validate a SemanticModel for structural soundness.
 *
 * Checks:
 *   - Required top-level fields (id, name, version, dimensions, measures, metrics)
 *   - version === 1
 *   - Unique ids within each of dimensions / measures / metrics + globally unique
 *   - Every metric.dependencies[] entry references an existing measure
 *   - Every metric.formula is a non-empty string
 *   - Optional cyclic-dependency scan: metrics that depend on other metrics
 *     are allowed, but must not form a cycle.
 */

export interface SemanticValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateSemanticModel(model: unknown): SemanticValidationResult {
  const errors: string[] = [];
  if (!model || typeof model !== 'object' || Array.isArray(model)) {
    return { valid: false, errors: ['SemanticModel must be a plain object'] };
  }
  const m = model as Partial<SemanticModel>;

  if (typeof m.id !== 'string' || !m.id) errors.push('Missing or empty id');
  if (typeof m.name !== 'string' || !m.name) errors.push('Missing or empty name');
  if (m.version !== 1) errors.push(`version must be 1, got ${String(m.version)}`);
  if (!Array.isArray(m.dimensions)) errors.push('dimensions must be an array');
  if (!Array.isArray(m.measures)) errors.push('measures must be an array');
  if (!Array.isArray(m.metrics)) errors.push('metrics must be an array');

  const dimensionIds = new Set<string>();
  const measureIds = new Set<string>();
  const metricIds = new Set<string>();

  if (Array.isArray(m.dimensions)) {
    for (let i = 0; i < m.dimensions.length; i++) {
      const d = m.dimensions[i];
      if (!d || typeof d !== 'object') {
        errors.push(`dimensions[${i}] must be an object`);
        continue;
      }
      if (!('id' in d) || typeof d.id !== 'string' || !d.id) {
        errors.push(`dimensions[${i}].id must be a non-empty string`);
        continue;
      }
      if (dimensionIds.has(d.id)) errors.push(`Duplicate dimension id: ${d.id}`);
      dimensionIds.add(d.id);
      if (!d.field) errors.push(`dimensions[${i}].field missing`);
      if (!d.semanticType) errors.push(`dimensions[${i}].semanticType missing`);
    }
  }

  if (Array.isArray(m.measures)) {
    for (let i = 0; i < m.measures.length; i++) {
      const ms = m.measures[i];
      if (!ms || typeof ms !== 'object') {
        errors.push(`measures[${i}] must be an object`);
        continue;
      }
      if (!('id' in ms) || typeof ms.id !== 'string' || !ms.id) {
        errors.push(`measures[${i}].id must be a non-empty string`);
        continue;
      }
      if (measureIds.has(ms.id)) errors.push(`Duplicate measure id: ${ms.id}`);
      if (dimensionIds.has(ms.id)) errors.push(`measure id collides with dimension id: ${ms.id}`);
      measureIds.add(ms.id);
      if (!ms.field) errors.push(`measures[${i}].field missing`);
      if (!ms.aggregate) errors.push(`measures[${i}].aggregate missing`);
    }
  }

  if (Array.isArray(m.metrics)) {
    for (let i = 0; i < m.metrics.length; i++) {
      const mt = m.metrics[i];
      if (!mt || typeof mt !== 'object') {
        errors.push(`metrics[${i}] must be an object`);
        continue;
      }
      if (!('id' in mt) || typeof mt.id !== 'string' || !mt.id) {
        errors.push(`metrics[${i}].id must be a non-empty string`);
        continue;
      }
      if (metricIds.has(mt.id)) errors.push(`Duplicate metric id: ${mt.id}`);
      if (measureIds.has(mt.id) || dimensionIds.has(mt.id)) {
        errors.push(`metric id collides with existing measure/dimension: ${mt.id}`);
      }
      metricIds.add(mt.id);
      if (typeof mt.formula !== 'string' || !mt.formula) {
        errors.push(`metrics[${i}].formula must be a non-empty string`);
      }
      if (!Array.isArray(mt.dependencies)) {
        errors.push(`metrics[${i}].dependencies must be an array`);
        continue;
      }
      for (const dep of mt.dependencies) {
        if (typeof dep !== 'string') {
          errors.push(`metrics[${i}].dependencies contains a non-string`);
          continue;
        }
        if (!measureIds.has(dep) && !metricIds.has(dep)) {
          errors.push(
            `metrics[${i}].dependencies references unknown measure/metric: ${dep}`,
          );
        }
      }
    }
    // Cycle detection via DFS.
    if (Array.isArray(m.metrics)) {
      const metricsById: Record<string, Metric> = {};
      for (const mt of m.metrics) {
        if (mt && typeof mt === 'object' && 'id' in mt && typeof mt.id === 'string') {
          metricsById[mt.id] = mt as Metric;
        }
      }
      for (const mt of m.metrics) {
        if (!mt || typeof mt !== 'object' || !('id' in mt) || typeof mt.id !== 'string') continue;
        const cycle = findCycle(mt.id, metricsById, new Set(), new Set());
        if (cycle) {
          errors.push(`Cyclic metric dependency: ${cycle.join(' -> ')}`);
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

function findCycle(
  node: string,
  metrics: Record<string, Metric>,
  visited: Set<string>,
  stack: Set<string>,
): string[] | null {
  if (stack.has(node)) return [node];
  if (visited.has(node)) return null;
  visited.add(node);
  stack.add(node);
  const metric = metrics[node];
  if (metric) {
    for (const dep of metric.dependencies) {
      if (!metrics[dep]) continue; // measure deps aren't metrics
      const cycle = findCycle(dep, metrics, visited, stack);
      if (cycle) {
        if (cycle[0] === node) return [...cycle, node];
        return [node, ...cycle];
      }
    }
  }
  stack.delete(node);
  return null;
}
