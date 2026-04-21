/** Plan 9d T6 — ClusterDialog: variables picker, k-mode, preview, stats render. */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ClusterDialog from '../panels/ClusterDialog';
import { useStore } from '../../../../store';

vi.mock('../../../../api', () => ({
  fetchCluster: vi.fn().mockResolvedValue({
    result: {
      optimal_k: 3,
      assignments: [0, 1, 2, 0, 1, 2],
      centroids: [[0, 0], [10, 0], [5, 10]],
      calinski_harabasz_score: 123.4,
      f_statistic: 60.2,
      inertia: 5, total_ssq: 500, between_group_ssq: 495,
      candidates: [
        { k: 2, ch_score: 80, inertia: 20 },
        { k: 3, ch_score: 123.4, inertia: 5 },
      ],
      per_cluster_feature_means: [[0, 0], [10, 0], [5, 10]],
      notes: [],
    },
  }),
}));

beforeEach(() => {
  useStore.setState({
    analystProClusterDialogCtx: { availableVariables: ['sales', 'profit', 'qty'] },
    analystProClusters: [],
  });
});

describe('ClusterDialog', () => {
  it('renders best-k badge after Preview', async () => {
    render(<ClusterDialog />);
    fireEvent.click(screen.getByText('sales'));
    fireEvent.click(screen.getByText('profit'));
    fireEvent.click(screen.getByRole('button', { name: /preview/i }));
    await waitFor(() => expect(screen.getByText(/k\s*=\s*3/i)).toBeInTheDocument());
    expect(screen.getByText(/CH\s*123\.4/i)).toBeInTheDocument();
  });
});
