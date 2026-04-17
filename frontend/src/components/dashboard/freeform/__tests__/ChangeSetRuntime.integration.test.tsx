import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, waitFor } from '@testing-library/react';
import React from 'react';

import { useStore } from '../../../../store';
import { publish } from '../lib/markEventBus';
import { useActionRuntime } from '../hooks/useActionRuntime';
import AnalystProWorksheetTile from '../AnalystProWorksheetTile';

vi.mock('../../../../api', () => ({
  api: { executeSQL: vi.fn() },
}));

import { api } from '../../../../api';

const baseTile = {
  id: 'w1',
  title: 'Sales',
  sql: 'SELECT region, total FROM sales',
  question: 'q',
  columns: ['region', 'total'],
  rows: [['East', 10]],
};

function Harness({ sheetId }) {
  useActionRuntime();
  return <AnalystProWorksheetTile tile={baseTile} sheetId={sheetId} />;
}

const dashboardWithSetFilter = {
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
  actions: [
    // ChangeSet on src/select adds the moused-over Region to the set.
    {
      id: 'a1',
      kind: 'change-set',
      name: 'Add',
      enabled: true,
      sourceSheets: ['picker'],
      trigger: 'select',
      targetSetId: 's1',
      fieldMapping: [{ source: 'Region', target: 'Region' }],
      operation: 'add',
    },
    // Filter on fire/select applies the set members to worksheet w1 as IN(...).
    {
      id: 'a2',
      kind: 'filter',
      name: 'ApplySet',
      enabled: true,
      sourceSheets: ['fire'],
      trigger: 'select',
      targetSheets: ['w1'],
      fieldMapping: [{ setRef: 's1', target: 'Region' }],
      clearBehavior: 'leave-filter',
    },
  ],
};

describe('Plan 4b integration — changeSet → filter with setRef', () => {
  beforeEach(() => {
    api.executeSQL.mockReset();
    api.executeSQL.mockResolvedValue({ columns: ['region', 'total'], rows: [['East', 10]] });
    useStore.setState({
      analystProDashboard: dashboardWithSetFilter,
      analystProSheetFilters: {},
      analystProSheetHighlights: {},
      analystProActionCascadeToken: 0,
      analystProActiveCascadeTargets: {},
      activeConnId: 'c1',
      analystProHistory: { past: [], present: null, future: [], maxEntries: 500 },
    });
  });

  afterEach(() => {
    useStore.setState({
      analystProDashboard: null,
      analystProSheetFilters: {},
      analystProSheetHighlights: {},
    });
  });

  it('ChangeSet + Filter-with-setRef produce IN filter reflecting current set members', async () => {
    render(<Harness sheetId="w1" />);

    // Step 1 — ChangeSet action adds 'West' to the set.
    act(() => {
      publish({
        sourceSheetId: 'picker', trigger: 'select',
        markData: { Region: 'West' }, timestamp: Date.now(),
      });
    });

    const sets = useStore.getState().analystProDashboard.sets;
    expect(sets[0].members).toEqual(['East', 'West']);

    // Step 2 — Filter action fires, should write an in-filter to slice using current set members.
    act(() => {
      publish({
        sourceSheetId: 'fire', trigger: 'select',
        markData: {}, timestamp: Date.now(),
      });
    });

    const slice = useStore.getState().analystProSheetFilters.w1;
    expect(slice).toEqual([
      { field: 'Region', op: 'in', values: ['East', 'West'] },
    ]);

    // Step 3 — AnalystProWorksheetTile calls api.executeSQL with that payload.
    await waitFor(() => {
      expect(api.executeSQL).toHaveBeenCalledTimes(1);
    });
    const [sql, question, connId, originalSql, additionalFilters] =
      api.executeSQL.mock.calls[0];
    expect(sql).toBe('SELECT region, total FROM sales');
    expect(connId).toBe('c1');
    expect(originalSql).toBeNull();
    expect(additionalFilters).toEqual([
      { field: 'Region', op: 'in', values: ['East', 'West'] },
    ]);
  });

  it('Filter with setRef to unknown set emits no filter and clears the slice', async () => {
    useStore.setState({
      analystProDashboard: {
        ...dashboardWithSetFilter,
        sets: [], // drop the set entirely
      },
    });
    render(<Harness sheetId="w1" />);

    act(() => {
      publish({
        sourceSheetId: 'fire', trigger: 'select',
        markData: {}, timestamp: Date.now(),
      });
    });

    expect(useStore.getState().analystProSheetFilters.w1).toBeUndefined();
  });
});
