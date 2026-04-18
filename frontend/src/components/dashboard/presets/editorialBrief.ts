// Editorial Brief preset — Plan A★ Phase 6 (Wave 2-EB).
//
// Quarterly magazine layout: warm cream page, near-black body type, amber
// accents, drop-cap commentary. The bespoke layout component
// (`modes/presets/EditorialBriefLayout.jsx`) renders the entire wireframe;
// this file only carries the theme tokens used by `usePresetTheme` to set
// CSS custom properties on <html>. Starter zones are intentionally omitted —
// the bespoke layout doesn't dispatch through the freeform tiledRoot path.
import type { DashboardPreset } from './types';
import { _registerPreset } from './registry';

export const editorialBriefPreset: DashboardPreset = {
  id: 'editorial-brief',
  name: 'Editorial Brief',
  tagline: 'Magazine cream — italic serif, amber accent, drop caps.',
  scheme: 'light',
  tokens: {
    bg: '#f4efe4',
    fg: '#181613',
    accent: '#c0793a',
    accentWarn: '#9a5820',
    border: '#d4cdbf',
    fontDisplay: "'Source Serif 4', Georgia, serif",
    fontBody: "'Source Serif 4', Georgia, serif",
    fontMono: "'JetBrains Mono', ui-monospace, monospace",
    density: 'spacious',
    radius: 2,
  },
};

_registerPreset(editorialBriefPreset);
