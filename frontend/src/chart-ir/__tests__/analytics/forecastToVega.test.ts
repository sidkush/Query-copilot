import { describe, it, expect } from 'vitest';
import { compileForecast, ForecastSpec, ForecastResult } from '../../analytics/forecastToVega';

const baseSpec: ForecastSpec = {
  forecast_length: 4, forecast_unit: 'months', model: 'auto',
  season_length: null, confidence_level: 0.95, ignore_last: 0,
};

const baseResult: ForecastResult = {
  best_model: {
    kind: 'AAA', alpha: 0.5, beta: 0.1, gamma: 0.2,
    sse: 1.0, aic: 10.0, rmse: 0.5, mae: 0.4, mape: 2.0,
  },
  actuals: [{ t: 1, y: 1 }, { t: 2, y: 2 }, { t: 3, y: 3 }],
  forecasts: [
    { t: 4, y: 4, lower: 3.5, upper: 4.5 },
    { t: 5, y: 5, lower: 4.0, upper: 6.0 },
  ],
  model_candidates: [],
};

describe('forecastToVega', () => {
  it('emits actuals line + forecast line + CI band + divider rule', () => {
    const layers = compileForecast(baseSpec, baseResult, /* lastActualT */ 3);
    const kinds = layers.map((l) => `${l.mark.type}:${(l.mark as { strokeDash?: number[] }).strokeDash ? 'dashed' : 'solid'}`);
    // 4 layers expected: actuals (line/solid) + forecast (line/dashed) + CI (area) + divider (rule)
    expect(layers).toHaveLength(4);
    expect(kinds[0]).toBe('line:solid');
    expect(kinds[1]).toBe('line:dashed');
    expect(layers[2].mark.type).toBe('area');
    expect(layers[3].mark.type).toBe('rule');
  });

  it('CI area uses 30% opacity', () => {
    const layers = compileForecast(baseSpec, baseResult, 3);
    const ci = layers.find((l) => l.mark.type === 'area')!;
    expect((ci.mark as { opacity?: number }).opacity).toBeCloseTo(0.3);
  });

  it('omits CI band when forecast points lack lower/upper', () => {
    const noCI: ForecastResult = {
      ...baseResult,
      forecasts: [{ t: 4, y: 4 }, { t: 5, y: 5 }],
    };
    const layers = compileForecast(baseSpec, noCI, 3);
    expect(layers.find((l) => l.mark.type === 'area')).toBeUndefined();
  });

  it('tooltip carries best-model kind + AIC + RMSE', () => {
    const layers = compileForecast(baseSpec, baseResult, 3);
    const forecastLayer = layers[1];
    const tooltips = (forecastLayer.encoding as { tooltip: Array<{ field: string }> }).tooltip;
    const fields = tooltips.map((t) => t.field);
    expect(fields).toEqual(expect.arrayContaining(['t', 'y', 'model_kind', 'aic', 'rmse']));
  });
});
