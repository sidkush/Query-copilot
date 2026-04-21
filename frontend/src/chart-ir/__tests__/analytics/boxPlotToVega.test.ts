import { describe, expect, it } from 'vitest';
import { compileBoxPlot, type BoxPlotSpec, type BoxPlotEnvelope } from '../../analytics/boxPlotToVega';

import singlePane from './__fixtures__/boxplot-single-pane.json';
import withOutliers from './__fixtures__/boxplot-with-outliers.json';
import minMax from './__fixtures__/boxplot-min-max.json';

type Mark = { type?: string } | string;
type VegaLayer = {
  mark?: Mark;
  data?: { values?: unknown[] };
  encoding?: { tooltip?: Array<{ field: string }> };
};

const markType = (l: VegaLayer): string | undefined =>
  typeof l.mark === 'string' ? l.mark : l.mark?.type;

describe('boxPlotToVega', () => {
  const baseEnc = { xField: 'category', yField: 'measure' };

  it('emits 3 marks (whiskers + box + median) with no outliers', () => {
    const spec: BoxPlotSpec = {
      axis: 'y', whisker_method: 'tukey', whisker_percentile: null,
      show_outliers: false, fill_color: '#4C78A8', fill_opacity: 0.3,
      scope: 'entire',
    };
    const layers = compileBoxPlot(spec, singlePane as BoxPlotEnvelope, baseEnc) as VegaLayer[];
    expect(layers.map(markType)).toEqual(['rule', 'rect', 'rule']);
  });

  it('emits 4 marks with outlier point layer when show_outliers', () => {
    const spec: BoxPlotSpec = {
      axis: 'y', whisker_method: 'tukey', whisker_percentile: null,
      show_outliers: true, fill_color: '#4C78A8', fill_opacity: 0.3,
      scope: 'entire',
    };
    const env = withOutliers as BoxPlotEnvelope;
    const layers = compileBoxPlot(spec, env, baseEnc) as VegaLayer[];
    expect(layers.map(markType)).toEqual(['rule', 'rect', 'rule', 'point']);
    const outlierLayer = layers[3];
    const outlierMark = outlierLayer.mark as { filled?: boolean };
    expect(outlierMark.filled).toBe(false);
    expect(Array.isArray(outlierLayer.data?.values)).toBe(true);
    expect(outlierLayer.data?.values?.length).toBe(env.outliers.length);
  });

  it('tooltip carries all summary stats', () => {
    const spec: BoxPlotSpec = {
      axis: 'y', whisker_method: 'min-max', whisker_percentile: null,
      show_outliers: false, fill_color: '#4C78A8', fill_opacity: 0.3,
      scope: 'entire',
    };
    const layers = compileBoxPlot(spec, minMax as BoxPlotEnvelope, baseEnc) as VegaLayer[];
    const box = layers[1];
    const fields = (box.encoding?.tooltip ?? []).map((t) => t.field);
    expect(fields).toEqual(
      expect.arrayContaining(['min', 'q1', 'median', 'q3', 'max', 'iqr']),
    );
  });

  it('rect layer honours fill_color and fill_opacity', () => {
    const spec: BoxPlotSpec = {
      axis: 'y', whisker_method: 'tukey', whisker_percentile: null,
      show_outliers: false, fill_color: '#E45756', fill_opacity: 0.55,
      scope: 'entire',
    };
    const layers = compileBoxPlot(spec, singlePane as BoxPlotEnvelope, baseEnc) as VegaLayer[];
    const rectMark = layers[1].mark as { fill?: string; fillOpacity?: number };
    expect(rectMark.fill).toBe('#E45756');
    expect(rectMark.fillOpacity).toBeCloseTo(0.55);
  });
});
