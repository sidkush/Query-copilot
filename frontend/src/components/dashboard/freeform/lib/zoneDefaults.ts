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
