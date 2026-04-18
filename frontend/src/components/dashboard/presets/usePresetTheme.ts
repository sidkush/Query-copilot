/**
 * usePresetTheme — writes the active DashboardPreset's tokens onto
 * `<html>` so global CSS can react.
 *
 * Side-effects applied on each render when `presetId` changes:
 *   - `html[data-active-preset="<id>"]`
 *   - `html.preset-scheme-dark|light` (mutually exclusive)
 *   - `--preset-bg`, `--preset-fg`, `--preset-accent`, `--preset-accent-warn`,
 *     `--preset-border`, `--preset-font-display`, `--preset-font-body`,
 *     `--preset-font-mono`, `--preset-radius` (with `px` suffix),
 *     `--preset-density`
 *
 * Unknown ids fall back to the default preset's tokens via `getPreset()`, but
 * the `data-active-preset` attribute still reflects the caller-supplied id so
 * plan-level hooks (analytics, debug inspector) can see the actual selection.
 *
 * CSS custom properties intentionally persist across unmounts — there is
 * exactly one dashboard shell at a time, and leaving the last-applied values
 * in place prevents a visual flash when the shell re-mounts (e.g. after
 * route-level suspense boundaries resolve).
 *
 * Wave 2-C · Plan A · Task 12.
 */
import { useEffect } from 'react';
import { getPreset } from './registry';

const PRESET_CSS_VARS = [
  '--preset-bg',
  '--preset-fg',
  '--preset-accent',
  '--preset-accent-warn',
  '--preset-border',
  '--preset-font-display',
  '--preset-font-body',
  '--preset-font-mono',
  '--preset-radius',
  '--preset-density',
] as const;

export function usePresetTheme(presetId: string): void {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const html = document.documentElement;
    const preset = getPreset(presetId);
    const { tokens } = preset;

    html.setAttribute('data-active-preset', presetId);

    // Scheme class — mutually exclusive, so clear both then add the active one.
    html.classList.remove('preset-scheme-dark', 'preset-scheme-light');
    html.classList.add(
      preset.scheme === 'light' ? 'preset-scheme-light' : 'preset-scheme-dark',
    );

    const style = html.style;
    style.setProperty('--preset-bg', tokens.bg);
    style.setProperty('--preset-fg', tokens.fg);
    style.setProperty('--preset-accent', tokens.accent);
    style.setProperty('--preset-accent-warn', tokens.accentWarn);
    style.setProperty('--preset-border', tokens.border);
    style.setProperty('--preset-font-display', tokens.fontDisplay);
    style.setProperty('--preset-font-body', tokens.fontBody);
    style.setProperty('--preset-font-mono', tokens.fontMono);
    style.setProperty('--preset-radius', `${tokens.radius}px`);
    style.setProperty('--preset-density', tokens.density);
  }, [presetId]);
}

/** Exposed for test-suites that want to assert the var list without
 *  hardcoding it in their assertions. */
export const _PRESET_CSS_VARS = PRESET_CSS_VARS;
