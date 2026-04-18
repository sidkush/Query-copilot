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

describe('Plan 7 T7 — KPI-aware bin pack', () => {
  // Constants mirrored from legacyTilesToDashboard.js for readability.
  const KPIS_PER_ROW = 4;
  const CHARTS_PER_ROW = 2;
  const KPI_ROW_PX = 160;
  const CHART_ROW_PX = 360;
  const GUTTER_PX = 32;
  void KPIS_PER_ROW; void CHARTS_PER_ROW; void GUTTER_PX; void KPI_ROW_PX; void CHART_ROW_PX;

  it('N=4 all-chart → single vert root with 4 children (byte-identical to Plan 5e)', () => {
    // tile(i) returns { id, chart_spec: {} } — classifyTile → 'chart' for all.
    const d = legacyTilesToDashboard([tile(1), tile(2), tile(3), tile(4)], 'd', 'N', undefined);
    expect(d.tiledRoot.type).toBe('container-vert');
    expect(d.tiledRoot.children).toHaveLength(4);
    expect(d.tiledRoot.children.every((c: any) => c.type === 'worksheet')).toBe(true);
    // Each h proportion = 100000 / 4 = 25000.
    expect(d.tiledRoot.children.every((c: any) => c.h === 25000)).toBe(true);
  });

  it('mixed KPI + chart groups KPIs into a short row then charts into a tall row', () => {
    const tiles = [
      { id: 1, tileKind: 'kpi', chart_spec: {} },
      { id: 2, tileKind: 'kpi', chart_spec: {} },
      { id: 3, chartType: 'bar', chart_spec: {} },
      { id: 4, chartType: 'line', chart_spec: {} },
    ];
    const d = legacyTilesToDashboard(tiles, 'd', 'N', undefined);
    // Root is vert; first child is KPI row (horz), second is chart row (horz).
    expect(d.tiledRoot.type).toBe('container-vert');
    expect(d.tiledRoot.children).toHaveLength(2);
    expect(d.tiledRoot.children[0].type).toBe('container-horz');
    expect(d.tiledRoot.children[1].type).toBe('container-horz');
    const kpiRow = d.tiledRoot.children[0] as { children: Array<{ id: string }> };
    const chartRow = d.tiledRoot.children[1] as { children: Array<{ id: string }> };
    expect(kpiRow.children.map((c) => c.id)).toEqual(['1', '2']);
    expect(chartRow.children.map((c) => c.id)).toEqual(['3', '4']);
  });

  it('KPI row h < chart row h (KPI 160px vs chart 360px)', () => {
    const tiles = [
      { id: 1, tileKind: 'kpi', chart_spec: {} },
      { id: 2, chartType: 'bar', chart_spec: {} },
    ];
    const d = legacyTilesToDashboard(tiles, 'd', 'N', undefined);
    const kpiRow = d.tiledRoot.children[0] as { h: number };
    const chartRow = d.tiledRoot.children[1] as { h: number };
    expect(kpiRow.h).toBeLessThan(chartRow.h);
  });

  it('row proportions sum to 100000 (no drift)', () => {
    const tiles = [
      { id: 1, tileKind: 'kpi', chart_spec: {} },
      { id: 2, tileKind: 'kpi', chart_spec: {} },
      { id: 3, tileKind: 'kpi', chart_spec: {} },
      { id: 4, chartType: 'bar', chart_spec: {} },
      { id: 5, chartType: 'line', chart_spec: {} },
      { id: 6, chartType: 'area', chart_spec: {} },
    ];
    const d = legacyTilesToDashboard(tiles, 'd', 'N', undefined);
    const sum = d.tiledRoot.children.reduce((s: number, c: any) => s + c.h, 0);
    expect(sum).toBe(100000);
  });

  it('4 KPIs pack into ONE row (not two rows of 2)', () => {
    const tiles = [1, 2, 3, 4].map((id) => ({ id, tileKind: 'kpi' as const, chart_spec: {} }));
    const d = legacyTilesToDashboard(tiles, 'd', 'N', undefined);
    // Only KPIs → root vert → one horz row with 4 children.
    expect(d.tiledRoot.type).toBe('container-vert');
    expect(d.tiledRoot.children).toHaveLength(1);
    const row = d.tiledRoot.children[0] as { type: string; children: unknown[] };
    expect(row.type).toBe('container-horz');
    expect(row.children).toHaveLength(4);
  });

  it('5 KPIs → two KPI rows (4 + 1)', () => {
    const tiles = [1, 2, 3, 4, 5].map((id) => ({ id, tileKind: 'kpi' as const, chart_spec: {} }));
    const d = legacyTilesToDashboard(tiles, 'd', 'N', undefined);
    expect(d.tiledRoot.children).toHaveLength(2);
    const row1 = d.tiledRoot.children[0] as { children: unknown[] };
    const row2 = d.tiledRoot.children[1] as { children: unknown[] };
    expect(row1.children).toHaveLength(4);
    expect(row2.children).toHaveLength(1);
  });

  it('canvas height = sum(row px) + gutters when mixed layout chosen', () => {
    const tiles = [
      { id: 1, tileKind: 'kpi', chart_spec: {} },
      { id: 2, chartType: 'bar', chart_spec: {} },
    ];
    const d = legacyTilesToDashboard(tiles, 'd', 'N', undefined);
    // 1 KPI row (160) + 1 chart row (360) + 1 gutter between = 552.
    // Canvas min height 900 still applies (Plan 5e convention).
    expect(d.size).toMatchObject({ mode: 'fixed', width: 1440, preset: 'custom' });
    const height = (d.size as { height: number }).height;
    expect(height).toBeGreaterThanOrEqual(900);
  });

  it('children displayName still propagates in KPI-aware bin pack (regression guard vs T2)', () => {
    const tiles = [
      { id: 1, tileKind: 'kpi' as const, title: 'Revenue', chart_spec: {} },
      { id: 2, chartType: 'bar', title: 'By Region', chart_spec: {} },
    ];
    const d = legacyTilesToDashboard(tiles, 'd', 'N', undefined);
    const kpiChild = (d.tiledRoot.children[0] as { children: Array<{ displayName?: string }> }).children[0];
    const chartChild = (d.tiledRoot.children[1] as { children: Array<{ displayName?: string }> }).children[0];
    expect(kpiChild.displayName).toBe('Revenue');
    expect(chartChild.displayName).toBe('By Region');
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
