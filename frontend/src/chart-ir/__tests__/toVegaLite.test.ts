import { describe, it, expect } from 'vitest';
import { compileToVegaLite } from '../compiler/toVegaLite';
import type { ChartSpec } from '../types';
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

  it('moves color.scheme into color.scale.scheme per Vega-Lite convention', () => {
    const spec: ChartSpec = {
      $schema: 'askdb/chart-spec/v1',
      type: 'cartesian',
      mark: 'bar',
      encoding: {
        x: { field: 'region', type: 'nominal' },
        y: { field: 'revenue', type: 'quantitative' },
        color: { field: 'region', type: 'nominal', scheme: 'category10' },
      },
    };
    const vl = compileToVegaLite(spec);
    const colorEnc = vl.encoding?.color as Record<string, unknown>;
    expect(colorEnc?.scale).toEqual({ scheme: 'category10' });
    // The original scheme property should NOT appear at the color top level
    expect(colorEnc?.scheme).toBeUndefined();
  });

  it('faceted spec omits top-level data (children inherit from parent)', () => {
    const vl = compileToVegaLite(FACETED_BARS);
    expect(vl.data).toBeUndefined();
    // Inner spec should also not have data
    expect(vl.spec?.data).toBeUndefined();
  });

  it('preserves mark object shape with extra config properties', () => {
    const spec: ChartSpec = {
      $schema: 'askdb/chart-spec/v1',
      type: 'cartesian',
      mark: { type: 'bar', cornerRadius: 4, tooltip: true } as unknown as {
        type: 'bar';
        [k: string]: unknown;
      },
      encoding: {
        x: { field: 'product', type: 'nominal' },
        y: { field: 'sales', type: 'quantitative' },
      },
    };
    const vl = compileToVegaLite(spec);
    const m = vl.mark as { type: string; cornerRadius: number; tooltip: boolean };
    expect(m.type).toBe('bar');
    expect(m.cornerRadius).toBe(4);
    expect(m.tooltip).toBe(true);
  });

  it('translates selection into Vega-Lite v5 params with nested select shape', () => {
    const spec: ChartSpec = {
      $schema: 'askdb/chart-spec/v1',
      type: 'cartesian',
      mark: 'point',
      encoding: {
        x: { field: 'x', type: 'quantitative' },
        y: { field: 'y', type: 'quantitative' },
      },
      selection: [
        {
          name: 'brush',
          type: 'interval',
          on: 'click',
          encodings: ['x', 'y'],
          clear: 'dblclick',
        },
      ],
    };
    const vl = compileToVegaLite(spec);
    const params = (vl as unknown as { params: unknown[] }).params;
    expect(Array.isArray(params)).toBe(true);
    expect(params).toHaveLength(1);
    const p = params[0] as { name: string; select: Record<string, unknown> };
    expect(p.name).toBe('brush');
    expect(p.select.type).toBe('interval');
    expect(p.select.on).toBe('click');
    expect(p.select.clear).toBe('dblclick');
    expect(p.select.encodings).toEqual(['x', 'y']);
  });
});
