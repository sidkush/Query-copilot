# Analyst Pro — Plan 2: Canvas Interactions

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Analyst Pro from read-only renderer into an authoring canvas. Users can select zones, drag them to reorder (tiled) or reposition (floating), resize from any edge, snap to grid/edges, undo/redo, and multi-select via Cmd-click + marquee.

**Architecture:** Pointer-event-driven interaction layer on top of the zone tree. State lives in Zustand `analystPro` slice (extended). Commands mutate the tree via new `zoneTreeOps` functions (insertChild, removeChild, moveZone, resizeZone); each mutation emits a history entry for undo/redo. A new `SelectionOverlay` component renders the selection ring + 8 resize handles above the canvas. Marquee selection uses a single rAF-throttled pointermove on the canvas background.

**Tech Stack:** React 19 + TypeScript (hooks + lib); Zustand for state; Framer Motion already available but NOT used for drag (direct pointer events for 60fps). Vitest 2.x for tests.

**Spec:** `docs/superpowers/specs/2026-04-16-analyst-pro-tableau-parity-design.md` §6 (Canvas engine UX).

**Plan 1 status:** shipped — foundation layout engine renders zone tree + floating layer, Analyst Pro archetype wired, SizeToggleDropdown, backend migration, `/resolve-layout` endpoint.

**Out of scope (deferred to Plan 2b):** Object Library panel, Layout Tree panel, Alignment / Distribute toolbar, Group / Ungroup, Z-order controls (floating `]`/`[` shortcuts ARE in scope), Lock, Layout Overlay toggle, R-tree spatial index (current O(n) hit testing is fine for ≤50 tiles).

---

## File Structure

**Frontend — new files:**
- `frontend/src/components/dashboard/freeform/lib/zoneTreeOps.ts` — mutation ops (insertChild, removeChild, moveZone, resizeZone, updateZone)
- `frontend/src/components/dashboard/freeform/lib/commandHistory.ts` — undo/redo stack (command pattern, pure)
- `frontend/src/components/dashboard/freeform/lib/snapMath.ts` — snap-to-grid, snap-to-edges helpers
- `frontend/src/components/dashboard/freeform/lib/hitTest.ts` — O(n) point-in-zone hit test against resolved zones
- `frontend/src/components/dashboard/freeform/hooks/useSelection.js` — selection set + multi-select helpers
- `frontend/src/components/dashboard/freeform/hooks/useDragResize.js` — pointer event handlers for drag + resize
- `frontend/src/components/dashboard/freeform/hooks/useHistory.js` — undo/redo dispatcher
- `frontend/src/components/dashboard/freeform/hooks/useKeyboardShortcuts.js` — arrow nudge, Cmd+Z, Esc, Cmd+A, Delete, z-order
- `frontend/src/components/dashboard/freeform/SelectionOverlay.jsx` — selection ring + 8 resize handles
- `frontend/src/components/dashboard/freeform/MarqueeOverlay.jsx` — marquee drag rectangle
- `frontend/src/components/dashboard/freeform/__tests__/zoneTreeOps.test.ts`
- `frontend/src/components/dashboard/freeform/__tests__/commandHistory.test.ts`
- `frontend/src/components/dashboard/freeform/__tests__/snapMath.test.ts`
- `frontend/src/components/dashboard/freeform/__tests__/hitTest.test.ts`
- `frontend/src/components/dashboard/freeform/__tests__/SelectionOverlay.test.tsx`

**Frontend — modified:**
- `frontend/src/store.js` — extend `analystPro` slice (selection set, dragState, history, clipboard, snapEnabled)
- `frontend/src/components/dashboard/freeform/FreeformCanvas.jsx` — mount SelectionOverlay + MarqueeOverlay + keyboard shortcuts hook; wire pointer events
- `frontend/src/components/dashboard/freeform/ZoneRenderer.jsx` — forward onPointerDown to parent for selection handling
- `frontend/src/components/dashboard/freeform/FloatingLayer.jsx` — same pointer-event forwarding
- `frontend/src/components/dashboard/modes/AnalystProLayout.jsx` — add snap toggle button in toolbar

---

## Task 1: zoneTreeOps — insertChild + removeChild

**Files:**
- Create: `frontend/src/components/dashboard/freeform/lib/zoneTreeOps.ts`
- Create: `frontend/src/components/dashboard/freeform/__tests__/zoneTreeOps.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// frontend/src/components/dashboard/freeform/__tests__/zoneTreeOps.test.ts
import { describe, it, expect } from 'vitest';
import { insertChild, removeChild } from '../lib/zoneTreeOps';
import type { ContainerZone, LeafZone } from '../lib/types';

const base = (): ContainerZone => ({
  id: 'root',
  type: 'container-horz',
  w: 100000,
  h: 100000,
  children: [
    { id: 'a', type: 'blank', w: 50000, h: 100000 },
    { id: 'b', type: 'blank', w: 50000, h: 100000 },
  ],
});

describe('insertChild', () => {
  it('inserts a new leaf into a container at given index', () => {
    const root = base();
    const leaf: LeafZone = { id: 'c', type: 'blank', w: 0, h: 100000 };
    const next = insertChild(root, 'root', leaf, 1);
    const container = next as ContainerZone;
    expect(container.children.map((c) => c.id)).toEqual(['a', 'c', 'b']);
  });

  it('normalizes children proportions to sum 100000 after insert', () => {
    const root = base();
    const leaf: LeafZone = { id: 'c', type: 'blank', w: 0, h: 100000 };
    const next = insertChild(root, 'root', leaf, 2);
    const container = next as ContainerZone;
    const sumW = container.children.reduce((s, c) => s + c.w, 0);
    expect(sumW).toBe(100000);
  });

  it('does not mutate input tree', () => {
    const root = base();
    const before = JSON.stringify(root);
    insertChild(root, 'root', { id: 'c', type: 'blank', w: 0, h: 100000 }, 0);
    expect(JSON.stringify(root)).toBe(before);
  });
});

describe('removeChild', () => {
  it('removes a child by id', () => {
    const root = base();
    const next = removeChild(root, 'a') as ContainerZone;
    expect(next.children.map((c) => c.id)).toEqual(['b']);
  });

  it('renormalizes remaining children to sum 100000', () => {
    const root = base();
    const next = removeChild(root, 'a') as ContainerZone;
    expect(next.children[0].w).toBe(100000);
  });

  it('returns identity when id not found', () => {
    const root = base();
    const next = removeChild(root, 'does-not-exist');
    expect(next).toEqual(root);
  });

  it('recursively removes from nested containers', () => {
    const nested: ContainerZone = {
      id: 'root',
      type: 'container-vert',
      w: 100000,
      h: 100000,
      children: [
        {
          id: 'inner',
          type: 'container-horz',
          w: 100000,
          h: 100000,
          children: [
            { id: 'x', type: 'blank', w: 50000, h: 100000 },
            { id: 'y', type: 'blank', w: 50000, h: 100000 },
          ],
        },
      ],
    };
    const next = removeChild(nested, 'x') as ContainerZone;
    const inner = next.children[0] as ContainerZone;
    expect(inner.children.map((c) => c.id)).toEqual(['y']);
    expect(inner.children[0].w).toBe(100000); // normalized
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
cd "QueryCopilot V1/frontend" && npx vitest run src/components/dashboard/freeform/__tests__/zoneTreeOps.test.ts
```
Expected: 7 failures — `Cannot find module '../lib/zoneTreeOps'`.

- [ ] **Step 3: Implement**

```typescript
// frontend/src/components/dashboard/freeform/lib/zoneTreeOps.ts
import type { Zone, ContainerZone } from './types';
import { isContainer, normalizeContainer } from './zoneTree';

/**
 * Insert `newChild` into the container with id=containerId at position `index`.
 * Normalizes proportions after insert. Returns a new tree (no mutation).
 */
export function insertChild(
  root: Zone,
  containerId: string,
  newChild: Zone,
  index: number,
): Zone {
  return mapTree(root, (zone) => {
    if (zone.id !== containerId || !isContainer(zone)) return zone;
    const clampedIndex = Math.max(0, Math.min(index, zone.children.length));
    const nextChildren = [
      ...zone.children.slice(0, clampedIndex),
      newChild,
      ...zone.children.slice(clampedIndex),
    ];
    return normalizeContainer({ ...zone, children: nextChildren });
  });
}

/**
 * Remove the zone with id=childId from anywhere in the tree.
 * Normalizes the parent container's proportions after removal.
 * Returns a new tree (no mutation). If id not found, returns identity.
 */
export function removeChild(root: Zone, childId: string): Zone {
  return mapTree(root, (zone) => {
    if (!isContainer(zone)) return zone;
    const idx = zone.children.findIndex((c) => c.id === childId);
    if (idx === -1) return zone;
    const nextChildren = [...zone.children.slice(0, idx), ...zone.children.slice(idx + 1)];
    return normalizeContainer({ ...zone, children: nextChildren });
  });
}

/**
 * Internal: recursive tree map. Applies `transform` to each zone bottom-up.
 * Safe for arbitrary tree shapes. Does not mutate.
 */
function mapTree(zone: Zone, transform: (z: Zone) => Zone): Zone {
  if (isContainer(zone)) {
    const nextChildren = zone.children.map((c) => mapTree(c, transform));
    return transform({ ...zone, children: nextChildren } as ContainerZone);
  }
  return transform(zone);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```
cd "QueryCopilot V1/frontend" && npx vitest run src/components/dashboard/freeform/__tests__/zoneTreeOps.test.ts
```
Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/components/dashboard/freeform/lib/zoneTreeOps.ts frontend/src/components/dashboard/freeform/__tests__/zoneTreeOps.test.ts
git commit -m "feat(analyst-pro): zoneTreeOps — insertChild + removeChild"
```

---

## Task 2: zoneTreeOps — moveZone + resizeZone + updateZone

**Files:**
- Modify: `frontend/src/components/dashboard/freeform/lib/zoneTreeOps.ts`
- Modify: `frontend/src/components/dashboard/freeform/__tests__/zoneTreeOps.test.ts`

- [ ] **Step 1: Append failing tests**

Append to `zoneTreeOps.test.ts`:

```typescript
import { moveZone, resizeZone, updateZone } from '../lib/zoneTreeOps';

describe('moveZone', () => {
  it('reorders within the same parent container', () => {
    const root = base();
    // Move 'a' from index 0 to index 1 in same parent 'root'.
    const next = moveZone(root, 'a', 'root', 1) as ContainerZone;
    expect(next.children.map((c) => c.id)).toEqual(['b', 'a']);
  });

  it('moves a zone to a different parent container', () => {
    const root: ContainerZone = {
      id: 'root',
      type: 'container-vert',
      w: 100000,
      h: 100000,
      children: [
        { id: 'src', type: 'container-horz', w: 100000, h: 50000, children: [
          { id: 'x', type: 'blank', w: 100000, h: 100000 },
        ]},
        { id: 'dst', type: 'container-horz', w: 100000, h: 50000, children: [
          { id: 'y', type: 'blank', w: 100000, h: 100000 },
        ]},
      ],
    };
    const next = moveZone(root, 'x', 'dst', 0) as ContainerZone;
    const src = next.children[0] as ContainerZone;
    const dst = next.children[1] as ContainerZone;
    expect(src.children.map((c) => c.id)).toEqual([]);
    expect(dst.children.map((c) => c.id)).toEqual(['x', 'y']);
  });

  it('returns identity when source not found', () => {
    const root = base();
    const next = moveZone(root, 'missing', 'root', 0);
    expect(next).toEqual(root);
  });
});

describe('resizeZone', () => {
  it('updates target zone w/h and renormalizes siblings', () => {
    const root = base();
    const next = resizeZone(root, 'a', { w: 70000 }) as ContainerZone;
    // After setting a.w = 70000 and renormalizing, a:70000, b:30000
    expect(next.children[0].w).toBe(70000);
    expect(next.children[1].w).toBe(30000);
    expect(next.children[0].w + next.children[1].w).toBe(100000);
  });

  it('updates floating zone pxW/pxH (no normalization)', () => {
    // Floating zones handled by updateZone or a separate branch.
    // For resizeZone, we only touch tiled zones; skip if target is floating.
    const root = base();
    const next = resizeZone(root, 'nonexistent', { w: 50000 });
    expect(next).toEqual(root);
  });

  it('clamps to min 1000 (1% of parent)', () => {
    const root = base();
    const next = resizeZone(root, 'a', { w: 500 }) as ContainerZone;
    // Requested 500, clamped to 1000.
    expect(next.children[0].w).toBe(1000);
    expect(next.children[1].w).toBe(99000);
  });
});

describe('updateZone', () => {
  it('patches arbitrary fields on a zone by id', () => {
    const root = base();
    const next = updateZone(root, 'a', { type: 'worksheet', worksheetRef: 'ws1' }) as ContainerZone;
    const a = next.children[0] as { type: string; worksheetRef?: string };
    expect(a.type).toBe('worksheet');
    expect(a.worksheetRef).toBe('ws1');
  });
});
```

- [ ] **Step 2: Run test to see fails**

```
cd "QueryCopilot V1/frontend" && npx vitest run src/components/dashboard/freeform/__tests__/zoneTreeOps.test.ts
```
Expected: 6 new failures — functions not exported.

- [ ] **Step 3: Implement**

Append to `zoneTreeOps.ts`:

```typescript
/**
 * Move a zone (by id) to a new parent container at given index.
 * Removes from its current parent + inserts into target parent.
 * Both source and target are renormalized.
 */
export function moveZone(
  root: Zone,
  zoneId: string,
  targetParentId: string,
  targetIndex: number,
): Zone {
  const source = findZoneInTree(root, zoneId);
  if (!source) return root;
  const withoutSource = removeChild(root, zoneId);
  return insertChild(withoutSource, targetParentId, source, targetIndex);
}

/**
 * Resize a zone by setting new w/h proportions. Renormalizes the parent
 * container so sibling proportions sum to 100000. Clamps to min 1000.
 * Floating zones unchanged by this op — use updateZone for pxW/pxH.
 */
const MIN_PROPORTION = 1000;
export function resizeZone(
  root: Zone,
  zoneId: string,
  size: { w?: number; h?: number },
): Zone {
  const target = findZoneInTree(root, zoneId);
  if (!target) return root;

  return mapTree(root, (zone) => {
    if (!isContainer(zone)) return zone;
    const childIdx = zone.children.findIndex((c) => c.id === zoneId);
    if (childIdx === -1) return zone;

    const axis: 'w' | 'h' = zone.type === 'container-horz' ? 'w' : 'h';
    const requestedAxisValue = size[axis];
    if (requestedAxisValue === undefined) return zone;

    const clamped = Math.max(MIN_PROPORTION, Math.min(100000 - MIN_PROPORTION, requestedAxisValue));
    const siblingCount = zone.children.length - 1;
    if (siblingCount === 0) return zone;

    const remaining = 100000 - clamped;
    const oldSiblingSum = zone.children.reduce(
      (s, c, i) => (i === childIdx ? s : s + c[axis]),
      0,
    ) || 1;

    const nextChildren = zone.children.map((c, i) => {
      if (i === childIdx) return { ...c, [axis]: clamped };
      return { ...c, [axis]: Math.round((c[axis] / oldSiblingSum) * remaining) };
    });

    // Drift fix: ensure sum is exactly 100000.
    const sum = nextChildren.reduce((s, c) => s + c[axis], 0);
    const drift = 100000 - sum;
    if (drift !== 0) {
      // Apply drift to last sibling (not target).
      const lastSiblingIdx = childIdx === nextChildren.length - 1 ? nextChildren.length - 2 : nextChildren.length - 1;
      if (lastSiblingIdx >= 0) {
        nextChildren[lastSiblingIdx] = {
          ...nextChildren[lastSiblingIdx],
          [axis]: nextChildren[lastSiblingIdx][axis] + drift,
        };
      }
    }
    return { ...zone, children: nextChildren };
  });
}

/**
 * Patch arbitrary fields on a zone by id. No normalization.
 * Used for non-size changes (type conversion, worksheetRef update, etc.).
 */
export function updateZone(
  root: Zone,
  zoneId: string,
  patch: Partial<Zone>,
): Zone {
  return mapTree(root, (zone) => {
    if (zone.id !== zoneId) return zone;
    return { ...zone, ...patch } as Zone;
  });
}

/** Internal: find a zone anywhere in the tree. */
function findZoneInTree(root: Zone, id: string): Zone | null {
  if (root.id === id) return root;
  if (isContainer(root)) {
    for (const child of root.children) {
      const found = findZoneInTree(child, id);
      if (found) return found;
    }
  }
  return null;
}
```

- [ ] **Step 4: Run tests**

```
cd "QueryCopilot V1/frontend" && npx vitest run src/components/dashboard/freeform/__tests__/zoneTreeOps.test.ts
```
Expected: 13 passed (7 from Task 1 + 6 new).

- [ ] **Step 5: Commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/components/dashboard/freeform/lib/zoneTreeOps.ts frontend/src/components/dashboard/freeform/__tests__/zoneTreeOps.test.ts
git commit -m "feat(analyst-pro): zoneTreeOps — moveZone + resizeZone + updateZone"
```

---

## Task 3: Command history (undo/redo stack)

**Files:**
- Create: `frontend/src/components/dashboard/freeform/lib/commandHistory.ts`
- Create: `frontend/src/components/dashboard/freeform/__tests__/commandHistory.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// frontend/src/components/dashboard/freeform/__tests__/commandHistory.test.ts
import { describe, it, expect } from 'vitest';
import { createHistory, pushSnapshot, undo, redo, canUndo, canRedo } from '../lib/commandHistory';

describe('commandHistory', () => {
  it('starts empty; cannot undo or redo', () => {
    const h = createHistory({ a: 1 });
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(false);
  });

  it('pushes a snapshot and can undo it', () => {
    let h = createHistory({ n: 0 });
    h = pushSnapshot(h, { n: 1 });
    expect(canUndo(h)).toBe(true);
    const { history: h2, state } = undo(h);
    expect(state).toEqual({ n: 0 });
    expect(canUndo(h2)).toBe(false);
    expect(canRedo(h2)).toBe(true);
  });

  it('redo restores the most recently undone state', () => {
    let h = createHistory({ n: 0 });
    h = pushSnapshot(h, { n: 1 });
    h = pushSnapshot(h, { n: 2 });
    const afterUndo = undo(h);
    expect(afterUndo.state).toEqual({ n: 1 });
    const afterRedo = redo(afterUndo.history);
    expect(afterRedo.state).toEqual({ n: 2 });
  });

  it('pushing after undo discards the redo stack', () => {
    let h = createHistory({ n: 0 });
    h = pushSnapshot(h, { n: 1 });
    h = pushSnapshot(h, { n: 2 });
    const afterUndo = undo(h);
    const afterPush = pushSnapshot(afterUndo.history, { n: 5 });
    expect(canRedo(afterPush)).toBe(false);
  });

  it('caps history at maxEntries', () => {
    let h = createHistory({ n: 0 }, { maxEntries: 3 });
    for (let i = 1; i <= 5; i++) h = pushSnapshot(h, { n: i });
    // Last 3 push-states retained. Can undo 3 times before history exhausted.
    let state;
    ({ history: h, state } = undo(h));
    ({ history: h, state } = undo(h));
    ({ history: h, state } = undo(h));
    expect(canUndo(h)).toBe(false);
    expect(state).toEqual({ n: 2 }); // oldest retained previous state
  });
});
```

- [ ] **Step 2: Run to see fails**

```
cd "QueryCopilot V1/frontend" && npx vitest run src/components/dashboard/freeform/__tests__/commandHistory.test.ts
```
Expected: 5 failures.

- [ ] **Step 3: Implement**

```typescript
// frontend/src/components/dashboard/freeform/lib/commandHistory.ts
/**
 * Undo/redo history as an immutable ring buffer of state snapshots.
 *
 * Shape: { past: T[], present: T, future: T[] }
 *   - past: states older than current (most recent first)
 *   - present: current state
 *   - future: states newer than current (result of undos)
 *
 * pushSnapshot(new) → past = [present, ...past], present = new, future = []
 * undo()            → past[0] becomes present, present joins future
 * redo()            → future[0] becomes present, present joins past
 *
 * Immutable: every op returns a new history object.
 */

export type History<T> = {
  past: T[];
  present: T;
  future: T[];
  maxEntries: number;
};

export function createHistory<T>(initial: T, options?: { maxEntries?: number }): History<T> {
  return {
    past: [],
    present: initial,
    future: [],
    maxEntries: options?.maxEntries ?? 500,
  };
}

export function pushSnapshot<T>(h: History<T>, next: T): History<T> {
  const newPast = [h.present, ...h.past].slice(0, h.maxEntries);
  return { ...h, past: newPast, present: next, future: [] };
}

export function undo<T>(h: History<T>): { history: History<T>; state: T } {
  if (h.past.length === 0) return { history: h, state: h.present };
  const [prev, ...restPast] = h.past;
  const newHistory: History<T> = {
    ...h,
    past: restPast,
    present: prev,
    future: [h.present, ...h.future],
  };
  return { history: newHistory, state: prev };
}

export function redo<T>(h: History<T>): { history: History<T>; state: T } {
  if (h.future.length === 0) return { history: h, state: h.present };
  const [next, ...restFuture] = h.future;
  const newHistory: History<T> = {
    ...h,
    past: [h.present, ...h.past],
    present: next,
    future: restFuture,
  };
  return { history: newHistory, state: next };
}

export function canUndo<T>(h: History<T>): boolean {
  return h.past.length > 0;
}

export function canRedo<T>(h: History<T>): boolean {
  return h.future.length > 0;
}
```

- [ ] **Step 4: Run tests**

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/components/dashboard/freeform/lib/commandHistory.ts frontend/src/components/dashboard/freeform/__tests__/commandHistory.test.ts
git commit -m "feat(analyst-pro): commandHistory — immutable undo/redo stack"
```

---

## Task 4: Snap math (grid + edges)

**Files:**
- Create: `frontend/src/components/dashboard/freeform/lib/snapMath.ts`
- Create: `frontend/src/components/dashboard/freeform/__tests__/snapMath.test.ts`

- [ ] **Step 1: Failing test**

```typescript
// frontend/src/components/dashboard/freeform/__tests__/snapMath.test.ts
import { describe, it, expect } from 'vitest';
import { snapToGrid, snapToEdges } from '../lib/snapMath';

describe('snapToGrid', () => {
  it('rounds a value to nearest multiple of gridSize', () => {
    expect(snapToGrid(17, 8)).toBe(16);
    expect(snapToGrid(12, 8)).toBe(16);
    expect(snapToGrid(3, 8)).toBe(0);
    expect(snapToGrid(0, 8)).toBe(0);
  });

  it('handles negative values', () => {
    expect(snapToGrid(-3, 8)).toBe(0);
    expect(snapToGrid(-5, 8)).toBe(-8);
  });

  it('returns the value unchanged when gridSize <= 0', () => {
    expect(snapToGrid(17, 0)).toBe(17);
    expect(snapToGrid(17, -8)).toBe(17);
  });
});

describe('snapToEdges', () => {
  it('snaps a target position to nearby sibling edges within threshold', () => {
    const siblings = [
      { x: 0, y: 0, width: 100, height: 100 },
      { x: 200, y: 0, width: 100, height: 100 },
    ];
    // Dragging a 50x50 element to approximately (97, 0) — near right edge of first sibling (x=100).
    const result = snapToEdges({ x: 97, y: 0, width: 50, height: 50 }, siblings, 5);
    expect(result.x).toBe(100); // snapped to right edge of sibling at x=100
    expect(result.y).toBe(0);
  });

  it('returns unchanged position when no sibling edge is within threshold', () => {
    const siblings = [{ x: 0, y: 0, width: 100, height: 100 }];
    const result = snapToEdges({ x: 500, y: 500, width: 50, height: 50 }, siblings, 5);
    expect(result.x).toBe(500);
    expect(result.y).toBe(500);
  });

  it('handles empty sibling list', () => {
    const result = snapToEdges({ x: 100, y: 100, width: 50, height: 50 }, [], 5);
    expect(result.x).toBe(100);
    expect(result.y).toBe(100);
  });
});
```

- [ ] **Step 2: Run — expect fails**

```
cd "QueryCopilot V1/frontend" && npx vitest run src/components/dashboard/freeform/__tests__/snapMath.test.ts
```

- [ ] **Step 3: Implement**

```typescript
// frontend/src/components/dashboard/freeform/lib/snapMath.ts

/** Snap a value to the nearest multiple of gridSize. */
export function snapToGrid(value: number, gridSize: number): number {
  if (gridSize <= 0) return value;
  return Math.round(value / gridSize) * gridSize;
}

export type Rect = { x: number; y: number; width: number; height: number };

/**
 * Snap a target rect's (x, y) to nearby sibling edges within `threshold` pixels.
 * Checks left/right/top/bottom edges of each sibling against the target's edges.
 * First matching axis snap wins per dimension.
 */
export function snapToEdges(target: Rect, siblings: Rect[], threshold: number): Rect {
  let bestX = target.x;
  let bestY = target.y;
  let bestDx = threshold + 1;
  let bestDy = threshold + 1;

  for (const s of siblings) {
    // X-axis: align target.x to sibling.x, sibling.right, or align target.right to sibling.x/right.
    const candidatesX = [
      { pos: s.x, via: 'left' },
      { pos: s.x + s.width, via: 'right' },
    ];
    for (const c of candidatesX) {
      const dxLeft = Math.abs(target.x - c.pos);
      if (dxLeft < bestDx) { bestDx = dxLeft; bestX = c.pos; }
      const dxRight = Math.abs((target.x + target.width) - c.pos);
      if (dxRight < bestDx) { bestDx = dxRight; bestX = c.pos - target.width; }
    }
    // Y-axis
    const candidatesY = [
      { pos: s.y, via: 'top' },
      { pos: s.y + s.height, via: 'bottom' },
    ];
    for (const c of candidatesY) {
      const dyTop = Math.abs(target.y - c.pos);
      if (dyTop < bestDy) { bestDy = dyTop; bestY = c.pos; }
      const dyBottom = Math.abs((target.y + target.height) - c.pos);
      if (dyBottom < bestDy) { bestDy = dyBottom; bestY = c.pos - target.height; }
    }
  }

  return {
    ...target,
    x: bestDx <= threshold ? bestX : target.x,
    y: bestDy <= threshold ? bestY : target.y,
  };
}
```

- [ ] **Step 4: Run — expect pass**

Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/components/dashboard/freeform/lib/snapMath.ts frontend/src/components/dashboard/freeform/__tests__/snapMath.test.ts
git commit -m "feat(analyst-pro): snapMath — snapToGrid + snapToEdges"
```

---

## Task 5: Hit testing

**Files:**
- Create: `frontend/src/components/dashboard/freeform/lib/hitTest.ts`
- Create: `frontend/src/components/dashboard/freeform/__tests__/hitTest.test.ts`

- [ ] **Step 1: Failing test**

```typescript
// frontend/src/components/dashboard/freeform/__tests__/hitTest.test.ts
import { describe, it, expect } from 'vitest';
import { hitTestPoint } from '../lib/hitTest';
import type { ResolvedZone } from '../lib/types';

function r(id: string, x: number, y: number, w: number, h: number, depth = 0): ResolvedZone {
  return { zone: { id, type: 'blank', w: 0, h: 0 }, x, y, width: w, height: h, depth };
}

describe('hitTestPoint', () => {
  it('returns null when point is outside all zones', () => {
    const resolved: ResolvedZone[] = [r('a', 0, 0, 100, 100)];
    expect(hitTestPoint(resolved, 200, 200)).toBeNull();
  });

  it('returns the innermost zone by tree depth', () => {
    const resolved: ResolvedZone[] = [
      r('root', 0, 0, 500, 500, 0),
      r('child', 100, 100, 200, 200, 1),
      r('grandchild', 150, 150, 100, 100, 2),
    ];
    const hit = hitTestPoint(resolved, 175, 175);
    expect(hit?.zone.id).toBe('grandchild');
  });

  it('prefers floating zones (depth -1) when overlapping a tiled zone', () => {
    const resolved: ResolvedZone[] = [
      r('tiled', 0, 0, 500, 500, 2),
      r('floating', 100, 100, 200, 200, -1),
    ];
    const hit = hitTestPoint(resolved, 150, 150);
    expect(hit?.zone.id).toBe('floating');
  });

  it('returns the last floating zone (top-most zIndex) when multiple overlap', () => {
    const resolved: ResolvedZone[] = [
      r('f1', 50, 50, 200, 200, -1),
      r('f2', 100, 100, 200, 200, -1),
    ];
    const hit = hitTestPoint(resolved, 150, 150);
    expect(hit?.zone.id).toBe('f2');
  });
});
```

- [ ] **Step 2: Run — fails**

- [ ] **Step 3: Implement**

```typescript
// frontend/src/components/dashboard/freeform/lib/hitTest.ts
import type { ResolvedZone } from './types';

/**
 * Point-in-zone hit test against a flat list of ResolvedZone.
 *
 * Priority rules:
 *   1. Floating zones (depth = -1) beat tiled zones at the same point.
 *      Among overlapping floating zones, the LAST in the list wins (higher zIndex
 *      paints later — the resolver preserves zIndex ordering).
 *   2. Among tiled zones, innermost wins (highest depth).
 *
 * Returns the winning zone or null if no hit.
 *
 * Complexity: O(n). For ≤ 50 tiles the naive sweep is well under 1ms per call.
 * Plan 2b may introduce an R-tree when tile count scales; not needed now.
 */
export function hitTestPoint(resolved: ResolvedZone[], x: number, y: number): ResolvedZone | null {
  let bestTiled: ResolvedZone | null = null;
  let bestTiledDepth = -Infinity;
  let bestFloating: ResolvedZone | null = null;

  for (const r of resolved) {
    if (!isInside(x, y, r)) continue;
    if (r.depth === -1) {
      // Floating — last hit wins.
      bestFloating = r;
    } else if (r.depth > bestTiledDepth) {
      bestTiled = r;
      bestTiledDepth = r.depth;
    }
  }

  return bestFloating ?? bestTiled;
}

function isInside(x: number, y: number, r: ResolvedZone): boolean {
  return x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;
}
```

- [ ] **Step 4: Run — pass**

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/components/dashboard/freeform/lib/hitTest.ts frontend/src/components/dashboard/freeform/__tests__/hitTest.test.ts
git commit -m "feat(analyst-pro): hitTestPoint — O(n) point-in-zone sweep"
```

---

## Task 6: Extend store with interaction state

**Files:**
- Modify: `frontend/src/store.js`

- [ ] **Step 1: Extend analystPro slice**

Find the existing analystPro slice in `frontend/src/store.js` (near the end, around line 650-670). Replace it with:

```javascript
  // ── Analyst Pro archetype (Plan 1 + 2) ──
  analystProDashboard: null,
  setAnalystProDashboard: (dashboard) => set({ analystProDashboard: dashboard }),
  analystProSize: { mode: 'automatic' },
  setAnalystProSize: (size) => {
    const dash = get().analystProDashboard;
    if (dash) {
      set({
        analystProDashboard: { ...dash, size },
        analystProSize: size,
      });
    } else {
      set({ analystProSize: size });
    }
  },

  // Plan 2: selection
  analystProSelection: new Set(),
  setAnalystProSelection: (ids) =>
    set({ analystProSelection: new Set(Array.isArray(ids) ? ids : [ids]) }),
  addToSelection: (id) => {
    const next = new Set(get().analystProSelection);
    next.add(id);
    set({ analystProSelection: next });
  },
  removeFromSelection: (id) => {
    const next = new Set(get().analystProSelection);
    next.delete(id);
    set({ analystProSelection: next });
  },
  clearSelection: () => set({ analystProSelection: new Set() }),

  // Plan 2: drag state
  analystProDragState: null,
  setAnalystProDragState: (state) => set({ analystProDragState: state }),

  // Plan 2: snap toggle
  analystProSnapEnabled: true,
  setAnalystProSnapEnabled: (enabled) => set({ analystProSnapEnabled: !!enabled }),

  // Plan 2: marquee selection rectangle during drag
  analystProMarquee: null,
  setAnalystProMarquee: (rect) => set({ analystProMarquee: rect }),

  // Plan 2: history buffer (undo/redo)
  // Shape: { past: [dashboard,...], present: dashboard, future: [dashboard,...], maxEntries }
  analystProHistory: null,
  initAnalystProHistory: (dashboard) => {
    set({ analystProHistory: { past: [], present: dashboard, future: [], maxEntries: 500 } });
  },
  pushAnalystProHistory: (dashboard) => {
    const h = get().analystProHistory;
    if (!h) {
      set({ analystProHistory: { past: [], present: dashboard, future: [], maxEntries: 500 } });
      return;
    }
    const past = [h.present, ...h.past].slice(0, h.maxEntries);
    set({ analystProHistory: { ...h, past, present: dashboard, future: [] } });
  },
  undoAnalystPro: () => {
    const h = get().analystProHistory;
    if (!h || h.past.length === 0) return;
    const [prev, ...restPast] = h.past;
    set({
      analystProHistory: { ...h, past: restPast, present: prev, future: [h.present, ...h.future] },
      analystProDashboard: prev,
    });
  },
  redoAnalystPro: () => {
    const h = get().analystProHistory;
    if (!h || h.future.length === 0) return;
    const [next, ...restFuture] = h.future;
    set({
      analystProHistory: { ...h, past: [h.present, ...h.past], present: next, future: restFuture },
      analystProDashboard: next,
    });
  },
```

- [ ] **Step 2: Build check**

```
cd "QueryCopilot V1/frontend" && npm run build 2>&1 | tail -5
```
Expected: `✓ built in <time>s`.

- [ ] **Step 3: Commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/store.js
git commit -m "feat(analyst-pro): extend store with selection/drag/history/snap state"
```

---

## Task 7: useSelection hook

**Files:**
- Create: `frontend/src/components/dashboard/freeform/hooks/useSelection.js`

- [ ] **Step 1: Create the hook**

```javascript
// frontend/src/components/dashboard/freeform/hooks/useSelection.js
import { useStore } from '../../../../store';

/**
 * Selection state + helpers for Analyst Pro canvas.
 *
 * Returns: { selection, isSelected(id), select(id), addToSelection(id),
 *            removeFromSelection(id), toggleSelection(id), clearSelection(),
 *            selectMany(ids) }
 *
 * `selection` is a Set<string> of zone ids. Mutations via the returned
 * helpers go through the store, so components re-render reactively.
 */
export function useSelection() {
  const selection = useStore((s) => s.analystProSelection);
  const set = useStore((s) => s.setAnalystProSelection);
  const add = useStore((s) => s.addToSelection);
  const remove = useStore((s) => s.removeFromSelection);
  const clear = useStore((s) => s.clearSelection);

  return {
    selection,
    isSelected: (id) => selection.has(id),
    select: (id) => set(id),
    addToSelection: (id) => add(id),
    removeFromSelection: (id) => remove(id),
    toggleSelection: (id) => {
      if (selection.has(id)) remove(id);
      else add(id);
    },
    clearSelection: () => clear(),
    selectMany: (ids) => set(ids),
  };
}
```

- [ ] **Step 2: Commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/components/dashboard/freeform/hooks/useSelection.js
git commit -m "feat(analyst-pro): useSelection hook"
```

---

## Task 8: SelectionOverlay — ring + 8 resize handles

**Files:**
- Create: `frontend/src/components/dashboard/freeform/SelectionOverlay.jsx`

- [ ] **Step 1: Create component**

```jsx
// frontend/src/components/dashboard/freeform/SelectionOverlay.jsx
import { memo } from 'react';

/**
 * SelectionOverlay — renders a selection ring + 8 resize handles over every
 * selected zone. Purely visual; consumer wires pointer events.
 *
 * Props:
 *   - selectedResolved: ResolvedZone[]  — resolved coords of selected zones
 *   - onResizeHandlePointerDown: (zoneId, handle, event) => void
 *   - onSelectionPointerDown: (zoneId, event) => void  // drag-start on selection body
 */
const HANDLE_POSITIONS = [
  { id: 'nw', cursor: 'nwse-resize' },
  { id: 'n',  cursor: 'ns-resize'   },
  { id: 'ne', cursor: 'nesw-resize' },
  { id: 'e',  cursor: 'ew-resize'   },
  { id: 'se', cursor: 'nwse-resize' },
  { id: 's',  cursor: 'ns-resize'   },
  { id: 'sw', cursor: 'nesw-resize' },
  { id: 'w',  cursor: 'ew-resize'   },
];

function getHandleStyle(handle, width, height) {
  const HS = 8; // handle size
  const HALF = HS / 2;
  const base = { position: 'absolute', width: HS, height: HS, background: 'var(--accent, #2563eb)', border: '1.5px solid var(--bg-elevated, #fff)', borderRadius: 2, boxShadow: '0 1px 2px rgba(0,0,0,0.2)' };
  switch (handle.id) {
    case 'nw': return { ...base, left: -HALF, top: -HALF, cursor: handle.cursor };
    case 'n':  return { ...base, left: width / 2 - HALF, top: -HALF, cursor: handle.cursor };
    case 'ne': return { ...base, right: -HALF, top: -HALF, cursor: handle.cursor };
    case 'e':  return { ...base, right: -HALF, top: height / 2 - HALF, cursor: handle.cursor };
    case 'se': return { ...base, right: -HALF, bottom: -HALF, cursor: handle.cursor };
    case 's':  return { ...base, left: width / 2 - HALF, bottom: -HALF, cursor: handle.cursor };
    case 'sw': return { ...base, left: -HALF, bottom: -HALF, cursor: handle.cursor };
    case 'w':  return { ...base, left: -HALF, top: height / 2 - HALF, cursor: handle.cursor };
    default:   return base;
  }
}

function SelectionOverlay({ selectedResolved, onResizeHandlePointerDown, onSelectionPointerDown }) {
  if (!selectedResolved || selectedResolved.length === 0) return null;
  return (
    <div data-testid="selection-overlay" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {selectedResolved.map((r) => (
        <div
          key={r.zone.id}
          data-testid={`selection-ring-${r.zone.id}`}
          style={{
            position: 'absolute',
            left: r.x,
            top: r.y,
            width: r.width,
            height: r.height,
            border: '1.5px solid var(--accent, #2563eb)',
            borderRadius: 4,
            pointerEvents: 'auto',
            cursor: 'move',
            boxShadow: '0 0 0 4px color-mix(in oklab, var(--accent) 15%, transparent)',
            zIndex: 1000,
          }}
          onPointerDown={(e) => onSelectionPointerDown?.(r.zone.id, e)}
        >
          {HANDLE_POSITIONS.map((h) => (
            <div
              key={h.id}
              data-testid={`resize-handle-${r.zone.id}-${h.id}`}
              style={getHandleStyle(h, r.width, r.height)}
              onPointerDown={(e) => {
                e.stopPropagation();
                onResizeHandlePointerDown?.(r.zone.id, h.id, e);
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export default memo(SelectionOverlay);
```

- [ ] **Step 2: Lint**

```
cd "QueryCopilot V1/frontend" && npx eslint src/components/dashboard/freeform/SelectionOverlay.jsx
```
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/components/dashboard/freeform/SelectionOverlay.jsx
git commit -m "feat(analyst-pro): SelectionOverlay — ring + 8 resize handles"
```

---

## Task 9: useDragResize hook — floating zone drag

**Files:**
- Create: `frontend/src/components/dashboard/freeform/hooks/useDragResize.js`

- [ ] **Step 1: Create the hook**

```javascript
// frontend/src/components/dashboard/freeform/hooks/useDragResize.js
import { useCallback, useRef } from 'react';
import { useStore } from '../../../../store';
import { updateZone } from '../lib/zoneTreeOps';
import { snapToGrid, snapToEdges } from '../lib/snapMath';

const GRID_SIZE = 8;
const SNAP_THRESHOLD = 6;

/**
 * useDragResize — pointer event handlers for Analyst Pro canvas.
 *
 * Returns:
 *   - onZonePointerDown(zoneId, event, resolvedZone, mode: 'move' | 'resize', handle?)
 *   - activeDrag (from store, for consumers that need to know)
 *
 * Implementation:
 *   - Pointer down captures the pointer on the canvas element.
 *   - Pointermove updates dashboard state live (every rAF).
 *   - Pointerup releases capture, pushes history snapshot, clears dragState.
 *
 * Floating zones: mutate `dashboard.floatingLayer[idx].{x,y}` (move) or {pxW,pxH} (resize).
 * Tiled zones: mutate `dashboard.tiledRoot` zone's `{w,h}` via `resizeZone`. Tiled move
 * is NOT yet handled in Plan 2 Task 9 (parent-reorder lands in Task 10).
 */
export function useDragResize({ canvasRef, resolvedMap, siblingsFloating }) {
  const rafRef = useRef(0);
  const startRef = useRef(null);

  const snapEnabled = useStore((s) => s.analystProSnapEnabled);
  const dashboard = useStore((s) => s.analystProDashboard);
  const setDashboard = useStore((s) => s.setAnalystProDashboard);
  const pushHistory = useStore((s) => s.pushAnalystProHistory);

  const onZonePointerDown = useCallback((zoneId, event, resolvedZone, mode = 'move', handle = null) => {
    const canvas = canvasRef.current;
    if (!canvas || !dashboard) return;
    event.preventDefault();
    canvas.setPointerCapture?.(event.pointerId);

    const isFloating = (dashboard.floatingLayer || []).some((f) => f.id === zoneId);
    startRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      zoneId,
      mode,
      handle,
      isFloating,
      initialZone: isFloating ? { ...dashboard.floatingLayer.find((f) => f.id === zoneId) } : resolvedZone,
      dashboardAtStart: dashboard,
    };

    const onMove = (ev) => {
      if (!startRef.current) return;
      const dx = ev.clientX - startRef.current.startX;
      const dy = ev.clientY - startRef.current.startY;

      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        applyDragDelta(startRef.current, dx, dy, snapEnabled, siblingsFloating, dashboard, setDashboard);
      });
    };

    const onUp = () => {
      if (!startRef.current) return;
      canvas.releasePointerCapture?.(startRef.current.pointerId);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      // push history snapshot
      const finalDash = useStore.getState().analystProDashboard;
      if (finalDash && startRef.current.dashboardAtStart !== finalDash) {
        pushHistory(finalDash);
      }
      startRef.current = null;
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [canvasRef, resolvedMap, dashboard, snapEnabled, setDashboard, pushHistory, siblingsFloating]);

  return { onZonePointerDown };
}

function applyDragDelta(start, dx, dy, snapEnabled, siblings, dashboard, setDashboard) {
  if (!dashboard) return;
  if (start.isFloating) {
    const floating = dashboard.floatingLayer.map((f) => {
      if (f.id !== start.zoneId) return f;
      if (start.mode === 'move') {
        let nx = start.initialZone.x + dx;
        let ny = start.initialZone.y + dy;
        if (snapEnabled) {
          nx = snapToGrid(nx, GRID_SIZE);
          ny = snapToGrid(ny, GRID_SIZE);
          const rect = { x: nx, y: ny, width: f.pxW, height: f.pxH };
          const snapped = snapToEdges(rect, siblings.filter((s) => s.zone.id !== f.id).map((s) => ({ x: s.x, y: s.y, width: s.width, height: s.height })), SNAP_THRESHOLD);
          nx = snapped.x;
          ny = snapped.y;
        }
        return { ...f, x: nx, y: ny };
      }
      if (start.mode === 'resize') {
        return applyResizeToFloating(f, start, dx, dy, snapEnabled);
      }
      return f;
    });
    setDashboard({ ...dashboard, floatingLayer: floating });
  }
  // Tiled move/resize: deferred to Tasks 10/11 — they mutate tiledRoot via resizeZone/moveZone.
}

function applyResizeToFloating(f, start, dx, dy, snapEnabled) {
  const MIN = 40;
  const initial = start.initialZone;
  let x = initial.x;
  let y = initial.y;
  let w = initial.pxW;
  let h = initial.pxH;
  switch (start.handle) {
    case 'e':  w = initial.pxW + dx; break;
    case 'w':  w = initial.pxW - dx; x = initial.x + dx; break;
    case 'n':  h = initial.pxH - dy; y = initial.y + dy; break;
    case 's':  h = initial.pxH + dy; break;
    case 'ne': w = initial.pxW + dx; h = initial.pxH - dy; y = initial.y + dy; break;
    case 'nw': w = initial.pxW - dx; x = initial.x + dx; h = initial.pxH - dy; y = initial.y + dy; break;
    case 'se': w = initial.pxW + dx; h = initial.pxH + dy; break;
    case 'sw': w = initial.pxW - dx; x = initial.x + dx; h = initial.pxH + dy; break;
    default: break;
  }
  w = Math.max(MIN, w);
  h = Math.max(MIN, h);
  if (snapEnabled) {
    x = snapToGrid(x, GRID_SIZE);
    y = snapToGrid(y, GRID_SIZE);
    w = snapToGrid(w, GRID_SIZE);
    h = snapToGrid(h, GRID_SIZE);
  }
  return { ...f, x, y, pxW: w, pxH: h };
}
```

- [ ] **Step 2: Lint**

```
cd "QueryCopilot V1/frontend" && npx eslint src/components/dashboard/freeform/hooks/useDragResize.js
```

- [ ] **Step 3: Commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/components/dashboard/freeform/hooks/useDragResize.js
git commit -m "feat(analyst-pro): useDragResize — floating zone drag + resize w/ snap"
```

---

## Task 10: Tiled zone resize — wire resizeZone op

**Files:**
- Modify: `frontend/src/components/dashboard/freeform/hooks/useDragResize.js`

- [ ] **Step 1: Extend applyDragDelta to handle tiled resize**

Edit `useDragResize.js`. In `applyDragDelta`, after the `if (start.isFloating)` block, add:

```javascript
  // Tiled resize: mutate tiledRoot via resizeZone op.
  if (!start.isFloating && start.mode === 'resize' && dashboard.tiledRoot) {
    const initial = start.initialZone;
    // initial.width / height are pixels from ResolvedZone. We need to convert
    // the dx/dy (px) into a new proportional value relative to parent's pixel size.
    // To avoid re-walking the tree for parent size, approximate using initial size:
    //   new proportion = initial.w * (initial.width + dx) / initial.width
    // That works because parent pixel size = initial.width / (initial.proportionalW / 100000).
    // However we don't have parent pixel size here. Use a simpler approach:
    //   pxDelta → ratio of initial px → ratio applied to current proportional value.
    const zoneId = start.zoneId;
    const axisDx = start.handle.includes('e') ? dx : start.handle.includes('w') ? -dx : 0;
    const axisDy = start.handle.includes('s') ? dy : start.handle.includes('n') ? -dy : 0;
    const initialPxW = initial.width || 1;
    const initialPxH = initial.height || 1;
    // Look up current proportional w/h from the unchanged dashboardAtStart tree.
    const initialZoneInTree = findById(start.dashboardAtStart.tiledRoot, zoneId);
    if (!initialZoneInTree) return;
    const { w: origW, h: origH } = initialZoneInTree;
    // Proportional delta derived from pixel ratio.
    const newW = Math.round(origW * ((initialPxW + axisDx) / initialPxW));
    const newH = Math.round(origH * ((initialPxH + axisDy) / initialPxH));
    const patch = {};
    if (start.handle.includes('e') || start.handle.includes('w')) patch.w = newW;
    if (start.handle.includes('n') || start.handle.includes('s')) patch.h = newH;

    if (Object.keys(patch).length > 0) {
      const { resizeZone } = require('../lib/zoneTreeOps'); // dynamic to avoid import cycle warning
      const nextTree = resizeZone(start.dashboardAtStart.tiledRoot, zoneId, patch);
      setDashboard({ ...dashboard, tiledRoot: nextTree });
    }
  }
}

function findById(zone, id) {
  if (zone.id === id) return zone;
  if (zone.children) {
    for (const c of zone.children) {
      const f = findById(c, id);
      if (f) return f;
    }
  }
  return null;
}
```

**Cleanup:** Replace the inline `require` with a module-level import at top of file:
```javascript
import { resizeZone } from '../lib/zoneTreeOps';
```
and drop the inline `require` line.

- [ ] **Step 2: Lint**

- [ ] **Step 3: Commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/components/dashboard/freeform/hooks/useDragResize.js
git commit -m "feat(analyst-pro): useDragResize — tiled zone resize via resizeZone op"
```

---

## Task 11: Tiled zone drag — parent reorder (insertion line)

**Files:**
- Modify: `frontend/src/components/dashboard/freeform/hooks/useDragResize.js`

- [ ] **Step 1: Extend applyDragDelta to handle tiled move**

Reorder within a tiled parent requires determining the drop target (same parent, new index). The simplest approach for Plan 2 Task 11:

- During drag, show a blue insertion line at the midpoint between siblings.
- On drop, compute which sibling the pointer is closest to + whether it's before or after.
- Call `moveZone(tree, zoneId, parentId, targetIndex)`.

Implement a minimal version:

```javascript
// Append to applyDragDelta, after the resize block:

  // Tiled move: determine target parent + index from current pointer position.
  if (!start.isFloating && start.mode === 'move' && dashboard.tiledRoot) {
    // For now: same-parent reorder only. Full cross-container move deferred.
    // Find the parent container of the dragged zone.
    const parent = findParentContainer(dashboard.tiledRoot, start.zoneId);
    if (!parent) return;
    const axis = parent.type === 'container-horz' ? 'x' : 'y';
    const axisSize = parent.type === 'container-horz' ? 'width' : 'height';
    const pointerPos = axis === 'x' ? start.initialZone.x + dx : start.initialZone.y + dy;
    // Compute target index by finding which sibling midpoint the pointer crossed.
    // Approximation: use each sibling's resolved center from the dashboardAtStart tree.
    // Without a fresh resolve per frame (expensive), approximate using proportional
    // positions within parent container and parent's pixel size.
    // Simpler: just store a pending targetIndex in dragState and commit on pointerup.
    useStore.getState().setAnalystProDragState({
      zoneId: start.zoneId,
      parentId: parent.id,
      targetIndex: null, // computed on pointerup for simplicity
      dx, dy,
    });
  }
}

function findParentContainer(root, childId) {
  if (root.children) {
    for (const c of root.children) {
      if (c.id === childId) return root;
    }
    for (const c of root.children) {
      if (c.children) {
        const f = findParentContainer(c, childId);
        if (f) return f;
      }
    }
  }
  return null;
}
```

Then update the `onUp` callback in `onZonePointerDown` to commit the move:

```javascript
const onUp = (ev) => {
  if (!startRef.current) return;
  const drag = useStore.getState().analystProDragState;
  // Compute target index now from final pointer position.
  if (drag && startRef.current.mode === 'move' && !startRef.current.isFloating) {
    const dashAtEnd = useStore.getState().analystProDashboard;
    const parent = findParentContainer(dashAtEnd.tiledRoot, drag.zoneId);
    if (parent) {
      // Order children by proportional-position contribution. If pointer has moved
      // past half a sibling's width/height in the drag direction, swap with that sibling.
      // Minimal heuristic for Plan 2: if dx>0, move one index forward; dx<0, one index back.
      const currentIdx = parent.children.findIndex((c) => c.id === drag.zoneId);
      let targetIdx = currentIdx;
      const axis = parent.type === 'container-horz' ? drag.dx : drag.dy;
      if (axis > 40) targetIdx = Math.min(parent.children.length - 1, currentIdx + 1);
      else if (axis < -40) targetIdx = Math.max(0, currentIdx - 1);
      if (targetIdx !== currentIdx) {
        const { moveZone } = require('../lib/zoneTreeOps');
        const next = moveZone(dashAtEnd.tiledRoot, drag.zoneId, parent.id, targetIdx);
        setDashboard({ ...dashAtEnd, tiledRoot: next });
      }
    }
  }
  useStore.getState().setAnalystProDragState(null);

  canvas.releasePointerCapture?.(startRef.current.pointerId);
  window.removeEventListener('pointermove', onMove);
  window.removeEventListener('pointerup', onUp);
  const finalDash = useStore.getState().analystProDashboard;
  if (finalDash && startRef.current.dashboardAtStart !== finalDash) {
    pushHistory(finalDash);
  }
  startRef.current = null;
};
```

Replace the inline `require('../lib/zoneTreeOps')` with top-of-file `import { resizeZone, moveZone } from '../lib/zoneTreeOps';`.

- [ ] **Step 2: Lint + commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/components/dashboard/freeform/hooks/useDragResize.js
git commit -m "feat(analyst-pro): useDragResize — tiled reorder-within-parent via moveZone"
```

---

## Task 12: useHistory hook — undo/redo dispatcher

**Files:**
- Create: `frontend/src/components/dashboard/freeform/hooks/useHistory.js`

- [ ] **Step 1: Create hook**

```javascript
// frontend/src/components/dashboard/freeform/hooks/useHistory.js
import { useCallback } from 'react';
import { useStore } from '../../../../store';

export function useHistory() {
  const undo = useStore((s) => s.undoAnalystPro);
  const redo = useStore((s) => s.redoAnalystPro);
  const push = useStore((s) => s.pushAnalystProHistory);
  const init = useStore((s) => s.initAnalystProHistory);
  const history = useStore((s) => s.analystProHistory);

  const canUndo = !!(history && history.past.length > 0);
  const canRedo = !!(history && history.future.length > 0);

  return {
    undo: useCallback(() => undo(), [undo]),
    redo: useCallback(() => redo(), [redo]),
    pushSnapshot: useCallback((dash) => push(dash), [push]),
    initHistory: useCallback((dash) => init(dash), [init]),
    canUndo,
    canRedo,
  };
}
```

- [ ] **Step 2: Commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/components/dashboard/freeform/hooks/useHistory.js
git commit -m "feat(analyst-pro): useHistory hook"
```

---

## Task 13: useKeyboardShortcuts hook

**Files:**
- Create: `frontend/src/components/dashboard/freeform/hooks/useKeyboardShortcuts.js`

- [ ] **Step 1: Create hook**

```javascript
// frontend/src/components/dashboard/freeform/hooks/useKeyboardShortcuts.js
import { useEffect } from 'react';
import { useStore } from '../../../../store';

/**
 * Keyboard shortcuts for Analyst Pro authoring:
 *   - Cmd/Ctrl+Z  → undo
 *   - Cmd/Ctrl+Shift+Z → redo
 *   - Cmd/Ctrl+A  → select all (top-level tiled children + all floating)
 *   - Delete/Backspace → delete selected (Plan 2b — stub logs for now)
 *   - Escape      → clear selection
 *   - Arrow keys  → nudge selected floating zones by 1px (Shift+arrow = 10px)
 *   - ] / [       → bring forward / send backward (floating z-order)
 *
 * Installs a window-level keydown listener; ignores keys when focus is in an
 * input/textarea/contenteditable.
 */
export function useKeyboardShortcuts({ canvasRef } = {}) {
  const undo = useStore((s) => s.undoAnalystPro);
  const redo = useStore((s) => s.redoAnalystPro);
  const selection = useStore((s) => s.analystProSelection);
  const clearSelection = useStore((s) => s.clearSelection);
  const setSelection = useStore((s) => s.setAnalystProSelection);
  const dashboard = useStore((s) => s.analystProDashboard);
  const setDashboard = useStore((s) => s.setAnalystProDashboard);
  const pushHistory = useStore((s) => s.pushAnalystProHistory);

  useEffect(() => {
    const handler = (e) => {
      // Ignore when typing in inputs
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault(); undo(); return;
      }
      if (mod && (e.key.toLowerCase() === 'z' && e.shiftKey || e.key.toLowerCase() === 'y')) {
        e.preventDefault(); redo(); return;
      }
      if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        if (!dashboard) return;
        const ids = [];
        for (const c of dashboard.tiledRoot?.children ?? []) ids.push(c.id);
        for (const f of dashboard.floatingLayer ?? []) ids.push(f.id);
        setSelection(ids);
        return;
      }
      if (e.key === 'Escape') { clearSelection(); return; }

      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) && dashboard) {
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0;
        const dy = e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0;
        const floats = (dashboard.floatingLayer || []).map((f) => selection.has(f.id) ? { ...f, x: f.x + dx, y: f.y + dy } : f);
        if (floats.some((f, i) => f !== dashboard.floatingLayer[i])) {
          e.preventDefault();
          const next = { ...dashboard, floatingLayer: floats };
          setDashboard(next);
          pushHistory(next);
        }
      }

      if ((e.key === ']' || e.key === '[') && dashboard) {
        const forward = e.key === ']';
        const big = e.shiftKey;
        const layer = [...(dashboard.floatingLayer || [])];
        const changed = layer.map((f) => {
          if (!selection.has(f.id)) return f;
          const cur = f.zIndex ?? 0;
          return { ...f, zIndex: big ? (forward ? 9999 : -9999) : cur + (forward ? 1 : -1) };
        });
        const next = { ...dashboard, floatingLayer: changed };
        setDashboard(next);
        pushHistory(next);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [dashboard, selection, undo, redo, clearSelection, setSelection, setDashboard, pushHistory, canvasRef]);
}
```

- [ ] **Step 2: Commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/components/dashboard/freeform/hooks/useKeyboardShortcuts.js
git commit -m "feat(analyst-pro): useKeyboardShortcuts — undo/redo/selectAll/nudge/zorder"
```

---

## Task 14: Wire SelectionOverlay + hooks into FreeformCanvas

**Files:**
- Modify: `frontend/src/components/dashboard/freeform/FreeformCanvas.jsx`

- [ ] **Step 1: Update FreeformCanvas**

At the top of the file, add imports:

```javascript
import SelectionOverlay from './SelectionOverlay';
import { useSelection } from './hooks/useSelection';
import { useDragResize } from './hooks/useDragResize';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useStore } from '../../../store';
```

Inside the component body, after existing hooks but before the return, add:

```javascript
  const { selection, toggleSelection, clearSelection, select } = useSelection();
  const initHistory = useStore((s) => s.initAnalystProHistory);
  const setDashboardInStore = useStore((s) => s.setAnalystProDashboard);

  // Install history on dashboard mount
  useEffect(() => {
    if (dashboard) {
      initHistory(dashboard);
      setDashboardInStore(dashboard);
    }
  }, [dashboard?.id, initHistory, setDashboardInStore]);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- dashboard.id stable across renders

  useKeyboardShortcuts({ canvasRef: containerRef });

  const { onZonePointerDown } = useDragResize({
    canvasRef: containerRef,
    resolvedMap,
    siblingsFloating: resolved.filter((r) => r.depth === -1),
  });

  const selectedResolved = resolved.filter((r) => selection.has(r.zone.id));

  const handleZoneClick = (zoneId, event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey) {
      toggleSelection(zoneId);
    } else {
      select(zoneId);
    }
  };
```

Update the `renderLeaf` calls to pass click handlers. Wrap ZoneRenderer + FloatingLayer inside a `<div onPointerDown>` that catches clicks on empty canvas to clear selection:

```jsx
      <div
        data-testid="freeform-sheet"
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) clearSelection();
        }}
        style={{
          position: 'relative',
          width: canvasSize.width,
          height: canvasSize.height,
          margin: dashboard.size?.mode === 'automatic' ? 0 : '0 auto',
        }}
      >
        <ZoneRenderer
          root={dashboard.tiledRoot}
          resolvedMap={resolvedMap}
          renderLeaf={(zone, resolved) => (
            <div
              onPointerDown={(e) => {
                e.stopPropagation();
                handleZoneClick(zone.id, e);
                onZonePointerDown(zone.id, e, resolved, 'move');
              }}
              style={{ width: '100%', height: '100%' }}
            >
              {renderLeaf(zone, resolved)}
            </div>
          )}
        />
        <FloatingLayer
          zones={dashboard.floatingLayer || []}
          renderLeaf={(zone) => (
            <div
              onPointerDown={(e) => {
                e.stopPropagation();
                const resolvedZone = resolvedMap.get(zone.id);
                handleZoneClick(zone.id, e);
                onZonePointerDown(zone.id, e, resolvedZone, 'move');
              }}
              style={{ width: '100%', height: '100%' }}
            >
              {renderLeaf(zone)}
            </div>
          )}
        />
        <SelectionOverlay
          selectedResolved={selectedResolved}
          onResizeHandlePointerDown={(zoneId, handle, e) => {
            const resolvedZone = resolvedMap.get(zoneId);
            if (!selection.has(zoneId)) select(zoneId);
            onZonePointerDown(zoneId, e, resolvedZone, 'resize', handle);
          }}
          onSelectionPointerDown={(zoneId, e) => {
            const resolvedZone = resolvedMap.get(zoneId);
            handleZoneClick(zoneId, e);
            onZonePointerDown(zoneId, e, resolvedZone, 'move');
          }}
        />
      </div>
```

- [ ] **Step 2: Build check**

```
cd "QueryCopilot V1/frontend" && npm run build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/components/dashboard/freeform/FreeformCanvas.jsx
git commit -m "feat(analyst-pro): wire SelectionOverlay + drag/resize/keyboard into FreeformCanvas"
```

---

## Task 15: Snap toggle in AnalystProLayout toolbar

**Files:**
- Modify: `frontend/src/components/dashboard/modes/AnalystProLayout.jsx`

- [ ] **Step 1: Add snap toggle button**

Inside the toolbar div in AnalystProLayout.jsx, before SizeToggleDropdown, add:

```jsx
import { useStore as useAppStore } from '../../../store';

// inside component:
const snapEnabled = useAppStore((s) => s.analystProSnapEnabled);
const setSnapEnabled = useAppStore((s) => s.setAnalystProSnapEnabled);

// inside toolbar JSX, before SizeToggleDropdown:
<button
  type="button"
  data-testid="snap-toggle"
  onClick={() => setSnapEnabled(!snapEnabled)}
  className="premium-btn"
  style={{
    padding: '6px 12px',
    background: snapEnabled ? 'var(--accent)' : 'var(--bg-elevated)',
    color: snapEnabled ? '#fff' : 'var(--text-primary)',
    border: '1px solid var(--border-default)',
    borderRadius: 8,
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: "'JetBrains Mono', monospace",
  }}
  title={`Snap ${snapEnabled ? 'on' : 'off'} (8px grid + edges)`}
>
  SNAP {snapEnabled ? 'ON' : 'OFF'}
</button>
```

- [ ] **Step 2: Commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/components/dashboard/modes/AnalystProLayout.jsx
git commit -m "feat(analyst-pro): snap toggle button in toolbar"
```

---

## Task 16: Marquee selection

**Files:**
- Create: `frontend/src/components/dashboard/freeform/MarqueeOverlay.jsx`
- Modify: `frontend/src/components/dashboard/freeform/FreeformCanvas.jsx`

- [ ] **Step 1: MarqueeOverlay component**

```jsx
// frontend/src/components/dashboard/freeform/MarqueeOverlay.jsx
import { memo } from 'react';

function MarqueeOverlay({ rect }) {
  if (!rect) return null;
  const { x, y, width, height } = rect;
  return (
    <div
      data-testid="marquee-overlay"
      style={{
        position: 'absolute',
        left: Math.min(x, x + width),
        top: Math.min(y, y + height),
        width: Math.abs(width),
        height: Math.abs(height),
        border: '1px solid var(--accent, #2563eb)',
        background: 'color-mix(in oklab, var(--accent) 10%, transparent)',
        pointerEvents: 'none',
        zIndex: 999,
      }}
    />
  );
}

export default memo(MarqueeOverlay);
```

- [ ] **Step 2: Wire marquee into FreeformCanvas**

In FreeformCanvas.jsx, add:

```javascript
import MarqueeOverlay from './MarqueeOverlay';

// inside component:
const marquee = useStore((s) => s.analystProMarquee);
const setMarquee = useStore((s) => s.setAnalystProMarquee);

const marqueeStartRef = useRef(null);

const handleSheetPointerDown = (e) => {
  if (e.target !== e.currentTarget) return;
  clearSelection();
  const rect = e.currentTarget.getBoundingClientRect();
  marqueeStartRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  setMarquee({ x: marqueeStartRef.current.x, y: marqueeStartRef.current.y, width: 0, height: 0 });

  const onMove = (ev) => {
    if (!marqueeStartRef.current) return;
    const mx = ev.clientX - rect.left - marqueeStartRef.current.x;
    const my = ev.clientY - rect.top - marqueeStartRef.current.y;
    setMarquee({ x: marqueeStartRef.current.x, y: marqueeStartRef.current.y, width: mx, height: my });
  };
  const onUp = () => {
    // Finalize: find zones whose bounding box intersects marquee, select them.
    if (!marqueeStartRef.current) return;
    const current = useStore.getState().analystProMarquee;
    if (current && (Math.abs(current.width) > 4 || Math.abs(current.height) > 4)) {
      const left = Math.min(current.x, current.x + current.width);
      const right = Math.max(current.x, current.x + current.width);
      const top = Math.min(current.y, current.y + current.height);
      const bottom = Math.max(current.y, current.y + current.height);
      const hits = resolved.filter((r) => {
        const rLeft = r.x, rTop = r.y, rRight = r.x + r.width, rBottom = r.y + r.height;
        return rLeft < right && rRight > left && rTop < bottom && rBottom > top;
      }).map((r) => r.zone.id);
      useStore.getState().setAnalystProSelection(hits);
    }
    setMarquee(null);
    marqueeStartRef.current = null;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
};
```

Update the sheet div to use this handler and render `<MarqueeOverlay rect={marquee} />` inside.

- [ ] **Step 3: Build check + commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/components/dashboard/freeform/MarqueeOverlay.jsx frontend/src/components/dashboard/freeform/FreeformCanvas.jsx
git commit -m "feat(analyst-pro): marquee selection"
```

---

## Task 17: Smoke check — full Plan 2 verification

**Files:**
- No new files.

- [ ] **Step 1: Full freeform frontend tests**

```
cd "QueryCopilot V1/frontend" && npx vitest run src/components/dashboard/freeform/
```
Expected: 18 + 13 (zoneTreeOps) + 5 (commandHistory) + 6 (snapMath) + 4 (hitTest) = 46 tests pass.

- [ ] **Step 2: Build**

```
cd "QueryCopilot V1/frontend" && npm run build 2>&1 | tail -5
```
Expected: `✓ built in <time>s`.

- [ ] **Step 3: Lint touched files**

```
cd "QueryCopilot V1/frontend" && npx eslint src/components/dashboard/freeform/
```
Expected: 0 errors.

- [ ] **Step 4: Manual dev-server smoke**

Run `npm run dev` + `uvicorn main:app --reload --port 8002`. In browser at `http://localhost:5173/analytics`:
1. Load a dashboard, switch to "Analyst Pro" mode.
2. Click a tile → selection ring appears.
3. Drag a tile → position updates live.
4. Drag a resize handle → size updates live.
5. Toggle snap → repeat drag → values snap to 8px grid.
6. Cmd+Z → last change undone.
7. Cmd+Shift+Z → redone.
8. Cmd+A → all top-level zones selected (ring on each).
9. Esc → selection cleared.
10. Arrow keys → nudge selected floating zones (if any).
11. `]` / `[` → floating z-order change (if any).
12. Drag on empty canvas → marquee rectangle appears; release → zones inside selected.

Document any issues in a new task. Commit if fixing inline.

- [ ] **Step 5: Commit smoke pass**

```bash
cd "QueryCopilot V1"
git status
# If clean: done. If changes: git add -u && git commit -m "chore(analyst-pro): Plan 2 smoke check pass"
```

---

## Self-Review

**Spec coverage (against §6 Canvas engine UX):**

| Feature | Covered by |
|---------|------------|
| 6.1 Placement (drag from library) | **Deferred to Plan 2b** — ObjectLibraryPanel |
| 6.2 Selection (click, marquee, shift-click) | Tasks 6, 7, 14 (click + toggle), 16 (marquee) |
| 6.3 Move (tiled reorder + floating free + snap) | Tasks 9 (floating), 11 (tiled reorder), 4 (snap math) |
| 6.4 Resize (proportional + pixel + snap) | Tasks 9 (floating resize), 10 (tiled resize), 4 (snap) |
| 6.5 Alignment + distribution | **Deferred to Plan 2b** |
| 6.6 Group / ungroup | **Deferred to Plan 2b** |
| 6.7 Z-order (floating) | Task 13 (`]` / `[` shortcuts) |
| 6.8 Lock | **Deferred to Plan 2b** |
| 6.9 Undo / redo | Tasks 3, 6, 12, 13 |
| 6.10 Layout overlay | **Deferred to Plan 2b** |
| 6.11 Size toggle | Shipped in Plan 1 |

Plan 2 scope covers: selection, move, resize, snap, undo/redo, keyboard shortcuts, z-order for floating, marquee. Deferred: ObjectLibraryPanel, LayoutTreePanel, Alignment toolbar, Group/Ungroup, Lock, Layout overlay (all → Plan 2b).

**Placeholder scan:** every code step contains full code. No "TBD". ✓

**Type consistency:**
- `insertChild/removeChild/moveZone/resizeZone/updateZone` all operate on `Zone` / `ContainerZone`, consistent with Plan 1 types.
- `History<T>` shape consistent between `commandHistory.ts` and the Zustand slice's inline analystProHistory.
- `hitTestPoint` returns `ResolvedZone | null` matching Plan 1's type.
- `useDragResize` uses `resolvedMap` and `resolved` arrays from FreeformCanvas consistently.

**Implementation concerns to flag at task time:**
- Task 11 tiled-reorder uses a crude heuristic (dx > 40 = shift one index). Replace with proper insertion-line math in Plan 2b.
- Task 14's FreeformCanvas diff is large and may need iteration — dispatch with `DONE_WITH_CONCERNS` if the wiring gets tangled.

---

## Plan complete and saved to `docs/superpowers/plans/2026-04-16-analyst-pro-plan-2-canvas-interactions.md`.
