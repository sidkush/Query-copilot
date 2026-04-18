import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, screen, cleanup } from '@testing-library/react';
import DashboardPresetSwitcher from '../DashboardPresetSwitcher';
import { useStore } from '../../../store';
import { _registerPreset, listPresets } from '../presets/registry';
import { emptyDashboardForPreset } from '../freeform/lib/dashboardShape';

describe('DashboardPresetSwitcher click → store update', () => {
  beforeEach(() => {
    cleanup();
    if (!listPresets().some((p) => p.id === 'test-alt')) {
      _registerPreset({
        id: 'test-alt',
        name: 'Test Alt',
        tagline: 'fixture',
        scheme: 'dark',
        tokens: listPresets()[0].tokens,
      } as never);
    }
    useStore.setState({ analystProDashboard: emptyDashboardForPreset('analyst-pro') });
  });

  it('moves activePresetId when a pill is clicked', () => {
    render(<DashboardPresetSwitcher />);
    fireEvent.click(screen.getByTestId('dashboard-preset-test-alt'));
    expect(useStore.getState().analystProDashboard?.activePresetId).toBe('test-alt');
  });

  it('works even when the store starts with analystProDashboard === null', () => {
    useStore.setState({ analystProDashboard: null });
    render(<DashboardPresetSwitcher />);
    fireEvent.click(screen.getByTestId('dashboard-preset-test-alt'));
    expect(useStore.getState().analystProDashboard?.activePresetId).toBe('test-alt');
  });
});
