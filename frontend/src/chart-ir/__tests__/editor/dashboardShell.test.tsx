import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DashboardShell from '../../../components/dashboard/DashboardShell';

const SAMPLE_TILES = [
  { id: 't1', title: 'Revenue by region' },
  { id: 't2', title: 'Users over time', tab: 'Users' },
];

describe('DashboardShell', () => {
  it('mounts with the Briefing layout by default', async () => {
    render(<DashboardShell tiles={SAMPLE_TILES} />);
    expect(screen.getByTestId('dashboard-shell').getAttribute('data-active-mode')).toBe('briefing');
    await waitFor(() => expect(screen.getByTestId('layout-briefing')).toBeDefined(), { timeout: 3000 });
  });

  it('renders the mode toggle with all six archetypes', () => {
    render(<DashboardShell tiles={[]} />);
    expect(screen.getByTestId('dashboard-mode-briefing')).toBeDefined();
    expect(screen.getByTestId('dashboard-mode-workbench')).toBeDefined();
    expect(screen.getByTestId('dashboard-mode-ops')).toBeDefined();
    expect(screen.getByTestId('dashboard-mode-story')).toBeDefined();
    expect(screen.getByTestId('dashboard-mode-pitch')).toBeDefined();
    expect(screen.getByTestId('dashboard-mode-tableau')).toBeDefined();
  });

  it('swaps the layout when a mode button is clicked', async () => {
    // DashboardShell wraps layouts in AnimatePresence mode="wait" so swaps
    // are async — use waitFor for each transition. Lazy-loaded layouts need
    // a generous timeout under parallel test load.
    const opts = { timeout: 3000 };
    render(<DashboardShell tiles={SAMPLE_TILES} />);

    fireEvent.click(screen.getByTestId('dashboard-mode-workbench'));
    await waitFor(() => expect(screen.getByTestId('layout-workbench')).toBeDefined(), opts);
    expect(screen.queryByTestId('layout-briefing')).toBeNull();

    fireEvent.click(screen.getByTestId('dashboard-mode-ops'));
    await waitFor(() => expect(screen.getByTestId('layout-ops')).toBeDefined(), opts);

    fireEvent.click(screen.getByTestId('dashboard-mode-story'));
    await waitFor(() => expect(screen.getByTestId('layout-story')).toBeDefined(), opts);

    fireEvent.click(screen.getByTestId('dashboard-mode-pitch'));
    await waitFor(() => expect(screen.getByTestId('layout-pitch')).toBeDefined(), opts);

    fireEvent.click(screen.getByTestId('dashboard-mode-tableau'));
    await waitFor(() => expect(screen.getByTestId('layout-tableau')).toBeDefined(), opts);
  });

  it('fires onModeChange on mode switch', () => {
    const onModeChange = vi.fn();
    render(<DashboardShell tiles={[]} onModeChange={onModeChange} />);
    fireEvent.click(screen.getByTestId('dashboard-mode-story'));
    expect(onModeChange).toHaveBeenCalledWith('story');
  });

  it('respects initialMode prop', async () => {
    render(<DashboardShell tiles={[]} initialMode="pitch" />);
    expect(screen.getByTestId('dashboard-shell').getAttribute('data-active-mode')).toBe('pitch');
    await waitFor(() => expect(screen.getByTestId('layout-pitch')).toBeDefined(), { timeout: 3000 });
  });

  it('tableau layout renders one positioned tile per input tile', async () => {
    render(<DashboardShell tiles={SAMPLE_TILES} initialMode="tableau" />);
    await waitFor(() => expect(screen.getByTestId('layout-tableau')).toBeDefined(), { timeout: 3000 });
    expect(screen.getByTestId('layout-tableau-tile-t1')).toBeDefined();
    expect(screen.getByTestId('layout-tableau-tile-t2')).toBeDefined();
  });

  it('renders empty state when no tiles provided', async () => {
    render(<DashboardShell tiles={[]} initialMode="briefing" />);
    await waitFor(() => expect(screen.getByTestId('layout-empty')).toBeDefined(), { timeout: 3000 });
  });
});
