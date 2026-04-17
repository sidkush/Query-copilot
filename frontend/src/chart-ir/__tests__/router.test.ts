import { describe, it, expect } from 'vitest';
import {
  routeSpec,
  routeSpecWithStrategy,
  type RendererId,
  type RouteWithStrategyInput,
} from '../router';
import { SIMPLE_BAR, TIME_SERIES_LINE } from './fixtures/canonical-charts';
import type { ChartSpec } from '../types';

// Note: vitest 2.x `.toBe()` does not accept a type argument, so the
// plan's `.toBe<RendererId>(...)` syntax is dropped. Type safety still
// holds via the return type of `routeSpec`. A no-op type assertion
// pins the expected value against RendererId so the test still fails
// if the renderer ID union drifts.
const asRenderer = (r: RendererId): RendererId => r;

describe('routeSpec', () => {
  it('routes a cartesian spec to the vizql renderer', () => {
    expect(routeSpec(SIMPLE_BAR)).toBe(asRenderer('vizql'));
    expect(routeSpec(TIME_SERIES_LINE)).toBe(asRenderer('vizql'));
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

describe('routeSpecWithStrategy (sub-project B B2.1)', () => {
  function baseInput(
    overrides: Partial<RouteWithStrategyInput> = {},
  ): RouteWithStrategyInput {
    return {
      spec: TIME_SERIES_LINE,
      resultProfile: {
        rowCount: 1000,
        markEligibleForDeck: true,
        xType: 'temporal',
        yType: 'quantitative',
      },
      gpuTier: 'medium',
      frameBudgetState: 'normal',
      instancePressure: { activeContexts: 0, max: 12, pressureRatio: 0 },
      ...overrides,
    };
  }

  it('returns the same rendererId as routeSpec for a small cartesian chart', () => {
    const { rendererId, strategy } = routeSpecWithStrategy(baseInput());
    expect(rendererId).toBe(asRenderer('vizql'));
    expect(strategy.tier).toBe('t0');
    expect(strategy.rendererBackend).toBe('svg');
  });

  it('escalates cartesian → deckgl for a huge time series', () => {
    const { rendererId, strategy } = routeSpecWithStrategy(
      baseInput({
        resultProfile: {
          rowCount: 10_000_000,
          markEligibleForDeck: true,
          xType: 'temporal',
          yType: 'quantitative',
        },
      }),
    );
    // routeSpec would say vizql; routeSpecWithStrategy overrides to deckgl
    expect(routeSpec(TIME_SERIES_LINE)).toBe(asRenderer('vizql'));
    expect(rendererId).toBe(asRenderer('deckgl'));
    expect(strategy.tier).toBe('t3');
    expect(strategy.streaming.enabled).toBe(true);
  });

  it('keeps map specs on the maplibre renderer regardless of row count', () => {
    const mapSpec: ChartSpec = {
      $schema: 'askdb/chart-spec/v1',
      type: 'map',
      map: {
        provider: 'maplibre',
        style: 'osm-bright',
        center: [0, 0],
        zoom: 2,
        layers: [],
      },
    };
    const { rendererId, strategy } = routeSpecWithStrategy(
      baseInput({
        spec: mapSpec,
        resultProfile: { rowCount: 5_000_000, markEligibleForDeck: false },
      }),
    );
    expect(rendererId).toBe(asRenderer('maplibre'));
    expect(strategy.rendererFamily).toBe('maplibre');
  });

  it('routes geo-overlay specs through the deckgl renderer', () => {
    const overlaySpec: ChartSpec = {
      $schema: 'askdb/chart-spec/v1',
      type: 'geo-overlay',
      overlay: { layers: [{ type: 'ScatterplotLayer' }] },
    };
    const { rendererId } = routeSpecWithStrategy(
      baseInput({
        spec: overlaySpec,
        resultProfile: {
          rowCount: 50,
          markEligibleForDeck: true,
          xType: 'quantitative',
          yType: 'quantitative',
        },
      }),
    );
    expect(rendererId).toBe(asRenderer('deckgl'));
  });

  it('routes creative specs through the three renderer', () => {
    const creativeSpec: ChartSpec = {
      $schema: 'askdb/chart-spec/v1',
      type: 'creative',
      creative: { engine: 'r3f', component: 'hologram', props: {} },
    };
    const { rendererId } = routeSpecWithStrategy(baseInput({ spec: creativeSpec }));
    expect(rendererId).toBe(asRenderer('three'));
  });

  it('respects a power-user t2 hint for deck-eligible marks', () => {
    const { rendererId, strategy } = routeSpecWithStrategy(
      baseInput({
        resultProfile: {
          rowCount: 100,
          markEligibleForDeck: true,
          xType: 'temporal',
          yType: 'quantitative',
        },
        hint: 't2',
      }),
    );
    expect(rendererId).toBe(asRenderer('deckgl'));
    expect(strategy.tier).toBe('t2');
  });

  it('downshifts under high instance pressure', () => {
    const { rendererId, strategy } = routeSpecWithStrategy(
      baseInput({
        resultProfile: {
          rowCount: 300_000,
          markEligibleForDeck: true,
          xType: 'temporal',
          yType: 'quantitative',
        },
        instancePressure: { activeContexts: 11, max: 12, pressureRatio: 0.92 },
      }),
    );
    // Would have been t2 deckgl; downshifts to t1 vizql
    expect(rendererId).toBe(asRenderer('vizql'));
    expect(strategy.tier).toBe('t1');
  });

  it('populates a reason string for telemetry on every call', () => {
    const { strategy } = routeSpecWithStrategy(baseInput());
    expect(strategy.reason.length).toBeGreaterThan(0);
  });
});
