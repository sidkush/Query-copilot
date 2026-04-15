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
