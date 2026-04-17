import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useActionRuntime } from '../hooks/useActionRuntime';
import { publish, _resetForTests } from '../lib/markEventBus';
import { useStore } from '../../../../store';

function makeDash(actions) {
  return {
    schemaVersion: 'askdb/dashboard/v1',
    id: 'd', name: 'T', archetype: 'analyst-pro',
    size: { mode: 'automatic' },
    tiledRoot: { id: 'root', type: 'container-horz', w: 100000, h: 100000, children: [] },
    floatingLayer: [],
    worksheets: [], parameters: [], sets: [],
    actions: actions || [],
  };
}

describe('useActionRuntime', () => {
  beforeEach(() => {
    _resetForTests();
    useStore.setState({
      analystProDashboard: makeDash(),
      analystProActionCascadeToken: 0,
      analystProActiveCascadeTargets: {},
    });
  });

  it('subscribes on mount and unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => useActionRuntime());
    // Dashboard has no actions → publish should be a no-op (no error)
    publish({ sourceSheetId: 'a', trigger: 'select', markData: {}, timestamp: 0 });
    expect(useStore.getState().analystProActionCascadeToken).toBe(0);
    unmount();
    // After unmount, publish should be fully no-op (listener removed)
    publish({ sourceSheetId: 'a', trigger: 'select', markData: {}, timestamp: 0 });
    expect(useStore.getState().analystProActionCascadeToken).toBe(0);
  });

  it('no-op when dashboard has no actions', () => {
    renderHook(() => useActionRuntime());
    publish({ sourceSheetId: 'a', trigger: 'select', markData: {}, timestamp: 0 });
    expect(useStore.getState().analystProActionCascadeToken).toBe(0);
  });

  it('bumps cascade token and marks targets when action matches', async () => {
    useStore.setState({
      analystProDashboard: makeDash([
        {
          id: 'act1', name: 'Test Filter', kind: 'filter',
          sourceSheets: ['a'], trigger: 'select',
          targetSheets: ['b', 'c'],
          fieldMapping: [{ source: 'Week', target: 'Week' }],
          clearBehavior: 'show-all',
        },
      ]),
    });
    renderHook(() => useActionRuntime());
    publish({ sourceSheetId: 'a', trigger: 'select', markData: { Week: 'W12' }, timestamp: 1 });
    const state = useStore.getState();
    expect(state.analystProActionCascadeToken).toBe(1);
    // Targets initially pending (microtask hasn't run yet)
    expect(state.analystProActiveCascadeTargets.b).toBe('pending');
    // Flush microtasks
    await Promise.resolve();
    const after = useStore.getState();
    expect(after.analystProActiveCascadeTargets.b).toBe('done');
    expect(after.analystProActiveCascadeTargets.c).toBe('done');
  });

  it('stale cascade token is ignored by markCascadeTargetStatus', () => {
    renderHook(() => useActionRuntime());
    useStore.setState({ analystProActionCascadeToken: 5 });
    const before = useStore.getState().analystProActiveCascadeTargets;
    useStore.getState().markCascadeTargetStatus('b', 'done', 1); // stale token
    const after = useStore.getState().analystProActiveCascadeTargets;
    expect(after).toEqual(before); // unchanged
  });
});
