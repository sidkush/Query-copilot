import {
  MAX_PARAM_TOKEN_LENGTH,
  MAX_SUBSTITUTED_SQL_LEN,
  type DashboardParameter,
  type ParamDomain,
  type ParamType,
  type ParamValue,
} from './parameterTypes';

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const TOKEN_RE = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/;

export class ParamSubstitutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParamSubstitutionError';
  }
}

export type NameValidation =
  | { ok: true }
  | { ok: false; reason: 'empty' | 'invalid' | 'too-long' | 'duplicate' };

/**
 * Validate a prospective parameter name. Pass `ignoreId` when renaming so
 * the param's own current name is not counted as a collision.
 */
export function validateParamName(
  name: string,
  existing: readonly DashboardParameter[],
  ignoreId?: string,
): NameValidation {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (trimmed.length === 0) return { ok: false, reason: 'empty' };
  if (trimmed.length > MAX_PARAM_TOKEN_LENGTH) return { ok: false, reason: 'too-long' };
  if (!IDENT_RE.test(trimmed)) return { ok: false, reason: 'invalid' };

  const lower = trimmed.toLowerCase();
  for (const p of existing) {
    if (ignoreId && p.id === ignoreId) continue;
    if (p.name.trim().toLowerCase() === lower) {
      return { ok: false, reason: 'duplicate' };
    }
  }
  return { ok: true };
}

/**
 * Coerce a raw user-entered value to the typed form demanded by `type`.
 * Throws when coercion is impossible (e.g. "abc" for a number parameter).
 */
export function coerceValue(type: ParamType, raw: unknown): ParamValue {
  switch (type) {
    case 'string':
      if (typeof raw === 'string') return raw;
      if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw);
      throw new ParamSubstitutionError(`Cannot coerce ${typeof raw} to string`);
    case 'number': {
      const n = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isFinite(n)) {
        throw new ParamSubstitutionError(`Cannot coerce ${String(raw)} to finite number`);
      }
      return n;
    }
    case 'boolean':
      if (typeof raw === 'boolean') return raw;
      if (typeof raw === 'string') {
        const low = raw.toLowerCase();
        if (low === 'true') return true;
        if (low === 'false') return false;
      }
      throw new ParamSubstitutionError(`Cannot coerce ${String(raw)} to boolean`);
    case 'date':
      if (typeof raw === 'string' && ISO_DATE_RE.test(raw)) return raw;
      throw new ParamSubstitutionError(`Cannot coerce ${String(raw)} to ISO-8601 date`);
  }
}

export type DomainValidation =
  | { ok: true }
  | { ok: false; error: 'not-in-list' | 'out-of-range' | 'type-mismatch' };

export function validateAgainstDomain(
  param: DashboardParameter,
  value: ParamValue,
): DomainValidation {
  const domain: ParamDomain = param.domain;
  switch (domain.kind) {
    case 'list':
      return domain.values.includes(value)
        ? { ok: true }
        : { ok: false, error: 'not-in-list' };
    case 'range':
      if (typeof value !== 'number') return { ok: false, error: 'type-mismatch' };
      return value >= domain.min && value <= domain.max
        ? { ok: true }
        : { ok: false, error: 'out-of-range' };
    case 'free':
      return { ok: true };
  }
}

function renderSqlLiteral(param: DashboardParameter): string {
  const v = param.value;
  switch (param.type) {
    case 'boolean':
      return v ? 'TRUE' : 'FALSE';
    case 'number': {
      const n = typeof v === 'number' ? v : Number(v);
      if (!Number.isFinite(n)) {
        throw new ParamSubstitutionError(
          `Parameter ${param.name}: non-finite number ${String(v)}`,
        );
      }
      return String(n);
    }
    case 'string':
    case 'date': {
      const s = typeof v === 'string' ? v : String(v);
      return `'${s.replace(/'/g, "''")}'`;
    }
  }
}

/**
 * Replace every `{{name}}` token in `sql` with the matching parameter's
 * SQL literal. Unknown token names throw. Whitespace inside the braces is
 * tolerated. Returns a new string.
 *
 * Security: the result is still passed through SQLValidator downstream.
 * Values are quoted + single-quote-escaped so they cannot escape the
 * literal context.
 */
export function substituteParamTokens(
  sql: string,
  parameters: readonly DashboardParameter[],
): string {
  if (typeof sql !== 'string' || sql.length === 0) return sql;
  if (!sql.includes('{{')) return sql;

  const byName = new Map<string, DashboardParameter>();
  for (const p of parameters) byName.set(p.name, p);

  let threw: Error | null = null;
  const replaced = sql.replace(TOKEN_RE, (_match, rawName: string) => {
    const name = rawName.trim();
    const param = byName.get(name);
    if (!param) {
      threw = new ParamSubstitutionError(`Unknown parameter token: {{${name}}}`);
      return '';
    }
    try {
      return renderSqlLiteral(param);
    } catch (err) {
      threw = err instanceof Error ? err : new ParamSubstitutionError(String(err));
      return '';
    }
  });

  if (threw) throw threw;
  if (replaced.length > MAX_SUBSTITUTED_SQL_LEN) {
    throw new ParamSubstitutionError(
      `Substituted SQL exceeds ${MAX_SUBSTITUTED_SQL_LEN} chars`,
    );
  }
  return replaced;
}
