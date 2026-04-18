/**
 * usePresetTheme — applies active preset tokens as CSS custom properties on
 * <html> and sets a `data-active-preset` attribute + `preset-scheme-*` class
 * so global CSS can react to the active preset.
 *
 * Wave 2-C, Plan A, Task 12.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, cleanup } from '@testing-library/react';
import { usePresetTheme } from '../usePresetTheme';
import { getPreset } from '../registry';

function clearRoot(): void {
  const html = document.documentElement;
  html.removeAttribute('data-active-preset');
  html.classList.remove('preset-scheme-dark', 'preset-scheme-light');
  const props = [
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
  ];
  for (const p of props) html.style.removeProperty(p);
}

describe('usePresetTheme', () => {
  beforeEach(() => {
    clearRoot();
  });
  afterEach(() => {
    cleanup();
    clearRoot();
  });

  it('sets data-active-preset on <html> to the active preset id', () => {
    renderHook(() => usePresetTheme('analyst-pro'));
    expect(document.documentElement.getAttribute('data-active-preset')).toBe('analyst-pro');
  });

  it('falls back to the default preset when given an unknown id', () => {
    renderHook(() => usePresetTheme('nonexistent-preset'));
    // The attribute reflects whatever the caller passed (normalized via registry fallback)
    // but the CSS-var values come from the default (analyst-pro) preset.
    const accent = document.documentElement.style.getPropertyValue('--preset-accent');
    expect(accent).toBe(getPreset('analyst-pro').tokens.accent);
  });

  it('adds the preset-scheme-{scheme} class corresponding to preset.scheme', () => {
    renderHook(() => usePresetTheme('analyst-pro'));
    const preset = getPreset('analyst-pro');
    const expected = preset.scheme === 'light' ? 'preset-scheme-light' : 'preset-scheme-dark';
    expect(document.documentElement.classList.contains(expected)).toBe(true);
  });

  it('writes every required preset CSS custom property on the root element', () => {
    renderHook(() => usePresetTheme('analyst-pro'));
    const preset = getPreset('analyst-pro');
    const style = document.documentElement.style;
    expect(style.getPropertyValue('--preset-bg')).toBe(preset.tokens.bg);
    expect(style.getPropertyValue('--preset-fg')).toBe(preset.tokens.fg);
    expect(style.getPropertyValue('--preset-accent')).toBe(preset.tokens.accent);
    expect(style.getPropertyValue('--preset-accent-warn')).toBe(preset.tokens.accentWarn);
    expect(style.getPropertyValue('--preset-border')).toBe(preset.tokens.border);
    expect(style.getPropertyValue('--preset-font-display')).toBe(preset.tokens.fontDisplay);
    expect(style.getPropertyValue('--preset-font-body')).toBe(preset.tokens.fontBody);
    expect(style.getPropertyValue('--preset-font-mono')).toBe(preset.tokens.fontMono);
    expect(style.getPropertyValue('--preset-density')).toBe(preset.tokens.density);
  });

  it('writes radius as a px-suffixed string', () => {
    renderHook(() => usePresetTheme('analyst-pro'));
    const preset = getPreset('analyst-pro');
    expect(document.documentElement.style.getPropertyValue('--preset-radius')).toBe(
      `${preset.tokens.radius}px`,
    );
  });

  it('re-applies tokens when the preset id changes (rerender)', () => {
    const { rerender } = renderHook((id: string) => usePresetTheme(id), {
      initialProps: 'analyst-pro',
    });
    expect(document.documentElement.getAttribute('data-active-preset')).toBe('analyst-pro');
    // Re-render with a fallback id; hook should still resolve via registry to the
    // default preset and update the attribute accordingly.
    rerender('also-analyst-pro');
    expect(document.documentElement.getAttribute('data-active-preset')).toBe('also-analyst-pro');
  });
});
