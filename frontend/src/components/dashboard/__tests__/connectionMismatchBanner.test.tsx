import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import ConnectionMismatchBanner from '../ConnectionMismatchBanner';
import { useStore } from '../../../store';

describe('ConnectionMismatchBanner', () => {
  beforeEach(() => {
    cleanup();
    useStore.setState({
      activeConnId: 'conn-b',
      connections: [
        { conn_id: 'conn-a', name: 'Prod BQ', db_type: 'bigquery' },
        { conn_id: 'conn-b', name: 'Dev BQ', db_type: 'bigquery' },
      ],
    });
  });

  it('renders when activeConnId does not match boundConnId', () => {
    render(<ConnectionMismatchBanner boundConnId="conn-a" />);
    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent(/Prod BQ/);
    expect(alert).toHaveTextContent(/bigquery/);
  });

  it('renders nothing when activeConnId matches boundConnId', () => {
    useStore.setState({ activeConnId: 'conn-a' });
    const { container } = render(<ConnectionMismatchBanner boundConnId="conn-a" />);
    expect(container.firstChild).toBeNull();
  });

  it('clicking the Switch button fires setActiveConnId with the bound connection id', () => {
    render(<ConnectionMismatchBanner boundConnId="conn-a" />);
    const button = screen.getByRole('button', { name: /switch connection/i });
    fireEvent.click(button);
    expect(useStore.getState().activeConnId).toBe('conn-a');
  });
});
