// frontend/src/components/dashboard/freeform/lib/zoneTreeOps.ts
import type { Zone, ContainerZone } from './types';
import { isContainer, normalizeContainer } from './zoneTree';

/**
 * Insert `newChild` into the container with id=containerId at position `index`.
 * Normalizes proportions after insert. Returns a new tree (no mutation).
 */
export function insertChild(
  root: Zone,
  containerId: string,
  newChild: Zone,
  index: number,
): Zone {
  return mapTree(root, (zone) => {
    if (zone.id !== containerId || !isContainer(zone)) return zone;
    const clampedIndex = Math.max(0, Math.min(index, zone.children.length));
    const nextChildren = [
      ...zone.children.slice(0, clampedIndex),
      newChild,
      ...zone.children.slice(clampedIndex),
    ];
    return normalizeContainer({ ...zone, children: nextChildren });
  });
}

/**
 * Remove the zone with id=childId from anywhere in the tree.
 * Normalizes the parent container's proportions after removal.
 * Returns a new tree (no mutation). If id not found, returns identity.
 */
export function removeChild(root: Zone, childId: string): Zone {
  return mapTree(root, (zone) => {
    if (!isContainer(zone)) return zone;
    const idx = zone.children.findIndex((c) => c.id === childId);
    if (idx === -1) return zone;
    const nextChildren = [...zone.children.slice(0, idx), ...zone.children.slice(idx + 1)];
    return normalizeContainer({ ...zone, children: nextChildren });
  });
}

/**
 * Internal: recursive tree map. Applies `transform` to each zone bottom-up.
 * Safe for arbitrary tree shapes. Does not mutate.
 */
function mapTree(zone: Zone, transform: (z: Zone) => Zone): Zone {
  if (isContainer(zone)) {
    const nextChildren = zone.children.map((c) => mapTree(c, transform));
    return transform({ ...zone, children: nextChildren } as ContainerZone);
  }
  return transform(zone);
}
