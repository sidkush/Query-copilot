import type { ChartSpec } from '../types';
import type { UserChartType, InstantiateParams } from './types';

/**
 * Instantiate a UserChartType into a runnable ChartSpec.
 *
 * Walks the specTemplate deep-copying every value, replacing
 * `${paramName}` placeholders inside string values with the
 * corresponding InstantiateParams entry.
 *
 * Rules:
 *   - If the whole string equals `${name}`, the value is replaced
 *     with the raw param value (preserving type — number, boolean,
 *     etc). This is what lets e.g. `{"aggregate": "${agg}"}` emit
 *     an enum-typed aggregate.
 *   - If the string contains a placeholder inside other text, the
 *     placeholder is replaced by String(value) and the surrounding
 *     text is preserved.
 *   - Missing required params raise a runtime error. Missing
 *     optional params use the param's `default` or leave the
 *     placeholder in place (which the downstream validator will
 *     reject, surfacing a clear error).
 */
export class InstantiationError extends Error {
  constructor(
    message: string,
    public readonly typeId: string,
  ) {
    super(message);
    this.name = 'InstantiationError';
  }
}

const PLACEHOLDER_RE = /\$\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;
const FULL_PLACEHOLDER_RE = /^\$\{([a-zA-Z_][a-zA-Z0-9_]*)\}$/;

export function instantiateUserChartType(
  type: UserChartType,
  params: InstantiateParams,
): ChartSpec {
  const resolved = resolveParams(type, params);
  return deepSubstitute(type.specTemplate, resolved, type.id) as ChartSpec;
}

function resolveParams(type: UserChartType, params: InstantiateParams): InstantiateParams {
  const out: InstantiateParams = {};
  for (const p of type.parameters) {
    if (params[p.name] !== undefined) {
      out[p.name] = params[p.name];
    } else if (p.default !== undefined) {
      out[p.name] = p.default;
    } else if (p.required !== false) {
      throw new InstantiationError(
        `Missing required parameter '${p.name}' for user chart type '${type.id}'`,
        type.id,
      );
    }
  }
  return out;
}

function deepSubstitute(value: unknown, params: InstantiateParams, typeId: string): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    const fullMatch = value.match(FULL_PLACEHOLDER_RE);
    if (fullMatch && fullMatch[1] !== undefined) {
      const name = fullMatch[1];
      if (name in params) {
        return params[name];
      }
      // Unbound placeholder — leave it in place so the downstream
      // ChartSpec validator produces a readable error pointing at
      // the original template name.
      return value;
    }
    // Partial placeholder substitution via String(value).
    return value.replace(PLACEHOLDER_RE, (_match, name) => {
      if (name in params) {
        const v = params[name];
        return v === undefined ? `\${${name}}` : String(v);
      }
      return `\${${name}}`;
    });
  }
  if (Array.isArray(value)) {
    return value.map((v) => deepSubstitute(v, params, typeId));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = deepSubstitute(v, params, typeId);
    }
    return out;
  }
  return value;
}
