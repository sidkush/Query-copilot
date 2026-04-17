import type { Zone, ContainerZone, LeafZone } from './types';

/** Generate a unique zone id (crypto-random, prefixed for readability). */
export function generateZoneId(): string {
  const rand = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
    : Math.random().toString(36).slice(2, 14).padEnd(12, '0');
  return `zone-${rand}`;
}

export function isContainer(zone: Zone): zone is ContainerZone {
  return zone.type === 'container-horz' || zone.type === 'container-vert';
}

export function findZoneById(root: Zone, id: string): Zone | null {
  if (root.id === id) return root;
  if (isContainer(root)) {
    for (const child of root.children) {
      const found = findZoneById(child, id);
      if (found) return found;
    }
  }
  return null;
}

export function traverseZones(
  root: Zone,
  visit: (zone: Zone, depth: number) => void,
  depth = 0,
): void {
  visit(root, depth);
  if (isContainer(root)) {
    for (const child of root.children) {
      traverseZones(child, visit, depth + 1);
    }
  }
}

/**
 * Normalize a container's children so their split-axis values sum to 100000.
 * Horz → normalize `w`. Vert → normalize `h`.
 * Preserves relative proportions. Returns new container (does not mutate).
 *
 * Edge cases:
 *   - Empty children: returns container unchanged.
 *   - All-zero sum: returns container unchanged (degenerate).
 *   - Rounding drift: last child absorbs the drift so the sum is exactly 100000.
 */
export function normalizeContainer(container: ContainerZone): ContainerZone {
  if (container.children.length === 0) return container;
  const axis: 'w' | 'h' = container.type === 'container-horz' ? 'w' : 'h';
  const sum = container.children.reduce((s, c) => s + c[axis], 0);
  if (sum === 0) return container;
  const factor = 100000 / sum;
  const children = container.children.map((child) => ({
    ...child,
    [axis]: Math.round(child[axis] * factor),
  })) as Zone[];
  // Fix rounding drift: adjust last child so sum is exactly 100000.
  const roundedSum = children.reduce((s, c) => s + c[axis], 0);
  const drift = 100000 - roundedSum;
  if (drift !== 0 && children.length > 0) {
    const last = children[children.length - 1];
    (last as LeafZone)[axis] = (last as LeafZone)[axis] + drift;
  }
  return { ...container, children };
}
