/* global __dirname */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('Bundle analyzer config', () => {
  it('package.json has build:analyze script', () => {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf-8'));
    expect(pkg.scripts['build:analyze']).toBeDefined();
    expect(pkg.scripts['build:analyze']).toContain('ANALYZE');
  });

  it('vite.config.js imports rollup-plugin-visualizer', () => {
    const config = readFileSync(resolve(__dirname, '../../vite.config.js'), 'utf-8');
    expect(config).toContain('rollup-plugin-visualizer');
  });
});
