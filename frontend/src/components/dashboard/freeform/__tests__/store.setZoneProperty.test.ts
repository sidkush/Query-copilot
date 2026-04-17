import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../../../../store';

function baseDashboard() {
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
      children: [
        { id: 'z1', type: 'worksheet', worksheetRef: 'sheet-a', w: 100000, h: 100000 },
      ],
    },
    floatingLayer: [
      { id: 'f1', type: 'blank', w: 0, h: 0, floating: true, x: 10, y: 20, pxW: 300, pxH: 200, zIndex: 1 },
    ],
    worksheets: [],
    parameters: [],
    sets: [],
    actions: [],
  };
}

function seed() {
  const dash = baseDashboard();
  useStore.setState({ analystProDashboard: dash } as any);
  useStore.getState().initAnalystProHistory(dash);
}

describe('setZonePropertyAnalystPro (Plan 5d T2)', () => {
  beforeEach(seed);

  it('patches a tiled zone field and records history', () => {
    useStore.getState().setZonePropertyAnalystPro('z1', { innerPadding: 8 });
    const z = (useStore.getState().analystProDashboard as any).tiledRoot.children[0];
    expect(z.innerPadding).toBe(8);
    const hist = (useStore.getState() as any).analystProHistory;
    expect(hist.past.length).toBeGreaterThan(0);
  });

  it('patches a floating zone field', () => {
    useStore.getState().setZonePropertyAnalystPro('f1', { showTitle: false });
    const f = (useStore.getState().analystProDashboard as any).floatingLayer[0];
    expect(f.showTitle).toBe(false);
  });

  it('is a no-op for unknown zone id', () => {
    const before = useStore.getState().analystProDashboard;
    useStore.getState().setZonePropertyAnalystPro('nope', { innerPadding: 8 });
    expect(useStore.getState().analystProDashboard).toBe(before);
  });

  it('short-circuits when the patch is deep-equal to current values', () => {
    useStore.getState().setZonePropertyAnalystPro('z1', { innerPadding: 8 });
    const beforeLen = ((useStore.getState() as any).analystProHistory.past as unknown[]).length;
    useStore.getState().setZonePropertyAnalystPro('z1', { innerPadding: 8 });
    const afterLen = ((useStore.getState() as any).analystProHistory.past as unknown[]).length;
    expect(afterLen).toBe(beforeLen);
  });

  it('accepts multi-key patches including nested background object', () => {
    useStore.getState().setZonePropertyAnalystPro('z1', {
      background: { color: '#112233', opacity: 0.5 },
      outerPadding: 4,
      showTitle: true,
    });
    const z = (useStore.getState().analystProDashboard as any).tiledRoot.children[0];
    expect(z.background).toEqual({ color: '#112233', opacity: 0.5 });
    expect(z.outerPadding).toBe(4);
    expect(z.showTitle).toBe(true);
  });

  it('undo restores prior zone state', () => {
    useStore.getState().setZonePropertyAnalystPro('z1', { innerPadding: 8 });
    useStore.getState().undoAnalystPro();
    const z = (useStore.getState().analystProDashboard as any).tiledRoot.children[0];
    expect(z.innerPadding).toBeUndefined();
  });
});
