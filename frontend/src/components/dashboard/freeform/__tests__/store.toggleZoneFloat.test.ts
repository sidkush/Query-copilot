import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../../../../store';

function fixedDash(extra: Partial<any> = {}) {
  return {
    schemaVersion: 'askdb/dashboard/v1',
    id: 'd1',
    name: 'T',
    archetype: 'analyst-pro',
    size: { mode: 'fixed', width: 1000, height: 600, preset: 'custom' },
    tiledRoot: {
      id: 'root',
      type: 'container-vert',
      w: 100000,
      h: 100000,
      children: [
        { id: 'z1', type: 'worksheet', w: 100000, h: 50000, worksheetRef: 'ws1' },
        { id: 'z2', type: 'worksheet', w: 100000, h: 50000, worksheetRef: 'ws2' },
      ],
    },
    floatingLayer: [],
    worksheets: [],
    parameters: [],
    sets: [],
    actions: [],
    ...extra,
  };
}

function reset() {
  useStore.setState({
    analystProDashboard: null,
    analystProSelection: new Set(),
    analystProHistory: null,
  });
}

describe('toggleZoneFloatAnalystPro', () => {
  beforeEach(reset);

  it('tiled -> floating: removes from tree, adds to floatingLayer with resolved pixel rect', () => {
    const dash = fixedDash();
    useStore.setState({ analystProDashboard: dash });
    useStore.getState().initAnalystProHistory(dash);

    useStore.getState().toggleZoneFloatAnalystPro('z1');

    const next = useStore.getState().analystProDashboard;
    expect(next.tiledRoot.children.map((c: any) => c.id)).toEqual(['z2']);
    expect(next.floatingLayer).toHaveLength(1);
    const f = next.floatingLayer[0];
    expect(f.id).toBe('z1');
    expect(f.floating).toBe(true);
    expect(f.type).toBe('worksheet');
    expect(f.worksheetRef).toBe('ws1');
    expect(f.x).toBe(0);
    expect(f.y).toBe(0);
    expect(f.pxW).toBe(1000);
    expect(f.pxH).toBe(300);
    expect(typeof f.zIndex).toBe('number');
  });

  it('floating -> tiled: inserts as last child of tiledRoot, strips floating fields', () => {
    const dash = fixedDash({
      floatingLayer: [
        {
          id: 'f1',
          type: 'legend',
          floating: true,
          x: 200,
          y: 200,
          pxW: 300,
          pxH: 200,
          zIndex: 1,
          w: 0,
          h: 0,
        },
      ],
    });
    useStore.setState({ analystProDashboard: dash });
    useStore.getState().initAnalystProHistory(dash);

    useStore.getState().toggleZoneFloatAnalystPro('f1');
    const next = useStore.getState().analystProDashboard;

    expect(next.floatingLayer).toHaveLength(0);
    const ids = next.tiledRoot.children.map((c: any) => c.id);
    expect(ids[ids.length - 1]).toBe('f1');
    const z = next.tiledRoot.children.find((c: any) => c.id === 'f1');
    expect(z.floating).toBeUndefined();
    expect(z.x).toBeUndefined();
    expect(z.pxW).toBeUndefined();
    expect(z.zIndex).toBeUndefined();
    expect(z.type).toBe('legend');
  });

  it('floating -> tiled honours explicit targetContainerId', () => {
    const dash = fixedDash({
      tiledRoot: {
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
            children: [{ id: 'x', type: 'blank', w: 100000, h: 100000 }],
          },
        ],
      },
      floatingLayer: [
        { id: 'f1', type: 'text', floating: true, x: 0, y: 0, pxW: 100, pxH: 100, zIndex: 1, w: 0, h: 0 },
      ],
    });
    useStore.setState({ analystProDashboard: dash });
    useStore.getState().initAnalystProHistory(dash);

    useStore.getState().toggleZoneFloatAnalystPro('f1', 'inner');
    const next = useStore.getState().analystProDashboard;
    const innerIds = next.tiledRoot.children[0].children.map((c: any) => c.id);
    expect(innerIds).toContain('f1');
  });

  it('pushes a history entry on every successful toggle', () => {
    const dash = fixedDash();
    useStore.setState({ analystProDashboard: dash });
    useStore.getState().initAnalystProHistory(dash);
    const pastBefore = useStore.getState().analystProHistory.past.length;
    useStore.getState().toggleZoneFloatAnalystPro('z1');
    const pastAfter = useStore.getState().analystProHistory.past.length;
    expect(pastAfter).toBe(pastBefore + 1);
  });

  it('no-ops (no history push) when zone id is unknown', () => {
    const dash = fixedDash();
    useStore.setState({ analystProDashboard: dash });
    useStore.getState().initAnalystProHistory(dash);
    const pastBefore = useStore.getState().analystProHistory.past.length;
    useStore.getState().toggleZoneFloatAnalystPro('nope');
    expect(useStore.getState().analystProDashboard).toBe(dash);
    expect(useStore.getState().analystProHistory.past.length).toBe(pastBefore);
  });
});
