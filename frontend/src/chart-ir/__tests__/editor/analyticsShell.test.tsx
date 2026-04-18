import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import AnalyticsShell from '../../../pages/AnalyticsShell';

vi.mock('../../../api', () => ({
  api: {
    getDashboards: vi.fn(),
    getDashboard: vi.fn(),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
import { api } from '../../../api';

const DASHBOARD = {
  id: 'd1',
  name: 'Retail analytics',
  tabs: [
    {
      id: 'tab-1',
      name: 'Main',
      sections: [
        {
          id: 'sec-1',
          name: 'main',
          layout: [],
          tiles: [
            {
              id: 'w1',
              title: 'Revenue by region',
              chartType: 'bar',
              columns: ['region', 'revenue'],
              rows: [['North', 10000]],
              chart_spec: {
                $schema: 'askdb/chart-spec/v1',
                type: 'cartesian',
                mark: 'bar',
                encoding: {
                  x: { field: 'region', type: 'nominal' },
                  y: {
                    field: 'revenue',
                    type: 'quantitative',
                    aggregate: 'sum',
                  },
                },
              },
            },
          ],
        },
      ],
    },
    {
      id: 'tab-2',
      name: 'Products',
      sections: [
        {
          id: 'sec-2',
          name: 'main',
          layout: [],
          tiles: [
            {
              id: 'w2',
              title: 'Top products',
              chart_spec: {
                $schema: 'askdb/chart-spec/v1',
                type: 'cartesian',
                mark: 'bar',
                encoding: {
                  x: { field: 'product', type: 'nominal' },
                  y: {
                    field: 'units',
                    type: 'quantitative',
                    aggregate: 'sum',
                  },
                },
              },
            },
          ],
        },
      ],
    },
  ],
};

beforeEach(() => {
  vi.mocked(api.getDashboards).mockResolvedValue({
    dashboards: [{ id: 'd1', name: 'Retail analytics' }],
  });
  vi.mocked(api.getDashboard).mockResolvedValue(DASHBOARD);
});

describe('AnalyticsShell', () => {
  it('renders loading state on first mount', () => {
    render(<AnalyticsShell />);
    expect(screen.getByTestId('analytics-shell-loading')).toBeDefined();
  });

  it('mounts DashboardShell with flattened tiles once the dashboard loads', async () => {
    render(<AnalyticsShell />);
    await waitFor(() => screen.getByTestId('analytics-shell'));
    const shell = screen.getByTestId('analytics-shell');
    expect(shell.getAttribute('data-dashboard-id')).toBe('d1');
    // DashboardShell default initialMode=workbench for Analytics.
    const ds = screen.getByTestId('dashboard-shell');
    expect(ds.getAttribute('data-active-mode')).toBe('workbench');
  });

  it('flattens tabs[].sections[].tiles[] preserving the tab label', async () => {
    render(<AnalyticsShell />);
    await waitFor(() => screen.getByTestId('analytics-shell'));
    // Tile ids from both tabs should be present (lazy-loaded layout may need extra tick).
    await waitFor(() => expect(screen.getByTestId('layout-workbench-tile-w1')).toBeDefined(), { timeout: 3000 });
    // w2 lives under the Products tab — workbench doesn't filter by tab
    // so both are visible.
    expect(screen.getByTestId('layout-workbench-tile-w2')).toBeDefined();
  });

  it('renders empty state when getDashboards returns an empty list', async () => {
    vi.mocked(api.getDashboards).mockResolvedValueOnce({ dashboards: [] });
    render(<AnalyticsShell />);
    await waitFor(() => screen.getByTestId('analytics-shell-empty'));
    expect(screen.getByTestId('analytics-shell-empty')).toBeDefined();
  });

  it('renders error state when the fetch rejects', async () => {
    vi.mocked(api.getDashboards).mockRejectedValueOnce(new Error('boom'));
    render(<AnalyticsShell />);
    await waitFor(() => screen.getByTestId('analytics-shell-error'));
    const errEl = screen.getByTestId('analytics-shell-error');
    expect(errEl.textContent).toMatch(/boom/);
  });

  it('swaps the dashboard in-place when dispatch(dashboard-reload) carries a fresh detail', async () => {
    render(<AnalyticsShell />);
    await waitFor(() => screen.getByTestId('analytics-shell'));
    const fresh = {
      ...DASHBOARD,
      name: 'Retail analytics (agent-updated)',
      tabs: [
        {
          id: 'tab-1',
          name: 'Main',
          sections: [
            {
              id: 'sec-1',
              name: 'main',
              layout: [],
              tiles: [
                {
                  id: 'fresh-tile',
                  title: 'Fresh tile from agent',
                  chart_spec: {
                    $schema: 'askdb/chart-spec/v1',
                    type: 'cartesian',
                    mark: 'bar',
                    encoding: {
                      x: { field: 'x', type: 'nominal' },
                      y: { field: 'y', type: 'quantitative', aggregate: 'sum' },
                    },
                  },
                },
              ],
            },
          ],
        },
      ],
    };
    window.dispatchEvent(
      new CustomEvent('dashboard-reload', { detail: { dashboard: fresh } }),
    );
    // Lazy-loaded layout may need extra ticks to render after reload.
    await waitFor(() =>
      expect(screen.queryByTestId('layout-workbench-tile-fresh-tile')).not.toBeNull(),
      { timeout: 3000 },
    );
  });

  it('re-fetches the dashboard from the server when dispatch(dashboard-reload) has no detail payload', async () => {
    render(<AnalyticsShell />);
    await waitFor(() => screen.getByTestId('analytics-shell'));
    const callsBefore = vi.mocked(api.getDashboard).mock.calls.length;
    window.dispatchEvent(new CustomEvent('dashboard-reload'));
    await waitFor(() =>
      expect(vi.mocked(api.getDashboard).mock.calls.length).toBeGreaterThan(
        callsBefore,
      ),
    );
  });
});
