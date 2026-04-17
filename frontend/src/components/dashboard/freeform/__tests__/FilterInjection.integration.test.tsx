import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, waitFor } from '@testing-library/react';
import React from 'react';

import { useStore } from '../../../../store';
import { publish, _resetForTests } from '../lib/markEventBus';
import { useActionRuntime } from '../hooks/useActionRuntime';
import AnalystProWorksheetTile from '../AnalystProWorksheetTile';

vi.mock('../../../../api', () => ({
  api: { executeSQL: vi.fn() },
}));

import { api } from '../../../../api';

function Harness({ tile, sheetId }: { tile: any; sheetId: string }) {
  useActionRuntime();
  return <AnalystProWorksheetTile tile={tile} sheetId={sheetId} />;
}

const baseDashboard = {
  schemaVersion: 'askdb/dashboard/v1',
  id: 'd1', name: 'D', archetype: 'analyst-pro',
  size: { mode: 'automatic' },
  tiledRoot: { id: 'root', type: 'container-horz', w: 100000, h: 100000, children: [] },
  floatingLayer: [],
  worksheets: [],
  parameters: [], sets: [],
  actions: [
    {
      id: 'a1', kind: 'filter', name: 'F', enabled: true,
      sourceSheets: ['src'], trigger: 'select',
      targetSheets: ['w1'],
      fieldMapping: [{ source: 'Region', target: 'Region' }],
      clearBehavior: 'leave-filter',
    },
  ],
};

const tile = {
  id: 'w1',
  title: 'Sales by Region',
  sql: 'SELECT region, total FROM sales',
  question: 'q',
  columns: ['region', 'total'],
  rows: [['East', 10]],
};

describe('FilterInjection end-to-end', () => {
  beforeEach(() => {
    _resetForTests();
    (api.executeSQL as any).mockReset();
    useStore.setState({
      analystProDashboard: baseDashboard,
      analystProSheetFilters: {},
      analystProSheetHighlights: {},
      analystProActionCascadeToken: 0,
      analystProActiveCascadeTargets: {},
      activeConnId: 'c1',
    });
  });

  afterEach(() => {
    useStore.setState({
      analystProDashboard: null,
      analystProSheetFilters: {},
      analystProSheetHighlights: {},
    });
  });

  it('mark → cascade → store filter → AnalystProWorksheetTile re-queries with additional_filters', async () => {
    (api.executeSQL as any).mockResolvedValue({
      columns: ['region', 'total'],
      rows: [['West', 42]],
    });

    render(<Harness tile={tile} sheetId="w1" />);

    act(() => {
      publish({
        sourceSheetId: 'src',
        trigger: 'select',
        markData: { Region: 'West' },
        timestamp: Date.now(),
      });
    });

    await waitFor(() => {
      expect((api.executeSQL as any)).toHaveBeenCalledTimes(1);
    });

    const [sql, question, connId, originalSql, additionalFilters] =
      (api.executeSQL as any).mock.calls[0];
    expect(sql).toBe('SELECT region, total FROM sales');
    expect(question).toBe('q');
    expect(connId).toBe('c1');
    expect(originalSql).toBeNull();
    expect(additionalFilters).toEqual([
      { field: 'Region', op: 'eq', value: 'West' },
    ]);

    await waitFor(() => {
      expect(
        useStore.getState().analystProActiveCascadeTargets.w1,
      ).toBe('done');
    });
  });

  it('empty mark clears the slice and does not re-query', async () => {
    (api.executeSQL as any).mockResolvedValue({
      columns: ['region', 'total'],
      rows: [['West', 42]],
    });

    useStore.setState({
      analystProSheetFilters: {
        w1: [{ field: 'Region', op: 'eq', value: 'West' }],
      },
    });
    render(<Harness tile={tile} sheetId="w1" />);

    // Mount triggers one call because slice already populated.
    await waitFor(() => {
      expect((api.executeSQL as any)).toHaveBeenCalledTimes(1);
    });

    act(() => {
      publish({
        sourceSheetId: 'src',
        trigger: 'select',
        markData: {},
        timestamp: Date.now(),
      });
    });

    await waitFor(() => {
      expect(useStore.getState().analystProSheetFilters.w1).toBeUndefined();
    });

    expect((api.executeSQL as any)).toHaveBeenCalledTimes(1);
  });
});
