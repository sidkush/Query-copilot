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

  it('returns identity for non-sum aggregates', () => {
    const spec = {
      mark: 'bar',
      encoding: {
        x: { field: 'a', type: 'nominal' },
        y: { aggregate: 'mean', field: 'a', type: 'quantitative' },
      },
    };
    expect(repairBadAggregate(spec)).toBe(spec);
  });

  it('handles null / undefined safely', () => {
    expect(repairBadAggregate(null as any)).toBe(null);
    expect(repairBadAggregate(undefined as any)).toBe(undefined);
    expect(repairBadAggregate({ mark: 'bar' } as any)).toEqual({ mark: 'bar' });
  });
});
