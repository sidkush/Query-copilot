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

/**
 * Move a zone (by id) to a new parent container at given index.
 * Removes from its current parent + inserts into target parent.
 * Both source and target are renormalized.
 */
export function moveZone(
  root: Zone,
  zoneId: string,
  targetParentId: string,
  targetIndex: number,
): Zone {
  const source = findZoneInTree(root, zoneId);
  if (!source) return root;
  const withoutSource = removeChild(root, zoneId);
  return insertChild(withoutSource, targetParentId, source, targetIndex);
}

/**
 * Resize a zone by setting new w/h proportions. Renormalizes the parent
 * container so sibling proportions sum to 100000. Clamps to min 1000.
 * Floating zones unchanged by this op — use updateZone for pxW/pxH.
 */
const MIN_PROPORTION = 1000;
export function resizeZone(
  root: Zone,
  zoneId: string,
  size: { w?: number; h?: number },
): Zone {
  const target = findZoneInTree(root, zoneId);
  if (!target) return root;

  return mapTree(root, (zone) => {
    if (!isContainer(zone)) return zone;
    const childIdx = zone.children.findIndex((c) => c.id === zoneId);
    if (childIdx === -1) return zone;

    const axis: 'w' | 'h' = zone.type === 'container-horz' ? 'w' : 'h';
    const requestedAxisValue = size[axis];
    if (requestedAxisValue === undefined) return zone;

    const clamped = Math.max(MIN_PROPORTION, Math.min(100000 - MIN_PROPORTION, requestedAxisValue));
    const siblingCount = zone.children.length - 1;
    if (siblingCount === 0) return zone;

    const remaining = 100000 - clamped;
    const oldSiblingSum = zone.children.reduce(
      (s, c, i) => (i === childIdx ? s : s + c[axis]),
      0,
    ) || 1;

    const nextChildren = zone.children.map((c, i) => {
      if (i === childIdx) return { ...c, [axis]: clamped };
      return { ...c, [axis]: Math.round((c[axis] / oldSiblingSum) * remaining) };
    });

    // Drift fix: ensure sum is exactly 100000.
    const sum = nextChildren.reduce((s, c) => s + c[axis], 0);
    const drift = 100000 - sum;
    if (drift !== 0) {
      // Apply drift to last sibling (not target).
      const lastSiblingIdx = childIdx === nextChildren.length - 1 ? nextChildren.length - 2 : nextChildren.length - 1;
      if (lastSiblingIdx >= 0) {
        nextChildren[lastSiblingIdx] = {
          ...nextChildren[lastSiblingIdx],
          [axis]: nextChildren[lastSiblingIdx][axis] + drift,
        };
      }
    }
    return { ...zone, children: nextChildren };
  });
}

/**
 * Patch arbitrary fields on a zone by id. No normalization.
 * Used for non-size changes (type conversion, worksheetRef update, etc.).
 */
export function updateZone(
  root: Zone,
  zoneId: string,
  patch: Partial<Zone>,
): Zone {
  return mapTree(root, (zone) => {
    if (zone.id !== zoneId) return zone;
    return { ...zone, ...patch } as Zone;
  });
}

/** Internal: find a zone anywhere in the tree. */
function findZoneInTree(root: Zone, id: string): Zone | null {
  if (root.id === id) return root;
  if (isContainer(root)) {
    for (const child of root.children) {
      const found = findZoneInTree(child, id);
      if (found) return found;
    }
  }
  return null;
}
