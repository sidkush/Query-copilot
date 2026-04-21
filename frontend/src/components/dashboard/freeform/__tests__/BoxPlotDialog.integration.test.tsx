import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, beforeEach } from 'vitest';
import BoxPlotDialog from '../panels/BoxPlotDialog';
import { useStore } from '../../../../store';

beforeEach(() => {
  useStore.setState({
    ...useStore.getState(),
    analystProBoxPlots: [],
    analystProBoxPlotDialogCtx: { kind: 'box_plot' },
  });
});

describe('BoxPlotDialog integration', () => {
  it('dispatches addBoxPlotAnalystPro with chosen whisker method', () => {
    render(<BoxPlotDialog />);
    fireEvent.click(screen.getByLabelText(/Tukey/i));
    fireEvent.click(screen.getByLabelText(/Show outliers/i));
    fireEvent.click(screen.getByRole('button', { name: /Save/i }));
    const list = useStore.getState().analystProBoxPlots;
    expect(list).toHaveLength(1);
    expect(list[0].spec.whisker_method).toBe('tukey');
    expect(list[0].spec.show_outliers).toBe(true);
  });

  it('disables show_outliers when whisker_method=min-max', () => {
    render(<BoxPlotDialog />);
    fireEvent.click(screen.getByLabelText(/Min\/Max/i));
    expect(screen.getByLabelText(/Show outliers/i)).toBeDisabled();
  });
});
