import { describe, it, expect } from 'vitest';
import { detectCorrections } from '../../semantic/correctionDetector';
import type { CorrectionSuggestion } from '../../semantic/correctionDetector';
import type { ChartSpec } from '../../types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function baseSpec(overrides: Partial<ChartSpec> = {}): ChartSpec {
  return {
    $schema: 'askdb/chart-spec/v1',
    type: 'cartesian',
    mark: 'bar',
    encoding: {
      x: { field: 'category', type: 'nominal' },
      y: { field: 'revenue', type: 'quantitative', aggregate: 'sum' },
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Detects field rename as synonym suggestion
// ---------------------------------------------------------------------------

describe('detectCorrections — synonym', () => {
  it('emits a synonym suggestion when a field is renamed on an encoding channel', () => {
    const before = baseSpec();
    const after = baseSpec({
      encoding: {
        x: { field: 'product_category', type: 'nominal' }, // renamed
        y: { field: 'revenue', type: 'quantitative', aggregate: 'sum' },
      },
    });

    const corrections = detectCorrections(before, after);

    expect(corrections).toHaveLength(1);
    const [c] = corrections;
    expect(c.type).toBe('synonym');
    expect(c.message).toBe('Remember "product_category" as synonym for "category"?');
    expect(c.payload).toMatchObject({
      channel: 'x',
      oldField: 'category',
      newField: 'product_category',
    });
  });
});

// ---------------------------------------------------------------------------
// 2. Detects color scale change as color_map suggestion
// ---------------------------------------------------------------------------

describe('detectCorrections — color_map', () => {
  it('emits a color_map suggestion when color scale range changes', () => {
    const before = baseSpec({
      encoding: {
        x: { field: 'category', type: 'nominal' },
        y: { field: 'revenue', type: 'quantitative', aggregate: 'sum' },
        color: Object.assign(
          { field: 'region', type: 'nominal' } as ChartSpec['encoding'] extends infer E
            ? E extends object ? (E extends { color?: infer C } ? NonNullable<C> : never) : never
            : never,
          { scale: { domain: ['EU', 'US'], range: ['#aaa', '#bbb'] } },
        ),
      },
    });

    const after = baseSpec({
      encoding: {
        x: { field: 'category', type: 'nominal' },
        y: { field: 'revenue', type: 'quantitative', aggregate: 'sum' },
        color: Object.assign(
          { field: 'region', type: 'nominal' } as ChartSpec['encoding'] extends infer E
            ? E extends object ? (E extends { color?: infer C } ? NonNullable<C> : never) : never
            : never,
          { scale: { domain: ['EU', 'US'], range: ['#111', '#222'] } },
        ),
      },
    });

    const corrections = detectCorrections(before, after);

    expect(corrections).toHaveLength(1);
    const [c] = corrections;
    expect(c.type).toBe('color_map');
    expect(c.message).toBe('Save color assignments for "region" to all charts?');
    expect(c.payload).toMatchObject({
      field: 'region',
      range: ['#111', '#222'],
    });
  });
});

// ---------------------------------------------------------------------------
// 3. Detects aggregation change as measure_default suggestion
// ---------------------------------------------------------------------------

describe('detectCorrections — measure_default', () => {
  it('emits a measure_default suggestion when aggregate changes on the same field', () => {
    const before = baseSpec({
      encoding: {
        x: { field: 'category', type: 'nominal' },
        y: { field: 'revenue', type: 'quantitative', aggregate: 'sum' },
      },
    });

    const after = baseSpec({
      encoding: {
        x: { field: 'category', type: 'nominal' },
        y: { field: 'revenue', type: 'quantitative', aggregate: 'avg' },
      },
    });

    const corrections = detectCorrections(before, after);

    expect(corrections).toHaveLength(1);
    const [c] = corrections;
    expect(c.type).toBe('measure_default');
    expect(c.message).toBe('Default aggregate for "revenue" is avg?');
    expect(c.payload).toMatchObject({
      channel: 'y',
      field: 'revenue',
      oldAggregate: 'sum',
      newAggregate: 'avg',
    });
  });
});

// ---------------------------------------------------------------------------
// 4. Returns empty for identical specs
// ---------------------------------------------------------------------------

describe('detectCorrections — identical specs', () => {
  it('returns [] when before and after are identical', () => {
    const spec = baseSpec();
    expect(detectCorrections(spec, spec)).toEqual([]);
  });

  it('returns [] when specs have equal encodings but different mark', () => {
    const before = baseSpec({ mark: 'bar' });
    const after = baseSpec({ mark: 'line' });
    expect(detectCorrections(before, after)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 5. Returns empty for null before
// ---------------------------------------------------------------------------

describe('detectCorrections — null/undefined guard', () => {
  it('returns [] when before is null', () => {
    expect(detectCorrections(null, baseSpec())).toEqual([]);
  });

  it('returns [] when after is undefined', () => {
    expect(detectCorrections(baseSpec(), undefined)).toEqual([]);
  });

  it('returns [] when both are null', () => {
    expect(detectCorrections(null, null)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 6. Handles mark type change without crashing
// ---------------------------------------------------------------------------

describe('detectCorrections — mark change', () => {
  it('does not crash when only the mark type changes', () => {
    const before = baseSpec({ mark: 'bar' });
    const after = baseSpec({ mark: { type: 'point', filled: true } });

    let result: CorrectionSuggestion[] | undefined;
    expect(() => {
      result = detectCorrections(before, after);
    }).not.toThrow();
    expect(result).toEqual([]);
  });

  it('still detects field rename alongside a mark change', () => {
    const before = baseSpec({ mark: 'bar' });
    const after = baseSpec({
      mark: 'line',
      encoding: {
        x: { field: 'date', type: 'temporal' }, // renamed from 'category'
        y: { field: 'revenue', type: 'quantitative', aggregate: 'sum' },
      },
    });

    const corrections = detectCorrections(before, after);
    expect(corrections).toHaveLength(1);
    expect(corrections[0].type).toBe('synonym');
  });
});

// ---------------------------------------------------------------------------
// 7. Generates unique ids across a single call
// ---------------------------------------------------------------------------

describe('detectCorrections — unique ids', () => {
  it('generates unique ids for multiple corrections in one call', () => {
    // Trigger three corrections at once:
    //   x field rename (synonym)
    //   y aggregate change (measure_default)
    //   color scale change (color_map)
    const before = baseSpec({
      encoding: {
        x: { field: 'category', type: 'nominal' },
        y: { field: 'revenue', type: 'quantitative', aggregate: 'sum' },
        color: Object.assign(
          { field: 'region', type: 'nominal' } as ChartSpec['encoding'] extends infer E
            ? E extends object ? (E extends { color?: infer C } ? NonNullable<C> : never) : never
            : never,
          { scale: { range: ['#aaa'] } },
        ),
      },
    });

    const after = baseSpec({
      encoding: {
        x: { field: 'product_category', type: 'nominal' },
        y: { field: 'revenue', type: 'quantitative', aggregate: 'avg' },
        color: Object.assign(
          { field: 'region', type: 'nominal' } as ChartSpec['encoding'] extends infer E
            ? E extends object ? (E extends { color?: infer C } ? NonNullable<C> : never) : never
            : never,
          { scale: { range: ['#fff'] } },
        ),
      },
    });

    const corrections = detectCorrections(before, after);

    expect(corrections.length).toBeGreaterThanOrEqual(2);

    const ids = corrections.map((c) => c.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);

    // All ids must match the expected pattern
    for (const id of ids) {
      expect(id).toMatch(/^corr-\d+-\d+$/);
    }
  });
});
