import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

  it('swaps the layout when a mode button is clicked', () => {
    render(<DashboardShell tiles={SAMPLE_TILES} />);
    fireEvent.click(screen.getByTestId('dashboard-mode-workbench'));
    expect(screen.getByTestId('layout-workbench')).toBeDefined();
    expect(screen.queryByTestId('layout-briefing')).toBeNull();

    fireEvent.click(screen.getByTestId('dashboard-mode-ops'));
    expect(screen.getByTestId('layout-ops')).toBeDefined();

    fireEvent.click(screen.getByTestId('dashboard-mode-story'));
    expect(screen.getByTestId('layout-story')).toBeDefined();

    fireEvent.click(screen.getByTestId('dashboard-mode-pitch'));
    expect(screen.getByTestId('layout-pitch')).toBeDefined();

    fireEvent.click(screen.getByTestId('dashboard-mode-tableau'));
    expect(screen.getByTestId('layout-workbook')).toBeDefined();
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

  it('workbook layout groups tiles into tabs', () => {
    render(<DashboardShell tiles={SAMPLE_TILES} initialMode="tableau" />);
    expect(screen.getByTestId('workbook-tab-Tab 1')).toBeDefined();
    expect(screen.getByTestId('workbook-tab-Users')).toBeDefined();
  });

  it('renders empty state when no tiles provided', () => {
    render(<DashboardShell tiles={[]} initialMode="briefing" />);
    expect(screen.getByTestId('layout-empty')).toBeDefined();
  });
});
