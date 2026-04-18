import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ViewDataDrawer from '../ViewDataDrawer';
import { useStore } from '../../../../store';

vi.mock('../../../../api', () => ({
  api: {
    executeSQL: vi.fn(async () => ({
      columns: ['region', 'amount'],
      rows: [['East', 350], ['West', 120]],
    })),
    executeUnderlying: vi.fn(async () => ({
      columns: ['region', 'year', 'amount'],
      rows: [['East', 2024, 100], ['East', 2024, 250]],
      limit: 10000,
      mark_selection: { region: 'East' },
      row_count: 2,
    })),
  },
}));

describe('ViewDataDrawer (Plan 6e)', () => {
  beforeEach(() => {
    useStore.getState().closeViewDataDrawer();
  });

  it('renders nothing when drawer is closed', () => {
    const { container } = render(<ViewDataDrawer />);
    expect(container.firstChild).toBeNull();
  });

  it('renders Summary tab by default with summary rows', async () => {
    useStore.getState().openViewDataDrawer({
      sheetId: 's1', connId: 'c1', sql: 'SELECT 1', markSelection: { region: 'East' },
    });
    render(<ViewDataDrawer />);
    await waitFor(() => expect(screen.getByText('Summary')).toBeTruthy());
    await waitFor(() => expect(screen.getByText('350')).toBeTruthy());
  });

  it('switches to Underlying tab and fetches /underlying', async () => {
    useStore.getState().openViewDataDrawer({
      sheetId: 's1', connId: 'c1', sql: 'SELECT 1', markSelection: { region: 'East' },
    });
    const { api } = await import('../../../../api');
    render(<ViewDataDrawer />);
    fireEvent.click(screen.getByRole('tab', { name: /underlying/i }));
    await waitFor(() => expect(api.executeUnderlying).toHaveBeenCalled());
    await waitFor(() => expect(screen.getAllByText('2024').length).toBeGreaterThan(0));
  });

  it('Esc closes the drawer', async () => {
    useStore.getState().openViewDataDrawer({
      sheetId: 's1', connId: 'c1', sql: 'SELECT 1', markSelection: {},
    });
    render(<ViewDataDrawer />);
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(useStore.getState().viewDataDrawer.open).toBe(false));
  });

  it('Export CSV builds a Blob from the active tab data', async () => {
    useStore.getState().openViewDataDrawer({
      sheetId: 's1', connId: 'c1', sql: 'SELECT 1', markSelection: {},
    });
    const createUrl = vi.fn(() => 'blob:test');
    const revokeUrl = vi.fn();
    const origCreate = URL.createObjectURL;
    const origRevoke = URL.revokeObjectURL;
    URL.createObjectURL = createUrl;
    URL.revokeObjectURL = revokeUrl;
    render(<ViewDataDrawer />);
    await waitFor(() => screen.getByText('350'));
    fireEvent.click(screen.getByRole('button', { name: /export csv/i }));
    expect(createUrl).toHaveBeenCalled();
    URL.createObjectURL = origCreate;
    URL.revokeObjectURL = origRevoke;
  });
});
