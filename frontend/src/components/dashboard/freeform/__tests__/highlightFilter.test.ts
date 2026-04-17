import { describe, it, expect } from 'vitest';
import { compileHighlightFilter } from '../lib/highlightFilter';

describe('compileHighlightFilter', () => {
  it('empty highlight returns "true" (no mask)', () => {
    expect(compileHighlightFilter({})).toBe('true');
    expect(compileHighlightFilter(null as unknown as Record<string, unknown>)).toBe('true');
  });

  it('single string field renders quoted equality', () => {
    expect(compileHighlightFilter({ region: 'East' })).toBe(
      "(datum['region'] === \"East\")",
    );
  });

  it('numeric field renders unquoted equality', () => {
    expect(compileHighlightFilter({ year: 2024 })).toBe("(datum['year'] === 2024)");
  });

  it('boolean field renders unquoted equality', () => {
    expect(compileHighlightFilter({ active: true })).toBe(
      "(datum['active'] === true)",
    );
  });

  it('multi-value field becomes OR-grouped', () => {
    expect(compileHighlightFilter({ region: ['East', 'West'] })).toBe(
      "(datum['region'] === \"East\" || datum['region'] === \"West\")",
    );
  });

  it('multiple fields are AND-joined', () => {
    expect(compileHighlightFilter({ region: 'East', year: 2024 })).toBe(
      "(datum['region'] === \"East\") && (datum['year'] === 2024)",
    );
  });

  it('field name with single quote is escaped', () => {
    expect(compileHighlightFilter({ "o'brien": 'x' })).toBe(
      "(datum['o\\'brien'] === \"x\")",
    );
  });

  it('null value is treated as no constraint for that field', () => {
    expect(compileHighlightFilter({ region: null })).toBe('true');
  });
});
