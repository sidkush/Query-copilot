// Shared zone-default helpers consumed by ZoneFrame (chrome) and
// contextMenuBuilder (menu item defaults). Kept centralized so the two
// surfaces cannot disagree about what "Show Title" defaults to.

import type { FloatingZone, LeafType, Zone } from './types';

export const TITLE_BAR_DEFAULT_VISIBLE: ReadonlySet<LeafType> = new Set<LeafType>([
  'worksheet',
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
export const TITLE_SHOWN_BY_DEFAULT: ReadonlySet<string> = new Set<string>([
  'worksheet', 'text', 'webpage', 'filter', 'legend', 'parameter', 'navigation', 'extension',
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
