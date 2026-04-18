// Plan A★ Phase 5 — Signal preset registration.
//
// The component that draws wireframe 3 lives at
// `src/components/dashboard/modes/presets/SignalLayout.jsx`. The registry
// entry below just exposes the tokens to the preset switcher + theme hook.
//
// Phase 7 of this plan drops the `starter` ZoneTree from `DashboardPreset`.
// Until that lands we `as unknown as DashboardPreset`-cast to keep this
// entry tokens-only without faking a seeded layout the bespoke mode never
// consumes.

import type { DashboardPreset } from './types';
import { _registerPreset } from './registry';

export const signalPreset = {
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
} as unknown as DashboardPreset;

_registerPreset(signalPreset);
