import type { DashboardPreset } from './types';
import { _registerPreset } from './registry';

const BG = '#f5f1e8';
const FG = '#141414';
const ACCENT = '#141414';
const WARN = '#c83e3e';
const RULE = '#dad6cd';

export const boardPackPreset: DashboardPreset = {
  id: 'board-pack',
  name: 'Board Pack',
  tagline: 'Cream tearsheet, editorial. One red for risk.',
  scheme: 'light',
  tokens: {
    bg: BG,
    fg: FG,
    accent: ACCENT,
    accentWarn: WARN,
    border: RULE,
    fontDisplay: "'Manrope', ui-sans-serif, system-ui, sans-serif",
    fontBody: "'Manrope', ui-sans-serif, system-ui, sans-serif",
    fontMono: "ui-monospace, 'JetBrains Mono', monospace",
    density: 'spacious',
    radius: 0,
  },
};

_registerPreset(boardPackPreset);
