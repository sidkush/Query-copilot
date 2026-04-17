import { describe, it, expect } from 'vitest';
import {
  buildContextMenu,
  findParentZoneId,
  clampToViewport,
  type MenuItem,
} from '../lib/contextMenuBuilder';
import type { Dashboard, ContainerZone, LeafZone } from '../lib/types';

function makeDashboard(root: ContainerZone, floating: LeafZone[] = []): Dashboard {
  return {
    schemaVersion: 'askdb/dashboard/v1',
    id: 'd1',
    name: 'test',
    archetype: 'analyst-pro',
    size: { mode: 'automatic' },
    tiledRoot: root,
    floatingLayer: floating as never,
    worksheets: [],
    parameters: [],
    sets: [],
    actions: [],
  };
}

describe('contextMenuBuilder skeleton', () => {
  it('returns an empty array when zone is null and dashboard is null', () => {
    const items = buildContextMenu(null, null, new Set<string>());
    expect(items).toEqual([]);
  });

  it('returns at least one item for canvas-empty when dashboard exists', () => {
    const dash = makeDashboard({ id: 'root', type: 'container-vert', w: 100000, h: 100000, children: [] });
    const items = buildContextMenu(null, dash, new Set());
    expect(items.length).toBeGreaterThan(0);
  });
});

describe('findParentZoneId', () => {
  it('returns null for the root zone', () => {
    const root: ContainerZone = { id: 'root', type: 'container-vert', w: 100000, h: 100000, children: [] };
    expect(findParentZoneId(root, 'root')).toBeNull();
  });

  it('returns the direct parent container id for a leaf', () => {
    const leaf: LeafZone = { id: 'L1', type: 'blank', w: 100000, h: 100000 };
    const root: ContainerZone = {
      id: 'root', type: 'container-vert', w: 100000, h: 100000, children: [leaf],
    };
    expect(findParentZoneId(root, 'L1')).toBe('root');
  });
});

describe('clampToViewport', () => {
  it('returns input when the menu fits', () => {
    expect(clampToViewport(100, 100, 200, 300, 1000, 800)).toEqual({ x: 100, y: 100 });
  });

  it('flips to the left when the menu would overflow the right edge', () => {
    expect(clampToViewport(950, 100, 200, 300, 1000, 800)).toEqual({ x: 750, y: 100 });
  });

  it('flips upward when the menu would overflow the bottom edge', () => {
    expect(clampToViewport(100, 700, 200, 300, 1000, 800)).toEqual({ x: 100, y: 400 });
  });

  it('clamps to (0,0) if the menu is larger than the viewport', () => {
    expect(clampToViewport(50, 50, 2000, 2000, 1000, 800)).toEqual({ x: 0, y: 0 });
  });
});
