/* global __dirname */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('main.jsx import guards', () => {
  it('does not eagerly import setup-regl', () => {
    const main = readFileSync(resolve(__dirname, '../main.jsx'), 'utf-8');
    expect(main).not.toContain('setup-regl');
  });

  it('does not eagerly import regl', () => {
    const main = readFileSync(resolve(__dirname, '../main.jsx'), 'utf-8');
    expect(main).not.toMatch(/import.*from\s+['"]regl['"]/);
  });
});
