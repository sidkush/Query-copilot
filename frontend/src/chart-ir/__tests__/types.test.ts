import { describe, it, expect } from 'vitest';
import type { Mark } from '../types';

describe('ChartSpec primitive types', () => {
  it('Mark type accepts all valid mark identifiers', () => {
    const validMarks: Mark[] = [
      'bar', 'line', 'area', 'point', 'circle', 'square', 'tick',
      'rect', 'arc', 'text', 'geoshape', 'boxplot', 'errorbar',
      'rule', 'trail', 'image',
    ];
    expect(validMarks.length).toBe(16);
  });
});

import type { SemanticType } from '../types';

describe('SemanticType', () => {
  it('accepts all five semantic types', () => {
    const types: SemanticType[] = [
      'nominal', 'ordinal', 'quantitative', 'temporal', 'geographic',
    ];
    expect(types.length).toBe(5);
  });
});

import type { Aggregate } from '../types';

describe('Aggregate', () => {
  it('accepts all twelve aggregation operators', () => {
    const aggs: Aggregate[] = [
      'sum', 'avg', 'min', 'max', 'count', 'distinct',
      'median', 'stdev', 'variance', 'p25', 'p75', 'p95', 'none',
    ];
    expect(aggs.length).toBe(13);
  });
});

import type { FieldRef } from '../types';

describe('FieldRef', () => {
  it('accepts a minimal field reference (field + type only)', () => {
    const ref: FieldRef = { field: 'revenue', type: 'quantitative' };
    expect(ref.field).toBe('revenue');
    expect(ref.type).toBe('quantitative');
  });

  it('accepts an aggregated measure reference', () => {
    const ref: FieldRef = {
      field: 'revenue',
      type: 'quantitative',
      aggregate: 'sum',
      format: '$,.0f',
      title: 'Total Revenue',
    };
    expect(ref.aggregate).toBe('sum');
  });

  it('accepts a binned quantitative field', () => {
    const ref: FieldRef = {
      field: 'age',
      type: 'quantitative',
      bin: { maxbins: 20 },
    };
    expect(ref.bin).toEqual({ maxbins: 20 });
  });

  it('accepts a temporal field with timeUnit', () => {
    const ref: FieldRef = {
      field: 'order_date',
      type: 'temporal',
      timeUnit: 'month',
      sort: 'asc',
    };
    expect(ref.timeUnit).toBe('month');
  });

  it('accepts a sort by another field with operator', () => {
    const ref: FieldRef = {
      field: 'product',
      type: 'nominal',
      sort: { field: 'revenue', op: 'sum' },
    };
    expect(typeof ref.sort).toBe('object');
  });
});

import type { Encoding } from '../types';

describe('Encoding', () => {
  it('accepts a minimal x/y encoding', () => {
    const enc: Encoding = {
      x: { field: 'date', type: 'temporal' },
      y: { field: 'revenue', type: 'quantitative', aggregate: 'sum' },
    };
    expect(enc.x?.field).toBe('date');
  });

  it('accepts color, size, and detail channels', () => {
    const enc: Encoding = {
      x: { field: 'date', type: 'temporal' },
      y: { field: 'revenue', type: 'quantitative' },
      color: { field: 'region', type: 'nominal', scheme: 'tableau10' },
      size: { field: 'volume', type: 'quantitative' },
      detail: [{ field: 'customer_id', type: 'nominal' }],
    };
    expect(enc.color?.scheme).toBe('tableau10');
  });

  it('accepts faceting via row/column channels', () => {
    const enc: Encoding = {
      x: { field: 'date', type: 'temporal' },
      y: { field: 'revenue', type: 'quantitative' },
      column: { field: 'region', type: 'nominal' },
    };
    expect(enc.column?.field).toBe('region');
  });

  it('accepts multiple tooltip fields', () => {
    const enc: Encoding = {
      x: { field: 'date', type: 'temporal' },
      y: { field: 'revenue', type: 'quantitative' },
      tooltip: [
        { field: 'date', type: 'temporal' },
        { field: 'revenue', type: 'quantitative' },
        { field: 'region', type: 'nominal' },
      ],
    };
    expect(enc.tooltip?.length).toBe(3);
  });
});

import type { Transform, Selection } from '../types';

describe('Transform', () => {
  it('accepts a filter transform', () => {
    const t: Transform = {
      filter: { field: 'region', op: 'eq', value: 'West' },
    };
    expect(t.filter?.value).toBe('West');
  });

  it('accepts a bin transform', () => {
    const t: Transform = { bin: { field: 'age', maxbins: 20 } };
    expect(t.bin?.maxbins).toBe(20);
  });

  it('accepts an aggregate transform', () => {
    const t: Transform = {
      aggregate: { field: 'revenue', op: 'sum', as: 'total_revenue' },
    };
    expect(t.aggregate?.as).toBe('total_revenue');
  });

  it('accepts an LTTB sample transform', () => {
    const t: Transform = { sample: { n: 1000, method: 'lttb' } };
    expect(t.sample?.method).toBe('lttb');
  });

  it('accepts a calculate transform with sandboxed expression', () => {
    const t: Transform = {
      calculate: { as: 'profit_margin', expr: 'datum.profit / datum.revenue' },
    };
    expect(t.calculate?.as).toBe('profit_margin');
  });
});

describe('Selection', () => {
  it('accepts an interval brush selection', () => {
    const s: Selection = {
      name: 'brush',
      type: 'interval',
      encodings: ['x'],
      clear: 'dblclick',
    };
    expect(s.type).toBe('interval');
  });

  it('accepts a point click selection', () => {
    const s: Selection = {
      name: 'highlight',
      type: 'point',
      on: 'click',
      encodings: ['color'],
    };
    expect(s.on).toBe('click');
  });
});
