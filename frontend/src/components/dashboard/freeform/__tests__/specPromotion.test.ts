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
});
