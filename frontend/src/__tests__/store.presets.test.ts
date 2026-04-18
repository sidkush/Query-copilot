import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../store';
import { emptyDashboardForPreset } from '../components/dashboard/freeform/lib/dashboardShape';

describe('store — preset actions', () => {
  beforeEach(() => {
    useStore.setState({ analystProDashboard: emptyDashboardForPreset('analyst-pro') });
  });

  it('switchPreset updates activePresetId on the dashboard', () => {
    useStore.getState().switchPreset('analyst-pro');
    expect(useStore.getState().analystProDashboard?.activePresetId).toBe('analyst-pro');
  });

  it('persistPresetLayout writes the current zone tree under the active preset key', () => {
    const tree = { tiledRoot: { id: 'r', type: 'container', children: [] } as never, floatingLayer: [] };
    useStore.getState().persistPresetLayout(tree);
    expect(useStore.getState().analystProDashboard?.presetLayouts['analyst-pro']).toEqual(tree);
  });
});
