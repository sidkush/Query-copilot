import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// The context menu was unreadable in light theme because its CSS referenced
// `--fg` (never defined) and `--chrome-bar-bg` (which becomes a translucent
// near-white in light theme). The rule must instead use `--text-primary` and
// `--bg-elevated`, both of which have explicit light + dark values defined
// higher up in index.css.
function readMenuRule(): string {
  const cssPath = resolve(__dirname, '../../../../index.css');
  const css = readFileSync(cssPath, 'utf8');
  const start = css.indexOf('.analyst-pro-context-menu {');
  expect(start).toBeGreaterThan(-1);
  const end = css.indexOf('}', start);
  expect(end).toBeGreaterThan(start);
  return css.slice(start, end + 1);
}

describe('analyst-pro context-menu — light-theme readability', () => {
  it('uses --text-primary for text color (defined for both light + dark themes)', () => {
    const rule = readMenuRule();
    expect(rule).toMatch(/color:\s*var\(--text-primary/);
    expect(rule).not.toMatch(/color:\s*var\(--fg/);
  });

  it('uses --bg-elevated for background (opaque token with light + dark values)', () => {
    const rule = readMenuRule();
    expect(rule).toMatch(/background:\s*var\(--bg-elevated/);
    expect(rule).not.toMatch(/background:\s*var\(--chrome-bar-bg/);
  });

  it('uses --border-default for border (token with light + dark values)', () => {
    const rule = readMenuRule();
    expect(rule).toMatch(/border:.*var\(--border-default/);
  });
});
