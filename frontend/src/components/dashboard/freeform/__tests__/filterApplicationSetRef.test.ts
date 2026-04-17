import { describe, it, expect } from 'vitest';
import { buildAdditionalFilters } from '../lib/filterApplication';
import type { TargetOp } from '../lib/actionTypes';
import type { DashboardSet } from '../lib/setTypes';

const makeSet = (over: Partial<DashboardSet> = {}): DashboardSet => ({
  id: 's1', name: 'Regions', dimension: 'region',
  members: ['East', 'West'],
  createdAt: '2026-04-16T00:00:00Z',
  ...over,
});

describe('buildAdditionalFilters — setRef expansion', () => {
  it('expands a __setRef marker into an in filter', () => {
    const op: TargetOp = {
      kind: 'filter',
      sheetId: 'w1',
      filters: { Region: { __setRef: 's1' } },
      clearBehavior: 'leave-filter',
    };
    expect(buildAdditionalFilters(op, [makeSet()])).toEqual([
      { field: 'Region', op: 'in', values: ['East', 'West'] },
    ]);
  });

  it('drops the marker when the referenced set is missing', () => {
    const op: TargetOp = {
      kind: 'filter', sheetId: 'w1',
      filters: { Region: { __setRef: 'ghost' } },
      clearBehavior: 'leave-filter',
    };
    expect(buildAdditionalFilters(op, [makeSet()])).toEqual([]);
  });

  it('mixes setRef and eq filters in a single op', () => {
    const op: TargetOp = {
      kind: 'filter', sheetId: 'w1',
      filters: {
        Region: { __setRef: 's1' },
        Year: 2026,
      },
      clearBehavior: 'leave-filter',
    };
    expect(buildAdditionalFilters(op, [makeSet()])).toEqual([
      { field: 'Region', op: 'in', values: ['East', 'West'] },
      { field: 'Year', op: 'eq', value: 2026 },
    ]);
  });

  it('still accepts eq-only ops with no sets snapshot', () => {
    const op: TargetOp = {
      kind: 'filter', sheetId: 'w1',
      filters: { Region: 'West' },
      clearBehavior: 'leave-filter',
    };
    expect(buildAdditionalFilters(op)).toEqual([
      { field: 'Region', op: 'eq', value: 'West' },
    ]);
  });
});
