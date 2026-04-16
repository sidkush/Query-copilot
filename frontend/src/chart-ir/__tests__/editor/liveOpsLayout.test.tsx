import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import LiveOpsLayout from '../../../components/dashboard/modes/LiveOpsLayout';

const TILES = [
  {
    id: 'l1',
    title: 'Error rate',
    chart_spec: {
      $schema: 'askdb/chart-spec/v1',
      type: 'cartesian',
      mark: 'line',
      encoding: {
        x: { field: 'ts', type: 'temporal' },
        y: { field: 'errors', type: 'quantitative', aggregate: 'sum' },
      },
    },
  },
  {
    id: 'l2',
    title: 'CPU',
    chart_spec: {
      $schema: 'askdb/chart-spec/v1',
      type: 'cartesian',
      mark: 'area',
      encoding: {
        x: { field: 'ts', type: 'temporal' },
        y: { field: 'cpu_pct', type: 'quantitative', aggregate: 'avg' },
      },
    },
  },
];

describe('LiveOpsLayout', () => {
  it('renders the ops layout with a refresh counter + connected badge', () => {
    render(<LiveOpsLayout tiles={TILES} dashboardId={null} />);
    const layout = screen.getByTestId('layout-ops');
    expect(layout).toBeDefined();
    // `data-tick` starts at 0 when no dashboardId is supplied
    expect(layout.getAttribute('data-tick')).toBe('0');
    expect(layout.textContent).toMatch(/preview mode/);
  });

  it('renders a DashboardTileCanvas per tile', () => {
    render(<LiveOpsLayout tiles={TILES} />);
    expect(screen.getByTestId('layout-ops-tile-l1')).toBeDefined();
    expect(screen.getByTestId('layout-ops-tile-l2')).toBeDefined();
    expect(screen.getByTestId('dashboard-tile-canvas-l1')).toBeDefined();
    expect(screen.getByTestId('dashboard-tile-canvas-l2')).toBeDefined();
  });

  it('renders empty state when no tiles are provided', () => {
    render(<LiveOpsLayout tiles={[]} />);
    expect(screen.getByTestId('layout-empty')).toBeDefined();
  });

  it('renders traffic-light KPI tiles with critical/warning/healthy tones (SP-6)', () => {
    const KPI_TILES = [
      { id: 'k1', title: 'Error rate', kind: 'kpi', value: 650, thresholds: { critical: 500, warning: 200 } },
      { id: 'k2', title: 'Latency', kind: 'kpi', value: 250, thresholds: { critical: 500, warning: 200 } },
      { id: 'k3', title: 'Uptime', kind: 'kpi', value: 99.99, thresholds: { critical: 500, warning: 200 } },
    ];
    render(<LiveOpsLayout tiles={KPI_TILES} />);
    expect(screen.getByTestId('ops-kpi-row')).toBeDefined();
    expect(screen.getByTestId('layout-ops-tile-k1').getAttribute('data-tone')).toBe('critical');
    expect(screen.getByTestId('layout-ops-tile-k2').getAttribute('data-tone')).toBe('warning');
    expect(screen.getByTestId('layout-ops-tile-k3').getAttribute('data-tone')).toBe('healthy');
  });

  it('renders NOMINAL / WATCH / CRITICAL status chips on KPI tiles (SP-6)', () => {
    const KPI_TILES = [
      { id: 'k1', title: 'Error rate', kind: 'kpi', value: 650, thresholds: { critical: 500, warning: 200 } },
      { id: 'k2', title: 'Latency', kind: 'kpi', value: 250, thresholds: { critical: 500, warning: 200 } },
      { id: 'k3', title: 'Uptime', kind: 'kpi', value: 50, thresholds: { critical: 500, warning: 200 } },
    ];
    render(<LiveOpsLayout tiles={KPI_TILES} />);
    expect(screen.getByTestId('layout-ops-tile-k1').textContent).toMatch(/CRITICAL/);
    expect(screen.getByTestId('layout-ops-tile-k2').textContent).toMatch(/WATCH/);
    expect(screen.getByTestId('layout-ops-tile-k3').textContent).toMatch(/NOMINAL/);
  });
});
