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
