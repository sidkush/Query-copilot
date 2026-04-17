// frontend/src/components/dashboard/freeform/lib/zoneTreeOps.ts
import type { Zone, ContainerZone, FloatingZone } from './types';
import { isContainer, normalizeContainer, generateZoneId } from './zoneTree';

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

/**
 * Find the direct parent container of the zone with `childId`.
 * Returns null if not found or the zone has no parent (it is the root).
 */
function findParentInTree(root: Zone, childId: string): ContainerZone | null {
  if (!isContainer(root)) return null;
  for (const child of root.children) {
    if (child.id === childId) return root;
    const found = findParentInTree(child, childId);
    if (found) return found;
  }
  return null;
}

/**
 * Wrap the selected TILED zones in a new container-horz.
 * - All selected zones must share the same parent container. If they don't (or the
 *   list is empty, or only 1 zone), return { root: identity, newContainerId: null }.
 * - Floating zones in the selection are ignored silently (they won't be found in the tiled root).
 * - The new container inherits the summed proportion slice of the grouped zones along
 *   the parent's axis, and takes 100000 on the perpendicular axis.
 * - Inside the new container, grouped zones' proportions are normalized to sum to 100000.
 * - Parent is renormalized so its remaining children + new container sum to 100000.
 * - New container gets a fresh id via `generateZoneId()`. Type is 'container-horz'.
 */
export function groupSelection(
  root: Zone,
  selectedIds: string[],
): { root: Zone; newContainerId: string | null } {
  const identity = { root, newContainerId: null };

  // Filter to only tiled ids (present in the tree).
  const tiledIds = selectedIds.filter((id) => findZoneInTree(root, id) !== null);

  // Need at least 2 tiled zones to form a group.
  if (tiledIds.length < 2) return identity;

  // All selected zones must share the same direct parent.
  const parents = tiledIds.map((id) => findParentInTree(root, id));
  if (parents.some((p) => p === null)) return identity;
  const parentId = parents[0]!.id;
  if (!parents.every((p) => p!.id === parentId)) return identity;

  const parent = parents[0]!;
  const axis: 'w' | 'h' = parent.type === 'container-horz' ? 'w' : 'h';
  const perpAxis: 'w' | 'h' = axis === 'w' ? 'h' : 'w';

  // Collect the selected children in their original order within the parent.
  const selectedSet = new Set(tiledIds);
  const orderedSelected = parent.children.filter((c) => selectedSet.has(c.id));

  // Sum of the selected children's axis proportions (this becomes the new container's slice).
  const groupAxisSum = orderedSelected.reduce((s, c) => s + c[axis], 0);

  // Build the new inner container. Inner children get their original proportions;
  // normalizeContainer will rescale them to sum to 100000 on the container's axis.
  const newContainerId = generateZoneId();
  const innerContainer: ContainerZone = normalizeContainer({
    id: newContainerId,
    type: 'container-horz',
    w: axis === 'w' ? groupAxisSum : 100000,
    h: axis === 'h' ? groupAxisSum : 100000,
    children: orderedSelected.map((c) => ({ ...c })),
  });

  // Rebuild parent children: replace the selected zones with the new container,
  // inserted at the position of the first selected zone.
  const firstSelectedIndex = parent.children.findIndex((c) => selectedSet.has(c.id));
  const remainingChildren = parent.children.filter((c) => !selectedSet.has(c.id));

  // Give the new container its correct axis proportion and perpendicular 100000.
  const containerWithProp: Zone = {
    ...innerContainer,
    [axis]: groupAxisSum,
    [perpAxis]: 100000,
  };

  const nextChildren: Zone[] = [
    ...remainingChildren.slice(0, firstSelectedIndex),
    containerWithProp,
    ...remainingChildren.slice(firstSelectedIndex),
  ];

  // Build next parent with renormalized children.
  const nextParent: ContainerZone = normalizeContainer({
    ...parent,
    children: nextChildren,
  });

  // Splice the updated parent back into the tree.
  const nextRoot = parent.id === root.id
    ? nextParent
    : mapTree(root, (zone) => zone.id === parent.id ? nextParent : zone);

  return { root: nextRoot, newContainerId };
}

/**
 * Replace a container zone with its children inline in the grandparent.
 * - If containerId is the root → identity.
 * - If zone with that id isn't a container → identity.
 * - Each child inherits a proportional slice of the container's parent-axis size.
 * - Parent is renormalized after splice.
 */
export function ungroupContainer(root: Zone, containerId: string): Zone {
  // Cannot ungroup root.
  if (root.id === containerId) return root;

  const target = findZoneInTree(root, containerId);
  if (!target || !isContainer(target)) return root;

  const grandparent = findParentInTree(root, containerId);
  if (!grandparent) return root;

  const axis: 'w' | 'h' = grandparent.type === 'container-horz' ? 'w' : 'h';
  const containerProp = target[axis];
  const childSum = target.children.reduce((s, c) => s + c[axis], 0) || 1;

  // Redistribute the container's axis slice proportionally across its children.
  const ungroupedChildren: Zone[] = target.children.map((c) => ({
    ...c,
    [axis]: Math.round((c[axis] / childSum) * containerProp),
  }));

  // Replace target in grandparent's children list with the ungrouped children.
  const containerIdx = grandparent.children.findIndex((c) => c.id === containerId);
  const nextChildren: Zone[] = [
    ...grandparent.children.slice(0, containerIdx),
    ...ungroupedChildren,
    ...grandparent.children.slice(containerIdx + 1),
  ];

  const nextGrandparent: ContainerZone = normalizeContainer({
    ...grandparent,
    children: nextChildren,
  });

  return grandparent.id === root.id
    ? nextGrandparent
    : mapTree(root, (zone) => zone.id === grandparent.id ? nextGrandparent : zone);
}

/**
 * Toggle `locked` flag on a zone (tiled only — works on the main tree).
 * Finds the zone by id anywhere in the tree; if not found → identity (same reference).
 * - Unlocked zone (locked undefined): sets locked=true.
 * - Locked zone (locked=true): removes the key (sets to undefined via destructuring).
 */
export function toggleLock(root: Zone, zoneId: string): Zone {
  const target = findZoneInTree(root, zoneId);
  if (!target) return root;

  return mapTree(root, (zone) => {
    if (zone.id !== zoneId) return zone;
    if (zone.locked) {
      // Remove the locked key by destructuring it out.
      const { locked: _removed, ...rest } = zone as Zone & { locked?: boolean };
      return rest as Zone;
    }
    return { ...zone, locked: true };
  });
}

/**
 * Toggle `locked` flag on a floating zone.
 * Finds by id in the floating layer array; if not found → identity (same array reference).
 * - Unlocked zone (locked undefined): sets locked=true.
 * - Locked zone (locked=true): removes the key.
 */
export function toggleLockFloating(
  floatingLayer: FloatingZone[],
  zoneId: string,
): FloatingZone[] {
  const idx = floatingLayer.findIndex((z) => z.id === zoneId);
  if (idx === -1) return floatingLayer;

  const zone = floatingLayer[idx];
  let updated: FloatingZone;
  if (zone.locked) {
    const { locked: _removed, ...rest } = zone as FloatingZone & { locked?: boolean };
    updated = rest as FloatingZone;
  } else {
    updated = { ...zone, locked: true };
  }

  return [
    ...floatingLayer.slice(0, idx),
    updated,
    ...floatingLayer.slice(idx + 1),
  ];
}
