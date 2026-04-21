import { describe, expect, it } from 'vitest';
import { compileBoxPlot, type BoxPlotSpec, type BoxPlotEnvelope } from '../../analytics/boxPlotToVega';

import singlePane from './__fixtures__/boxplot-single-pane.json';
import withOutliers from './__fixtures__/boxplot-with-outliers.json';
import minMax from './__fixtures__/boxplot-min-max.json';

describe('boxPlotToVega', () => {
  const baseEnc = { xField: 'category', yField: 'measure' };

  it('emits 3 marks (whiskers + box + median) with no outliers', () => {
    const spec: BoxPlotSpec = {
      axis: 'y', whisker_method: 'tukey', whisker_percentile: null,
      show_outliers: false, fill_color: '#4C78A8', fill_opacity: 0.3,
      scope: 'entire',
    };
    const layers = compileBoxPlot(spec, singlePane as BoxPlotEnvelope, baseEnc);
    const types = layers.map((l: any) => l.mark?.type ?? l.mark);
    expect(types).toEqual(['rule', 'rect', 'rule']);
  });

  it('emits 4 marks with outlier point layer when show_outliers', () => {
    const spec: BoxPlotSpec = {
      axis: 'y', whisker_method: 'tukey', whisker_percentile: null,
      show_outliers: true, fill_color: '#4C78A8', fill_opacity: 0.3,
      scope: 'entire',
    };
    const env = withOutliers as BoxPlotEnvelope;
    const layers = compileBoxPlot(spec, env, baseEnc);
    const types = layers.map((l: any) => l.mark?.type ?? l.mark);
    expect(types).toEqual(['rule', 'rect', 'rule', 'point']);
    const outlierLayer: any = layers[3];
    expect(outlierLayer.mark.filled).toBe(false);
    expect(Array.isArray(outlierLayer.data.values)).toBe(true);
    expect(outlierLayer.data.values.length).toBe(env.outliers.length);
  });

  it('tooltip carries all summary stats', () => {
    const spec: BoxPlotSpec = {
      axis: 'y', whisker_method: 'min-max', whisker_percentile: null,
      show_outliers: false, fill_color: '#4C78A8', fill_opacity: 0.3,
      scope: 'entire',
    };
    const layers = compileBoxPlot(spec, minMax as BoxPlotEnvelope, baseEnc);
    const box: any = layers[1];  // rect layer
    const fields = (box.encoding.tooltip as Array<{ field: string }>).map((t) => t.field);
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
    const layers = compileBoxPlot(spec, singlePane as BoxPlotEnvelope, baseEnc);
    const rect: any = layers[1];
    expect(rect.mark.fill).toBe('#E45756');
    expect(rect.mark.fillOpacity).toBeCloseTo(0.55);
  });
});
