import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

import { useStore } from '../../../../store';
import ForecastDialog from '../panels/ForecastDialog';

vi.mock('../../../../api', () => ({
  fetchForecast: vi.fn().mockResolvedValue({
    fits: [
      {
        factor_value: null,
        result: {
          best_model: {
            kind: 'ANA', alpha: 0.5, beta: null, gamma: 0.2,
            sse: 1.0, aic: 12.5, rmse: 0.5, mae: 0.4, mape: 2.0,
          },
          forecasts: [{ t: 4, y: 4, lower: 3.5, upper: 4.5 }],
          actuals: [{ t: 1, y: 1 }, { t: 2, y: 2 }, { t: 3, y: 3 }],
          model_candidates: [],
        },
      },
    ],
  }),
}));

describe('ForecastDialog integration', () => {
  beforeEach(() => {
    (useStore as any).setState({
      analystProForecasts: [],
      analystProForecastDialogCtx: {
        tileId: 'tile-1',
        rows: [
          { t: 1, y: 1 }, { t: 2, y: 2 }, { t: 3, y: 3 },
          { t: 4, y: 4 }, { t: 5, y: 5 }, { t: 6, y: 6 },
          { t: 7, y: 7 }, { t: 8, y: 8 }, { t: 9, y: 9 }, { t: 10, y: 10 },
        ],
        preset: {},
      },
    });
  });

  it('renders best-model badge after Preview click', async () => {
    render(<ForecastDialog />);
    fireEvent.click(screen.getByRole('button', { name: /preview/i }));
    await waitFor(() => {
      expect(screen.getByText(/ANA/)).toBeInTheDocument();
    });
    expect(screen.getByText(/AIC/)).toBeInTheDocument();
  });

  it('Save persists onto analystProForecasts list', async () => {
    render(<ForecastDialog />);
    fireEvent.click(screen.getByRole('button', { name: /preview/i }));
    await waitFor(() => screen.getByText(/ANA/));
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(useStore.getState().analystProForecasts).toHaveLength(1);
  });
});
