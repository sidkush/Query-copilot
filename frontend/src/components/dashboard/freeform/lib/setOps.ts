import {
  MAX_SET_MEMBERS,
  type DashboardSet,
  type SetChangeMode,
  type SetMember,
} from './setTypes';

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function isPrimitiveMember(v: unknown): v is SetMember {
  return typeof v === 'string' || typeof v === 'number';
}

/**
 * Dedup a list of member candidates. Non-primitive entries (null, undefined,
 * objects) are dropped. Order is stable: first occurrence wins.
 */
export function dedupMembers(input: readonly unknown[]): SetMember[] {
  const seen = new Set<SetMember>();
  const out: SetMember[] = [];
  for (const v of input) {
    if (!isPrimitiveMember(v)) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

/**
 * Apply one of four mutation modes to a set. Always returns a new set object;
 * never mutates the input. Truncates at MAX_SET_MEMBERS for add/replace.
 */
export function applySetChange(
  set: DashboardSet,
  incoming: readonly unknown[],
  mode: SetChangeMode,
): DashboardSet {
  const cleanIncoming = dedupMembers(incoming);

  let nextMembers: SetMember[];
  switch (mode) {
    case 'clear':
      nextMembers = [];
      break;
    case 'replace':
      nextMembers = cleanIncoming.slice(0, MAX_SET_MEMBERS);
      break;
    case 'remove': {
      const drop = new Set<SetMember>(cleanIncoming);
      nextMembers = set.members.filter((m) => !drop.has(m));
      break;
    }
    case 'add': {
      const combined = dedupMembers([...set.members, ...cleanIncoming]);
      nextMembers = combined.slice(0, MAX_SET_MEMBERS);
      break;
    }
  }

  return { ...set, members: nextMembers };
}

/** Identifier validation — mirrors sql_filter_injector._IDENT_RE. */
export function validateDimension(dim: string): boolean {
  return typeof dim === 'string' && IDENT_RE.test(dim);
}

export type NameValidation =
  | { ok: true }
  | { ok: false; reason: 'empty' | 'duplicate' };

/**
 * Validate a prospective set name. Pass `ignoreId` when renaming so the set's
 * own current name is not counted as a collision.
 */
export function validateSetName(
  name: string,
  existing: readonly DashboardSet[],
  ignoreId?: string,
): NameValidation {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (trimmed.length === 0) return { ok: false, reason: 'empty' };
  const lower = trimmed.toLowerCase();
  for (const s of existing) {
    if (ignoreId && s.id === ignoreId) continue;
    if (s.name.trim().toLowerCase() === lower) {
      return { ok: false, reason: 'duplicate' };
    }
  }
  return { ok: true };
}
