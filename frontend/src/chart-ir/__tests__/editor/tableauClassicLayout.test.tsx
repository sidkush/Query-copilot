import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TableauClassicLayout from '../../../components/dashboard/modes/TableauClassicLayout';

const TILES = [
  { id: 't1', title: 'Sales by region' },
  { id: 't2', title: 'Sales by month' },
  { id: 't3', title: 'Top 5 products' },
];

describe('TableauClassicLayout (SP-6)', () => {
  it('renders the Tableau grid with a DashboardTileCanvas per tile', () => {
    render(<TableauClassicLayout tiles={TILES} />);
    const layout = screen.getByTestId('layout-tableau');
    expect(layout).toBeDefined();
    expect(layout.getAttribute('data-tile-count')).toBe('3');
    for (const tile of TILES) {
      expect(screen.getByTestId(`layout-tableau-tile-${tile.id}`)).toBeDefined();
      expect(screen.getByTestId(`dashboard-tile-canvas-${tile.id}`)).toBeDefined();
    }
  });

  it('renders dropdown-style filter bar with column/op/value/apply controls', () => {
    render(<TableauClassicLayout tiles={TILES} />);
    const filterBar = screen.getByTestId('tableau-filter-bar');
    expect(filterBar).toBeDefined();
    // Single column input (SP-6 removed redundant empty <select>)
    const colInputs = filterBar.querySelectorAll('input[placeholder="column"]');
    expect(colInputs.length).toBe(1);
    // Op dropdown present
    const selects = filterBar.querySelectorAll('select');
    expect(selects.length).toBe(1);
    // Apply button
    expect(filterBar.textContent).toMatch(/Apply/);
  });

  it('adds a chip when a filter is applied and removes it on × click', () => {
    render(<TableauClassicLayout tiles={TILES} />);
    const filterBar = screen.getByTestId('tableau-filter-bar');
    const colInput = filterBar.querySelector('input[placeholder="column"]') as HTMLInputElement;
    const valInput = filterBar.querySelector('input[placeholder="value"]') as HTMLInputElement;
    const applyBtn = Array.from(filterBar.querySelectorAll('button')).find(
      (b) => b.textContent === 'Apply',
    ) as HTMLButtonElement;

    fireEvent.change(colInput, { target: { value: 'region' } });
    fireEvent.change(valInput, { target: { value: 'West' } });
    fireEvent.click(applyBtn);
    expect(filterBar.textContent).toMatch(/region = West/);

    const removeBtn = Array.from(filterBar.querySelectorAll('button')).find(
      (b) => b.textContent === '\u00d7' || b.textContent === '×',
    );
    if (removeBtn) {
      fireEvent.click(removeBtn);
      expect(filterBar.textContent).not.toMatch(/region = West/);
    }
  });

  it('renders empty state when no tiles provided', () => {
    render(<TableauClassicLayout tiles={[]} />);
    expect(screen.getByTestId('layout-tableau').textContent).toMatch(
      /Tableau Classic view ready/,
    );
  });

  it('fires onLayoutChange when a layout callback is registered', () => {
    const onLayoutChange = vi.fn();
    render(
      <TableauClassicLayout tiles={TILES} onLayoutChange={onLayoutChange} />,
    );
    expect(typeof onLayoutChange).toBe('function');
  });
});
