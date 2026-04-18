import { describe, it, expect } from 'vitest';
import { isDashboardPreset } from '../types';
import { getPreset, listPresets } from '../registry';
import { boardPackPreset } from '../boardPack';

describe('Board Pack preset', () => {
  it('passes the isDashboardPreset validator', () => {
    expect(isDashboardPreset(boardPackPreset)).toBe(true);
  });

  it('self-registers under id "board-pack"', () => {
    expect(getPreset('board-pack').id).toBe('board-pack');
    expect(listPresets().map(p => p.id)).toContain('board-pack');
  });

  it('uses the light scheme (overrides the global toggle)', () => {
    expect(boardPackPreset.scheme).toBe('light');
  });

  it('carries the cream + red palette and zero radius', () => {
    expect(boardPackPreset.tokens.bg.toLowerCase()).toBe('#f5f1e8');
    expect(boardPackPreset.tokens.accentWarn.toLowerCase()).toBe('#c83e3e');
    expect(boardPackPreset.tokens.radius).toBe(0);
    expect(boardPackPreset.tokens.density).toBe('spacious');
  });

  it('does not use a banned font family', () => {
    const banned = /inter\b|dm sans|outfit|plus jakarta|instrument/i;
    expect(boardPackPreset.tokens.fontDisplay).not.toMatch(banned);
    expect(boardPackPreset.tokens.fontBody).not.toMatch(banned);
  });
});
