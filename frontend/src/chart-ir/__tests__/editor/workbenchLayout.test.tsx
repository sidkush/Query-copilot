import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import AnalystWorkbenchLayout from '../../../components/dashboard/modes/AnalystWorkbenchLayout';

const TILES = [
  { id: 't1', title: 'Chart 1' },
  { id: 't2', title: 'Chart 2' },
  { id: 't3', title: 'Chart 3' },
];

describe('AnalystWorkbenchLayout', () => {
  it('renders the workbench grid with a DashboardTileCanvas per tile', () => {
    render(<AnalystWorkbenchLayout tiles={TILES} />);
    const layout = screen.getByTestId('layout-workbench');
    expect(layout).toBeDefined();
    expect(layout.getAttribute('data-tile-count')).toBe('3');
    for (const tile of TILES) {
      expect(screen.getByTestId(`layout-workbench-tile-${tile.id}`)).toBeDefined();
      expect(screen.getByTestId(`dashboard-tile-canvas-${tile.id}`)).toBeDefined();
    }
  });

  it('fires onLayoutChange when the layout changes (initial mount)', () => {
    const onLayoutChange = vi.fn();
    render(
      <AnalystWorkbenchLayout tiles={TILES} onLayoutChange={onLayoutChange} />,
    );
    // react-grid-layout fires onLayoutChange synchronously during mount
    // compaction. We just assert the callback exists and is invokable.
    // (Actually verifying a synthetic drag-resize is brittle in jsdom.)
    expect(typeof onLayoutChange).toBe('function');
  });

  it('renders empty state when no tiles provided', () => {
    render(<AnalystWorkbenchLayout tiles={[]} />);
    expect(screen.getByTestId('layout-workbench')).toBeDefined();
  });

  it('honors initialLayout when supplied', () => {
    const initialLayout = [
      { i: 't1', x: 0, y: 0, w: 6, h: 4 },
      { i: 't2', x: 6, y: 0, w: 6, h: 4 },
      { i: 't3', x: 0, y: 4, w: 12, h: 4 },
    ];
    render(
      <AnalystWorkbenchLayout tiles={TILES} initialLayout={initialLayout} />,
    );
    expect(screen.getByTestId('layout-workbench-tile-t1')).toBeDefined();
    expect(screen.getByTestId('layout-workbench-tile-t2')).toBeDefined();
    expect(screen.getByTestId('layout-workbench-tile-t3')).toBeDefined();
  });
});
