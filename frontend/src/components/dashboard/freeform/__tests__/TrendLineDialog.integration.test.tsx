import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useStore } from '../../../../store';
import TrendLineDialog from '../panels/TrendLineDialog';
import * as api from '../../../../api';

describe('TrendLineDialog — integration', () => {
  beforeEach(() => {
    useStore.setState((s: any) => ({
      ...s,
      analystProTrendLines: [],
      analystProTrendLineDialogCtx: {
        kind: 'trend_line',
        tileId: 'c1',
        rows: [
          { x: 1, y: 2 },
          { x: 2, y: 4 },
          { x: 3, y: 6 },
        ],
      },
      analystProCurrentMarksCardDims: ['region'],
    }));
  });

  it('fits polynomial degree 3 and displays R² in preview table', async () => {
    vi.spyOn(api, 'fetchTrendFit').mockResolvedValue({
      fits: [
        {
          factor_value: null,
          result: {
            coefficients: [0.5, -2, 1, 4],
            r_squared: 0.9876,
            p_value: 1.2e-9,
            sse: 0.3,
            rmse: 0.1,
            equation: 'y = 0.5*x^3 -2*x^2 + x + 4',
            predictions: [{ x: 1, y: 3.5 }],
          },
        },
      ],
    });

    render(<TrendLineDialog />);
    fireEvent.change(screen.getByLabelText(/fit type/i), {
      target: { value: 'polynomial' },
    });
    fireEvent.change(screen.getByLabelText(/degree/i), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: /preview/i }));

    await waitFor(() => {
      expect(screen.getByText('0.99')).toBeInTheDocument(); // R² rounded
      expect(screen.getByText(/1\.20e-9/i)).toBeInTheDocument(); // p-value
    });
  });
});
