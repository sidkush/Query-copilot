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
