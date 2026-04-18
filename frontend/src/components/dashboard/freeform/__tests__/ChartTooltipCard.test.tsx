import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ChartTooltipCard from '../ChartTooltipCard';

const datum = { region: 'East', year: 2024, amount: 350 };

function setup(overrides = {}) {
  const onKeepOnly = vi.fn();
  const onExclude = vi.fn();
  const onViewData = vi.fn();
  render(
    <ChartTooltipCard
      open
      x={100}
      y={200}
      datum={datum}
      onKeepOnly={onKeepOnly}
      onExclude={onExclude}
      onViewData={onViewData}
      onClose={() => {}}
      {...overrides}
    />,
  );
  return { onKeepOnly, onExclude, onViewData };
}

describe('ChartTooltipCard', () => {
  it('renders one row per datum field', () => {
    setup();
    expect(screen.getByText('region')).toBeTruthy();
    expect(screen.getByText('East')).toBeTruthy();
    expect(screen.getByText('year')).toBeTruthy();
    expect(screen.getByText('2024')).toBeTruthy();
    expect(screen.getByText('amount')).toBeTruthy();
    expect(screen.getByText('350')).toBeTruthy();
  });

  it('Keep Only button fires the callback with the datum', () => {
    const { onKeepOnly } = setup();
    fireEvent.click(screen.getByRole('button', { name: /keep only/i }));
    expect(onKeepOnly).toHaveBeenCalledWith(datum);
  });

  it('Exclude button fires the callback with the datum', () => {
    const { onExclude } = setup();
    fireEvent.click(screen.getByRole('button', { name: /exclude/i }));
    expect(onExclude).toHaveBeenCalledWith(datum);
  });

  it('View Data button fires the callback with the datum', () => {
    const { onViewData } = setup();
    fireEvent.click(screen.getByRole('button', { name: /view data/i }));
    expect(onViewData).toHaveBeenCalledWith(datum);
  });

  it('renders nothing when open=false', () => {
    render(<ChartTooltipCard open={false} x={0} y={0} datum={datum} />);
    expect(screen.queryByRole('button', { name: /keep only/i })).toBeNull();
  });

  it('arrow-right moves focus across the action row', () => {
    setup();
    const keep = screen.getByRole('button', { name: /keep only/i });
    keep.focus();
    fireEvent.keyDown(keep, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /exclude/i }));
  });

  it('Esc fires onClose', () => {
    const onClose = vi.fn();
    setup({ onClose });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
