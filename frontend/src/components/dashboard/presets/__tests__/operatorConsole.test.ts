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
    // Near-black bg: every RGB component < 0x30
    const rgb = hex(bg);
    const r = (rgb >> 16) & 0xff;
    const g = (rgb >> 8) & 0xff;
    const b = rgb & 0xff;
    expect(r).toBeLessThan(0x30);
    expect(g).toBeLessThan(0x30);
    expect(b).toBeLessThan(0x30);
    // Foreground primary is phosphor green (green channel highest)
    const fgRgb = hex(fg);
    const fR = (fgRgb >> 16) & 0xff;
    const fG = (fgRgb >> 8) & 0xff;
    const fB = fgRgb & 0xff;
    expect(fG).toBeGreaterThan(fR);
    expect(fG).toBeGreaterThan(fB);
    // Accent === fg for positives (color-by-weight contract)
    expect(accent.toLowerCase()).toBe(fg.toLowerCase());
    expect(radius).toBe(0);
    expect(density).toBe('compact');
  });

  it('does not use a banned mono family', () => {
    const banned = /ibm plex mono|space mono|fira code/i;
    expect(operatorConsolePreset.tokens.fontMono).not.toMatch(banned);
    expect(operatorConsolePreset.tokens.fontBody).not.toMatch(banned);
    expect(operatorConsolePreset.tokens.fontDisplay).not.toMatch(banned);
    expect(operatorConsolePreset.tokens.fontMono).toMatch(/OperatorConsoleMono/);
  });

  it('starter has the six semantic zones arranged under a vertical root', () => {
    const root = operatorConsolePreset.starter.tiledRoot;
    expect(root).toBeTruthy();
    expect(root!.type).toBe('container-vert');
    const topLevelIds = (root as { children: { id: string }[] }).children.map(c => c.id);
    expect(topLevelIds).toEqual(['oc-status', 'oc-ch1', 'oc-ch2', 'oc-split', 'oc-footer']);
    const split = (root as { children: { id: string; children?: { id: string }[] }[] })
      .children.find(c => c.id === 'oc-split');
    expect(split?.children?.map(c => c.id)).toEqual(['oc-ch3', 'oc-ch4']);
  });

  it('floatingLayer is empty (pure tiled)', () => {
    expect(operatorConsolePreset.starter.floatingLayer).toEqual([]);
  });

  it('references fixture worksheet ids for the chart zones', () => {
    const refs: string[] = [];
    function walk(z: unknown) {
      const zone = z as { worksheetRef?: string; children?: unknown[] };
      if (zone.worksheetRef) refs.push(zone.worksheetRef);
      (zone.children ?? []).forEach(walk);
    }
    walk(operatorConsolePreset.starter.tiledRoot);
    expect(refs).toEqual(expect.arrayContaining(['oc:revenueTrace', 'oc:churnBins']));
  });
});
