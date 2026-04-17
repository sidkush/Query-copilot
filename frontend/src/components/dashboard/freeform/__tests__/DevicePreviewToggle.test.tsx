import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DevicePreviewToggle from '../DevicePreviewToggle';
import { useStore } from '../../../../store';

describe('<DevicePreviewToggle />', () => {
  beforeEach(() => {
    useStore.setState({ analystProActiveDevice: 'desktop' });
  });

  it('renders three device buttons', () => {
    render(<DevicePreviewToggle />);
    expect(screen.getByTestId('device-desktop')).toBeInTheDocument();
    expect(screen.getByTestId('device-tablet')).toBeInTheDocument();
    expect(screen.getByTestId('device-phone')).toBeInTheDocument();
  });

  it('highlights the active device', () => {
    useStore.setState({ analystProActiveDevice: 'tablet' });
    render(<DevicePreviewToggle />);
    expect(screen.getByTestId('device-tablet')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('device-desktop')).toHaveAttribute('aria-pressed', 'false');
  });

  it('switches the active device on click', () => {
    render(<DevicePreviewToggle />);
    fireEvent.click(screen.getByTestId('device-phone'));
    expect(useStore.getState().analystProActiveDevice).toBe('phone');
  });
});
