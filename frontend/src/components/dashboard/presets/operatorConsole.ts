import type { DashboardPreset } from './types';
import { _registerPreset } from './registry';

const BG = '#0a140e';
const FG = '#b5d8a0';
const ACCENT = FG;
const WARN = '#d9a84a';
const RULE = '#203520';

export const operatorConsolePreset: DashboardPreset = {
  id: 'operator-console',
  name: 'Operator Console',
  tagline: 'CRT phosphor. Mission-control ops terminal.',
  scheme: 'dark',
  tokens: {
    bg: BG,
    fg: FG,
    accent: ACCENT,
    accentWarn: WARN,
    border: RULE,
    fontDisplay: "'JetBrains Mono', ui-monospace, monospace",
    fontBody: "'JetBrains Mono', ui-monospace, monospace",
    fontMono: "'JetBrains Mono', ui-monospace, monospace",
    density: 'compact',
    radius: 0,
  },
};

_registerPreset(operatorConsolePreset);
