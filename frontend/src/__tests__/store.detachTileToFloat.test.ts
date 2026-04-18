// Plan 8 T25 — per-tile independent sizing.
//
// In a tiled horz row, every child SHARES the row's height by definition
// (that's what a horz-container means). So editing a tile's Height %
// grows every sibling in the same row — the user reported this as "the
// whole row is shifting" and asked for per-tile sizing instead.
//
// Truly independent tile sizes require moving the tile to the floating
// layer, where each tile has absolute pxW/pxH and the row structure no
// longer constrains it. Tableau does the same: tiles in a tiled row
// share extents; to size tiles independently you Float them first.
//
// New store action: detachTileToFloatAnalystPro(leafId, { pxW, pxH, x, y })
// 1. Find the leaf's current resolved pixel rect from the canvas.
// 2. Remove the leaf from tiledRoot (surrounding siblings renormalize).
// 3. Insert a FloatingZone copy of the leaf into floatingLayer with
//    either the resolved rect or caller-supplied px overrides.
// 4. Push to history ('Detach tile').

import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../store';

const baseDash = () => ({
  schemaVersion: 'askdb/dashboard/v1',
  id: 'd1',
  name: 'test',
  archetype: 'analyst-pro',
  size: { mode: 'fixed', width: 1440, height: 900, preset: 'custom' },
  tiledRoot: {
    id: 'root',
    type: 'container-vert',
    w: 100000,
    h: 100000,
    children: [
      {
        id: 'row-0',
        type: 'container-horz',
        w: 100000,
        h: 100000,
        children: [
          { id: 'L1', type: 'worksheet', worksheetRef: 'ws1', w: 33333, h: 100000, displayName: 'Leaf 1' },
          { id: 'L2', type: 'worksheet', worksheetRef: 'ws2', w: 33333, h: 100000, displayName: 'Leaf 2' },
          { id: 'L3', type: 'worksheet', worksheetRef: 'ws3', w: 33334, h: 100000, displayName: 'Leaf 3' },
        ],
      },
    ],
  },
  floatingLayer: [],
  worksheets: [],
  parameters: [],
  sets: [],
  actions: [],
});

function findInTree(root: any, id: string): any {
  if (!root) return null;
  if (root.id === id) return root;
  for (const c of root.children || []) {
    const f = findInTree(c, id);
    if (f) return f;
  }
  return null;
}

describe('Plan 8 T25 — detachTileToFloatAnalystPro', () => {
  beforeEach(() => {
    const dash = baseDash();
    useStore.setState({ analystProDashboard: dash });
    // Seed history so pushAnalystProHistory has a prior present to push.
    useStore.getState().initAnalystProHistory(dash);
  });

  it('removes the leaf from tiledRoot', () => {
    useStore.getState().detachTileToFloatAnalystPro('L1', { pxW: 400, pxH: 300 });
    const dash = useStore.getState().analystProDashboard;
    expect(findInTree(dash.tiledRoot, 'L1')).toBeNull();
  });

  it('adds a FloatingZone copy to floatingLayer with floating: true and the given px rect', () => {
    useStore.getState().detachTileToFloatAnalystPro('L1', { pxW: 400, pxH: 300, x: 20, y: 50 });
    const dash = useStore.getState().analystProDashboard;
    const f = dash.floatingLayer.find((z: any) => z.id === 'L1');
    expect(f).toBeDefined();
    expect(f.floating).toBe(true);
    expect(f.pxW).toBe(400);
    expect(f.pxH).toBe(300);
    expect(f.x).toBe(20);
    expect(f.y).toBe(50);
    expect(f.worksheetRef).toBe('ws1');
    expect(f.displayName).toBe('Leaf 1');
  });

  it('leaves siblings in the row untouched (renormalized to sum = 100000 but same ids/ratios)', () => {
    useStore.getState().detachTileToFloatAnalystPro('L1', { pxW: 400, pxH: 300 });
    const dash = useStore.getState().analystProDashboard;
    const row = findInTree(dash.tiledRoot, 'row-0');
    const ids = row.children.map((c: any) => c.id);
    expect(ids).toEqual(['L2', 'L3']);
    const wSum = row.children.reduce((s: number, c: any) => s + c.w, 0);
    expect(wSum).toBe(100000);
  });

  it('is a no-op when the leafId is not found', () => {
    const before = useStore.getState().analystProDashboard;
    useStore.getState().detachTileToFloatAnalystPro('does-not-exist', { pxW: 100, pxH: 100 });
    const after = useStore.getState().analystProDashboard;
    expect(after).toBe(before);
  });

  it('clamps pxW / pxH to at least 40 px', () => {
    useStore.getState().detachTileToFloatAnalystPro('L1', { pxW: 5, pxH: 0 });
    const f = useStore.getState().analystProDashboard.floatingLayer.find((z: any) => z.id === 'L1');
    expect(f.pxW).toBeGreaterThanOrEqual(40);
    expect(f.pxH).toBeGreaterThanOrEqual(40);
  });

  it('pushes a history entry labelled "Detach tile"', () => {
    useStore.getState().detachTileToFloatAnalystPro('L1', { pxW: 400, pxH: 300 });
    const h = useStore.getState().analystProHistory;
    expect(h?.present?.operation).toBe('Detach tile');
  });
});
