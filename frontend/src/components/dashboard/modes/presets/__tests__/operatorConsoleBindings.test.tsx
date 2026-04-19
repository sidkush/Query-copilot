/**
 * TSS Phase 4 / Wave 2-B — Operator Console bindings test.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import OperatorConsoleLayout from '../OperatorConsoleLayout.jsx';
import { PRESET_SLOTS } from '../slots.ts';

describe('OperatorConsoleLayout — slot bindings', () => {
  it('renders a data-slot anchor for every Operator Console slot', () => {
    const { container } = render(
      <OperatorConsoleLayout editable bindings={undefined} tileData={undefined} />
    );
    const found = Array.from(container.querySelectorAll('[data-slot]'))
      .map((el) => el.getAttribute('data-slot'))
      .filter((x): x is string => !!x && x.startsWith('oc.'))
      .sort();
    const expected = PRESET_SLOTS['operator-console'].map((s) => s.id).sort();
    expect(found).toEqual(expected);
  });

  it('renders the neutral em-dash CH.1A fallback value when no binding', () => {
    // Plan TSS2 T7-T10 purge: oc.ch1a descriptor fallback is now
    // { value: '—', unit: '', delta: null, footer: 'nom', label: '—' }.
    render(<OperatorConsoleLayout editable={false} bindings={undefined} tileData={undefined} />);
    const ch1a = screen.getByTestId('slot-oc.ch1a');
    expect(ch1a.getAttribute('data-state')).toBe('fallback');
    expect(ch1a.textContent).toContain('\u2014');
  });

  it('renders without any of the binding props (backward compat)', () => {
    render(<OperatorConsoleLayout />);
    expect(screen.getByTestId('layout-operator-console')).toBeTruthy();
  });

  it('swaps CH.1A value to a bound result when binding + rows supplied', () => {
    const bindings = {
      'oc.ch1a': {
        slotId: 'oc.ch1a',
        tileId: 't1',
        kind: 'kpi',
        measure: { column: 'mrr_amount', agg: 'SUM' },
        isUserPinned: false,
      },
    };
    const tileData = {
      t1: { columns: ['value'], rows: [{ value: 3_100_000 }] },
    };
    render(
      <OperatorConsoleLayout editable bindings={bindings} tileData={tileData} />
    );
    const ch1a = screen.getByTestId('slot-oc.ch1a');
    expect(ch1a.getAttribute('data-state')).toBe('bound');
    expect(ch1a.textContent).toContain('3.10M');
  });

  it('root preset + phosphor bg invariant holds', () => {
    const { container } = render(<OperatorConsoleLayout editable />);
    const root = container.querySelector<HTMLElement>(
      '[data-testid="layout-operator-console"]'
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-preset')).toBe('operator-console');
    expect(root?.style.background).toBe('rgb(10, 20, 14)');
  });
});
