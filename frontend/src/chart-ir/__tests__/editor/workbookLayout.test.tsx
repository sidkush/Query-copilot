import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import WorkbookLayout from '../../../components/dashboard/modes/WorkbookLayout';

vi.mock('../../../api', () => ({
  api: {
    batchRefreshTiles: vi.fn(),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
import { api } from '../../../api';

const TILES = [
  { id: 'w1', title: 'Sales', chart_spec: { $schema: 'askdb/chart-spec/v1', type: 'cartesian', mark: 'bar', encoding: { x: { field: 'region', type: 'nominal' }, y: { field: 'sales', type: 'quantitative', aggregate: 'sum' } } } },
  { id: 'w2', title: 'Pipeline', tab: 'Pipeline', chart_spec: { $schema: 'askdb/chart-spec/v1', type: 'cartesian', mark: 'line', encoding: { x: { field: 'week', type: 'temporal' }, y: { field: 'count', type: 'quantitative', aggregate: 'sum' } } } },
];

beforeEach(() => {
  vi.mocked(api.batchRefreshTiles).mockResolvedValue({
    results: {
      w1: { columns: ['region', 'sales'], rows: [['North', 9999]] },
      w2: { columns: ['week', 'count'], rows: [['2026-01-01', 42]] },
    },
  });
});

describe('WorkbookLayout', () => {
  it('renders tabs grouped by the tile.tab field, default to "Tab 1"', () => {
    render(<WorkbookLayout tiles={TILES} />);
    expect(screen.getByTestId('workbook-tab-Tab 1')).toBeDefined();
    expect(screen.getByTestId('workbook-tab-Pipeline')).toBeDefined();
  });

  it('switches active tab on button click', () => {
    render(<WorkbookLayout tiles={TILES} />);
    expect(
      screen.getByTestId('layout-workbook').getAttribute('data-active-tab'),
    ).toBe('Tab 1');
    fireEvent.click(screen.getByTestId('workbook-tab-Pipeline'));
    expect(
      screen.getByTestId('layout-workbook').getAttribute('data-active-tab'),
    ).toBe('Pipeline');
    expect(screen.getByTestId('layout-workbook-tile-w2')).toBeDefined();
  });

  it('renders a shared filter bar that accepts new filters', () => {
    render(<WorkbookLayout tiles={TILES} />);
    const bar = screen.getByTestId('workbook-filter-bar');
    expect(bar.getAttribute('data-filter-count')).toBe('0');

    fireEvent.change(screen.getByTestId('workbook-filter-field'), {
      target: { value: 'region' },
    });
    fireEvent.change(screen.getByTestId('workbook-filter-value'), {
      target: { value: 'North' },
    });
    fireEvent.click(screen.getByTestId('workbook-filter-add'));

    expect(
      screen.getByTestId('workbook-filter-bar').getAttribute('data-filter-count'),
    ).toBe('1');
  });

  it('clears filters when the Clear button is clicked', () => {
    render(<WorkbookLayout tiles={TILES} />);
    fireEvent.change(screen.getByTestId('workbook-filter-field'), {
      target: { value: 'region' },
    });
    fireEvent.change(screen.getByTestId('workbook-filter-value'), {
      target: { value: 'North' },
    });
    fireEvent.click(screen.getByTestId('workbook-filter-add'));
    fireEvent.click(screen.getByTestId('workbook-filter-clear'));
    expect(
      screen.getByTestId('workbook-filter-bar').getAttribute('data-filter-count'),
    ).toBe('0');
  });

  it('does NOT call batchRefreshTiles when no dashboardId is threaded', async () => {
    render(<WorkbookLayout tiles={TILES} />);
    fireEvent.change(screen.getByTestId('workbook-filter-field'), {
      target: { value: 'region' },
    });
    fireEvent.change(screen.getByTestId('workbook-filter-value'), {
      target: { value: 'North' },
    });
    fireEvent.click(screen.getByTestId('workbook-filter-add'));
    // No dashboardId → Workbook can't call the backend, so the API
    // must remain untouched.
    expect(api.batchRefreshTiles).not.toHaveBeenCalled();
  });

  it('calls batchRefreshTiles with mapped filter payload when a filter is added under a dashboardId', async () => {
    render(<WorkbookLayout tiles={TILES} dashboardId="d1" />);
    fireEvent.change(screen.getByTestId('workbook-filter-field'), {
      target: { value: 'region' },
    });
    fireEvent.change(screen.getByTestId('workbook-filter-value'), {
      target: { value: 'North' },
    });
    fireEvent.click(screen.getByTestId('workbook-filter-add'));
    await waitFor(() =>
      expect(vi.mocked(api.batchRefreshTiles)).toHaveBeenCalledTimes(1),
    );
    const [dashboardId, tileIds, connId, filters] =
      vi.mocked(api.batchRefreshTiles).mock.calls[0] ?? [];
    expect(dashboardId).toBe('d1');
    expect(tileIds).toEqual(['w1', 'w2']);
    expect(connId).toBe(null);
    expect(filters).toMatchObject({
      fields: [{ column: 'region', operator: '=', value: 'North' }],
    });
  });

  it('blends batch-refresh results into the Workbook tiles via data-filter-blend-count', async () => {
    render(<WorkbookLayout tiles={TILES} dashboardId="d1" />);
    fireEvent.change(screen.getByTestId('workbook-filter-field'), {
      target: { value: 'region' },
    });
    fireEvent.change(screen.getByTestId('workbook-filter-value'), {
      target: { value: 'North' },
    });
    fireEvent.click(screen.getByTestId('workbook-filter-add'));
    await waitFor(() => {
      const layout = screen.getByTestId('layout-workbook');
      expect(layout.getAttribute('data-filter-blend-count')).toBe('2');
    });
  });

  it('surfaces a refresh error banner when batchRefreshTiles rejects', async () => {
    vi.mocked(api.batchRefreshTiles).mockRejectedValueOnce(new Error('db down'));
    render(<WorkbookLayout tiles={TILES} dashboardId="d1" />);
    fireEvent.change(screen.getByTestId('workbook-filter-field'), {
      target: { value: 'region' },
    });
    fireEvent.change(screen.getByTestId('workbook-filter-value'), {
      target: { value: 'North' },
    });
    fireEvent.click(screen.getByTestId('workbook-filter-add'));
    await waitFor(() =>
      expect(screen.getByTestId('workbook-filter-refresh-error')).toBeDefined(),
    );
  });
});
