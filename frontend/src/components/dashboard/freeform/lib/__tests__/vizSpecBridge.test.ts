import { describe, it, expect } from 'vitest';

import { bridgeToVisualSpec } from '../vizSpecBridge';
import type { Filter } from '../filterApplication';
import type { DashboardParameter } from '../parameterTypes';
import type { DashboardSet } from '../setTypes';
import {
  DataType,
  FilterKind,
  MarkType,
} from '../vizSpec';

const noSets: DashboardSet[] = [];

describe('bridgeToVisualSpec - empty', () => {
  it('maps empty state to an empty VisualSpec with defaults', () => {
    const v = bridgeToVisualSpec({
      sheetId: 's1',
      sheetFilters: [],
      parameters: [],
      sets: noSets,
    });
    expect(v.sheetId).toBe('s1');
    expect(v.fields).toEqual([]);
    expect(v.filters).toEqual([]);
    expect(v.parameters).toEqual([]);
    expect(v.markType).toBe(MarkType.MARK_TYPE_UNSPECIFIED);
    expect(v.isGenerativeAiWebAuthoring).toBe(false);
    expect(v.domainType).toBe('separate');
  });
});

describe('bridgeToVisualSpec - filter mapping', () => {
  it('maps eq filter to categorical with single value', () => {
    const filters: Filter[] = [{ field: 'region', op: 'eq', value: 'NY' }];
    const v = bridgeToVisualSpec({
      sheetId: 's1',
      sheetFilters: filters,
      parameters: [],
      sets: noSets,
    });
    expect(v.filters).toHaveLength(1);
    expect(v.filters[0]!.filterKind).toBe(FilterKind.FILTER_KIND_CATEGORICAL);
    expect(v.filters[0]!.categorical?.values).toEqual(['NY']);
    expect(v.filters[0]!.categorical?.isExcludeMode).toBe(false);
  });

  it('maps in filter to categorical include', () => {
    const filters: Filter[] = [{ field: 'region', op: 'in', values: ['NY', 'CA'] }];
    const v = bridgeToVisualSpec({
      sheetId: 's1',
      sheetFilters: filters,
      parameters: [],
      sets: noSets,
    });
    expect(v.filters[0]!.categorical?.values).toEqual(['NY', 'CA']);
    expect(v.filters[0]!.categorical?.isExcludeMode).toBe(false);
  });

  it('maps notIn filter to categorical exclude', () => {
    const filters: Filter[] = [{ field: 'region', op: 'notIn', values: ['NY'] }];
    const v = bridgeToVisualSpec({
      sheetId: 's1',
      sheetFilters: filters,
      parameters: [],
      sets: noSets,
    });
    expect(v.filters[0]!.categorical?.isExcludeMode).toBe(true);
    expect(v.filters[0]!.categorical?.values).toEqual(['NY']);
  });

  it('coerces non-string eq values to string', () => {
    const filters: Filter[] = [
      { field: 'n', op: 'eq', value: 42 },
      { field: 'b', op: 'eq', value: true },
      { field: 'z', op: 'eq', value: null },
    ];
    const v = bridgeToVisualSpec({
      sheetId: 's1',
      sheetFilters: filters,
      parameters: [],
      sets: noSets,
    });
    expect(v.filters[0]!.categorical?.values).toEqual(['42']);
    expect(v.filters[1]!.categorical?.values).toEqual(['true']);
    expect(v.filters[2]!.categorical?.values).toEqual(['']);
  });
});

describe('bridgeToVisualSpec - parameter mapping', () => {
  it('maps list-domain parameter', () => {
    const params: DashboardParameter[] = [{
      id: 'p1', name: 'Region', type: 'string', value: 'NY',
      domain: { kind: 'list', values: ['NY', 'CA', 'TX'] },
      createdAt: '2026-04-17T00:00:00Z',
    }];
    const v = bridgeToVisualSpec({
      sheetId: 's1',
      sheetFilters: [],
      parameters: params,
      sets: noSets,
    });
    expect(v.parameters).toHaveLength(1);
    expect(v.parameters[0]!.dataType).toBe(DataType.DATA_TYPE_STRING);
    expect(v.parameters[0]!.domainKind).toBe('list');
    expect(v.parameters[0]!.domainValues).toEqual(['NY', 'CA', 'TX']);
  });

  it('maps range-domain numeric parameter', () => {
    const params: DashboardParameter[] = [{
      id: 'p2', name: 'Year', type: 'number', value: 2026,
      domain: { kind: 'range', min: 2020, max: 2030, step: 1 },
      createdAt: '2026-04-17T00:00:00Z',
    }];
    const v = bridgeToVisualSpec({
      sheetId: 's1',
      sheetFilters: [],
      parameters: params,
      sets: noSets,
    });
    expect(v.parameters[0]!.dataType).toBe(DataType.DATA_TYPE_NUMBER);
    expect(v.parameters[0]!.domainKind).toBe('range');
    expect(v.parameters[0]!.domainMin).toBe(2020);
    expect(v.parameters[0]!.domainMax).toBe(2030);
    expect(v.parameters[0]!.domainStep).toBe(1);
    expect(v.parameters[0]!.value).toBe('2026');
  });

  it('maps boolean and date parameters to expected DataTypes', () => {
    const params: DashboardParameter[] = [
      { id: 'pb', name: 'Enabled', type: 'boolean', value: true,
        domain: { kind: 'free' }, createdAt: '2026-04-17T00:00:00Z' },
      { id: 'pd', name: 'From', type: 'date', value: '2026-01-01',
        domain: { kind: 'free' }, createdAt: '2026-04-17T00:00:00Z' },
    ];
    const v = bridgeToVisualSpec({
      sheetId: 's1', sheetFilters: [], parameters: params, sets: noSets,
    });
    expect(v.parameters[0]!.dataType).toBe(DataType.DATA_TYPE_BOOL);
    expect(v.parameters[0]!.value).toBe('true');
    expect(v.parameters[1]!.dataType).toBe(DataType.DATA_TYPE_DATE_TIME);
    expect(v.parameters[1]!.value).toBe('2026-01-01');
  });
});

describe('bridgeToVisualSpec - AI flag + mark type', () => {
  it('propagates is_generative_ai_web_authoring', () => {
    const v = bridgeToVisualSpec({
      sheetId: 's1',
      sheetFilters: [],
      parameters: [],
      sets: noSets,
      isGenerativeAiWebAuthoring: true,
    });
    expect(v.isGenerativeAiWebAuthoring).toBe(true);
  });

  it('propagates explicit markType', () => {
    const v = bridgeToVisualSpec({
      sheetId: 's1',
      sheetFilters: [],
      parameters: [],
      sets: noSets,
      markType: MarkType.MARK_TYPE_BAR,
    });
    expect(v.markType).toBe(MarkType.MARK_TYPE_BAR);
  });
});

describe('bridgeToVisualSpec - purity', () => {
  it('does not mutate inputs', () => {
    const filters: Filter[] = [{ field: 'region', op: 'in', values: ['NY'] }];
    const snapshot = JSON.stringify(filters);
    bridgeToVisualSpec({
      sheetId: 's1',
      sheetFilters: filters,
      parameters: [],
      sets: noSets,
    });
    expect(JSON.stringify(filters)).toBe(snapshot);
  });
});
