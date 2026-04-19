import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DashboardPresetSwitcher from '../DashboardPresetSwitcher';
import { _registerPreset, listPresets } from '../presets/registry';
import { useStore } from '../../../store';
import { emptyDashboardForPreset } from '../freeform/lib/dashboardShape';

describe('DashboardPresetSwitcher', () => {
  beforeEach(() => {
    // register a second preset so the switcher isn't hidden
    _registerPreset({
      id: 'test-alt',
      name: 'Test Alt',
      tagline: 'fixture',
      scheme: 'dark',
      tokens: listPresets()[0].tokens,
    });
    useStore.setState({ analystProDashboard: emptyDashboardForPreset('analyst-pro') });
  });

  it('renders a pill for each registered preset', () => {
    render(<DashboardPresetSwitcher />);
    expect(screen.getByTestId('dashboard-preset-analyst-pro')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-preset-test-alt')).toBeInTheDocument();
  });

  it('clicking a pill fires switchPreset and updates activePresetId', () => {
    const spy = vi.spyOn(useStore.getState(), 'switchPreset');
    render(<DashboardPresetSwitcher />);
    fireEvent.click(screen.getByTestId('dashboard-preset-test-alt'));
    expect(spy).toHaveBeenCalledWith('test-alt');
  });
});
