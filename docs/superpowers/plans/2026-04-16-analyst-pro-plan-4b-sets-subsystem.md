# Analyst Pro — Plan 4b: Sets Subsystem Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Tableau-style **Sets** for Analyst Pro — named mutable collections of dimension values. Persist per-dashboard, edit via a dedicated panel + modal, consume via the existing `ChangeSetAction` runtime path, and produce `IN (...members)` SQL when a Filter action references a set.

**Architecture:** A new Zustand slice `analystProSets: DashboardSet[]` holds sets inside `analystProDashboard`. Pure lib `setOps.ts` owns add/remove/replace/clear + dedup semantics. A left-rail `SetsPanel` lists/creates/renames/deletes sets; a modal `SetMemberDialog` edits members. `useActionRuntime.applyTargetOp` `case 'changeSet'` is wired to call `applySetChangeAnalystPro(setId, mode, members)`. Filter actions gain an optional `setRef` per-mapping entry — resolved to `{field, op:'in', values:set.members}` at cascade time. Backend `sql_filter_injector.py` learns an `in` op. Backend `dashboard_migration.legacy_to_freeform_schema` already emits `sets: []`; `user_storage.update_dashboard` already whitelists `sets` — this plan adds a regression test that guards both.

**Tech Stack:** React 19 + Zustand + TypeScript (lib) + Vitest + @testing-library/react (frontend); FastAPI + pytest (backend). No new runtime deps.

---

## Prerequisites

- Branch: `askdb-global-comp` (all commits land here).
- Plan 3 shipped: `actionTypes.ts` union includes `ChangeSetAction` with `operation: 'replace' | 'add' | 'remove' | 'toggle'`, `TargetOp` includes `kind:'change-set'` with `members` + `operation`, `useActionRuntime.applyTargetOp` has a no-op stub for `case 'change-set'`.
- Plan 4a shipped: `filterApplication.ts` + `sql_filter_injector.py` exist. Filter op is `eq` only, identifier validation regex `/^[A-Za-z_][A-Za-z0-9_]*$/`.
- Feature gate: `settings.FEATURE_ANALYST_PRO` (unchanged).
- Store fields already present: `analystProDashboard`, `analystProHistory`, `pushAnalystProHistory`, `analystProSelection`, `analystProSheetFilters`, `analystProActionCascadeToken`, `markCascadeTargetStatus`.
- Dashboard freeform schema already has a `sets` slot (empty by default) — `backend/dashboard_migration.py:347`, `backend/user_storage.py:630`.
- Frontend tests: `cd frontend && npm run test:chart-ir -- <pattern>`. Backend tests: `cd backend && python -m pytest tests/ -v`. Lint: `cd frontend && npm run lint`. Build: `cd frontend && npm run build`.

---

## Data Model

```ts
// frontend/src/components/dashboard/freeform/lib/setTypes.ts
export type SetChangeMode = 'add' | 'remove' | 'replace' | 'clear';

export type SetMember = string | number;

export type DashboardSet = {
  id: string;          // nanoid-style id (reuse generateZoneId)
  name: string;        // unique (case-insensitive) within a dashboard
  dimension: string;   // column reference, plain SQL identifier
  members: SetMember[];
  createdAt: string;   // ISO-8601 string
};
```

- `dimension` validated as `/^[A-Za-z_][A-Za-z0-9_]*$/` at creation.
- `members` always deduped + stable-ordered (first-seen wins).
- `name` uniqueness checked case-insensitively; collisions reject in the UI.

---

## File Map

**Create**
- `frontend/src/components/dashboard/freeform/lib/setTypes.ts`
- `frontend/src/components/dashboard/freeform/lib/setOps.ts`
- `frontend/src/components/dashboard/freeform/__tests__/setOps.test.ts`
- `frontend/src/components/dashboard/freeform/panels/SetsPanel.jsx`
- `frontend/src/components/dashboard/freeform/panels/SetMemberDialog.jsx`
- `frontend/src/components/dashboard/freeform/__tests__/SetsPanel.test.tsx`
- `frontend/src/components/dashboard/freeform/__tests__/SetMemberDialog.test.tsx`
- `frontend/src/components/dashboard/freeform/__tests__/ChangeSetRuntime.integration.test.tsx`
- `backend/tests/test_sets_roundtrip.py`
- `backend/tests/test_sql_filter_injector_in_op.py`

**Modify**
- `frontend/src/store.js` — add `analystProSets` slice + actions
- `frontend/src/components/dashboard/freeform/hooks/useActionRuntime.js` — wire `case 'change-set'` + set-ref expansion on `case 'filter'`
- `frontend/src/components/dashboard/freeform/lib/actionTypes.ts` — extend `fieldMapping` entry to allow `{ setRef, target }`
- `frontend/src/components/dashboard/freeform/lib/fieldMapping.ts` — teach `resolveFilters` to emit set-ref markers
- `frontend/src/components/dashboard/freeform/lib/filterApplication.ts` — emit `op:'in'` filters
- `frontend/src/components/dashboard/modes/AnalystProLayout.jsx` — mount `SetsPanel` in left rail
- `backend/sql_filter_injector.py` — support `in` op with list value

---

## Task Checklist

- [ ] T1. `setTypes.ts` — type definitions + `MAX_SET_MEMBERS` constant.
- [ ] T2. `setOps.ts` + TDD tests — `dedupMembers`, `applySetChange` (4 modes), `validateDimension`, `validateName`.
- [ ] T3. Store slice — `analystProSets` + `addSetAnalystPro`, `updateSetAnalystPro`, `deleteSetAnalystPro`, `applySetChangeAnalystPro`, `renameSetAnalystPro`.
- [ ] T4. `SetMemberDialog.jsx` modal — member list + remove buttons + manual add input + tests.
- [ ] T5. `SetsPanel.jsx` left-rail panel — list / create / rename / delete + opens dialog + tests.
- [ ] T6. Mount `SetsPanel` in `AnalystProLayout.jsx` below `LayoutTreePanel`.
- [ ] T7. Wire `useActionRuntime` `case 'change-set'` + integration test.
- [ ] T8. Backend + frontend persistence — `sets` round-trips via `legacy_to_freeform_schema` and `update_dashboard` allowlist + pytest.
- [ ] T9. Filter-with-setRef plumbing — extend `actionTypes.ts`, `fieldMapping.ts`, `filterApplication.ts` + unit tests.
- [ ] T10. Backend `sql_filter_injector.py` — `in` op support + pytest.
- [ ] T11. End-to-end integration test: changeSet → set updated → Filter action with `setRef` → re-query carries `in` filter. Then frontend+backend smoke.

---

## Task Specifications

### T1 — `setTypes.ts`

**Files:**
- Create: `frontend/src/components/dashboard/freeform/lib/setTypes.ts`

**Goal:** type-only module. Pure TypeScript; no runtime code beyond a `MAX_SET_MEMBERS` constant used by `setOps` to cap array growth.

- [ ] **Step 1: Create the file**

Create `frontend/src/components/dashboard/freeform/lib/setTypes.ts`:

```ts
/**
 * Plan 4b: Sets subsystem type definitions.
 *
 * A DashboardSet is a named mutable collection of dimension values stored on
 * a dashboard. Sets are consumed by the ChangeSetAction runtime path and by
 * Filter actions that reference a set via `fieldMapping[i].setRef`.
 */

/** Dedup-safe primitive member type. Strings and numbers only. */
export type SetMember = string | number;

/** Four mutation modes supported by applySetChange. */
export type SetChangeMode = 'add' | 'remove' | 'replace' | 'clear';

export type DashboardSet = {
  /** Stable id, generated by generateZoneId at creation. */
  id: string;
  /** Display name, unique within a dashboard (case-insensitive). */
  name: string;
  /** Dimension column reference. Must match /^[A-Za-z_][A-Za-z0-9_]*$/. */
  dimension: string;
  /** Current members. Deduped, stable-ordered (first-seen wins). */
  members: SetMember[];
  /** ISO-8601 UTC timestamp. */
  createdAt: string;
};

/**
 * Hard cap on set cardinality to keep IN (...) SQL payloads bounded and to
 * protect the JSON persistence path. Replace/add modes truncate at this cap;
 * setOps emits no error — truncation is silent and documented.
 */
export const MAX_SET_MEMBERS = 5000;
```

- [ ] **Step 2: TypeScript compile**

Run:

```bash
cd frontend
npm run test:chart-ir -- setTypes 2>&1 | head -50
```

Expected: no compile errors referencing `setTypes.ts`. (The test runner will pick it up once T2 lands — this step is just a syntax check. If vitest reports "no tests found for setTypes", that is OK.)

- [ ] **Step 3: Commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/components/dashboard/freeform/lib/setTypes.ts
git commit -m "feat(analyst-pro): setTypes — DashboardSet + SetChangeMode (Plan 4b T1)"
```

---

### T2 — `setOps.ts` + TDD tests

**Files:**
- Create: `frontend/src/components/dashboard/freeform/lib/setOps.ts`
- Create: `frontend/src/components/dashboard/freeform/__tests__/setOps.test.ts`

**Goal:** pure, React-free ops. Each function returns a new array/object; none mutate input.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/dashboard/freeform/__tests__/setOps.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  dedupMembers,
  applySetChange,
  validateDimension,
  validateSetName,
} from '../lib/setOps';
import { MAX_SET_MEMBERS, type DashboardSet } from '../lib/setTypes';

const mkSet = (members: (string | number)[] = []): DashboardSet => ({
  id: 's1',
  name: 'Top Regions',
  dimension: 'region',
  members,
  createdAt: '2026-04-16T00:00:00Z',
});

describe('dedupMembers', () => {
  it('preserves first-seen order', () => {
    expect(dedupMembers(['a', 'b', 'a', 'c', 'b'])).toEqual(['a', 'b', 'c']);
  });

  it('treats string and number as distinct', () => {
    expect(dedupMembers([1, '1', 2, '2', 1])).toEqual([1, '1', 2, '2']);
  });

  it('returns a new array even when input is already unique', () => {
    const input = ['a', 'b'];
    const out = dedupMembers(input);
    expect(out).toEqual(input);
    expect(out).not.toBe(input);
  });

  it('drops non-primitive members silently', () => {
    // @ts-expect-error — runtime guard for stray values
    expect(dedupMembers(['a', null, undefined, { x: 1 }, 'b'])).toEqual(['a', 'b']);
  });
});

describe('applySetChange', () => {
  it('add appends new members, preserves existing order', () => {
    const out = applySetChange(mkSet(['East', 'West']), ['West', 'North'], 'add');
    expect(out.members).toEqual(['East', 'West', 'North']);
  });

  it('remove drops matching members, preserves remaining order', () => {
    const out = applySetChange(mkSet(['East', 'West', 'North']), ['West'], 'remove');
    expect(out.members).toEqual(['East', 'North']);
  });

  it('replace swaps entire member list, deduped', () => {
    const out = applySetChange(mkSet(['East']), ['West', 'North', 'West'], 'replace');
    expect(out.members).toEqual(['West', 'North']);
  });

  it('clear empties members regardless of second arg', () => {
    const out = applySetChange(mkSet(['East', 'West']), ['ignored'], 'clear');
    expect(out.members).toEqual([]);
  });

  it('returns a new set object (no mutation)', () => {
    const before = mkSet(['East']);
    const after = applySetChange(before, ['West'], 'add');
    expect(after).not.toBe(before);
    expect(before.members).toEqual(['East']);
  });

  it('truncates add at MAX_SET_MEMBERS', () => {
    const existing = Array.from({ length: MAX_SET_MEMBERS - 1 }, (_, i) => `m${i}`);
    const out = applySetChange(mkSet(existing), ['x', 'y', 'z'], 'add');
    expect(out.members.length).toBe(MAX_SET_MEMBERS);
    expect(out.members[MAX_SET_MEMBERS - 1]).toBe('x');
  });

  it('truncates replace at MAX_SET_MEMBERS', () => {
    const giant = Array.from({ length: MAX_SET_MEMBERS + 10 }, (_, i) => i);
    const out = applySetChange(mkSet(), giant, 'replace');
    expect(out.members.length).toBe(MAX_SET_MEMBERS);
  });

  it('drops non-primitive incoming members', () => {
    // @ts-expect-error — runtime guard
    const out = applySetChange(mkSet(), ['a', null, { bad: true }, 1], 'replace');
    expect(out.members).toEqual(['a', 1]);
  });
});

describe('validateDimension', () => {
  it('accepts plain identifiers', () => {
    expect(validateDimension('region')).toBe(true);
    expect(validateDimension('customer_segment')).toBe(true);
    expect(validateDimension('_x1')).toBe(true);
  });

  it('rejects whitespace, punctuation, leading digits, empty', () => {
    expect(validateDimension('bad field')).toBe(false);
    expect(validateDimension('1bad')).toBe(false);
    expect(validateDimension('x.y')).toBe(false);
    expect(validateDimension('')).toBe(false);
  });
});

describe('validateSetName', () => {
  it('rejects empty / whitespace-only names', () => {
    expect(validateSetName('', [])).toEqual({ ok: false, reason: 'empty' });
    expect(validateSetName('   ', [])).toEqual({ ok: false, reason: 'empty' });
  });

  it('rejects case-insensitive duplicates', () => {
    const existing = [mkSet()]; // name 'Top Regions'
    expect(validateSetName('top regions', existing)).toEqual({ ok: false, reason: 'duplicate' });
    expect(validateSetName('TOP REGIONS', existing)).toEqual({ ok: false, reason: 'duplicate' });
  });

  it('accepts a unique name', () => {
    expect(validateSetName('Bottom Regions', [mkSet()])).toEqual({ ok: true });
  });

  it('ignores the set being renamed when its own id is passed', () => {
    const existing = [mkSet()];
    expect(validateSetName('Top Regions', existing, 's1')).toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd frontend
npm run test:chart-ir -- setOps
```

Expected: FAIL — module `../lib/setOps` not found.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/components/dashboard/freeform/lib/setOps.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
cd frontend
npm run test:chart-ir -- setOps
```

Expected: PASS (all 18 tests in the file).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/freeform/lib/setOps.ts \
        frontend/src/components/dashboard/freeform/lib/setTypes.ts \
        frontend/src/components/dashboard/freeform/__tests__/setOps.test.ts
git commit -m "feat(analyst-pro): setOps lib — dedup/applyChange/validate + TDD (Plan 4b T2)"
```

*(setTypes.ts is re-added here if it was missed in T1; git will no-op if already committed.)*

---

### T3 — Store slice: `analystProSets` + CRUD

**Files:**
- Modify: `frontend/src/store.js`

**Goal:** add one state field and five actions. Sets live inside `analystProDashboard.sets` (persisted path) but the slice also tracks the in-memory list for convenience via a selector pattern — we write through the dashboard object so history + save-round-trip keep working.

- [ ] **Step 1: Locate the Plan 4a slice block**

Open `frontend/src/store.js`. Search for `clearAllSheetHighlightsAnalystPro` — the new Plan 4b block goes immediately below that action and before the `analystProHistory` block (search for `analystProHistory: null,` to find the boundary).

- [ ] **Step 2: Paste the slice block verbatim**

Add the block below immediately after `clearAllSheetHighlightsAnalystPro` and before `analystProHistory: null`:

```js
// Plan 4b: Sets subsystem.
// Sets live inside analystProDashboard.sets so the existing save/load path
// carries them for free. These actions mutate the dashboard object, so they
// also push onto analystProHistory — undo/redo covers every set edit.

addSetAnalystPro: (set) => {
  const dash = get().analystProDashboard;
  if (!dash || !set || !set.id) return;
  const existing = dash.sets || [];
  const nextDash = { ...dash, sets: [...existing, set] };
  set_ = undefined; // guard against accidental shadowing — no-op
  set({ analystProDashboard: nextDash });
  get().pushAnalystProHistory(nextDash);
},

updateSetAnalystPro: (setId, patch) => {
  const dash = get().analystProDashboard;
  if (!dash || !setId || !patch) return;
  const existing = dash.sets || [];
  const next = existing.map((s) => (s.id === setId ? { ...s, ...patch } : s));
  const nextDash = { ...dash, sets: next };
  set({ analystProDashboard: nextDash });
  get().pushAnalystProHistory(nextDash);
},

renameSetAnalystPro: (setId, name) => {
  get().updateSetAnalystPro(setId, { name });
},

deleteSetAnalystPro: (setId) => {
  const dash = get().analystProDashboard;
  if (!dash || !setId) return;
  const existing = dash.sets || [];
  const next = existing.filter((s) => s.id !== setId);
  const nextDash = { ...dash, sets: next };
  set({ analystProDashboard: nextDash });
  get().pushAnalystProHistory(nextDash);
},

applySetChangeAnalystPro: (setId, mode, members) => {
  const dash = get().analystProDashboard;
  if (!dash || !setId) return;
  const existing = dash.sets || [];
  const target = existing.find((s) => s.id === setId);
  if (!target) return;
  // Lazy import of the pure helper; avoids circular deps.
  // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
  const { applySetChange } = require('./components/dashboard/freeform/lib/setOps');
  const nextSet = applySetChange(target, members || [], mode);
  const next = existing.map((s) => (s.id === setId ? nextSet : s));
  const nextDash = { ...dash, sets: next };
  set({ analystProDashboard: nextDash });
  get().pushAnalystProHistory(nextDash);
},
```

**Important:** the `set_ = undefined; // guard…` line above is a placeholder — delete it. It exists only to remind you that inside this slice `set` is Zustand's setter. Do NOT introduce a shadow variable. After deletion the addSetAnalystPro body reads:

```js
addSetAnalystPro: (set) => {
  const dash = get().analystProDashboard;
  if (!dash || !set || !set.id) return;
  const existing = dash.sets || [];
  const nextDash = { ...dash, sets: [...existing, set] };
  // Note: the `set` local shadows Zustand's setter for this scope.
  // Use `get().setSomething` style if you need to invoke actions.
  useStore.setState({ analystProDashboard: nextDash });
  get().pushAnalystProHistory(nextDash);
},
```

Actually the Zustand `set` setter collision is a real problem. Rename the action parameter to `newSet` to avoid the shadow — final form:

```js
addSetAnalystPro: (newSet) => {
  const dash = get().analystProDashboard;
  if (!dash || !newSet || !newSet.id) return;
  const existing = dash.sets || [];
  const nextDash = { ...dash, sets: [...existing, newSet] };
  set({ analystProDashboard: nextDash });
  get().pushAnalystProHistory(nextDash);
},
```

Use this final form. Do the same vigilance for the other actions — all other actions in the block already use `existing`, `next`, `nextDash`, `target`, `nextSet` — none shadow `set`.

- [ ] **Step 3: Replace `require()` with static import for `applySetChange`**

The CommonJS `require` in the draft above is not how `store.js` loads modules. Replace it with a top-of-file ESM import. At the top of `frontend/src/store.js`, add (next to other imports):

```js
import { applySetChange } from './components/dashboard/freeform/lib/setOps';
```

Then simplify `applySetChangeAnalystPro` to call `applySetChange` directly — no lazy require:

```js
applySetChangeAnalystPro: (setId, mode, members) => {
  const dash = get().analystProDashboard;
  if (!dash || !setId) return;
  const existing = dash.sets || [];
  const target = existing.find((s) => s.id === setId);
  if (!target) return;
  const nextSet = applySetChange(target, members || [], mode);
  const next = existing.map((s) => (s.id === setId ? nextSet : s));
  const nextDash = { ...dash, sets: next };
  set({ analystProDashboard: nextDash });
  get().pushAnalystProHistory(nextDash);
},
```

- [ ] **Step 4: Lint**

Run:

```bash
cd frontend
npm run lint -- --max-warnings=0 src/store.js
```

Expected: clean. If the lint reports a circular import (store.js ↔ setOps.ts), confirm setOps has no import back into store (it should not).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/store.js
git commit -m "feat(analyst-pro): store slice — analystProSets CRUD + applySetChange (Plan 4b T3)"
```

---

### T4 — `SetMemberDialog.jsx` modal editor

**Files:**
- Create: `frontend/src/components/dashboard/freeform/panels/SetMemberDialog.jsx`
- Create: `frontend/src/components/dashboard/freeform/__tests__/SetMemberDialog.test.tsx`

**Goal:** modal with `role="dialog"`, `aria-modal="true"`, `aria-label="Edit set members"`. Shows the current members as a list with per-row Remove buttons. A text input + Add button appends new members. Save/Cancel close the dialog. Save flushes edits through `applySetChangeAnalystPro(setId, 'replace', nextMembers)`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/dashboard/freeform/__tests__/SetMemberDialog.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

import SetMemberDialog from '../panels/SetMemberDialog';
import { useStore } from '../../../../store';

function seedDashboardWithSet() {
  useStore.setState({
    analystProDashboard: {
      id: 'd1',
      archetype: 'analyst-pro',
      size: { mode: 'automatic' },
      tiledRoot: { id: 'r', type: 'container-horz', w: 100000, h: 100000, children: [] },
      floatingLayer: [],
      worksheets: [],
      parameters: [],
      actions: [],
      sets: [{
        id: 's1',
        name: 'Top Regions',
        dimension: 'region',
        members: ['East', 'West'],
        createdAt: '2026-04-16T00:00:00Z',
      }],
    },
    analystProHistory: { past: [], present: null, future: [], maxEntries: 500 },
  });
}

describe('SetMemberDialog', () => {
  beforeEach(() => {
    seedDashboardWithSet();
  });

  it('renders nothing when setId prop is null', () => {
    const { container } = render(<SetMemberDialog setId={null} onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders members as a list with remove buttons', () => {
    render(<SetMemberDialog setId="s1" onClose={() => {}} />);
    expect(screen.getByRole('dialog', { name: /edit set members/i })).toBeTruthy();
    expect(screen.getByText('East')).toBeTruthy();
    expect(screen.getByText('West')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /remove/i }).length).toBe(2);
  });

  it('adds a new member via the input', () => {
    render(<SetMemberDialog setId="s1" onClose={() => {}} />);
    const input = screen.getByPlaceholderText(/add member/i);
    fireEvent.change(input, { target: { value: 'North' } });
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
    expect(screen.getByText('North')).toBeTruthy();
  });

  it('dedups when adding an existing member', () => {
    render(<SetMemberDialog setId="s1" onClose={() => {}} />);
    const input = screen.getByPlaceholderText(/add member/i);
    fireEvent.change(input, { target: { value: 'East' } });
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
    // East should still only appear once in the list
    expect(screen.getAllByText('East').length).toBe(1);
  });

  it('Save flushes members via applySetChangeAnalystPro(replace) and calls onClose', () => {
    const spy = vi.spyOn(useStore.getState(), 'applySetChangeAnalystPro');
    const onClose = vi.fn();
    render(<SetMemberDialog setId="s1" onClose={onClose} />);

    // Remove East
    fireEvent.click(screen.getAllByRole('button', { name: /remove/i })[0]);
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(spy).toHaveBeenCalledWith('s1', 'replace', ['West']);
    expect(onClose).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('Cancel closes without flushing', () => {
    const spy = vi.spyOn(useStore.getState(), 'applySetChangeAnalystPro');
    const onClose = vi.fn();
    render(<SetMemberDialog setId="s1" onClose={onClose} />);

    fireEvent.click(screen.getAllByRole('button', { name: /remove/i })[0]);
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(spy).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd frontend
npm run test:chart-ir -- SetMemberDialog
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the component**

Create `frontend/src/components/dashboard/freeform/panels/SetMemberDialog.jsx`:

```jsx
import React, { useMemo, useState } from 'react';
import { useStore } from '../../../../store';
import { dedupMembers } from '../lib/setOps';

/**
 * SetMemberDialog — modal editor for a single DashboardSet's members.
 *
 * Props:
 *   - setId: string | null   (null → render nothing)
 *   - onClose: () => void
 *
 * Local draft state holds the member array until Save, which flushes through
 * applySetChangeAnalystPro(setId, 'replace', nextMembers). Cancel discards.
 */
export default function SetMemberDialog({ setId, onClose }) {
  const dashboard = useStore((s) => s.analystProDashboard);
  const applyChange = useStore((s) => s.applySetChangeAnalystPro);

  const targetSet = useMemo(() => {
    if (!dashboard || !setId) return null;
    return (dashboard.sets || []).find((s) => s.id === setId) || null;
  }, [dashboard, setId]);

  const [draft, setDraft] = useState(() => (targetSet ? [...targetSet.members] : []));
  const [input, setInput] = useState('');

  // Re-seed draft when targetSet id changes.
  React.useEffect(() => {
    setDraft(targetSet ? [...targetSet.members] : []);
    setInput('');
  }, [targetSet?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!setId || !targetSet) return null;

  const handleAdd = () => {
    const v = input.trim();
    if (v === '') return;
    // Try numeric coercion so '42' and 42 dedup correctly when the column is numeric.
    const asNum = Number(v);
    const candidate = Number.isFinite(asNum) && String(asNum) === v ? asNum : v;
    setDraft((prev) => dedupMembers([...prev, candidate]));
    setInput('');
  };

  const handleRemove = (idx) => {
    setDraft((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = () => {
    applyChange(setId, 'replace', draft);
    onClose?.();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Edit set members"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: 'var(--bg-elevated, #1a1a22)',
          color: 'var(--text-primary, #fff)',
          border: '1px solid var(--border-default, #333)',
          borderRadius: 10,
          padding: 20,
          width: 420,
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 16 }}>
          {targetSet.name}
          <span style={{ fontWeight: 400, opacity: 0.7, marginLeft: 8, fontSize: 12 }}>
            ({targetSet.dimension})
          </span>
        </h2>

        <ul
          aria-label="Set members"
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            overflowY: 'auto',
            flex: '1 1 auto',
            border: '1px solid var(--border-default, #333)',
            borderRadius: 6,
          }}
        >
          {draft.length === 0 && (
            <li style={{ padding: 8, opacity: 0.6, fontSize: 12 }}>No members</li>
          )}
          {draft.map((m, idx) => (
            <li
              key={`${String(m)}__${idx}`}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '6px 10px',
                borderBottom: '1px solid var(--border-subtle, #222)',
              }}
            >
              <span>{String(m)}</span>
              <button
                type="button"
                aria-label={`Remove ${String(m)}`}
                onClick={() => handleRemove(idx)}
                style={{
                  background: 'transparent',
                  color: 'var(--danger, #f87171)',
                  border: '1px solid var(--danger, #f87171)',
                  borderRadius: 4,
                  padding: '2px 8px',
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>

        <div style={{ display: 'flex', gap: 6 }}>
          <input
            type="text"
            placeholder="Add member…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAdd();
              }
            }}
            style={{
              flex: '1 1 auto',
              padding: '6px 8px',
              background: 'var(--bg-input, #0b0b10)',
              color: 'inherit',
              border: '1px solid var(--border-default, #333)',
              borderRadius: 4,
            }}
          />
          <button
            type="button"
            onClick={handleAdd}
            style={{
              padding: '6px 14px',
              background: 'var(--accent, #4f7)',
              color: '#000',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Add
          </button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
          <button
            type="button"
            onClick={() => onClose?.()}
            style={{
              padding: '6px 14px',
              background: 'transparent',
              color: 'inherit',
              border: '1px solid var(--border-default, #333)',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            style={{
              padding: '6px 14px',
              background: 'var(--accent, #4f7)',
              color: '#000',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
cd frontend
npm run test:chart-ir -- SetMemberDialog
```

Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/freeform/panels/SetMemberDialog.jsx \
        frontend/src/components/dashboard/freeform/__tests__/SetMemberDialog.test.tsx
git commit -m "feat(analyst-pro): SetMemberDialog modal — member editor (Plan 4b T4)"
```

---

### T5 — `SetsPanel.jsx` left-rail panel

**Files:**
- Create: `frontend/src/components/dashboard/freeform/panels/SetsPanel.jsx`
- Create: `frontend/src/components/dashboard/freeform/__tests__/SetsPanel.test.tsx`

**Goal:** left-rail panel listing all sets. Inline "+ New Set" button opens a create form (name + dimension). Each row has Edit (opens `SetMemberDialog`), Rename (inline input), and Delete. Validates name uniqueness + dimension identifier format.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/dashboard/freeform/__tests__/SetsPanel.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import React from 'react';

import SetsPanel from '../panels/SetsPanel';
import { useStore } from '../../../../store';

function seed(sets = []) {
  useStore.setState({
    analystProDashboard: {
      id: 'd1',
      archetype: 'analyst-pro',
      size: { mode: 'automatic' },
      tiledRoot: { id: 'r', type: 'container-horz', w: 100000, h: 100000, children: [] },
      floatingLayer: [],
      worksheets: [],
      parameters: [],
      actions: [],
      sets,
    },
    analystProHistory: { past: [], present: null, future: [], maxEntries: 500 },
  });
}

const demoSet = {
  id: 's1',
  name: 'Top Regions',
  dimension: 'region',
  members: ['East'],
  createdAt: '2026-04-16T00:00:00Z',
};

describe('SetsPanel', () => {
  beforeEach(() => seed());

  it('renders the Sets heading and empty-state copy when no sets exist', () => {
    render(<SetsPanel />);
    expect(screen.getByRole('heading', { name: /sets/i })).toBeTruthy();
    expect(screen.getByText(/no sets yet/i)).toBeTruthy();
  });

  it('+ New Set opens the create form with name + dimension inputs', () => {
    render(<SetsPanel />);
    fireEvent.click(screen.getByRole('button', { name: /\+ new set/i }));
    expect(screen.getByPlaceholderText(/set name/i)).toBeTruthy();
    expect(screen.getByPlaceholderText(/dimension/i)).toBeTruthy();
  });

  it('Create adds a new set via addSetAnalystPro', () => {
    const spy = vi.spyOn(useStore.getState(), 'addSetAnalystPro');
    render(<SetsPanel />);
    fireEvent.click(screen.getByRole('button', { name: /\+ new set/i }));
    fireEvent.change(screen.getByPlaceholderText(/set name/i), { target: { value: 'My Set' } });
    fireEvent.change(screen.getByPlaceholderText(/dimension/i), { target: { value: 'region' } });
    fireEvent.click(screen.getByRole('button', { name: /^create$/i }));
    expect(spy).toHaveBeenCalledTimes(1);
    const callArg = spy.mock.calls[0][0];
    expect(callArg).toMatchObject({ name: 'My Set', dimension: 'region', members: [] });
    expect(callArg.id).toBeTruthy();
    expect(callArg.createdAt).toBeTruthy();
    spy.mockRestore();
  });

  it('rejects duplicate names (case-insensitive)', () => {
    seed([demoSet]);
    const spy = vi.spyOn(useStore.getState(), 'addSetAnalystPro');
    render(<SetsPanel />);
    fireEvent.click(screen.getByRole('button', { name: /\+ new set/i }));
    fireEvent.change(screen.getByPlaceholderText(/set name/i), { target: { value: 'top regions' } });
    fireEvent.change(screen.getByPlaceholderText(/dimension/i), { target: { value: 'region' } });
    fireEvent.click(screen.getByRole('button', { name: /^create$/i }));
    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByText(/already exists/i)).toBeTruthy();
    spy.mockRestore();
  });

  it('rejects invalid dimension identifier', () => {
    const spy = vi.spyOn(useStore.getState(), 'addSetAnalystPro');
    render(<SetsPanel />);
    fireEvent.click(screen.getByRole('button', { name: /\+ new set/i }));
    fireEvent.change(screen.getByPlaceholderText(/set name/i), { target: { value: 'X' } });
    fireEvent.change(screen.getByPlaceholderText(/dimension/i), { target: { value: 'bad field' } });
    fireEvent.click(screen.getByRole('button', { name: /^create$/i }));
    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByText(/invalid dimension/i)).toBeTruthy();
    spy.mockRestore();
  });

  it('lists existing sets with Edit / Delete buttons', () => {
    seed([demoSet]);
    render(<SetsPanel />);
    const row = screen.getByTestId('set-row-s1');
    expect(within(row).getByText('Top Regions')).toBeTruthy();
    expect(within(row).getByText(/region · 1/)).toBeTruthy();
    expect(within(row).getByRole('button', { name: /edit members/i })).toBeTruthy();
    expect(within(row).getByRole('button', { name: /delete/i })).toBeTruthy();
  });

  it('Delete calls deleteSetAnalystPro after confirm', () => {
    seed([demoSet]);
    const spy = vi.spyOn(useStore.getState(), 'deleteSetAnalystPro');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<SetsPanel />);
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(spy).toHaveBeenCalledWith('s1');
    spy.mockRestore();
  });

  it('Edit Members opens SetMemberDialog with that set selected', () => {
    seed([demoSet]);
    render(<SetsPanel />);
    fireEvent.click(screen.getByRole('button', { name: /edit members/i }));
    expect(screen.getByRole('dialog', { name: /edit set members/i })).toBeTruthy();
  });

  it('Rename flow calls renameSetAnalystPro with trimmed value', () => {
    seed([demoSet]);
    const spy = vi.spyOn(useStore.getState(), 'renameSetAnalystPro');
    render(<SetsPanel />);
    fireEvent.doubleClick(screen.getByText('Top Regions'));
    const input = screen.getByDisplayValue('Top Regions');
    fireEvent.change(input, { target: { value: '  Bottom Regions  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(spy).toHaveBeenCalledWith('s1', 'Bottom Regions');
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd frontend
npm run test:chart-ir -- SetsPanel
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the component**

Create `frontend/src/components/dashboard/freeform/panels/SetsPanel.jsx`:

```jsx
import React, { useState } from 'react';
import { useStore } from '../../../../store';
import SetMemberDialog from './SetMemberDialog';
import { validateDimension, validateSetName } from '../lib/setOps';
import { generateZoneId } from '../lib/zoneTree';

/**
 * SetsPanel — left-rail panel listing all DashboardSets on the current
 * Analyst Pro dashboard. Supports create / rename / delete and opens
 * SetMemberDialog for member edits.
 */
export default function SetsPanel() {
  const sets = useStore((s) => s.analystProDashboard?.sets || []);
  const addSet = useStore((s) => s.addSetAnalystPro);
  const renameSet = useStore((s) => s.renameSetAnalystPro);
  const deleteSet = useStore((s) => s.deleteSetAnalystPro);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDim, setNewDim] = useState('');
  const [error, setError] = useState('');

  const [renamingId, setRenamingId] = useState(null);
  const [renameDraft, setRenameDraft] = useState('');

  const [editMembersId, setEditMembersId] = useState(null);

  const resetCreate = () => {
    setCreating(false);
    setNewName('');
    setNewDim('');
    setError('');
  };

  const submitCreate = () => {
    const nameCheck = validateSetName(newName, sets);
    if (!nameCheck.ok) {
      setError(nameCheck.reason === 'empty' ? 'Name is required' : 'A set with that name already exists');
      return;
    }
    if (!validateDimension(newDim.trim())) {
      setError('Invalid dimension — use a plain column name (letters, digits, underscores)');
      return;
    }
    addSet({
      id: generateZoneId(),
      name: newName.trim(),
      dimension: newDim.trim(),
      members: [],
      createdAt: new Date().toISOString(),
    });
    resetCreate();
  };

  const commitRename = (setId) => {
    const trimmed = renameDraft.trim();
    if (trimmed.length > 0) {
      const check = validateSetName(trimmed, sets, setId);
      if (check.ok) {
        renameSet(setId, trimmed);
      }
    }
    setRenamingId(null);
    setRenameDraft('');
  };

  const handleDelete = (setId) => {
    if (typeof window !== 'undefined' && !window.confirm('Delete this set?')) return;
    deleteSet(setId);
  };

  return (
    <aside
      aria-label="Sets"
      style={{
        borderTop: '1px solid var(--border-default, #333)',
        padding: 8,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, opacity: 0.7 }}>
          Sets
        </h3>
        {!creating && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            style={{
              background: 'transparent',
              color: 'var(--accent, #4f7)',
              border: 'none',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            + New Set
          </button>
        )}
      </div>

      {creating && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            padding: 6,
            border: '1px solid var(--border-default, #333)',
            borderRadius: 4,
          }}
        >
          <input
            type="text"
            placeholder="Set name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            style={{ padding: 4, fontSize: 12, background: 'var(--bg-input, #0b0b10)', color: 'inherit', border: '1px solid var(--border-default, #333)' }}
          />
          <input
            type="text"
            placeholder="Dimension (e.g. region)"
            value={newDim}
            onChange={(e) => setNewDim(e.target.value)}
            style={{ padding: 4, fontSize: 12, background: 'var(--bg-input, #0b0b10)', color: 'inherit', border: '1px solid var(--border-default, #333)' }}
          />
          {error && <div style={{ color: 'var(--danger, #f87171)', fontSize: 10 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
            <button type="button" onClick={resetCreate} style={{ padding: '2px 8px', fontSize: 11, background: 'transparent', color: 'inherit', border: '1px solid var(--border-default, #333)', cursor: 'pointer' }}>
              Cancel
            </button>
            <button type="button" onClick={submitCreate} style={{ padding: '2px 10px', fontSize: 11, background: 'var(--accent, #4f7)', color: '#000', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
              Create
            </button>
          </div>
        </div>
      )}

      {sets.length === 0 && !creating && (
        <div style={{ fontSize: 11, opacity: 0.55, padding: '4px 2px' }}>No sets yet</div>
      )}

      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {sets.map((s) => (
          <li
            key={s.id}
            data-testid={`set-row-${s.id}`}
            style={{ padding: '4px 6px', borderRadius: 4, fontSize: 12, background: 'var(--bg-subtle, transparent)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              {renamingId === s.id ? (
                <input
                  autoFocus
                  value={renameDraft}
                  onChange={(e) => setRenameDraft(e.target.value)}
                  onBlur={() => commitRename(s.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename(s.id);
                    else if (e.key === 'Escape') {
                      setRenamingId(null);
                      setRenameDraft('');
                    }
                  }}
                  aria-label={`Rename ${s.name}`}
                  style={{ flex: 1, fontSize: 12, padding: 2, background: 'var(--bg-input, #0b0b10)', color: 'inherit', border: '1px solid var(--border-default, #333)' }}
                />
              ) : (
                <span
                  onDoubleClick={() => {
                    setRenamingId(s.id);
                    setRenameDraft(s.name);
                  }}
                  title="Double-click to rename"
                  style={{ flex: 1, cursor: 'text' }}
                >
                  {s.name}
                </span>
              )}
            </div>
            <div style={{ fontSize: 10, opacity: 0.6, marginTop: 2 }}>
              {s.dimension} · {s.members.length}
            </div>
            <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
              <button
                type="button"
                onClick={() => setEditMembersId(s.id)}
                aria-label={`Edit members of ${s.name}`}
                style={{ fontSize: 10, padding: '2px 6px', background: 'transparent', color: 'var(--accent, #4f7)', border: '1px solid var(--accent, #4f7)', borderRadius: 3, cursor: 'pointer' }}
              >
                Edit Members
              </button>
              <button
                type="button"
                onClick={() => handleDelete(s.id)}
                aria-label={`Delete ${s.name}`}
                style={{ fontSize: 10, padding: '2px 6px', background: 'transparent', color: 'var(--danger, #f87171)', border: '1px solid var(--danger, #f87171)', borderRadius: 3, cursor: 'pointer' }}
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>

      <SetMemberDialog setId={editMembersId} onClose={() => setEditMembersId(null)} />
    </aside>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
cd frontend
npm run test:chart-ir -- SetsPanel
```

Expected: PASS (9 tests). If the "rejects duplicate names" case still fails, re-check that `validateSetName` is invoked with the existing sets array *before* trimming errors appear.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/freeform/panels/SetsPanel.jsx \
        frontend/src/components/dashboard/freeform/__tests__/SetsPanel.test.tsx
git commit -m "feat(analyst-pro): SetsPanel — list/create/rename/delete sets (Plan 4b T5)"
```

---

### T6 — Mount `SetsPanel` in `AnalystProLayout`

**Files:**
- Modify: `frontend/src/components/dashboard/modes/AnalystProLayout.jsx`

**Goal:** place `SetsPanel` in the left rail, directly below `LayoutTreePanel`. Keep the left-rail 240px width.

- [ ] **Step 1: Edit the layout**

Open `frontend/src/components/dashboard/modes/AnalystProLayout.jsx`. Add to the imports block:

```jsx
import SetsPanel from '../freeform/panels/SetsPanel';
```

Find the existing left-rail JSX (currently renders `ObjectLibraryPanel` then `LayoutTreePanel`, around the `data-testid="analyst-pro-left-rail"` element) and replace that `<div>` with:

```jsx
<div
  data-testid="analyst-pro-left-rail"
  style={{
    width: 240,
    display: 'flex',
    flexDirection: 'column',
    borderRight: '1px solid var(--chrome-bar-border, var(--border-default))',
    overflow: 'hidden',
  }}
>
  <ObjectLibraryPanel />
  <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
    <LayoutTreePanel />
  </div>
  <SetsPanel />
</div>
```

- [ ] **Step 2: Lint**

Run:

```bash
cd frontend
npm run lint -- --max-warnings=0 src/components/dashboard/modes/AnalystProLayout.jsx
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/dashboard/modes/AnalystProLayout.jsx
git commit -m "feat(analyst-pro): mount SetsPanel in left rail (Plan 4b T6)"
```

---

### T7 — Wire `useActionRuntime` `case 'change-set'`

**Files:**
- Modify: `frontend/src/components/dashboard/freeform/hooks/useActionRuntime.js`
- Modify: `frontend/src/components/dashboard/freeform/__tests__/ActionRuntime.integration.test.tsx`

**Goal:** replace the Plan 3 no-op with a real call to `applySetChangeAnalystPro`. The Plan 3 executor already populates `op.members`, `op.operation`, and `op.setId` for ChangeSetActions. Runtime rule: if `operation === 'toggle'`, translate to `'add'` when the first incoming member is NOT in the set, otherwise `'remove'`. (Tableau parity; our `setOps.applySetChange` does not know about toggle.)

- [ ] **Step 1: Write the failing test**

Append to `frontend/src/components/dashboard/freeform/__tests__/ActionRuntime.integration.test.tsx` inside the existing `describe(...)` block (after the Plan 4a tests). If the file doesn't already import these, add them near the top:

```tsx
import { publish } from '../lib/markEventBus';
```

Then the new test cases:

```tsx
it('change-set add mode calls applySetChangeAnalystPro and updates the set', () => {
  useStore.setState({
    analystProDashboard: {
      id: 'd1',
      archetype: 'analyst-pro',
      size: { mode: 'automatic' },
      tiledRoot: { id: 'r', type: 'container-horz', w: 100000, h: 100000, children: [] },
      floatingLayer: [],
      worksheets: [],
      parameters: [],
      sets: [{
        id: 's1',
        name: 'Regions',
        dimension: 'Region',
        members: ['East'],
        createdAt: '2026-04-16T00:00:00Z',
      }],
      actions: [{
        id: 'a1',
        kind: 'change-set',
        name: 'AddRegion',
        enabled: true,
        sourceSheets: ['src'],
        trigger: 'select',
        targetSetId: 's1',
        fieldMapping: [{ source: 'Region', target: 'Region' }],
        operation: 'add',
      }],
    },
  });

  render(<Harness />);
  act(() => {
    publish({
      sourceSheetId: 'src',
      trigger: 'select',
      markData: { Region: 'West' },
      timestamp: Date.now(),
    });
  });

  const sets = useStore.getState().analystProDashboard.sets;
  expect(sets[0].members).toEqual(['East', 'West']);
});

it('change-set toggle mode adds when missing, removes when present', () => {
  // Missing member -> add
  useStore.setState({
    analystProDashboard: {
      id: 'd1',
      archetype: 'analyst-pro',
      size: { mode: 'automatic' },
      tiledRoot: { id: 'r', type: 'container-horz', w: 100000, h: 100000, children: [] },
      floatingLayer: [],
      worksheets: [],
      parameters: [],
      sets: [{
        id: 's1', name: 'Regions', dimension: 'Region',
        members: ['East'], createdAt: '2026-04-16T00:00:00Z',
      }],
      actions: [{
        id: 'a1', kind: 'change-set', name: 'Toggle',
        enabled: true, sourceSheets: ['src'], trigger: 'select',
        targetSetId: 's1',
        fieldMapping: [{ source: 'Region', target: 'Region' }],
        operation: 'toggle',
      }],
    },
  });

  render(<Harness />);
  act(() => {
    publish({
      sourceSheetId: 'src', trigger: 'select',
      markData: { Region: 'West' }, timestamp: Date.now(),
    });
  });
  expect(useStore.getState().analystProDashboard.sets[0].members).toEqual(['East', 'West']);

  // Present member -> remove
  act(() => {
    publish({
      sourceSheetId: 'src', trigger: 'select',
      markData: { Region: 'East' }, timestamp: Date.now(),
    });
  });
  expect(useStore.getState().analystProDashboard.sets[0].members).toEqual(['West']);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd frontend
npm run test:chart-ir -- ActionRuntime
```

Expected: FAIL — sets unchanged because the runtime still has a stub comment.

- [ ] **Step 3: Wire the runtime**

Open `frontend/src/components/dashboard/freeform/hooks/useActionRuntime.js`. Replace the `case 'change-set':` branch with:

```js
    case 'change-set': {
      const s = useStore.getState();
      const existing = s.analystProDashboard?.sets || [];
      const target = existing.find((x) => x.id === op.setId);
      if (!target) break;
      let mode = op.operation;
      if (mode === 'toggle') {
        const first = op.members[0];
        mode = first !== undefined && target.members.includes(first) ? 'remove' : 'add';
      }
      s.applySetChangeAnalystPro(op.setId, mode, op.members);
      break;
    }
```

Note: the existing `applyTargetOp` function receives `op` where `op.kind === 'change-set'`. The Plan 3 `TargetOp` union uses `kind: 'change-set'` literal — confirm the `switch(op.kind)` branch matches exactly.

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
cd frontend
npm run test:chart-ir -- ActionRuntime
```

Expected: PASS (Plan 3 + Plan 4a + 2 new Plan 4b tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/freeform/hooks/useActionRuntime.js \
        frontend/src/components/dashboard/freeform/__tests__/ActionRuntime.integration.test.tsx
git commit -m "feat(analyst-pro): useActionRuntime wires change-set cascade (Plan 4b T7)"
```

---

### T8 — Persistence round-trip (migration preserve + store whitelist)

**Files:**
- Modify: `backend/dashboard_migration.py`
- Create: `backend/tests/test_sets_roundtrip.py`

**Goal:** make `legacy_to_freeform_schema` preserve pre-existing `sets` (same pattern it already uses for `actions`), and lock in the behaviour with a regression test that also covers the `user_storage.update_dashboard` whitelist round-trip (which already includes `sets` — see `user_storage.py:630`).

- [ ] **Step 1: Preserve input sets in the migration helper**

Open `backend/dashboard_migration.py`. Find `legacy_to_freeform_schema` (near line 298). Just above the `return { … }` block that builds the freeform schema, mirror the existing `existing_actions` guard. Add:

```python
    # Preserve existing sets if present; default to empty list for fresh migrations.
    existing_sets = legacy.get("sets")
    if not isinstance(existing_sets, list):
        existing_sets = []
```

Then update the return dict to use `"sets": existing_sets` instead of `"sets": []`:

```python
    return {
        "schemaVersion": "askdb/dashboard/v1",
        "id": str(dashboard_id),
        "name": name,
        "archetype": "analyst-pro",
        "size": {"mode": "automatic"},
        "tiledRoot": tiled_root,
        "floatingLayer": [],
        "worksheets": worksheets,
        "parameters": [],
        "sets": existing_sets,
        "actions": existing_actions,
        "globalStyle": {},
    }
```

- [ ] **Step 2: Write the regression test**

Create `backend/tests/test_sets_roundtrip.py`:

```python
"""
Plan 4b T8 — regression guard that `sets` persists through the freeform
dashboard path.

Two surfaces under test are pure-Python helpers (no FastAPI startup):

  1. dashboard_migration.legacy_to_freeform_schema  -> preserves input sets,
     defaults to [] when absent.
  2. user_storage.update_dashboard                  -> sets is in the field
     whitelist so a write-then-read cycle preserves it.

The user_storage test is filesystem-backed; we isolate it to a tmp_path.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest


# --------------------------------------------------------------------------
# 1. legacy_to_freeform_schema
# --------------------------------------------------------------------------

from dashboard_migration import legacy_to_freeform_schema


def test_freeform_schema_includes_empty_sets_by_default():
    out = legacy_to_freeform_schema({"id": "d1", "name": "D", "tiles": []})
    assert out["sets"] == []


def test_freeform_schema_preserves_existing_sets_when_present():
    existing = [
        {
            "id": "s1",
            "name": "Top Regions",
            "dimension": "region",
            "members": ["East", "West"],
            "createdAt": "2026-04-16T00:00:00Z",
        }
    ]
    out = legacy_to_freeform_schema(
        {"id": "d1", "name": "D", "tiles": [], "sets": existing},
    )
    assert out["sets"] == existing


def test_freeform_schema_coerces_non_list_sets_to_empty():
    out = legacy_to_freeform_schema(
        {"id": "d1", "name": "D", "tiles": [], "sets": "not-a-list"},
    )
    assert out["sets"] == []


# --------------------------------------------------------------------------
# 2. user_storage.update_dashboard allowlist — sets round-trip
# --------------------------------------------------------------------------


@pytest.fixture
def isolated_user_dir(monkeypatch, tmp_path):
    """Redirect user_storage's per-user filesystem root into tmp_path."""
    import user_storage

    fake_root = tmp_path / "user_data"
    fake_root.mkdir()

    def _fake_user_dir(email: str) -> Path:
        # sha256-prefix scheme is unimportant for the test — one subdir will do.
        d = fake_root / "testuser"
        d.mkdir(exist_ok=True)
        return d

    monkeypatch.setattr(user_storage, "_user_dir", _fake_user_dir)
    return fake_root


def test_update_dashboard_preserves_sets_field(isolated_user_dir):
    import user_storage

    email = "demo@askdb.dev"
    # Seed dashboards.json with one dashboard.
    udir = user_storage._user_dir(email)
    seed = [{
        "id": "d1",
        "name": "D",
        "archetype": "analyst-pro",
        "schemaVersion": "askdb/dashboard/v1",
        "tiledRoot": {"id": "root", "type": "container-vert", "w": 100000, "h": 100000, "children": []},
        "floatingLayer": [],
        "worksheets": [],
        "parameters": [],
        "actions": [],
        "sets": [],
    }]
    (udir / "dashboards.json").write_text(json.dumps(seed), encoding="utf-8")

    new_sets = [
        {
            "id": "s1",
            "name": "Top Regions",
            "dimension": "region",
            "members": ["East", "West"],
            "createdAt": "2026-04-16T00:00:00Z",
        }
    ]
    updated = user_storage.update_dashboard(
        email, "d1", {"sets": new_sets},
    )
    assert updated is not None
    assert updated["sets"] == new_sets

    # Read back through load path.
    reloaded = user_storage.load_dashboard(email, "d1")
    assert reloaded["sets"] == new_sets
```

- [ ] **Step 3: Run the test**

Run:

```bash
cd backend
python -m pytest tests/test_sets_roundtrip.py -v
```

Expected: PASS (4 tests). If `_user_dir` monkeypatch doesn't stick because `user_storage` caches a Path elsewhere, check the real symbol name with `python -c "from user_storage import _user_dir; print(_user_dir.__module__)"` and adjust the patch target.

- [ ] **Step 4: Run the full backend suite**

Run:

```bash
cd backend
python -m pytest tests/ -v
```

Expected: full suite green. In particular `test_dashboard_migration.py` (existing) should still pass — the migration change is additive (input `sets` key was previously ignored, now preserved).

- [ ] **Step 5: Commit**

```bash
git add backend/dashboard_migration.py backend/tests/test_sets_roundtrip.py
git commit -m "feat(analyst-pro): preserve sets in legacy_to_freeform_schema + test (Plan 4b T8)"
```

---

### T9 — Filter-with-setRef frontend plumbing

**Files:**
- Modify: `frontend/src/components/dashboard/freeform/lib/actionTypes.ts`
- Modify: `frontend/src/components/dashboard/freeform/lib/fieldMapping.ts`
- Modify: `frontend/src/components/dashboard/freeform/lib/filterApplication.ts`
- Modify: `frontend/src/components/dashboard/freeform/hooks/useActionRuntime.js`
- Create: `frontend/src/components/dashboard/freeform/__tests__/filterApplicationSetRef.test.ts`

**Goal:** allow a `FilterAction.fieldMapping` entry to be `{ setRef, target }` instead of `{ source, target }`. When resolved, a set-ref entry produces a `TargetOp.filters` marker `{ __setRef: setId }` for that target field. `buildAdditionalFilters` then expands this marker into `{ field, op: 'in', values: members }` using the sets snapshot passed in.

- [ ] **Step 1: Extend the types**

Edit `frontend/src/components/dashboard/freeform/lib/actionTypes.ts`. Replace the `fieldMapping` entry type everywhere it appears with a union. Add near the top of the file:

```ts
export type FieldMappingEntry =
  | { source: string; target: string }
  | { setRef: string; target: string };
```

Then update every occurrence of `fieldMapping: { source: string; target: string }[]` in `FilterAction`, `HighlightAction`, `ChangeParameterAction`, `ChangeSetAction` to:

```ts
  fieldMapping: FieldMappingEntry[];
```

Also add a new marker type to the `TargetOp` filter variant. Replace the existing filter variant with:

```ts
  | {
      kind: 'filter';
      sheetId: string;
      filters: Record<string, unknown | { __setRef: string }>;
      clearBehavior: ActionClearBehavior;
    }
```

- [ ] **Step 2: Extend `resolveFilters`**

Edit `frontend/src/components/dashboard/freeform/lib/fieldMapping.ts`. Replace `resolveFilters` with:

```ts
import type { FieldMappingEntry } from './actionTypes';

export function resolveFilters(
  mapping: FieldMappingEntry[],
  markData: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const m of mapping) {
    if ('setRef' in m) {
      out[m.target] = { __setRef: m.setRef };
      continue;
    }
    if (m.source in markData) out[m.target] = markData[m.source];
  }
  return out;
}
```

Leave `substituteUrlTemplate` + `extractSetMembers` unchanged — `extractSetMembers` already only reads `.source` via the first mapping; ChangeSet actions never use `setRef`. Add a runtime guard:

```ts
export function extractSetMembers(
  mapping: FieldMappingEntry[],
  events: Record<string, unknown>[],
): (string | number)[] {
  if (mapping.length === 0) return [];
  const first = mapping[0];
  if (!('source' in first)) return [];   // setRef mapping is not valid for ChangeSet actions
  const sourceField = first.source;
  const seen = new Set<string | number>();
  for (const ev of events) {
    const v = ev[sourceField];
    if (typeof v === 'string' || typeof v === 'number') seen.add(v);
  }
  return [...seen];
}
```

- [ ] **Step 3: Extend `buildAdditionalFilters` with a setsSnapshot argument**

Edit `frontend/src/components/dashboard/freeform/lib/filterApplication.ts`:

```ts
import type { TargetOp } from './actionTypes';
import type { DashboardSet, SetMember } from './setTypes';

export type Filter =
  | { field: string; op: 'eq'; value: string | number | boolean | null }
  | { field: string; op: 'in'; values: SetMember[] };

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function isSetRefMarker(v: unknown): v is { __setRef: string } {
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
```

- [ ] **Step 4: Update `useActionRuntime.applyTargetOp` `case 'filter'`**

In `frontend/src/components/dashboard/freeform/hooks/useActionRuntime.js`, replace the filter branch body with:

```js
    case 'filter': {
      const s = useStore.getState();
      const snapshot = s.analystProDashboard?.sets || [];
      const filters = buildAdditionalFilters(op, snapshot);
      if (filters.length === 0) {
        s.clearSheetFilterAnalystPro(op.sheetId);
      } else {
        s.setSheetFilterAnalystPro(op.sheetId, filters);
      }
      s.markCascadeTargetStatus(op.sheetId, 'pending', token);
      break;
    }
```

- [ ] **Step 5: Add focused tests**

Create `frontend/src/components/dashboard/freeform/__tests__/filterApplicationSetRef.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildAdditionalFilters } from '../lib/filterApplication';
import type { TargetOp } from '../lib/actionTypes';
import type { DashboardSet } from '../lib/setTypes';

const makeSet = (over: Partial<DashboardSet> = {}): DashboardSet => ({
  id: 's1', name: 'Regions', dimension: 'region',
  members: ['East', 'West'],
  createdAt: '2026-04-16T00:00:00Z',
  ...over,
});

describe('buildAdditionalFilters — setRef expansion', () => {
  it('expands a __setRef marker into an in filter', () => {
    const op: TargetOp = {
      kind: 'filter',
      sheetId: 'w1',
      filters: { Region: { __setRef: 's1' } },
      clearBehavior: 'leave-filter',
    };
    expect(buildAdditionalFilters(op, [makeSet()])).toEqual([
      { field: 'Region', op: 'in', values: ['East', 'West'] },
    ]);
  });

  it('drops the marker when the referenced set is missing', () => {
    const op: TargetOp = {
      kind: 'filter', sheetId: 'w1',
      filters: { Region: { __setRef: 'ghost' } },
      clearBehavior: 'leave-filter',
    };
    expect(buildAdditionalFilters(op, [makeSet()])).toEqual([]);
  });

  it('mixes setRef and eq filters in a single op', () => {
    const op: TargetOp = {
      kind: 'filter', sheetId: 'w1',
      filters: {
        Region: { __setRef: 's1' },
        Year: 2026,
      },
      clearBehavior: 'leave-filter',
    };
    expect(buildAdditionalFilters(op, [makeSet()])).toEqual([
      { field: 'Region', op: 'in', values: ['East', 'West'] },
      { field: 'Year', op: 'eq', value: 2026 },
    ]);
  });

  it('still accepts eq-only ops with no sets snapshot', () => {
    const op: TargetOp = {
      kind: 'filter', sheetId: 'w1',
      filters: { Region: 'West' },
      clearBehavior: 'leave-filter',
    };
    expect(buildAdditionalFilters(op)).toEqual([
      { field: 'Region', op: 'eq', value: 'West' },
    ]);
  });
});
```

- [ ] **Step 6: Run all affected frontend tests**

Run:

```bash
cd frontend
npm run test:chart-ir -- filterApplication
npm run test:chart-ir -- ActionRuntime
npm run test:chart-ir -- fieldMapping
```

Expected: PASS for every file. Plan 4a's filterApplication tests should still pass because the new `setsSnapshot` argument is optional (defaults to `[]`) and the expansion path is a superset of the old eq path.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/dashboard/freeform/lib/actionTypes.ts \
        frontend/src/components/dashboard/freeform/lib/fieldMapping.ts \
        frontend/src/components/dashboard/freeform/lib/filterApplication.ts \
        frontend/src/components/dashboard/freeform/hooks/useActionRuntime.js \
        frontend/src/components/dashboard/freeform/__tests__/filterApplicationSetRef.test.ts
git commit -m "feat(analyst-pro): filter fieldMapping setRef → IN(...) filter (Plan 4b T9)"
```

---

### T10 — Backend `sql_filter_injector` — `in` op support

**Files:**
- Modify: `backend/sql_filter_injector.py`
- Create: `backend/tests/test_sql_filter_injector_in_op.py`

**Goal:** accept filter dicts of shape `{field, op: 'in', values: [...]}` and render `"field" IN (v1, v2, ...)`. Reject empty `values` lists. Reuse the existing value-rendering path.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_sql_filter_injector_in_op.py`:

```python
import pytest

from sql_filter_injector import (
    inject_additional_filters,
    FilterInjectionError,
)


class TestInOperator:
    def test_in_with_string_values(self):
        out = inject_additional_filters(
            "SELECT * FROM sales",
            [{"field": "region", "op": "in", "values": ["East", "West"]}],
        )
        assert "_askdb_filtered" in out
        assert 'WHERE "region" IN (\'East\', \'West\')' in out

    def test_in_with_numeric_values(self):
        out = inject_additional_filters(
            "SELECT * FROM sales",
            [{"field": "year", "op": "in", "values": [2024, 2025, 2026]}],
        )
        assert 'WHERE "year" IN (2024, 2025, 2026)' in out

    def test_in_with_mixed_values(self):
        out = inject_additional_filters(
            "SELECT * FROM t",
            [{"field": "code", "op": "in", "values": ["A", 1, "B"]}],
        )
        assert 'IN (\'A\', 1, \'B\')' in out

    def test_in_escapes_single_quotes(self):
        out = inject_additional_filters(
            "SELECT * FROM t",
            [{"field": "name", "op": "in", "values": ["O'Brien", "Smith"]}],
        )
        assert "'O''Brien'" in out

    def test_in_rejects_empty_values_list(self):
        with pytest.raises(FilterInjectionError):
            inject_additional_filters(
                "SELECT * FROM t",
                [{"field": "region", "op": "in", "values": []}],
            )

    def test_in_rejects_missing_values_key(self):
        with pytest.raises(FilterInjectionError):
            inject_additional_filters(
                "SELECT * FROM t",
                [{"field": "region", "op": "in"}],
            )

    def test_in_rejects_non_list_values(self):
        with pytest.raises(FilterInjectionError):
            inject_additional_filters(
                "SELECT * FROM t",
                [{"field": "region", "op": "in", "values": "East"}],
            )

    def test_in_rejects_nested_values(self):
        with pytest.raises(FilterInjectionError):
            inject_additional_filters(
                "SELECT * FROM t",
                [{"field": "region", "op": "in", "values": [{"x": 1}]}],
            )

    def test_mix_of_eq_and_in(self):
        out = inject_additional_filters(
            "SELECT * FROM sales",
            [
                {"field": "region", "op": "in", "values": ["East", "West"]},
                {"field": "year", "op": "eq", "value": 2026},
            ],
        )
        assert 'IN (\'East\', \'West\')' in out
        assert '"year" = 2026' in out
        assert " AND " in out

    def test_in_rejects_invalid_identifier(self):
        with pytest.raises(FilterInjectionError):
            inject_additional_filters(
                "SELECT * FROM t",
                [{"field": "bad field", "op": "in", "values": ["x"]}],
            )
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd backend
python -m pytest tests/test_sql_filter_injector_in_op.py -v
```

Expected: FAIL — `FilterInjectionError: Unsupported filter op: 'in'`.

- [ ] **Step 3: Extend the injector**

Open `backend/sql_filter_injector.py`. Change:

```python
_SUPPORTED_OPS = frozenset({"eq"})
```

to:

```python
_SUPPORTED_OPS = frozenset({"eq", "in"})
```

Replace `_render_predicate` with:

```python
def _render_predicate(field: str, op: str, entry: dict) -> str:
    if not _IDENT_RE.match(field):
        raise FilterInjectionError(f"Invalid filter field name: {field!r}")
    if op not in _SUPPORTED_OPS:
        raise FilterInjectionError(f"Unsupported filter op: {op!r}")

    if op == "in":
        values = entry.get("values")
        if not isinstance(values, list) or len(values) == 0:
            raise FilterInjectionError(
                f"'in' filter requires a non-empty 'values' list: {field!r}"
            )
        rendered = []
        for v in values:
            if isinstance(v, (str, int, float, bool)) or v is None:
                rendered.append(_render_value(v))
            else:
                raise FilterInjectionError(
                    f"Unsupported filter value type in 'in' list: {type(v).__name__}"
                )
        return f'"{field}" IN ({", ".join(rendered)})'

    # eq
    value = entry.get("value")
    if value is None:
        return f'"{field}" IS NULL'
    return f'"{field}" = {_render_value(value)}'
```

Finally update `inject_additional_filters` to pass the whole entry rather than breaking out `value`:

```python
def inject_additional_filters(
    sql: str,
    filters: Optional[Iterable[dict]],
) -> str:
    """See module docstring for contract."""
    filters_list = list(filters) if filters else []
    if not filters_list:
        return sql

    predicates = [
        _render_predicate(f["field"], f.get("op", "eq"), f)
        for f in filters_list
    ]

    base = sql.rstrip().rstrip(";").rstrip()
    where = " AND ".join(predicates)
    return f"SELECT * FROM ({base}) AS _askdb_filtered WHERE {where}"
```

- [ ] **Step 4: Run both injector test files**

Run:

```bash
cd backend
python -m pytest tests/test_sql_filter_injector.py tests/test_sql_filter_injector_in_op.py -v
```

Expected: all tests PASS (Plan 4a 11 + Plan 4b 10). The existing Plan 4a tests pass because `_render_predicate` now ignores the old `value` parameter path but still reads `entry.get("value")` when the op is eq.

- [ ] **Step 5: Run the full backend suite**

Run:

```bash
cd backend
python -m pytest tests/ -v
```

Expected: full suite green. Check specifically that `tests/test_execute_additional_filters.py` still passes — it exercises the eq path end-to-end.

- [ ] **Step 6: Extend the Pydantic model to accept `values`**

Open `backend/routers/query_routes.py`. Find the `_AdditionalFilter` class (added in Plan 4a T4, around line 165). Replace with:

```python
class _AdditionalFilter(BaseModel):
    field: str
    op: str = "eq"
    value: Optional[object] = None
    values: Optional[list[object]] = None
```

This unlocks `in` ops through the HTTP layer. No other change is needed — the injector handles both shapes. Re-run the execute tests to confirm they still pass:

```bash
cd backend
python -m pytest tests/test_execute_additional_filters.py -v
```

Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add backend/sql_filter_injector.py \
        backend/routers/query_routes.py \
        backend/tests/test_sql_filter_injector_in_op.py
git commit -m "feat(analyst-pro): sql_filter_injector supports in op + pydantic (Plan 4b T10)"
```

---

### T11 — End-to-end integration + smoke

**Files:**
- Create: `frontend/src/components/dashboard/freeform/__tests__/ChangeSetRuntime.integration.test.tsx`

**Goal:** prove the whole chain: Filter action with `setRef` → action cascade → `analystProSheetFilters` slice holds an `in` filter → the mocked `api.executeSQL` receives `additional_filters` with `op:'in'`. Plus: a separate ChangeSet action mutates the set, which (when the corresponding Filter runs again) produces a different member list.

- [ ] **Step 1: Write the integration test**

Create `frontend/src/components/dashboard/freeform/__tests__/ChangeSetRuntime.integration.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, waitFor } from '@testing-library/react';
import React from 'react';

import { useStore } from '../../../../store';
import { publish } from '../lib/markEventBus';
import { useActionRuntime } from '../hooks/useActionRuntime';
import AnalystProWorksheetTile from '../AnalystProWorksheetTile';

vi.mock('../../../../api', () => ({
  api: { executeSQL: vi.fn() },
}));

import { api } from '../../../../api';

const baseTile = {
  id: 'w1',
  title: 'Sales',
  sql: 'SELECT region, total FROM sales',
  question: 'q',
  columns: ['region', 'total'],
  rows: [['East', 10]],
};

function Harness({ sheetId }) {
  useActionRuntime();
  return <AnalystProWorksheetTile tile={baseTile} sheetId={sheetId} />;
}

const dashboardWithSetFilter = {
  id: 'd1',
  archetype: 'analyst-pro',
  size: { mode: 'automatic' },
  tiledRoot: { id: 'r', type: 'container-horz', w: 100000, h: 100000, children: [] },
  floatingLayer: [],
  worksheets: [],
  parameters: [],
  sets: [{
    id: 's1',
    name: 'Regions',
    dimension: 'Region',
    members: ['East'],
    createdAt: '2026-04-16T00:00:00Z',
  }],
  actions: [
    // ChangeSet on src/select adds the moused-over Region to the set.
    {
      id: 'a1',
      kind: 'change-set',
      name: 'Add',
      enabled: true,
      sourceSheets: ['picker'],
      trigger: 'select',
      targetSetId: 's1',
      fieldMapping: [{ source: 'Region', target: 'Region' }],
      operation: 'add',
    },
    // Filter on fire/select applies the set members to worksheet w1 as IN(...).
    {
      id: 'a2',
      kind: 'filter',
      name: 'ApplySet',
      enabled: true,
      sourceSheets: ['fire'],
      trigger: 'select',
      targetSheets: ['w1'],
      fieldMapping: [{ setRef: 's1', target: 'Region' }],
      clearBehavior: 'leave-filter',
    },
  ],
};

describe('Plan 4b integration — changeSet → filter with setRef', () => {
  beforeEach(() => {
    api.executeSQL.mockReset();
    api.executeSQL.mockResolvedValue({ columns: ['region', 'total'], rows: [['East', 10]] });
    useStore.setState({
      analystProDashboard: dashboardWithSetFilter,
      analystProSheetFilters: {},
      analystProSheetHighlights: {},
      analystProActionCascadeToken: 0,
      analystProActiveCascadeTargets: {},
      activeConnection: { conn_id: 'c1' },
      analystProHistory: { past: [], present: null, future: [], maxEntries: 500 },
    });
  });

  afterEach(() => {
    useStore.setState({
      analystProDashboard: null,
      analystProSheetFilters: {},
      analystProSheetHighlights: {},
    });
  });

  it('ChangeSet + Filter-with-setRef produce IN filter reflecting current set members', async () => {
    render(<Harness sheetId="w1" />);

    // Step 1 — ChangeSet action adds 'West' to the set.
    act(() => {
      publish({
        sourceSheetId: 'picker', trigger: 'select',
        markData: { Region: 'West' }, timestamp: Date.now(),
      });
    });

    const sets = useStore.getState().analystProDashboard.sets;
    expect(sets[0].members).toEqual(['East', 'West']);

    // Step 2 — Filter action fires, should write an in-filter to slice using current set members.
    act(() => {
      publish({
        sourceSheetId: 'fire', trigger: 'select',
        markData: {}, timestamp: Date.now(),
      });
    });

    const slice = useStore.getState().analystProSheetFilters.w1;
    expect(slice).toEqual([
      { field: 'Region', op: 'in', values: ['East', 'West'] },
    ]);

    // Step 3 — AnalystProWorksheetTile calls api.executeSQL with that payload.
    await waitFor(() => {
      expect(api.executeSQL).toHaveBeenCalledTimes(1);
    });
    const [sql, question, connId, originalSql, additionalFilters] =
      api.executeSQL.mock.calls[0];
    expect(sql).toBe('SELECT region, total FROM sales');
    expect(connId).toBe('c1');
    expect(originalSql).toBeNull();
    expect(additionalFilters).toEqual([
      { field: 'Region', op: 'in', values: ['East', 'West'] },
    ]);
  });

  it('Filter with setRef to unknown set emits no filter and clears the slice', async () => {
    useStore.setState({
      analystProDashboard: {
        ...dashboardWithSetFilter,
        sets: [], // drop the set entirely
      },
    });
    render(<Harness sheetId="w1" />);

    act(() => {
      publish({
        sourceSheetId: 'fire', trigger: 'select',
        markData: {}, timestamp: Date.now(),
      });
    });

    expect(useStore.getState().analystProSheetFilters.w1).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the integration test**

Run:

```bash
cd frontend
npm run test:chart-ir -- ChangeSetRuntime
```

Expected: PASS (2 tests).

- [ ] **Step 3: Frontend full smoke**

Run:

```bash
cd frontend
npm run test:chart-ir
npm run lint
npm run build
```

Expected: all three green. Acceptable to see pre-existing warnings (e.g. `useDragResize` dep warning). No new warnings introduced.

Report the test-count delta vs. Plan 4a tip — expected `+18` (setOps) `+6` (SetMemberDialog) `+9` (SetsPanel) `+2` (ActionRuntime additions) `+4` (filterApplicationSetRef) `+2` (ChangeSetRuntime) = **`+41`**.

- [ ] **Step 4: Backend full smoke**

Run:

```bash
cd backend
python -m pytest tests/ -v
```

Expected: full suite green. New tests: `test_sets_roundtrip.py` (3) + `test_sql_filter_injector_in_op.py` (10).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/freeform/__tests__/ChangeSetRuntime.integration.test.tsx
git commit -m "test(analyst-pro): E2E changeSet → setRef filter integration (Plan 4b T11)"
```

---

## Out of Scope (deferred)

- Formula-based sets ("members where `SUM(sales) > 10000`") — Plan 4c.
- Set symmetric-diff / intersect / union combinators between sets — Plan 4c.
- Sheet-level direct "use set as filter" control (outside the action cascade) — Plan 4c.
- Set-in/out visual encoding on worksheet marks (Vega-Lite condition) — Plan 4c.
- Persistence snapshot tests for undo/redo of set edits — covered by existing `analystProHistory` guarantees; revisit if regressions surface.
- Permission enforcement on set edits beyond dashboard ownership — Plan 5.

---

## Rollout

- All additions live behind `settings.FEATURE_ANALYST_PRO`.
- `SetsPanel` only mounts inside `AnalystProLayout`; other archetypes are unaffected.
- Dashboard payloads keep `sets: []` default; non-Analyst-Pro dashboards are zero-diff.
- `sql_filter_injector.in` op is additive — every prior caller passes only `eq`, so existing queries remain identical.

---

## Review Anchors

- **Spec compliance:** `DashboardSet` shape matches T1; `applySetChange` preserves order + caps at `MAX_SET_MEMBERS`; `SetsPanel` mounts below `LayoutTreePanel`; `useActionRuntime` `case 'change-set'` calls `applySetChangeAnalystPro`; `sql_filter_injector` emits `"field" IN (…)`.
- **Code quality:** no `import anthropic` anywhere except `backend/anthropic_provider.py`; no ECharts usage; action/state name prefix `analystPro*`; no `console.log`; no emoji.
- **Security invariants:** injector still wraps the original SQL as a subquery fed to `SQLValidator`; identifier regex unchanged; every `in` value quoted or numerically rendered — no string interpolation of untrusted values.
- **Dependency on Plan 4a:** filter TargetOps still flow through `buildAdditionalFilters` + `setSheetFilterAnalystPro` + `AnalystProWorksheetTile` re-query. Plan 4b only adds the `setRef` expansion path and the `in` op — no change to the filter runtime topology.
