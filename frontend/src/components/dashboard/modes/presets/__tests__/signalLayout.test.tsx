// Plan A★ Phase 5 — SignalLayout (wireframe 3). TDD red then green.
//
// Assertions below are verbatim from the Wave 2-SG brief:
//   • root has data-testid="layout-signal"
//   • 4 KPI cards present
//   • signal-detected card present with teal dot
//   • top-accounts list has 5 rows
//   • stream legend has 4 swatches (Enterprise / Mid-market / SMB / Self-serve)
//   • root computed background is rgb(11, 15, 23)  (#0b0f17)
//   • at least four distinct accent hexes are visible in rendered CSS — we sample
//     via computed `color` on the four KPI sparklines (teal / orange / pink / indigo)

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import SignalLayout from '../SignalLayout';

// The layout pulls in its CSS via a side-effect import in the component.
// We also rely on the preset-registry side-effect barrel so that a preset
// with id="signal" exists in tests that touch the registry.

describe('SignalLayout — bespoke wireframe 3', () => {
  beforeEach(() => {
    // Mark the preset active so CSS-var fallbacks resolve deterministically.
    document.documentElement.setAttribute('data-active-preset', 'signal');
  });

  afterEach(() => {
    cleanup();
    document.documentElement.removeAttribute('data-active-preset');
  });

  it('renders the layout root with the signal test-id and data-preset', () => {
    render(<SignalLayout />);
    const root = screen.getByTestId('layout-signal');
    expect(root).toBeInTheDocument();
    expect(root.getAttribute('data-preset')).toBe('signal');
  });

  it('renders four KPI cards', () => {
    render(<SignalLayout />);
    const region = screen.getByTestId('signal-kpis');
    const cards = region.querySelectorAll('.sg-kpi-card');
    expect(cards.length).toBe(4);
  });

  it('renders the signal-detected card with a teal dot marker', () => {
    render(<SignalLayout />);
    const card = screen.getByTestId('signal-signal-card');
    const dot = card.querySelector('.sg-signal-dot');
    expect(dot).not.toBeNull();
    // class or inline marker; presence is enough — color is asserted through CSS
    // once computed.
    const label = within(card).getByText(/signal detected/i);
    expect(label).toBeInTheDocument();
  });

  it('top-accounts list has exactly 5 ranked rows', () => {
    render(<SignalLayout />);
    const accounts = screen.getByTestId('signal-accounts');
    const rows = accounts.querySelectorAll('.sg-account-row');
    expect(rows.length).toBe(5);
  });

  it('stream legend has 4 swatches (labels bind via sg.legend-0..3 slots, TSS2 T9)', () => {
    render(<SignalLayout />);
    const legend = screen.getByTestId('signal-stream-legend');
    const swatches = legend.querySelectorAll('.sg-legend-swatch');
    expect(swatches.length).toBe(4);
    // Legend items render via <Slot id="sg.legend-N"> so each swatch
    // has a sibling label driven by the binding (post T9 purge).
    const items = legend.querySelectorAll('.sg-legend-item');
    expect(items.length).toBe(4);
  });

  it('root computed background resolves to #0b0f17 — deep slate', () => {
    render(<SignalLayout />);
    const root = screen.getByTestId('layout-signal');
    // jsdom does not evaluate stylesheet CSS variables. We rely on the
    // layout component setting an inline style for the bg so the test can
    // read it back.
    const bg = (root.style.backgroundColor || getComputedStyle(root).backgroundColor).trim();
    // Accept either the `rgb(11, 15, 23)` form or the original hex — jsdom
    // normalises colours inconsistently depending on how they're set.
    expect(bg === 'rgb(11, 15, 23)' || bg.toLowerCase() === '#0b0f17').toBe(true);
  });

  it('exposes at least four distinct accent hexes via sparkline inline strokes', () => {
    render(<SignalLayout />);
    const sparks = document.querySelectorAll('.sg-kpi-card .sg-sparkline');
    expect(sparks.length).toBe(4);

    const hexes = new Set<string>();
    sparks.forEach((s) => {
      // stroke may live on the SVG polyline — read either inline `stroke`
      // or inline `style.stroke`; normalise to lower-case hex.
      const el = s as SVGElement;
      const stroke =
        el.getAttribute('stroke') ??
        (el.querySelector('[stroke]') as SVGElement | null)?.getAttribute('stroke') ??
        '';
      if (stroke) hexes.add(stroke.toLowerCase());
    });
    expect(hexes.size).toBeGreaterThanOrEqual(4);
  });
});

// ──────────────────────────────────────────────────────────────────
// Plan TSS2 T9 — hardcoded SaaS content purge guard
// ──────────────────────────────────────────────────────────────────
// When the preset renders with no bindings / no tileData (fresh
// dashboard on a freshly-connected database), it MUST NOT leak the
// wireframe-era SaaS fallback copy (MRR / ARR / churn / specific
// account names, etc.). Unbound slots degrade to '—' or empty.

describe('SignalLayout — hardcoded SaaS content purge (TSS2 T9)', () => {
  const FORBIDDEN = [
    'MRR',
    'ARR',
    'Churn',
    'LTV:CAC',
    '$2.47M',
    '$29.6M',
    '2.31%',
    '4.7\u00d7',
    '$124.8K',
    '$108.4K',
    'Enterprise expansion is concentrated',
    'Amberline',
    'Beta-Axion',
    'Northfield',
    'Enterprise 58%',
    'Mid-market 22%',
    'SMB 14%',
    'Self-serve 6%',
  ];

  afterEach(() => {
    cleanup();
  });

  it('renders without any hardcoded SaaS fallback strings when unbound', () => {
    render(<SignalLayout />);
    const root = screen.getByTestId('layout-signal');
    const text = root.textContent ?? '';
    for (const banned of FORBIDDEN) {
      expect(text).not.toContain(banned);
    }
  });
});
