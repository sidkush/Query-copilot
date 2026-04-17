import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../../../../store';

function baseDash(name = 'v0') {
  return {
    schemaVersion: 'askdb/dashboard/v1',
    id: 'd1',
    name,
    archetype: 'analyst-pro',
    size: { mode: 'automatic' },
    tiledRoot: { id: 'root', type: 'container-vert', w: 100000, h: 100000, children: [] },
    floatingLayer: [],
    worksheets: [],
    parameters: [],
    sets: [],
    actions: [],
  };
}

describe('analyst pro history entry shape (Plan 6b T1)', () => {
  beforeEach(() => {
    useStore.setState({ analystProDashboard: null, analystProHistory: null } as any);
  });

  it('initAnalystProHistory seeds present with "Initial state" label and a timestamp', () => {
    const dash = baseDash('v0');
    const before = Date.now();
    useStore.getState().initAnalystProHistory(dash);
    const h = useStore.getState().analystProHistory!;
    expect(h.present.snapshot).toBe(dash);
    expect(h.present.operation).toBe('Initial state');
    expect(h.present.timestamp).toBeGreaterThanOrEqual(before);
    expect(h.past).toEqual([]);
    expect(h.future).toEqual([]);
    expect(h.maxEntries).toBe(500);
  });

  it('pushAnalystProHistory stores snapshot + operation + timestamp, pushes prior present onto past', () => {
    const d0 = baseDash('v0');
    const d1 = baseDash('v1');
    useStore.getState().initAnalystProHistory(d0);
    useStore.getState().pushAnalystProHistory(d1, 'Resize zone');
    const h = useStore.getState().analystProHistory!;
    expect(h.present.snapshot).toBe(d1);
    expect(h.present.operation).toBe('Resize zone');
    expect(h.past).toHaveLength(1);
    expect(h.past[0].snapshot).toBe(d0);
    expect(h.past[0].operation).toBe('Initial state');
    expect(h.future).toEqual([]);
  });

  it('pushAnalystProHistory defaults operation to "Edit dashboard" when omitted', () => {
    const d0 = baseDash('v0');
    const d1 = baseDash('v1');
    useStore.getState().initAnalystProHistory(d0);
    useStore.getState().pushAnalystProHistory(d1);
    expect(useStore.getState().analystProHistory!.present.operation).toBe('Edit dashboard');
  });

  it('undoAnalystPro restores prior dashboard + moves present entry onto future', () => {
    const d0 = baseDash('v0');
    const d1 = baseDash('v1');
    useStore.getState().initAnalystProHistory(d0);
    useStore.getState().pushAnalystProHistory(d1, 'Resize zone');
    useStore.getState().undoAnalystPro();
    const h = useStore.getState().analystProHistory!;
    expect(useStore.getState().analystProDashboard).toBe(d0);
    expect(h.present.snapshot).toBe(d0);
    expect(h.future).toHaveLength(1);
    expect(h.future[0].operation).toBe('Resize zone');
  });

  it('redoAnalystPro re-applies a future entry and keeps its operation label', () => {
    const d0 = baseDash('v0');
    const d1 = baseDash('v1');
    useStore.getState().initAnalystProHistory(d0);
    useStore.getState().pushAnalystProHistory(d1, 'Resize zone');
    useStore.getState().undoAnalystPro();
    useStore.getState().redoAnalystPro();
    const h = useStore.getState().analystProHistory!;
    expect(useStore.getState().analystProDashboard).toBe(d1);
    expect(h.present.snapshot).toBe(d1);
    expect(h.present.operation).toBe('Resize zone');
  });

  it('respects maxEntries cap on past', () => {
    const d0 = baseDash('v0');
    useStore.getState().initAnalystProHistory(d0);
    for (let i = 0; i < 600; i++) {
      useStore.getState().pushAnalystProHistory(baseDash(`v${i + 1}`), `op-${i}`);
    }
    expect(useStore.getState().analystProHistory!.past.length).toBe(500);
  });
});

describe('jumpToHistoryAnalystPro (Plan 6b T2)', () => {
  beforeEach(() => {
    useStore.setState({ analystProDashboard: null, analystProHistory: null } as any);
    const d0 = baseDash('v0');
    useStore.getState().initAnalystProHistory(d0);
    useStore.getState().pushAnalystProHistory(baseDash('v1'), 'op-1');
    useStore.getState().pushAnalystProHistory(baseDash('v2'), 'op-2');
    useStore.getState().pushAnalystProHistory(baseDash('v3'), 'op-3');
    // now: past = [v2(op-2), v1(op-1), v0(initial)], present = v3(op-3), future = []
  });

  it('jump to index 0 is equivalent to undo', () => {
    useStore.getState().jumpToHistoryAnalystPro(0);
    const h = useStore.getState().analystProHistory!;
    expect(h.present.snapshot.name).toBe('v2');
    expect(useStore.getState().analystProDashboard.name).toBe('v2');
    expect(h.past.map((e: any) => e.snapshot.name)).toEqual(['v1', 'v0']);
    expect(h.future.map((e: any) => e.snapshot.name)).toEqual(['v3']);
  });

  it('jump to index 2 reverts to the oldest entry (Initial state)', () => {
    useStore.getState().jumpToHistoryAnalystPro(2);
    const h = useStore.getState().analystProHistory!;
    expect(h.present.operation).toBe('Initial state');
    expect(h.present.snapshot.name).toBe('v0');
    expect(h.past).toEqual([]);
    // future preserves forward-walkable order: v1, v2, v3
    expect(h.future.map((e: any) => e.snapshot.name)).toEqual(['v1', 'v2', 'v3']);
  });

  it('redo after jump replays the next operation in order', () => {
    useStore.getState().jumpToHistoryAnalystPro(2);
    useStore.getState().redoAnalystPro();
    expect(useStore.getState().analystProDashboard.name).toBe('v1');
    expect(useStore.getState().analystProHistory!.present.operation).toBe('op-1');
  });

  it('out-of-range index is a no-op', () => {
    useStore.getState().jumpToHistoryAnalystPro(99);
    expect(useStore.getState().analystProHistory!.present.snapshot.name).toBe('v3');
    useStore.getState().jumpToHistoryAnalystPro(-1);
    expect(useStore.getState().analystProHistory!.present.snapshot.name).toBe('v3');
  });
});
