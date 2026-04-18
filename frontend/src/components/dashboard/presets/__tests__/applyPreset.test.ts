import { describe, it, expect } from 'vitest';
import { applyPreset } from '../applyPreset';
import { emptyDashboardForPreset } from '../../freeform/lib/dashboardShape';

describe('applyPreset', () => {
  it('returns the same dashboard object when id already active', () => {
    const d = emptyDashboardForPreset('analyst-pro');
    const out = applyPreset(d, 'analyst-pro');
    expect(out).toBe(d);
  });

  it('switches activePresetId to the resolved preset on first switch', () => {
    const d = emptyDashboardForPreset('analyst-pro');
    const next = applyPreset(d, 'board-pack');
    // board-pack is now a registered preset — activePresetId should update
    expect(next.activePresetId).toBe('board-pack');
  });

  it('preserves an already-saved layout when re-entering a preset', () => {
    const d = emptyDashboardForPreset('analyst-pro');
    d.presetLayouts['analyst-pro'] = {
      tiledRoot: { id: 'root', type: 'container', children: [] } as never,
      floatingLayer: [],
    };
    const next = applyPreset(d, 'analyst-pro');
    expect(next.presetLayouts['analyst-pro'].tiledRoot).toEqual(d.presetLayouts['analyst-pro'].tiledRoot);
  });
});
