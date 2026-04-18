// Bespoke OperatorConsoleLayout — Plan A* Phase 4 (Wave 2-OC)
// TDD contract:
//  - root testid `layout-operator-console`
//  - four channel tiles (CH.1A–D)
//  - anomaly callout text `ANOMALY · T+498`
//  - event log has 8 rows with at least one OK / WARN / ERR status each
//  - root computed bg === rgb(10, 20, 14) (#0a140e)
//  - root computed color === rgb(181, 216, 160) (#b5d8a0)
//  - root font-family string includes `monospace` or JetBrains Mono

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import OperatorConsoleLayout from '../OperatorConsoleLayout';

afterEach(cleanup);

describe('OperatorConsoleLayout (bespoke, wireframe 2)', () => {
  it('renders the root with the expected data-testid + preset attr', () => {
    render(<OperatorConsoleLayout />);
    const root = screen.getByTestId('layout-operator-console');
    expect(root).toBeInTheDocument();
    expect(root).toHaveAttribute('data-preset', 'operator-console');
    expect(root).toHaveClass('oc-layout');
  });

  it('renders four channel tiles under CH.1', () => {
    render(<OperatorConsoleLayout />);
    const ch1 = screen.getByTestId('operator-console-ch1');
    const tiles = ch1.querySelectorAll('.oc-channel');
    expect(tiles.length).toBe(4);
    // Each tile carries a data-channel attribute
    const channelIds = Array.from(tiles).map((el) =>
      el.getAttribute('data-channel'),
    );
    expect(channelIds).toEqual(['ch1a', 'ch1b', 'ch1c', 'ch1d']);
  });

  it('shows the anomaly callout with the EVT timestamp text', () => {
    render(<OperatorConsoleLayout />);
    // Callout title + meta are split into separate nodes; assert on title.
    expect(screen.getByText(/ANOMALY · T\+498/)).toBeInTheDocument();
    // Bound context bits also present.
    expect(
      screen.getByText(/ΔSlope 2\.3σ above baseline/),
    ).toBeInTheDocument();
    expect(screen.getByText(/corr: acme_renewal · 0\.89/)).toBeInTheDocument();
  });

  it('renders 8 event-log rows spanning OK / WARN / ERR statuses', () => {
    render(<OperatorConsoleLayout />);
    const log = screen.getByTestId('operator-console-eventlog');
    const rows = log.querySelectorAll('li.oc-log__row');
    expect(rows.length).toBe(8);

    const okRows = log.querySelectorAll('li.oc-log__row[data-status="ok"]');
    const warnRows = log.querySelectorAll('li.oc-log__row[data-status="warn"]');
    const errRows = log.querySelectorAll('li.oc-log__row[data-status="err"]');
    expect(okRows.length).toBeGreaterThanOrEqual(1);
    expect(warnRows.length).toBeGreaterThanOrEqual(1);
    expect(errRows.length).toBeGreaterThanOrEqual(1);
    expect(okRows.length + warnRows.length + errRows.length).toBe(8);
  });

  it('renders the mission-control top strip with operator name + WATCH warn', () => {
    render(<OperatorConsoleLayout />);
    expect(screen.getByText(/M\.CHEN/)).toBeInTheDocument();
    expect(screen.getByText(/3 WATCH/)).toBeInTheDocument();
  });

  it('renders the CH.2 revenue trace header meta', () => {
    render(<OperatorConsoleLayout />);
    const ch2 = screen.getByTestId('operator-console-ch2');
    expect(
      within(ch2).getByText(/12mo · bandwidth 30d · sampling 1\/day/),
    ).toBeInTheDocument();
  });

  it('renders the footer uplink status', () => {
    render(<OperatorConsoleLayout />);
    expect(
      screen.getByText(/BIGQUERY:\/\/PROD\.FINANCE_REPORTS/),
    ).toBeInTheDocument();
    expect(screen.getByText(/UPLINK OK/)).toBeInTheDocument();
  });

  it('applies the phosphor-on-black theme from the stylesheet', () => {
    render(<OperatorConsoleLayout />);
    const root = screen.getByTestId('layout-operator-console');
    const style = window.getComputedStyle(root);
    // Background near-black with faint green tint: #0a140e → rgb(10, 20, 14)
    expect(style.backgroundColor).toBe('rgb(10, 20, 14)');
    // Foreground phosphor green: #b5d8a0 → rgb(181, 216, 160)
    expect(style.color).toBe('rgb(181, 216, 160)');
    // Font stack is monospace — JetBrains Mono first, generic monospace last.
    const fontFamily = style.fontFamily.toLowerCase();
    const isMono =
      fontFamily.includes('monospace') ||
      fontFamily.includes('jetbrains mono');
    expect(isMono).toBe(true);
  });
});
