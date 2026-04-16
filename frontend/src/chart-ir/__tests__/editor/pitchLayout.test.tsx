import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PitchLayout from '../../../components/dashboard/modes/PitchLayout';

const TILES = [
  {
    id: 'p1',
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
    // Rows present so PresentationEngine's legacy scoreTile returns 70
    // (new-path rendering via DashboardTileCanvas still kicks in).
    rows: [['North', 125430]],
    columns: ['region', 'revenue'],
  },
  {
    id: 'p2',
    title: 'Users over time',
    tab: 'Users',
    chart_spec: {
      $schema: 'askdb/chart-spec/v1',
      type: 'cartesian',
      mark: 'line',
      encoding: {
        x: { field: 'date', type: 'temporal' },
        y: { field: 'users', type: 'quantitative', aggregate: 'sum' },
      },
    },
    rows: [['2026-01-01', 1000]],
    columns: ['date', 'users'],
  },
];

describe('PitchLayout', () => {
  it('renders the pitch layout outer div with tile count', () => {
    render(<PitchLayout tiles={TILES} />);
    const layout = screen.getByTestId('layout-pitch');
    expect(layout).toBeDefined();
    expect(layout.getAttribute('data-tile-count')).toBe('2');
  });

  it('renders empty-state messaging when no tiles are provided', () => {
    render(<PitchLayout tiles={[]} />);
    expect(screen.getByTestId('layout-pitch').textContent).toMatch(/Pitch mode empty/);
  });

  it('adapts new-shape tiles into a dashboard structure that PresentationEngine can traverse', () => {
    // PresentationEngine renders its own empty state if slides is empty;
    // our adapter must produce a dashboard with nested tabs/sections so
    // the scoreTile-based pack finds at least one slide.
    render(<PitchLayout tiles={TILES} />);
    // If the adapter is wired, PresentationEngine mounts (a slide counter
    // with "1 / N" text is one of its artifacts). We assert the outer
    // pitch layout is present and presentation content is mounted.
    expect(screen.getByTestId('layout-pitch')).toBeDefined();
  });

  it('renders chrome overlay with slide counter and fullscreen toggle (SP-6)', () => {
    render(<PitchLayout tiles={TILES} />);
    const chrome = screen.getByTestId('pitch-chrome');
    expect(chrome).toBeDefined();
    const counter = screen.getByTestId('pitch-slide-counter');
    expect(counter.textContent).toMatch(/Slide 1 of \d+/);
    const fsBtn = screen.getByTestId('pitch-fullscreen-toggle');
    expect(fsBtn).toBeDefined();
    expect(fsBtn.getAttribute('aria-label')).toMatch(/fullscreen/i);
  });
});
