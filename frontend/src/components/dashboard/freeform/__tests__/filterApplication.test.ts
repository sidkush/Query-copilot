import { describe, it, expect } from 'vitest';
import {
  buildAdditionalFilters,
  type Filter,
} from '../lib/filterApplication';
import type { TargetOp } from '../lib/actionTypes';

describe('buildAdditionalFilters', () => {
  it('returns empty array when TargetOp has no filter fields', () => {
    const op: TargetOp = {
      kind: 'filter',
      sheetId: 'w1',
      filters: {},
      clearBehavior: 'leave-filter',
    };
    expect(buildAdditionalFilters(op)).toEqual([]);
  });

  it('maps each filter key/value to an eq Filter', () => {
    const op: TargetOp = {
      kind: 'filter',
      sheetId: 'w1',
      filters: { Region: 'West', Year: 2026 },
      clearBehavior: 'leave-filter',
    };
    const out = buildAdditionalFilters(op);
    expect(out).toEqual<Filter[]>([
      { field: 'Region', op: 'eq', value: 'West' },
      { field: 'Year', op: 'eq', value: 2026 },
    ]);
  });

  it('skips undefined values but keeps null', () => {
    const op: TargetOp = {
      kind: 'filter',
      sheetId: 'w1',
      filters: { Region: undefined as unknown as string, Status: null },
      clearBehavior: 'leave-filter',
    };
    expect(buildAdditionalFilters(op)).toEqual<Filter[]>([
      { field: 'Status', op: 'eq', value: null },
    ]);
  });

  it('rejects non-filter TargetOps by returning []', () => {
    const op = {
      kind: 'highlight',
      sheetId: 'w1',
      fieldValues: { Region: 'West' },
    } as unknown as TargetOp;
    expect(buildAdditionalFilters(op)).toEqual([]);
  });

  it('rejects invalid field names (non-identifier) by dropping them', () => {
    const op: TargetOp = {
      kind: 'filter',
      sheetId: 'w1',
      filters: { 'bad field': 'x', good_field: 'y', '1bad': 'z' },
      clearBehavior: 'leave-filter',
    };
    expect(buildAdditionalFilters(op)).toEqual<Filter[]>([
      { field: 'good_field', op: 'eq', value: 'y' },
    ]);
  });
});
