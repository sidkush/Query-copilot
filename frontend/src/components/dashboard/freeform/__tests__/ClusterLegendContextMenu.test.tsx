/** Plan 9d T7 — Right-click cluster legend → "Create Set From Cluster" → addSetAnalystPro. */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ClusterLegendContextMenu from '../panels/ClusterLegendContextMenu';
import { useStore } from '../../../../store';

beforeEach(() => {
  useStore.setState({
    analystProDashboard: { id: 'd1', sets: [] },
    analystProHistory: { past: [], future: [] },
    analystProClusters: [
      {
        id: 'c1', name: 'Sales/Profit',
        rowKeys: ['r0', 'r1', 'r2', 'r3'],
        spec: { variables: ['sales', 'profit'] },
        result: {
          optimal_k: 2,
          assignments: [0, 1, 0, 1],
          centroids: [], candidates: [], per_cluster_feature_means: [],
          calinski_harabasz_score: 0, f_statistic: 0,
          inertia: 0, total_ssq: 0, between_group_ssq: 0, notes: [],
        },
      },
    ],
  });
});

describe('ClusterLegendContextMenu', () => {
  it('Creates a set from the chosen cluster index using customer_id dimension', () => {
    render(
      <ClusterLegendContextMenu clusterId="c1" clusterIndex={0} dimension="customer_id" />,
    );
    fireEvent.click(screen.getByRole('button', { name: /create set from cluster/i }));
    const sets = useStore.getState().analystProDashboard.sets;
    expect(sets).toHaveLength(1);
    expect(sets[0].dimension).toBe('customer_id');
    expect(sets[0].members).toEqual(['r0', 'r2']);
  });
});
