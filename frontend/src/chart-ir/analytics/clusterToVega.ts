/**
 * Plan 9d — Compile ClusterSpec + ClusterResult to Vega-Lite layers.
 * Server runs sklearn; this compiler is a pure transform.
 */

export interface ClusterCandidate {
  k: number;
  ch_score: number;
  inertia: number;
}

export interface ClusterSpec {
  k: number | 'auto';
  k_min: number;
  k_max: number;
  variables: string[];
  disaggregate: boolean;
  standardize: boolean;
  seed: number;
  showCentroids?: boolean;
  showDistance?: boolean;
}

export interface ClusterResult {
  optimal_k: number;
  assignments: number[];
  centroids: number[][];
  calinski_harabasz_score: number;
  f_statistic: number;
  inertia: number;
  total_ssq: number;
  between_group_ssq: number;
  candidates: ClusterCandidate[];
  per_cluster_feature_means: number[][];
  notes: string[];
}

export interface BaseEncoding {
  xField: string;
  yField: string;
}

export type VegaLiteLayer = Record<string, unknown>;

const CLUSTER_LEGEND_LABEL_EXPR =
  "'Cluster ' + (datum.label + 1) + ' (' + datum.value + ' marks)'";

export function compileCluster(
  spec: ClusterSpec,
  result: ClusterResult,
  baseEncoding: BaseEncoding,
): VegaLiteLayer[] {
  const pointEncoding: Record<string, unknown> = {
    x: { field: baseEncoding.xField, type: 'quantitative' },
    y: { field: baseEncoding.yField, type: 'quantitative' },
    color: {
      field: '__cluster__',
      type: 'ordinal',
      scale: { scheme: 'tableau10' },
      legend: {
        title: 'Cluster',
        labelExpr: CLUSTER_LEGEND_LABEL_EXPR,
      },
    },
  };

  if (spec.showDistance) {
    pointEncoding.tooltip = [
      { field: '__cluster__', type: 'ordinal', title: 'Cluster' },
      {
        field: '__distance__',
        type: 'quantitative',
        format: '.3f',
        title: 'Distance to centroid',
      },
    ];
  }

  const layers: VegaLiteLayer[] = [
    {
      mark: { type: 'point', filled: true, size: 60 },
      encoding: pointEncoding,
    },
  ];

  if (spec.showCentroids) {
    layers.push({
      data: {
        values: result.centroids.map((c, i) => ({
          [baseEncoding.xField]: c[0],
          [baseEncoding.yField]: c[1],
          __centroid_id__: i,
        })),
      },
      mark: {
        type: 'point',
        shape: 'cross',
        size: 200,
        stroke: 'black',
        strokeWidth: 2,
        fill: 'white',
      },
      encoding: {
        x: { field: baseEncoding.xField, type: 'quantitative' },
        y: { field: baseEncoding.yField, type: 'quantitative' },
      },
    });
  }

  return layers;
}
