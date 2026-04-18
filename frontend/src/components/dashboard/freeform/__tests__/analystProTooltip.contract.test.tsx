import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../../../../store';

describe('Plan 6e tooltip → store contract', () => {
  beforeEach(() => {
    useStore.getState().setSheetFilterAnalystPro('sheet-1', []);
    useStore.getState().closeViewDataDrawer();
  });

  it('Keep Only appends an in-filter onto the sheet', () => {
    const datum = { region: 'East', amount: 100 };
    const existing = useStore.getState().analystProSheetFilters['sheet-1'] || [];
    useStore.getState().setSheetFilterAnalystPro('sheet-1', [
      ...existing,
      { field: 'region', op: 'in', values: ['East'] },
    ]);
    expect(useStore.getState().analystProSheetFilters['sheet-1']).toEqual([
      { field: 'region', op: 'in', values: ['East'] },
    ]);
    expect(datum.amount).toBe(100);
  });

  it('Exclude appends a notIn-filter onto the sheet', () => {
    useStore.getState().setSheetFilterAnalystPro('sheet-1', [
      { field: 'region', op: 'notIn', values: ['West'] },
    ]);
    expect(useStore.getState().analystProSheetFilters['sheet-1']).toEqual([
      { field: 'region', op: 'notIn', values: ['West'] },
    ]);
  });

  it('View Data opens the drawer with sheet/conn/sql + the mark selection', () => {
    useStore.getState().openViewDataDrawer({
      sheetId: 'sheet-1',
      connId: 'c1',
      sql: 'SELECT * FROM t',
      markSelection: { region: 'East' },
    });
    const d = useStore.getState().viewDataDrawer;
    expect(d.open).toBe(true);
    expect(d.markSelection).toEqual({ region: 'East' });
  });
});
