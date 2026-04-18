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
