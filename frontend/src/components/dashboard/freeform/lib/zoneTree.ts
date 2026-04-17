import type { Zone, ContainerZone } from './types';

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
