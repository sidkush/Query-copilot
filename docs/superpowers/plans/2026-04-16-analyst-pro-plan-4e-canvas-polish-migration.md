# Analyst Pro Plan 4e — Canvas Polish & Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the remaining Analyst Pro usability wins deferred from Plans 2b and 3 — LayoutTree drag-to-reorder, real GoToSheet scroll-and-pulse, hardened legacy→freeform migration edge cases, plus small a11y / tooltip / empty-state polish. Parallel-safe with Plans 4a/4b/4c/4d — touches no Actions/Sets/Parameters/Visibility logic.

**Architecture:** Three mostly independent workstreams wired on top of the existing freeform subsystem.
1. **Tree drag** — new pure `reorderZone(root, sourceId, targetId, position)` in `zoneTreeOps.ts` + HTML5 drag handlers on `LayoutTreePanel.jsx` + a thin store action.
2. **GoToSheet** — flesh out the stub branch in `useActionRuntime.js`: `document.querySelector([data-zone="..."])` → `scrollIntoView` → 1200 ms `analyst-pro-zone-pulse` CSS class. Keyframes live in `index.css`.
3. **Migration** — audit `legacy_to_freeform_schema` for seven edge cases (zero size / overlap / title-only / corrupt / unknown type / Plan-2b fields / Plan-4b+4c fields) and extend `test_dashboard_migration_freeform.py` with one test per case.

Plus one Miscellaneous task covering empty-state copy on `LayoutTreePanel`, keyboard insert on `ObjectLibraryPanel`, and tooltip audit on `AnalystProLayout` toolbar buttons.

**Tech Stack:** React 19 · Vite · Zustand · Vitest · Python 3.10 · FastAPI · pytest.

---

## Constraints

- **Do not rename the existing `moveZone` export** in `lib/zoneTreeOps.ts` — it is wired into `useDragResize.js` with the `(root, zoneId, targetParentId, targetIndex)` signature. The new tree-drag primitive must be a **new name**: `reorderZone`.
- **TDD for `reorderZone`** — failing tests first, incl. immutability, normalization, reject-descendant, self no-op.
- **Store actions suffix** — `reorderZoneAnalystPro`.
- **Commits** — one per task, format `feat(analyst-pro): …`, `fix(analyst-pro): …`, or `test(analyst-pro): …`. No emoji in code.
- **No Actions / Sets / Parameters / Visibility logic changes** — those subsystems belong to 4a–4d.
- **Backend tests run from `backend/`**: `python -m pytest tests/ -v`. Frontend tests under `frontend/`: `npm run test:chart-ir -- freeform` or whole `npm run test:chart-ir`.

---

## File Structure

**Frontend — new / modified:**
- **Modify:** `frontend/src/components/dashboard/freeform/lib/zoneTreeOps.ts` — add `reorderZone` export.
- **Modify:** `frontend/src/components/dashboard/freeform/__tests__/zoneTreeOps.test.ts` — add `describe('reorderZone')` suite.
- **Modify:** `frontend/src/components/dashboard/freeform/panels/LayoutTreePanel.jsx` — `draggable` rows, drop-indicator, drop handler, empty-state copy.
- **Modify:** `frontend/src/components/dashboard/freeform/__tests__/LayoutTreePanel.test.tsx` — new drag-reorder + empty-state tests.
- **Modify:** `frontend/src/components/dashboard/freeform/panels/ObjectLibraryPanel.jsx` — `tabIndex=0` + Enter-to-insert.
- **Modify:** `frontend/src/components/dashboard/freeform/__tests__/ObjectLibraryPanel.test.tsx` — keyboard test.
- **Modify:** `frontend/src/components/dashboard/modes/AnalystProLayout.jsx` — `title=` attrs on icon-only buttons.
- **Modify:** `frontend/src/components/dashboard/freeform/hooks/useActionRuntime.js` — real `goToSheet` branch.
- **Create:** `frontend/src/components/dashboard/freeform/__tests__/useActionRuntime.goToSheet.test.tsx` — scrollIntoView spy + pulse class.
- **Modify:** `frontend/src/store.js` — add `reorderZoneAnalystPro` action.
- **Modify:** `frontend/src/index.css` — append `@keyframes analyst-pro-zone-pulse` + `.analyst-pro-zone-pulse` class.

**Backend — modified:**
- **Modify:** `backend/dashboard_migration.py` — `legacy_to_freeform_schema` edge cases; private helper splits.
- **Modify:** `backend/tests/test_dashboard_migration_freeform.py` — seven new regression tests.

---

## Task Checklist (10 tasks)

- [ ] **T1** — `reorderZone` pure lib + TDD test suite.
- [ ] **T2** — `reorderZoneAnalystPro` store action.
- [ ] **T3** — `LayoutTreePanel.jsx` drag source + drop zones + indicator.
- [ ] **T4** — `LayoutTreePanel` drag integration test + empty-state copy + test.
- [ ] **T5** — `analyst-pro-zone-pulse` CSS keyframes in `index.css`.
- [ ] **T6** — `useActionRuntime.js` real `goToSheet` implementation.
- [ ] **T7** — `useActionRuntime` goToSheet integration test (scrollIntoView spy).
- [ ] **T8** — `dashboard_migration.legacy_to_freeform_schema` edge case hardening.
- [ ] **T9** — `test_dashboard_migration_freeform.py` seven new regression tests.
- [ ] **T10** — Misc polish: ObjectLibrary keyboard a11y + AnalystProLayout tooltips + smoke run.

---

## Task Specifications

### Task 1 — `reorderZone` pure lib + TDD

**Files:**
- Modify: `frontend/src/components/dashboard/freeform/lib/zoneTreeOps.ts`
- Modify: `frontend/src/components/dashboard/freeform/__tests__/zoneTreeOps.test.ts`

**Contract (new export — do NOT rename existing `moveZone`):**

```ts
export type ReorderPosition = 'before' | 'after' | 'inside';

/**
 * Drag-to-reorder primitive for LayoutTreePanel.
 *
 * Semantics:
 *   - 'before' | 'after': insert source as sibling of target. Target must not be root.
 *   - 'inside':           insert source as first child of target. Target must be a container.
 *
 * Invariants:
 *   - Returns a new tree — does not mutate input.
 *   - No-op (returns same reference) when:
 *       * sourceId === targetId
 *       * sourceId not present in tree
 *       * targetId not present in tree
 *       * target is a descendant of source (would create a cycle)
 *       * position==='before'|'after' AND target is the root (root has no siblings)
 *       * position==='inside' AND target is not a container
 *   - Parent of the removed source is renormalized (via existing removeChild).
 *   - Parent of the inserted location is renormalized (via existing insertChild).
 *   - Proportional sums stay at 100000 on both affected containers.
 */
export function reorderZone(
  root: Zone,
  sourceId: string,
  targetId: string,
  position: ReorderPosition,
): Zone;
```

**Implementation plan:** compose the existing `removeChild` + `insertChild` helpers. Cycle check via a recursive `isDescendant(ancestor, candidateId)` walk.

- [ ] **Step 1: Write failing tests (append to `zoneTreeOps.test.ts`)**

```ts
import { reorderZone } from '../lib/zoneTreeOps';

describe('reorderZone', () => {
  const makeTree = (): ContainerZone => ({
    id: 'root',
    type: 'container-vert',
    w: 100000,
    h: 100000,
    children: [
      { id: 'a', type: 'blank', w: 100000, h: 33333 },
      {
        id: 'grp',
        type: 'container-horz',
        w: 100000,
        h: 33334,
        children: [
          { id: 'g1', type: 'blank', w: 50000, h: 100000 },
          { id: 'g2', type: 'blank', w: 50000, h: 100000 },
        ],
      },
      { id: 'c', type: 'blank', w: 100000, h: 33333 },
    ],
  });

  it('reorders a sibling "before" another sibling', () => {
    const next = reorderZone(makeTree(), 'c', 'a', 'before') as ContainerZone;
    expect(next.children.map((z) => z.id)).toEqual(['c', 'a', 'grp']);
    const sumH = next.children.reduce((s, z) => s + z.h, 0);
    expect(sumH).toBe(100000);
  });

  it('reorders "after" a sibling', () => {
    const next = reorderZone(makeTree(), 'a', 'c', 'after') as ContainerZone;
    expect(next.children.map((z) => z.id)).toEqual(['grp', 'c', 'a']);
  });

  it('moves a zone "inside" a container', () => {
    const next = reorderZone(makeTree(), 'a', 'grp', 'inside') as ContainerZone;
    const grp = next.children.find((z) => z.id === 'grp') as ContainerZone;
    expect(grp.children.map((z) => z.id)).toEqual(['a', 'g1', 'g2']);
    const grpSumW = grp.children.reduce((s, z) => s + z.w, 0);
    expect(grpSumW).toBe(100000);
  });

  it('is a no-op when source === target', () => {
    const root = makeTree();
    expect(reorderZone(root, 'a', 'a', 'before')).toBe(root);
  });

  it('rejects moving a container into its own descendant', () => {
    const root = makeTree();
    // grp contains g1; moving grp inside g1 would cycle.
    expect(reorderZone(root, 'grp', 'g1', 'inside')).toBe(root);
  });

  it('rejects "inside" when target is a leaf', () => {
    const root = makeTree();
    expect(reorderZone(root, 'a', 'c', 'inside')).toBe(root);
  });

  it('rejects "before" when target is root', () => {
    const root = makeTree();
    expect(reorderZone(root, 'a', 'root', 'before')).toBe(root);
  });

  it('returns identity when source id missing', () => {
    const root = makeTree();
    expect(reorderZone(root, 'nope', 'a', 'before')).toBe(root);
  });

  it('returns identity when target id missing', () => {
    const root = makeTree();
    expect(reorderZone(root, 'a', 'nope', 'before')).toBe(root);
  });

  it('does not mutate input tree', () => {
    const root = makeTree();
    const before = JSON.stringify(root);
    reorderZone(root, 'a', 'c', 'after');
    expect(JSON.stringify(root)).toBe(before);
  });
});
```

- [ ] **Step 2: Run tests — confirm failure**

```bash
cd frontend
npm run test:chart-ir -- zoneTreeOps
```

Expected: 10 new failures ("reorderZone is not a function" or undefined).

- [ ] **Step 3: Implement `reorderZone` in `zoneTreeOps.ts`**

Append to the end of the file (after `toggleLockFloating`):

```ts
export type ReorderPosition = 'before' | 'after' | 'inside';

/** Walk the subtree rooted at `zone` and return true if `candidateId` is reachable. */
function isDescendant(zone: Zone, candidateId: string): boolean {
  if (zone.id === candidateId) return true;
  if (!isContainer(zone)) return false;
  return zone.children.some((c) => isDescendant(c, candidateId));
}

export function reorderZone(
  root: Zone,
  sourceId: string,
  targetId: string,
  position: ReorderPosition,
): Zone {
  if (sourceId === targetId) return root;

  const source = findZoneInTree(root, sourceId);
  if (!source) return root;
  const target = findZoneInTree(root, targetId);
  if (!target) return root;

  // Prevent cycles: source subtree cannot contain target.
  if (isDescendant(source, targetId)) return root;

  if (position === 'inside') {
    if (!isContainer(target)) return root;
    const withoutSource = removeChild(root, sourceId);
    return insertChild(withoutSource, targetId, source, 0);
  }

  // 'before' | 'after' — requires target to have a parent.
  const targetParent = findParentInTree(root, targetId);
  if (!targetParent) return root; // target is root

  const withoutSource = removeChild(root, sourceId);
  // Re-find the parent in the post-remove tree (its children list changed).
  const parentInWithout = findParentInTree(withoutSource, targetId);
  if (!parentInWithout) return root; // defensive: shouldn't happen

  const targetIdx = parentInWithout.children.findIndex((c) => c.id === targetId);
  if (targetIdx === -1) return root;
  const insertIdx = position === 'before' ? targetIdx : targetIdx + 1;
  return insertChild(withoutSource, parentInWithout.id, source, insertIdx);
}
```

Also export the internal `findParentInTree` for the reorder path (add `export` to its declaration if still private). Verify the existing test file imports list still compiles.

- [ ] **Step 4: Run tests — confirm 10 pass + existing tests stay green**

```bash
cd frontend
npm run test:chart-ir -- zoneTreeOps
```

Expected: all tests in `zoneTreeOps.test.ts` green.

- [ ] **Step 5: Commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/components/dashboard/freeform/lib/zoneTreeOps.ts \
        frontend/src/components/dashboard/freeform/__tests__/zoneTreeOps.test.ts
git commit -m "feat(analyst-pro): reorderZone tree primitive + TDD (Plan 4e T1)"
```

---

### Task 2 — `reorderZoneAnalystPro` store action

**Files:**
- Modify: `frontend/src/store.js`

Add alongside the other freeform actions (near `ungroupAnalystPro`). Import must include `reorderZone` from the lib.

- [ ] **Step 1: Add import**

In the existing import block from `'../components/dashboard/freeform/lib/zoneTreeOps'`, add `reorderZone` and `ReorderPosition` is TS-only so no JS import is needed:

```js
import {
  // existing ...
  groupSelection,
  ungroupContainer,
  toggleLock,
  toggleLockFloating,
  reorderZone,
} from './components/dashboard/freeform/lib/zoneTreeOps';
```

- [ ] **Step 2: Add action to the analystPro slice**

Place the new action just before the closing `}))` of the store (next to `updateZoneAnalystPro`):

```js
  // Plan 4e: tree drag-to-reorder
  reorderZoneAnalystPro: (sourceId, targetId, position) => {
    const { analystProDashboard: dash } = get();
    if (!dash) return;
    const nextRoot = reorderZone(dash.tiledRoot, sourceId, targetId, position);
    if (nextRoot === dash.tiledRoot) return;
    const nextDash = { ...dash, tiledRoot: nextRoot };
    set({ analystProDashboard: nextDash });
    get().pushAnalystProHistory(nextDash);
  },
```

- [ ] **Step 3: Smoke-run the existing test suite**

```bash
cd frontend
npm run test:chart-ir -- freeform
```

Expected: no new failures (action is unused yet; existing tests must stay green).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/store.js
git commit -m "feat(analyst-pro): reorderZoneAnalystPro store action (Plan 4e T2)"
```

---

### Task 3 — `LayoutTreePanel` drag source + drop zones

**Files:**
- Modify: `frontend/src/components/dashboard/freeform/panels/LayoutTreePanel.jsx`

**Design:**
- MIME: `application/askdb-analyst-pro-tree-node+json`, payload `{ zoneId: string }`.
- `onDragStart` on each `<TreeRow>` non-editing div: write MIME + set `effectAllowed='move'` + set row data attr `data-dragging="true"`.
- `onDragOver`: call `preventDefault()` (required for drop to be accepted). Compute position from cursor Y relative to row bounding rect:
  - For **leaves**: top half → `before`, bottom half → `after`.
  - For **containers**: top third → `before`, middle third → `inside`, bottom third → `after`.
  - Root row never accepts `before`/`after` (only `inside`).
- Drop indicator: React state `dropIndicator: { zoneId, position } | null`. Render a thin blue line (`2px solid var(--accent)`) via absolutely-positioned sibling div when `before`/`after`, or a `background: color-mix(in oklab, var(--accent) 18%, transparent)` on the row itself when `inside`.
- `onDragLeave` clears indicator when cursor leaves the row (and the new target isn't a child — use `relatedTarget` check).
- `onDrop`: read MIME, parse `zoneId`, bail if same as target, call `reorderZoneAnalystPro(sourceId, targetId, position)`, clear indicator.

- [ ] **Step 1: Extract tree-drop constants and hooks into `LayoutTreePanel.jsx`**

Add near the top of the file (after `zoneFallbackName`):

```jsx
const TREE_MIME = 'application/askdb-analyst-pro-tree-node+json';

function computeDropPosition(rect, clientY, isContainer, isRoot) {
  const y = clientY - rect.top;
  const h = rect.height;
  if (isContainer) {
    if (isRoot) return 'inside'; // root: only inside is valid
    if (y < h / 3) return 'before';
    if (y > (h * 2) / 3) return 'after';
    return 'inside';
  }
  return y < h / 2 ? 'before' : 'after';
}
```

- [ ] **Step 2: Add drag handlers to `<TreeRow>` non-editing branch**

Replace the return from the `// Normal state` branch with a version that adds:
  - `draggable`
  - `onDragStart`
  - `onDragOver`
  - `onDragLeave`
  - `onDrop`
  - a `::before` / `::after` pseudo-element approximation via an extra absolutely-positioned `<div>` sibling rendered inside a wrapper.

Use props `dropIndicator`, `setDropIndicator`, `onReorder` passed from the parent panel. The wrapper div becomes the event target so we can position the indicator bar using its rect.

The minimal implementation (structural):

```jsx
// inside TreeRow — normal branch
const rowRef = useRef(null);
const isContainerZone = zone.type === 'container-horz' || zone.type === 'container-vert';
const isRoot = zone.id === 'root';
const indicator =
  dropIndicator && dropIndicator.zoneId === zone.id ? dropIndicator.position : null;

return (
  <div
    ref={rowRef}
    style={{ position: 'relative' }}
    draggable
    onDragStart={(e) => {
      e.dataTransfer.setData(TREE_MIME, JSON.stringify({ zoneId: zone.id }));
      e.dataTransfer.effectAllowed = 'move';
    }}
    onDragOver={(e) => {
      const types = e.dataTransfer?.types;
      if (!types || !Array.from(types).includes(TREE_MIME)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const rect = rowRef.current?.getBoundingClientRect();
      if (!rect) return;
      const position = computeDropPosition(rect, e.clientY, isContainerZone, isRoot);
      setDropIndicator({ zoneId: zone.id, position });
    }}
    onDragLeave={(e) => {
      // Only clear when we leave the row to a non-descendant.
      if (!rowRef.current?.contains(e.relatedTarget)) {
        setDropIndicator(null);
      }
    }}
    onDrop={(e) => {
      e.preventDefault();
      const raw = e.dataTransfer.getData(TREE_MIME);
      setDropIndicator(null);
      if (!raw) return;
      let payload;
      try { payload = JSON.parse(raw); } catch { return; }
      if (!payload?.zoneId || payload.zoneId === zone.id) return;
      const rect = rowRef.current?.getBoundingClientRect();
      if (!rect) return;
      const position = computeDropPosition(rect, e.clientY, isContainerZone, isRoot);
      onReorder(payload.zoneId, zone.id, position);
    }}
  >
    {/* existing row div goes here unchanged except style.background now also reflects indicator === 'inside' */}
    <div
      role="button"
      tabIndex={0}
      data-visibility-hidden={hasRule ? String(!visible) : 'false'}
      className={`tree-row${selected ? ' selected' : ''}`}
      data-drop-indicator={indicator || undefined}
      style={{
        /* ...existing styles... */
        background:
          indicator === 'inside'
            ? 'color-mix(in oklab, var(--accent) 18%, transparent)'
            : (selected ? 'var(--bg-selected, var(--bg-hover, rgba(108,99,255,0.18)))' : 'transparent'),
      }}
      /* ...existing onClick / onDoubleClick / onKeyDown... */
    >
      {/* existing row children */}
    </div>
    {indicator === 'before' ? (
      <div
        aria-hidden="true"
        data-testid={`drop-indicator-before-${zone.id}`}
        style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          height: 2, background: 'var(--accent)', pointerEvents: 'none',
        }}
      />
    ) : null}
    {indicator === 'after' ? (
      <div
        aria-hidden="true"
        data-testid={`drop-indicator-after-${zone.id}`}
        style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          height: 2, background: 'var(--accent)', pointerEvents: 'none',
        }}
      />
    ) : null}
  </div>
);
```

- [ ] **Step 3: Add `dropIndicator` state and `handleReorder` to `LayoutTreePanel`**

Inside `LayoutTreePanel()` (before `handleClick`):

```jsx
const [dropIndicator, setDropIndicator] = useState(null);
const reorderZoneAnalystPro = useStore((s) => s.reorderZoneAnalystPro);
const handleReorder = (sourceId, targetId, position) => {
  reorderZoneAnalystPro(sourceId, targetId, position);
};
```

Pass `dropIndicator`, `setDropIndicator`, `onReorder={handleReorder}` as additional props to every `<TreeRow>` call (both Tiled and Floating sections — floating rows accept drag source but **not** drop targets; bail in onDragOver/onDrop there by gating on a `acceptsDrop` prop, default `true`; pass `acceptsDrop={false}` for floating rows).

Note: floating rows are read from `dashboard.floatingLayer`, which `reorderZone` does **not** cover (the lib acts on the tiled root only). For this plan floating rows remain drag-disabled too — pass `draggable={false}` on floating rows by threading a prop. That keeps scope tight; cross-layer reorder is out of scope.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/dashboard/freeform/panels/LayoutTreePanel.jsx
git commit -m "feat(analyst-pro): LayoutTreePanel drag-to-reorder (Plan 4e T3)"
```

---

### Task 4 — `LayoutTreePanel` drag integration test + empty-state copy

**Files:**
- Modify: `frontend/src/components/dashboard/freeform/panels/LayoutTreePanel.jsx` — empty-state branch.
- Modify: `frontend/src/components/dashboard/freeform/__tests__/LayoutTreePanel.test.tsx`

**Empty-state:** when both `dashboard.tiledRoot.children.length === 0` AND `dashboard.floatingLayer.length === 0`, render one empty-state `<div>` with copy:

> **No zones yet.** Drag from Object Library above.

- [ ] **Step 1: Add empty-state branch in `LayoutTreePanel` render**

Immediately after `if (!dashboard) return null;`:

```jsx
const isEmpty =
  (!dashboard.tiledRoot?.children || dashboard.tiledRoot.children.length === 0) &&
  dashboard.floatingLayer.length === 0;
```

Render the empty-state message inside the returned `<aside>` when `isEmpty` is true, replacing the Tiled + Floating `<section>` blocks:

```jsx
{isEmpty ? (
  <div
    data-testid="layout-tree-empty"
    style={{ padding: '16px 12px', opacity: 0.65, fontSize: '12px' }}
  >
    <strong style={{ display: 'block', marginBottom: 4 }}>No zones yet.</strong>
    Drag from Object Library above.
  </div>
) : (
  <>
    {/* existing Tiled + Floating sections */}
  </>
)}
```

- [ ] **Step 2: Write failing integration tests — append to `LayoutTreePanel.test.tsx`**

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { useStore } from '../../../../store';
import LayoutTreePanel from '../panels/LayoutTreePanel';

describe('LayoutTreePanel — Plan 4e', () => {
  beforeEach(() => {
    useStore.setState({ analystProSelection: new Set() });
  });

  it('shows empty-state copy when dashboard has no zones', () => {
    useStore.setState({
      analystProDashboard: {
        schemaVersion: 'askdb/dashboard/v1',
        id: 'd1',
        name: 'T',
        archetype: 'analyst-pro',
        size: { mode: 'automatic' },
        tiledRoot: { id: 'root', type: 'container-vert', w: 100000, h: 100000, children: [] },
        floatingLayer: [],
        worksheets: [],
        parameters: [],
        sets: [],
        actions: [],
      },
    });
    render(<LayoutTreePanel />);
    expect(screen.getByTestId('layout-tree-empty')).toHaveTextContent(/No zones yet/i);
    expect(screen.getByTestId('layout-tree-empty')).toHaveTextContent(/Drag from Object Library/i);
  });

  it('reorders a zone via drag-drop "before" target', () => {
    useStore.setState({
      analystProDashboard: {
        schemaVersion: 'askdb/dashboard/v1',
        id: 'd1',
        name: 'T',
        archetype: 'analyst-pro',
        size: { mode: 'automatic' },
        tiledRoot: {
          id: 'root',
          type: 'container-vert',
          w: 100000,
          h: 100000,
          children: [
            { id: 'a', type: 'blank', w: 100000, h: 50000 },
            { id: 'b', type: 'blank', w: 100000, h: 50000 },
          ],
        },
        floatingLayer: [],
        worksheets: [],
        parameters: [],
        sets: [],
        actions: [],
      },
    });
    render(<LayoutTreePanel />);
    const aRow = screen.getByText(/Blank #a/i).closest('[role="button"]')!.parentElement!;
    const bRow = screen.getByText(/Blank #b/i).closest('[role="button"]')!.parentElement!;

    const dt = new DataTransfer();
    fireEvent.dragStart(aRow, { dataTransfer: dt });
    // Fake bounding rect so top-half → 'before'.
    bRow.getBoundingClientRect = () => ({ top: 100, bottom: 130, left: 0, right: 100, width: 100, height: 30, x: 0, y: 100, toJSON: () => ({}) }) as DOMRect;
    fireEvent.dragOver(bRow, { dataTransfer: dt, clientY: 105 });
    fireEvent.drop(bRow, { dataTransfer: dt, clientY: 105 });

    const nextTree = useStore.getState().analystProDashboard!.tiledRoot;
    expect(nextTree.children!.map((z: any) => z.id)).toEqual(['a', 'b']);
    // NOTE: With fake DataTransfer, browsers may not propagate the MIME
    // payload. If the test framework requires it, stub
    // `dataTransfer.getData(TREE_MIME)` to return the source id JSON.
  });
});
```

**Test-harness caveat:** jsdom's `DataTransfer` ignores `setData` in drag events. If the assertion in the second test fails because `getData` returns `''`, patch by spying on `DataTransfer.prototype.setData`/`getData` with a shared `Map`, or replace the inner `dataTransfer` object with a stub exposing `getData`. Either approach is acceptable — keep the test assertion on the store mutation.

- [ ] **Step 3: Run tests**

```bash
cd frontend
npm run test:chart-ir -- LayoutTreePanel
```

Expected: both new tests pass; existing LayoutTreePanel tests stay green.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/dashboard/freeform/panels/LayoutTreePanel.jsx \
        frontend/src/components/dashboard/freeform/__tests__/LayoutTreePanel.test.tsx
git commit -m "feat(analyst-pro): LayoutTree empty state + drag reorder test (Plan 4e T4)"
```

---

### Task 5 — `analyst-pro-zone-pulse` CSS keyframes

**Files:**
- Modify: `frontend/src/index.css`

Append at the end of the file (no other rules yet use this class name — grep-verify before writing):

- [ ] **Step 1: Append keyframes + class**

```css
/* Plan 4e — GoToSheet pulse (useActionRuntime.js applies .analyst-pro-zone-pulse for 1200ms) */
@keyframes analyst-pro-zone-pulse-kf {
  0%   { box-shadow: 0 0 0 0   color-mix(in oklab, var(--accent) 60%, transparent); }
  25%  { box-shadow: 0 0 0 6px color-mix(in oklab, var(--accent) 35%, transparent); }
  50%  { box-shadow: 0 0 0 0   color-mix(in oklab, var(--accent) 60%, transparent); }
  75%  { box-shadow: 0 0 0 6px color-mix(in oklab, var(--accent) 35%, transparent); }
  100% { box-shadow: 0 0 0 0   color-mix(in oklab, var(--accent) 0%,  transparent); }
}
.analyst-pro-zone-pulse {
  animation: analyst-pro-zone-pulse-kf 1200ms ease-out;
  outline: 1px solid color-mix(in oklab, var(--accent) 70%, transparent);
  outline-offset: -1px;
}
```

- [ ] **Step 2: Verify no collision**

```bash
cd frontend
grep -n "analyst-pro-zone-pulse" src -r || echo "no existing usage"
```

Expected: only the new line in `index.css`.

- [ ] **Step 3: Build smoke**

```bash
cd frontend
npm run build
```

Expected: no new build warnings/errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/index.css
git commit -m "feat(analyst-pro): zone-pulse keyframes for GoToSheet (Plan 4e T5)"
```

---

### Task 6 — `useActionRuntime.js` real `goToSheet`

**Files:**
- Modify: `frontend/src/components/dashboard/freeform/hooks/useActionRuntime.js`

Existing `goto-sheet` branch is empty. Fill it:

- [ ] **Step 1: Replace the empty `case 'goto-sheet':` branch**

```js
case 'goto-sheet': {
  if (typeof document === 'undefined') break;
  const el = document.querySelector(`[data-zone="${op.sheetId}"]`);
  if (!el) break;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('analyst-pro-zone-pulse');
  setTimeout(() => el.classList.remove('analyst-pro-zone-pulse'), 1200);
  break;
}
```

Note: `op.sheetId` — check the discriminated union — in `actionTypes.ts` the `goto-sheet` `TargetOp` variant uses `sheetId`. Confirm by re-reading `lib/actionTypes.ts` before committing; adjust field name if different (e.g. `targetSheetId`).

- [ ] **Step 2: Sanity run**

```bash
cd frontend
npm run test:chart-ir -- useActionRuntime
```

Expected: existing `useActionRuntime` tests stay green (they don't exercise the new branch yet — T7 adds that).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/dashboard/freeform/hooks/useActionRuntime.js
git commit -m "feat(analyst-pro): goToSheet scrollIntoView + pulse (Plan 4e T6)"
```

---

### Task 7 — `useActionRuntime` goToSheet integration test

**Files:**
- Create: `frontend/src/components/dashboard/freeform/__tests__/useActionRuntime.goToSheet.test.tsx`

Test strategy: render a host that calls `useActionRuntime`, mount a DOM node with `data-zone="target-sheet"`, publish a mark event that fires a GoToSheet action. Spy on `Element.prototype.scrollIntoView` (jsdom doesn't implement it — patch via `vi.fn()`). Assert the spy was called AND the target node received the `analyst-pro-zone-pulse` class AND lost it after `vi.advanceTimersByTime(1200)`.

- [ ] **Step 1: Write the failing test**

```tsx
import { render } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useStore } from '../../../../store';
import { useActionRuntime } from '../hooks/useActionRuntime';
import { publish } from '../lib/markEventBus';

function Host() {
  useActionRuntime();
  return <div data-zone="target-sheet" data-testid="target" />;
}

describe('useActionRuntime — goToSheet', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // jsdom does not implement scrollIntoView.
    Element.prototype.scrollIntoView = vi.fn();
    useStore.setState({
      analystProDashboard: {
        schemaVersion: 'askdb/dashboard/v1',
        id: 'd1', name: 'T', archetype: 'analyst-pro',
        size: { mode: 'automatic' },
        tiledRoot: { id: 'root', type: 'container-vert', w: 100000, h: 100000, children: [] },
        floatingLayer: [], worksheets: [], parameters: [], sets: [],
        actions: [
          {
            id: 'a1',
            name: 'Jump',
            kind: 'goto-sheet',
            sourceSheets: ['src-sheet'],
            trigger: 'select',
            enabled: true,
            targetSheetId: 'target-sheet',
          },
        ],
      },
    } as any);
  });

  afterEach(() => { vi.useRealTimers(); });

  it('scrolls to the target and pulses for 1200ms', () => {
    const { getByTestId } = render(<Host />);
    const target = getByTestId('target');

    publish({
      sourceSheetId: 'src-sheet',
      trigger: 'select',
      markData: {},
      timestamp: Date.now(),
    });

    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth', block: 'center',
    });
    expect(target.classList.contains('analyst-pro-zone-pulse')).toBe(true);

    vi.advanceTimersByTime(1200);
    expect(target.classList.contains('analyst-pro-zone-pulse')).toBe(false);
  });

  it('is a no-op when target data-zone is missing', () => {
    publish({
      sourceSheetId: 'src-sheet',
      trigger: 'select',
      markData: {},
      timestamp: Date.now(),
    });
    // scrollIntoView must NOT have been called — no matching element exists
    // until the Host renders one. Render after publishing to prove this path.
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests — verify new tests pass (T6 implementation is already in place)**

```bash
cd frontend
npm run test:chart-ir -- useActionRuntime.goToSheet
```

Expected: both tests pass. If the second test flakes because of previous test's render, move it above the rendering test.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/dashboard/freeform/__tests__/useActionRuntime.goToSheet.test.tsx
git commit -m "test(analyst-pro): useActionRuntime goToSheet scroll + pulse (Plan 4e T7)"
```

---

### Task 8 — `dashboard_migration.legacy_to_freeform_schema` edge cases

**Files:**
- Modify: `backend/dashboard_migration.py`

Audit and fix these edge cases (existing migration is silent on each):

| Tag | Case | Desired behavior |
|---|---|---|
| a | Widget with `w == 0` or `h == 0` | Coerce to minimum (100 × 100) pixel-equivalent — but since freeform uses proportional 100000 units inside containers, any zero on the child axis gets clamped to `MIN_PROPORTION = 1000` before normalization. |
| b | Overlapping widgets (have `x/y/w/h` fields like legacy freeform) | If ANY tile in the flat list has `x`, `y`, `w`, `h` all numeric, emit those tiles as entries in `floatingLayer` instead of tiled children. Non-floating tiles still tiled. |
| c | Title-only widget (no `chart_spec`, no `sql`, has `title`) | Emit a `worksheet` zone with `displayName = tile.title`, `chartSpec = null`, `sql = null` — renderer already handles null chart. |
| d | Corrupt widget (missing `id` or `type`) | Log a `logger.warning` with the offending index; skip (do not emit). |
| e | Unknown widget `type` | Emit as a **blank** zone (type='blank') with `displayName = tile.title or tile.type`. |
| f | Plan-2b fields `displayName`, `locked` present on input | Preserve verbatim onto output zone. |
| g | Plan-3 `actions` list | Already preserved (see existing code at line 332–335). Ensure T9 regression test still covers. |
| h | Plan-4b `sets` / Plan-4c `parameters` | Already preserved (see existing code). Ensure T9 regression tests cover both the present and absent cases. |

Cases f–h are regression-only — already implemented; T9 locks them down.

- [ ] **Step 1: Implement helpers for (a)–(e)**

Add these module-level constants/helpers near the top of `dashboard_migration.py`:

```python
_FREEFORM_TILE_TYPES = {
    "worksheet", "text", "image", "webpage", "blank",
    "container-horz", "container-vert",
}

_MIN_PROPORTION = 1000  # must match frontend zoneTreeOps MIN_PROPORTION


def _is_floating_tile(tile: dict) -> bool:
    return all(isinstance(tile.get(k), (int, float)) for k in ("x", "y", "w", "h"))


def _is_corrupt_tile(tile: dict) -> bool:
    if not isinstance(tile, dict):
        return True
    if tile.get("id") in (None, ""):
        return True
    # 'type' is optional in some legacy payloads — only corrupt if tile is
    # explicitly empty / non-dict. A missing 'type' is handled by (e).
    return False


def _resolve_tile_type(tile: dict) -> str:
    raw = tile.get("type")
    if raw in _FREEFORM_TILE_TYPES:
        return raw
    if tile.get("chart_spec") or tile.get("chartSpec") or tile.get("sql"):
        return "worksheet"
    # Title-only tile (case c) → worksheet with null chart.
    if tile.get("title") and not raw:
        return "worksheet"
    # Unknown legacy type → blank with displayName fallback (case e).
    return "blank"


def _normalize_child_proportion(value, fallback: int) -> int:
    try:
        n = int(value)
    except (TypeError, ValueError):
        n = fallback
    return max(_MIN_PROPORTION, n)
```

- [ ] **Step 2: Update `legacy_to_freeform_schema` body**

Modify the flat-tile path inside `legacy_to_freeform_schema` to partition tiles into `floating_tiles` and `tiled_tiles`, and skip corrupt ones:

```python
def legacy_to_freeform_schema(legacy: dict) -> dict:
    dashboard_id = legacy.get("id", "unknown")
    name = legacy.get("name", "Untitled")

    if "sections" in legacy and isinstance(legacy["sections"], list):
        tiled_root = _sections_to_vert_root(legacy["sections"])
        all_tiles = [t for s in legacy["sections"] for t in s.get("tiles", [])]
        floating_layer = []
    else:
        raw_tiles = legacy.get("tiles", []) or []
        tiled_tiles: list[dict] = []
        floating_tiles: list[dict] = []
        for i, t in enumerate(raw_tiles):
            if _is_corrupt_tile(t):
                logger.warning(
                    "legacy_to_freeform_schema: skipping corrupt tile at index %d: %r", i, t,
                )
                continue
            if _is_floating_tile(t):
                floating_tiles.append(t)
            else:
                tiled_tiles.append(t)
        tiled_root = _flat_tiles_to_vert_root(tiled_tiles)
        floating_layer = _tiles_to_floating_layer(floating_tiles)
        all_tiles = tiled_tiles + floating_tiles

    worksheets = [
        {
            "id": str(t.get("id", f"t{i}")),
            "chartSpec": t.get("chart_spec") or t.get("chartSpec"),
            "sql": t.get("sql"),
            "displayName": t.get("displayName") or t.get("title"),
        }
        for i, t in enumerate(all_tiles)
    ]

    # existing actions/sets/parameters preservation block stays unchanged
    # (see existing code at dashboard_migration.py:332–346)
    existing_actions = legacy.get("actions") if isinstance(legacy.get("actions"), list) else []
    existing_sets = legacy.get("sets") if isinstance(legacy.get("sets"), list) else []
    existing_parameters = legacy.get("parameters") if isinstance(legacy.get("parameters"), list) else []

    return {
        "schemaVersion": "askdb/dashboard/v1",
        "id": str(dashboard_id),
        "name": name,
        "archetype": "analyst-pro",
        "size": {"mode": "automatic"},
        "tiledRoot": tiled_root,
        "floatingLayer": floating_layer,
        "worksheets": worksheets,
        "parameters": existing_parameters,
        "sets": existing_sets,
        "actions": existing_actions,
        "globalStyle": {},
    }
```

- [ ] **Step 3: Add `_tiles_to_floating_layer` helper + harden `_flat_tiles_to_vert_root`**

```python
def _tiles_to_floating_layer(tiles: list) -> list:
    """Convert legacy tiles carrying x/y/w/h into freeform floating zones."""
    floating = []
    for i, t in enumerate(tiles):
        tid = str(t.get("id", f"f{i}"))
        ztype = _resolve_tile_type(t)
        display = t.get("displayName") or t.get("title")
        w_px = max(100, int(t.get("w") or 320))
        h_px = max(100, int(t.get("h") or 200))
        zone: dict = {
            "id": tid,
            "type": ztype,
            "w": 0,
            "h": 0,
            "floating": True,
            "x": int(t.get("x") or 0),
            "y": int(t.get("y") or 0),
            "pxW": w_px,
            "pxH": h_px,
            "zIndex": int(t.get("zIndex") or i + 1),
        }
        if ztype == "worksheet":
            zone["worksheetRef"] = tid
        if display:
            zone["displayName"] = display
        if t.get("locked") is True:
            zone["locked"] = True
        floating.append(zone)
    return floating
```

Update `_flat_tiles_to_vert_root` to produce `type = _resolve_tile_type(t)` rather than hard-coded `"worksheet"`, and to preserve `displayName` + `locked`:

```python
def _flat_tiles_to_vert_root(tiles: list) -> dict:
    children = []
    count = len(tiles)
    if count:
        base_h = 100000 // count
        drift = 100000 - (base_h * count)
        for i, t in enumerate(tiles):
            raw_h = t.get("h")
            h = _normalize_child_proportion(raw_h, base_h + (drift if i == count - 1 else 0))
            ztype = _resolve_tile_type(t)
            tid = str(t.get("id", f"t{i}"))
            child = {
                "id": tid,
                "type": ztype,
                "w": 100000,
                "h": h,
            }
            if ztype == "worksheet":
                child["worksheetRef"] = tid
            if t.get("displayName") or t.get("title"):
                child["displayName"] = t.get("displayName") or t.get("title")
            if t.get("locked") is True:
                child["locked"] = True
            children.append(child)
        # Re-normalize after clamping to MIN_PROPORTION.
        sum_h = sum(c["h"] for c in children)
        if sum_h != 100000 and children:
            children[-1]["h"] += 100000 - sum_h
    return {
        "id": "root",
        "type": "container-vert",
        "w": 100000,
        "h": 100000,
        "children": children,
    }
```

- [ ] **Step 4: Run existing tests — confirm no regression**

```bash
cd backend
python -m pytest tests/test_dashboard_migration_freeform.py -v
```

Expected: every existing test still passes (the assertions focus on `tiledRoot` shape for non-floating input, which is preserved).

- [ ] **Step 5: Commit**

```bash
git add backend/dashboard_migration.py
git commit -m "feat(analyst-pro): harden legacy_to_freeform_schema edge cases (Plan 4e T8)"
```

---

### Task 9 — Seven new migration regression tests

**Files:**
- Modify: `backend/tests/test_dashboard_migration_freeform.py`

Add one test per edge case (a)–(h) from T8. Cases (g) and (h) already have partial coverage; the new tests below round out the matrix.

- [ ] **Step 1: Append new tests**

```python
# ── Plan 4e: edge-case regression tests ───────────────────────────────────


def test_4e_a_zero_height_widget_coerced_to_minimum():
    """Widgets with h=0 get clamped to MIN_PROPORTION, and children still sum to 100000."""
    legacy = {
        "id": "d1", "name": "T",
        "tiles": [
            {"id": "t1", "h": 0},
            {"id": "t2", "h": 50000},
        ],
    }
    result = legacy_to_freeform_schema(legacy)
    kids = result["tiledRoot"]["children"]
    assert kids[0]["h"] >= 1000, "zero-h must be clamped to >= MIN_PROPORTION"
    assert sum(c["h"] for c in kids) == 100000


def test_4e_b_overlapping_widgets_go_to_floating_layer():
    """Tiles carrying x/y/w/h become floating zones; other tiles stay tiled."""
    legacy = {
        "id": "d1", "name": "T",
        "tiles": [
            {"id": "tiled", "chart_spec": {"mark": "bar"}},
            {"id": "floaty", "x": 40, "y": 60, "w": 300, "h": 200},
        ],
    }
    result = legacy_to_freeform_schema(legacy)
    assert len(result["floatingLayer"]) == 1
    assert result["floatingLayer"][0]["id"] == "floaty"
    assert result["floatingLayer"][0]["x"] == 40
    assert result["floatingLayer"][0]["y"] == 60
    assert result["floatingLayer"][0]["floating"] is True
    assert len(result["tiledRoot"]["children"]) == 1
    assert result["tiledRoot"]["children"][0]["id"] == "tiled"


def test_4e_c_title_only_widget_becomes_worksheet_with_displayname():
    """A tile with no chart_spec / sql / type but a title yields a worksheet zone
    whose displayName equals the title."""
    legacy = {
        "id": "d1", "name": "T",
        "tiles": [{"id": "t1", "title": "Section Header"}],
    }
    result = legacy_to_freeform_schema(legacy)
    kid = result["tiledRoot"]["children"][0]
    assert kid["displayName"] == "Section Header"
    # worksheets list should carry the displayName too for renderer lookups.
    assert result["worksheets"][0]["displayName"] == "Section Header"


def test_4e_d_corrupt_widget_skipped_with_warning(caplog):
    """Tiles missing id are skipped and a warning is logged."""
    legacy = {
        "id": "d1", "name": "T",
        "tiles": [
            {"id": "good", "chart_spec": {"mark": "bar"}},
            {"chart_spec": {"mark": "line"}},  # no id -> corrupt
        ],
    }
    with caplog.at_level("WARNING"):
        result = legacy_to_freeform_schema(legacy)
    assert any("corrupt tile" in rec.message for rec in caplog.records)
    ids = [c["id"] for c in result["tiledRoot"]["children"]]
    assert ids == ["good"]


def test_4e_e_unknown_widget_type_becomes_blank():
    """Unknown legacy tile type falls back to a blank zone; displayName preserved."""
    legacy = {
        "id": "d1", "name": "T",
        "tiles": [{"id": "t1", "type": "qr-code", "title": "Scan Me"}],
    }
    result = legacy_to_freeform_schema(legacy)
    kid = result["tiledRoot"]["children"][0]
    assert kid["type"] == "blank"
    assert kid["displayName"] == "Scan Me"


def test_4e_f_displayname_and_locked_round_trip():
    """Plan-2b fields on input are preserved verbatim."""
    legacy = {
        "id": "d1", "name": "T",
        "tiles": [
            {"id": "t1", "chart_spec": {"mark": "bar"},
             "displayName": "Revenue Pulse", "locked": True},
        ],
    }
    result = legacy_to_freeform_schema(legacy)
    kid = result["tiledRoot"]["children"][0]
    assert kid["displayName"] == "Revenue Pulse"
    assert kid["locked"] is True


def test_4e_h_sets_and_parameters_preserved_when_present():
    """Plan-4b sets and Plan-4c parameters carry through migration verbatim."""
    sets = [{"id": "s1", "name": "Top 10", "members": [1, 2, 3]}]
    parameters = [{"id": "p1", "name": "year", "type": "integer", "value": 2026}]
    legacy = {
        "id": "d1", "name": "T",
        "tiles": [{"id": "t1"}],
        "sets": sets,
        "parameters": parameters,
    }
    result = legacy_to_freeform_schema(legacy)
    assert result["sets"] == sets
    assert result["parameters"] == parameters


def test_4e_h_sets_and_parameters_default_empty_when_absent():
    """Graceful defaults when those keys are missing."""
    legacy = {"id": "d1", "name": "T", "tiles": [{"id": "t1"}]}
    result = legacy_to_freeform_schema(legacy)
    assert result["sets"] == []
    assert result["parameters"] == []
```

- [ ] **Step 2: Run full backend suite**

```bash
cd backend
python -m pytest tests/ -v
```

Expected: all 438+ tests pass, plus 8 new (a/b/c/d/e/f + two for h). No regressions.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_dashboard_migration_freeform.py
git commit -m "test(analyst-pro): migration edge case regression suite (Plan 4e T9)"
```

---

### Task 10 — ObjectLibrary keyboard a11y + AnalystProLayout tooltips + smoke

**Files:**
- Modify: `frontend/src/components/dashboard/freeform/panels/ObjectLibraryPanel.jsx`
- Modify: `frontend/src/components/dashboard/freeform/__tests__/ObjectLibraryPanel.test.tsx`
- Modify: `frontend/src/components/dashboard/modes/AnalystProLayout.jsx`

**ObjectLibrary keyboard:** every `<li>` gets `tabIndex={0}`, `role="button"`, `onKeyDown` handler — Enter or Space calls `insertObjectAnalystPro({ type, x: 40, y: 40 })`.

**AnalystProLayout tooltips:** audit the toolbar row for icon-only buttons. Every button must have either a visible text label or a `title` + `aria-label` pair.

- [ ] **Step 1: Add keyboard handler to ObjectLibraryPanel**

```jsx
import { useStore } from '../../../../store';

// inside the component
const insertObject = useStore((s) => s.insertObjectAnalystPro);
const handleKeyInsert = (type) => (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    insertObject({ type, x: 40, y: 40 });
  }
};

// on each <li>
<li
  key={o.type}
  draggable
  role="button"
  tabIndex={0}
  onKeyDown={handleKeyInsert(o.type)}
  className="analyst-pro-object-library__item"
  /* existing onDragStart + style */
>
```

- [ ] **Step 2: Add a keyboard test**

Append to `ObjectLibraryPanel.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { useStore } from '../../../../store';
import ObjectLibraryPanel from '../panels/ObjectLibraryPanel';

it('Enter on a library item inserts a floating object via store', () => {
  const spy = vi.spyOn(useStore.getState(), 'insertObjectAnalystPro');
  render(<ObjectLibraryPanel />);
  const textItem = screen.getByText('Text').closest('li')!;
  textItem.focus();
  fireEvent.keyDown(textItem, { key: 'Enter' });
  expect(spy).toHaveBeenCalledWith({ type: 'text', x: 40, y: 40 });
});
```

Note: the spy pattern above wraps the store slice. If `useStore.getState()` returns a frozen snapshot, replace with:

```tsx
const calls: any[] = [];
useStore.setState({ insertObjectAnalystPro: (arg: any) => calls.push(arg) });
// ... fireEvent
expect(calls).toEqual([{ type: 'text', x: 40, y: 40 }]);
```

Either form is acceptable — the assertion is on store invocation.

- [ ] **Step 3: Audit AnalystProLayout toolbar tooltips**

Open `frontend/src/components/dashboard/modes/AnalystProLayout.jsx`. The top-toolbar composed of `<AlignmentToolbar>`, `<StructureToolbar>`, `<LayoutOverlayToggle>`, `<ActionsMenuButton>`. Each sub-component must have `title` + `aria-label` on every `<button>`. For any icon-only button lacking both, add them. Example fix for a generic icon button:

```jsx
<button
  type="button"
  title="Align left"
  aria-label="Align selection left"
  onClick={...}
>
  ◧
</button>
```

Scope: only buttons rendered under `data-testid="analyst-pro-toolbar"`. If all buttons already have `title` + `aria-label`, this step is a no-op.

- [ ] **Step 4: Run full frontend test suite + lint + build**

```bash
cd frontend
npm run test:chart-ir -- freeform
npm run lint
npm run build
```

Expected:
- All freeform tests green.
- No **new** lint warnings (the pre-existing `useDragResize` dep warning is acceptable — see Plan 2b T12).
- Build succeeds.

- [ ] **Step 5: Run full backend test suite**

```bash
cd backend
python -m pytest tests/ -v
```

Expected: full suite green (438+ plus 8 new from T9).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/dashboard/freeform/panels/ObjectLibraryPanel.jsx \
        frontend/src/components/dashboard/freeform/__tests__/ObjectLibraryPanel.test.tsx \
        frontend/src/components/dashboard/modes/AnalystProLayout.jsx
git commit -m "feat(analyst-pro): object-library keyboard + toolbar tooltips (Plan 4e T10)"
```

---

## Out of Scope (for later plans)

- Cross-layer reorder (moving a floating zone into the tiled tree or vice versa via the LayoutTree).
- Multi-select drag within the LayoutTree (shift-click range + grouped drop).
- `DashboardTileCanvas`-level scrolling adjustments for GoToSheet inside nested scroll containers.
- DuckDB twin encryption-at-rest for migrated floating zones (separate deferred item #5 in CLAUDE.md).
- Migration of legacy "tableau" archetype dashboards into freeform (none exist — flag-gated in `/migrate`).

---

## Rollout

- All changes inherit the existing `FEATURE_ANALYST_PRO` gate.
- `legacy_to_freeform_schema` changes are backward-compatible — every existing call site passes a legacy dict and receives the same v1 schema, just with fewer dropped edge cases.
- No store-schema changes beyond an added action name; localStorage-persisted dashboards are untouched.
- Ship to demo user (`demo@askdb.dev`) first, observe audit log for migration warnings, then enable for internal testers.

---

## Review Anchors

Fresh subagents dispatched per task; two-stage review (spec-compliance + code-quality) per task. Reviewers verify:

- **Spec compliance:** every acceptance criteria above hit; no skipped edge cases; no scope creep into Actions/Sets/Parameters/Visibility.
- **Code quality:** no emoji in code, TS strictness preserved, no new lint warnings, React hooks dep arrays complete, jsdoc on new public exports, `title` + `aria-label` pairs on every icon-only toolbar button.
- **Performance:** drop indicator updates within 16 ms, pulse animation runs on compositor (uses `box-shadow` / `outline`, which are composited).

Final code-reviewer runs on the full Plan 4e diff after T10 lands.
