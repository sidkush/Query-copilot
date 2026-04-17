import { describe, it, expect } from 'vitest';
import {
  compileHighlightFilter,
  applyHighlightToSpec,
  mergeMarkIntoHighlight,
} from '../lib/highlightFilter';

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

describe('applyHighlightToSpec', () => {
  const baseSpec = {
    type: 'cartesian',
    encoding: { x: { field: 'region', type: 'nominal' }, y: { field: 'sales', type: 'quantitative' } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  it('empty slice returns spec by reference', () => {
    expect(applyHighlightToSpec(baseSpec, {})).toBe(baseSpec);
    expect(applyHighlightToSpec(baseSpec, null)).toBe(baseSpec);
  });

  it('non-empty slice injects opacity condition', () => {
    const out = applyHighlightToSpec(baseSpec, { region: 'East' });
    expect(out).not.toBe(baseSpec);
    expect(out.encoding.opacity).toEqual({
      condition: { test: "(datum['region'] === \"East\")", value: 1.0 },
      value: 0.15,
    });
  });

  it('non-empty slice injects stroke + strokeWidth conditions', () => {
    const out = applyHighlightToSpec(baseSpec, { region: 'East' });
    expect(out.encoding.stroke).toMatchObject({
      condition: { test: "(datum['region'] === \"East\")" },
    });
    expect(out.encoding.strokeWidth).toEqual({
      condition: { test: "(datum['region'] === \"East\")", value: 2 },
      value: 0,
    });
  });

  it('does not mutate input spec', () => {
    const before = JSON.parse(JSON.stringify(baseSpec));
    applyHighlightToSpec(baseSpec, { region: 'East' });
    expect(baseSpec).toEqual(before);
  });
});

describe('mergeMarkIntoHighlight', () => {
  it('null fields clears the slice', () => {
    expect(mergeMarkIntoHighlight({ region: 'East' }, null, false)).toBeNull();
    expect(mergeMarkIntoHighlight({ region: 'East' }, null, true)).toBeNull();
  });

  it('plain click replaces', () => {
    expect(mergeMarkIntoHighlight({ region: 'East' }, { region: 'West' }, false))
      .toEqual({ region: 'West' });
  });

  it('shift click promotes scalar to array', () => {
    expect(mergeMarkIntoHighlight({ region: 'East' }, { region: 'West' }, true))
      .toEqual({ region: ['East', 'West'] });
  });

  it('shift click on existing array appends + dedups', () => {
    expect(mergeMarkIntoHighlight({ region: ['East', 'West'] }, { region: 'East' }, true))
      .toEqual({ region: ['East', 'West'] });
    expect(mergeMarkIntoHighlight({ region: ['East'] }, { region: 'North' }, true))
      .toEqual({ region: ['East', 'North'] });
  });

  it('shift click adds new field to existing slice', () => {
    expect(mergeMarkIntoHighlight({ region: 'East' }, { year: 2024 }, true))
      .toEqual({ region: 'East', year: 2024 });
  });

  it('plain click on null prev still seeds', () => {
    expect(mergeMarkIntoHighlight(null, { region: 'East' }, false))
      .toEqual({ region: 'East' });
  });
});
