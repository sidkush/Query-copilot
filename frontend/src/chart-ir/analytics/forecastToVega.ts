/**
 * Plan 9c — compile a ForecastSpec + ForecastResult into Vega-Lite layer
 * fragments: solid actuals line + dashed forecast line + (optional) CI
 * rect band + vertical rule divider at last_actual_t.
 *
 * Kept framework-agnostic: returns `VegaLiteLayer[]` for VegaRenderer
 * to merge into encoding.layer.
 */

export interface ForecastSpec {
  forecast_length: number;
  forecast_unit: string;
  model: 'auto' | 'additive' | 'multiplicative' | 'custom';
  season_length: number | null;
  confidence_level: number;
  ignore_last: number;
}

export interface ForecastModelFit {
  kind: string;
  alpha: number | null;
  beta: number | null;
  gamma: number | null;
  sse: number;
  aic: number;
  rmse: number;
  mae: number;
  mape: number;
}

export interface ForecastResult {
  best_model: ForecastModelFit;
  forecasts: Array<{ t: number; y: number; lower?: number; upper?: number }>;
  actuals: Array<{ t: number; y: number }>;
  model_candidates: ForecastModelFit[];
}

export interface VegaLiteLayer {
  mark: { type: 'line' | 'area' | 'rule'; tooltip?: boolean; opacity?: number; strokeDash?: number[] };
  data: { values: Array<Record<string, unknown>> };
  encoding: Record<string, unknown>;
}

const FORECAST_COLOR = '#4C78A8';
const ACTUALS_COLOR = '#1F2937';
const DIVIDER_COLOR = '#9CA3AF';

export function compileForecast(
  spec: ForecastSpec,
  fit: ForecastResult,
  lastActualT: number,
): VegaLiteLayer[] {
  // `spec` is reserved for future use (axis units, format strings) so the
  // caller never needs to re-pass the request body to consumers of this
  // helper. Reference it explicitly to silence noUnusedParameters checks.
  void spec;

  const layers: VegaLiteLayer[] = [];

  // 1. Actuals (solid line, darker).
  layers.push({
    mark: { type: 'line', tooltip: true },
    data: { values: fit.actuals.map((p) => ({ t: p.t, y: p.y, _series: 'actual' })) },
    encoding: {
      x: { field: 't', type: 'quantitative' },
      y: { field: 'y', type: 'quantitative' },
      color: { value: ACTUALS_COLOR },
      tooltip: [
        { field: 't', type: 'quantitative' },
        { field: 'y', type: 'quantitative' },
      ],
    },
  });

  // 2. Forecast (dashed line, primary color).
  const forecastValues = fit.forecasts.map((p) => ({
    t: p.t, y: p.y,
    model_kind: fit.best_model.kind,
    aic: fit.best_model.aic,
    rmse: fit.best_model.rmse,
  }));
  layers.push({
    mark: { type: 'line', tooltip: true, strokeDash: [6, 4] },
    data: { values: forecastValues },
    encoding: {
      x: { field: 't', type: 'quantitative' },
      y: { field: 'y', type: 'quantitative' },
      color: { value: FORECAST_COLOR },
      tooltip: [
        { field: 't', type: 'quantitative' },
        { field: 'y', type: 'quantitative' },
        { field: 'model_kind', type: 'nominal' },
        { field: 'aic', type: 'quantitative' },
        { field: 'rmse', type: 'quantitative' },
      ],
    },
  });

  // 3. CI band (rect / area, 30% opacity) — only when forecast points carry lower/upper.
  const hasCI = fit.forecasts.every((p) => typeof p.lower === 'number' && typeof p.upper === 'number');
  if (hasCI) {
    layers.push({
      mark: { type: 'area', opacity: 0.3 },
      data: {
        values: fit.forecasts.map((p) => ({ t: p.t, lower: p.lower, upper: p.upper })),
      },
      encoding: {
        x: { field: 't', type: 'quantitative' },
        y: { field: 'lower', type: 'quantitative' },
        y2: { field: 'upper' },
        color: { value: FORECAST_COLOR },
      },
    });
  }

  // 4. Divider rule at last_actual_t.
  layers.push({
    mark: { type: 'rule', strokeDash: [3, 3] },
    data: { values: [{ t: lastActualT }] },
    encoding: {
      x: { field: 't', type: 'quantitative' },
      color: { value: DIVIDER_COLOR },
    },
  });

  return layers;
}
