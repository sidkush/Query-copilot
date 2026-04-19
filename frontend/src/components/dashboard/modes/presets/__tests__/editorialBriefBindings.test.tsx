/**
 * TSS Phase 4 / Wave 2-B — Editorial Brief bindings test.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import EditorialBriefLayout from '../EditorialBriefLayout.jsx';
import { PRESET_SLOTS } from '../slots.ts';

describe('EditorialBriefLayout — slot bindings', () => {
  it('renders a data-slot anchor for every Editorial Brief slot', () => {
    const { container } = render(
      <EditorialBriefLayout editable bindings={undefined} tileData={undefined} />
    );
    const found = Array.from(container.querySelectorAll('[data-slot]'))
      .map((el) => el.getAttribute('data-slot'))
      .filter((x): x is string => !!x && x.startsWith('eb.'))
      .sort();
    const expected = PRESET_SLOTS['editorial-brief'].map((s) => s.id).sort();
    expect(found).toEqual(expected);
  });

  it('headline renders the neutral unbound state with no fake copy', () => {
    // Plan TSS2 T7-T10 purge: eb.headline-topic descriptor fallback is
    // now '—' and the layout intentionally renders empty copy when
    // unbound (no hardcoded magazine headline).
    render(<EditorialBriefLayout editable={false} />);
    const headline = screen.getByTestId('slot-eb.headline-topic');
    expect(headline.getAttribute('data-state')).toBe('fallback');
    const text = headline.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    expect(text).toBe('');
  });

  it('first KPI swaps to the bound value', () => {
    const bindings = {
      'eb.kpi-0': {
        slotId: 'eb.kpi-0',
        tileId: 't_eb',
        kind: 'kpi',
        measure: { column: 'revenue_mrr', agg: 'SUM' },
        isUserPinned: false,
      },
    };
    const tileData = {
      t_eb: { columns: ['value'], rows: [{ value: 2_800_000 }] },
    };
    render(
      <EditorialBriefLayout editable bindings={bindings} tileData={tileData} />
    );
    const kpi0 = screen.getByTestId('slot-eb.kpi-0');
    expect(kpi0.getAttribute('data-state')).toBe('bound');
    expect(kpi0.textContent).toContain('2.80M');
  });

  it('cream bg invariant holds', () => {
    const { container } = render(<EditorialBriefLayout editable />);
    const root = container.querySelector<HTMLElement>(
      '[data-testid="layout-editorial-brief"]'
    );
    expect(root).not.toBeNull();
    expect(root?.style.backgroundColor).toBe('rgb(244, 239, 228)');
  });

  it('still renders under legacy prop shape (tiles, dashboardId, dashboardName)', () => {
    render(
      <EditorialBriefLayout
        tiles={[]}
        dashboardId="dash-1"
        dashboardName="Test"
      />
    );
    expect(screen.getByTestId('layout-editorial-brief')).toBeTruthy();
  });
});
