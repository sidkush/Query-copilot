// Shared zone-default helpers consumed by ZoneFrame (chrome) and
// contextMenuBuilder (menu item defaults). Kept centralized so the two
// surfaces cannot disagree about what "Show Title" defaults to.

import type { FloatingZone, LeafType, Zone } from './types';

// Plan 7 T1 — worksheet intentionally NOT in the default set. Worksheet tiles
// render a Vega chart that owns its own title; stacking a frame-chrome title
// on top double-titles the tile and destroys readability. Users can still
// opt in per-zone via the properties panel (`showTitle: true`).
export const TITLE_BAR_DEFAULT_VISIBLE: ReadonlySet<LeafType> = new Set<LeafType>([
  'text',
  'webpage',
  'filter',
  'legend',
  'parameter',
  'navigation',
  'extension',
]);

export function defaultShowTitle(zone: Zone): boolean {
  return TITLE_BAR_DEFAULT_VISIBLE.has(zone.type as LeafType);
}

export function isFloatingZone(zone: Zone): zone is Zone & FloatingZone {
  return (zone as FloatingZone).floating === true;
}

// Plan 5d scalar defaults (roadmap § "Plan 5d Deliverable 2").
export const DEFAULT_INNER_PADDING = 4;
export const DEFAULT_OUTER_PADDING = 0;
export const DEFAULT_FIT_MODE = 'fit' as const;

// Title bar visibility default per leaf type. Superset alias of
// TITLE_BAR_DEFAULT_VISIBLE so new surfaces can import one name.
// Plan 7 T1 — worksheet removed in lockstep with TITLE_BAR_DEFAULT_VISIBLE.
export const TITLE_SHOWN_BY_DEFAULT: ReadonlySet<string> = new Set<string>([
  'text', 'webpage', 'filter', 'legend', 'parameter', 'navigation', 'extension',
]);

// Caption is Tableau-specific to worksheets (Build_Tableau.md Appendix A.7).
export const CAPTION_SHOWN_BY_DEFAULT: ReadonlySet<string> = new Set<string>([
  'worksheet',
]);

type FieldKey =
  | 'innerPadding'
  | 'outerPadding'
  | 'fitMode'
  | 'showTitle'
  | 'showCaption';

export function zoneDefaultForField(zone: { type: string }, field: FieldKey): unknown {
  switch (field) {
    case 'innerPadding': return DEFAULT_INNER_PADDING;
    case 'outerPadding': return DEFAULT_OUTER_PADDING;
    case 'fitMode':      return DEFAULT_FIT_MODE;
    case 'showTitle':    return TITLE_SHOWN_BY_DEFAULT.has(zone.type);
    case 'showCaption':  return CAPTION_SHOWN_BY_DEFAULT.has(zone.type);
    default: return undefined;
  }
}
