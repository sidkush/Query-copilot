/* global __dirname */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('Shell framer-motion import guards', () => {
  it('PageTransition.jsx does not import framer-motion', () => {
    const src = readFileSync(resolve(__dirname, '../components/animation/PageTransition.jsx'), 'utf-8');
    expect(src).not.toContain('framer-motion');
  });

  it('App.jsx does not import AnimatePresence from framer-motion', () => {
    const src = readFileSync(resolve(__dirname, '../App.jsx'), 'utf-8');
    expect(src).not.toMatch(/import\s*\{[^}]*AnimatePresence[^}]*\}\s*from\s*['"]framer-motion['"]/);
  });

  it('PageTransition uses CSS animation', () => {
    const src = readFileSync(resolve(__dirname, '../components/animation/PageTransition.jsx'), 'utf-8');
    expect(src).toContain('page-enter');
  });
});
