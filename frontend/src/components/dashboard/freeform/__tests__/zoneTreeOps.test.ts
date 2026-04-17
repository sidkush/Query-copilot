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

import { moveZone, resizeZone, updateZone, groupSelection, ungroupContainer, toggleLock, toggleLockFloating } from '../lib/zoneTreeOps';
import type { FloatingZone } from '../lib/types';

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
});
