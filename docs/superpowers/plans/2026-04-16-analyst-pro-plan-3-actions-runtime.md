# Plan 3 — Analyst Pro Actions Runtime

Date: 2026-04-16
Parent spec: `docs/superpowers/specs/2026-04-16-analyst-pro-tableau-parity-design.md` (Section 7)
Previous phase: `docs/superpowers/plans/2026-04-16-analyst-pro-plan-2b-canvas-polish.md`
Status: Ready for subagent execution

---

## Goal

Ship the Tableau-parity **Actions subsystem** for Analyst Pro:
- 6 action types — Filter, Highlight, URL, GoToSheet, ChangeParameter, ChangeSet.
- Cascade executor with cancel-on-newer semantics.
- Dashboard "Actions" dialog for CRUD.
- Backend `/api/v1/dashboards/{id}/actions/{aid}/fire` endpoint for audit + server-side filter plan building.
- Wire mark-selection events from worksheet zones → runtime → target zones.

Performance targets (from parent spec):
- Action cascade (1 source → 5 targets): **< 250ms p95** (vs Tableau 800-1500ms).
- Hover→render fast path (turbo tier hit): **< 120ms**.
- Cancel-on-newer: stale cascade aborted within 1 frame of newer fire.

Non-goals:
- Set management UI (→ Plan 4). ChangeSetAction ships but needs a Set to point at — we ship a minimal Set fixture for tests until Plan 4 lands the UI.
- Dynamic Zone Visibility (→ Plan 4).
- Migration of existing "tableau" archetype actions (none exist).

---

## Architecture

**Data flow**:
```
 User interacts with worksheet mark (hover/select/menu)
            ↓
  MarkEvent { sheetId, trigger, markData, timestamp }
            ↓
  useActionRuntime hook
            ↓
  actionExecutor.executeCascade(actions, event)
    - find matching actions (sourceSheets + trigger)
    - sort alphabetically by name
    - per action, compute TargetOperation[]
    - dispatch to waterfall router (one HTTP/2 multiplex)
    - emit partial results into target zone state
    - cancellation token aborts if newer event fires
            ↓
  target zones re-render via Arrow IPC
```

**State lives in Zustand** (new `analystProActions` slice additions):
- `actions: ActionDefinition[]` — per-dashboard registry (persisted as part of Dashboard)
- `actionCascadeToken: number` — monotonic counter; every new fire bumps. Stale cascades check before applying.
- `actionsDialogOpen: boolean`
- `activeCascadeTargets: Record<sheetId, CascadeStatus>` — { pending | streaming | done | cancelled }

**Pure libs** (unit-testable without React):
- `frontend/src/components/dashboard/freeform/lib/actionTypes.ts` — types.
- `frontend/src/components/dashboard/freeform/lib/actionExecutor.ts` — matching + target-op derivation (no side effects beyond returning ops).
- `frontend/src/components/dashboard/freeform/lib/fieldMapping.ts` — resolve source→target field mapping.

**Hooks**:
- `useActionRuntime.js` — listens to MarkEvents via a shared event bus (`analystProMarkEvents$`), calls executor, dispatches target ops.

**Components**:
- `ActionsDialog.jsx` — full-screen modal with table + create/edit form.
- `ActionRow.jsx` — table row with toggle (enabled), inline edit, delete.
- `ActionForm.jsx` — create/edit form with type-specific fields.
- `ActionsMenuButton.jsx` — opens the dialog.

**Backend**:
- `POST /api/v1/dashboards/{id}/actions/{aid}/fire` — receives mark data, returns server-side filter plan hints for the target queries, logs audit row.

---

## Task Checklist

- [ ] T1. `actionTypes.ts` — 6 action TypeScript types + discriminated union.
- [ ] T2. `fieldMapping.ts` — pure field resolver + tests.
- [ ] T3. `actionExecutor.ts` — match actions + derive target ops + tests.
- [ ] T4. Store extension — actions CRUD + cascade token + dialog flag.
- [ ] T5. `useActionRuntime.js` hook + mark event bus + tests.
- [ ] T6. `ActionsDialog.jsx` + `ActionForm.jsx` + `ActionRow.jsx` components + tests.
- [ ] T7. `ActionsMenuButton.jsx` + wire into AnalystProLayout toolbar.
- [ ] T8. Backend `POST /dashboards/{id}/actions/{aid}/fire` endpoint + pytest.
- [ ] T9. Persist `actions` in dashboard save/load (frontend + backend).
- [ ] T10. Smoke: tests green, lint clean, build green; end-to-end fire-cascade integration test.

---

## Task Specifications

### T1 — actionTypes.ts

**File**: `frontend/src/components/dashboard/freeform/lib/actionTypes.ts` (new)

```ts
export type ActionTrigger = 'hover' | 'select' | 'menu';
export type ActionClearBehavior = 'leave-filter' | 'show-all' | 'exclude-all';
export type UrlTarget = 'new-tab' | 'iframe' | 'current-tab';

export type BaseAction = {
  id: string;
  name: string;
  enabled?: boolean;  // default true
  sourceSheets: string[];  // worksheet zone ids
  trigger: ActionTrigger;
};

export type FilterAction = BaseAction & {
  kind: 'filter';
  targetSheets: string[];
  fieldMapping: { source: string; target: string }[];
  clearBehavior: ActionClearBehavior;
};

export type HighlightAction = BaseAction & {
  kind: 'highlight';
  targetSheets: string[];
  fieldMapping: { source: string; target: string }[];
};

export type UrlAction = BaseAction & {
  kind: 'url';
  template: string;  // e.g. 'https://crm/{AccountId}'
  urlTarget: UrlTarget;
};

export type GoToSheetAction = BaseAction & {
  kind: 'goto-sheet';
  targetSheetId: string;
};

export type ChangeParameterAction = BaseAction & {
  kind: 'change-parameter';
  targetParameterId: string;
  fieldMapping: { source: string; target: string }[];  // single-entry: source mark field → parameter value
  aggregation?: 'first' | 'sum' | 'avg';  // if multi-mark selection
};

export type ChangeSetAction = BaseAction & {
  kind: 'change-set';
  targetSetId: string;
  fieldMapping: { source: string; target: string }[];
  operation: 'replace' | 'add' | 'remove' | 'toggle';
};

export type ActionDefinition =
  | FilterAction
  | HighlightAction
  | UrlAction
  | GoToSheetAction
  | ChangeParameterAction
  | ChangeSetAction;

/** Shape of a mark event from a worksheet zone. */
export type MarkEvent = {
  sourceSheetId: string;
  trigger: ActionTrigger;
  markData: Record<string, unknown>;  // field → value for the interacted mark
  timestamp: number;
  multipleMarks?: Record<string, unknown>[];  // for lasso / multi-select
};

/** A single target operation emitted by the executor. */
export type TargetOp =
  | { kind: 'filter'; sheetId: string; filters: Record<string, unknown>; clearBehavior: ActionClearBehavior }
  | { kind: 'highlight'; sheetId: string; fieldValues: Record<string, unknown> }
  | { kind: 'url'; url: string; urlTarget: UrlTarget }
  | { kind: 'goto-sheet'; sheetId: string }
  | { kind: 'change-parameter'; parameterId: string; value: unknown }
  | { kind: 'change-set'; setId: string; members: (string | number)[]; operation: 'replace' | 'add' | 'remove' | 'toggle' };
```

**Tests**: none — type-only. Downstream tasks test usage.

**Acceptance**: TS compiles.

---

### T2 — fieldMapping.ts

**File**: `frontend/src/components/dashboard/freeform/lib/fieldMapping.ts` (new)
**Test**: `frontend/src/components/dashboard/freeform/__tests__/fieldMapping.test.ts` (new)

```ts
export function resolveFilters(
  mapping: { source: string; target: string }[],
  markData: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const m of mapping) {
    if (m.source in markData) out[m.target] = markData[m.source];
  }
  return out;
}

export function substituteUrlTemplate(
  template: string,
  markData: Record<string, unknown>,
): string {
  return template.replace(/\{([^}]+)\}/g, (_, key) => {
    const v = markData[key];
    return v == null ? '' : encodeURIComponent(String(v));
  });
}

export function extractSetMembers(
  mapping: { source: string; target: string }[],
  events: Record<string, unknown>[],
): (string | number)[] {
  if (mapping.length === 0) return [];
  const sourceField = mapping[0].source;
  const seen = new Set<string | number>();
  for (const ev of events) {
    const v = ev[sourceField];
    if (typeof v === 'string' || typeof v === 'number') seen.add(v);
  }
  return [...seen];
}
```

**Tests** (8):
1. `resolveFilters` with single mapping → single-key output.
2. `resolveFilters` with missing source key → key omitted.
3. `resolveFilters` with empty mapping → empty object.
4. `substituteUrlTemplate` with simple `{AccountId}` → replaced.
5. `substituteUrlTemplate` with URL-encoding (space in value) → encoded.
6. `substituteUrlTemplate` with missing key → replaced with empty string.
7. `extractSetMembers` with 3 events sharing a field → dedup'd member list.
8. `extractSetMembers` with empty mapping → empty.

**Acceptance**: tests pass, TS clean.

---

### T3 — actionExecutor.ts

**File**: `frontend/src/components/dashboard/freeform/lib/actionExecutor.ts` (new)
**Test**: `frontend/src/components/dashboard/freeform/__tests__/actionExecutor.test.ts` (new)

```ts
import type { ActionDefinition, MarkEvent, TargetOp } from './actionTypes';
import { resolveFilters, substituteUrlTemplate, extractSetMembers } from './fieldMapping';

/**
 * Returns the ordered list of TargetOps produced by matching `event` against
 * `actions`. Pure function — no side effects. Matches by sourceSheets + trigger.
 * Sorts matched actions alphabetically by name (Tableau compat).
 * Respects `enabled !== false`.
 */
export function matchActions(
  actions: ActionDefinition[],
  event: MarkEvent,
): ActionDefinition[] {
  return [...actions]
    .filter(
      (a) =>
        a.enabled !== false &&
        a.sourceSheets.includes(event.sourceSheetId) &&
        a.trigger === event.trigger,
    )
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function deriveTargetOps(
  action: ActionDefinition,
  event: MarkEvent,
): TargetOp[] {
  switch (action.kind) {
    case 'filter': {
      const filters = resolveFilters(action.fieldMapping, event.markData);
      return action.targetSheets.map((sheetId) => ({
        kind: 'filter',
        sheetId,
        filters,
        clearBehavior: action.clearBehavior,
      } as TargetOp));
    }
    case 'highlight': {
      const fieldValues = resolveFilters(action.fieldMapping, event.markData);
      return action.targetSheets.map((sheetId) => ({
        kind: 'highlight', sheetId, fieldValues,
      } as TargetOp));
    }
    case 'url': {
      const url = substituteUrlTemplate(action.template, event.markData);
      return [{ kind: 'url', url, urlTarget: action.urlTarget }];
    }
    case 'goto-sheet':
      return [{ kind: 'goto-sheet', sheetId: action.targetSheetId }];
    case 'change-parameter': {
      if (action.fieldMapping.length === 0) return [];
      const m0 = action.fieldMapping[0];
      const value = event.markData[m0.source];
      return [{ kind: 'change-parameter', parameterId: action.targetParameterId, value }];
    }
    case 'change-set': {
      const events = event.multipleMarks ?? [event.markData];
      const members = extractSetMembers(action.fieldMapping, events);
      return [{
        kind: 'change-set',
        setId: action.targetSetId,
        members,
        operation: action.operation,
      }];
    }
  }
}

export function executeCascade(
  actions: ActionDefinition[],
  event: MarkEvent,
): TargetOp[] {
  const matched = matchActions(actions, event);
  return matched.flatMap((a) => deriveTargetOps(a, event));
}
```

**Tests** (12):
1. `matchActions` filters by sourceSheets.
2. `matchActions` filters by trigger.
3. `matchActions` filters by enabled !== false.
4. `matchActions` sorts alphabetically by name.
5. `deriveTargetOps` Filter → N target ops (one per target sheet).
6. `deriveTargetOps` Highlight → target ops with fieldValues.
7. `deriveTargetOps` URL → substituted + urlTarget preserved.
8. `deriveTargetOps` GoToSheet → single op.
9. `deriveTargetOps` ChangeParameter → single op with resolved value.
10. `deriveTargetOps` ChangeSet replace with single mark → 1-member set.
11. `deriveTargetOps` ChangeSet with multiple marks → dedup members.
12. `executeCascade` with 2 matching actions + 1 non-matching → ops from the 2 only, in alphabetical order.

**Acceptance**: tests pass.

---

### T4 — Store extension

**File**: `frontend/src/store.js`

Add inside the `analystPro` slice:

```js
// Plan 3: Actions
analystProActionCascadeToken: 0,
analystProActionsDialogOpen: false,
analystProActiveCascadeTargets: {},

setActionsDialogOpen: (open) => set({ analystProActionsDialogOpen: !!open }),

addActionAnalystPro: (action) => {
  const dash = get().analystProDashboard;
  if (!dash) return;
  const nextDash = { ...dash, actions: [...(dash.actions || []), action] };
  set({ analystProDashboard: nextDash });
  get().pushAnalystProHistory(nextDash);
},

updateActionAnalystPro: (actionId, patch) => {
  const dash = get().analystProDashboard;
  if (!dash) return;
  const next = (dash.actions || []).map((a) => (a.id === actionId ? { ...a, ...patch } : a));
  const nextDash = { ...dash, actions: next };
  set({ analystProDashboard: nextDash });
  get().pushAnalystProHistory(nextDash);
},

deleteActionAnalystPro: (actionId) => {
  const dash = get().analystProDashboard;
  if (!dash) return;
  const next = (dash.actions || []).filter((a) => a.id !== actionId);
  const nextDash = { ...dash, actions: next };
  set({ analystProDashboard: nextDash });
  get().pushAnalystProHistory(nextDash);
},

fireActionCascadeAnalystPro: () => {
  const token = get().analystProActionCascadeToken + 1;
  set({ analystProActionCascadeToken: token, analystProActiveCascadeTargets: {} });
  return token;
},

markCascadeTargetStatus: (sheetId, status, token) => {
  // Ignore if stale
  if (token !== get().analystProActionCascadeToken) return;
  set((s) => ({
    analystProActiveCascadeTargets: { ...s.analystProActiveCascadeTargets, [sheetId]: status },
  }));
},
```

**Acceptance**: Actions can be added, updated, deleted. Cascade token increments. Stale writes are ignored.

---

### T5 — useActionRuntime hook + mark event bus

**Files**:
- `frontend/src/components/dashboard/freeform/lib/markEventBus.ts` (new) — tiny pub/sub.
- `frontend/src/components/dashboard/freeform/hooks/useActionRuntime.js` (new).
- `frontend/src/components/dashboard/freeform/__tests__/useActionRuntime.test.tsx` (new).

```ts
// markEventBus.ts
type Listener = (event: MarkEvent) => void;
const listeners = new Set<Listener>();

export function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function publish(event: MarkEvent) {
  for (const l of listeners) l(event);
}
```

```js
// useActionRuntime.js
import { useEffect } from 'react';
import { useStore } from '../../../../store';
import { subscribe } from '../lib/markEventBus';
import { executeCascade } from '../lib/actionExecutor';

export function useActionRuntime() {
  useEffect(() => {
    return subscribe((event) => {
      const { analystProDashboard, fireActionCascadeAnalystPro } = useStore.getState();
      if (!analystProDashboard?.actions?.length) return;
      const token = fireActionCascadeAnalystPro();
      const ops = executeCascade(analystProDashboard.actions, event);
      for (const op of ops) applyTargetOp(op, token);
    });
  }, []);
}

function applyTargetOp(op, token) {
  const store = useStore.getState();
  switch (op.kind) {
    case 'filter':
      store.markCascadeTargetStatus(op.sheetId, 'pending', token);
      // TODO Plan 3b: call waterfall router. For now just mark done after 0ms.
      setTimeout(() => store.markCascadeTargetStatus(op.sheetId, 'done', token), 0);
      break;
    case 'highlight':
      store.markCascadeTargetStatus(op.sheetId, 'done', token);
      break;
    case 'url':
      if (op.urlTarget === 'new-tab') window.open(op.url, '_blank', 'noopener');
      // iframe/current-tab: implement later
      break;
    case 'goto-sheet':
      // TODO: scroll/focus the target zone
      break;
    case 'change-parameter':
      // TODO: integrate with parameter system
      break;
    case 'change-set':
      // TODO: integrate with set system (Plan 4)
      break;
  }
}
```

**Tests** (4):
1. Hook subscribes on mount, unsubscribes on unmount.
2. Publishing a MarkEvent when no actions exist → no-op.
3. Publishing when actions match → cascade token bumps, target statuses set.
4. Stale cascade tokens ignored (bump token manually, then call markCascadeTargetStatus with old token → state unchanged).

**Acceptance**: tests pass, hook is non-leaky.

---

### T6 — ActionsDialog UI

**Files**:
- `frontend/src/components/dashboard/freeform/panels/ActionsDialog.jsx` (new)
- `frontend/src/components/dashboard/freeform/panels/ActionForm.jsx` (new)
- `frontend/src/components/dashboard/freeform/__tests__/ActionsDialog.test.tsx` (new)

**Dialog structure** (modal):
- Header: "Actions" + close X.
- Table of existing actions (columns: name / type / source / target / trigger / enabled toggle / edit / delete).
- "+ Add Action" button.
- On "add" or "edit" click, show ActionForm in place of table.
- ActionForm fields:
  - Name (text)
  - Type (dropdown: Filter / Highlight / URL / Go to Sheet / Change Parameter / Change Set)
  - Source sheets (multi-select of dashboard worksheet zones)
  - Trigger (radio: hover / select / menu)
  - Type-specific fields: target sheet(s), field mapping rows, URL template, etc.
  - Save / Cancel buttons.

Reasonable HTML (no design-system dep):
```jsx
<div role="dialog" aria-label="Actions" className="actions-dialog-backdrop">
  <div className="actions-dialog">
    <h2>Actions</h2>
    {!editing && (
      <>
        <table>...</table>
        <button onClick={startCreate}>+ Add Action</button>
      </>
    )}
    {editing && <ActionForm initial={editing} onSave={save} onCancel={cancel} />}
    <button onClick={close}>Close</button>
  </div>
</div>
```

**Tests** (5):
1. Dialog renders closed by default when `analystProActionsDialogOpen: false`.
2. When open, renders table of existing actions.
3. Clicking "+ Add Action" shows the form.
4. Submitting form calls `addActionAnalystPro` with the right shape.
5. Clicking delete on a row calls `deleteActionAnalystPro`.

**Acceptance**: tests pass, dialog is a11y-correct (role=dialog, focus trap acceptable — vitest doesn't require full focus mgmt but aria-label must be present).

---

### T7 — ActionsMenuButton + wire into toolbar

**File**:
- `frontend/src/components/dashboard/freeform/panels/ActionsMenuButton.jsx` (new)
- Modify `frontend/src/components/dashboard/modes/AnalystProLayout.jsx` (add button + dialog mount)

```jsx
export default function ActionsMenuButton() {
  const open = useStore((s) => s.setActionsDialogOpen);
  return (
    <button type="button" aria-label="Dashboard actions" title="Actions" onClick={() => open(true)}>
      ⚡ Actions
    </button>
  );
}
```

Wire in AnalystProLayout toolbar row (after LayoutOverlayToggle, separator first). Also mount `<ActionsDialog />` inside the root div — the dialog gates itself on the store flag.

Also add: call `useActionRuntime()` inside the AnalystProLayout body so the hook is registered while the archetype is mounted.

**Tests**: none — covered by T6 + integration.

**Acceptance**: clicking the button opens the dialog.

---

### T8 — Backend fire endpoint

**Files**:
- `backend/routers/dashboard_routes.py` — extend with new endpoint
- `backend/tests/test_actions_fire.py` (new pytest)

**Endpoint contract**:
```
POST /api/v1/dashboards/{dashboard_id}/actions/{action_id}/fire
Body: { markData: dict, trigger: 'hover' | 'select' | 'menu', timestamp: int }

Response:
{
  accepted: true,
  cascadeId: 'ck...',
  targets: [
    { sheetId: 'w1', filterPlanHints: { Week: '2026-W12' } },
    ...
  ],
  auditRef: 'query_decisions.jsonl offset'
}
```

Pydantic models:
```python
class MarkEventIn(BaseModel):
    markData: dict
    trigger: Literal['hover', 'select', 'menu']
    timestamp: int

class FireResponse(BaseModel):
    accepted: bool
    cascadeId: str
    targets: List[dict]
    auditRef: str | None = None
```

Implementation:
- Load dashboard + the action by id (ownership check via current_user).
- Validate action kind supports cascade (filter/highlight/change-parameter/change-set).
- Build `filterPlanHints` per target by applying fieldMapping to markData.
- Write to audit trail: `{action_id, source_sheet, trigger, mark_keys, target_count, timestamp}`.
- Return cascade plan.

The **actual query firing** happens on the frontend via the existing waterfall router — this endpoint is for audit, server-side plan hints, and future permission enforcement.

**Tests** (3):
1. POST returns 200 with expected structure for a filter action on an owned dashboard.
2. POST returns 404 for unknown dashboard.
3. POST returns 403 for a dashboard owned by another user.

**Acceptance**: pytest passes; audit file has the fire event.

---

### T9 — Persist actions in save/load

**Files**:
- `backend/dashboard_migration.py` — ensure `actions` list preserved in schema v1 output.
- `backend/routers/dashboard_routes.py` — save endpoint already writes the full dashboard JSON; verify `actions` round-trips.
- `frontend/src/store.js` — saving a dashboard via existing save action already includes `dashboard.actions`. Verify.

**Tests**:
- Backend: extend existing dashboard migration test (or add a small new test) asserting `actions` survives round-trip.
- Frontend: add one test to `LayoutTreePanel.test.tsx` or a new store-level test asserting that calling `addActionAnalystPro` then reading the dashboard shows the action in the list.

**Acceptance**: actions persist.

---

### T10 — Smoke + end-to-end integration test

**File**: `frontend/src/components/dashboard/freeform/__tests__/ActionRuntime.integration.test.tsx` (new).

End-to-end test:
1. Seed store with a dashboard containing one FilterAction (source=A, target=B, field Week→Week).
2. Mount a minimal harness that renders the runtime hook.
3. Publish a MarkEvent with sourceSheetId=A, trigger='select', markData={Week:'2026-W12'}.
4. Assert cascade token incremented; `analystProActiveCascadeTargets['B']` transitions to 'pending' then 'done'.

Plus:
```bash
cd frontend
npm run test:chart-ir -- freeform
npm run lint
npm run build

cd backend
python -m pytest tests/test_actions_fire.py -v
```

All green. Report freeform test count delta.

---

## Out of Scope (deferred to later plans)

- Actual filter injection into worksheet queries (requires worksheet runtime that doesn't fully exist yet — Plan 4 will wire the real query fire).
- Multi-select / lasso marquee on worksheets (needs worksheet-level selection system).
- Action throttling / debouncing for hover-trigger on fast mouse movement.
- Sets management UI (Plan 4).
- Dynamic Zone Visibility (Plan 4).
- Permission enforcement on fire endpoint beyond ownership.

---

## Rollout

- All changes behind `FEATURE_ANALYST_PRO` flag.
- Actions dialog visible only when archetype is `analyst-pro`.
- Backend endpoint returns 404 when flag disabled.

---

## Review Anchors

Fresh subagents per task, two-stage review (spec compliance + code quality) per task. After T10, final reviewer scans all Plan 3 commits together.
