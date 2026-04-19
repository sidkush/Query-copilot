/**
 * TSS Phase 4 / Wave 2-B — Signal bindings test.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import SignalLayout from '../SignalLayout.jsx';
import { PRESET_SLOTS } from '../slots.ts';

describe('SignalLayout — slot bindings', () => {
  it('renders a data-slot anchor for every Signal slot', () => {
    const { container } = render(
      <SignalLayout editable bindings={undefined} tileData={undefined} />
    );
    const found = Array.from(container.querySelectorAll('[data-slot]'))
      .map((el) => el.getAttribute('data-slot'))
      .filter((x): x is string => !!x && x.startsWith('sg.'))
      .sort();
    const expected = PRESET_SLOTS['signal'].map((s) => s.id).sort();
    expect(found).toEqual(expected);
  });

  it('hero KPI renders "$2.47M" fallback when unbound', () => {
    render(<SignalLayout editable={false} />);
    const kpi0 = screen.getByTestId('slot-sg.kpi-0');
    expect(kpi0.getAttribute('data-state')).toBe('fallback');
    expect(kpi0.textContent).toContain('$2.47M');
  });

  it('swaps the live value when bound', () => {
    const bindings = {
      'sg.kpi-0': {
        slotId: 'sg.kpi-0',
        tileId: 't_sg',
        kind: 'kpi',
        measure: { column: 'mrr', agg: 'SUM' },
        isUserPinned: false,
      },
    };
    const tileData = {
      t_sg: { columns: ['value'], rows: [{ value: 3_200_000 }] },
    };
    render(<SignalLayout editable bindings={bindings} tileData={tileData} />);
    const kpi0 = screen.getByTestId('slot-sg.kpi-0');
    expect(kpi0.getAttribute('data-state')).toBe('bound');
    expect(kpi0.textContent).toContain('3.20M');
  });

  it('deep-slate bg invariant holds', () => {
    const { container } = render(<SignalLayout editable />);
    const root = container.querySelector<HTMLElement>(
      '[data-testid="layout-signal"]'
    );
    expect(root).not.toBeNull();
    expect(root?.style.backgroundColor).toBe('rgb(11, 15, 23)');
  });

  it('renders fine with no props at all', () => {
    render(<SignalLayout />);
    expect(screen.getByTestId('layout-signal')).toBeTruthy();
  });
});
