import type { DashboardPreset } from './types';
import { _registerPreset } from './registry';

export const signalPreset: DashboardPreset = {
  id: 'signal',
  name: 'Signal',
  tagline: 'Modern dark SaaS — colored accents, signal cards.',
  scheme: 'dark',
  tokens: {
    bg: '#0b0f17',
    fg: '#e7e9ef',
    accent: '#4ecdc4',
    accentWarn: '#f47272',
    border: 'rgba(255,255,255,0.06)',
    fontDisplay: "'Manrope', system-ui, sans-serif",
    fontBody: "'Manrope', system-ui, sans-serif",
    fontMono: "'JetBrains Mono', ui-monospace, monospace",
    density: 'comfortable',
    radius: 10,
  },
};

_registerPreset(signalPreset);
