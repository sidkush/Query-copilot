import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, act, waitFor, screen } from '@testing-library/react';
import React from 'react';

import { useStore } from '../../../../store';
import { publish } from '../lib/markEventBus';
import { useActionRuntime } from '../hooks/useActionRuntime';
import AnalystProWorksheetTile from '../AnalystProWorksheetTile';
import ParametersPanel from '../panels/ParametersPanel';

vi.mock('../../../../api', () => ({
  api: { executeSQL: vi.fn() },
}));

import { api } from '../../../../api';

function Harness({ tile, sheetId }) {
  useActionRuntime();
  return (
    <>
      <ParametersPanel />
      <AnalystProWorksheetTile tile={tile} sheetId={sheetId} />
    </>
  );
}

const baseDashboard = {
  id: 'd1',
  archetype: 'analyst-pro',
  size: { mode: 'automatic' },
  tiledRoot: { id: 'r', type: 'container-horz', w: 100000, h: 100000, children: [] },
  floatingLayer: [],
  worksheets: [],
  sets: [],
  parameters: [{
    id: 'p1',
    name: 'region',
    type: 'string',
    value: 'East',
    domain: { kind: 'list', values: ['East', 'West', 'North'] },
    createdAt: '2026-04-16T00:00:00Z',
  }],
  actions: [{
    id: 'a1',
    kind: 'change-parameter',
    name: 'PickRegion',
    enabled: true,
    sourceSheets: ['src'],
    trigger: 'select',
    targetParameterId: 'p1',
    fieldMapping: [{ source: 'Region', target: 'region' }],
  }],
};

const tile = {
  id: 'w1',
  title: 'Sales by Region',
  sql: 'SELECT region, total FROM sales WHERE region = {{region}}',
  question: 'q',
  columns: ['region', 'total'],
  rows: [['East', 10]],
};

describe('ParametersEndToEnd integration', () => {
  beforeEach(() => {
    api.executeSQL.mockReset();
    api.executeSQL.mockResolvedValue({
      columns: ['region', 'total'],
      rows: [['West', 42]],
    });
    useStore.setState({
      analystProDashboard: baseDashboard,
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

  it('widget change → tile re-queries with parameters body', async () => {
    render(<Harness tile={tile} sheetId="w1" />);

    const select = screen.getByRole('combobox', { name: /region/i });
    fireEvent.change(select, { target: { value: 'West' } });

    await waitFor(() => {
      expect(api.executeSQL).toHaveBeenCalled();
    });

    const lastCall = api.executeSQL.mock.calls[api.executeSQL.mock.calls.length - 1];
    const [sql, question, connId, originalSql, additionalFilters, parameters] = lastCall;
    expect(sql).toBe('SELECT region, total FROM sales WHERE region = {{region}}');
    expect(question).toBe('q');
    expect(connId).toBe('c1');
    expect(originalSql).toBeNull();
    expect(additionalFilters).toBeNull();
    expect(Array.isArray(parameters)).toBe(true);
    const regionParam = parameters.find((p) => p.name === 'region');
    expect(regionParam.value).toBe('West');
  });

  it('ChangeParameterAction via mark click → parameter updates → tile re-queries', async () => {
    render(<Harness tile={tile} sheetId="w1" />);

    act(() => {
      publish({
        sourceSheetId: 'src',
        trigger: 'select',
        markData: { Region: 'North' },
        timestamp: Date.now(),
      });
    });

    await waitFor(() => {
      const params = useStore.getState().analystProDashboard.parameters;
      expect(params[0].value).toBe('North');
    });

    await waitFor(() => {
      const last = api.executeSQL.mock.calls[api.executeSQL.mock.calls.length - 1];
      const parameters = last[5];
      const regionParam = parameters.find((p) => p.name === 'region');
      expect(regionParam.value).toBe('North');
    });
  });
});
