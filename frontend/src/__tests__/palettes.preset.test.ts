/**
 * setChartChromeFromPreset — chart chrome reads the active DashboardPreset
 * from the registry and applies its scheme. Per-preset palette overrides
 * (phosphor green for Operator Console, amber for Editorial Brief) land in
 * Plans B-E; here a preset's scheme is all we need.
 *
 * Wave 2-C · Plan A · Task 13.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  setChartChromeFromPreset,
  setChartChromeScheme,
} from '../vizql/palettes';
import * as palettes from '../vizql/palettes';

function resetChromeToDark(): void {
  setChartChromeScheme('dark');
}

describe('setChartChromeFromPreset', () => {
  beforeEach(() => {
    resetChromeToDark();
  });

  it('is exported as a function', () => {
    expect(typeof setChartChromeFromPreset).toBe('function');
  });

  it('leaves the existing setChartChromeScheme export intact for back-compat', () => {
    expect(typeof setChartChromeScheme).toBe('function');
  });

  it('applies the analyst-pro preset (dark scheme) chrome colors', () => {
    // Switch to light first so we can verify the preset drags it back to dark.
    setChartChromeScheme('light');
    expect(palettes.GRID_COLOR).toBe('rgba(15,23,42,0.10)');

    setChartChromeFromPreset('analyst-pro');
    // analyst-pro is a dark-scheme preset — chrome colors should match dark.
    expect(palettes.GRID_COLOR).toBe('rgba(255,255,255,0.06)');
    expect(palettes.AXIS_COLOR).toBe('rgba(235,238,245,0.72)');
    expect(palettes.LABEL_COLOR).toBe('rgba(235,238,245,0.85)');
  });

  it('falls back to the default preset chrome when given an unknown id', () => {
    setChartChromeScheme('light');
    setChartChromeFromPreset('bogus-preset');
    // default preset = analyst-pro = dark.
    expect(palettes.GRID_COLOR).toBe('rgba(255,255,255,0.06)');
  });
});
