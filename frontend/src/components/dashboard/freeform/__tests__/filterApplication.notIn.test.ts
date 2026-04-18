import { describe, it, expect } from 'vitest';
import type { Filter } from '../lib/filterApplication';

describe('Filter type — notIn variant (Plan 6e)', () => {
  it('accepts a notIn filter shape at the type level + at runtime', () => {
    const f: Filter = { field: 'region', op: 'notIn', values: ['East', 'West'] };
    expect(f.op).toBe('notIn');
    expect(f.values).toEqual(['East', 'West']);
  });

  it('serializes round-trip through JSON.stringify', () => {
    const f: Filter = { field: 'year', op: 'notIn', values: [2024, 2025] };
    const json = JSON.stringify(f);
    const parsed = JSON.parse(json) as Filter;
    expect(parsed).toEqual(f);
  });
});
