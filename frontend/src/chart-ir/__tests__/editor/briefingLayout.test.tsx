import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ExecBriefingLayout from '../../../components/dashboard/modes/ExecBriefingLayout';

const BRIEFING_TILES = [
  {
    id: 'k1',
    title: 'MRR',
    chartType: 'kpi',
    rows: [[100000]],
    columns: ['mrr'],
  },
  {
    id: 'k2',
    title: 'Churn',
    chartType: 'kpi',
    rows: [[3.2]],
    columns: ['churn'],
  },
  {
    id: 'c1',
    title: 'Revenue by region',
    chart_spec: {
      $schema: 'askdb/chart-spec/v1',
      type: 'cartesian',
      mark: 'bar',
      encoding: {
        x: { field: 'region', type: 'nominal' },
        y: { field: 'revenue', type: 'quantitative', aggregate: 'sum' },
      },
    },
  },
];

describe('ExecBriefingLayout', () => {
  it('renders the briefing grid with tile count attribute', () => {
    render(<ExecBriefingLayout tiles={BRIEFING_TILES} />);
    const layout = screen.getByTestId('layout-briefing');
    expect(layout).toBeDefined();
    expect(layout.getAttribute('data-tile-count')).toBe('3');
  });

  it('places KPI tiles at colSpan 3 and the first chart at colSpan 12 (hero)', () => {
    render(<ExecBriefingLayout tiles={BRIEFING_TILES} />);
    const k1 = screen.getByTestId('layout-briefing-tile-k1');
    const k2 = screen.getByTestId('layout-briefing-tile-k2');
    const c1 = screen.getByTestId('layout-briefing-tile-c1');
    expect(k1.getAttribute('data-col-span')).toBe('3');
    expect(k1.getAttribute('data-row-hint')).toBe('kpi');
    expect(k2.getAttribute('data-col-span')).toBe('3');
    expect(c1.getAttribute('data-col-span')).toBe('12');
    expect(c1.getAttribute('data-row-hint')).toBe('hero');
  });

  it('renders empty state when tile list is empty', () => {
    render(<ExecBriefingLayout tiles={[]} />);
    expect(screen.getByTestId('layout-empty')).toBeDefined();
  });

  it('mounts DashboardTileCanvas per tile so the new-path renderer is used', () => {
    render(<ExecBriefingLayout tiles={BRIEFING_TILES} />);
    // One DashboardTileCanvas per tile.
    expect(screen.getByTestId('dashboard-tile-canvas-k1')).toBeDefined();
    expect(screen.getByTestId('dashboard-tile-canvas-c1')).toBeDefined();
    // The chart-spec-bearing tile should route through EditorCanvas,
    // which means DashboardTileCanvas reports data-has-spec="true".
    expect(
      screen
        .getByTestId('dashboard-tile-canvas-c1')
        .getAttribute('data-has-spec'),
    ).toBe('true');
  });
});
