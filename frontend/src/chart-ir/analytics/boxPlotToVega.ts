/**
 * Plan 9e — Compile BoxPlotSpec + BoxPlotEnvelope to Vega-Lite layers.
 *
 * Four-mark layout per pane (Build_Tableau §XIII.1):
 *   1. rule   — whisker line: whisker_low ↔ whisker_high
 *   2. rect   — the box: y=q1 .. y=q3 (fill_color + fill_opacity)
 *   3. rule   — the median inside the box (thicker stroke)
 *   4. point  — outliers (hollow circles), emitted only when show_outliers
 */

export interface BoxPlotSpec {
  axis: 'x' | 'y';
  whisker_method: 'tukey' | 'min-max' | 'percentile';
  whisker_percentile: [number, number] | null;
  show_outliers: boolean;
  fill_color: string;
  fill_opacity: number;
  scope: 'entire' | 'pane' | 'cell';
}

export interface BoxPlotValues {
  q1: number | null;
  median: number | null;
  q3: number | null;
  whisker_low: number | null;
  whisker_high: number | null;
}

export interface BoxPlotEnvelope {
  kind: 'box_plot';
  axis: 'x' | 'y';
  scope: 'entire' | 'pane' | 'cell';
  whisker_method: BoxPlotSpec['whisker_method'];
  values: BoxPlotValues;
  outliers: number[];
  fill_color: string;
  fill_opacity: number;
}

export interface BaseEncoding {
  xField: string;
  yField: string;
}

export type VegaLiteLayer = Record<string, unknown>;

export function compileBoxPlot(
  spec: BoxPlotSpec,
  env: BoxPlotEnvelope,
  baseEncoding: BaseEncoding,
): VegaLiteLayer[] {
  const { q1, median, q3, whisker_low, whisker_high } = env.values;
  const iqr =
    q1 !== null && q3 !== null ? Number((q3 - q1).toFixed(6)) : null;

  const statsRow = {
    q1, median, q3, whisker_low, whisker_high, iqr,
    min: whisker_low, max: whisker_high,
  };

  const axisField =
    spec.axis === 'y' ? baseEncoding.yField : baseEncoding.xField;

  const tooltip = [
    { field: 'min',    type: 'quantitative', title: 'Whisker low',  format: '.3f' },
    { field: 'q1',     type: 'quantitative', title: 'Q1',           format: '.3f' },
    { field: 'median', type: 'quantitative', title: 'Median',       format: '.3f' },
    { field: 'q3',     type: 'quantitative', title: 'Q3',           format: '.3f' },
    { field: 'max',    type: 'quantitative', title: 'Whisker high', format: '.3f' },
    { field: 'iqr',    type: 'quantitative', title: 'IQR',          format: '.3f' },
  ];

  const whiskerLayer: VegaLiteLayer = {
    data: { values: [statsRow] },
    mark: { type: 'rule', strokeWidth: 1, color: '#333' },
    encoding: {
      [spec.axis]:       { field: 'min', type: 'quantitative', title: axisField },
      [`${spec.axis}2`]: { field: 'max' },
    },
  };

  const boxLayer: VegaLiteLayer = {
    data: { values: [statsRow] },
    mark: {
      type: 'rect',
      fill: spec.fill_color,
      fillOpacity: spec.fill_opacity,
      stroke: '#333',
      strokeWidth: 1,
    },
    encoding: {
      [spec.axis]:       { field: 'q1', type: 'quantitative', title: axisField },
      [`${spec.axis}2`]: { field: 'q3' },
      tooltip,
    },
  };

  const medianLayer: VegaLiteLayer = {
    data: { values: [statsRow] },
    mark: { type: 'rule', strokeWidth: 2, color: '#111' },
    encoding: {
      [spec.axis]:       { field: 'median', type: 'quantitative' },
      [`${spec.axis}2`]: { field: 'median' },
    },
  };

  const layers: VegaLiteLayer[] = [whiskerLayer, boxLayer, medianLayer];

  if (spec.show_outliers && env.outliers.length) {
    const outlierRows = env.outliers.map((v) => ({ [axisField]: v }));
    layers.push({
      data: { values: outlierRows },
      mark: { type: 'point', filled: false, stroke: '#333', strokeWidth: 1, size: 40 },
      encoding: {
        [spec.axis]: { field: axisField, type: 'quantitative' },
      },
    });
  }

  return layers;
}
