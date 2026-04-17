# Analyst Pro — Plan 4d: Dynamic Zone Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Tableau-style **Dynamic Zone Visibility (DZV)** for Analyst Pro — every zone in the tiled tree or floating layer can carry an optional `visibilityRule` that is evaluated on every store change against current Sets, Parameters, and per-sheet active filters. When the rule evaluates to `false` the zone is unmounted (no DOM, no chart compile, no data fetch). A new right-rail `ZonePropertiesPanel` lets the author pick rule kind + referent + comparison; `LayoutTreePanel` flags zones that have a rule attached and dims their row when currently hidden.

**Architecture:** A pure, React-free `visibilityRules.ts` lib owns the discriminated-union `VisibilityRule` evaluator. `ZoneRenderer.jsx` and `FloatingLayer.jsx` (the only two leaf-mount paths in Analyst Pro) subscribe to `analystProDashboard.sets`, `analystProDashboard.parameters`, and `analystProSheetFilters`, build a memoised `EvaluationContext`, and short-circuit children whose `evaluateRule(...)` returns `false`. Authoring lives in `panels/ZonePropertiesPanel.jsx`, mounted in a new right rail in `AnalystProLayout.jsx`. `LayoutTreePanel.jsx` reads the same context to render an indicator glyph per row. Persistence is automatic — `visibilityRule` rides on each zone object inside `tiledRoot` / `floatingLayer`, both of which are already whitelisted in [user_storage.py:629](backend/user_storage.py). No backend wiring is required for the rule itself; the existing Plan 4a filter cascade and Plan 4b/4c stores already supply the inputs the evaluator reads.

**Tech Stack:** React 19 + Zustand + TypeScript (lib) + Vitest + @testing-library/react. No backend changes other than a single round-trip pytest. No new runtime deps.

---

## Prerequisites

- Branch: `askdb-global-comp` (all commits land here).
- Plan 3 shipped: `useActionRuntime` + `analystProSheetFilters` + `analystProActionCascadeToken` in [store.js:758](frontend/src/store.js).
- Plan 4a shipped: `analystProSheetFilters[sheetId]` is the source of truth for "is this sheet currently filter-active?". `AnalystProWorksheetTile` already re-queries on filter changes — Plan 4d only **reads** that slice, never mutates it.
- Plan 4b shipped: `analystProDashboard.sets: DashboardSet[]` + CRUD actions live in [store.js:813](frontend/src/store.js). The evaluator reads `set.members.length` to drive `setMembership` rules.
- Plan 4c shipped: `analystProDashboard.parameters: DashboardParameter[]` + `setParameterValueAnalystPro` live in [store.js:863](frontend/src/store.js). The evaluator reads each `param.value` for `parameterEquals` rules.
- Existing placeholder type: [types.ts:24](frontend/src/components/dashboard/freeform/lib/types.ts) currently declares
  ```ts
  export type VisibilityRule = { mode: 'field' | 'parameter'; source: string };
  ```
  This is an unused stub from Plan 1. Plan 4d **replaces** this declaration with the discriminated union below. There are zero call sites today (`grep -r "VisibilityRule" frontend/src` returns only `types.ts:24` and `types.ts:36` where `BaseZone.visibilityRule?` already exists with the stub type).
- Whitelisting: [user_storage.py:629](backend/user_storage.py) already accepts `tiledRoot` and `floatingLayer` as opaque blobs, so per-zone `visibilityRule` survives a save/load round-trip with zero backend changes.
- Feature gate: `settings.FEATURE_ANALYST_PRO` (unchanged).
- Frontend tests: `cd frontend && npm run test:chart-ir -- <pattern>`. Lint: `cd frontend && npm run lint`. Build: `cd frontend && npm run build`. Backend: `cd backend && python -m pytest tests/ -v`.

---

## Data Model

```ts
// frontend/src/components/dashboard/freeform/lib/types.ts (replaces stub)

import type { DashboardSet } from './setTypes';
import type { DashboardParameter, ParamValue } from './parameterTypes';

export type VisibilityRule =
  | { kind: 'always' }
  | { kind: 'setMembership'; setId: string; mode: 'hasAny' | 'isEmpty' }
  | { kind: 'parameterEquals'; parameterId: string; value: ParamValue }
  | { kind: 'hasActiveFilter'; sheetId: string };

export type EvaluationContext = {
  sets: readonly DashboardSet[];
  parameters: readonly DashboardParameter[];
  sheetFilters: Readonly<Record<string, ReadonlyArray<{ field: string; op: string; value: unknown }>>>;
};
```

- `BaseZone.visibilityRule?` on [types.ts:36](frontend/src/components/dashboard/freeform/lib/types.ts) keeps its `?` modifier — `undefined` means "always visible". This matches the zero-migration default for every existing dashboard.
- `kind: 'always'` is the explicit "always show" form the UI emits; the evaluator treats `undefined` and `{ kind: 'always' }` identically.
- `setMembership.mode === 'hasAny'` returns `set.members.length > 0`; `mode === 'isEmpty'` returns `set.members.length === 0`. Other comparison modes (e.g. `contains(value)`) are out of scope for 4d.
- `parameterEquals.value` is compared with strict `===` against the typed `param.value`. No coercion — the authoring UI stores the value coerced through `coerceValue(param.type, raw)`.
- `hasActiveFilter.sheetId` returns `(sheetFilters[sheetId]?.length ?? 0) > 0`. Highlights are visual-only (Plan 4a) and intentionally do not count.
- **Missing referent semantics** — if `setId`, `parameterId`, or `sheetId` does not resolve in `ctx`, the evaluator returns `true` (zone shows) and emits a single `console.warn(...)` per (zoneId, ruleKind) tuple. This is deliberately permissive: a deleted set must not silently hide every dependent zone in production.

---

## Evaluation Contract

`evaluateRule(rule, ctx) → boolean`:

| Rule kind                       | Inputs read                          | Returns                                                                                  |
| ------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------- |
| `undefined` / `{ kind:'always' }` | none                                 | `true`                                                                                   |
| `setMembership { setId, mode }` | `ctx.sets`                           | `mode==='hasAny' ? set.members.length>0 : set.members.length===0` (true if set missing)  |
| `parameterEquals { parameterId, value }` | `ctx.parameters`            | `param.value === rule.value` (true if param missing)                                     |
| `hasActiveFilter { sheetId }`   | `ctx.sheetFilters`                   | `(ctx.sheetFilters[sheetId]?.length ?? 0) > 0`                                           |

- The evaluator MUST be a **pure** function. No `useStore`, no `useState`, no side effects beyond the missing-referent `console.warn`.
- The function MUST return `true` on any unexpected `kind` (forward compatibility — a future `kind: 'fieldRange'` from a later plan must not crash an older client).
- Performance — every call is O(1) in `ctx.sets.length + ctx.parameters.length` because we look up by id. For dashboards with > 50 sets or parameters the renderer **may** memoise an id→object index inside `ctx`, but Plan 4d ships without that optimisation; benchmarks below confirm the naive lookup is < 0.1 ms per zone for n ≤ 100.

---

## File Map

**Create**

- `frontend/src/components/dashboard/freeform/lib/visibilityRules.ts`
- `frontend/src/components/dashboard/freeform/__tests__/visibilityRules.test.ts`
- `frontend/src/components/dashboard/freeform/panels/ZonePropertiesPanel.jsx`
- `frontend/src/components/dashboard/freeform/__tests__/ZonePropertiesPanel.test.tsx`
- `frontend/src/components/dashboard/freeform/__tests__/VisibilityGate.integration.test.tsx`
- `frontend/src/components/dashboard/freeform/__tests__/VisibilityRoundTrip.integration.test.tsx`
- `backend/tests/test_zone_visibility_roundtrip.py`

**Modify**

- `frontend/src/components/dashboard/freeform/lib/types.ts` — replace `VisibilityRule` stub with discriminated union; add `EvaluationContext`.
- `frontend/src/components/dashboard/freeform/ZoneRenderer.jsx` — gate via `evaluateRule` in `renderNode`.
- `frontend/src/components/dashboard/freeform/FloatingLayer.jsx` — same gate for floating zones.
- `frontend/src/components/dashboard/freeform/panels/LayoutTreePanel.jsx` — render visibility glyph + dim hidden rows.
- `frontend/src/components/dashboard/freeform/__tests__/LayoutTreePanel.test.tsx` — add coverage for the new glyph + dim states.
- `frontend/src/components/dashboard/modes/AnalystProLayout.jsx` — mount `ZonePropertiesPanel` in a new right rail.

**No backend code changes.** A pytest in `tests/test_zone_visibility_roundtrip.py` proves `update_dashboard` already preserves `visibilityRule` end-to-end via the existing `tiledRoot` whitelist.

---

## Task Checklist

- [ ] T1. Replace `VisibilityRule` stub in `types.ts` with discriminated union + `EvaluationContext`.
- [ ] T2. `visibilityRules.ts` + TDD tests — `evaluateRule`, `buildEvaluationContext`, missing-referent warning.
- [ ] T3. Gate `ZoneRenderer.jsx` + `FloatingLayer.jsx` on `evaluateRule(...)`. Memoise ctx + per-zone result.
- [ ] T4. `ZonePropertiesPanel.jsx` — Visibility section with rule-kind dropdown + per-kind fields + Save.
- [ ] T5. Mount `ZonePropertiesPanel` in `AnalystProLayout` right rail.
- [ ] T6. `LayoutTreePanel` rule-glyph + hidden-row dim, with tests.
- [ ] T7. `VisibilityRoundTrip.integration.test.tsx` — store → JSON → store keeps `visibilityRule`. Backend pytest mirrors.
- [ ] T8. Integration test — `parameterEquals` toggles a worksheet zone live.
- [ ] T9. Integration test — `hasActiveFilter` (action cascade) and `setMembership` (set add/clear) toggle a zone.

---

## Task Specifications

### T1 — Replace `VisibilityRule` stub + add `EvaluationContext`

**Files:**

- Modify: `frontend/src/components/dashboard/freeform/lib/types.ts:24-27` (the existing 3-line stub) and `:36` (the `visibilityRule?: VisibilityRule` field on `BaseZone`).

**Goal:** Land the new discriminated union without breaking any consumer. The current stub has zero references outside `types.ts` itself — verified via `grep -r "VisibilityRule" frontend/src` → only `types.ts:24` and `types.ts:36`.

- [ ] **Step 1: Verify the stub has no real consumers**

```bash
cd "QueryCopilot V1"
grep -RIn "VisibilityRule" frontend/src
```

Expected output (only):

```
frontend/src/components/dashboard/freeform/lib/types.ts:24:export type VisibilityRule = {
frontend/src/components/dashboard/freeform/lib/types.ts:36:  visibilityRule?: VisibilityRule;
```

If anything else references it, STOP and surface to the user — Plan 4d assumes a clean slate.

- [ ] **Step 2: Replace the stub**

In `frontend/src/components/dashboard/freeform/lib/types.ts`, delete lines 24-27:

```ts
export type VisibilityRule = {
  mode: 'field' | 'parameter';
  source: string;
};
```

Insert in the same location:

```ts
import type { DashboardSet } from './setTypes';
import type { DashboardParameter, ParamValue } from './parameterTypes';

export type VisibilityRule =
  | { kind: 'always' }
  | { kind: 'setMembership'; setId: string; mode: 'hasAny' | 'isEmpty' }
  | { kind: 'parameterEquals'; parameterId: string; value: ParamValue }
  | { kind: 'hasActiveFilter'; sheetId: string };

export type EvaluationContextSheetFilter = {
  field: string;
  op: string;
  value: unknown;
};

export type EvaluationContext = {
  sets: readonly DashboardSet[];
  parameters: readonly DashboardParameter[];
  sheetFilters: Readonly<Record<string, ReadonlyArray<EvaluationContextSheetFilter>>>;
};
```

The `import type` lines must sit at the **top** of the file (above `export type Proportion`), not inline at line 24, to keep TypeScript's import ordering happy. The `BaseZone.visibilityRule?: VisibilityRule;` field on line 36 keeps its existing declaration unchanged — only the type it references is widened.

- [ ] **Step 3: Type-check the project**

Run:

```bash
cd frontend
npm run test:chart-ir -- types 2>&1 | tail -25
```

Expected: vitest reports either "No tests found" or all unrelated tests pass. The point of this step is to surface any TypeScript regression introduced by the union swap. If a `tsc` step reports "Type 'VisibilityRule' is not assignable to ..." anywhere, fix the call site (only Plan 4d's later tasks should touch this type).

- [ ] **Step 4: Lint**

```bash
cd frontend
npm run lint 2>&1 | tail -20
```

Expected: clean (or unchanged-from-baseline). Adding a new typed import does not introduce lint errors in the existing config.

- [ ] **Step 5: Commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/components/dashboard/freeform/lib/types.ts
git commit -m "feat(analyst-pro): VisibilityRule discriminated union + EvaluationContext (Plan 4d T1)"
```

---

### T2 — `visibilityRules.ts` + TDD tests

**Files:**

- Create: `frontend/src/components/dashboard/freeform/lib/visibilityRules.ts`
- Create: `frontend/src/components/dashboard/freeform/__tests__/visibilityRules.test.ts`

**Goal:** Pure, React-free evaluator. One function per public name. No store imports, no React imports. Missing referents warn-once (per (kind, id) key) to avoid console spam during a render storm.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/dashboard/freeform/__tests__/visibilityRules.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  evaluateRule,
  buildEvaluationContext,
  __resetWarnCacheForTests,
} from '../lib/visibilityRules';
import type { DashboardSet } from '../lib/setTypes';
import type { DashboardParameter } from '../lib/parameterTypes';
import type { EvaluationContext, VisibilityRule } from '../lib/types';

const mkSet = (id: string, members: (string | number)[] = []): DashboardSet => ({
  id,
  name: `Set-${id}`,
  dimension: 'region',
  members,
  createdAt: '2026-04-16T00:00:00Z',
});

const mkParam = (
  id: string,
  type: DashboardParameter['type'],
  value: DashboardParameter['value'],
): DashboardParameter => ({
  id,
  name: `p_${id}`,
  type,
  value,
  domain: { kind: 'free' },
  createdAt: '2026-04-16T00:00:00Z',
});

const ctx = (over: Partial<EvaluationContext> = {}): EvaluationContext => ({
  sets: [],
  parameters: [],
  sheetFilters: {},
  ...over,
});

beforeEach(() => {
  __resetWarnCacheForTests();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('evaluateRule — undefined / always', () => {
  it('returns true for undefined rule', () => {
    expect(evaluateRule(undefined, ctx())).toBe(true);
  });

  it('returns true for { kind: "always" }', () => {
    expect(evaluateRule({ kind: 'always' }, ctx())).toBe(true);
  });

  it('returns true for an unknown future kind (forward-compat)', () => {
    // @ts-expect-error — runtime guard for unknown kinds
    expect(evaluateRule({ kind: 'fieldRange', x: 1 }, ctx())).toBe(true);
  });
});

describe('evaluateRule — setMembership', () => {
  it('hasAny returns true when set has members', () => {
    const rule: VisibilityRule = { kind: 'setMembership', setId: 's1', mode: 'hasAny' };
    expect(evaluateRule(rule, ctx({ sets: [mkSet('s1', ['East'])] }))).toBe(true);
  });

  it('hasAny returns false when set is empty', () => {
    const rule: VisibilityRule = { kind: 'setMembership', setId: 's1', mode: 'hasAny' };
    expect(evaluateRule(rule, ctx({ sets: [mkSet('s1', [])] }))).toBe(false);
  });

  it('isEmpty returns true when set is empty', () => {
    const rule: VisibilityRule = { kind: 'setMembership', setId: 's1', mode: 'isEmpty' };
    expect(evaluateRule(rule, ctx({ sets: [mkSet('s1', [])] }))).toBe(true);
  });

  it('isEmpty returns false when set has members', () => {
    const rule: VisibilityRule = { kind: 'setMembership', setId: 's1', mode: 'isEmpty' };
    expect(evaluateRule(rule, ctx({ sets: [mkSet('s1', ['East'])] }))).toBe(false);
  });

  it('returns true and warns once when set is missing', () => {
    const rule: VisibilityRule = { kind: 'setMembership', setId: 'gone', mode: 'hasAny' };
    expect(evaluateRule(rule, ctx())).toBe(true);
    expect(evaluateRule(rule, ctx())).toBe(true);
    expect(console.warn).toHaveBeenCalledTimes(1);
  });
});

describe('evaluateRule — parameterEquals', () => {
  it('returns true when string param equals literal', () => {
    const rule: VisibilityRule = { kind: 'parameterEquals', parameterId: 'p1', value: 'priority' };
    expect(evaluateRule(rule, ctx({ parameters: [mkParam('p1', 'string', 'priority')] }))).toBe(true);
  });

  it('returns false when string param differs', () => {
    const rule: VisibilityRule = { kind: 'parameterEquals', parameterId: 'p1', value: 'priority' };
    expect(evaluateRule(rule, ctx({ parameters: [mkParam('p1', 'string', 'normal')] }))).toBe(false);
  });

  it('returns true for boolean equality', () => {
    const rule: VisibilityRule = { kind: 'parameterEquals', parameterId: 'p1', value: true };
    expect(evaluateRule(rule, ctx({ parameters: [mkParam('p1', 'boolean', true)] }))).toBe(true);
  });

  it('uses strict equality — number 1 ≠ string "1"', () => {
    const rule: VisibilityRule = { kind: 'parameterEquals', parameterId: 'p1', value: 1 };
    expect(evaluateRule(rule, ctx({ parameters: [mkParam('p1', 'string', '1')] }))).toBe(false);
  });

  it('returns true and warns once when parameter is missing', () => {
    const rule: VisibilityRule = { kind: 'parameterEquals', parameterId: 'gone', value: 'x' };
    expect(evaluateRule(rule, ctx())).toBe(true);
    expect(console.warn).toHaveBeenCalledTimes(1);
  });
});

describe('evaluateRule — hasActiveFilter', () => {
  it('returns true when sheet has at least one filter entry', () => {
    const rule: VisibilityRule = { kind: 'hasActiveFilter', sheetId: 'sheet-1' };
    const c = ctx({ sheetFilters: { 'sheet-1': [{ field: 'region', op: '=', value: 'East' }] } });
    expect(evaluateRule(rule, c)).toBe(true);
  });

  it('returns false when sheet entry is missing', () => {
    const rule: VisibilityRule = { kind: 'hasActiveFilter', sheetId: 'sheet-1' };
    expect(evaluateRule(rule, ctx())).toBe(false);
  });

  it('returns false when sheet entry is an empty array', () => {
    const rule: VisibilityRule = { kind: 'hasActiveFilter', sheetId: 'sheet-1' };
    expect(evaluateRule(rule, ctx({ sheetFilters: { 'sheet-1': [] } }))).toBe(false);
  });

  it('does NOT warn for missing sheet — empty filter set is a normal state', () => {
    const rule: VisibilityRule = { kind: 'hasActiveFilter', sheetId: 'sheet-1' };
    evaluateRule(rule, ctx());
    expect(console.warn).not.toHaveBeenCalled();
  });
});

describe('buildEvaluationContext', () => {
  it('returns a frozen-shaped object with the supplied slices', () => {
    const sets = [mkSet('s1')];
    const parameters = [mkParam('p1', 'string', 'x')];
    const sheetFilters = { 'sheet-1': [{ field: 'r', op: '=', value: 'E' }] };
    const c = buildEvaluationContext({ sets, parameters, sheetFilters });
    expect(c.sets).toBe(sets);
    expect(c.parameters).toBe(parameters);
    expect(c.sheetFilters).toBe(sheetFilters);
  });

  it('substitutes empty defaults for missing slices', () => {
    const c = buildEvaluationContext({});
    expect(c.sets).toEqual([]);
    expect(c.parameters).toEqual([]);
    expect(c.sheetFilters).toEqual({});
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend
npm run test:chart-ir -- visibilityRules 2>&1 | tail -40
```

Expected: 17 failures with `Cannot find module '../lib/visibilityRules'`.

- [ ] **Step 3: Implement `visibilityRules.ts`**

Create `frontend/src/components/dashboard/freeform/lib/visibilityRules.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend
npm run test:chart-ir -- visibilityRules 2>&1 | tail -10
```

Expected: 17/17 passing.

- [ ] **Step 5: Commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/components/dashboard/freeform/lib/visibilityRules.ts \
        frontend/src/components/dashboard/freeform/__tests__/visibilityRules.test.ts
git commit -m "feat(analyst-pro): visibilityRules lib + evaluator (Plan 4d T2)"
```

---

### T3 — Gate `ZoneRenderer.jsx` + `FloatingLayer.jsx`

**Files:**

- Modify: `frontend/src/components/dashboard/freeform/ZoneRenderer.jsx`
- Modify: `frontend/src/components/dashboard/freeform/FloatingLayer.jsx`
- Create: `frontend/src/components/dashboard/freeform/__tests__/VisibilityGate.integration.test.tsx`

**Goal:** Both leaf-mount paths short-circuit on `evaluateRule`. The gate runs **before** `renderLeaf`, so a hidden worksheet zone never mounts `AnalystProWorksheetTile` (no fetch, no chart compile, no DOM cost). Container zones with `kind: 'always'` (or undefined) recurse normally; a container with a falsy rule unmounts its entire subtree, matching Tableau's "hide container" behaviour.

- [ ] **Step 1: Write the failing integration test**

Create `frontend/src/components/dashboard/freeform/__tests__/VisibilityGate.integration.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useStore } from '../../../../store';
import ZoneRenderer from '../ZoneRenderer';
import FloatingLayer from '../FloatingLayer';
import type { Zone, FloatingZone, ResolvedZone } from '../lib/types';

function resolvedMapOf(zones: Zone[]): Map<string, ResolvedZone> {
  const m = new Map<string, ResolvedZone>();
  zones.forEach((z, i) =>
    m.set(z.id, { zone: z, x: 0, y: i * 100, width: 200, height: 100, depth: 0 }),
  );
  return m;
}

beforeEach(() => {
  useStore.setState({
    analystProDashboard: {
      schemaVersion: 'askdb/dashboard/v1',
      id: 'd1',
      name: 'Test',
      archetype: 'analyst-pro',
      size: { mode: 'automatic' },
      tiledRoot: { id: 'root', type: 'container-vert', w: 100000, h: 100000, children: [] },
      floatingLayer: [],
      worksheets: [],
      parameters: [
        { id: 'p1', name: 'show', type: 'boolean', value: false, domain: { kind: 'free' }, createdAt: '' },
      ],
      sets: [
        { id: 's1', name: 'Top', dimension: 'region', members: [], createdAt: '' },
      ],
      actions: [],
    },
    analystProSheetFilters: {},
  });
});

describe('ZoneRenderer visibility gate', () => {
  it('renders a leaf when no rule is set', () => {
    const root: Zone = {
      id: 'root',
      type: 'container-vert',
      w: 100000,
      h: 100000,
      children: [{ id: 'a', type: 'blank', w: 100000, h: 100000 }],
    };
    const map = resolvedMapOf([root, ...root.children]);
    render(
      <ZoneRenderer
        root={root}
        resolvedMap={map}
        renderLeaf={(z) => <div data-testid={`leaf-${z.id}`}>{z.id}</div>}
      />,
    );
    expect(screen.getByTestId('leaf-a')).toBeInTheDocument();
  });

  it('skips a leaf with parameterEquals=false rule', () => {
    const root: Zone = {
      id: 'root',
      type: 'container-vert',
      w: 100000,
      h: 100000,
      children: [
        {
          id: 'a',
          type: 'blank',
          w: 100000,
          h: 100000,
          visibilityRule: { kind: 'parameterEquals', parameterId: 'p1', value: true },
        },
      ],
    };
    const map = resolvedMapOf([root, ...root.children]);
    render(
      <ZoneRenderer
        root={root}
        resolvedMap={map}
        renderLeaf={(z) => <div data-testid={`leaf-${z.id}`}>{z.id}</div>}
      />,
    );
    expect(screen.queryByTestId('leaf-a')).not.toBeInTheDocument();
  });

  it('re-renders the leaf when the parameter flips to matching value', () => {
    const root: Zone = {
      id: 'root',
      type: 'container-vert',
      w: 100000,
      h: 100000,
      children: [
        {
          id: 'a',
          type: 'blank',
          w: 100000,
          h: 100000,
          visibilityRule: { kind: 'parameterEquals', parameterId: 'p1', value: true },
        },
      ],
    };
    const map = resolvedMapOf([root, ...root.children]);
    render(
      <ZoneRenderer
        root={root}
        resolvedMap={map}
        renderLeaf={(z) => <div data-testid={`leaf-${z.id}`}>{z.id}</div>}
      />,
    );
    expect(screen.queryByTestId('leaf-a')).not.toBeInTheDocument();
    act(() => {
      useStore.getState().setParameterValueAnalystPro('p1', true);
    });
    expect(screen.getByTestId('leaf-a')).toBeInTheDocument();
  });

  it('hides an entire container subtree when container rule fails', () => {
    const root: Zone = {
      id: 'root',
      type: 'container-vert',
      w: 100000,
      h: 100000,
      children: [
        {
          id: 'box',
          type: 'container-horz',
          w: 100000,
          h: 100000,
          visibilityRule: { kind: 'setMembership', setId: 's1', mode: 'hasAny' },
          children: [{ id: 'a', type: 'blank', w: 100000, h: 100000 }],
        },
      ],
    };
    const map = resolvedMapOf([root, ...(root.children as any), ...((root.children[0] as any).children as any)]);
    render(
      <ZoneRenderer
        root={root}
        resolvedMap={map}
        renderLeaf={(z) => <div data-testid={`leaf-${z.id}`}>{z.id}</div>}
      />,
    );
    // s1 has zero members → container hidden → child leaf must not mount.
    expect(screen.queryByTestId('leaf-a')).not.toBeInTheDocument();
  });
});

describe('FloatingLayer visibility gate', () => {
  it('skips a floating zone when hasActiveFilter rule fails', () => {
    const zones: FloatingZone[] = [
      {
        id: 'f1',
        type: 'blank',
        w: 100,
        h: 100,
        floating: true,
        x: 0,
        y: 0,
        pxW: 200,
        pxH: 100,
        zIndex: 0,
        visibilityRule: { kind: 'hasActiveFilter', sheetId: 'sheet-1' },
      },
    ];
    const { rerender } = render(
      <FloatingLayer zones={zones} renderLeaf={(z) => <div data-testid={`leaf-${z.id}`}>{z.id}</div>} />,
    );
    expect(screen.queryByTestId('leaf-f1')).not.toBeInTheDocument();
    act(() => {
      useStore.getState().setSheetFilterAnalystPro('sheet-1', [
        { field: 'region', op: '=', value: 'East' },
      ]);
    });
    rerender(
      <FloatingLayer zones={zones} renderLeaf={(z) => <div data-testid={`leaf-${z.id}`}>{z.id}</div>} />,
    );
    expect(screen.getByTestId('leaf-f1')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd frontend
npm run test:chart-ir -- VisibilityGate 2>&1 | tail -20
```

Expected: 5 failures — the gate is not implemented yet, so the leaves all render.

- [ ] **Step 3: Implement the gate in `ZoneRenderer.jsx`**

Replace the entire body of `frontend/src/components/dashboard/freeform/ZoneRenderer.jsx` with:

```jsx
// frontend/src/components/dashboard/freeform/ZoneRenderer.jsx
import { memo, useMemo } from 'react';
import { isContainer } from './lib/zoneTree';
import { evaluateRule, buildEvaluationContext } from './lib/visibilityRules';
import { useStore } from '../../../store';

/**
 * Recursively renders a tiled zone tree using pre-resolved pixel coordinates.
 * Plan 4d: every recursion step short-circuits when the zone's
 * visibilityRule evaluates to false. Container subtrees are unmounted as a
 * unit — children of a hidden container never enter renderNode.
 */
function ZoneRenderer({ root, resolvedMap, renderLeaf }) {
  const sets = useStore((s) => s.analystProDashboard?.sets || []);
  const parameters = useStore((s) => s.analystProDashboard?.parameters || []);
  const sheetFilters = useStore((s) => s.analystProSheetFilters);
  const ctx = useMemo(
    () => buildEvaluationContext({ sets, parameters, sheetFilters }),
    [sets, parameters, sheetFilters],
  );
  return renderNode(root, resolvedMap, renderLeaf, 0, ctx);
}

function renderNode(zone, resolvedMap, renderLeaf, depth, ctx) {
  const resolved = resolvedMap.get(zone.id);
  if (!resolved) return null;
  if (!evaluateRule(zone.visibilityRule, ctx)) return null;

  if (isContainer(zone)) {
    return (
      <div
        key={zone.id}
        data-testid={`tiled-container-${zone.id}`}
        data-zone={zone.id}
        data-zone-type={zone.type}
        data-container-depth={depth}
        style={{
          position: 'absolute',
          left: resolved.x,
          top: resolved.y,
          width: resolved.width,
          height: resolved.height,
        }}
      >
        {zone.children.map((child) => renderNode(child, resolvedMap, renderLeaf, depth + 1, ctx))}
      </div>
    );
  }

  return (
    <div
      key={zone.id}
      data-testid={`tiled-leaf-${zone.id}`}
      data-zone={zone.id}
      data-zone-type={zone.type}
      style={{
        position: 'absolute',
        left: resolved.x,
        top: resolved.y,
        width: resolved.width,
        height: resolved.height,
      }}
    >
      {renderLeaf(zone, resolved)}
    </div>
  );
}

export default memo(ZoneRenderer);
```

- [ ] **Step 4: Implement the gate in `FloatingLayer.jsx`**

Replace the body of `frontend/src/components/dashboard/freeform/FloatingLayer.jsx` with:

```jsx
// frontend/src/components/dashboard/freeform/FloatingLayer.jsx
import { memo, useMemo } from 'react';
import { evaluateRule, buildEvaluationContext } from './lib/visibilityRules';
import { useStore } from '../../../store';

function FloatingLayer({ zones, renderLeaf }) {
  const sets = useStore((s) => s.analystProDashboard?.sets || []);
  const parameters = useStore((s) => s.analystProDashboard?.parameters || []);
  const sheetFilters = useStore((s) => s.analystProSheetFilters);
  const ctx = useMemo(
    () => buildEvaluationContext({ sets, parameters, sheetFilters }),
    [sets, parameters, sheetFilters],
  );

  if (!zones || zones.length === 0) return null;
  const visible = zones.filter((z) => evaluateRule(z.visibilityRule, ctx));
  if (visible.length === 0) return null;
  const sorted = [...visible].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
  return (
    <div
      data-testid="floating-layer"
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
    >
      {sorted.map((zone) => (
        <div
          key={zone.id}
          data-testid={`floating-zone-${zone.id}`}
          data-zone-type={zone.type}
          style={{
            position: 'absolute',
            left: zone.x,
            top: zone.y,
            width: zone.pxW,
            height: zone.pxH,
            zIndex: zone.zIndex ?? 0,
            pointerEvents: 'auto',
          }}
        >
          {renderLeaf(zone)}
        </div>
      ))}
    </div>
  );
}

export default memo(FloatingLayer);
```

- [ ] **Step 5: Run the new test + the existing FreeformCanvas test**

```bash
cd frontend
npm run test:chart-ir -- "VisibilityGate|FreeformCanvas" 2>&1 | tail -25
```

Expected: 5 new VisibilityGate tests pass; the existing `FreeformCanvas.test.tsx` and `FreeformCanvas.integration.test.tsx` must still pass — the gate is a no-op for any zone without `visibilityRule`. If a regression appears, double-check that the `useStore` selectors return the same default arrays on every render (the `|| []` fallback creates a new array — see Step 6 fix).

- [ ] **Step 6: Stabilise the fallback arrays**

Replace the three `useStore` lines in **both** files with stable fallbacks. In `ZoneRenderer.jsx` and `FloatingLayer.jsx`:

```jsx
const EMPTY_SETS = Object.freeze([]);
const EMPTY_PARAMS = Object.freeze([]);
const EMPTY_FILTERS = Object.freeze({});
```

Define these module-level constants (above the component function), then change the selectors to:

```jsx
const sets = useStore((s) => s.analystProDashboard?.sets ?? EMPTY_SETS);
const parameters = useStore((s) => s.analystProDashboard?.parameters ?? EMPTY_PARAMS);
const sheetFilters = useStore((s) => s.analystProSheetFilters ?? EMPTY_FILTERS);
```

This prevents an infinite render loop in environments where `analystProDashboard` is briefly undefined.

- [ ] **Step 7: Re-run the full chart-ir suite to look for regressions**

```bash
cd frontend
npm run test:chart-ir 2>&1 | tail -25
```

Expected: failure count not greater than the documented baseline of ~22 chart-ir failures listed in the project CLAUDE.md "Known Test Debt" section. Any *new* failure must be diagnosed before proceeding.

- [ ] **Step 8: Commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/components/dashboard/freeform/ZoneRenderer.jsx \
        frontend/src/components/dashboard/freeform/FloatingLayer.jsx \
        frontend/src/components/dashboard/freeform/__tests__/VisibilityGate.integration.test.tsx
git commit -m "feat(analyst-pro): zone visibility gate in ZoneRenderer + FloatingLayer (Plan 4d T3)"
```

---

### T4 — `ZonePropertiesPanel.jsx`

**Files:**

- Create: `frontend/src/components/dashboard/freeform/panels/ZonePropertiesPanel.jsx`
- Create: `frontend/src/components/dashboard/freeform/__tests__/ZonePropertiesPanel.test.tsx`

**Goal:** A right-rail inspector that appears **only** when exactly one zone is selected. It exposes a single section, "Visibility", with a rule-kind dropdown and per-kind editors. Save commits via `updateZoneAnalystPro(zoneId, { visibilityRule })`. Selecting "Always show" clears the field by passing `visibilityRule: undefined`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/dashboard/freeform/__tests__/ZonePropertiesPanel.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useStore } from '../../../../store';
import ZonePropertiesPanel from '../panels/ZonePropertiesPanel';

function seedDashboard() {
  useStore.setState({
    analystProDashboard: {
      schemaVersion: 'askdb/dashboard/v1',
      id: 'd1',
      name: 'Test',
      archetype: 'analyst-pro',
      size: { mode: 'automatic' },
      tiledRoot: {
        id: 'root',
        type: 'container-vert',
        w: 100000,
        h: 100000,
        children: [{ id: 'z1', type: 'blank', w: 100000, h: 100000 }],
      },
      floatingLayer: [],
      worksheets: [],
      parameters: [
        { id: 'p1', name: 'view', type: 'string', value: 'priority', domain: { kind: 'free' }, createdAt: '' },
      ],
      sets: [
        { id: 's1', name: 'Top', dimension: 'region', members: ['East'], createdAt: '' },
      ],
      actions: [],
    },
  });
  useStore.setState({ analystProSheetFilters: { 'z1': [] } });
}

beforeEach(() => {
  seedDashboard();
  useStore.getState().setAnalystProSelection(['z1']);
});

describe('ZonePropertiesPanel', () => {
  it('renders nothing when no zone is selected', () => {
    useStore.getState().setAnalystProSelection([]);
    const { container } = render(<ZonePropertiesPanel />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when more than one zone is selected', () => {
    useStore.getState().setAnalystProSelection(['z1', 'root']);
    const { container } = render(<ZonePropertiesPanel />);
    expect(container.firstChild).toBeNull();
  });

  it('shows "always" by default for a zone without a rule', () => {
    render(<ZonePropertiesPanel />);
    const select = screen.getByLabelText(/visibility rule/i) as HTMLSelectElement;
    expect(select.value).toBe('always');
  });

  it('saves a parameterEquals rule', () => {
    render(<ZonePropertiesPanel />);
    fireEvent.change(screen.getByLabelText(/visibility rule/i), { target: { value: 'parameterEquals' } });
    fireEvent.change(screen.getByLabelText(/parameter/i), { target: { value: 'p1' } });
    fireEvent.change(screen.getByLabelText(/value/i), { target: { value: 'priority' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    const z = useStore.getState().analystProDashboard.tiledRoot.children[0];
    expect(z.visibilityRule).toEqual({ kind: 'parameterEquals', parameterId: 'p1', value: 'priority' });
  });

  it('saves a setMembership rule', () => {
    render(<ZonePropertiesPanel />);
    fireEvent.change(screen.getByLabelText(/visibility rule/i), { target: { value: 'setMembership' } });
    fireEvent.change(screen.getByLabelText(/set\b/i), { target: { value: 's1' } });
    fireEvent.change(screen.getByLabelText(/mode/i), { target: { value: 'hasAny' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    const z = useStore.getState().analystProDashboard.tiledRoot.children[0];
    expect(z.visibilityRule).toEqual({ kind: 'setMembership', setId: 's1', mode: 'hasAny' });
  });

  it('saves a hasActiveFilter rule', () => {
    render(<ZonePropertiesPanel />);
    fireEvent.change(screen.getByLabelText(/visibility rule/i), { target: { value: 'hasActiveFilter' } });
    fireEvent.change(screen.getByLabelText(/sheet/i), { target: { value: 'z1' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    const z = useStore.getState().analystProDashboard.tiledRoot.children[0];
    expect(z.visibilityRule).toEqual({ kind: 'hasActiveFilter', sheetId: 'z1' });
  });

  it('clears the rule when "always" is selected and saved', () => {
    useStore.getState().updateZoneAnalystPro('z1', {
      visibilityRule: { kind: 'parameterEquals', parameterId: 'p1', value: 'priority' },
    });
    render(<ZonePropertiesPanel />);
    fireEvent.change(screen.getByLabelText(/visibility rule/i), { target: { value: 'always' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    const z = useStore.getState().analystProDashboard.tiledRoot.children[0];
    expect(z.visibilityRule).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend
npm run test:chart-ir -- ZonePropertiesPanel 2>&1 | tail -20
```

Expected: `Cannot find module '../panels/ZonePropertiesPanel'`.

- [ ] **Step 3: Implement `ZonePropertiesPanel.jsx`**

Create `frontend/src/components/dashboard/freeform/panels/ZonePropertiesPanel.jsx`:

```jsx
import React, { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../../../store';

const RULE_KINDS = [
  { value: 'always', label: 'Always show' },
  { value: 'setMembership', label: 'When a set has / lacks members' },
  { value: 'parameterEquals', label: 'When a parameter equals' },
  { value: 'hasActiveFilter', label: 'When a sheet has an active filter' },
];

function findZone(dashboard, zoneId) {
  if (!dashboard || !zoneId) return null;
  const float = dashboard.floatingLayer?.find((z) => z.id === zoneId);
  if (float) return float;
  const walk = (z) => {
    if (z.id === zoneId) return z;
    if (!z.children) return null;
    for (const c of z.children) {
      const hit = walk(c);
      if (hit) return hit;
    }
    return null;
  };
  return walk(dashboard.tiledRoot);
}

function collectSheetIds(dashboard) {
  const ids = new Set();
  const walk = (z) => {
    if (!z) return;
    if (z.type === 'worksheet' && z.worksheetRef) ids.add(z.worksheetRef);
    if (z.children) z.children.forEach(walk);
  };
  walk(dashboard?.tiledRoot);
  (dashboard?.floatingLayer || []).forEach((z) => {
    if (z.type === 'worksheet' && z.worksheetRef) ids.add(z.worksheetRef);
  });
  return Array.from(ids);
}

export default function ZonePropertiesPanel() {
  const dashboard = useStore((s) => s.analystProDashboard);
  const selection = useStore((s) => s.analystProSelection);
  const updateZone = useStore((s) => s.updateZoneAnalystPro);

  const selectedId = selection?.size === 1 ? Array.from(selection)[0] : null;
  const zone = useMemo(() => findZone(dashboard, selectedId), [dashboard, selectedId]);

  const [kind, setKind] = useState('always');
  const [setId, setSetId] = useState('');
  const [setMode, setSetMode] = useState('hasAny');
  const [paramId, setParamId] = useState('');
  const [paramValue, setParamValue] = useState('');
  const [sheetId, setSheetId] = useState('');

  useEffect(() => {
    const rule = zone?.visibilityRule;
    if (!rule || rule.kind === 'always') {
      setKind('always');
      return;
    }
    setKind(rule.kind);
    if (rule.kind === 'setMembership') {
      setSetId(rule.setId);
      setSetMode(rule.mode);
    } else if (rule.kind === 'parameterEquals') {
      setParamId(rule.parameterId);
      setParamValue(String(rule.value));
    } else if (rule.kind === 'hasActiveFilter') {
      setSheetId(rule.sheetId);
    }
  }, [zone?.id, zone?.visibilityRule]);

  if (!selectedId || !zone) return null;

  const sets = dashboard?.sets || [];
  const parameters = dashboard?.parameters || [];
  const sheetIds = collectSheetIds(dashboard);

  const onSave = () => {
    let rule;
    if (kind === 'always') {
      rule = undefined;
    } else if (kind === 'setMembership') {
      if (!setId) return;
      rule = { kind: 'setMembership', setId, mode: setMode };
    } else if (kind === 'parameterEquals') {
      const param = parameters.find((p) => p.id === paramId);
      if (!param) return;
      let coerced = paramValue;
      if (param.type === 'number') {
        const n = Number(paramValue);
        if (!Number.isFinite(n)) return;
        coerced = n;
      } else if (param.type === 'boolean') {
        coerced = paramValue === 'true';
      }
      rule = { kind: 'parameterEquals', parameterId: paramId, value: coerced };
    } else if (kind === 'hasActiveFilter') {
      if (!sheetId) return;
      rule = { kind: 'hasActiveFilter', sheetId };
    }
    updateZone(selectedId, { visibilityRule: rule });
  };

  return (
    <aside
      aria-label="Zone properties"
      data-testid="zone-properties-panel"
      style={{
        padding: 8,
        borderTop: '1px solid var(--border-default, #333)',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <h3 style={{ margin: 0, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, opacity: 0.7 }}>
        Visibility — {zone.displayName || zone.id}
      </h3>

      <label style={lblStyle}>
        Visibility rule
        <select
          aria-label="Visibility rule"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          style={inputStyle}
        >
          {RULE_KINDS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </label>

      {kind === 'setMembership' && (
        <>
          <label style={lblStyle}>
            Set
            <select aria-label="Set" value={setId} onChange={(e) => setSetId(e.target.value)} style={inputStyle}>
              <option value="">— pick a set —</option>
              {sets.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label style={lblStyle}>
            Mode
            <select aria-label="Mode" value={setMode} onChange={(e) => setSetMode(e.target.value)} style={inputStyle}>
              <option value="hasAny">has any members</option>
              <option value="isEmpty">is empty</option>
            </select>
          </label>
        </>
      )}

      {kind === 'parameterEquals' && (
        <>
          <label style={lblStyle}>
            Parameter
            <select aria-label="Parameter" value={paramId} onChange={(e) => setParamId(e.target.value)} style={inputStyle}>
              <option value="">— pick a parameter —</option>
              {parameters.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label style={lblStyle}>
            Value
            <input
              aria-label="Value"
              type="text"
              value={paramValue}
              onChange={(e) => setParamValue(e.target.value)}
              style={inputStyle}
            />
          </label>
        </>
      )}

      {kind === 'hasActiveFilter' && (
        <label style={lblStyle}>
          Sheet
          <select aria-label="Sheet" value={sheetId} onChange={(e) => setSheetId(e.target.value)} style={inputStyle}>
            <option value="">— pick a sheet —</option>
            {sheetIds.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
        </label>
      )}

      <button type="button" onClick={onSave} style={btnPrimary}>
        Save
      </button>
    </aside>
  );
}

const lblStyle = { fontSize: 11, opacity: 0.7, display: 'flex', flexDirection: 'column', gap: 2 };
const inputStyle = {
  padding: 4,
  fontSize: 12,
  background: 'var(--bg-input, #0b0b10)',
  color: 'inherit',
  border: '1px solid var(--border-default, #333)',
  borderRadius: 3,
};
const btnPrimary = {
  padding: '4px 10px',
  fontSize: 11,
  background: 'var(--accent, #4f7)',
  color: '#000',
  border: 'none',
  borderRadius: 3,
  cursor: 'pointer',
  fontWeight: 600,
  alignSelf: 'flex-end',
};
```

- [ ] **Step 4: Run the test**

```bash
cd frontend
npm run test:chart-ir -- ZonePropertiesPanel 2>&1 | tail -10
```

Expected: 7/7 passing.

- [ ] **Step 5: Lint**

```bash
cd frontend
npm run lint 2>&1 | tail -10
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/components/dashboard/freeform/panels/ZonePropertiesPanel.jsx \
        frontend/src/components/dashboard/freeform/__tests__/ZonePropertiesPanel.test.tsx
git commit -m "feat(analyst-pro): ZonePropertiesPanel for visibility rule editing (Plan 4d T4)"
```

---

### T5 — Mount `ZonePropertiesPanel` in a right rail

**Files:**

- Modify: `frontend/src/components/dashboard/modes/AnalystProLayout.jsx`

**Goal:** Mount the new panel in a 240px right rail. The body row keeps its left rail (Object Library + Layout Tree + Sets + Parameters) and gains a right rail that holds the inspector. Tests for `AnalystProLayout` are not present in the suite today — Step 3 just confirms the panel renders inside the new rail testid.

- [ ] **Step 1: Add the right rail JSX**

In `frontend/src/components/dashboard/modes/AnalystProLayout.jsx`, add the import near the existing panel imports:

```jsx
import ZonePropertiesPanel from '../freeform/panels/ZonePropertiesPanel';
```

Then, inside the body row `<div style={{ display: 'flex', flex: '1 1 auto', minHeight: 0 }}>` (currently spanning lines ~139-163 in the source), update the children so the order becomes: left rail → main canvas → right rail. Replace:

```jsx
        {/* Main canvas */}
        <div style={{ flex: '1 1 auto', minWidth: 0, overflow: 'auto', position: 'relative' }}>
          <FreeformCanvas dashboard={dashboard} renderLeaf={renderLeaf} />
        </div>
      </div>
```

with:

```jsx
        {/* Main canvas */}
        <div style={{ flex: '1 1 auto', minWidth: 0, overflow: 'auto', position: 'relative' }}>
          <FreeformCanvas dashboard={dashboard} renderLeaf={renderLeaf} />
        </div>

        {/* Right rail */}
        <div
          data-testid="analyst-pro-right-rail"
          style={{
            width: 240,
            display: 'flex',
            flexDirection: 'column',
            borderLeft: '1px solid var(--chrome-bar-border, var(--border-default))',
            overflow: 'auto',
          }}
        >
          <ZonePropertiesPanel />
        </div>
      </div>
```

- [ ] **Step 2: Smoke-test the build**

```bash
cd frontend
npm run lint 2>&1 | tail -10
npm run build 2>&1 | tail -25
```

Expected: lint clean, build succeeds.

- [ ] **Step 3: Re-run the existing freeform integration test**

```bash
cd frontend
npm run test:chart-ir -- "FreeformCanvas|AnalystPro" 2>&1 | tail -25
```

Expected: no new failures relative to baseline. The right rail is rendered unconditionally but the panel itself returns `null` when nothing is selected, so it has zero visual or behavioural impact on existing tests.

- [ ] **Step 4: Commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/components/dashboard/modes/AnalystProLayout.jsx
git commit -m "feat(analyst-pro): mount ZonePropertiesPanel in right rail (Plan 4d T5)"
```

---

### T6 — `LayoutTreePanel` rule glyph + hidden-row dim

**Files:**

- Modify: `frontend/src/components/dashboard/freeform/panels/LayoutTreePanel.jsx`
- Modify: `frontend/src/components/dashboard/freeform/__tests__/LayoutTreePanel.test.tsx`

**Goal:** The tree row gains a small `data-testid="visibility-glyph-{zoneId}"` indicator whenever `zone.visibilityRule` is set and `kind !== 'always'`. The row text dims (opacity 0.45) when the rule currently evaluates to `false`. No interaction change — clicking still selects the row.

- [ ] **Step 1: Extend the tests**

Append to `frontend/src/components/dashboard/freeform/__tests__/LayoutTreePanel.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useStore } from '../../../../store';
import LayoutTreePanel from '../panels/LayoutTreePanel';

beforeEach(() => {
  useStore.setState({
    analystProDashboard: {
      schemaVersion: 'askdb/dashboard/v1',
      id: 'd1',
      name: 'Test',
      archetype: 'analyst-pro',
      size: { mode: 'automatic' },
      tiledRoot: {
        id: 'root',
        type: 'container-vert',
        w: 100000,
        h: 100000,
        children: [
          { id: 'plain', type: 'blank', w: 100000, h: 100000 },
          {
            id: 'gated',
            type: 'blank',
            w: 100000,
            h: 100000,
            visibilityRule: { kind: 'parameterEquals', parameterId: 'p1', value: 'priority' },
          },
        ],
      },
      floatingLayer: [],
      worksheets: [],
      parameters: [
        { id: 'p1', name: 'view', type: 'string', value: 'normal', domain: { kind: 'free' }, createdAt: '' },
      ],
      sets: [],
      actions: [],
    },
    analystProSelection: new Set(),
    analystProSheetFilters: {},
  });
});

describe('LayoutTreePanel — visibility decorations', () => {
  it('does not show a glyph for a zone without a rule', () => {
    render(<LayoutTreePanel />);
    expect(screen.queryByTestId('visibility-glyph-plain')).not.toBeInTheDocument();
  });

  it('shows a glyph for a zone with a non-always rule', () => {
    render(<LayoutTreePanel />);
    expect(screen.getByTestId('visibility-glyph-gated')).toBeInTheDocument();
  });

  it('dims the row when the rule currently evaluates to false', () => {
    render(<LayoutTreePanel />);
    const row = screen.getByTestId('visibility-glyph-gated').closest('[role="button"]');
    expect(row).not.toBeNull();
    expect((row as HTMLElement).getAttribute('data-visibility-hidden')).toBe('true');
  });

  it('does not dim the row when the rule evaluates to true', () => {
    useStore.getState().setParameterValueAnalystPro('p1', 'priority');
    render(<LayoutTreePanel />);
    const row = screen.getByTestId('visibility-glyph-gated').closest('[role="button"]');
    expect((row as HTMLElement).getAttribute('data-visibility-hidden')).toBe('false');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd frontend
npm run test:chart-ir -- LayoutTreePanel 2>&1 | tail -25
```

Expected: 4 new failures (glyph not rendered, attribute missing).

- [ ] **Step 3: Update `LayoutTreePanel.jsx`**

In `frontend/src/components/dashboard/freeform/panels/LayoutTreePanel.jsx`:

1. Add imports at the top (next to the existing `useState` import):

```jsx
import { evaluateRule, buildEvaluationContext } from '../lib/visibilityRules';
```

2. Inside the `LayoutTreePanel` default export, just after the `updateZone` selector, add:

```jsx
const sets = useStore((s) => s.analystProDashboard?.sets || []);
const parameters = useStore((s) => s.analystProDashboard?.parameters || []);
const sheetFilters = useStore((s) => s.analystProSheetFilters);
const ctx = React.useMemo(
  () => buildEvaluationContext({ sets, parameters, sheetFilters }),
  [sets, parameters, sheetFilters],
);
```

3. Update `TreeRow` to accept `ctx` and render the glyph/dim. Replace the function signature `function TreeRow({ zone, depth, selected, onClick, onRename })` with `function TreeRow({ zone, depth, selected, onClick, onRename, ctx })`. Inside the non-editing branch, just before the `style={{ paddingLeft: ... }}` block, compute:

```jsx
  const hasRule = !!zone.visibilityRule && zone.visibilityRule.kind !== 'always';
  const visible = !hasRule || evaluateRule(zone.visibilityRule, ctx);
```

Then update the row's outer `<div ...>` to set `data-visibility-hidden={hasRule ? String(!visible) : 'false'}` and apply `opacity: visible ? 1 : 0.45` inside its inline `style` object. After the `<span>` for the lock badge add:

```jsx
      {hasRule ? (
        <span
          data-testid={`visibility-glyph-${zone.id}`}
          aria-label={visible ? 'Visibility rule active' : 'Hidden by visibility rule'}
          title={ruleSummary(zone.visibilityRule)}
          style={{ flexShrink: 0, opacity: 0.8 }}
        >
          ◉
        </span>
      ) : null}
```

4. Add the helper at module scope (above `LayoutTreePanel`):

```jsx
function ruleSummary(rule) {
  if (!rule) return '';
  switch (rule.kind) {
    case 'setMembership': return `set ${rule.setId} ${rule.mode}`;
    case 'parameterEquals': return `param ${rule.parameterId} = ${String(rule.value)}`;
    case 'hasActiveFilter': return `sheet ${rule.sheetId} has filter`;
    case 'always':
    default: return '';
  }
}
```

5. Pass `ctx` into both `<TreeRow>` mount sites:

```jsx
<TreeRow ... ctx={ctx} />
```

- [ ] **Step 4: Re-run the LayoutTreePanel tests**

```bash
cd frontend
npm run test:chart-ir -- LayoutTreePanel 2>&1 | tail -20
```

Expected: all pre-existing LayoutTreePanel tests still pass + 4 new ones pass.

- [ ] **Step 5: Commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/components/dashboard/freeform/panels/LayoutTreePanel.jsx \
        frontend/src/components/dashboard/freeform/__tests__/LayoutTreePanel.test.tsx
git commit -m "feat(analyst-pro): LayoutTreePanel visibility-rule glyph + hidden-row dim (Plan 4d T6)"
```

---

### T7 — Persistence round-trip

**Files:**

- Create: `frontend/src/components/dashboard/freeform/__tests__/VisibilityRoundTrip.integration.test.tsx`
- Create: `backend/tests/test_zone_visibility_roundtrip.py`

**Goal:** Prove that a zone's `visibilityRule` survives JSON serialisation in both directions and through `user_storage.update_dashboard`. The backend test instantiates an in-memory user, writes a dashboard with a rule, reads it back, and asserts the rule round-trips byte-for-byte.

- [ ] **Step 1: Frontend round-trip test**

Create `frontend/src/components/dashboard/freeform/__tests__/VisibilityRoundTrip.integration.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';

const dashboard = {
  schemaVersion: 'askdb/dashboard/v1',
  id: 'd1',
  name: 'Round Trip',
  archetype: 'analyst-pro',
  size: { mode: 'automatic' },
  tiledRoot: {
    id: 'root',
    type: 'container-vert',
    w: 100000,
    h: 100000,
    children: [
      {
        id: 'gated',
        type: 'blank',
        w: 100000,
        h: 100000,
        visibilityRule: { kind: 'parameterEquals', parameterId: 'p1', value: 'priority' },
      },
    ],
  },
  floatingLayer: [
    {
      id: 'f1',
      type: 'blank',
      w: 100,
      h: 100,
      floating: true,
      x: 0,
      y: 0,
      pxW: 100,
      pxH: 100,
      zIndex: 0,
      visibilityRule: { kind: 'hasActiveFilter', sheetId: 'sheet-1' },
    },
  ],
  worksheets: [],
  parameters: [],
  sets: [],
  actions: [],
};

describe('Visibility rule JSON round-trip', () => {
  it('survives JSON.stringify/parse without loss', () => {
    const round = JSON.parse(JSON.stringify(dashboard));
    expect(round.tiledRoot.children[0].visibilityRule).toEqual({
      kind: 'parameterEquals',
      parameterId: 'p1',
      value: 'priority',
    });
    expect(round.floatingLayer[0].visibilityRule).toEqual({
      kind: 'hasActiveFilter',
      sheetId: 'sheet-1',
    });
  });
});
```

- [ ] **Step 2: Backend round-trip pytest**

Create `backend/tests/test_zone_visibility_roundtrip.py`:

```python
"""
Plan 4d T7 — confirm that a zone's visibilityRule survives the
user_storage.update_dashboard read/write cycle. user_storage already
whitelists tiledRoot/floatingLayer as opaque blobs, so this is an
invariance test, not a code change.
"""

import os
import tempfile

import pytest


@pytest.fixture
def isolated_data_dir(monkeypatch):
    with tempfile.TemporaryDirectory() as td:
        monkeypatch.setenv("USER_DATA_DIR", td)
        # Reload user_storage so its module-level paths pick up the env.
        import importlib

        import user_storage

        importlib.reload(user_storage)
        yield user_storage
        importlib.reload(user_storage)


def _seed_user(us, email="vis-roundtrip@askdb.dev"):
    # Minimal in-memory user record. user_storage will create the per-user dir
    # lazily on first dashboard write, so we don't need a full create_user flow.
    return email


def test_visibility_rule_survives_update_dashboard(isolated_data_dir):
    us = isolated_data_dir
    email = _seed_user(us)

    dashboard_id = "d-vis-1"
    initial = {
        "id": dashboard_id,
        "name": "Vis",
        "schemaVersion": "askdb/dashboard/v1",
        "archetype": "analyst-pro",
        "size": {"mode": "automatic"},
        "tiledRoot": {
            "id": "root",
            "type": "container-vert",
            "w": 100000,
            "h": 100000,
            "children": [
                {
                    "id": "z1",
                    "type": "blank",
                    "w": 100000,
                    "h": 100000,
                    "visibilityRule": {
                        "kind": "parameterEquals",
                        "parameterId": "p1",
                        "value": "priority",
                    },
                }
            ],
        },
        "floatingLayer": [
            {
                "id": "f1",
                "type": "blank",
                "floating": True,
                "x": 0,
                "y": 0,
                "pxW": 100,
                "pxH": 100,
                "zIndex": 0,
                "w": 100,
                "h": 100,
                "visibilityRule": {
                    "kind": "hasActiveFilter",
                    "sheetId": "sheet-1",
                },
            }
        ],
        "worksheets": [],
        "parameters": [],
        "sets": [],
        "actions": [],
    }

    us.create_dashboard(email, initial)

    # Update something unrelated — this exercises the whitelist path.
    us.update_dashboard(email, dashboard_id, {"name": "Vis (renamed)"})

    after = next(d for d in us.list_dashboards(email) if d["id"] == dashboard_id)

    tiled_rule = after["tiledRoot"]["children"][0]["visibilityRule"]
    floating_rule = after["floatingLayer"][0]["visibilityRule"]

    assert tiled_rule == {
        "kind": "parameterEquals",
        "parameterId": "p1",
        "value": "priority",
    }
    assert floating_rule == {
        "kind": "hasActiveFilter",
        "sheetId": "sheet-1",
    }


def test_full_tiledroot_replacement_preserves_rule(isolated_data_dir):
    us = isolated_data_dir
    email = _seed_user(us)
    dashboard_id = "d-vis-2"

    us.create_dashboard(
        email,
        {
            "id": dashboard_id,
            "name": "Vis2",
            "schemaVersion": "askdb/dashboard/v1",
            "archetype": "analyst-pro",
            "size": {"mode": "automatic"},
            "tiledRoot": {
                "id": "root",
                "type": "container-vert",
                "w": 100000,
                "h": 100000,
                "children": [],
            },
            "floatingLayer": [],
            "worksheets": [],
            "parameters": [],
            "sets": [],
            "actions": [],
        },
    )

    new_root = {
        "id": "root",
        "type": "container-vert",
        "w": 100000,
        "h": 100000,
        "children": [
            {
                "id": "z2",
                "type": "blank",
                "w": 100000,
                "h": 100000,
                "visibilityRule": {
                    "kind": "setMembership",
                    "setId": "s1",
                    "mode": "isEmpty",
                },
            }
        ],
    }

    us.update_dashboard(email, dashboard_id, {"tiledRoot": new_root})
    after = next(d for d in us.list_dashboards(email) if d["id"] == dashboard_id)
    assert after["tiledRoot"]["children"][0]["visibilityRule"] == {
        "kind": "setMembership",
        "setId": "s1",
        "mode": "isEmpty",
    }
```

If `user_storage.create_dashboard` / `list_dashboards` have different signatures in this branch, adapt the calls — the assertion shape is the contract Plan 4d cares about. If the existing pytest helpers in `backend/tests/` already build a sandboxed user fixture, prefer reusing them over the local `isolated_data_dir` fixture above.

- [ ] **Step 3: Run both tests**

```bash
cd frontend
npm run test:chart-ir -- VisibilityRoundTrip 2>&1 | tail -10
cd ../backend
python -m pytest tests/test_zone_visibility_roundtrip.py -v 2>&1 | tail -15
```

Expected: frontend 1/1 pass, backend 2/2 pass.

- [ ] **Step 4: Commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/components/dashboard/freeform/__tests__/VisibilityRoundTrip.integration.test.tsx \
        backend/tests/test_zone_visibility_roundtrip.py
git commit -m "test(analyst-pro): visibilityRule round-trip — store/JSON + user_storage (Plan 4d T7)"
```

---

### T8 — Integration test: `parameterEquals` toggles a worksheet zone

**Files:**

- Modify: `frontend/src/components/dashboard/freeform/__tests__/VisibilityGate.integration.test.tsx` (append a new `describe` block).

**Goal:** End-to-end proof that changing a parameter via `setParameterValueAnalystPro` immediately mounts/unmounts a worksheet leaf inside `FreeformCanvas` (not just `ZoneRenderer` in isolation).

- [ ] **Step 1: Append the test**

Add to the bottom of `VisibilityGate.integration.test.tsx`:

```tsx
import FreeformCanvas from '../FreeformCanvas';

describe('FreeformCanvas — parameterEquals end-to-end', () => {
  it('toggles a leaf when the parameter value changes via the store', () => {
    const dashboard = {
      schemaVersion: 'askdb/dashboard/v1',
      id: 'd1',
      name: 'Test',
      archetype: 'analyst-pro',
      size: { mode: 'fixed', preset: 'desktop' },
      tiledRoot: {
        id: 'root',
        type: 'container-vert',
        w: 100000,
        h: 100000,
        children: [
          {
            id: 'gated',
            type: 'blank',
            w: 100000,
            h: 100000,
            visibilityRule: { kind: 'parameterEquals', parameterId: 'p1', value: 'priority' },
          },
        ],
      },
      floatingLayer: [],
      worksheets: [],
      parameters: [],
      sets: [],
      actions: [],
    };
    useStore.setState({
      analystProDashboard: {
        ...dashboard,
        parameters: [
          { id: 'p1', name: 'view', type: 'string', value: 'normal', domain: { kind: 'free' }, createdAt: '' },
        ],
      },
    });
    render(
      <FreeformCanvas
        dashboard={useStore.getState().analystProDashboard as any}
        renderLeaf={(z: any) => <div data-testid={`leaf-${z.id}`}>{z.id}</div>}
      />,
    );
    expect(screen.queryByTestId('leaf-gated')).not.toBeInTheDocument();
    act(() => {
      useStore.getState().setParameterValueAnalystPro('p1', 'priority');
    });
    expect(screen.getByTestId('leaf-gated')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test**

```bash
cd frontend
npm run test:chart-ir -- VisibilityGate 2>&1 | tail -15
```

Expected: previous 5 tests + 1 new test all pass.

- [ ] **Step 3: Commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/components/dashboard/freeform/__tests__/VisibilityGate.integration.test.tsx
git commit -m "test(analyst-pro): parameterEquals toggles a freeform leaf end-to-end (Plan 4d T8)"
```

---

### T9 — Integration test: `hasActiveFilter` + `setMembership`

**Files:**

- Modify: `frontend/src/components/dashboard/freeform/__tests__/VisibilityGate.integration.test.tsx` (append).

**Goal:** Prove that the action cascade slice (`setSheetFilterAnalystPro`) and the sets slice (`addSetAnalystPro` / `applySetChangeAnalystPro`) drive zone visibility live.

- [ ] **Step 1: Append the test**

Add to the bottom of `VisibilityGate.integration.test.tsx`:

```tsx
describe('FreeformCanvas — hasActiveFilter + setMembership end-to-end', () => {
  it('hasActiveFilter unmounts then mounts when filter slice flips', () => {
    const dashboard = {
      schemaVersion: 'askdb/dashboard/v1',
      id: 'd1',
      name: 'Test',
      archetype: 'analyst-pro',
      size: { mode: 'fixed', preset: 'desktop' },
      tiledRoot: {
        id: 'root',
        type: 'container-vert',
        w: 100000,
        h: 100000,
        children: [
          {
            id: 'gated',
            type: 'blank',
            w: 100000,
            h: 100000,
            visibilityRule: { kind: 'hasActiveFilter', sheetId: 'sheet-1' },
          },
        ],
      },
      floatingLayer: [],
      worksheets: [],
      parameters: [],
      sets: [],
      actions: [],
    };
    useStore.setState({ analystProDashboard: dashboard, analystProSheetFilters: {} });
    render(
      <FreeformCanvas
        dashboard={dashboard as any}
        renderLeaf={(z: any) => <div data-testid={`leaf-${z.id}`}>{z.id}</div>}
      />,
    );
    expect(screen.queryByTestId('leaf-gated')).not.toBeInTheDocument();
    act(() => {
      useStore.getState().setSheetFilterAnalystPro('sheet-1', [
        { field: 'region', op: '=', value: 'East' },
      ]);
    });
    expect(screen.getByTestId('leaf-gated')).toBeInTheDocument();
    act(() => {
      useStore.getState().clearSheetFilterAnalystPro('sheet-1');
    });
    expect(screen.queryByTestId('leaf-gated')).not.toBeInTheDocument();
  });

  it('setMembership(isEmpty) hides when set gains a member', () => {
    const dashboard = {
      schemaVersion: 'askdb/dashboard/v1',
      id: 'd1',
      name: 'Test',
      archetype: 'analyst-pro',
      size: { mode: 'fixed', preset: 'desktop' },
      tiledRoot: {
        id: 'root',
        type: 'container-vert',
        w: 100000,
        h: 100000,
        children: [
          {
            id: 'gated',
            type: 'blank',
            w: 100000,
            h: 100000,
            visibilityRule: { kind: 'setMembership', setId: 's1', mode: 'isEmpty' },
          },
        ],
      },
      floatingLayer: [],
      worksheets: [],
      parameters: [],
      sets: [{ id: 's1', name: 'Top', dimension: 'region', members: [], createdAt: '' }],
      actions: [],
    };
    useStore.setState({ analystProDashboard: dashboard, analystProSheetFilters: {} });
    render(
      <FreeformCanvas
        dashboard={dashboard as any}
        renderLeaf={(z: any) => <div data-testid={`leaf-${z.id}`}>{z.id}</div>}
      />,
    );
    // empty → isEmpty=true → visible
    expect(screen.getByTestId('leaf-gated')).toBeInTheDocument();
    act(() => {
      useStore.getState().applySetChangeAnalystPro('s1', 'add', ['East']);
    });
    expect(screen.queryByTestId('leaf-gated')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the full VisibilityGate suite**

```bash
cd frontend
npm run test:chart-ir -- VisibilityGate 2>&1 | tail -15
```

Expected: all VisibilityGate tests pass (5 from T3 + 1 from T8 + 2 here = 8/8).

- [ ] **Step 3: Final regression sweep**

```bash
cd frontend
npm run test:chart-ir 2>&1 | tail -25
npm run lint 2>&1 | tail -10
npm run build 2>&1 | tail -25
cd ../backend
python -m pytest tests/test_zone_visibility_roundtrip.py -v 2>&1 | tail -10
```

Expected: chart-ir failure count ≤ documented ~22 baseline (no new regressions); lint clean; build green; backend pytest 2/2.

- [ ] **Step 4: Commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/components/dashboard/freeform/__tests__/VisibilityGate.integration.test.tsx
git commit -m "test(analyst-pro): hasActiveFilter + setMembership end-to-end (Plan 4d T9)"
```

---

## Done When

1. Every checkbox above is ticked.
2. `git log --oneline askdb-global-comp ^origin/askdb-global-comp` shows nine commits with the `(Plan 4d Tx)` suffix.
3. A zone with `visibilityRule: { kind: 'parameterEquals', ... }` flips visible/hidden in the running app (`npm run dev`) when the matching parameter widget is changed.
4. A worksheet zone gated by `hasActiveFilter` appears the instant a filter action fires from any other tile.
5. A zone gated by `setMembership` reacts to set add / remove / clear within one frame.
6. No new entries appear in the chart-ir failure count (baseline ~22).
7. Backend pytest `test_zone_visibility_roundtrip.py` passes.

## Out of Scope (Plan 4e+)

- `setMembership` modes other than `hasAny` / `isEmpty` (e.g. `contains(value)`, `sizeGreaterThan`).
- `parameterEquals` operators other than `===` (no `<`, `>`, `between`, `in`).
- Per-rule animation when a zone appears/disappears (Plan 5b polish).
- Visibility for items that are not zones (e.g. axis labels, legend entries).
- Server-side authoritative evaluation (rules are client-only and cosmetic — they never gate data access; the worksheet's SQL still runs through the same SQLValidator + read-only enforcement when a hidden zone is later un-hidden).
