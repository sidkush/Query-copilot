/** Plan 9d T5 — clusterToVega golden-fixture tests. */
import { describe, expect, it } from 'vitest';
import { compileCluster } from '../../analytics/clusterToVega';
import basic from './__fixtures__/cluster-basic.json';
import withCentroids from './__fixtures__/cluster-with-centroids.json';
import withTooltip from './__fixtures__/cluster-with-tooltip.json';

describe('compileCluster', () => {
  it('emits color-by-cluster ordinal scale + legend with mark counts', () => {
    const layers = compileCluster(basic.spec, basic.result, basic.baseEncoding);
    expect(layers).toEqual(basic.expectedLayers);
  });

  it('overlays centroids when showCentroids=true', () => {
    const layers = compileCluster(withCentroids.spec, withCentroids.result, withCentroids.baseEncoding);
    expect(layers).toEqual(withCentroids.expectedLayers);
  });

  it('attaches distance-to-centroid tooltip when showDistance=true', () => {
    const layers = compileCluster(withTooltip.spec, withTooltip.result, withTooltip.baseEncoding);
    expect(layers).toEqual(withTooltip.expectedLayers);
  });
});
