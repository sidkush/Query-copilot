// Plan 7 T6 — classifyTile kpi-vs-chart detector.
//
// Used by the Plan 7 T7 bin-pack heuristic so a KPI tile (single big
// number) gets a short 160 px row and a regular chart tile gets a tall
// 360 px row. Explicit user override via `tileKind: 'kpi' | 'chart'`
// wins. Without override, infer from chartType / chart_spec shape.
import { describe, it, expect } from 'vitest';
import { classifyTile } from '../../modes/legacyTilesToDashboard';

describe('Plan 7 T6 — classifyTile', () => {
  it('respects explicit tileKind override (kpi)', () => {
    expect(classifyTile({ id: 1, tileKind: 'kpi', chartType: 'bar' })).toBe('kpi');
  });

  it('respects explicit tileKind override (chart)', () => {
    expect(classifyTile({ id: 1, tileKind: 'chart', chartType: 'number' })).toBe('chart');
  });

  it('classifies known KPI chartTypes as kpi', () => {
    expect(classifyTile({ id: 1, chartType: 'kpi' })).toBe('kpi');
    expect(classifyTile({ id: 2, chartType: 'bigNumber' })).toBe('kpi');
    expect(classifyTile({ id: 3, chartType: 'number' })).toBe('kpi');
  });

  it('classifies chart_spec with mark.type === "text" as kpi', () => {
    expect(classifyTile({ id: 1, chart_spec: { mark: { type: 'text' } } })).toBe('kpi');
    // Shorthand mark string also covered.
    expect(classifyTile({ id: 2, chart_spec: { mark: 'text' } })).toBe('kpi');
  });

  it('defaults unknown tiles to "chart"', () => {
    expect(classifyTile({ id: 1 })).toBe('chart');
    expect(classifyTile({ id: 2, chartType: 'bar' })).toBe('chart');
    expect(classifyTile({ id: 3, chart_spec: { mark: 'bar' } })).toBe('chart');
  });

  it('honors camelCase chartSpec alias (chart_spec vs chartSpec)', () => {
    expect(classifyTile({ id: 1, chartSpec: { mark: 'text' } })).toBe('kpi');
  });

  it('is case-insensitive on chartType', () => {
    expect(classifyTile({ id: 1, chartType: 'KPI' })).toBe('kpi');
    expect(classifyTile({ id: 2, chartType: 'BigNumber' })).toBe('kpi');
  });

  it('handles null / undefined input safely (defaults to chart)', () => {
    expect(classifyTile(null as any)).toBe('chart');
    expect(classifyTile(undefined as any)).toBe('chart');
  });
});
