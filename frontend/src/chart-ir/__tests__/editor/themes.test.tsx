import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  getThemeTokens,
  listThemes,
  listStageThemes,
  listBaseThemes,
  themeToCssVars,
} from '../../../components/editor/themes/themeRegistry';
import ThemeProvider from '../../../components/editor/themes/ThemeProvider';

describe('themeRegistry', () => {
  it('exposes the two base themes + six stage themes', () => {
    const all = listThemes();
    const ids = all.map((t: { id: string }) => t.id);
    expect(ids).toContain('light');
    expect(ids).toContain('dark');
    expect(ids).toContain('stage-quiet-executive');
    expect(ids).toContain('stage-iron-man');
    expect(ids).toContain('stage-bloomberg');
    expect(ids).toContain('stage-mission-control');
    expect(ids).toContain('stage-cyberpunk');
    expect(ids).toContain('stage-vision-pro');
    expect(all).toHaveLength(8);
  });

  it('listStageThemes filters to kind = stage', () => {
    const stage = listStageThemes();
    expect(stage).toHaveLength(6);
    for (const t of stage) {
      expect((t as { kind: string }).kind).toBe('stage');
    }
  });

  it('listBaseThemes filters to kind = base', () => {
    const base = listBaseThemes();
    expect(base).toHaveLength(2);
    for (const t of base) {
      expect((t as { kind: string }).kind).toBe('base');
    }
  });

  it('getThemeTokens falls back to dark when id is unknown', () => {
    const tokens = getThemeTokens('not-a-theme');
    expect((tokens as { id: string }).id).toBe('dark');
  });

  it('themeToCssVars maps the token shape to CSS custom properties', () => {
    const tokens = getThemeTokens('stage-iron-man');
    const vars = themeToCssVars(tokens);
    expect(vars['--bg-page']).toBeDefined();
    expect(vars['--text-primary']).toBeDefined();
    expect(vars['--accent']).toBeDefined();
    expect(vars['--font-display']).toMatch(/Orbitron/);
  });
});

describe('ThemeProvider', () => {
  it('applies the CSS custom properties as inline style', () => {
    render(
      <ThemeProvider themeId="stage-iron-man">
        <div data-testid="child">hi</div>
      </ThemeProvider>,
    );
    const provider = screen.getByTestId('theme-provider');
    expect(provider.getAttribute('data-theme')).toBe('stage-iron-man');
    // style prop renders as inline-style on the root div
    const style = provider.getAttribute('style') || '';
    expect(style).toMatch(/--bg-page:\s*#020712/);
  });

  it('switches tokens when themeId changes', () => {
    const { rerender } = render(
      <ThemeProvider themeId="light">
        <div />
      </ThemeProvider>,
    );
    let style = screen.getByTestId('theme-provider').getAttribute('style') || '';
    expect(style).toMatch(/--bg-page:\s*#f8f8f5/);

    rerender(
      <ThemeProvider themeId="dark">
        <div />
      </ThemeProvider>,
    );
    style = screen.getByTestId('theme-provider').getAttribute('style') || '';
    expect(style).toMatch(/--bg-page:\s*#06060e/);
  });
});
