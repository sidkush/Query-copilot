import { describe, it, expect } from 'vitest';
import { emptyDashboardForPreset } from '../lib/dashboardShape';

describe('dashboard shape — preset fields', () => {
  it('creates a dashboard whose activePresetId matches the seed preset', () => {
    const d = emptyDashboardForPreset('analyst-pro');
    expect(d.activePresetId).toBe('analyst-pro');
    // presetLayouts starts empty — slots are seeded lazily on first switch
    expect(d.presetLayouts).toEqual({});
  });
});
