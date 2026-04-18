// Plan 7 T19 — findResizeTarget: given a leaf id and an axis (w|h), return
// the id of the ancestor whose proportional value actually controls that
// axis's size. Needed because resizing a leaf directly is a no-op when its
// immediate parent's axis is perpendicular: e.g. a leaf inside a
// container-horz has leaf.w = its axis share, but leaf.h = 100000 (fills
// the row). To grow the leaf vertically we have to grow the ROW inside the
// grandparent (a container-vert root), not the leaf.
import { describe, it, expect } from 'vitest';
import { findResizeTarget } from '../lib/findResizeTarget';

describe('Plan 7 T19 — findResizeTarget', () => {
  // Classic dashboard tree: container-vert root with container-horz rows,
  // each row containing leaf worksheets.
  const tree = {
    id: 'root', type: 'container-vert', w: 100000, h: 100000,
    children: [
      {
        id: 'row-0', type: 'container-horz', w: 100000, h: 40000,
        children: [
          { id: 'L1', type: 'worksheet', w: 50000, h: 100000 },
          { id: 'L2', type: 'worksheet', w: 50000, h: 100000 },
        ],
      },
      {
        id: 'row-1', type: 'container-horz', w: 100000, h: 60000,
        children: [
          { id: 'L3', type: 'worksheet', w: 100000, h: 100000 },
        ],
      },
    ],
  };

  it('for axis=w on a leaf inside a horz row → returns the leaf id (leaf controls horz axis)', () => {
    expect(findResizeTarget(tree, 'L1', 'w')).toBe('L1');
  });

  it('for axis=h on a leaf inside a horz row → returns the ROW id (row controls vert axis)', () => {
    expect(findResizeTarget(tree, 'L1', 'h')).toBe('row-0');
  });

  it('for axis=h on a single-child horz row leaf → still returns the row id', () => {
    expect(findResizeTarget(tree, 'L3', 'h')).toBe('row-1');
  });

  it('for axis=w on the root itself → returns null (root has no parent to renormalize against)', () => {
    expect(findResizeTarget(tree, 'root', 'w')).toBe(null);
    expect(findResizeTarget(tree, 'root', 'h')).toBe(null);
  });

  it('for a leaf that is a direct child of a vert container → leaf controls vert axis, parent controls horz axis', () => {
    const vertFirst = {
      id: 'root', type: 'container-horz', w: 100000, h: 100000,
      children: [
        {
          id: 'col-0', type: 'container-vert', w: 40000, h: 100000,
          children: [
            { id: 'X1', type: 'worksheet', w: 100000, h: 50000 },
            { id: 'X2', type: 'worksheet', w: 100000, h: 50000 },
          ],
        },
      ],
    };
    expect(findResizeTarget(vertFirst, 'X1', 'h')).toBe('X1');
    expect(findResizeTarget(vertFirst, 'X1', 'w')).toBe('col-0');
  });

  it('returns null when the id is not in the tree', () => {
    expect(findResizeTarget(tree, 'does-not-exist', 'w')).toBe(null);
  });
});
