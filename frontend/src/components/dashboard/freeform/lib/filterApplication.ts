import type { TargetOp, SetRefMarker } from './actionTypes';
import type { DashboardSet, SetMember } from './setTypes';

export type Filter =
  | { field: string; op: 'eq'; value: string | number | boolean | null }
  | { field: string; op: 'in'; values: SetMember[] }
  | { field: string; op: 'notIn'; values: SetMember[] };

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function isSetRefMarker(v: unknown): v is SetRefMarker {
  return typeof v === 'object' && v !== null && '__setRef' in v
    && typeof (v as { __setRef: unknown }).__setRef === 'string';
}

/**
 * Convert a filter TargetOp into a Filter[] payload for /queries/execute.
 *
 * Pass the current dashboard sets so that {__setRef: id} markers expand into
 * {op: 'in', values: set.members}. Missing sets are silently dropped.
 */
export function buildAdditionalFilters(
  op: TargetOp,
  setsSnapshot: readonly DashboardSet[] = [],
): Filter[] {
  if (!op || op.kind !== 'filter') return [];
  const out: Filter[] = [];
  for (const [field, value] of Object.entries(op.filters)) {
    if (!IDENT_RE.test(field)) continue;

    if (isSetRefMarker(value)) {
      const found = setsSnapshot.find((s) => s.id === value.__setRef);
      if (!found) continue;
      out.push({ field, op: 'in', values: [...found.members] });
      continue;
    }

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
