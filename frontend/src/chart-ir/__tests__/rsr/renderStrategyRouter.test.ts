/**
 * RSR decision matrix tests (vitest). Every branch of the decision tree hit.
 * If you add a new branch, add a test here first.
 */
import { pickRenderStrategy } from '../../rsr/renderStrategyRouter';
import type { ChartSpec } from '../../types';
import type { RenderStrategyInput } from '../../rsr/strategy';

function baseInput(overrides: Partial<RenderStrategyInput> = {}): RenderStrategyInput {
  const spec: ChartSpec = {
    $schema: 'askdb/chart-spec/v1',
    type: 'cartesian',
    mark: 'line',
    encoding: {
      x: { field: 'date', type: 'temporal' },
      y: { field: 'revenue', type: 'quantitative' },
    },
  };
  return {
    spec,
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

test('T0 SVG for tiny line chart', () => {
  const s = pickRenderStrategy(
    baseInput({
      resultProfile: {
        rowCount: 500,
        markEligibleForDeck: true,
        xType: 'temporal',
        yType: 'quantitative',
      },
    }),
  );
  expect(s.tier).toBe('t0');
  expect(s.rendererBackend).toBe('svg');
  expect(s.downsample.enabled).toBe(false);
});

test('T1 Canvas for medium line chart', () => {
  const s = pickRenderStrategy(
    baseInput({
      resultProfile: {
        rowCount: 50_000,
        markEligibleForDeck: true,
        xType: 'temporal',
        yType: 'quantitative',
      },
    }),
  );
  expect(s.tier).toBe('t1');
  expect(s.rendererBackend).toBe('canvas');
  expect(s.rendererFamily).toBe('vizql');
});

test('T2 deck.gl for large scatter', () => {
  const s = pickRenderStrategy(
    baseInput({
      resultProfile: {
        rowCount: 300_000,
        markEligibleForDeck: true,
        xType: 'temporal',
        yType: 'quantitative',
      },
    }),
  );
  expect(s.tier).toBe('t2');
  expect(s.rendererFamily).toBe('deck');
  expect(s.rendererBackend).toBe('webgl');
});

test('T3 streaming for huge time series', () => {
  const s = pickRenderStrategy(
    baseInput({
      resultProfile: {
        rowCount: 10_000_000,
        markEligibleForDeck: true,
        xType: 'temporal',
        yType: 'quantitative',
      },
    }),
  );
  expect(s.tier).toBe('t3');
  expect(s.streaming.enabled).toBe(true);
  expect(s.downsample.method).toBe('lttb');
});

test('Non-deck-eligible mark stays on Vega even at 500k rows', () => {
  const spec: ChartSpec = {
    $schema: 'askdb/chart-spec/v1',
    type: 'cartesian',
    mark: 'boxplot',
    encoding: {},
  };
  const s = pickRenderStrategy(
    baseInput({
      spec,
      resultProfile: {
        rowCount: 500_000,
        markEligibleForDeck: false,
        xType: 'quantitative',
        yType: 'quantitative',
      },
    }),
  );
  expect(s.rendererFamily).toBe('vizql');
  expect(s.downsample.enabled).toBe(true);
  expect(s.downsample.targetPoints).toBeLessThanOrEqual(4_000);
});

test('Low GPU tier clamps at T1', () => {
  const s = pickRenderStrategy(
    baseInput({
      gpuTier: 'low',
      resultProfile: {
        rowCount: 1_000_000,
        markEligibleForDeck: true,
        xType: 'temporal',
        yType: 'quantitative',
      },
    }),
  );
  expect(s.tier).toBe('t1');
  expect(s.rendererFamily).toBe('vizql');
  expect(s.downsample.enabled).toBe(true);
});

test('High instance pressure downshifts one tier', () => {
  const s = pickRenderStrategy(
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
  expect(s.tier).toBe('t1');
});

test('Tight frame budget escalates one tier', () => {
  const s = pickRenderStrategy(
    baseInput({
      resultProfile: {
        rowCount: 50_000,
        markEligibleForDeck: true,
        xType: 'temporal',
        yType: 'quantitative',
      },
      frameBudgetState: 'tight',
    }),
  );
  expect(s.tier).toBe('t2');
});

test('Hint t2 honored for deck-eligible mark', () => {
  const s = pickRenderStrategy(
    baseInput({
      resultProfile: {
        rowCount: 1000,
        markEligibleForDeck: true,
        xType: 'temporal',
        yType: 'quantitative',
      },
      hint: 't2',
    }),
  );
  expect(s.tier).toBe('t2');
});

test('Hint t2 refused for non-deck-eligible mark', () => {
  const spec: ChartSpec = {
    $schema: 'askdb/chart-spec/v1',
    type: 'cartesian',
    mark: 'boxplot',
    encoding: {},
  };
  const s = pickRenderStrategy(
    baseInput({
      spec,
      resultProfile: {
        rowCount: 1000,
        markEligibleForDeck: false,
        xType: 'quantitative',
        yType: 'quantitative',
      },
      hint: 't2',
    }),
  );
  expect(s.tier).not.toBe('t2');
  expect(s.reason).toMatch(/refused/i);
});

test('Map spec.type always uses maplibre family regardless of rowCount', () => {
  const spec: ChartSpec = {
    $schema: 'askdb/chart-spec/v1',
    type: 'map',
  };
  const s = pickRenderStrategy(
    baseInput({
      spec,
      resultProfile: { rowCount: 50, markEligibleForDeck: false },
    }),
  );
  expect(s.rendererFamily).toBe('maplibre');
});

test('Creative spec.type always uses creative family', () => {
  const spec: ChartSpec = {
    $schema: 'askdb/chart-spec/v1',
    type: 'creative',
  };
  const s = pickRenderStrategy(baseInput({ spec }));
  expect(s.rendererFamily).toBe('creative');
});

test('Streaming gate at exactly 200k+1 rows', () => {
  const s = pickRenderStrategy(
    baseInput({
      resultProfile: {
        rowCount: 200_001,
        markEligibleForDeck: true,
        xType: 'temporal',
        yType: 'quantitative',
      },
    }),
  );
  expect(s.streaming.enabled).toBe(true);
});

test('Reason field is non-empty for every strategy', () => {
  const cases = [100, 50_000, 300_000, 5_000_000];
  for (const rowCount of cases) {
    const s = pickRenderStrategy(
      baseInput({
        resultProfile: {
          rowCount,
          markEligibleForDeck: true,
          xType: 'temporal',
          yType: 'quantitative',
        },
      }),
    );
    expect(s.reason.length).toBeGreaterThan(0);
  }
});

test('geo-overlay spec.type always uses deck family', () => {
  const spec: ChartSpec = {
    $schema: 'askdb/chart-spec/v1',
    type: 'geo-overlay',
    mark: 'point',
  };
  const s = pickRenderStrategy(
    baseInput({
      spec,
      resultProfile: {
        rowCount: 250_000,
        markEligibleForDeck: true,
        xType: 'quantitative',
        yType: 'quantitative',
      },
    }),
  );
  expect(s.rendererFamily).toBe('deck');
  expect(s.rendererBackend).toBe('webgl');
  expect(s.streaming.enabled).toBe(true);
});

test('Hint t1 Canvas is honored', () => {
  const s = pickRenderStrategy(
    baseInput({
      resultProfile: {
        rowCount: 100,
        markEligibleForDeck: true,
        xType: 'temporal',
        yType: 'quantitative',
      },
      hint: 't1',
    }),
  );
  expect(s.tier).toBe('t1');
  expect(s.rendererFamily).toBe('vizql');
  expect(s.rendererBackend).toBe('canvas');
});

test('Hint t3 bypasses gpuTier=low clamp (power-user override)', () => {
  const s = pickRenderStrategy(
    baseInput({
      gpuTier: 'low',
      resultProfile: {
        rowCount: 10_000,
        markEligibleForDeck: true,
        xType: 'temporal',
        yType: 'quantitative',
      },
      hint: 't3',
    }),
  );
  expect(s.tier).toBe('t3');
  expect(s.streaming.enabled).toBe(true);
});

test('Tier t3 with tight frame budget does NOT escalate (already at ceiling)', () => {
  const s = pickRenderStrategy(
    baseInput({
      resultProfile: {
        rowCount: 10_000_000,
        markEligibleForDeck: true,
        xType: 'temporal',
        yType: 'quantitative',
      },
      frameBudgetState: 'tight',
    }),
  );
  expect(s.tier).toBe('t3');
});

test('Non-deck-eligible mark with tight frame budget does NOT escalate', () => {
  const spec: ChartSpec = {
    $schema: 'askdb/chart-spec/v1',
    type: 'cartesian',
    mark: 'boxplot',
    encoding: {},
  };
  const s = pickRenderStrategy(
    baseInput({
      spec,
      resultProfile: {
        rowCount: 50_000,
        markEligibleForDeck: false,
        xType: 'quantitative',
        yType: 'quantitative',
      },
      frameBudgetState: 'tight',
    }),
  );
  expect(s.tier).toBe('t1');
  expect(s.rendererFamily).toBe('vizql');
});

test('Pressure downshift + tight frame escalation net-T2 for deck-eligible', () => {
  const s = pickRenderStrategy(
    baseInput({
      resultProfile: {
        rowCount: 300_000,
        markEligibleForDeck: true,
        xType: 'temporal',
        yType: 'quantitative',
      },
      instancePressure: { activeContexts: 11, max: 12, pressureRatio: 0.92 },
      frameBudgetState: 'tight',
    }),
  );
  expect(s.tier).toBe('t2');
  expect(s.reason).toMatch(/pressure/i);
  expect(s.reason).toMatch(/escalate/i);
});
