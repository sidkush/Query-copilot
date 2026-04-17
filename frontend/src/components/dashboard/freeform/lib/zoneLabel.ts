// frontend/src/components/dashboard/freeform/lib/zoneLabel.ts

import type { Zone } from './types';

/**
 * Human-readable fallback label for a zone that lacks an explicit displayName.
 *
 * Shared by ZoneFrame's title bar (Plan 5a) and LayoutTreePanel's tree rows
 * so the same zone reads identically in both surfaces. Format matches the
 * richer convention that shipped first in LayoutTreePanel:
 *   - containers: "Horz Container #3ab2" / "Vert Container #3ab2"
 *   - leaves:    "Worksheet #3ab2" / "Text #3ab2" / ...
 *
 * The 4-char id prefix keeps labels short in cramped tree rows.
 */
export function getZoneFallbackLabel(zone: Pick<Zone, 'id' | 'type'>): string {
  const short = String(zone.id).slice(0, 4);
  if (zone.type === 'container-horz') return `Horz Container #${short}`;
  if (zone.type === 'container-vert') return `Vert Container #${short}`;
  const rawType = zone.type || 'zone';
  const cap = rawType.charAt(0).toUpperCase() + rawType.slice(1);
  return `${cap} #${short}`;
}

/**
 * Display label: the user-supplied `displayName` if set, else the fallback.
 */
export function getZoneDisplayLabel(zone: Pick<Zone, 'id' | 'type'> & { displayName?: string }): string {
  if (zone.displayName && zone.displayName.trim().length > 0) return zone.displayName;
  return getZoneFallbackLabel(zone);
}
