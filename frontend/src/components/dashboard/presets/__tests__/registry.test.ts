import { describe, it, expect } from 'vitest';
import { getPreset, listPresets, DEFAULT_PRESET_ID } from '../registry';
import { isDashboardPreset } from '../types';

describe('preset registry', () => {
  it('exposes analyst-pro as the default preset', () => {
    expect(DEFAULT_PRESET_ID).toBe('analyst-pro');
    expect(getPreset('analyst-pro').id).toBe('analyst-pro');
  });

  it('returns the default preset for unknown ids', () => {
    expect(getPreset('made-up').id).toBe('analyst-pro');
  });

  it('listPresets returns all four registered presets alongside analyst-pro', () => {
    const ids = listPresets().map((p) => p.id);
    expect(ids).toContain('analyst-pro');
    expect(ids).toContain('board-pack');
    expect(ids).toContain('operator-console');
    expect(ids).toContain('signal');
    expect(ids).toContain('editorial-brief');
  });

  it('the analyst-pro preset validates as a DashboardPreset', () => {
    expect(isDashboardPreset(getPreset('analyst-pro'))).toBe(true);
  });
});
