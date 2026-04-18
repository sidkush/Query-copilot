import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../store';

describe('store.viewDataDrawer (Plan 6e)', () => {
  beforeEach(() => {
    useStore.getState().closeViewDataDrawer();
  });

  it('starts closed', () => {
    expect(useStore.getState().viewDataDrawer).toEqual({
      open: false,
      sheetId: null,
      connId: null,
      sql: null,
      markSelection: {},
    });
  });

  it('openViewDataDrawer sets all fields', () => {
    useStore.getState().openViewDataDrawer({
      sheetId: 'sheet-1',
      connId: 'c1',
      sql: 'SELECT * FROM t',
      markSelection: { region: 'East' },
    });
    const d = useStore.getState().viewDataDrawer;
    expect(d.open).toBe(true);
    expect(d.sheetId).toBe('sheet-1');
    expect(d.connId).toBe('c1');
    expect(d.sql).toBe('SELECT * FROM t');
    expect(d.markSelection).toEqual({ region: 'East' });
  });

  it('closeViewDataDrawer clears state', () => {
    useStore.getState().openViewDataDrawer({
      sheetId: 's', connId: 'c', sql: 'SELECT 1', markSelection: { a: 1 },
    });
    useStore.getState().closeViewDataDrawer();
    expect(useStore.getState().viewDataDrawer.open).toBe(false);
    expect(useStore.getState().viewDataDrawer.sheetId).toBeNull();
  });
});
