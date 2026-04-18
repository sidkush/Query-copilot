import { describe, it, expect } from 'vitest';
import { isDashboardPreset } from '../types';
import { getPreset, listPresets } from '../registry';
import { operatorConsolePreset } from '../operatorConsole';

describe('Operator Console preset', () => {
  it('passes the isDashboardPreset validator', () => {
    expect(isDashboardPreset(operatorConsolePreset)).toBe(true);
  });

  it('self-registers under id "operator-console"', () => {
    expect(getPreset('operator-console').id).toBe('operator-console');
    expect(listPresets().map(p => p.id)).toContain('operator-console');
  });

  it('uses the dark scheme (overrides the global toggle)', () => {
    expect(operatorConsolePreset.scheme).toBe('dark');
  });

  it('carries the phosphor palette — near-black bg, green fg, radius 0, compact', () => {
    const { bg, fg, accent, radius, density } = operatorConsolePreset.tokens;
    const hex = (h: string) => parseInt(h.replace('#', '').padEnd(6, '0').slice(0, 6), 16);
    const rgb = hex(bg);
    const r = (rgb >> 16) & 0xff;
    const g = (rgb >> 8) & 0xff;
    const b = rgb & 0xff;
    expect(r).toBeLessThan(0x30);
    expect(g).toBeLessThan(0x30);
    expect(b).toBeLessThan(0x30);
    const fgRgb = hex(fg);
    const fR = (fgRgb >> 16) & 0xff;
    const fG = (fgRgb >> 8) & 0xff;
    const fB = fgRgb & 0xff;
    expect(fG).toBeGreaterThan(fR);
    expect(fG).toBeGreaterThan(fB);
    expect(accent.toLowerCase()).toBe(fg.toLowerCase());
    expect(radius).toBe(0);
    expect(density).toBe('compact');
  });

  it('does not use a banned mono family', () => {
    const banned = /ibm plex mono|space mono|fira code/i;
    expect(operatorConsolePreset.tokens.fontMono).not.toMatch(banned);
    expect(operatorConsolePreset.tokens.fontBody).not.toMatch(banned);
    expect(operatorConsolePreset.tokens.fontDisplay).not.toMatch(banned);
    expect(operatorConsolePreset.tokens.fontMono).toMatch(/JetBrains Mono|ui-monospace/i);
  });
});
