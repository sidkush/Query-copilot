/**
 * Plan 3 T9 — actions store round-trip tests.
 *
 * Verifies that addActionAnalystPro / updateActionAnalystPro /
 * deleteActionAnalystPro correctly mutate analystProDashboard.actions
 * so the field survives a save → reload cycle via Zustand.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../../../../store';

function makeEmptyDash() {
  return {
    schemaVersion: 'askdb/dashboard/v1',
    id: 'd',
    name: 'T',
    archetype: 'analyst-pro',
    size: { mode: 'automatic' },
    tiledRoot: { id: 'root', type: 'container-horz', w: 100000, h: 100000, children: [] },
    floatingLayer: [],
    worksheets: [],
    parameters: [],
    sets: [],
    actions: [],
  };
}

describe('actions store roundtrip', () => {
  beforeEach(() => {
    useStore.setState({ analystProDashboard: makeEmptyDash() });
  });

  it('addActionAnalystPro adds to dashboard.actions', () => {
    useStore.getState().addActionAnalystPro({
      id: 'act1',
      name: 'F',
      kind: 'filter',
      sourceSheets: ['a'],
      targetSheets: ['b'],
      fieldMapping: [],
      clearBehavior: 'show-all',
      trigger: 'select',
    });
    const actions = useStore.getState().analystProDashboard?.actions ?? [];
    expect(actions).toHaveLength(1);
    expect(actions[0].name).toBe('F');
    expect(actions[0].id).toBe('act1');
  });

  it('updateActionAnalystPro patches action in place', () => {
    useStore.getState().addActionAnalystPro({
      id: 'x',
      name: 'old',
      kind: 'filter',
      sourceSheets: [],
      targetSheets: [],
      fieldMapping: [],
      clearBehavior: 'show-all',
      trigger: 'select',
    });
    useStore.getState().updateActionAnalystPro('x', { name: 'new' });
    const actions = useStore.getState().analystProDashboard?.actions ?? [];
    expect(actions).toHaveLength(1);
    expect(actions[0].name).toBe('new');
    // Other fields must survive the patch
    expect(actions[0].id).toBe('x');
    expect(actions[0].kind).toBe('filter');
  });

  it('deleteActionAnalystPro removes action', () => {
    useStore.getState().addActionAnalystPro({
      id: 'x',
      name: 'doomed',
      kind: 'filter',
      sourceSheets: [],
      targetSheets: [],
      fieldMapping: [],
      clearBehavior: 'show-all',
      trigger: 'select',
    });
    useStore.getState().deleteActionAnalystPro('x');
    expect(useStore.getState().analystProDashboard?.actions).toHaveLength(0);
  });

  it('multiple add calls all persist in order', () => {
    for (const id of ['a1', 'a2', 'a3']) {
      useStore.getState().addActionAnalystPro({
        id,
        name: `Action ${id}`,
        kind: 'filter',
        sourceSheets: [],
        targetSheets: [],
        fieldMapping: [],
        clearBehavior: 'show-all',
        trigger: 'select',
      });
    }
    const actions = useStore.getState().analystProDashboard?.actions ?? [];
    expect(actions).toHaveLength(3);
    expect(actions.map((a: { id: string }) => a.id)).toEqual(['a1', 'a2', 'a3']);
  });

  it('updateActionAnalystPro on unknown id is a no-op (no crash)', () => {
    useStore.getState().addActionAnalystPro({
      id: 'real',
      name: 'real',
      kind: 'filter',
      sourceSheets: [],
      targetSheets: [],
      fieldMapping: [],
      clearBehavior: 'show-all',
      trigger: 'select',
    });
    // patching a non-existent id should not crash and should leave existing action intact
    useStore.getState().updateActionAnalystPro('ghost', { name: 'mutated' });
    const actions = useStore.getState().analystProDashboard?.actions ?? [];
    expect(actions).toHaveLength(1);
    expect(actions[0].name).toBe('real');
  });
});
