import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import DashboardShell from '../../../components/dashboard/DashboardShell';
import { useStore } from '../../../store';
import { emptyDashboardForPreset } from '../../../components/dashboard/freeform/lib/dashboardShape';

const SAMPLE_TILES = [
  { id: 't1', title: 'Revenue by region' },
  { id: 't2', title: 'Users over time', tab: 'Users' },
];

describe('DashboardShell — preset-driven', () => {
  beforeEach(() => {
    useStore.setState({ analystProDashboard: emptyDashboardForPreset('analyst-pro') });
  });

  afterEach(() => {
    cleanup();
    document.documentElement.removeAttribute('data-active-preset');
  });

  it('mounts AnalystProLayout once regardless of active preset', async () => {
    render(<DashboardShell tiles={SAMPLE_TILES} />);
    await waitFor(
      () => expect(screen.getByTestId('layout-analyst-pro')).toBeDefined(),
      { timeout: 3000 },
    );
    // No archetype-era layouts should exist
    expect(screen.queryByTestId('layout-briefing')).toBeNull();
    expect(screen.queryByTestId('layout-workbench')).toBeNull();
    expect(screen.queryByTestId('layout-ops')).toBeNull();
    expect(screen.queryByTestId('layout-story')).toBeNull();
    expect(screen.queryByTestId('layout-pitch')).toBeNull();
    expect(screen.queryByTestId('layout-tableau')).toBeNull();
  });

  it('defaults initialMode to analyst-pro on the shell', () => {
    render(<DashboardShell tiles={[]} />);
    expect(screen.getByTestId('dashboard-shell').getAttribute('data-active-mode')).toBe('analyst-pro');
  });

  it('still mounts AnalystProLayout when tiles is empty', async () => {
    render(<DashboardShell tiles={[]} />);
    await waitFor(
      () => expect(screen.getByTestId('layout-analyst-pro')).toBeDefined(),
      { timeout: 3000 },
    );
  });

  it('sets data-active-preset on <html> after switchPreset', async () => {
    render(<DashboardShell tiles={SAMPLE_TILES} />);
    await waitFor(
      () => expect(screen.getByTestId('layout-analyst-pro')).toBeDefined(),
      { timeout: 3000 },
    );
    // Ensure dashboard state carries preset fields even after the layout
    // seeded its own authored dashboard into the store.
    useStore.setState({ analystProDashboard: emptyDashboardForPreset('analyst-pro') });
    useStore.getState().switchPreset('analyst-pro');
    await waitFor(
      () =>
        expect(document.documentElement.getAttribute('data-active-preset')).toBe(
          'analyst-pro',
        ),
      { timeout: 3000 },
    );
  });
});
