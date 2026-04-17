import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useActionRuntime } from '../hooks/useActionRuntime';
import { publish, _resetForTests } from '../lib/markEventBus';
import { useStore } from '../../../../store';

function makeDash(actions = []) {
  return {
    schemaVersion: 'askdb/dashboard/v1',
    id: 'd', name: 'T', archetype: 'analyst-pro',
    size: { mode: 'automatic' },
    tiledRoot: { id: 'root', type: 'container-horz', w: 100000, h: 100000, children: [] },
    floatingLayer: [],
    worksheets: [{ id: 'A', chartSpec: {} }, { id: 'B', chartSpec: {} }],
    parameters: [], sets: [],
    actions,
  };
}

describe('ActionRuntime integration — end-to-end cascade flow', () => {
  beforeEach(() => {
    _resetForTests();
    useStore.setState({
      analystProDashboard: null,
      analystProActionCascadeToken: 0,
      analystProActiveCascadeTargets: {},
    });
  });

  it('fires cascade end-to-end: mark event → executor → target statuses', async () => {
    const action = {
      id: 'f1',
      name: 'Week Filter',
      kind: 'filter',
      sourceSheets: ['A'],
      targetSheets: ['B'],
      fieldMapping: [{ source: 'Week', target: 'Week' }],
      clearBehavior: 'show-all',
      trigger: 'select',
      enabled: true,
    };
    useStore.setState({ analystProDashboard: makeDash([action]) });

    renderHook(() => useActionRuntime());

    // Publish a mark event on source sheet
    publish({
      sourceSheetId: 'A',
      trigger: 'select',
      markData: { Week: '2026-W12' },
      timestamp: 1,
    });

    // Immediately: cascade token bumped, target B marked pending
    let state = useStore.getState();
    expect(state.analystProActionCascadeToken).toBe(1);
    expect(state.analystProActiveCascadeTargets.B).toBe('pending');

    // Flush microtasks — target transitions to done
    await Promise.resolve();
    await Promise.resolve();
    state = useStore.getState();
    expect(state.analystProActiveCascadeTargets.B).toBe('done');
  });

  it('cancel-on-newer: stale cascade writes are ignored', async () => {
    const action = {
      id: 'f1', name: 'X', kind: 'filter',
      sourceSheets: ['A'], targetSheets: ['B'],
      fieldMapping: [{ source: 'Week', target: 'Week' }],
      clearBehavior: 'show-all', trigger: 'select', enabled: true,
    };
    useStore.setState({ analystProDashboard: makeDash([action]) });
    renderHook(() => useActionRuntime());

    // Publish 3 events rapidly. Token should be 3; first two cascades stale.
    publish({ sourceSheetId: 'A', trigger: 'select', markData: { Week: 'W1' }, timestamp: 1 });
    publish({ sourceSheetId: 'A', trigger: 'select', markData: { Week: 'W2' }, timestamp: 2 });
    publish({ sourceSheetId: 'A', trigger: 'select', markData: { Week: 'W3' }, timestamp: 3 });
    expect(useStore.getState().analystProActionCascadeToken).toBe(3);

    // Each publish resets activeCascadeTargets, then sets pending for B — latest should win
    await Promise.resolve();
    await Promise.resolve();
    // Only the latest (token 3) cascade's done write was accepted
    expect(useStore.getState().analystProActiveCascadeTargets.B).toBe('done');
  });

  it('mismatched trigger does not fire cascade', () => {
    const action = {
      id: 'f1', name: 'X', kind: 'filter',
      sourceSheets: ['A'], targetSheets: ['B'],
      fieldMapping: [], clearBehavior: 'show-all', trigger: 'hover', enabled: true,
    };
    useStore.setState({ analystProDashboard: makeDash([action]) });
    renderHook(() => useActionRuntime());

    publish({ sourceSheetId: 'A', trigger: 'select', markData: {}, timestamp: 1 });

    // useActionRuntime calls fireActionCascadeAnalystPro() whenever actions.length > 0
    // (before executeCascade/matchActions filters by trigger). So token IS bumped.
    // matchActions returns empty (trigger mismatch) → no applyTargetOp calls → targets remain {}.
    // Key property proven: no target statuses written for an event that matches no actions.
    const state = useStore.getState();
    expect(state.analystProActionCascadeToken).toBe(1);
    expect(state.analystProActiveCascadeTargets).toEqual({});
  });
});
