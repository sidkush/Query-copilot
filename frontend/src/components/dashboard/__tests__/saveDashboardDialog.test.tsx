import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import SaveDashboardDialog from '../SaveDashboardDialog';
import { useStore } from '../../../store';

describe('SaveDashboardDialog', () => {
  beforeEach(() => {
    cleanup();
    useStore.setState({
      connections: [
        { conn_id: 'conn-a', name: 'Prod BQ', db_type: 'bigquery' },
        { conn_id: 'conn-b', name: 'Dev PG',  db_type: 'postgresql' },
      ],
      activeConnId: 'conn-a',
    });
  });

  it('renders the name input, connection dropdown, and smart-build switch', () => {
    render(<SaveDashboardDialog open={true} onClose={() => {}} />);
    expect(screen.getByTestId('save-dashboard-dialog')).toBeInTheDocument();
    expect(screen.getByTestId('save-dashboard-name-input')).toBeInTheDocument();
    const select = screen.getByTestId('save-dashboard-conn-select') as HTMLSelectElement;
    expect(select).toBeInTheDocument();
    expect(select.value).toBe('conn-a');
    const switchEl = screen.getByTestId('save-dashboard-smart-build-switch');
    expect(switchEl).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('save-dashboard-submit')).toBeInTheDocument();
    expect(screen.getByTestId('save-dashboard-cancel')).toBeInTheDocument();
  });

  it('disables Save when name is empty, enables it once a name is typed', () => {
    render(<SaveDashboardDialog open={true} onClose={() => {}} />);
    const submit = screen.getByTestId('save-dashboard-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    const input = screen.getByTestId('save-dashboard-name-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Marketing Dashboard' } });
    expect(submit.disabled).toBe(false);

    // Whitespace-only is still disabled.
    fireEvent.change(input, { target: { value: '   ' } });
    expect(submit.disabled).toBe(true);
  });

  it('Save fires saveDashboardAndAutogen with the trimmed name + conn + smart-build flag', async () => {
    const spy = vi.fn().mockResolvedValue('dash-123');
    useStore.setState({ saveDashboardAndAutogen: spy });
    const onClose = vi.fn();
    render(<SaveDashboardDialog open={true} onClose={onClose} />);

    const input = screen.getByTestId('save-dashboard-name-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '  Launch KPIs  ' } });

    const connSelect = screen.getByTestId('save-dashboard-conn-select');
    fireEvent.change(connSelect, { target: { value: 'conn-b' } });

    await act(async () => {
      fireEvent.click(screen.getByTestId('save-dashboard-submit'));
    });

    // Dialog closes immediately so the wizard takes over.
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({
      name: 'Launch KPIs',
      connId: 'conn-b',
      runSmartBuild: true,
      tags: {},
    });
  });

  it('clicking the backdrop closes the dialog', () => {
    const onClose = vi.fn();
    render(<SaveDashboardDialog open={true} onClose={onClose} />);
    const backdrop = screen.getByTestId('save-dashboard-dialog');
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);

    // Clicking on the panel itself should NOT close.
    onClose.mockClear();
    const panel = backdrop.querySelector('form');
    expect(panel).not.toBeNull();
    fireEvent.click(panel as Element);
    expect(onClose).not.toHaveBeenCalled();
  });
});
