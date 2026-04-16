import type { UserChartType, UserChartTypeParam } from './types';

/** The highest schema version this frontend build understands. */
export const FRONTEND_MAX_SCHEMA_VERSION = 2;

/**
 * Validator for UserChartType definitions.
 *
 * Checks:
 *   - Required top-level fields (id, name, schemaVersion, parameters, specTemplate)
 *   - schemaVersion is a known version (<= FRONTEND_MAX_SCHEMA_VERSION)
 *   - Unique parameter names
 *   - Each parameter has a recognized kind
 *   - Every ${placeholder} referenced in the spec template maps to a declared parameter
 *   - specTemplate is a plain object (not a string / array / null)
 *
 * Returns ValidationResult with a list of error strings when invalid.
 * The result shape mirrors chart-ir/schema.ts's Ajv wrapper so callers
 * can use a single reporting path for built-in schema + user type
 * validation.
 */
export interface UserTypeValidationResult {
  valid: boolean;
  errors: string[];
}

const VALID_PARAM_KINDS = new Set([
  'field',
  'aggregate',
  'literal',
  'number',
  'boolean',
]);

const PLACEHOLDER_RE = /\$\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;

export function validateUserChartType(def: unknown): UserTypeValidationResult {
  const errors: string[] = [];
  if (!def || typeof def !== 'object' || Array.isArray(def)) {
    return { valid: false, errors: ['UserChartType must be a plain object'] };
  }
  const d = def as Partial<UserChartType>;

  if (typeof d.id !== 'string' || d.id.length === 0) {
    errors.push('Missing or empty id');
  }
  if (typeof d.name !== 'string' || d.name.length === 0) {
    errors.push('Missing or empty name');
  }
  if (
    typeof d.schemaVersion !== 'number' ||
    d.schemaVersion < 1 ||
    d.schemaVersion > FRONTEND_MAX_SCHEMA_VERSION
  ) {
    errors.push(
      `schemaVersion must be between 1 and ${FRONTEND_MAX_SCHEMA_VERSION}, got ${String(d.schemaVersion)}`,
    );
  }
  if (!Array.isArray(d.parameters)) {
    errors.push('parameters must be an array');
  }
  if (!d.specTemplate || typeof d.specTemplate !== 'object' || Array.isArray(d.specTemplate)) {
    errors.push('specTemplate must be a ChartSpec object');
  }

  const declaredNames = new Set<string>();
  if (Array.isArray(d.parameters)) {
    for (let i = 0; i < d.parameters.length; i++) {
      const p: unknown = d.parameters[i];
      const paramErrors = validateParameter(p, i);
      errors.push(...paramErrors);
      if (p && typeof p === 'object' && 'name' in p) {
        const name = (p as UserChartTypeParam).name;
        if (typeof name === 'string') {
          if (declaredNames.has(name)) {
            errors.push(`Duplicate parameter name: ${name}`);
          }
          declaredNames.add(name);
        }
      }
    }
  }

  if (d.specTemplate && typeof d.specTemplate === 'object' && !Array.isArray(d.specTemplate)) {
    const referenced = collectPlaceholders(d.specTemplate);
    for (const ref of referenced) {
      if (!declaredNames.has(ref)) {
        errors.push(`Spec template references undeclared parameter: \${${ref}}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

function validateParameter(p: unknown, index: number): string[] {
  const errors: string[] = [];
  if (!p || typeof p !== 'object' || Array.isArray(p)) {
    return [`parameters[${index}] must be an object`];
  }
  const param = p as Partial<UserChartTypeParam>;
  if (typeof param.name !== 'string' || param.name.length === 0) {
    errors.push(`parameters[${index}].name must be a non-empty string`);
  }
  if (typeof param.kind !== 'string' || !VALID_PARAM_KINDS.has(param.kind)) {
    errors.push(
      `parameters[${index}].kind must be one of ${Array.from(VALID_PARAM_KINDS).join(
        ', ',
      )}`,
    );
  }
  return errors;
}

/**
 * Walk an arbitrary JSON-serializable value, collecting every unique
 * `${name}` placeholder found inside string values.
 */
export function collectPlaceholders(value: unknown, out = new Set<string>()): Set<string> {
  if (value === null || value === undefined) return out;
  if (typeof value === 'string') {
    const matches = value.matchAll(PLACEHOLDER_RE);
    for (const m of matches) {
      if (m[1]) out.add(m[1]);
    }
    return out;
  }
  if (Array.isArray(value)) {
    for (const v of value) collectPlaceholders(v, out);
    return out;
  }
  if (typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) {
      collectPlaceholders(v, out);
    }
  }
  return out;
}
