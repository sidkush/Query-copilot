import { describe, it, expect } from 'vitest';
import { legacyTilesToDashboard } from '../../modes/legacyTilesToDashboard';

const tile = (id: number) => ({ id, chart_spec: {} });

describe('legacyTilesToDashboard smart layout', () => {
  it('0 tiles -> single vert root with empty children', () => {
    const d = legacyTilesToDashboard([], 'd', 'N', undefined);
    expect(d.tiledRoot.type).toBe('container-vert');
    expect(d.tiledRoot.children).toHaveLength(0);
  });

  it('1 tile -> single vert root, 1 child', () => {
    const d = legacyTilesToDashboard([tile(1)], 'd', 'N', undefined);
    expect(d.tiledRoot.type).toBe('container-vert');
    expect(d.tiledRoot.children).toHaveLength(1);
  });

  it('4 tiles -> single vert root (legacy behaviour preserved)', () => {
    const d = legacyTilesToDashboard([tile(1), tile(2), tile(3), tile(4)], 'd', 'N', undefined);
    expect(d.tiledRoot.type).toBe('container-vert');
    expect(d.tiledRoot.children.map((c: any) => c.id)).toEqual(['1', '2', '3', '4']);
    expect(d.tiledRoot.children.every((c: any) => c.type === 'worksheet')).toBe(true);
  });

  it('7 tiles -> horz root with 2 vert children (round-robin)', () => {
    const tiles = [1, 2, 3, 4, 5, 6, 7].map(tile);
    const d = legacyTilesToDashboard(tiles, 'd', 'N', undefined);
    expect(d.tiledRoot.type).toBe('container-horz');
    expect(d.tiledRoot.children).toHaveLength(2);
    expect(d.tiledRoot.children[0].type).toBe('container-vert');
    expect(d.tiledRoot.children[1].type).toBe('container-vert');
    expect(d.tiledRoot.children[0].children.map((c: any) => c.id)).toEqual(['1', '3', '5', '7']);
    expect(d.tiledRoot.children[1].children.map((c: any) => c.id)).toEqual(['2', '4', '6']);
  });

  it('15 tiles -> horz root with 3 vert children (round-robin)', () => {
    const tiles = Array.from({ length: 15 }, (_, i) => tile(i + 1));
    const d = legacyTilesToDashboard(tiles, 'd', 'N', undefined);
    expect(d.tiledRoot.type).toBe('container-horz');
    expect(d.tiledRoot.children).toHaveLength(3);
    expect(d.tiledRoot.children[0].children).toHaveLength(5);
    expect(d.tiledRoot.children[1].children).toHaveLength(5);
    expect(d.tiledRoot.children[2].children).toHaveLength(5);
  });

  it('default canvas size (no size arg) 10+ tiles -> fixed 1440 x max(900, ceil(n/3)*320)', () => {
    const tiles = Array.from({ length: 12 }, (_, i) => tile(i + 1));
    const d = legacyTilesToDashboard(tiles, 'd', 'N', undefined);
    expect(d.size).toEqual({ mode: 'fixed', width: 1440, height: 1280, preset: 'custom' });
  });

  it('caller-supplied size is preserved verbatim', () => {
    const d = legacyTilesToDashboard([tile(1)], 'd', 'N', { mode: 'automatic' });
    expect(d.size).toEqual({ mode: 'automatic' });
  });

  it('9-tile default canvas uses 2-col math (N=2, height max(900, ceil(9/2)*320)=1600)', () => {
    const tiles = Array.from({ length: 9 }, (_, i) => tile(i + 1));
    const d = legacyTilesToDashboard(tiles, 'd', 'N', undefined);
    expect(d.size).toEqual({ mode: 'fixed', width: 1440, height: 1600, preset: 'custom' });
  });

  it('children w proportions sum to 100000 on the horz root', () => {
    const tiles = Array.from({ length: 11 }, (_, i) => tile(i + 1));
    const d = legacyTilesToDashboard(tiles, 'd', 'N', undefined);
    const sum = d.tiledRoot.children.reduce((s: number, c: any) => s + c.w, 0);
    expect(sum).toBe(100000);
  });
});

describe('Plan 7 T2 — tile.title propagates to zone.displayName', () => {
  it('worksheet child carries displayName = tile.title when title present', () => {
    const tiles = [
      { id: 1, title: 'Member Rides', chart_spec: {} },
      { id: 2, title: 'Casual Rides', chart_spec: {} },
    ];
    const d = legacyTilesToDashboard(tiles, 'd', 'N', undefined);
    const kids = d.tiledRoot.children as Array<{ id: string; displayName?: string }>;
    expect(kids[0].displayName).toBe('Member Rides');
    expect(kids[1].displayName).toBe('Casual Rides');
  });

  it('worksheet child omits displayName (undefined) when title is missing or empty', () => {
    const tiles = [
      { id: 1, chart_spec: {} },
      { id: 2, title: '', chart_spec: {} },
      { id: 3, title: '   ', chart_spec: {} },
    ];
    const d = legacyTilesToDashboard(tiles, 'd', 'N', undefined);
    const kids = d.tiledRoot.children as Array<{ id: string; displayName?: string }>;
    expect(kids[0].displayName).toBeUndefined();
    expect(kids[1].displayName).toBeUndefined();
    expect(kids[2].displayName).toBeUndefined();
  });

  it('multi-column layout (N=2) also propagates displayName through bucketed children', () => {
    const tiles = Array.from({ length: 7 }, (_, i) => ({
      id: i + 1,
      title: `Tile ${i + 1}`,
      chart_spec: {},
    }));
    const d = legacyTilesToDashboard(tiles, 'd', 'N', undefined);
    expect(d.tiledRoot.type).toBe('container-horz');
    const col0 = (d.tiledRoot.children[0] as { children: Array<{ displayName?: string }> }).children;
    const col1 = (d.tiledRoot.children[1] as { children: Array<{ displayName?: string }> }).children;
    expect(col0[0].displayName).toBe('Tile 1'); // round-robin: col0 = 1,3,5,7
    expect(col1[0].displayName).toBe('Tile 2');
  });
});
