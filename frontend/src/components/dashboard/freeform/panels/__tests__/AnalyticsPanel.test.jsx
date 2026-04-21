import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import AnalyticsPanel from '../AnalyticsPanel';

describe('AnalyticsPanel Plan 9e polish', () => {
  it('renders three section headings: Summarise / Model / Custom', () => {
    render(<AnalyticsPanel />);
    expect(screen.getByRole('heading', { name: /Summarise/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Model/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Custom/i })).toBeInTheDocument();
  });

  it('box_plot catalogue item is enabled (no Coming-Soon badge)', () => {
    render(<AnalyticsPanel />);
    const item = screen.getByText(/^Box Plot$/i).closest('li');
    expect(item.getAttribute('data-disabled')).toBe('false');
    expect(item.getAttribute('draggable')).toBe('true');
  });

  it('drop_lines catalogue item is present and enabled', () => {
    render(<AnalyticsPanel />);
    const item = screen.getByText(/^Drop Lines$/i).closest('li');
    expect(item.getAttribute('data-kind')).toBe('drop_lines');
    expect(item.getAttribute('data-disabled')).toBe('false');
  });

  it('collapsing a section hides its items', () => {
    render(<AnalyticsPanel />);
    const header = screen.getByRole('button', { name: /Summarise/i });
    fireEvent.click(header);
    expect(screen.queryByText(/Constant Line/i)).not.toBeInTheDocument();
  });

  it('empty-state help text is visible', () => {
    render(<AnalyticsPanel />);
    expect(
      screen.getByText(/Drag onto an axis to add a reference/i),
    ).toBeInTheDocument();
  });

  it('hovering an item shows a tooltip preview', () => {
    render(<AnalyticsPanel />);
    const item = screen.getByText(/^Trend Line$/i).closest('li');
    fireEvent.mouseEnter(item);
    expect(
      screen.getByRole('tooltip', { name: /least-squares fit/i }),
    ).toBeInTheDocument();
  });
});
