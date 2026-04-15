import { describe, it, expect } from 'vitest';
import { compileToVegaLite } from '../compiler/toVegaLite';
import {
  SIMPLE_BAR,
  TIME_SERIES_LINE,
  SCATTER_WITH_SIZE,
  FACETED_BARS,
  LAYERED_LINE_POINT,
} from './fixtures/canonical-charts';

describe('compileToVegaLite', () => {
  it('compiles a simple bar chart', () => {
    const vl = compileToVegaLite(SIMPLE_BAR);
    expect(vl.mark).toBe('bar');
    expect(vl.encoding?.x).toEqual({ field: 'category', type: 'nominal' });
    expect(vl.encoding?.y).toEqual({
      field: 'value',
      type: 'quantitative',
      aggregate: 'sum',
    });
  });

  it('compiles a time-series line with color encoding', () => {
    const vl = compileToVegaLite(TIME_SERIES_LINE);
    expect(vl.mark).toBe('line');
    expect(vl.encoding?.x?.type).toBe('temporal');
    expect(vl.encoding?.color?.field).toBe('region');
  });

  it('compiles a scatter with size encoding', () => {
    const vl = compileToVegaLite(SCATTER_WITH_SIZE);
    expect(vl.mark).toBe('point');
    expect(vl.encoding?.size?.field).toBe('population');
    expect(vl.encoding?.color?.field).toBe('continent');
  });

  it('compiles a faceted spec preserving the inner spec', () => {
    const vl = compileToVegaLite(FACETED_BARS);
    expect(vl.facet?.column?.field).toBe('region');
    expect(vl.spec?.mark).toBe('bar');
  });

  it('compiles a layered spec preserving both layers', () => {
    const vl = compileToVegaLite(LAYERED_LINE_POINT);
    expect(vl.layer?.length).toBe(2);
    expect(vl.layer?.[0]!.mark).toBe('line');
    expect(vl.layer?.[1]!.mark).toBe('point');
  });

  it('throws on a non-cartesian spec', () => {
    expect(() =>
      compileToVegaLite({
        $schema: 'askdb/chart-spec/v1',
        type: 'map',
        map: { provider: 'maplibre', style: 'osm', center: [0, 0], zoom: 1, layers: [] },
      }),
    ).toThrow(/non-cartesian/i);
  });
});
