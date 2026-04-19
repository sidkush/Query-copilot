// Plan TSS2 T12 — SaveDashboardDialog now renders DashboardIntentStep
// (single textarea) in the default flow, not the 5-step semantic wizard.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react';
import SaveDashboardDialog from '../SaveDashboardDialog';
import { useStore } from '../../../store';

describe('SaveDashboardDialog', () => {
  beforeEach(() => {
    cleanup();
    useStore.setState({
      connections: [
        { conn_id: 'c1', name: 'Prod BQ', db_type: 'bigquery' },
        { conn_id: 'conn-b', name: 'Dev PG', db_type: 'postgresql' },
      ],
      activeConnId: 'c1',
    });
  });

  it('renders the name input + intent textarea + submit button', () => {
    render(<SaveDashboardDialog open={true} onClose={() => {}} />);
    expect(screen.getByTestId('save-dashboard-dialog')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-name-input')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-intent-textarea')).toBeInTheDocument();
    expect(screen.getByTestId('save-dashboard-submit')).toBeInTheDocument();
  });

  it('submits userIntent (not semantic wizard tags) on save', async () => {
    const saveDashboardAndAutogen = vi.fn(async () => {});
    render(
      <SaveDashboardDialog
        open
        onClose={() => {}}
        saveDashboardAndAutogen={saveDashboardAndAutogen}
        connId="c1"
      />,
    );
    fireEvent.change(screen.getByTestId('dashboard-name-input'), {
      target: { value: 'Bikes Test' },
    });
    fireEvent.change(screen.getByTestId('dashboard-intent-textarea'), {
      target: { value: 'Show monthly ride counts by station' },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('save-dashboard-submit'));
    });
    await waitFor(() => expect(saveDashboardAndAutogen).toHaveBeenCalled());
    expect(saveDashboardAndAutogen).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Bikes Test',
        connId: 'c1',
        userIntent: 'Show monthly ride counts by station',
      }),
    );
  });

  it('does not render the 5-step semantic tag wizard in default flow', () => {
    render(
      <SaveDashboardDialog
        open
        onClose={() => {}}
        saveDashboardAndAutogen={async () => {}}
        connId="c1"
      />,
    );
    expect(screen.queryByText(/primary date/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId('semantic-wizard-option-start_lat')).not.toBeInTheDocument();
  });
});
