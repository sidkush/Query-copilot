/* global __dirname */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('EditorCanvas lazy-loading guards', () => {
  const src = readFileSync(
    resolve(__dirname, '../components/editor/EditorCanvas.jsx'),
    'utf-8',
  );

  it('does not eagerly import VegaRenderer', () => {
    expect(src).not.toMatch(/^import\s+VegaRenderer\s+from/m);
  });

  it('uses lazy() for VegaRenderer', () => {
    expect(src).toMatch(/lazy\(\s*\(\)\s*=>\s*import\(.+VegaRenderer/);
  });

  it('still eagerly imports VizQLRenderer (primary path)', () => {
    expect(src).toMatch(/^import\s+VizQLRenderer\s+from/m);
  });
});
