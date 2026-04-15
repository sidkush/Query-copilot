import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import WorkbookLayout from '../../../components/dashboard/modes/WorkbookLayout';

const TILES = [
  { id: 'w1', title: 'Sales', chart_spec: { $schema: 'askdb/chart-spec/v1', type: 'cartesian', mark: 'bar', encoding: { x: { field: 'region', type: 'nominal' }, y: { field: 'sales', type: 'quantitative', aggregate: 'sum' } } } },
  { id: 'w2', title: 'Pipeline', tab: 'Pipeline', chart_spec: { $schema: 'askdb/chart-spec/v1', type: 'cartesian', mark: 'line', encoding: { x: { field: 'week', type: 'temporal' }, y: { field: 'count', type: 'quantitative', aggregate: 'sum' } } } },
];

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
});
