// Plan TSS2 T8 — OperatorConsoleLayout hardcoded telemetry purge.
//
// Rendering the layout with no bindings + no tileData must not leak any of
// the historical fake telemetry strings (MRR/ARR/Churn/Payback, acme_renewal,
// M.CHEN, PROD-EU-1, Warehouse ingest / Waverly / Amberline event log,
// Δ 12.4% / confidence 0.97 header meta, ANOMALY · T+498 callout).
// Each slot must render the universal '—' fallback instead.

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import OperatorConsoleLayout from '../OperatorConsoleLayout';

afterEach(cleanup);

const FORBIDDEN = [
  'MRR',
  'ARR',
  'Churn',
  'Payback',
  'Warehouse ingest',
  'Waverly',
  'Amberline',
  'acme_renewal',
  'PROD-EU-1',
  'M.CHEN',
  'Q3-2026-042',
  'Δ 12.4%',
  'confidence 0.97',
  'ANOMALY · T+498',
];

describe('OperatorConsoleLayout — hardcoded telemetry purge (TSS2 T8)', () => {
  it('renders the layout root', () => {
    render(<OperatorConsoleLayout />);
    const root = screen.getByTestId('layout-operator-console');
    expect(root).toBeInTheDocument();
    expect(root).toHaveAttribute('data-preset', 'operator-console');
  });

  it('does not leak any hardcoded telemetry literal when rendered with empty bindings', () => {
    const { container } = render(
      <OperatorConsoleLayout bindings={{}} tileData={{}} />,
    );
    const text = container.textContent ?? '';
    for (const literal of FORBIDDEN) {
      expect(text, `forbidden literal leaked: ${literal}`).not.toContain(literal);
    }
  });

  it('also purges the literals when rendered with no props at all', () => {
    const { container } = render(<OperatorConsoleLayout />);
    const text = container.textContent ?? '';
    for (const literal of FORBIDDEN) {
      expect(text, `forbidden literal leaked: ${literal}`).not.toContain(literal);
    }
  });

  it('renders the footer slot with the em-dash fallback instead of a bigquery URI', () => {
    render(<OperatorConsoleLayout />);
    const footerSlot = screen.getByTestId('slot-oc.footer');
    expect(footerSlot).toBeInTheDocument();
    expect(footerSlot.textContent).toContain('—');
  });

  it('renders the metadata slot with the em-dash fallback instead of Δ/confidence/sample', () => {
    render(<OperatorConsoleLayout />);
    const metaSlot = screen.getByTestId('slot-oc.metadata');
    expect(metaSlot).toBeInTheDocument();
    expect(metaSlot.textContent).toContain('—');
  });

  it('renders the four channel slots in fallback state with empty bindings', () => {
    render(<OperatorConsoleLayout bindings={{}} tileData={{}} />);
    for (const id of ['oc.ch1a', 'oc.ch1b', 'oc.ch1c', 'oc.ch1d']) {
      const slot = screen.getByTestId(`slot-${id}`);
      expect(slot).toBeInTheDocument();
      expect(slot.getAttribute('data-state')).toBe('fallback');
    }
  });

  it('renders the event-log slot empty when no binding is supplied', () => {
    const { container } = render(
      <OperatorConsoleLayout bindings={{}} tileData={{}} />,
    );
    const logSlot = screen.getByTestId('slot-oc.event-log');
    expect(logSlot).toBeInTheDocument();
    // No hardcoded 8-row fake log; fallback frame only.
    const rows = logSlot.querySelectorAll('li.oc-log__row');
    expect(rows.length).toBe(0);
    // And no leaked status literals from the old default log.
    const text = container.textContent ?? '';
    expect(text).not.toContain('Warehouse ingest');
    expect(text).not.toContain('schema_hash=a3f91c');
    expect(text).not.toContain('bigquery slot saturation');
  });
});
