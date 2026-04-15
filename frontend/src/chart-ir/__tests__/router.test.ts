import { describe, it, expect } from 'vitest';
import { routeSpec, type RendererId } from '../router';
import { SIMPLE_BAR, TIME_SERIES_LINE } from './fixtures/canonical-charts';
import type { ChartSpec } from '../types';

// Note: vitest 2.x `.toBe()` does not accept a type argument, so the
// plan's `.toBe<RendererId>(...)` syntax is dropped. Type safety still
// holds via the return type of `routeSpec`. A no-op type assertion
// pins the expected value against RendererId so the test still fails
// if the renderer ID union drifts.
const asRenderer = (r: RendererId): RendererId => r;

describe('routeSpec', () => {
  it('routes a cartesian spec to the vega-lite renderer', () => {
    expect(routeSpec(SIMPLE_BAR)).toBe(asRenderer('vega-lite'));
    expect(routeSpec(TIME_SERIES_LINE)).toBe(asRenderer('vega-lite'));
  });

  it('routes a map spec to the maplibre renderer', () => {
    const spec: ChartSpec = {
      $schema: 'askdb/chart-spec/v1',
      type: 'map',
      map: {
        provider: 'maplibre',
        style: 'osm-bright',
        center: [-122.4, 37.8],
        zoom: 10,
        layers: [],
      },
    };
    expect(routeSpec(spec)).toBe(asRenderer('maplibre'));
  });

  it('routes a geo-overlay spec to the deck.gl renderer', () => {
    const spec: ChartSpec = {
      $schema: 'askdb/chart-spec/v1',
      type: 'geo-overlay',
      overlay: { layers: [{ type: 'ScatterplotLayer' }] },
    };
    expect(routeSpec(spec)).toBe(asRenderer('deckgl'));
  });

  it('routes a creative spec to the three renderer', () => {
    const spec: ChartSpec = {
      $schema: 'askdb/chart-spec/v1',
      type: 'creative',
      creative: { engine: 'r3f', component: 'hologram', props: {} },
    };
    expect(routeSpec(spec)).toBe(asRenderer('three'));
  });

  it('throws on an unknown spec type', () => {
    expect(() =>
      routeSpec({
        $schema: 'askdb/chart-spec/v1',
        type: 'unknown' as never,
      }),
    ).toThrow(/unknown spec type/i);
  });
});
