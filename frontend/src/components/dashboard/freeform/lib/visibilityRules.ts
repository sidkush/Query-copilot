import type {
  EvaluationContext,
  EvaluationContextSheetFilter,
  VisibilityRule,
} from './types';
import type { DashboardSet } from './setTypes';
import type { DashboardParameter } from './parameterTypes';

/**
 * In-module dedupe for missing-referent warnings. Resets across reload (HMR)
 * and is exposed to tests via __resetWarnCacheForTests.
 */
const _warned = new Set<string>();

function warnOnce(key: string, message: string): void {
  if (_warned.has(key)) return;
  _warned.add(key);
  // eslint-disable-next-line no-console
  console.warn(`[visibilityRules] ${message}`);
}

/** Test-only hook — production code must never call this. */
export function __resetWarnCacheForTests(): void {
  _warned.clear();
}

type ContextInput = {
  sets?: readonly DashboardSet[];
  parameters?: readonly DashboardParameter[];
  sheetFilters?: Readonly<Record<string, ReadonlyArray<EvaluationContextSheetFilter>>>;
};

export function buildEvaluationContext(input: ContextInput): EvaluationContext {
  return {
    sets: input.sets ?? [],
    parameters: input.parameters ?? [],
    sheetFilters: input.sheetFilters ?? {},
  };
}

/**
 * Evaluate a visibility rule against the current dashboard state.
 *
 * Contract:
 *   - undefined OR { kind: 'always' } → true
 *   - any unknown kind                → true (forward-compatible)
 *   - missing referent (set/parameter)→ true + console.warn (deduped)
 *   - hasActiveFilter missing sheet   → false (no warn — empty is normal)
 */
export function evaluateRule(
  rule: VisibilityRule | undefined,
  ctx: EvaluationContext,
): boolean {
  if (!rule) return true;
  switch (rule.kind) {
    case 'always':
      return true;
    case 'setMembership': {
      const set = ctx.sets.find((s) => s.id === rule.setId);
      if (!set) {
        warnOnce(`set:${rule.setId}`, `setMembership rule references missing set ${rule.setId}`);
        return true;
      }
      const count = Array.isArray(set.members) ? set.members.length : 0;
      return rule.mode === 'isEmpty' ? count === 0 : count > 0;
    }
    case 'parameterEquals': {
      const param = ctx.parameters.find((p) => p.id === rule.parameterId);
      if (!param) {
        warnOnce(
          `param:${rule.parameterId}`,
          `parameterEquals rule references missing parameter ${rule.parameterId}`,
        );
        return true;
      }
      return param.value === rule.value;
    }
    case 'hasActiveFilter': {
      const entry = ctx.sheetFilters[rule.sheetId];
      return Array.isArray(entry) && entry.length > 0;
    }
    default:
      return true;
  }
}
