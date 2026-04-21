/**
 * Plan 9b — compile a TrendLineSpec + per-factor fit results into
 * Vega-Lite layered spec fragments (line + optional CI band + tooltip).
 *
 * Kept framework-agnostic: returns raw `VegaLiteLayer[]` that the
 * existing `VegaRenderer.tsx` can merge into an encoding.layer stanza.
 */

export interface TrendLineSpec {
  fit_type: 'linear' | 'logarithmic' | 'exponential' | 'power' | 'polynomial';
  degree: number | null;
  factor_fields: string[];
  show_confidence_bands: boolean;
  confidence_level: number;
  color_by_factor: boolean;
  trend_line_label: boolean;
}

export interface TrendFitResult {
  coefficients: number[];
  r_squared: number;
  p_value: number;
  sse: number;
  rmse: number;
  equation: string;
  predictions: Array<{ x: number; y: number; lower?: number; upper?: number }>;
}

export interface TrendFit {
  factor_value: string | number | (string | number)[] | null;
  result: TrendFitResult;
}

/** Deterministic Vega-compatible color palette (10-way). */
const PALETTE = [
  '#4C78A8', '#F58518', '#54A24B', '#E45756', '#72B7B2',
  '#EECA3B', '#B279A2', '#9D755D', '#BAB0AC', '#FF9DA6',
];

function colorFor(factorValue: TrendFit['factor_value'], index: number): string {
  if (factorValue == null) return PALETTE[0];
  // Stable, deterministic mapping keyed on string form for stability across renders.
  const key = JSON.stringify(factorValue);
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
  // Try to produce distinct colors per-index by XORing index into the hash
  // when the raw hash-mod would collide with an earlier pick.
  const base = Math.abs(hash) % PALETTE.length;
  return PALETTE[(base + index) % PALETTE.length];
}

export interface VegaLiteLayer {
  mark: { type: 'line' | 'area'; tooltip?: boolean; opacity?: number; interpolate?: string };
  data: { values: Array<Record<string, unknown>> };
  encoding: Record<string, unknown>;
}

export function compileTrendLine(spec: TrendLineSpec, fits: TrendFit[]): VegaLiteLayer[] {
  const layers: VegaLiteLayer[] = [];

  fits.forEach((fit, i) => {
    const color = spec.color_by_factor ? colorFor(fit.factor_value, i) : PALETTE[0];
    const statsValues = fit.result.predictions.map((p) => ({
      ...p,
      equation: fit.result.equation,
      r_squared: fit.result.r_squared,
      p_value: fit.result.p_value,
      n: fit.result.predictions.length,
      factor: fit.factor_value,
    }));

    if (spec.show_confidence_bands) {
      layers.push({
        mark: { type: 'area', opacity: 0.18 },
        data: { values: statsValues },
        encoding: {
          x: { field: 'x', type: 'quantitative' },
          y: { field: 'lower', type: 'quantitative' },
          y2: { field: 'upper' },
          color: { value: color },
        },
      });
    }

    layers.push({
      mark: { type: 'line', tooltip: true, interpolate: 'monotone' },
      data: { values: statsValues },
      encoding: {
        x: { field: 'x', type: 'quantitative' },
        y: { field: 'y', type: 'quantitative' },
        color: { value: color },
        tooltip: [
          { field: 'equation', type: 'nominal', title: 'equation' },
          { field: 'r_squared', type: 'quantitative', title: 'R²', format: '.4f' },
          { field: 'p_value', type: 'quantitative', title: 'p-value', format: '.2e' },
          { field: 'n', type: 'quantitative', title: 'N' },
        ],
      },
    });
  });

  return layers;
}
