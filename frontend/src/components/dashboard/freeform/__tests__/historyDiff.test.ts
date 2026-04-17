import { describe, it, expect } from 'vitest';
import { diffDashboardZones } from '../lib/historyDiff';

function dashboardFrom(root: any, floating: any[] = []) {
  return {
    schemaVersion: 'askdb/dashboard/v1',
    id: 'd', name: '', archetype: 'analyst-pro',
    size: { mode: 'automatic' },
    tiledRoot: root,
    floatingLayer: floating,
    worksheets: [], parameters: [], sets: [], actions: [],
  } as any;
}

describe('diffDashboardZones (Plan 6b T4)', () => {
  it('empty diff when inputs reference-equal', () => {
    const d = dashboardFrom({ id: 'root', type: 'container-vert', w: 0, h: 0, children: [] });
    expect(diffDashboardZones(d, d)).toEqual({ added: [], removed: [], modified: [] });
  });

  it('detects additions in floating layer with shared root ref', () => {
    const root = { id: 'root', type: 'container-vert', w: 0, h: 0, children: [] };
    const f1 = { id: 'f1', type: 'blank', w: 0, h: 0 };
    const f2 = { id: 'f2', type: 'blank', w: 0, h: 0 };
    const prev = dashboardFrom(root, [f1]);
    const next = dashboardFrom(root, [f1, f2]);
    expect(diffDashboardZones(prev, next)).toEqual({ added: ['f2'], removed: [], modified: [] });
  });

  it('detects removals in tiled tree', () => {
    const t1 = { id: 't1', type: 'blank', w: 0, h: 0 };
    const t2 = { id: 't2', type: 'blank', w: 0, h: 0 };
    const rootPrev = { id: 'root', type: 'container-vert', w: 0, h: 0, children: [t1, t2] };
    const rootNext = { id: 'root', type: 'container-vert', w: 0, h: 0, children: [t1] };
    const prev = dashboardFrom(rootPrev);
    const next = dashboardFrom(rootNext);
    const diff = diffDashboardZones(prev, next);
    expect(diff.removed).toEqual(['t2']);
    expect(diff.added).toEqual([]);
    // root modified because children array differs — that's fine
    expect(diff.modified).toContain('root');
  });

  it('detects modified zones via reference inequality', () => {
    const t1a = { id: 't1', type: 'blank', w: 0, h: 0, displayName: 'A' };
    const t1b = { id: 't1', type: 'blank', w: 0, h: 0, displayName: 'B' };
    const rootPrev = { id: 'root', type: 'container-vert', w: 0, h: 0, children: [t1a] };
    const rootNext = { id: 'root', type: 'container-vert', w: 0, h: 0, children: [t1b] };
    const diff = diffDashboardZones(dashboardFrom(rootPrev), dashboardFrom(rootNext));
    expect(diff.modified).toContain('t1');
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
  });

  it('walks nested containers', () => {
    const a = { id: 'a', type: 'blank', w: 0, h: 0 };
    const b = { id: 'b', type: 'blank', w: 0, h: 0 };
    const cPrev = { id: 'c', type: 'container-horz', w: 0, h: 0, children: [a] };
    const cNext = { id: 'c', type: 'container-horz', w: 0, h: 0, children: [a, b] };
    const rootPrev = { id: 'root', type: 'container-vert', w: 0, h: 0, children: [cPrev] };
    const rootNext = { id: 'root', type: 'container-vert', w: 0, h: 0, children: [cNext] };
    const d = diffDashboardZones(dashboardFrom(rootPrev), dashboardFrom(rootNext));
    expect(d.added).toEqual(['b']);
    expect(d.modified).toContain('c');
    expect(d.removed).toEqual([]);
  });

  it('returns empty diff on null input', () => {
    const d = dashboardFrom({ id: 'root', type: 'container-vert', w: 0, h: 0, children: [] });
    expect(diffDashboardZones(null, d)).toEqual({ added: [], removed: [], modified: [] });
    expect(diffDashboardZones(d, null)).toEqual({ added: [], removed: [], modified: [] });
  });
});
