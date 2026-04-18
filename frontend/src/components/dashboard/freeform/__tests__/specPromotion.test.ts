// Plan 7 T18 — regression test for chart-spec mark promotion.
//
// Bug observed in live preview: agent-generated tiles ship with
// `mark: "text"` + an (x: categorical, y: quantitative) encoding pair,
// which Vega renders as invisible text glyphs inside the plot area. The
// tile shows only axes + a `color` legend (data measurements shown as
// colored dots) but no readable chart marks. User verdict: "I cannot
// infer which stations are in the Top 15."
//
// Fix: a pure helper `promoteSpecMark(spec)` promotes `mark: "text"` (or
// `mark: { type: "text" }`) to `mark: "bar"` when the spec has both an
// x and a y encoding — i.e. when the spec's structure is clearly an
// x/y chart rather than a legit standalone text annotation.
import { describe, it, expect } from 'vitest';
import { promoteSpecMark } from '../lib/specPromotion';

describe('Plan 7 T18 — promoteSpecMark', () => {
  it('promotes mark:"text" to mark:"bar" when spec has x + y encodings', () => {
    const spec = {
      $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
      mark: 'text',
      encoding: {
        x: { field: 'start_station_name', type: 'nominal' },
        y: { aggregate: 'sum', field: 'dominant_avg_duration_min', type: 'quantitative' },
        color: { field: 'non_dominant_avg_duration_min', type: 'nominal' },
      },
    };
    const out = promoteSpecMark(spec);
    expect(out.mark).toBe('bar');
    // other fields preserved
    expect(out.encoding.x.field).toBe('start_station_name');
    expect(out.encoding.y.aggregate).toBe('sum');
  });

  it('promotes mark:{type:"text"} object form to mark:{type:"bar"} with other options preserved', () => {
    const spec = {
      mark: { type: 'text', fontSize: 12, dx: 5 },
      encoding: {
        x: { field: 's', type: 'nominal' },
        y: { field: 'v', type: 'quantitative' },
      },
    };
    const out = promoteSpecMark(spec);
    expect(out.mark.type).toBe('bar');
    // Don't carry over text-only options like fontSize / dx when
    // promoting to a bar — text options are meaningless on rect marks.
    expect(out.mark.fontSize).toBeUndefined();
    expect(out.mark.dx).toBeUndefined();
  });

  it('does NOT promote standalone text annotations (no x or no y)', () => {
    const annotationOnly = {
      mark: 'text',
      encoding: { text: { value: 'Annotation' } },
    };
    expect(promoteSpecMark(annotationOnly).mark).toBe('text');

    const xOnly = {
      mark: 'text',
      encoding: { x: { field: 'a', type: 'nominal' } },
    };
    expect(promoteSpecMark(xOnly).mark).toBe('text');
  });

  it('leaves non-text marks unchanged', () => {
    const spec = {
      mark: 'bar',
      encoding: { x: { field: 'a', type: 'nominal' }, y: { field: 'b', type: 'quantitative' } },
    };
    expect(promoteSpecMark(spec)).toBe(spec); // identity ref
  });

  it('handles null / undefined / non-object inputs safely', () => {
    expect(promoteSpecMark(null as any)).toBe(null);
    expect(promoteSpecMark(undefined as any)).toBe(undefined);
    expect(promoteSpecMark('nope' as any)).toBe('nope');
  });

  it('returns identity when no promotion needed (for useMemo short-circuits)', () => {
    const spec = {
      mark: 'bar',
      encoding: { x: { field: 'a', type: 'nominal' }, y: { field: 'b', type: 'quantitative' } },
    };
    expect(promoteSpecMark(spec)).toBe(spec);
  });

  it('T21 — promotes mark:"arc" to "bar" when spec has x + y encodings (arcs ignore x/y → no marks)', () => {
    const spec = {
      mark: 'arc',
      encoding: {
        x: { field: 'rideable_type', type: 'nominal' },
        y: { aggregate: 'sum', field: 'total_rides', type: 'quantitative' },
      },
    };
    expect(promoteSpecMark(spec).mark).toBe('bar');
  });

  it('T21 — leaves a LEGITIMATE arc (theta-encoded pie) alone', () => {
    const pie = {
      mark: 'arc',
      encoding: {
        theta: { field: 'count', type: 'quantitative' },
        color: { field: 'category', type: 'nominal' },
      },
    };
    expect(promoteSpecMark(pie)).toBe(pie);
  });
});

import { repairBadAggregate } from '../lib/specPromotion';

describe('Plan 7 T21 — repairBadAggregate', () => {
  it('swaps sum(nominal-field) to count when same field is typed nominal elsewhere in the spec', () => {
    // Case: y.aggregate='sum' on `rideable_type` which is a string field.
    // The same `rideable_type` is also referenced as a nominal (e.g. it's
    // the MEASURE field of the chart but mistakenly typed quantitative).
    // Real-world: agent-generated spec tried to sum a string column.
    const spec = {
      mark: 'bar',
      encoding: {
        x: { field: 'start_station_name', type: 'nominal' },
        y: { aggregate: 'sum', field: 'rideable_type', type: 'quantitative' },
        color: { field: 'concentration_pct', type: 'nominal' },
      },
    };
    const out = repairBadAggregate(spec);
    expect(out.encoding.y.aggregate).toBe('count');
    // Field dropped — count(*) is type-agnostic. Type remains quantitative
    // so the y axis is still numeric.
    expect(out.encoding.y.field).toBeUndefined();
    expect(out.encoding.y.type).toBe('quantitative');
    // Other encodings untouched.
    expect(out.encoding.x.field).toBe('start_station_name');
    expect(out.encoding.color.field).toBe('concentration_pct');
  });

  it('leaves a legitimate sum(quantitative) alone', () => {
    const spec = {
      mark: 'bar',
      encoding: {
        x: { field: 'rideable_type', type: 'nominal' },
        y: { aggregate: 'sum', field: 'total_rides', type: 'quantitative' },
      },
    };
    expect(repairBadAggregate(spec)).toBe(spec);
  });

  it('returns identity for aggregates outside the numeric set (count / valid / distinct)', () => {
    // After T22.2 mean is in the numeric-aggregates set and WOULD trigger
    // repair when paired with a nominal field, so use `count` here which
    // is already a type-agnostic aggregate.
    const spec = {
      mark: 'bar',
      encoding: {
        x: { field: 'a', type: 'nominal' },
        y: { aggregate: 'count', type: 'quantitative' },
      },
    };
    expect(repairBadAggregate(spec)).toBe(spec);
  });

  it('handles null / undefined safely', () => {
    expect(repairBadAggregate(null as any)).toBe(null);
    expect(repairBadAggregate(undefined as any)).toBe(undefined);
    expect(repairBadAggregate({ mark: 'bar' } as any)).toEqual({ mark: 'bar' });
  });

  it('T22.2 — extends to mean / average / median / max / min on nominal-suffix fields', () => {
    for (const agg of ['mean', 'average', 'median', 'max', 'min']) {
      const spec = {
        mark: 'bar',
        encoding: {
          x: { field: 'station', type: 'nominal' },
          y: { aggregate: agg, field: 'bike_type', type: 'quantitative' },
        },
      };
      const out = repairBadAggregate(spec);
      expect(out.encoding.y.aggregate).toBe('count');
      expect(out.encoding.y.field).toBeUndefined();
    }
  });
});

import { fallbackNullMark, repairMissingMeasure, repairColorTypeForMeasure, capColorCardinality, repairSpec } from '../lib/specPromotion';

describe('Plan 8 T22.1 — fallbackNullMark', () => {
  it('defaults null mark to "bar" when spec has x + y encodings', () => {
    const spec = { encoding: { x: { field: 'a', type: 'nominal' }, y: { field: 'b', type: 'quantitative' } } };
    expect(fallbackNullMark(spec).mark).toBe('bar');
  });

  it('defaults null mark to "text" when spec has neither x nor y', () => {
    const spec = { encoding: { text: { value: 'Hello' } } };
    expect(fallbackNullMark(spec).mark).toBe('text');
  });

  it('normalizes plural typos ("bars", "lines", "points", "circles") to canonical singular', () => {
    expect(fallbackNullMark({ mark: 'bars' }).mark).toBe('bar');
    expect(fallbackNullMark({ mark: 'lines' }).mark).toBe('line');
    expect(fallbackNullMark({ mark: 'points' }).mark).toBe('point');
    expect(fallbackNullMark({ mark: 'circles' }).mark).toBe('circle');
  });

  it('leaves recognized marks alone', () => {
    const spec = { mark: 'bar', encoding: {} };
    expect(fallbackNullMark(spec)).toBe(spec);
  });

  it('handles null / undefined', () => {
    expect(fallbackNullMark(null as any)).toBe(null);
    expect(fallbackNullMark(undefined as any)).toBe(undefined);
  });
});

describe('Plan 8 T22.3 — repairMissingMeasure', () => {
  it('bar with only x encoding → injects y: count', () => {
    const spec = { mark: 'bar', encoding: { x: { field: 'station', type: 'nominal' } } };
    const out = repairMissingMeasure(spec);
    expect(out.encoding.y.aggregate).toBe('count');
    expect(out.encoding.y.type).toBe('quantitative');
    expect(out.encoding.x.field).toBe('station'); // untouched
  });

  it('line with only x encoding → injects y: count', () => {
    const spec = { mark: 'line', encoding: { x: { field: 'day', type: 'temporal' } } };
    expect(repairMissingMeasure(spec).encoding.y.aggregate).toBe('count');
  });

  it('bar with both x and y → untouched', () => {
    const spec = {
      mark: 'bar',
      encoding: { x: { field: 'a', type: 'nominal' }, y: { field: 'b', type: 'quantitative' } },
    };
    expect(repairMissingMeasure(spec)).toBe(spec);
  });

  it('non-measure mark (text annotation) untouched', () => {
    const spec = { mark: 'text', encoding: { text: { value: 'X' } } };
    expect(repairMissingMeasure(spec)).toBe(spec);
  });

  it('handles null / undefined', () => {
    expect(repairMissingMeasure(null as any)).toBe(null);
  });
});

describe('Plan 8 T22.4 — repairColorTypeForMeasure', () => {
  it('color.field === y.field and color.type=="nominal" with y quantitative → swap color.type to quantitative', () => {
    const spec = {
      mark: 'bar',
      encoding: {
        x: { field: 'station', type: 'nominal' },
        y: { aggregate: 'sum', field: 'rides', type: 'quantitative' },
        color: { field: 'rides', type: 'nominal' },
      },
    };
    expect(repairColorTypeForMeasure(spec).encoding.color.type).toBe('quantitative');
  });

  it('leaves color alone when field differs from y.field', () => {
    const spec = {
      mark: 'bar',
      encoding: {
        x: { field: 'a', type: 'nominal' },
        y: { field: 'b', type: 'quantitative' },
        color: { field: 'c', type: 'nominal' },
      },
    };
    expect(repairColorTypeForMeasure(spec)).toBe(spec);
  });

  it('leaves legit quantitative color alone', () => {
    const spec = {
      mark: 'bar',
      encoding: {
        y: { field: 'x', type: 'quantitative' },
        color: { field: 'x', type: 'quantitative' },
      },
    };
    expect(repairColorTypeForMeasure(spec)).toBe(spec);
  });
});

describe('Plan 8 T22.5 — capColorCardinality', () => {
  it('drops color channel when data sample has > 20 unique values on the color field', () => {
    const manyValues = Array.from({ length: 25 }, (_, i) => ({ k: 'cat' + i, v: i }));
    const spec = {
      mark: 'bar',
      data: { values: manyValues },
      encoding: {
        x: { field: 'k', type: 'nominal' },
        y: { field: 'v', type: 'quantitative' },
        color: { field: 'k', type: 'nominal' },
      },
    };
    const out = capColorCardinality(spec);
    expect(out.encoding.color).toBeUndefined();
  });

  it('keeps color channel when cardinality <= 20', () => {
    const fewValues = Array.from({ length: 5 }, (_, i) => ({ k: 'cat' + i, v: i }));
    const spec = {
      mark: 'bar',
      data: { values: fewValues },
      encoding: {
        x: { field: 'k', type: 'nominal' },
        color: { field: 'k', type: 'nominal' },
      },
    };
    expect(capColorCardinality(spec)).toBe(spec);
  });

  it('is a no-op when spec has no data values (cannot determine cardinality)', () => {
    const spec = { mark: 'bar', encoding: { color: { field: 'k', type: 'nominal' } } };
    expect(capColorCardinality(spec)).toBe(spec);
  });

  it('is a no-op for quantitative color (gradient legend is fine)', () => {
    const spec = {
      mark: 'bar',
      data: { values: Array.from({ length: 100 }, (_, i) => ({ k: i })) },
      encoding: { color: { field: 'k', type: 'quantitative' } },
    };
    expect(capColorCardinality(spec)).toBe(spec);
  });
});

describe('Plan 8 T22.6 — repairSpec pipeline', () => {
  it('composes passes: text+xy → bar, sum(nominal) → count, missing-y → count, color-nominal-on-measure → quantitative', () => {
    // A spec that triggers multiple repairs at once.
    const wreck = {
      mark: 'text',
      encoding: {
        x: { field: 'station', type: 'nominal' },
        y: { aggregate: 'sum', field: 'station_name', type: 'quantitative' },
        color: { field: 'station_name', type: 'nominal' },
      },
    };
    const out = repairSpec(wreck);
    // mark promoted (T18)
    expect(out.mark === 'bar' || (typeof out.mark === 'object' && out.mark.type === 'bar')).toBe(true);
    // aggregate repaired to count (T21)
    expect(out.encoding.y.aggregate).toBe('count');
    expect(out.encoding.y.field).toBeUndefined();
  });

  it('identity-returns a clean spec (useMemo short-circuit path)', () => {
    const spec = {
      mark: 'bar',
      encoding: { x: { field: 'a', type: 'nominal' }, y: { field: 'b', type: 'quantitative' } },
    };
    expect(repairSpec(spec)).toBe(spec);
  });

  it('handles null / undefined', () => {
    expect(repairSpec(null as any)).toBe(null);
    expect(repairSpec(undefined as any)).toBe(undefined);
  });
});
