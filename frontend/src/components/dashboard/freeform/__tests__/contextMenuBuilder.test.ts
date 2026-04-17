import { describe, it, expect } from 'vitest';
import {
  buildContextMenu,
  findParentZoneId,
  clampToViewport,
  type MenuItem,
} from '../lib/contextMenuBuilder';
import type { Dashboard, ContainerZone, LeafZone, FloatingZone } from '../lib/types';

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

  it('returns the nested container id for a grand-child leaf', () => {
    const leaf: LeafZone = { id: 'L1', type: 'blank', w: 100000, h: 100000 };
    const inner: ContainerZone = {
      id: 'inner', type: 'container-horz', w: 100000, h: 100000, children: [leaf],
    };
    const root: ContainerZone = {
      id: 'root', type: 'container-vert', w: 100000, h: 100000, children: [inner],
    };
    expect(findParentZoneId(root, 'L1')).toBe('inner');
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

describe('buildContextMenu — common items (any zone)', () => {
  const root: ContainerZone = {
    id: 'root', type: 'container-vert', w: 100000, h: 100000,
    children: [
      { id: 'L1', type: 'blank', w: 100000, h: 100000 } as LeafZone,
    ],
  };
  const dash = makeDashboard(root);

  it('includes Tiled/Floating checkbox reflecting the zone state', () => {
    const items = buildContextMenu(root.children[0], dash, new Set());
    const cb = items.find((i) => i.kind === 'checkbox' && i.id === 'toggleFloat');
    expect(cb).toBeDefined();
    expect(cb).toMatchObject({ kind: 'checkbox', checked: false, todo: { plan: '5e' } });
  });

  it('includes a Fit submenu with five fit modes', () => {
    const items = buildContextMenu(root.children[0], dash, new Set());
    const fit = items.find((i) => i.kind === 'submenu' && i.id === 'fit');
    expect(fit).toBeDefined();
    if (fit && fit.kind === 'submenu') {
      const ids = fit.items.filter((i) => i.kind === 'command').map((i) => (i as { id: string }).id);
      expect(ids).toEqual([
        'setFitMode.fit',
        'setFitMode.fitWidth',
        'setFitMode.fitHeight',
        'setFitMode.entireView',
        'setFitMode.fixed',
      ]);
    }
  });

  it('includes Background, Border, and Padding entries', () => {
    const items = buildContextMenu(root.children[0], dash, new Set());
    const ids = items
      .filter((i) => i.kind === 'command' || i.kind === 'submenu')
      .map((i) => (i as { id: string }).id);
    expect(ids).toContain('openProperties.style.background');
    expect(ids).toContain('openProperties.style.border');
    expect(ids).toContain('padding');
  });

  it('Show Title is a checkbox that reflects zone.showTitleBar with sensible default', () => {
    const worksheetZone: LeafZone = { id: 'W1', type: 'worksheet', w: 100000, h: 100000 };
    const dash2 = makeDashboard({
      id: 'root', type: 'container-vert', w: 100000, h: 100000,
      children: [worksheetZone],
    });
    const items = buildContextMenu(worksheetZone, dash2, new Set());
    const cb = items.find((i) => i.kind === 'checkbox' && i.id === 'toggleShowTitle');
    expect(cb).toBeDefined();
    expect((cb as { checked: boolean }).checked).toBe(true); // default for worksheet
  });

  it('Select Parent Container is disabled on the root zone', () => {
    const items = buildContextMenu(root, dash, new Set());
    const sp = items.find((i) => i.kind === 'command' && i.id === 'selectParent');
    expect(sp).toBeDefined();
    expect((sp as { disabled?: boolean }).disabled).toBe(true);
  });

  it('Paste is always present in the menu (dispatcher handles clipboard-empty state)', () => {
    const items = buildContextMenu(root.children[0], dash, new Set());
    expect(items.some((i) => i.kind === 'command' && i.id === 'paste')).toBe(true);
  });

  it('Remove is the last non-separator item', () => {
    const items = buildContextMenu(root.children[0], dash, new Set());
    const last = [...items].reverse().find((i) => i.kind !== 'separator');
    expect(last).toMatchObject({ kind: 'command', id: 'remove' });
  });
});

describe('buildContextMenu — worksheet-specific', () => {
  it('includes Swap Sheets, Filter submenu, Actions…, Show Caption on worksheet zones', () => {
    const ws: LeafZone = { id: 'W1', type: 'worksheet', w: 100000, h: 100000 };
    const dash = makeDashboard({
      id: 'root', type: 'container-vert', w: 100000, h: 100000, children: [ws],
    });
    const items = buildContextMenu(ws, dash, new Set());
    const ids = items.map((i) => (i as { id?: string }).id).filter(Boolean);
    expect(ids).toContain('swapSheets');
    expect(ids).toContain('filter'); // submenu
    expect(ids).toContain('openActionsDialog');
    expect(ids).toContain('toggleShowCaption');
  });

  it('omits worksheet-only items on a blank zone', () => {
    const blank: LeafZone = { id: 'B1', type: 'blank', w: 100000, h: 100000 };
    const dash = makeDashboard({
      id: 'root', type: 'container-vert', w: 100000, h: 100000, children: [blank],
    });
    const items = buildContextMenu(blank, dash, new Set());
    const ids = items.map((i) => (i as { id?: string }).id).filter(Boolean);
    expect(ids).not.toContain('swapSheets');
    expect(ids).not.toContain('filter');
    expect(ids).not.toContain('openActionsDialog');
    expect(ids).not.toContain('toggleShowCaption');
  });

  it('Filter submenu is a shell carrying a single openFilters placeholder until Plan 7a', () => {
    const ws: LeafZone = { id: 'W1', type: 'worksheet', w: 100000, h: 100000 };
    const dash = makeDashboard({
      id: 'root', type: 'container-vert', w: 100000, h: 100000, children: [ws],
    });
    const items = buildContextMenu(ws, dash, new Set());
    const submenu = items.find((i) => i.kind === 'submenu' && i.id === 'filter');
    expect(submenu).toBeDefined();
    if (submenu && submenu.kind === 'submenu') {
      expect(submenu.items.some((it) => it.kind === 'command' && it.id === 'openFilters')).toBe(true);
      expect(submenu.items[0].kind).toBe('command');
    }
  });
});
