import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../../../../store';

function baseDash() {
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
      children: [{ id: 'z1', type: 'worksheet', worksheetRef: 'sheet-a', w: 100000, h: 100000 }],
    },
    floatingLayer: [
      { id: 'f1', type: 'blank', w: 0, h: 0, floating: true, x: 10, y: 20, pxW: 300, pxH: 200, zIndex: 1 },
    ],
    worksheets: [],
    parameters: [{ id: 'p1', name: 'Year', type: 'int', value: 2024, domain: { kind: 'free' } }],
    sets: [{ id: 's1', name: 'Top', members: [] }],
    actions: [],
  };
}

function seed() {
  const dash = baseDash();
  useStore.setState({ analystProDashboard: dash, analystProSelection: new Set() } as any);
  useStore.getState().initAnalystProHistory(dash);
}

describe('operation labels (Plan 6b T3)', () => {
  beforeEach(seed);

  const cases: Array<[string, () => void, string]> = [
    ['addActionAnalystPro', () => useStore.getState().addActionAnalystPro({ id: 'a1', name: 'A' }), 'Add action'],
    ['addSetAnalystPro', () => useStore.getState().addSetAnalystPro({ id: 's2', name: 'New', members: [] }), 'Add set'],
    ['addParameterAnalystPro', () => useStore.getState().addParameterAnalystPro({ id: 'p2', name: 'Q', type: 'int', value: 0, domain: { kind: 'free' } }), 'Add parameter'],
    ['setParameterValueAnalystPro', () => useStore.getState().setParameterValueAnalystPro('p1', 2025), 'Change parameter value'],
    ['setZonePropertyAnalystPro', () => useStore.getState().setZonePropertyAnalystPro('z1', { innerPadding: 8 }), 'Change zone property'],
    ['updateZoneAnalystPro', () => useStore.getState().updateZoneAnalystPro('z1', { displayName: 'X' }), 'Update zone'],
    ['toggleLockAnalystPro (floating)', () => useStore.getState().toggleLockAnalystPro('f1'), 'Toggle zone lock'],
    ['insertObjectAnalystPro', () => useStore.getState().insertObjectAnalystPro({ type: 'blank', x: 0, y: 0 }), 'Insert object'],
  ];

  for (const [name, fire, expected] of cases) {
    it(`${name} pushes with operation "${expected}"`, () => {
      fire();
      expect(useStore.getState().analystProHistory!.present.operation).toBe(expected);
    });
  }

  it('operation labels survive undo + redo round trip', () => {
    useStore.getState().setZonePropertyAnalystPro('z1', { innerPadding: 8 });
    expect(useStore.getState().analystProHistory!.present.operation).toBe('Change zone property');
    useStore.getState().undoAnalystPro();
    expect(useStore.getState().analystProHistory!.future[0].operation).toBe('Change zone property');
    useStore.getState().redoAnalystPro();
    expect(useStore.getState().analystProHistory!.present.operation).toBe('Change zone property');
  });
});
