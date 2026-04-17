import type { TargetOp } from './actionTypes';

/**
 * A single filter predicate in the shape the backend `/queries/execute`
 * endpoint understands via the `additional_filters` body field.
 */
export type Filter = {
  field: string;
  op: 'eq';
  value: string | number | boolean | null;
};

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Convert a filter TargetOp emitted by the action cascade into an array of
 * normalized Filter records. Pure. Returns [] for non-filter TargetOps.
 * `undefined` values are dropped; `null` is preserved (backend translates
 * to `IS NULL`). Field names that are not plain SQL identifiers are
 * silently dropped to keep injection safe downstream.
 */
export function buildAdditionalFilters(op: TargetOp): Filter[] {
  if (!op || op.kind !== 'filter') return [];
  const out: Filter[] = [];
  for (const [field, value] of Object.entries(op.filters)) {
    if (!IDENT_RE.test(field)) continue;
    if (value === undefined) continue;
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      out.push({ field, op: 'eq', value });
    }
  }
  return out;
}
