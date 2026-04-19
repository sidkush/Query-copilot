/**
 * TSS Phase 4 / Wave 2-B — Board Pack bindings test.
 *
 * Verifies every slot in PRESET_SLOTS['board-pack'] is rendered as a
 * [data-slot="..."] anchor. Asserts static-fallback still renders
 * (no regressions vs Plan A★) and that a partial bindings prop swaps
 * the value live.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import BoardPackLayout from '../BoardPackLayout.jsx';
import { PRESET_SLOTS } from '../slots.ts';

describe('BoardPackLayout — slot bindings', () => {
  it('renders a data-slot anchor for every Board Pack slot in the manifest', () => {
    const { container } = render(<BoardPackLayout editable bindings={undefined} tileData={undefined} />);
    const found = Array.from(container.querySelectorAll('[data-slot]'))
      .map((el) => el.getAttribute('data-slot'))
      .filter((x): x is string => !!x && x.startsWith('bp.'))
      .sort();
    const expected = PRESET_SLOTS['board-pack'].map((s) => s.id).sort();
    expect(found).toEqual(expected);
  });

  it('still reads "+$478K" from the hero number slot under the static fallback', () => {
    render(<BoardPackLayout editable={false} bindings={undefined} tileData={undefined} />);
    const hero = screen.getByTestId('slot-bp.hero-number');
    expect(hero.textContent?.replace(/\s+/g, '')).toContain('+$478K');
    expect(hero.getAttribute('data-state')).toBe('fallback');
  });

  it('renders with no bindings prop at all (backward compat)', () => {
    render(<BoardPackLayout />);
    expect(screen.getByTestId('layout-board-pack')).toBeTruthy();
    expect(screen.getByTestId('slot-bp.hero-number')).toBeTruthy();
  });

  it('swaps the hero number to the bound value when a binding + rows are provided', () => {
    const bindings = {
      'bp.hero-number': {
        slotId: 'bp.hero-number',
        tileId: 't_hero',
        kind: 'kpi',
        measure: { column: 'revenue', agg: 'SUM' },
        isUserPinned: false,
      },
    };
    const tileData = {
      t_hero: { columns: ['value'], rows: [{ value: 290_000 }] },
    };
    render(
      <BoardPackLayout editable bindings={bindings} tileData={tileData} />
    );
    const hero = screen.getByTestId('slot-bp.hero-number');
    expect(hero.getAttribute('data-state')).toBe('bound');
    // $290K should be present (formatValue's K suffix).
    expect(hero.textContent).toContain('290K');
  });

  it('suppresses hover class when editable=false', () => {
    render(<BoardPackLayout editable={false} />);
    const hero = screen.getByTestId('slot-bp.hero-number');
    expect(hero.className).not.toMatch(/slot--hover/);
  });

  it('keeps the root testid + cream background invariant intact', () => {
    const { container } = render(<BoardPackLayout editable />);
    const root = container.querySelector<HTMLElement>(
      '[data-testid="layout-board-pack"]'
    );
    expect(root).not.toBeNull();
    expect(root?.style.backgroundColor).toBe('rgb(245, 241, 232)');
  });
});
