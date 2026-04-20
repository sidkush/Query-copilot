import { describe, it, expect } from 'vitest';
import { compileAnalyticsToVegaLayers } from '../../analytics/referenceLineToVega';
import type { AnalyticsRow } from '../../analytics/referenceLineToVega';
import mean from './__fixtures__/refline_mean_layer.json';
import band from './__fixtures__/refband_iqr_layer.json';
import dist from './__fixtures__/refdist_quantile_layer.json';

describe('compileAnalyticsToVegaLayers', () => {
  it('reference line mean → rule mark + optional text label', () => {
    const rows: AnalyticsRow[] = [{
      kind: 'reference_line', axis: 'y', aggregation: 'mean',
      scope: 'entire', percentile: null, value: 42.5, label: 'computation',
      custom_label: '', line_style: 'dashed', color: '#4C78A8',
      show_marker: true,
    }];
    expect(compileAnalyticsToVegaLayers(rows)).toEqual(mean);
  });

  it('reference band → rect mark with y/y2', () => {
    const rows: AnalyticsRow[] = [{
      kind: 'reference_band', axis: 'y',
      from_value: 10, to_value: 90, fill: '#cccccc', fill_opacity: 0.25,
    }];
    expect(compileAnalyticsToVegaLayers(rows)).toEqual(band);
  });

  it('reference distribution → one rule per percentile, color scaled', () => {
    const rows: AnalyticsRow[] = [{
      kind: 'reference_distribution', axis: 'y', scope: 'entire',
      style: 'quantile', percentiles: [10, 50, 90],
      values: [12, 50, 100], color: '#888888',
    }];
    expect(compileAnalyticsToVegaLayers(rows)).toEqual(dist);
  });

  it('empty input → empty layer list', () => {
    expect(compileAnalyticsToVegaLayers([])).toEqual([]);
  });

  it('reference_line with label=none suppresses text mark', () => {
    const rows: AnalyticsRow[] = [{
      kind: 'reference_line', axis: 'x', aggregation: 'median',
      scope: 'entire', percentile: null, value: 5, label: 'none',
      custom_label: '', line_style: 'solid', color: '#000',
      show_marker: false,
    }];
    const layers = compileAnalyticsToVegaLayers(rows);
    expect(layers).toHaveLength(1);
    expect(layers[0].mark).toMatchObject({ type: 'rule' });
  });
});
