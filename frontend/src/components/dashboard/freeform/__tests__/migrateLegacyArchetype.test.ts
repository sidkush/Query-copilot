import { describe, it, expect } from 'vitest';
import { migrateLegacyArchetype } from '../lib/migrateLegacyArchetype';

describe('migrateLegacyArchetype', () => {
  it('maps six legacy archetype ids to analyst-pro (their content renders there now)', () => {
    for (const legacy of ['briefing','workbench','ops','story','pitch','tableau']) {
      const out = migrateLegacyArchetype({ archetype: legacy } as never);
      expect(out.activePresetId).toBe('analyst-pro');
      expect('archetype' in out).toBe(false);
    }
  });

  it('keeps analyst-pro as is', () => {
    const out = migrateLegacyArchetype({ archetype: 'analyst-pro' } as never);
    expect(out.activePresetId).toBe('analyst-pro');
  });

  it('is a no-op when activePresetId already set', () => {
    const out = migrateLegacyArchetype({ activePresetId: 'analyst-pro', presetLayouts: {} } as never);
    expect(out.activePresetId).toBe('analyst-pro');
  });
});
