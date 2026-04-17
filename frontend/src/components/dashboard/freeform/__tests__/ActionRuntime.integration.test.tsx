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
      analystProSheetFilters: {},
      analystProSheetHighlights: {},
    });
  });

  it('fires filter cascade: mark event → slice write + pending status', () => {
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

    publish({
      sourceSheetId: 'A',
      trigger: 'select',
      markData: { Week: '2026-W12' },
      timestamp: 1,
    });

    const state = useStore.getState();
    expect(state.analystProActionCascadeToken).toBe(1);
    expect(state.analystProActiveCascadeTargets.B).toBe('pending');
    // Plan 4a: slice now holds the filter; AnalystProWorksheetTile (T8) marks 'done'.
    expect(state.analystProSheetFilters.B).toEqual([
      { field: 'Week', op: 'eq', value: '2026-W12' },
    ]);
  });

  it('cancel-on-newer: latest cascade token wins for slice writes', () => {
    const action = {
      id: 'f1', name: 'X', kind: 'filter',
      sourceSheets: ['A'], targetSheets: ['B'],
      fieldMapping: [{ source: 'Week', target: 'Week' }],
      clearBehavior: 'show-all', trigger: 'select', enabled: true,
    };
    useStore.setState({ analystProDashboard: makeDash([action]) });
    renderHook(() => useActionRuntime());

    publish({ sourceSheetId: 'A', trigger: 'select', markData: { Week: 'W1' }, timestamp: 1 });
    publish({ sourceSheetId: 'A', trigger: 'select', markData: { Week: 'W2' }, timestamp: 2 });
    publish({ sourceSheetId: 'A', trigger: 'select', markData: { Week: 'W3' }, timestamp: 3 });

    const state = useStore.getState();
    expect(state.analystProActionCascadeToken).toBe(3);
    expect(state.analystProSheetFilters.B).toEqual([
      { field: 'Week', op: 'eq', value: 'W3' },
    ]);
    expect(state.analystProActiveCascadeTargets.B).toBe('pending');
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

    const state = useStore.getState();
    expect(state.analystProActionCascadeToken).toBe(1);
    expect(state.analystProActiveCascadeTargets).toEqual({});
    expect(state.analystProSheetFilters).toEqual({});
  });

  // ─── Plan 4a T7 additions ───────────────────────────────────────

  it('filter TargetOp with empty mark clears the slice (show-all)', () => {
    useStore.setState({
      analystProSheetFilters: {
        B: [{ field: 'Week', op: 'eq', value: 'W1' }],
      },
      analystProDashboard: makeDash([
        {
          id: 'f1', name: 'X', kind: 'filter',
          sourceSheets: ['A'], targetSheets: ['B'],
          fieldMapping: [{ source: 'Week', target: 'Week' }],
          clearBehavior: 'show-all', trigger: 'select', enabled: true,
        },
      ]),
    });
    renderHook(() => useActionRuntime());

    // markData has no 'Week' → resolved filters empty → slice cleared
    publish({ sourceSheetId: 'A', trigger: 'select', markData: {}, timestamp: 1 });

    expect(useStore.getState().analystProSheetFilters.B).toBeUndefined();
  });

  it('highlight TargetOp writes analystProSheetHighlights entry', () => {
    useStore.setState({
      analystProDashboard: makeDash([
        {
          id: 'h1', name: 'H', kind: 'highlight',
          sourceSheets: ['A'], targetSheets: ['B'],
          fieldMapping: [{ source: 'Region', target: 'Region' }],
          trigger: 'hover', enabled: true,
        },
      ]),
    });
    renderHook(() => useActionRuntime());

    publish({
      sourceSheetId: 'A',
      trigger: 'hover',
      markData: { Region: 'East' },
      timestamp: 1,
    });

    expect(useStore.getState().analystProSheetHighlights.B).toEqual({ Region: 'East' });
    expect(useStore.getState().analystProActiveCascadeTargets.B).toBe('done');
  });

  it('highlight TargetOp with empty mark clears highlight slice', () => {
    useStore.setState({
      analystProSheetHighlights: { B: { Region: 'East' } },
      analystProDashboard: makeDash([
        {
          id: 'h1', name: 'H', kind: 'highlight',
          sourceSheets: ['A'], targetSheets: ['B'],
          fieldMapping: [{ source: 'Region', target: 'Region' }],
          trigger: 'hover', enabled: true,
        },
      ]),
    });
    renderHook(() => useActionRuntime());

    publish({ sourceSheetId: 'A', trigger: 'hover', markData: {}, timestamp: 1 });

    expect(useStore.getState().analystProSheetHighlights.B).toBeUndefined();
  });

  // ─── Plan 4b T7 additions ───────────────────────────────────────

  it('change-set add mode calls applySetChangeAnalystPro and updates the set', () => {
    useStore.setState({
      analystProDashboard: {
        id: 'd1',
        archetype: 'analyst-pro',
        size: { mode: 'automatic' },
        tiledRoot: { id: 'r', type: 'container-horz', w: 100000, h: 100000, children: [] },
        floatingLayer: [],
        worksheets: [],
        parameters: [],
        sets: [{
          id: 's1',
          name: 'Regions',
          dimension: 'Region',
          members: ['East'],
          createdAt: '2026-04-16T00:00:00Z',
        }],
        actions: [{
          id: 'a1',
          kind: 'change-set',
          name: 'AddRegion',
          enabled: true,
          sourceSheets: ['src'],
          trigger: 'select',
          targetSetId: 's1',
          fieldMapping: [{ source: 'Region', target: 'Region' }],
          operation: 'add',
        }],
      },
    });

    renderHook(() => useActionRuntime());
    publish({
      sourceSheetId: 'src',
      trigger: 'select',
      markData: { Region: 'West' },
      timestamp: Date.now(),
    });

    const sets = useStore.getState().analystProDashboard.sets;
    expect(sets[0].members).toEqual(['East', 'West']);
  });

  it('change-set toggle mode adds when missing, removes when present', () => {
    // Missing member -> add
    useStore.setState({
      analystProDashboard: {
        id: 'd1',
        archetype: 'analyst-pro',
        size: { mode: 'automatic' },
        tiledRoot: { id: 'r', type: 'container-horz', w: 100000, h: 100000, children: [] },
        floatingLayer: [],
        worksheets: [],
        parameters: [],
        sets: [{
          id: 's1', name: 'Regions', dimension: 'Region',
          members: ['East'], createdAt: '2026-04-16T00:00:00Z',
        }],
        actions: [{
          id: 'a1', kind: 'change-set', name: 'Toggle',
          enabled: true, sourceSheets: ['src'], trigger: 'select',
          targetSetId: 's1',
          fieldMapping: [{ source: 'Region', target: 'Region' }],
          operation: 'toggle',
        }],
      },
    });

    renderHook(() => useActionRuntime());
    publish({
      sourceSheetId: 'src', trigger: 'select',
      markData: { Region: 'West' }, timestamp: Date.now(),
    });
    expect(useStore.getState().analystProDashboard.sets[0].members).toEqual(['East', 'West']);

    // Present member -> remove
    publish({
      sourceSheetId: 'src', trigger: 'select',
      markData: { Region: 'East' }, timestamp: Date.now(),
    });
    expect(useStore.getState().analystProDashboard.sets[0].members).toEqual(['West']);
  });
});
