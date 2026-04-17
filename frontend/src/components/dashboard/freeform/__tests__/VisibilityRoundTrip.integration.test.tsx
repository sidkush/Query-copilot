import { describe, it, expect } from 'vitest';

const dashboard = {
  schemaVersion: 'askdb/dashboard/v1',
  id: 'd1',
  name: 'Round Trip',
  archetype: 'analyst-pro',
  size: { mode: 'automatic' },
  tiledRoot: {
    id: 'root',
    type: 'container-vert',
    w: 100000,
    h: 100000,
    children: [
      {
        id: 'gated',
        type: 'blank',
        w: 100000,
        h: 100000,
        visibilityRule: { kind: 'parameterEquals', parameterId: 'p1', value: 'priority' },
      },
    ],
  },
  floatingLayer: [
    {
      id: 'f1',
      type: 'blank',
      w: 100,
      h: 100,
      floating: true,
      x: 0,
      y: 0,
      pxW: 100,
      pxH: 100,
      zIndex: 0,
      visibilityRule: { kind: 'hasActiveFilter', sheetId: 'sheet-1' },
    },
  ],
  worksheets: [],
  parameters: [],
  sets: [],
  actions: [],
};

describe('Visibility rule JSON round-trip', () => {
  it('survives JSON.stringify/parse without loss', () => {
    const round = JSON.parse(JSON.stringify(dashboard));
    expect(round.tiledRoot.children[0].visibilityRule).toEqual({
      kind: 'parameterEquals',
      parameterId: 'p1',
      value: 'priority',
    });
    expect(round.floatingLayer[0].visibilityRule).toEqual({
      kind: 'hasActiveFilter',
      sheetId: 'sheet-1',
    });
  });
});
