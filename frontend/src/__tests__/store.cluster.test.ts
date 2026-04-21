/** Plan 9d T4 — analystProClusters CRUD + dialog ctx + createSetFromCluster + undo/redo. */
import { describe, expect, beforeEach, it } from 'vitest';
import { useStore } from '../store';

const seedDashboard = () =>
  useStore.setState({
    analystProDashboard: { id: 'd1', sets: [], clusters: [] },
    analystProHistory: { past: [], future: [] },
    analystProClusters: [],
    analystProClusterDialogCtx: null,
  });

describe('analystProClusters CRUD', () => {
  beforeEach(seedDashboard);

  it('addClusterAnalystPro pushes a new cluster', () => {
    useStore.getState().addClusterAnalystPro({
      id: 'c1', name: 'Cluster A', spec: { k: 'auto' }, result: null,
    });
    expect(useStore.getState().analystProClusters).toHaveLength(1);
    expect(useStore.getState().analystProClusters[0].id).toBe('c1');
  });

  it('updateClusterAnalystPro patches an existing cluster', () => {
    useStore.getState().addClusterAnalystPro({ id: 'c1', name: 'A', spec: {}, result: null });
    useStore.getState().updateClusterAnalystPro('c1', { name: 'B' });
    expect(useStore.getState().analystProClusters[0].name).toBe('B');
  });

  it('deleteClusterAnalystPro removes the cluster', () => {
    useStore.getState().addClusterAnalystPro({ id: 'c1', name: 'A', spec: {}, result: null });
    useStore.getState().deleteClusterAnalystPro('c1');
    expect(useStore.getState().analystProClusters).toHaveLength(0);
  });

  it('openClusterDialogAnalystPro / closeClusterDialogAnalystPro toggle ctx', () => {
    useStore.getState().openClusterDialogAnalystPro({ zoneId: 'z1' });
    expect(useStore.getState().analystProClusterDialogCtx).toEqual({ zoneId: 'z1' });
    useStore.getState().closeClusterDialogAnalystPro();
    expect(useStore.getState().analystProClusterDialogCtx).toBeNull();
  });
});

describe('createSetFromClusterAnalystPro', () => {
  beforeEach(seedDashboard);

  it('creates a Plan 4b set with members for the chosen cluster index', () => {
    const result = {
      optimal_k: 2,
      assignments: [0, 1, 0, 1, 0],
      centroids: [[0, 0], [1, 1]],
      calinski_harabasz_score: 10, f_statistic: 5,
      inertia: 1, total_ssq: 10, between_group_ssq: 9,
      candidates: [], per_cluster_feature_means: [], notes: [],
    };
    useStore.getState().addClusterAnalystPro({
      id: 'c1', name: 'A', spec: { variables: ['x'] }, result,
      rowKeys: ['r0', 'r1', 'r2', 'r3', 'r4'],
    });
    useStore.getState().createSetFromClusterAnalystPro('c1', 0, 'customer_id');
    const sets = useStore.getState().analystProDashboard.sets;
    expect(sets).toHaveLength(1);
    expect(sets[0].dimension).toBe('customer_id');
    expect(sets[0].members).toEqual(['r0', 'r2', 'r4']);
    expect(sets[0].name).toMatch(/Cluster 1/);
  });
});
