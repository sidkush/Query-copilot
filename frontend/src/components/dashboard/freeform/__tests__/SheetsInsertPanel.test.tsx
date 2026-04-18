import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SheetsInsertPanel from '../panels/SheetsInsertPanel';
import { useStore } from '../../../../store';

describe('Plan 6c — SheetsInsertPanel', () => {
  beforeEach(() => {
    useStore.setState({
      analystProDashboard: {
        schemaVersion: 'askdb/dashboard/v1',
        id: 'd1', name: 'X', archetype: 'analyst-pro',
        size: { mode: 'automatic' },
        tiledRoot: { id: 'root', type: 'container-vert', w: 100000, h: 100000, children: [] },
        floatingLayer: [],
        worksheets: [
          { id: 'sales_by_region', chartSpec: {} },
          { id: 'top_products',    chartSpec: {} },
        ],
        parameters: [], sets: [], actions: [],
      } as any,
    });
  });

  it('lists every workbook worksheet by id', () => {
    render(<SheetsInsertPanel />);
    expect(screen.getByText('sales_by_region')).toBeInTheDocument();
    expect(screen.getByText('top_products')).toBeInTheDocument();
  });

  it('renders an empty-state row when worksheets array is empty', () => {
    useStore.setState((s: any) => ({
      analystProDashboard: { ...s.analystProDashboard, worksheets: [] },
    }));
    render(<SheetsInsertPanel />);
    expect(screen.getByTestId('sheets-insert-empty')).toBeInTheDocument();
  });

  it('drag-starts emit MIME application/askdb-analyst-pro-sheet+json with sheetId payload', () => {
    render(<SheetsInsertPanel />);
    const row = screen.getByTestId('sheet-row-sales_by_region');
    const setData = vi.fn();
    fireEvent.dragStart(row, {
      dataTransfer: { setData, types: [], effectAllowed: 'copy' },
    });
    const call = setData.mock.calls.find((c: any[]) => c[0] === 'application/askdb-analyst-pro-sheet+json');
    expect(call).toBeTruthy();
    expect(JSON.parse(call![1])).toEqual({ sheetId: 'sales_by_region' });
  });

  it('Enter key inserts a worksheet zone at default offset via insertObjectAnalystPro', () => {
    const calls: any[] = [];
    useStore.setState({
      insertObjectAnalystPro: (arg: any) => calls.push(arg),
    } as any);
    render(<SheetsInsertPanel />);
    const row = screen.getByTestId('sheet-row-top_products');
    row.focus();
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(calls).toEqual([{ type: 'worksheet', worksheetRef: 'top_products', x: 40, y: 40 }]);
  });
});
