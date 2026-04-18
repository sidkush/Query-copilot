import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../../../../store';

function makeDash(containerChildren: any[]) {
  return {
    schemaVersion: 'askdb/dashboard/v1',
    id: 'd1',
    name: 'Test',
    archetype: 'analyst-pro',
    size: { mode: 'fixed', width: 1000, height: 600, preset: 'custom' },
    tiledRoot: {
      id: 'root',
      type: 'container-horz',
      w: 100000,
      h: 100000,
      children: containerChildren,
    },
    floatingLayer: [],
    worksheets: [],
    parameters: [],
    sets: [],
    actions: [],
  };
}

function reset() {
  useStore.setState({
    analystProDashboard: null,
    analystProSelection: new Set(),
    analystProHistory: null,
  });
}

describe('distributeEvenlyAnalystPro', () => {
  beforeEach(reset);

  it('sets every child of the target container to 100000 / n on the axis', () => {
    const dash = makeDash([
      { id: 'a', type: 'blank', w: 20000, h: 100000 },
      { id: 'b', type: 'blank', w: 30000, h: 100000 },
      { id: 'c', type: 'blank', w: 50000, h: 100000 },
    ]);
    useStore.setState({ analystProDashboard: dash });
    useStore.getState().initAnalystProHistory(dash);
    useStore.getState().distributeEvenlyAnalystPro('root');
    const next = useStore.getState().analystProDashboard;
    expect(next.tiledRoot.children.map((c: any) => c.w)).toEqual([33333, 33333, 33334]);
  });

  it('no-ops (no history push) when target container has < 2 children', () => {
    const dash = makeDash([{ id: 'a', type: 'blank', w: 100000, h: 100000 }]);
    useStore.setState({ analystProDashboard: dash });
    useStore.getState().initAnalystProHistory(dash);
    const pastBefore = useStore.getState().analystProHistory.past.length;
    useStore.getState().distributeEvenlyAnalystPro('root');
    expect(useStore.getState().analystProDashboard).toBe(dash);
    expect(useStore.getState().analystProHistory.past.length).toBe(pastBefore);
  });
});

describe('fitContainerToContentAnalystPro', () => {
  beforeEach(reset);

  it('writes sizeOverride on the container from measured direct children', () => {
    const dash = makeDash([
      { id: 'a', type: 'blank', w: 50000, h: 100000 },
      { id: 'b', type: 'blank', w: 50000, h: 100000 },
    ]);
    useStore.setState({ analystProDashboard: dash });
    useStore.getState().initAnalystProHistory(dash);

    const host = document.createElement('div');
    host.setAttribute('data-testid', 'analyst-pro-canvas-root');
    const elA = document.createElement('div');
    elA.setAttribute('data-zone-id', 'a');
    const elB = document.createElement('div');
    elB.setAttribute('data-zone-id', 'b');
    host.appendChild(elA);
    host.appendChild(elB);
    document.body.appendChild(host);
    elA.getBoundingClientRect = () => ({ width: 200, height: 120 } as DOMRect);
    elB.getBoundingClientRect = () => ({ width: 180, height: 150 } as DOMRect);

    useStore.getState().fitContainerToContentAnalystPro('root');
    const next = useStore.getState().analystProDashboard;
    expect(next.tiledRoot.sizeOverride).toEqual({ pxW: 380, pxH: 150 });
    host.remove();
  });

  it('no-ops when container id is not found', () => {
    const dash = makeDash([{ id: 'a', type: 'blank', w: 100000, h: 100000 }]);
    useStore.setState({ analystProDashboard: dash });
    useStore.getState().initAnalystProHistory(dash);
    useStore.getState().fitContainerToContentAnalystPro('nope');
    expect(useStore.getState().analystProDashboard).toBe(dash);
  });
});

describe('removeContainerAnalystPro', () => {
  beforeEach(reset);

  it('unwraps the selected container and collapses selection to grandparent', () => {
    const dash = makeDash([
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
    ]);
    useStore.setState({
      analystProDashboard: dash,
      analystProSelection: new Set(['inner']),
    });
    useStore.getState().initAnalystProHistory(dash);
    useStore.getState().removeContainerAnalystPro('inner');
    const next = useStore.getState().analystProDashboard;
    expect(next.tiledRoot.children.map((c: any) => c.id)).toEqual(['x', 'y']);
    expect([...useStore.getState().analystProSelection]).toEqual(['root']);
  });

  it('no-ops on root (returns identity)', () => {
    const dash = makeDash([{ id: 'a', type: 'blank', w: 100000, h: 100000 }]);
    useStore.setState({ analystProDashboard: dash });
    useStore.getState().initAnalystProHistory(dash);
    useStore.getState().removeContainerAnalystPro('root');
    expect(useStore.getState().analystProDashboard).toBe(dash);
  });
});
