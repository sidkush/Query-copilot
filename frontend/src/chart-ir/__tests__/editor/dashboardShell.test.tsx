import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DashboardShell from '../../../components/dashboard/DashboardShell';

const SAMPLE_TILES = [
  { id: 't1', title: 'Revenue by region' },
  { id: 't2', title: 'Users over time', tab: 'Users' },
];

describe('DashboardShell', () => {
  it('mounts with the Briefing layout by default', () => {
    render(<DashboardShell tiles={SAMPLE_TILES} />);
    expect(screen.getByTestId('dashboard-shell').getAttribute('data-active-mode')).toBe('briefing');
    expect(screen.getByTestId('layout-briefing')).toBeDefined();
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
    // are async — use waitFor for each transition.
    render(<DashboardShell tiles={SAMPLE_TILES} />);

    fireEvent.click(screen.getByTestId('dashboard-mode-workbench'));
    await waitFor(() => expect(screen.getByTestId('layout-workbench')).toBeDefined());
    expect(screen.queryByTestId('layout-briefing')).toBeNull();

    fireEvent.click(screen.getByTestId('dashboard-mode-ops'));
    await waitFor(() => expect(screen.getByTestId('layout-ops')).toBeDefined());

    fireEvent.click(screen.getByTestId('dashboard-mode-story'));
    await waitFor(() => expect(screen.getByTestId('layout-story')).toBeDefined());

    fireEvent.click(screen.getByTestId('dashboard-mode-pitch'));
    await waitFor(() => expect(screen.getByTestId('layout-pitch')).toBeDefined());

    fireEvent.click(screen.getByTestId('dashboard-mode-tableau'));
    await waitFor(() => expect(screen.getByTestId('layout-tableau')).toBeDefined());
  });

  it('fires onModeChange on mode switch', () => {
    const onModeChange = vi.fn();
    render(<DashboardShell tiles={[]} onModeChange={onModeChange} />);
    fireEvent.click(screen.getByTestId('dashboard-mode-story'));
    expect(onModeChange).toHaveBeenCalledWith('story');
  });

  it('respects initialMode prop', () => {
    render(<DashboardShell tiles={[]} initialMode="pitch" />);
    expect(screen.getByTestId('dashboard-shell').getAttribute('data-active-mode')).toBe('pitch');
    expect(screen.getByTestId('layout-pitch')).toBeDefined();
  });

  it('tableau layout renders one positioned tile per input tile', () => {
    render(<DashboardShell tiles={SAMPLE_TILES} initialMode="tableau" />);
    expect(screen.getByTestId('layout-tableau')).toBeDefined();
    expect(screen.getByTestId('layout-tableau-tile-t1')).toBeDefined();
    expect(screen.getByTestId('layout-tableau-tile-t2')).toBeDefined();
  });

  it('renders empty state when no tiles provided', () => {
    render(<DashboardShell tiles={[]} initialMode="briefing" />);
    expect(screen.getByTestId('layout-empty')).toBeDefined();
  });
});
