# Analyst Pro — Plan 6b: Undo/Redo Toolbar UI + History Inspector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Analyst Pro undo stack visible and navigable — surface `↶ Undo (N)` / `↷ Redo (M)` buttons with operation-name tooltips in the top toolbar, add a toggleable `HistoryInspectorPanel` that lists the last 50 operations newest-first with a zone-level diff preview, and let users jump to any past state via `jumpToHistoryAnalystPro(index)`. Every existing `pushAnalystProHistory` callsite gains a human-readable `operation` label so labels round-trip through undo/redo.

**Architecture:** The single workbook-level undo stack already exists (`analystProHistory = { past, present, future, maxEntries: 500 }` in `store.js:1021-1051`) but stores raw `Dashboard` snapshots. This plan upgrades each slot to a `HistoryEntry = { snapshot: Dashboard, operation: string, timestamp: number }`, extends `pushAnalystProHistory(dashboard, operation?)` (default `"Edit dashboard"`), wires every existing callsite to pass a real label, and adds `jumpToHistoryAnalystPro(index)`. The new `HistoryInspectorPanel` is a floating-rail panel mounted by `AnalystProLayout.jsx`, driven purely from the store; diff preview is a pure function `diffDashboardZones(prev, next)` over the tiled tree + floating layer. View-state (`analystProHistoryPanelOpen`) is ephemeral and never pushed onto the stack — mirroring Plan 6a's treatment of zoom/pan.

**Tech Stack:** React 19, Zustand (`frontend/src/store.js`), Vitest 2.x + Testing Library (jsdom), JavaScript (`.jsx` for components per freeform convention, `.ts` for pure lib helpers per `chart-ir`/`freeform/lib` carve-out).

**Canonical references (read before every task):**
- `QueryCopilot V1/docs/Build_Tableau.md` §I.4 — "User gesture → multiple fine-grained `Delta` records → coalesced into one `WorkbookCommittedEdit` that becomes one undo step." Our `pushAnalystProHistory` is our coalesced `WorkbookCommittedEdit`; each push = one undo step. The `operation` label is the human-readable name for that commit.
- `Build_Tableau.md` §XVII.1 — "Single workbook-level stack. Granularity: per-command (one `Action*` class = one step)." We keep a single `analystProHistory` stack; each labelled push = one command.
- `Build_Tableau.md` §XVII.2 — `RevertWorkbook` reverts to last saved on-disk state; distinct from undo. This plan does **not** implement Revert — undo/redo/jump only. Revert is a later plan.
- `Build_Tableau.md` §XVII.3 — Delta primitives: `HighlightDelta`, `PageDelta`, `ParameterDelta`, `ShelfSortDelta`, `StylesDelta`, `ZoneTextDelta`, `FilterDelta`, `FilterMsgEdit`. Common interface `IHistoryElement`. Event flow: `HistoryUpdatedMsg` / `WorkbookCommittedEdit`. Our operation labels (below) mirror these categories where applicable (Parameter → "Change parameter value", Zone text → "Update zone", Styles → "Change zone property", etc.).
- `QueryCopilot V1/docs/analyst_pro_tableau_parity_roadmap.md` §Plan 6b — authoritative scope.
- `QueryCopilot V1/CLAUDE.md` — store naming (`…AnalystPro` actions, `analystPro…` state), TDD rule, commit format `feat(analyst-pro): <verb> <object> (Plan 6b Tn)`.

**Scope boundaries:**
- This plan does NOT implement Revert (`RevertWorkbook` / `RevertStoryPoint`, §XVII.2). Later plan.
- This plan does NOT implement delta coalescing / time-bucketing beyond what `setZonePropertyAnalystPro` already does (deep-equal short-circuit at `store.js:1218-1229`). Coalescing multi-step gestures into a single push is out of scope — gesture boundaries are already enforced at each existing callsite.
- This plan does NOT change the max-entry cap (`maxEntries: 500`). Panel renders only the newest 50 for UI performance.
- This plan does NOT persist the stack across reloads — same as Plan 6a, view-state + history is session-scoped.
- This plan does NOT wire operation labels into agent telemetry / audit trail. Labels live in the store only.
- This plan does NOT add a keyboard shortcut to open the inspector beyond Cmd/Ctrl+H — no drag/dock behaviour, just toggle.

---

## File Structure

**Files to create (frontend):**
- `frontend/src/components/dashboard/freeform/panels/HistoryInspectorPanel.jsx` — toggleable panel listing past entries newest-first with diff preview + jump-to-index on click.
- `frontend/src/components/dashboard/freeform/panels/UndoRedoToolbar.jsx` — `↶ Undo (N)` / `↷ Redo (M)` buttons + history-inspector toggle, lives in top toolbar.
- `frontend/src/components/dashboard/freeform/lib/historyDiff.ts` — pure `diffDashboardZones(prevDash, nextDash)` returning `{ added, removed, modified }` zone ID arrays.
- `frontend/src/components/dashboard/freeform/__tests__/historyDiff.test.ts`
- `frontend/src/components/dashboard/freeform/__tests__/store.historyEntries.test.ts` — new suite covering entry shape, push-with-label, undo/redo round-trip, `jumpToHistoryAnalystPro`.
- `frontend/src/components/dashboard/freeform/__tests__/UndoRedoToolbar.test.tsx`
- `frontend/src/components/dashboard/freeform/__tests__/HistoryInspectorPanel.test.tsx`

**Files to modify (frontend):**
- `frontend/src/store.js` — upgrade history entry shape; extend `initAnalystProHistory` / `pushAnalystProHistory` signatures; update `undoAnalystPro` / `redoAnalystPro` to operate on entries; add `jumpToHistoryAnalystPro(index)`; add `analystProHistoryPanelOpen` slice + `toggleHistoryPanelAnalystPro()`; add operation labels to **every** existing `pushAnalystProHistory(...)` callsite (26 sites in `store.js`).
- `frontend/src/components/dashboard/modes/AnalystProLayout.jsx` — mount `<UndoRedoToolbar />` after `<LayoutOverlayToggle />` (before `<ActionsMenuButton />`), mount `<HistoryInspectorPanel />` inside the right rail above `<ZonePropertiesPanel />`.
- `frontend/src/components/dashboard/freeform/hooks/useKeyboardShortcuts.js` — add Cmd/Ctrl+H to toggle the history inspector; pass operation labels (`"Nudge zone"`, `"Delete zone"`, `"Change z-order"`) to every `pushHistory(...)` call.
- `frontend/src/components/dashboard/freeform/hooks/useDragResize.js` — pass `"Move zone"` / `"Resize zone"` to `pushHistory(...)` based on `startRef.current.mode`.
- `frontend/src/components/dashboard/freeform/hooks/useHistory.js` — extend `pushSnapshot(dash, operation?)`; expose `jumpToHistory(index)`; expose `lastOperation` (undo tooltip) and `nextOperation` (redo tooltip).
- `frontend/src/components/dashboard/freeform/__tests__/store.setZoneProperty.test.ts` — existing test uses `undoAnalystPro()`; update one assertion to read `.snapshot` off the present entry rather than the dashboard directly (see Task 2 below).

**Task count:** 7 tasks. Each = one TDD cycle + commit. Commit prefix: `feat(analyst-pro): <verb> <object> (Plan 6b Tn)` — except T7 which uses `chore(analyst-pro):` for verification.

---

## Operation Label Catalogue

Every store action that pushes history MUST pass one of these strings as the `operation` argument. Centralised here so the plan is self-contained. Labels are human-facing — they appear in tooltips and the history panel.

| Store action (store.js line) | Operation label |
|---|---|
| `addActionAnalystPro` (815) | `"Add action"` |
| `updateActionAnalystPro` (824) | `"Update action"` |
| `deleteActionAnalystPro` (833) | `"Delete action"` |
| `addSetAnalystPro` (916) | `"Add set"` |
| `updateSetAnalystPro` (926) | `"Update set"` |
| `deleteSetAnalystPro` (940) | `"Delete set"` |
| `applySetChangeAnalystPro` (953) | `"Change set members"` |
| `addParameterAnalystPro` (968) | `"Add parameter"` |
| `updateParameterAnalystPro` (985) | `"Update parameter"` |
| `deleteParameterAnalystPro` (995) | `"Delete parameter"` |
| `setParameterValueAnalystPro` (1016) | `"Change parameter value"` |
| `alignSelectionAnalystPro` (1069) | `"Align zones"` |
| `distributeSelectionAnalystPro` (1082) | `"Distribute zones"` |
| `groupSelectionAnalystPro` (1096) | `"Group zones"` |
| `ungroupAnalystPro` (1106) | `"Ungroup container"` |
| `toggleLockAnalystPro` floating (1119) | `"Toggle zone lock"` |
| `toggleLockAnalystPro` tiled (1125) | `"Toggle zone lock"` |
| `insertObjectAnalystPro` (1177) | `"Insert object"` |
| `updateZoneAnalystPro` (1208) | `"Update zone"` |
| `setZonePropertyAnalystPro` (1261) | `"Change zone property"` |
| `reorderZoneAnalystPro` (1272) | `"Reorder zone"` |
| `moveZoneAcrossContainersAnalystPro` (1283) | `"Move zone across containers"` |
| `wrapInContainerAnalystPro` (1298) | `"Wrap in container"` |
| `useDragResize` pointer-up, `mode === 'move'` | `"Move zone"` |
| `useDragResize` pointer-up, `mode === 'resize'` | `"Resize zone"` |
| `useKeyboardShortcuts` arrow-key nudge | `"Nudge zone"` |
| `useKeyboardShortcuts` Delete/Backspace | `"Delete zone"` |
| `useKeyboardShortcuts` `]` / `[` z-order | `"Change z-order"` |
| `initAnalystProHistory` (initial load) | `"Initial state"` |
| Any caller that omits the argument (safety net) | `"Edit dashboard"` (default) |

---

## Task 1: Upgrade history entry shape + extend `pushAnalystProHistory` signature

**Files:**
- Modify: `frontend/src/store.js` (`initAnalystProHistory`, `pushAnalystProHistory`, `undoAnalystPro`, `redoAnalystPro` at lines 1021-1051)
- Create: `frontend/src/components/dashboard/freeform/__tests__/store.historyEntries.test.ts`

New shape:
```ts
type HistoryEntry = { snapshot: Dashboard; operation: string; timestamp: number };
type HistoryState = {
  past: HistoryEntry[];
  present: HistoryEntry;
  future: HistoryEntry[];
  maxEntries: 500;
};
```

`pushAnalystProHistory(dashboard, operation = "Edit dashboard")` wraps the incoming dashboard in a new `HistoryEntry` with `timestamp: Date.now()`. The previous `present` entry gets unshifted onto `past` (unchanged). `undoAnalystPro` / `redoAnalystPro` still update `analystProDashboard` — they read `.snapshot` off the new entry shape.

- [ ] **Step 1: Write failing test**

Create `frontend/src/components/dashboard/freeform/__tests__/store.historyEntries.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../../../../store';

function baseDash(name = 'v0') {
  return {
    schemaVersion: 'askdb/dashboard/v1',
    id: 'd1',
    name,
    archetype: 'analyst-pro',
    size: { mode: 'automatic' },
    tiledRoot: { id: 'root', type: 'container-vert', w: 100000, h: 100000, children: [] },
    floatingLayer: [],
    worksheets: [],
    parameters: [],
    sets: [],
    actions: [],
  };
}

describe('analyst pro history entry shape (Plan 6b T1)', () => {
  beforeEach(() => {
    useStore.setState({ analystProDashboard: null, analystProHistory: null } as any);
  });

  it('initAnalystProHistory seeds present with "Initial state" label and a timestamp', () => {
    const dash = baseDash('v0');
    const before = Date.now();
    useStore.getState().initAnalystProHistory(dash);
    const h = useStore.getState().analystProHistory!;
    expect(h.present.snapshot).toBe(dash);
    expect(h.present.operation).toBe('Initial state');
    expect(h.present.timestamp).toBeGreaterThanOrEqual(before);
    expect(h.past).toEqual([]);
    expect(h.future).toEqual([]);
    expect(h.maxEntries).toBe(500);
  });

  it('pushAnalystProHistory stores snapshot + operation + timestamp, pushes prior present onto past', () => {
    const d0 = baseDash('v0');
    const d1 = baseDash('v1');
    useStore.getState().initAnalystProHistory(d0);
    useStore.getState().pushAnalystProHistory(d1, 'Resize zone');
    const h = useStore.getState().analystProHistory!;
    expect(h.present.snapshot).toBe(d1);
    expect(h.present.operation).toBe('Resize zone');
    expect(h.past).toHaveLength(1);
    expect(h.past[0].snapshot).toBe(d0);
    expect(h.past[0].operation).toBe('Initial state');
    expect(h.future).toEqual([]);
  });

  it('pushAnalystProHistory defaults operation to "Edit dashboard" when omitted', () => {
    const d0 = baseDash('v0');
    const d1 = baseDash('v1');
    useStore.getState().initAnalystProHistory(d0);
    useStore.getState().pushAnalystProHistory(d1);
    expect(useStore.getState().analystProHistory!.present.operation).toBe('Edit dashboard');
  });

  it('undoAnalystPro restores prior dashboard + moves present entry onto future', () => {
    const d0 = baseDash('v0');
    const d1 = baseDash('v1');
    useStore.getState().initAnalystProHistory(d0);
    useStore.getState().pushAnalystProHistory(d1, 'Resize zone');
    useStore.getState().undoAnalystPro();
    const h = useStore.getState().analystProHistory!;
    expect(useStore.getState().analystProDashboard).toBe(d0);
    expect(h.present.snapshot).toBe(d0);
    expect(h.future).toHaveLength(1);
    expect(h.future[0].operation).toBe('Resize zone');
  });

  it('redoAnalystPro re-applies a future entry and keeps its operation label', () => {
    const d0 = baseDash('v0');
    const d1 = baseDash('v1');
    useStore.getState().initAnalystProHistory(d0);
    useStore.getState().pushAnalystProHistory(d1, 'Resize zone');
    useStore.getState().undoAnalystPro();
    useStore.getState().redoAnalystPro();
    const h = useStore.getState().analystProHistory!;
    expect(useStore.getState().analystProDashboard).toBe(d1);
    expect(h.present.snapshot).toBe(d1);
    expect(h.present.operation).toBe('Resize zone');
  });

  it('respects maxEntries cap on past', () => {
    const d0 = baseDash('v0');
    useStore.getState().initAnalystProHistory(d0);
    for (let i = 0; i < 600; i++) {
      useStore.getState().pushAnalystProHistory(baseDash(`v${i + 1}`), `op-${i}`);
    }
    expect(useStore.getState().analystProHistory!.past.length).toBe(500);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/store.historyEntries.test.ts`
Expected: FAIL — existing implementation stores bare dashboards, not entries.

- [ ] **Step 3: Rewrite the history actions in `store.js`**

Replace `store.js:1021-1051` with:

```js
  // Plan 6b: history buffer — entries of { snapshot, operation, timestamp }.
  // Single workbook-level stack (Build_Tableau.md §XVII.1). Each push = one
  // WorkbookCommittedEdit-equivalent (§I.4). Cap 500; panel shows newest 50.
  analystProHistory: null,
  initAnalystProHistory: (dashboard) => {
    const entry = { snapshot: dashboard, operation: 'Initial state', timestamp: Date.now() };
    set({ analystProHistory: { past: [], present: entry, future: [], maxEntries: 500 } });
  },
  pushAnalystProHistory: (dashboard, operation = 'Edit dashboard') => {
    const h = get().analystProHistory;
    const entry = { snapshot: dashboard, operation, timestamp: Date.now() };
    if (!h) {
      set({ analystProHistory: { past: [], present: entry, future: [], maxEntries: 500 } });
      return;
    }
    const past = [h.present, ...h.past].slice(0, h.maxEntries);
    set({ analystProHistory: { ...h, past, present: entry, future: [] } });
  },
  undoAnalystPro: () => {
    const h = get().analystProHistory;
    if (!h || h.past.length === 0) return;
    const [prev, ...restPast] = h.past;
    set({
      analystProHistory: { ...h, past: restPast, present: prev, future: [h.present, ...h.future] },
      analystProDashboard: prev.snapshot,
    });
  },
  redoAnalystPro: () => {
    const h = get().analystProHistory;
    if (!h || h.future.length === 0) return;
    const [next, ...restFuture] = h.future;
    set({
      analystProHistory: { ...h, past: [h.present, ...h.past], present: next, future: restFuture },
      analystProDashboard: next.snapshot,
    });
  },
```

- [ ] **Step 4: Fix up `store.setZoneProperty.test.ts` assertion**

Open `frontend/src/components/dashboard/freeform/__tests__/store.setZoneProperty.test.ts`. Line 81 calls `undoAnalystPro()`. Any assertion below that reads `analystProHistory.present` directly as a dashboard must now read `.snapshot`. Apply this exact patch — find the assertion block following the `undoAnalystPro()` call and, if it dereferences `present` as a dashboard, change `h.present.<field>` → `h.present.snapshot.<field>`. Verify by re-reading the file; add no new behaviour.

Example (from current test):
```ts
// before:
expect(useStore.getState().analystProHistory?.present?.tiledRoot.children[0].innerPadding).toBeUndefined();
// after:
expect(useStore.getState().analystProHistory?.present?.snapshot?.tiledRoot.children[0].innerPadding).toBeUndefined();
```

- [ ] **Step 5: Run new test + full freeform test suite**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform`
Expected: PASS — 48+ files green, including the new `store.historyEntries.test.ts` (6 assertions) and the patched `store.setZoneProperty.test.ts`.

- [ ] **Step 6: Commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/store.js \
        frontend/src/components/dashboard/freeform/__tests__/store.historyEntries.test.ts \
        frontend/src/components/dashboard/freeform/__tests__/store.setZoneProperty.test.ts
git commit -m "feat(analyst-pro): history entries carry operation label + timestamp (Plan 6b T1)"
```

---

## Task 2: Add `jumpToHistoryAnalystPro(index)` store action

**Files:**
- Modify: `frontend/src/store.js` (insert action after `redoAnalystPro` at the new end of the history block)
- Modify: `frontend/src/components/dashboard/freeform/__tests__/store.historyEntries.test.ts` (add `describe('jumpToHistoryAnalystPro (Plan 6b T2)')`)

Semantics: index is 0-based over `past` (newest first — index 0 = the entry immediately before `present`). Negative or out-of-range index is a no-op. Jumping to index `k` moves entries `past[0..k]` (inclusive) onto `future` in forward order (so redo walks them back), sets `present = past[k]`, and leaves `past` as `past.slice(k+1)`. The existing `present` entry goes to the front of `future`.

- [ ] **Step 1: Write failing test (append to T1 file)**

Append to `frontend/src/components/dashboard/freeform/__tests__/store.historyEntries.test.ts`:

```ts
describe('jumpToHistoryAnalystPro (Plan 6b T2)', () => {
  beforeEach(() => {
    useStore.setState({ analystProDashboard: null, analystProHistory: null } as any);
    const d0 = baseDash('v0');
    useStore.getState().initAnalystProHistory(d0);
    useStore.getState().pushAnalystProHistory(baseDash('v1'), 'op-1');
    useStore.getState().pushAnalystProHistory(baseDash('v2'), 'op-2');
    useStore.getState().pushAnalystProHistory(baseDash('v3'), 'op-3');
    // now: past = [v2(op-2), v1(op-1), v0(initial)], present = v3(op-3), future = []
  });

  it('jump to index 0 is equivalent to undo', () => {
    useStore.getState().jumpToHistoryAnalystPro(0);
    const h = useStore.getState().analystProHistory!;
    expect(h.present.snapshot.name).toBe('v2');
    expect(useStore.getState().analystProDashboard.name).toBe('v2');
    expect(h.past.map(e => e.snapshot.name)).toEqual(['v1', 'v0']);
    expect(h.future.map(e => e.snapshot.name)).toEqual(['v3']);
  });

  it('jump to index 2 reverts to the oldest entry (Initial state)', () => {
    useStore.getState().jumpToHistoryAnalystPro(2);
    const h = useStore.getState().analystProHistory!;
    expect(h.present.operation).toBe('Initial state');
    expect(h.present.snapshot.name).toBe('v0');
    expect(h.past).toEqual([]);
    // future preserves forward-walkable order: v1, v2, v3
    expect(h.future.map(e => e.snapshot.name)).toEqual(['v1', 'v2', 'v3']);
  });

  it('redo after jump replays the next operation in order', () => {
    useStore.getState().jumpToHistoryAnalystPro(2);
    useStore.getState().redoAnalystPro();
    expect(useStore.getState().analystProDashboard.name).toBe('v1');
    expect(useStore.getState().analystProHistory!.present.operation).toBe('op-1');
  });

  it('out-of-range index is a no-op', () => {
    useStore.getState().jumpToHistoryAnalystPro(99);
    expect(useStore.getState().analystProHistory!.present.snapshot.name).toBe('v3');
    useStore.getState().jumpToHistoryAnalystPro(-1);
    expect(useStore.getState().analystProHistory!.present.snapshot.name).toBe('v3');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/store.historyEntries.test.ts`
Expected: FAIL — `jumpToHistoryAnalystPro is not a function`.

- [ ] **Step 3: Implement in `store.js`**

Insert directly after `redoAnalystPro` in the history block:

```js
  jumpToHistoryAnalystPro: (index) => {
    const h = get().analystProHistory;
    if (!h) return;
    if (!Number.isInteger(index) || index < 0 || index >= h.past.length) return;
    // past[0..index] roll forward into future (index 0 ends up closest to present).
    // Present entry gets unshifted to the very front of future so redo walks back.
    const rolled = h.past.slice(0, index + 1);
    const future = [h.present, ...rolled.slice(0, -1).reverse(), ...h.future];
    const newPresent = rolled[index];
    const newPast = h.past.slice(index + 1);
    set({
      analystProHistory: { ...h, past: newPast, present: newPresent, future },
      analystProDashboard: newPresent.snapshot,
    });
  },
```

Reasoning on the `future` assembly:
- Before jump, redo order (front-to-back) should visit: `past[index-1]`, `past[index-2]`, …, `past[0]`, then `h.present`, then the pre-existing `h.future`.
- So `future = [h.present, ...rolled.slice(0, -1).reverse(), ...h.future]` — wait, that places `h.present` first which means the first redo goes to `h.present`, not to `past[index-1]`. Fix below.

Correction: the first redo should step **forward in time** — toward `h.present`. So the correct `future` prefix is `[past[index-1], past[index-2], …, past[0], h.present]`. Since `rolled = past.slice(0, index+1)` = `[past[0], past[1], …, past[index]]` and `past[index]` is the new present, the remaining entries in time-ascending order are `past[0..index-1]` reversed — i.e. `past[index-1], …, past[0]`. Add `h.present` at the end of that sub-list, then any pre-existing `h.future` afterward:

Replace the body with this exact (verified) implementation:

```js
  jumpToHistoryAnalystPro: (index) => {
    const h = get().analystProHistory;
    if (!h) return;
    if (!Number.isInteger(index) || index < 0 || index >= h.past.length) return;
    const newPresent = h.past[index];
    // Everything newer than newPresent in past, plus old present, rolls onto future in
    // redo-walk order (first redo goes to the entry just after newPresent).
    const newer = h.past.slice(0, index).reverse(); // time-ascending
    const future = [...newer, h.present, ...h.future];
    const newPast = h.past.slice(index + 1);
    set({
      analystProHistory: { ...h, past: newPast, present: newPresent, future },
      analystProDashboard: newPresent.snapshot,
    });
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/store.historyEntries.test.ts`
Expected: PASS — all 10 assertions across both describe blocks green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/store.js \
        frontend/src/components/dashboard/freeform/__tests__/store.historyEntries.test.ts
git commit -m "feat(analyst-pro): jumpToHistoryAnalystPro action with past/future re-splice (Plan 6b T2)"
```

---

## Task 3: Pass operation labels from all existing `pushAnalystProHistory` callsites

**Files:**
- Modify: `frontend/src/store.js` — 23 internal callsites (actions slice at lines 815, 824, 833, 916, 926, 940, 953, 968, 985, 995, 1016, 1069, 1082, 1096, 1106, 1119, 1125, 1177, 1208, 1261, 1272, 1283, 1298)
- Modify: `frontend/src/components/dashboard/freeform/hooks/useDragResize.js` (line 126)
- Modify: `frontend/src/components/dashboard/freeform/hooks/useKeyboardShortcuts.js` (lines 86, 123, 149)
- Modify: `frontend/src/components/dashboard/freeform/hooks/useHistory.js` — extend `pushSnapshot` signature
- Create: `frontend/src/components/dashboard/freeform/__tests__/store.operationLabels.test.ts` — round-trip verification

Exact substitution per the **Operation Label Catalogue** table above. Every call goes from `get().pushAnalystProHistory(nextDash)` → `get().pushAnalystProHistory(nextDash, 'Label')`. External hooks similarly gain the second argument.

`useKeyboardShortcuts.js` must branch labels by code-path:
- Arrow-key nudge (`store.js` line 86 in the hook): `'Nudge zone'`.
- Delete/Backspace (line 123): `'Delete zone'`.
- `]` / `[` z-order (line 149): `'Change z-order'`.

`useDragResize.js` line 126 must inspect `startRef.current.mode` — `'resize'` → `'Resize zone'`, `'move'` → `'Move zone'`.

`useHistory.js` — extend `pushSnapshot(dash, operation)` to forward the second arg.

- [ ] **Step 1: Write failing test**

Create `frontend/src/components/dashboard/freeform/__tests__/store.operationLabels.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../../../../store';

function baseDash() {
  return {
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
      children: [{ id: 'z1', type: 'worksheet', worksheetRef: 'sheet-a', w: 100000, h: 100000 }],
    },
    floatingLayer: [
      { id: 'f1', type: 'blank', w: 0, h: 0, floating: true, x: 10, y: 20, pxW: 300, pxH: 200, zIndex: 1 },
    ],
    worksheets: [],
    parameters: [{ id: 'p1', name: 'Year', type: 'int', value: 2024, domain: { kind: 'all' } }],
    sets: [{ id: 's1', name: 'Top', members: [] }],
    actions: [],
  };
}

function seed() {
  const dash = baseDash();
  useStore.setState({ analystProDashboard: dash, analystProSelection: new Set() } as any);
  useStore.getState().initAnalystProHistory(dash);
}

describe('operation labels (Plan 6b T3)', () => {
  beforeEach(seed);

  const cases: Array<[string, () => void, string]> = [
    ['addActionAnalystPro', () => useStore.getState().addActionAnalystPro({ id: 'a1', name: 'A' }), 'Add action'],
    ['addSetAnalystPro', () => useStore.getState().addSetAnalystPro({ id: 's2', name: 'New', members: [] }), 'Add set'],
    ['addParameterAnalystPro', () => useStore.getState().addParameterAnalystPro({ id: 'p2', name: 'Q', type: 'int', value: 0, domain: { kind: 'all' } }), 'Add parameter'],
    ['setParameterValueAnalystPro', () => useStore.getState().setParameterValueAnalystPro('p1', 2025), 'Change parameter value'],
    ['setZonePropertyAnalystPro', () => useStore.getState().setZonePropertyAnalystPro('z1', { innerPadding: 8 }), 'Change zone property'],
    ['updateZoneAnalystPro', () => useStore.getState().updateZoneAnalystPro('z1', { displayName: 'X' }), 'Update zone'],
    ['toggleLockAnalystPro (floating)', () => useStore.getState().toggleLockAnalystPro('f1'), 'Toggle zone lock'],
    ['insertObjectAnalystPro', () => useStore.getState().insertObjectAnalystPro({ type: 'blank', x: 0, y: 0 }), 'Insert object'],
  ];

  for (const [name, fire, expected] of cases) {
    it(`${name} pushes with operation "${expected}"`, () => {
      fire();
      expect(useStore.getState().analystProHistory!.present.operation).toBe(expected);
    });
  }

  it('operation labels survive undo + redo round trip', () => {
    useStore.getState().setZonePropertyAnalystPro('z1', { innerPadding: 8 });
    expect(useStore.getState().analystProHistory!.present.operation).toBe('Change zone property');
    useStore.getState().undoAnalystPro();
    expect(useStore.getState().analystProHistory!.future[0].operation).toBe('Change zone property');
    useStore.getState().redoAnalystPro();
    expect(useStore.getState().analystProHistory!.present.operation).toBe('Change zone property');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/store.operationLabels.test.ts`
Expected: FAIL — every assertion reads `'Edit dashboard'` (the default), not the specific label.

- [ ] **Step 3: Apply label argument to every store callsite**

Walk through `store.js` and append the literal from the Operation Label Catalogue. Example edits (apply all 23):

```js
// store.js:815 — addActionAnalystPro
get().pushAnalystProHistory(nextDash, 'Add action');

// store.js:824 — updateActionAnalystPro
get().pushAnalystProHistory(nextDash, 'Update action');

// store.js:833 — deleteActionAnalystPro
get().pushAnalystProHistory(nextDash, 'Delete action');

// store.js:916 — addSetAnalystPro
get().pushAnalystProHistory(nextDash, 'Add set');

// store.js:926 — updateSetAnalystPro
get().pushAnalystProHistory(nextDash, 'Update set');

// store.js:940 — deleteSetAnalystPro
get().pushAnalystProHistory(nextDash, 'Delete set');

// store.js:953 — applySetChangeAnalystPro
get().pushAnalystProHistory(nextDash, 'Change set members');

// store.js:968 — addParameterAnalystPro
get().pushAnalystProHistory(nextDash, 'Add parameter');

// store.js:985 — updateParameterAnalystPro
get().pushAnalystProHistory(nextDash, 'Update parameter');

// store.js:995 — deleteParameterAnalystPro
get().pushAnalystProHistory(nextDash, 'Delete parameter');

// store.js:1016 — setParameterValueAnalystPro
get().pushAnalystProHistory(nextDash, 'Change parameter value');

// store.js:1069 — alignSelectionAnalystPro
get().pushAnalystProHistory(nextDash, 'Align zones');

// store.js:1082 — distributeSelectionAnalystPro
get().pushAnalystProHistory(nextDash, 'Distribute zones');

// store.js:1096 — groupSelectionAnalystPro
get().pushAnalystProHistory(nextDash, 'Group zones');

// store.js:1106 — ungroupAnalystPro
get().pushAnalystProHistory(nextDash, 'Ungroup container');

// store.js:1119 — toggleLockAnalystPro (floating branch)
get().pushAnalystProHistory(nextDash, 'Toggle zone lock');

// store.js:1125 — toggleLockAnalystPro (tiled branch)
get().pushAnalystProHistory(nextDash, 'Toggle zone lock');

// store.js:1177 — insertObjectAnalystPro
get().pushAnalystProHistory(nextDash, 'Insert object');

// store.js:1208 — updateZoneAnalystPro
get().pushAnalystProHistory(nextDash, 'Update zone');

// store.js:1261 — setZonePropertyAnalystPro
get().pushAnalystProHistory(nextDash, 'Change zone property');

// store.js:1272 — reorderZoneAnalystPro
get().pushAnalystProHistory(nextDash, 'Reorder zone');

// store.js:1283 — moveZoneAcrossContainersAnalystPro
get().pushAnalystProHistory(nextDash, 'Move zone across containers');

// store.js:1298 — wrapInContainerAnalystPro
get().pushAnalystProHistory(nextDash, 'Wrap in container');
```

- [ ] **Step 4: Apply labels in external hook callsites**

In `frontend/src/components/dashboard/freeform/hooks/useDragResize.js` around line 126 replace:

```js
// before:
if (finalDash && startRef.current.dashboardAtStart !== finalDash) {
  pushHistory(finalDash);
}

// after:
if (finalDash && startRef.current.dashboardAtStart !== finalDash) {
  const op = startRef.current.mode === 'resize' ? 'Resize zone' : 'Move zone';
  pushHistory(finalDash, op);
}
```

In `frontend/src/components/dashboard/freeform/hooks/useKeyboardShortcuts.js`:

- Line 86 (arrow-key nudge branch) — replace `pushHistory(next);` with `pushHistory(next, 'Nudge zone');`
- Line 123 (Delete/Backspace branch) — replace `pushHistory(nextDash);` with `pushHistory(nextDash, 'Delete zone');`
- Line 149 (`]` / `[` z-order branch) — replace `pushHistory(next);` with `pushHistory(next, 'Change z-order');`

In `frontend/src/components/dashboard/freeform/hooks/useHistory.js` replace:

```js
// before:
pushSnapshot: useCallback((dash) => push(dash), [push]),

// after:
pushSnapshot: useCallback((dash, operation) => push(dash, operation), [push]),
```

Also add two new derived values to the returned object (used by Task 4's tooltip):

```js
  const pastLen = history?.past.length ?? 0;
  const futureLen = history?.future.length ?? 0;
  const lastOperation = pastLen > 0 ? history.present.operation : null;
  const nextOperation = futureLen > 0 ? history.future[0].operation : null;

  return {
    undo: useCallback(() => undo(), [undo]),
    redo: useCallback(() => redo(), [redo]),
    pushSnapshot: useCallback((dash, operation) => push(dash, operation), [push]),
    initHistory: useCallback((dash) => init(dash), [init]),
    canUndo,
    canRedo,
    pastLen,
    futureLen,
    lastOperation,
    nextOperation,
  };
```

- [ ] **Step 5: Run full freeform suite**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform`
Expected: PASS — `store.operationLabels.test.ts` green + no regressions.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/store.js \
        frontend/src/components/dashboard/freeform/hooks/useDragResize.js \
        frontend/src/components/dashboard/freeform/hooks/useKeyboardShortcuts.js \
        frontend/src/components/dashboard/freeform/hooks/useHistory.js \
        frontend/src/components/dashboard/freeform/__tests__/store.operationLabels.test.ts
git commit -m "feat(analyst-pro): every history push carries operation label (Plan 6b T3)"
```

---

## Task 4: Pure `diffDashboardZones` helper for history-panel preview

**Files:**
- Create: `frontend/src/components/dashboard/freeform/lib/historyDiff.ts`
- Create: `frontend/src/components/dashboard/freeform/__tests__/historyDiff.test.ts`

Signature:
```ts
export interface ZoneDiff {
  added: string[];    // zone IDs present in next, absent in prev
  removed: string[];  // zone IDs present in prev, absent in next
  modified: string[]; // zone IDs whose node is a different reference
}
export function diffDashboardZones(prev: Dashboard | null, next: Dashboard | null): ZoneDiff;
```

Compare unioned set of zone IDs across `tiledRoot` (walk children recursively) + `floatingLayer`. `modified` = same ID in both, but the zone object reference differs (we rely on immutable updates — every store action replaces objects on the path it mutates). Null / undefined on either side returns empty arrays.

- [ ] **Step 1: Write failing test**

Create `frontend/src/components/dashboard/freeform/__tests__/historyDiff.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { diffDashboardZones } from '../lib/historyDiff';

const z = (id: string, extra: Record<string, unknown> = {}) => ({
  id, type: 'blank', w: 0, h: 0, ...extra,
});

function dash(tiledChildren: any[] = [], floating: any[] = []) {
  return {
    schemaVersion: 'askdb/dashboard/v1',
    id: 'd', name: '', archetype: 'analyst-pro',
    size: { mode: 'automatic' },
    tiledRoot: { id: 'root', type: 'container-vert', w: 0, h: 0, children: tiledChildren },
    floatingLayer: floating,
    worksheets: [], parameters: [], sets: [], actions: [],
  } as any;
}

describe('diffDashboardZones (Plan 6b T4)', () => {
  it('empty diff when inputs reference-equal', () => {
    const d = dash([z('a')]);
    expect(diffDashboardZones(d, d)).toEqual({ added: [], removed: [], modified: [] });
  });

  it('detects additions in floating layer', () => {
    const prev = dash([], [z('f1')]);
    const next = dash([], [z('f1'), z('f2')]);
    expect(diffDashboardZones(prev, next)).toEqual({ added: ['f2'], removed: [], modified: [] });
  });

  it('detects removals in tiled tree', () => {
    const prev = dash([z('t1'), z('t2')]);
    const next = dash([z('t1')]);
    expect(diffDashboardZones(prev, next)).toEqual({ added: [], removed: ['t2'], modified: [] });
  });

  it('detects modified zones via reference inequality', () => {
    const prev = dash([z('t1', { displayName: 'A' })]);
    const next = dash([z('t1', { displayName: 'B' })]);
    expect(diffDashboardZones(prev, next)).toEqual({ added: [], removed: [], modified: ['t1'] });
  });

  it('walks nested containers', () => {
    const prev = dash([{ id: 'c', type: 'container-horz', w: 0, h: 0, children: [z('a')] }]);
    const next = dash([{ id: 'c', type: 'container-horz', w: 0, h: 0, children: [z('a'), z('b')] }]);
    const d = diffDashboardZones(prev, next);
    expect(d.added).toEqual(['b']);
    expect(d.modified).toEqual(['c']);
    expect(d.removed).toEqual([]);
  });

  it('returns empty diff on null input', () => {
    expect(diffDashboardZones(null, dash())).toEqual({ added: [], removed: [], modified: [] });
    expect(diffDashboardZones(dash(), null)).toEqual({ added: [], removed: [], modified: [] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/historyDiff.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `frontend/src/components/dashboard/freeform/lib/historyDiff.ts`:

```ts
interface Zone { id: string; children?: Zone[]; [key: string]: unknown }
interface Dashboard { tiledRoot?: Zone; floatingLayer?: Zone[] }

export interface ZoneDiff {
  added: string[];
  removed: string[];
  modified: string[];
}

function collectZoneMap(dash: Dashboard | null | undefined): Map<string, Zone> {
  const map = new Map<string, Zone>();
  if (!dash) return map;
  const walk = (z: Zone | undefined) => {
    if (!z) return;
    map.set(z.id, z);
    if (Array.isArray(z.children)) z.children.forEach(walk);
  };
  walk(dash.tiledRoot);
  for (const f of dash.floatingLayer || []) walk(f);
  return map;
}

export function diffDashboardZones(
  prev: Dashboard | null,
  next: Dashboard | null,
): ZoneDiff {
  if (!prev || !next) return { added: [], removed: [], modified: [] };
  const prevMap = collectZoneMap(prev);
  const nextMap = collectZoneMap(next);
  const added: string[] = [];
  const removed: string[] = [];
  const modified: string[] = [];
  for (const [id, zn] of nextMap) {
    const zp = prevMap.get(id);
    if (!zp) added.push(id);
    else if (zp !== zn) modified.push(id);
  }
  for (const id of prevMap.keys()) {
    if (!nextMap.has(id)) removed.push(id);
  }
  return { added, removed, modified };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/historyDiff.test.ts`
Expected: PASS — 6/6.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/freeform/lib/historyDiff.ts \
        frontend/src/components/dashboard/freeform/__tests__/historyDiff.test.ts
git commit -m "feat(analyst-pro): diffDashboardZones pure helper for history preview (Plan 6b T4)"
```

---

## Task 5: `UndoRedoToolbar` with counts + last-operation tooltip + inspector toggle

**Files:**
- Create: `frontend/src/components/dashboard/freeform/panels/UndoRedoToolbar.jsx`
- Create: `frontend/src/components/dashboard/freeform/__tests__/UndoRedoToolbar.test.tsx`
- Modify: `frontend/src/store.js` — add `analystProHistoryPanelOpen` slice (default `false`) + `toggleHistoryPanelAnalystPro()` action.
- Modify: `frontend/src/components/dashboard/modes/AnalystProLayout.jsx` — mount component in top toolbar after `<LayoutOverlayToggle />`, before `<ActionsMenuButton />`. Insert a `<Separator />` on either side.

Button specs:
- Undo button: label `↶ Undo (${pastLen})`; `aria-label` `Undo ${pastLen} operation(s). Last: ${lastOperation ?? 'nothing'}`; `title` same as aria-label; `disabled={!canUndo}`. Click → `undo()`.
- Redo button: label `↷ Redo (${futureLen})`; `aria-label` `Redo ${futureLen} operation(s). Next: ${nextOperation ?? 'nothing'}`; `disabled={!canRedo}`. Click → `redo()`.
- History toggle button: label `🕓 History`; `aria-label` `Toggle history inspector (currently ${open ? 'open' : 'closed'})`; `aria-pressed={open}`. Click → `toggleHistoryPanelAnalystPro()`.
- Styling consistent with existing toolbar buttons (see `snap-toggle` / `rulers-toggle` in `AnalystProLayout.jsx:139-183`): `padding: '6px 12px'`, `border: '1px solid var(--border-default)'`, `borderRadius: 8`, `fontSize: 11`, `fontWeight: 600`, `fontFamily: "'JetBrains Mono', monospace"`. Active-state (`historyPanelOpen`) toggles `background: var(--accent); color: #fff`.

- [ ] **Step 1: Write failing test**

Create `frontend/src/components/dashboard/freeform/__tests__/UndoRedoToolbar.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useStore } from '../../../../store';
import UndoRedoToolbar from '../panels/UndoRedoToolbar';

function baseDash(name = 'v0') {
  return {
    schemaVersion: 'askdb/dashboard/v1', id: 'd1', name, archetype: 'analyst-pro',
    size: { mode: 'automatic' },
    tiledRoot: { id: 'root', type: 'container-vert', w: 100000, h: 100000, children: [] },
    floatingLayer: [], worksheets: [], parameters: [], sets: [], actions: [],
  };
}

beforeEach(() => {
  useStore.setState({
    analystProDashboard: baseDash('v0'),
    analystProHistory: null,
    analystProHistoryPanelOpen: false,
  } as any);
  useStore.getState().initAnalystProHistory(baseDash('v0'));
});

describe('UndoRedoToolbar (Plan 6b T5)', () => {
  it('renders with counts of 0 and both buttons disabled when stack empty', () => {
    render(<UndoRedoToolbar />);
    const undo = screen.getByRole('button', { name: /Undo 0/ });
    const redo = screen.getByRole('button', { name: /Redo 0/ });
    expect(undo).toBeDisabled();
    expect(redo).toBeDisabled();
  });

  it('reflects past/future counts after a push and an undo', () => {
    useStore.getState().pushAnalystProHistory(baseDash('v1'), 'Resize zone');
    useStore.getState().pushAnalystProHistory(baseDash('v2'), 'Insert object');
    render(<UndoRedoToolbar />);
    expect(screen.getByRole('button', { name: /Undo 2/ })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /Redo 0/ })).toBeDisabled();
    useStore.getState().undoAnalystPro();
    expect(screen.getByRole('button', { name: /Undo 1/ })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /Redo 1/ })).not.toBeDisabled();
  });

  it('tooltip shows last operation name on undo button', () => {
    useStore.getState().pushAnalystProHistory(baseDash('v1'), 'Resize zone');
    render(<UndoRedoToolbar />);
    const undo = screen.getByRole('button', { name: /Last: Resize zone/ });
    expect(undo).toBeInTheDocument();
  });

  it('clicking undo calls undoAnalystPro', () => {
    useStore.getState().pushAnalystProHistory(baseDash('v1'), 'Resize zone');
    render(<UndoRedoToolbar />);
    fireEvent.click(screen.getByRole('button', { name: /Undo/ }));
    expect(useStore.getState().analystProDashboard.name).toBe('v0');
  });

  it('history toggle flips aria-pressed + store flag', () => {
    render(<UndoRedoToolbar />);
    const btn = screen.getByRole('button', { name: /Toggle history inspector/ });
    expect(btn).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(btn);
    expect(useStore.getState().analystProHistoryPanelOpen).toBe(true);
    expect(btn).toHaveAttribute('aria-pressed', 'true');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/UndoRedoToolbar.test.tsx`
Expected: FAIL — module not found, slice not found.

- [ ] **Step 3: Add store slice**

In `store.js`, alongside the other AP view-state flags (e.g. near `analystProLayoutOverlay` at line 1054), add:

```js
  // Plan 6b: history inspector panel visibility — ephemeral view-state.
  analystProHistoryPanelOpen: false,
  toggleHistoryPanelAnalystPro: () =>
    set((s) => ({ analystProHistoryPanelOpen: !s.analystProHistoryPanelOpen })),
```

- [ ] **Step 4: Implement the component**

Create `frontend/src/components/dashboard/freeform/panels/UndoRedoToolbar.jsx`:

```jsx
// frontend/src/components/dashboard/freeform/panels/UndoRedoToolbar.jsx
import { useStore } from '../../../../store';
import { useHistory } from '../hooks/useHistory';

const BTN_BASE = {
  padding: '6px 12px',
  border: '1px solid var(--border-default)',
  borderRadius: 8,
  fontSize: 11,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: "'JetBrains Mono', monospace",
};

function btnStyle({ active = false, disabled = false }) {
  return {
    ...BTN_BASE,
    background: active ? 'var(--accent)' : 'var(--bg-elevated)',
    color: active ? '#fff' : 'var(--text-primary)',
    opacity: disabled ? 0.4 : 1,
    cursor: disabled ? 'not-allowed' : 'pointer',
  };
}

export default function UndoRedoToolbar() {
  const { undo, redo, canUndo, canRedo, pastLen, futureLen, lastOperation, nextOperation } =
    useHistory();
  const panelOpen = useStore((s) => s.analystProHistoryPanelOpen);
  const togglePanel = useStore((s) => s.toggleHistoryPanelAnalystPro);

  const undoLabel = `Undo ${pastLen} operation${pastLen === 1 ? '' : 's'}. Last: ${lastOperation ?? 'nothing'}`;
  const redoLabel = `Redo ${futureLen} operation${futureLen === 1 ? '' : 's'}. Next: ${nextOperation ?? 'nothing'}`;

  return (
    <>
      <button
        type="button"
        data-testid="undo-btn"
        onClick={() => undo()}
        disabled={!canUndo}
        className="premium-btn"
        style={btnStyle({ disabled: !canUndo })}
        aria-label={undoLabel}
        title={undoLabel}
      >
        ↶ Undo ({pastLen})
      </button>
      <button
        type="button"
        data-testid="redo-btn"
        onClick={() => redo()}
        disabled={!canRedo}
        className="premium-btn"
        style={btnStyle({ disabled: !canRedo })}
        aria-label={redoLabel}
        title={redoLabel}
      >
        ↷ Redo ({futureLen})
      </button>
      <button
        type="button"
        data-testid="history-toggle-btn"
        onClick={() => togglePanel()}
        className="premium-btn"
        style={btnStyle({ active: panelOpen })}
        aria-label={`Toggle history inspector (currently ${panelOpen ? 'open' : 'closed'})`}
        aria-pressed={panelOpen}
        title={`History inspector ${panelOpen ? 'open' : 'closed'} (Cmd+H)`}
      >
        🕓 History
      </button>
    </>
  );
}
```

- [ ] **Step 5: Mount in `AnalystProLayout.jsx`**

In the top toolbar block (around line 189-193), insert:

```jsx
import UndoRedoToolbar from '../freeform/panels/UndoRedoToolbar';
// … existing imports …

// inside the toolbar JSX, replace the block from the Separator following LayoutOverlayToggle through ActionsMenuButton:
        <Separator />
        <LayoutOverlayToggle />
        <Separator />
        <UndoRedoToolbar />
        <Separator />
        <ActionsMenuButton />
```

- [ ] **Step 6: Run test + verify**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/UndoRedoToolbar.test.tsx`
Expected: PASS — 5/5.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/store.js \
        frontend/src/components/dashboard/freeform/panels/UndoRedoToolbar.jsx \
        frontend/src/components/dashboard/modes/AnalystProLayout.jsx \
        frontend/src/components/dashboard/freeform/__tests__/UndoRedoToolbar.test.tsx
git commit -m "feat(analyst-pro): UndoRedoToolbar with counts + last-op tooltip (Plan 6b T5)"
```

---

## Task 6: `HistoryInspectorPanel` with diff preview + jump-on-click

**Files:**
- Create: `frontend/src/components/dashboard/freeform/panels/HistoryInspectorPanel.jsx`
- Create: `frontend/src/components/dashboard/freeform/__tests__/HistoryInspectorPanel.test.tsx`
- Modify: `frontend/src/components/dashboard/modes/AnalystProLayout.jsx` — mount the panel inside the right rail, above `<ZonePropertiesPanel />`; render-gated on `analystProHistoryPanelOpen`.
- Modify: `frontend/src/components/dashboard/freeform/hooks/useKeyboardShortcuts.js` — bind Cmd/Ctrl+H to `toggleHistoryPanelAnalystPro`.

Panel contents, top to bottom:
- Header `<h3>History</h3>` with close button (`×`, toggles panel).
- Current present row (non-clickable), highlighted with `background: var(--accent)`, text: present operation + `(now)`.
- Scrollable list of past entries newest-first, capped at `Math.min(past.length, 50)` rows. Each row:
  - `operation` (bold)
  - `timestamp` relative (`formatRelative(ts)` → e.g. `"3s ago"`, `"1m ago"`, `"12m ago"`).
  - Diff summary: `+{added} -{removed} ~{modified}` computed between the entry's snapshot and the snapshot from the preceding past entry (for `past[i]`, compare against `past[i+1]?.snapshot ?? null`).
  - Clickable — `onClick={() => jumpToHistoryAnalystPro(i)}`.
- `role="region"`, `aria-live="polite"`, `aria-label="History inspector"`.
- Panel is hidden when `analystProHistoryPanelOpen === false` (returns `null`).

Relative-time helper: inline `formatRelative(ms)` — `<10s` ⇒ `"just now"`, `<60s` ⇒ `"${s}s ago"`, `<60m` ⇒ `"${m}m ago"`, else `"${h}h ago"`.

- [ ] **Step 1: Write failing test**

Create `frontend/src/components/dashboard/freeform/__tests__/HistoryInspectorPanel.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useStore } from '../../../../store';
import HistoryInspectorPanel from '../panels/HistoryInspectorPanel';

function dash(name = 'v0', floating: any[] = []) {
  return {
    schemaVersion: 'askdb/dashboard/v1', id: 'd1', name, archetype: 'analyst-pro',
    size: { mode: 'automatic' },
    tiledRoot: { id: 'root', type: 'container-vert', w: 100000, h: 100000, children: [] },
    floatingLayer: floating, worksheets: [], parameters: [], sets: [], actions: [],
  };
}

beforeEach(() => {
  useStore.setState({
    analystProDashboard: dash('v0'),
    analystProHistory: null,
    analystProHistoryPanelOpen: true,
  } as any);
  useStore.getState().initAnalystProHistory(dash('v0'));
});

describe('HistoryInspectorPanel (Plan 6b T6)', () => {
  it('returns null when panel closed', () => {
    useStore.setState({ analystProHistoryPanelOpen: false } as any);
    const { container } = render(<HistoryInspectorPanel />);
    expect(container.firstChild).toBeNull();
  });

  it('lists past operations newest-first with diff preview', () => {
    useStore.getState().pushAnalystProHistory(
      dash('v1', [{ id: 'f1', type: 'blank', w: 0, h: 0, floating: true, x: 0, y: 0, pxW: 50, pxH: 50 }]),
      'Insert object',
    );
    useStore.getState().pushAnalystProHistory(
      dash('v2', [{ id: 'f1', type: 'blank', w: 0, h: 0, floating: true, x: 10, y: 20, pxW: 50, pxH: 50 },
                  { id: 'f2', type: 'blank', w: 0, h: 0, floating: true, x: 0, y: 0, pxW: 50, pxH: 50 }]),
      'Insert object',
    );
    render(<HistoryInspectorPanel />);
    const region = screen.getByRole('region', { name: /history inspector/i });
    expect(region).toHaveAttribute('aria-live', 'polite');

    const rows = screen.getAllByTestId(/^history-row-/);
    // present row is marked separately; past rows = 2
    expect(rows).toHaveLength(2);
    // newest-first: past[0] first
    expect(rows[0]).toHaveTextContent('Insert object');
    expect(rows[0]).toHaveTextContent('+1');
  });

  it('clicking a row dispatches jumpToHistoryAnalystPro', () => {
    useStore.getState().pushAnalystProHistory(dash('v1'), 'op-1');
    useStore.getState().pushAnalystProHistory(dash('v2'), 'op-2');
    const spy = vi.spyOn(useStore.getState(), 'jumpToHistoryAnalystPro');
    render(<HistoryInspectorPanel />);
    const row = screen.getByTestId('history-row-0');
    fireEvent.click(row);
    // Without spy rehydration the direct check is via dashboard mutation:
    spy.mockRestore();
    // Alternative: check effect
    fireEvent.click(screen.getByTestId('history-row-1'));
    expect(useStore.getState().analystProDashboard.name).toBe('v0');
  });

  it('caps rendered past rows at 50', () => {
    for (let i = 0; i < 60; i++) {
      useStore.getState().pushAnalystProHistory(dash(`v${i + 1}`), `op-${i}`);
    }
    render(<HistoryInspectorPanel />);
    expect(screen.getAllByTestId(/^history-row-/)).toHaveLength(50);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/HistoryInspectorPanel.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the panel**

Create `frontend/src/components/dashboard/freeform/panels/HistoryInspectorPanel.jsx`:

```jsx
// frontend/src/components/dashboard/freeform/panels/HistoryInspectorPanel.jsx
import { useMemo } from 'react';
import { useStore } from '../../../../store';
import { diffDashboardZones } from '../lib/historyDiff';

const MAX_ROWS = 50;

function formatRelative(ms) {
  const delta = Math.max(0, Date.now() - ms);
  const s = Math.floor(delta / 1000);
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

export default function HistoryInspectorPanel() {
  const open = useStore((s) => s.analystProHistoryPanelOpen);
  const history = useStore((s) => s.analystProHistory);
  const toggle = useStore((s) => s.toggleHistoryPanelAnalystPro);
  const jump = useStore((s) => s.jumpToHistoryAnalystPro);

  const rows = useMemo(() => {
    if (!history) return [];
    const visible = history.past.slice(0, MAX_ROWS);
    return visible.map((entry, i) => {
      const prev = history.past[i + 1]?.snapshot ?? null;
      const diff = diffDashboardZones(prev, entry.snapshot);
      return { index: i, entry, diff };
    });
  }, [history]);

  if (!open) return null;

  return (
    <div
      role="region"
      aria-live="polite"
      aria-label="History inspector"
      style={{
        display: 'flex',
        flexDirection: 'column',
        borderBottom: '1px solid var(--chrome-bar-border, var(--border-default))',
        maxHeight: 360,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          borderBottom: '1px solid var(--border-default)',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11,
          fontWeight: 600,
        }}
      >
        <span>HISTORY</span>
        <button
          type="button"
          onClick={() => toggle()}
          aria-label="Close history inspector"
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            fontSize: 14,
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>
      <div style={{ overflow: 'auto', flex: '1 1 auto' }}>
        {history?.present && (
          <div
            data-testid="history-present"
            style={{
              padding: '6px 12px',
              background: 'var(--accent)',
              color: '#fff',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11,
            }}
          >
            <div style={{ fontWeight: 700 }}>{history.present.operation}</div>
            <div style={{ opacity: 0.85, fontSize: 10 }}>(now)</div>
          </div>
        )}
        {rows.map(({ index, entry, diff }) => (
          <button
            key={`${entry.timestamp}-${index}`}
            type="button"
            data-testid={`history-row-${index}`}
            onClick={() => jump(index)}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              padding: '6px 12px',
              background: 'transparent',
              border: 'none',
              borderBottom: '1px solid var(--border-subtle, var(--border-default))',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11,
            }}
          >
            <div style={{ fontWeight: 700 }}>{entry.operation}</div>
            <div style={{ opacity: 0.7, fontSize: 10, display: 'flex', gap: 8 }}>
              <span>{formatRelative(entry.timestamp)}</span>
              <span>+{diff.added.length}</span>
              <span>-{diff.removed.length}</span>
              <span>~{diff.modified.length}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Mount in `AnalystProLayout.jsx`**

Add import alongside existing freeform panel imports:

```jsx
import HistoryInspectorPanel from '../freeform/panels/HistoryInspectorPanel';
```

In the right rail block (around line 222-233), insert ABOVE `<ZonePropertiesPanel />`:

```jsx
        {/* Right rail */}
        <div
          data-testid="analyst-pro-right-rail"
          style={{ width: 240, display: 'flex', flexDirection: 'column',
                   borderLeft: '1px solid var(--chrome-bar-border, var(--border-default))',
                   overflow: 'auto' }}
        >
          <HistoryInspectorPanel />
          <ZonePropertiesPanel />
        </div>
```

- [ ] **Step 5: Bind Cmd/Ctrl+H in `useKeyboardShortcuts.js`**

Inside the handler in `frontend/src/components/dashboard/freeform/hooks/useKeyboardShortcuts.js`, insert alongside the other `mod` branches (e.g. after the Ctrl+`;` block around line 135):

```js
      // Plan 6b — Cmd/Ctrl+H toggles history inspector
      if (mod && e.key.toLowerCase() === 'h') {
        e.preventDefault();
        const toggle = useStore.getState().toggleHistoryPanelAnalystPro;
        if (toggle) toggle();
        return;
      }
```

- [ ] **Step 6: Run test**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/HistoryInspectorPanel.test.tsx`
Expected: PASS — 4/4.

- [ ] **Step 7: Full freeform suite regression**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform`
Expected: PASS — no regressions across the 48+ test files.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/dashboard/freeform/panels/HistoryInspectorPanel.jsx \
        frontend/src/components/dashboard/modes/AnalystProLayout.jsx \
        frontend/src/components/dashboard/freeform/hooks/useKeyboardShortcuts.js \
        frontend/src/components/dashboard/freeform/__tests__/HistoryInspectorPanel.test.tsx
git commit -m "feat(analyst-pro): HistoryInspectorPanel with diff preview + Cmd+H (Plan 6b T6)"
```

---

## Task 7: Smoke verification + roadmap status update

**Files:**
- Modify: `docs/analyst_pro_tableau_parity_roadmap.md` — mark Plan 6b as shipped in the Phase Index row and append a status line at the end of the `Plan 6b` section.

- [ ] **Step 1: Build + lint guard**

Run in parallel:
```bash
cd frontend && npm run lint
cd frontend && npm run build
```
Expected: both succeed. If lint warns on unused vars named with leading `_`, that's acceptable per ESLint config (`no-unused-vars` ignores `^[A-Z_]`).

- [ ] **Step 2: Full freeform vitest run**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform`
Expected: All tests green. New files contribute ~4+6+5+10 = **25+ assertions**.

- [ ] **Step 3: Smoke-verify in dev server**

Run `cd backend && uvicorn main:app --reload --port 8002` in one shell and `cd frontend && npm run dev` in another. Open `http://localhost:5173/analytics`, switch to Analyst Pro archetype.

Verify manually:
1. Toolbar shows `↶ Undo (0)` and `↷ Redo (0)` both disabled immediately after load.
2. Insert a floating object (via `ObjectLibraryPanel`). Undo count goes to `1`. Tooltip reads `Undo 1 operation. Last: Insert object`.
3. Click `🕓 History`. Right-rail panel opens. Row shows `Insert object`, `just now`, `+1 -0 ~0`.
4. Click the row. Dashboard reverts to the initial empty state. Redo count = 1, tooltip `Redo 1 operation. Next: Insert object`.
5. Resize a zone by drag. New entry `Resize zone`. Tooltip confirms.
6. Press `Cmd+H` (or `Ctrl+H`). Panel closes. Press again — re-opens.
7. Press `Cmd+Z` — undo fires; row stays in panel.

Note anything surprising in the smoke-verification commit body.

- [ ] **Step 4: Update roadmap**

Open `docs/analyst_pro_tableau_parity_roadmap.md`. In the Phase Index row for Phase 6, change `6b–6e` to `6b ✅ (2026-04-17) / 6c–6e` (mirrors the existing `6a ✅ (2026-04-17)` style on that row). Append after the Plan 6b `Task count target: 6–8.` line:

```md
**Status:** ✅ Shipped 2026-04-17. 7 tasks. New tests: `store.historyEntries`, `store.operationLabels`, `historyDiff`, `UndoRedoToolbar`, `HistoryInspectorPanel` (25+ assertions). All 23 store callsites + 3 hook callsites now pass labels; `jumpToHistoryAnalystPro` enables random-access revert (not Revert-to-saved — §XVII.2 out of scope).
```

- [ ] **Step 5: Commit**

```bash
git add docs/analyst_pro_tableau_parity_roadmap.md
git commit -m "chore(analyst-pro): Plan 6b smoke verification + roadmap status (Plan 6b T7)"
```

---

## Self-Review Checklist (run after completion, not during)

- Every deliverable in Roadmap §Plan 6b maps to a task: (1) toolbar buttons — T5; (2) operation labels — T1 + T3; (3) history inspector panel — T6; (4) store additions (entry shape, `jumpToHistory`) — T1 + T2. ✅
- Operation Label Catalogue lists all 23 store + 5 external callsites with exact strings. ✅
- TDD for `jumpToHistoryAnalystPro` (T2) + operation-label round trip (T3). ✅
- A11y: buttons have `aria-label` with counts (T5); panel has `role="region"` + `aria-live="polite"` (T6). ✅
- Commit per task, format `feat(analyst-pro): … (Plan 6b Tn)` / `chore(analyst-pro): … (Plan 6b T7)`. ✅
- No placeholder content; every code block is a complete change. ✅
- Types consistent: `HistoryEntry = { snapshot, operation, timestamp }` used identically across T1/T2/T5/T6. ✅
- `setZoneProperty.test.ts` patched in T1 to match new entry shape — avoids snap regression. ✅
- Does not implement Revert, delta coalescing, or persistence (explicit scope boundaries). ✅
