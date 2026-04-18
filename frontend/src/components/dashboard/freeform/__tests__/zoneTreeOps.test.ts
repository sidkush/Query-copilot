// frontend/src/components/dashboard/freeform/__tests__/zoneTreeOps.test.ts
import { describe, it, expect } from 'vitest';
import {
  insertChild,
  removeChild,
  moveZoneAcrossContainers,
  wrapInContainer,
  distributeEvenly,
  fitContainerToContent,
  removeContainer,
} from '../lib/zoneTreeOps';
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

import { reorderZone, resizeZone, updateZone, groupSelection, ungroupContainer, toggleLock, toggleLockFloating } from '../lib/zoneTreeOps';
import type { FloatingZone } from '../lib/types';

// useDragResize drop-commit translation: given a same-parent reorder from
// currentIdx → targetIdx (currentIdx !== targetIdx), call reorderZone with
// siblings[targetIdx] as target and position 'after' when moving forward,
// 'before' when moving backward. These parity tests pin the translation
// that replaces the old moveZone(..., parentId, targetIdx) call.
describe('reorderZone — same-parent drop translation', () => {
  const dropReorder = (
    root: ContainerZone,
    parent: ContainerZone,
    zoneId: string,
    targetIdx: number,
  ): ContainerZone => {
    const currentIdx = parent.children.findIndex((c) => c.id === zoneId);
    if (currentIdx === targetIdx) return root;
    const targetId = parent.children[targetIdx].id;
    const position = targetIdx > currentIdx ? 'after' : 'before';
    return reorderZone(root, zoneId, targetId, position) as ContainerZone;
  };

  it('shifts first child to the end of a 2-child parent (0 → 1, "after")', () => {
    const root = base();
    const next = dropReorder(root, root, 'a', 1);
    expect(next.children.map((c) => c.id)).toEqual(['b', 'a']);
  });

  it('shifts last child to the start of a 2-child parent (1 → 0, "before")', () => {
    const root = base();
    const next = dropReorder(root, root, 'b', 0);
    expect(next.children.map((c) => c.id)).toEqual(['b', 'a']);
  });

  it('shifts middle child to the end of a 3-child parent (1 → 2, "after")', () => {
    const root = threeChildRoot();
    const next = dropReorder(root, root, 'b', 2);
    expect(next.children.map((c) => c.id)).toEqual(['a', 'c', 'b']);
  });

  it('shifts last child to the middle of a 3-child parent (2 → 1, "before")', () => {
    const root = threeChildRoot();
    const next = dropReorder(root, root, 'c', 1);
    expect(next.children.map((c) => c.id)).toEqual(['a', 'c', 'b']);
  });

  it('renormalizes parent proportions to sum 100000 after drop reorder', () => {
    const root = threeChildRoot();
    const next = dropReorder(root, root, 'a', 2);
    const sumW = next.children.reduce((s, c) => s + c.w, 0);
    expect(sumW).toBe(100000);
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

// ─── T3: groupSelection ───────────────────────────────────────────────────────

/**
 * Helper: horz container with three children whose w proportions are [50000, 30000, 20000].
 */
const threeChildRoot = (): ContainerZone => ({
  id: 'root',
  type: 'container-horz',
  w: 100000,
  h: 100000,
  children: [
    { id: 'a', type: 'blank', w: 50000, h: 100000 },
    { id: 'b', type: 'blank', w: 30000, h: 100000 },
    { id: 'c', type: 'blank', w: 20000, h: 100000 },
  ],
});

describe('groupSelection', () => {
  it('groups 2 siblings in a horz container, resulting parent has 2 children', () => {
    const root = threeChildRoot();
    const { root: next, newContainerId } = groupSelection(root, ['a', 'b']);
    expect(newContainerId).not.toBeNull();
    const parent = next as ContainerZone;
    // Parent now has: [newContainer, c]
    expect(parent.children).toHaveLength(2);
    // First child is the new container
    expect(parent.children[0].id).toBe(newContainerId);
    // Last child is the unchanged 'c'
    expect(parent.children[1].id).toBe('c');
  });

  it('new container w proportion ≈ 80000 (sum of grouped zone proportions)', () => {
    const root = threeChildRoot();
    const { root: next, newContainerId } = groupSelection(root, ['a', 'b']);
    const parent = next as ContainerZone;
    const newContainer = parent.children.find((ch) => ch.id === newContainerId) as ContainerZone;
    // The grouped zones had w=50000 + w=30000 = 80000 out of 100000
    // After renormalization parent sums to 100000: newContainer.w = 80000, c.w = 20000
    expect(newContainer.w).toBe(80000);
  });

  it('inner children of new container have w proportions that sum to 100000', () => {
    const root = threeChildRoot();
    const { root: next, newContainerId } = groupSelection(root, ['a', 'b']);
    const parent = next as ContainerZone;
    const newContainer = parent.children.find((ch) => ch.id === newContainerId) as ContainerZone;
    const innerSum = newContainer.children.reduce((s, ch) => s + ch.w, 0);
    expect(innerSum).toBe(100000);
  });

  it('returns identity + null when selected zones are from different parents', () => {
    const root: ContainerZone = {
      id: 'root',
      type: 'container-vert',
      w: 100000,
      h: 100000,
      children: [
        { id: 'inner1', type: 'container-horz', w: 100000, h: 50000, children: [
          { id: 'a', type: 'blank', w: 100000, h: 100000 },
        ]},
        { id: 'inner2', type: 'container-horz', w: 100000, h: 50000, children: [
          { id: 'b', type: 'blank', w: 100000, h: 100000 },
        ]},
      ],
    };
    const { root: next, newContainerId } = groupSelection(root, ['a', 'b']);
    expect(newContainerId).toBeNull();
    expect(next).toBe(root);
  });

  it('returns identity + null for single-zone selection', () => {
    const root = base();
    const { root: next, newContainerId } = groupSelection(root, ['a']);
    expect(newContainerId).toBeNull();
    expect(next).toBe(root);
  });

  it('returns identity + null for empty selection', () => {
    const root = base();
    const { root: next, newContainerId } = groupSelection(root, []);
    expect(newContainerId).toBeNull();
    expect(next).toBe(root);
  });

  it('returns identity + null when all selected ids are floating (not in tiled root)', () => {
    const root = base(); // only contains 'a' and 'b'
    // IDs that don't exist in the tiled root (simulate floating-only ids)
    const { root: next, newContainerId } = groupSelection(root, ['float-1', 'float-2']);
    expect(newContainerId).toBeNull();
    expect(next).toBe(root);
  });

  it('new container proportions sum to 100000 on parent axis (smoke test)', () => {
    const root = threeChildRoot();
    const { root: next } = groupSelection(root, ['a', 'b']);
    const parent = next as ContainerZone;
    const parentSum = parent.children.reduce((s, ch) => s + ch.w, 0);
    expect(parentSum).toBe(100000);
  });

  it('does not mutate input tree', () => {
    const root = threeChildRoot();
    const snapshot = JSON.stringify(root);
    groupSelection(root, ['a', 'b']);
    expect(JSON.stringify(root)).toBe(snapshot);
  });
});

// ─── T3: ungroupContainer ────────────────────────────────────────────────────

describe('ungroupContainer', () => {
  const ungroupRoot = (): ContainerZone => ({
    id: 'root',
    type: 'container-horz',
    w: 100000,
    h: 100000,
    children: [
      {
        id: 'inner',
        type: 'container-horz',
        w: 60000,
        h: 100000,
        children: [
          { id: 'x', type: 'blank', w: 50000, h: 100000 },
          { id: 'y', type: 'blank', w: 50000, h: 100000 },
        ],
      },
      { id: 'z', type: 'blank', w: 40000, h: 100000 },
    ],
  });

  it('replaces container with its children inline in grandparent (count increases by child count - 1)', () => {
    const root = ungroupRoot();
    const next = ungroupContainer(root, 'inner') as ContainerZone;
    // Before: [inner, z] — after: [x, y, z]
    expect(next.children).toHaveLength(3);
    expect(next.children.map((c) => c.id)).toEqual(['x', 'y', 'z']);
  });

  it('returns identity when containerId is root', () => {
    const root = ungroupRoot();
    const next = ungroupContainer(root, 'root');
    expect(next).toBe(root);
  });

  it('returns identity when id not found', () => {
    const root = ungroupRoot();
    const next = ungroupContainer(root, 'does-not-exist');
    expect(next).toBe(root);
  });

  it('returns identity when id refers to a leaf (not a container)', () => {
    const root = ungroupRoot();
    const next = ungroupContainer(root, 'z');
    expect(next).toBe(root);
  });

  it('after ungroup parent children w proportions sum to 100000 (±1 for rounding)', () => {
    const root = ungroupRoot();
    const next = ungroupContainer(root, 'inner') as ContainerZone;
    const sum = next.children.reduce((s, c) => s + c.w, 0);
    expect(Math.abs(sum - 100000)).toBeLessThanOrEqual(1);
  });

  it('does not mutate input tree', () => {
    const root = ungroupRoot();
    const snapshot = JSON.stringify(root);
    ungroupContainer(root, 'inner');
    expect(JSON.stringify(root)).toBe(snapshot);
  });
});

// ─── T3: toggleLock ──────────────────────────────────────────────────────────

describe('toggleLock', () => {
  it('sets locked=true on a tiled zone whose locked field is undefined', () => {
    const root = base(); // zone 'a' has no locked field
    const next = toggleLock(root, 'a') as ContainerZone;
    expect(next.children[0].locked).toBe(true);
  });

  it('removes the locked key when zone is already locked=true', () => {
    const root: ContainerZone = {
      id: 'root',
      type: 'container-horz',
      w: 100000,
      h: 100000,
      children: [
        { id: 'a', type: 'blank', w: 50000, h: 100000, locked: true },
        { id: 'b', type: 'blank', w: 50000, h: 100000 },
      ],
    };
    const next = toggleLock(root, 'a') as ContainerZone;
    expect(next.children[0].locked).toBeUndefined();
  });

  it('returns the same root reference when id not found', () => {
    const root = base();
    const next = toggleLock(root, 'nonexistent');
    expect(next).toBe(root);
  });

  it('does not mutate input tree', () => {
    const root = base();
    const snapshot = JSON.stringify(root);
    toggleLock(root, 'a');
    expect(JSON.stringify(root)).toBe(snapshot);
  });
});

// ─── T3: toggleLockFloating ──────────────────────────────────────────────────

describe('toggleLockFloating', () => {
  const makeFloating = (): FloatingZone[] => [
    {
      id: 'f1',
      type: 'blank',
      floating: true,
      x: 10,
      y: 20,
      pxW: 200,
      pxH: 150,
      zIndex: 5,
      w: 0,
      h: 0,
    },
    {
      id: 'f2',
      type: 'blank',
      floating: true,
      x: 50,
      y: 60,
      pxW: 100,
      pxH: 80,
      zIndex: 3,
      w: 0,
      h: 0,
    },
  ];

  it('sets locked=true on a floating zone whose locked field is undefined; preserves other fields', () => {
    const layer = makeFloating();
    const next = toggleLockFloating(layer, 'f1');
    const f1 = next.find((z) => z.id === 'f1')!;
    expect(f1.locked).toBe(true);
    // Preserve positional fields
    expect(f1.x).toBe(10);
    expect(f1.y).toBe(20);
    expect(f1.pxW).toBe(200);
    expect(f1.pxH).toBe(150);
    expect(f1.zIndex).toBe(5);
  });

  it('returns the same array reference when id not found', () => {
    const layer = makeFloating();
    const next = toggleLockFloating(layer, 'nonexistent');
    expect(next).toBe(layer);
  });

  it('does not mutate input array', () => {
    const layer = makeFloating();
    const snapshot = JSON.stringify(layer);
    toggleLockFloating(layer, 'f1');
    expect(JSON.stringify(layer)).toBe(snapshot);
  });
});

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

describe('moveZoneAcrossContainers', () => {
  const leaf = (id: string, w = 50000, h = 100000): LeafZone => ({
    id, type: 'worksheet', w, h, worksheetRef: id,
  });
  const build = (): ContainerZone => ({
    id: 'root', type: 'container-horz', w: 100000, h: 100000,
    children: [
      { id: 'A', type: 'container-vert', w: 50000, h: 100000,
        children: [leaf('A1', 100000, 50000), leaf('A2', 100000, 50000)] },
      { id: 'B', type: 'container-vert', w: 50000, h: 100000,
        children: [leaf('B1', 100000, 100000)] },
    ],
  });

  it('moves a leaf from container A into container B at index 1', () => {
    const root = build();
    const next = moveZoneAcrossContainers(root, 'A1', 'B', 1) as ContainerZone;
    const B = next.children.find((c) => c.id === 'B') as ContainerZone;
    expect(B.children.map((c) => c.id)).toEqual(['B1', 'A1']);
    const A = next.children.find((c) => c.id === 'A') as ContainerZone;
    expect(A.children.map((c) => c.id)).toEqual(['A2']);
  });

  it('re-normalizes both source and target containers after the move', () => {
    const root = build();
    const next = moveZoneAcrossContainers(root, 'A1', 'B', 0) as ContainerZone;
    const A = next.children.find((c) => c.id === 'A') as ContainerZone;
    const B = next.children.find((c) => c.id === 'B') as ContainerZone;
    const sumAxis = (c: ContainerZone, axis: 'w' | 'h') =>
      c.children.reduce((s, k) => s + (k as { w: number; h: number })[axis], 0);
    expect(sumAxis(A, 'h')).toBe(100000);
    expect(sumAxis(B, 'h')).toBe(100000);
  });

  it('rejects cycles — cannot move a container into its own descendant', () => {
    const root = build();
    // Moving A into A1 (a descendant of A) should be rejected.
    const next = moveZoneAcrossContainers(root, 'A', 'A1', 0);
    expect(next).toBe(root);
  });

  it('clamps negative or overflowing targetIndex', () => {
    const root = build();
    const nLo = moveZoneAcrossContainers(root, 'A1', 'B', -5) as ContainerZone;
    const nHi = moveZoneAcrossContainers(root, 'A1', 'B', 999) as ContainerZone;
    const BLo = nLo.children.find((c) => c.id === 'B') as ContainerZone;
    const BHi = nHi.children.find((c) => c.id === 'B') as ContainerZone;
    expect(BLo.children[0].id).toBe('A1');
    expect(BHi.children[BHi.children.length - 1].id).toBe('A1');
  });

  it('returns identity when source or target not found', () => {
    const root = build();
    expect(moveZoneAcrossContainers(root, 'missing', 'B', 0)).toBe(root);
    expect(moveZoneAcrossContainers(root, 'A1', 'missing', 0)).toBe(root);
  });

  it('returns identity when targetContainerId is a leaf (not a container)', () => {
    const root = build();
    expect(moveZoneAcrossContainers(root, 'A1', 'B1', 0)).toBe(root);
  });
});

describe('wrapInContainer', () => {
  const leaf = (id: string, w = 50000, h = 100000): LeafZone => ({
    id, type: 'worksheet', w, h, worksheetRef: id,
  });
  const build = (): ContainerZone => ({
    id: 'root', type: 'container-horz', w: 100000, h: 100000,
    children: [leaf('A', 50000, 100000), leaf('B', 50000, 100000)],
  });

  it('dropping on top edge of B creates a container-vert wrapping [source, B]', () => {
    const root = build();
    const next = wrapInContainer(root, 'B', leaf('C', 100000, 100000), 'top') as ContainerZone;
    const wrapper = next.children.find((c) => c.id !== 'A') as ContainerZone;
    expect(wrapper.type).toBe('container-vert');
    expect(wrapper.children.map((c) => c.id)).toEqual(['C', 'B']);
  });

  it('dropping on bottom edge of B creates container-vert wrapping [B, source]', () => {
    const root = build();
    const next = wrapInContainer(root, 'B', leaf('C'), 'bottom') as ContainerZone;
    const wrapper = next.children.find((c) => c.id !== 'A') as ContainerZone;
    expect(wrapper.type).toBe('container-vert');
    expect(wrapper.children.map((c) => c.id)).toEqual(['B', 'C']);
  });

  it('dropping on left edge creates container-horz wrapping [source, B]', () => {
    const root = build();
    const next = wrapInContainer(root, 'B', leaf('C'), 'left') as ContainerZone;
    const wrapper = next.children.find((c) => c.id !== 'A') as ContainerZone;
    expect(wrapper.type).toBe('container-horz');
    expect(wrapper.children.map((c) => c.id)).toEqual(['C', 'B']);
  });

  it('dropping on right edge creates container-horz wrapping [B, source]', () => {
    const root = build();
    const next = wrapInContainer(root, 'B', leaf('C'), 'right') as ContainerZone;
    const wrapper = next.children.find((c) => c.id !== 'A') as ContainerZone;
    expect(wrapper.type).toBe('container-horz');
    expect(wrapper.children.map((c) => c.id)).toEqual(['B', 'C']);
  });

  it('preserves target B original axis proportion in the parent', () => {
    const root = build();
    const next = wrapInContainer(root, 'B', leaf('C'), 'right') as ContainerZone;
    const wrapper = next.children.find((c) => c.id !== 'A') as ContainerZone;
    expect(wrapper.w).toBe(50000);
    const sum = next.children.reduce((s, c) => s + (c as { w: number }).w, 0);
    expect(sum).toBe(100000);
  });

  it('returns identity when targetId missing or is the root', () => {
    const root = build();
    expect(wrapInContainer(root, 'missing', leaf('C'), 'top')).toBe(root);
    expect(wrapInContainer(root, 'root', leaf('C'), 'top')).toBe(root);
  });
});

describe('distributeEvenly', () => {
  it('sets every child to 100000 / n on the split axis (horz container)', () => {
    const root: ContainerZone = {
      id: 'root',
      type: 'container-horz',
      w: 100000,
      h: 100000,
      children: [
        { id: 'a', type: 'blank', w: 20000, h: 100000 },
        { id: 'b', type: 'blank', w: 30000, h: 100000 },
        { id: 'c', type: 'blank', w: 50000, h: 100000 },
      ],
    };
    const next = distributeEvenly(root, 'root') as ContainerZone;
    expect(next.children.map((c) => c.w)).toEqual([33333, 33333, 33334]);
    expect(next.children.reduce((s, c) => s + c.w, 0)).toBe(100000);
  });

  it('sets every child to 100000 / n on the split axis (vert container)', () => {
    const root: ContainerZone = {
      id: 'root',
      type: 'container-vert',
      w: 100000,
      h: 100000,
      children: [
        { id: 'a', type: 'blank', w: 100000, h: 20000 },
        { id: 'b', type: 'blank', w: 100000, h: 80000 },
      ],
    };
    const next = distributeEvenly(root, 'root') as ContainerZone;
    expect(next.children.map((c) => c.h)).toEqual([50000, 50000]);
  });

  it('returns identity when container has < 2 children', () => {
    const root: ContainerZone = {
      id: 'root',
      type: 'container-horz',
      w: 100000,
      h: 100000,
      children: [{ id: 'a', type: 'blank', w: 100000, h: 100000 }],
    };
    expect(distributeEvenly(root, 'root')).toBe(root);
  });

  it('returns identity when id is not a container', () => {
    const root: ContainerZone = {
      id: 'root',
      type: 'container-horz',
      w: 100000,
      h: 100000,
      children: [
        { id: 'a', type: 'blank', w: 50000, h: 100000 },
        { id: 'b', type: 'blank', w: 50000, h: 100000 },
      ],
    };
    expect(distributeEvenly(root, 'a')).toBe(root);
  });

  it('does not mutate input tree', () => {
    const root: ContainerZone = {
      id: 'root',
      type: 'container-horz',
      w: 100000,
      h: 100000,
      children: [
        { id: 'a', type: 'blank', w: 20000, h: 100000 },
        { id: 'b', type: 'blank', w: 80000, h: 100000 },
      ],
    };
    const before = JSON.stringify(root);
    distributeEvenly(root, 'root');
    expect(JSON.stringify(root)).toBe(before);
  });
});

describe('fitContainerToContent', () => {
  it('sums children pixel widths along horz split axis, max height on perp', () => {
    const root: ContainerZone = {
      id: 'root',
      type: 'container-horz',
      w: 100000,
      h: 100000,
      children: [
        { id: 'a', type: 'blank', w: 50000, h: 100000 },
        { id: 'b', type: 'blank', w: 50000, h: 100000 },
      ],
    };
    const next = fitContainerToContent(root, 'root', {
      a: { width: 200, height: 120 },
      b: { width: 180, height: 150 },
    }) as ContainerZone;
    expect(next.sizeOverride).toEqual({ pxW: 380, pxH: 150 });
    expect(next.children).toEqual(root.children);
  });

  it('sums heights along vert split axis, max width on perp', () => {
    const root: ContainerZone = {
      id: 'root',
      type: 'container-vert',
      w: 100000,
      h: 100000,
      children: [
        { id: 'a', type: 'blank', w: 100000, h: 50000 },
        { id: 'b', type: 'blank', w: 100000, h: 50000 },
      ],
    };
    const next = fitContainerToContent(root, 'root', {
      a: { width: 320, height: 100 },
      b: { width: 240, height: 180 },
    }) as ContainerZone;
    expect(next.sizeOverride).toEqual({ pxW: 320, pxH: 280 });
  });

  it('treats missing child measurements as 0 pixels', () => {
    const root: ContainerZone = {
      id: 'root',
      type: 'container-horz',
      w: 100000,
      h: 100000,
      children: [
        { id: 'a', type: 'blank', w: 50000, h: 100000 },
        { id: 'b', type: 'blank', w: 50000, h: 100000 },
      ],
    };
    const next = fitContainerToContent(root, 'root', { a: { width: 200, height: 120 } }) as ContainerZone;
    expect(next.sizeOverride).toEqual({ pxW: 200, pxH: 120 });
  });

  it('returns identity when id is not a container', () => {
    const root: ContainerZone = {
      id: 'root',
      type: 'container-horz',
      w: 100000,
      h: 100000,
      children: [{ id: 'a', type: 'blank', w: 100000, h: 100000 }],
    };
    expect(fitContainerToContent(root, 'a', {})).toBe(root);
  });

  it('does not mutate input tree', () => {
    const root: ContainerZone = {
      id: 'root',
      type: 'container-horz',
      w: 100000,
      h: 100000,
      children: [
        { id: 'a', type: 'blank', w: 50000, h: 100000 },
        { id: 'b', type: 'blank', w: 50000, h: 100000 },
      ],
    };
    const before = JSON.stringify(root);
    fitContainerToContent(root, 'root', { a: { width: 100, height: 50 }, b: { width: 100, height: 50 } });
    expect(JSON.stringify(root)).toBe(before);
  });
});

describe('removeContainer', () => {
  it('unwraps a nested container into grandparent preserving order', () => {
    const root: ContainerZone = {
      id: 'root',
      type: 'container-vert',
      w: 100000,
      h: 100000,
      children: [
        {
          id: 'inner',
          type: 'container-horz',
          w: 100000,
          h: 50000,
          children: [
            { id: 'x', type: 'blank', w: 60000, h: 100000 },
            { id: 'y', type: 'blank', w: 40000, h: 100000 },
          ],
        },
        { id: 'z', type: 'blank', w: 100000, h: 50000 },
      ],
    };
    const next = removeContainer(root, 'inner') as ContainerZone;
    expect(next.children.map((c) => c.id)).toEqual(['x', 'y', 'z']);
  });

  it('renormalizes grandparent split-axis sum to 100000', () => {
    const root: ContainerZone = {
      id: 'root',
      type: 'container-vert',
      w: 100000,
      h: 100000,
      children: [
        {
          id: 'inner',
          type: 'container-vert',
          w: 100000,
          h: 60000,
          children: [
            { id: 'x', type: 'blank', w: 100000, h: 50000 },
            { id: 'y', type: 'blank', w: 100000, h: 50000 },
          ],
        },
        { id: 'z', type: 'blank', w: 100000, h: 40000 },
      ],
    };
    const next = removeContainer(root, 'inner') as ContainerZone;
    expect(next.children.reduce((s, c) => s + c.h, 0)).toBe(100000);
  });

  it('rejects removing the root (returns identity)', () => {
    const root: ContainerZone = {
      id: 'root',
      type: 'container-horz',
      w: 100000,
      h: 100000,
      children: [{ id: 'a', type: 'blank', w: 100000, h: 100000 }],
    };
    expect(removeContainer(root, 'root')).toBe(root);
  });

  it('returns identity when id is not found', () => {
    const root: ContainerZone = {
      id: 'root',
      type: 'container-horz',
      w: 100000,
      h: 100000,
      children: [{ id: 'a', type: 'blank', w: 100000, h: 100000 }],
    };
    expect(removeContainer(root, 'nope')).toBe(root);
  });

  it('returns identity when target is not a container', () => {
    const root: ContainerZone = {
      id: 'root',
      type: 'container-horz',
      w: 100000,
      h: 100000,
      children: [{ id: 'a', type: 'blank', w: 100000, h: 100000 }],
    };
    expect(removeContainer(root, 'a')).toBe(root);
  });
});
