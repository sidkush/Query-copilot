import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import AutogenProgressChip from '../AutogenProgressChip';
import { useStore } from '../../../store';

describe('AutogenProgressChip', () => {
  beforeEach(() => {
    cleanup();
    useStore.setState({
      autogenProgress: { done: 0, total: 0, activePresets: [] },
    });
  });

  it('renders "Building · N/M modes" when bindingAutogenState is running', () => {
    useStore.setState({
      autogenProgress: { done: 3, total: 5, activePresets: [] },
    });
    render(<AutogenProgressChip bindingAutogenState="running" />);
    const chip = screen.getByTestId('autogen-progress-chip');
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveTextContent(/Building/i);
    expect(chip).toHaveTextContent(/3\s*\/\s*5/);
    expect(chip).toHaveTextContent(/modes/i);
  });

  it('renders nothing when bindingAutogenState is not running', () => {
    const { container } = render(
      <AutogenProgressChip bindingAutogenState="complete" />
    );
    expect(container.firstChild).toBeNull();
    cleanup();
    const { container: c2 } = render(
      <AutogenProgressChip bindingAutogenState={undefined} />
    );
    expect(c2.firstChild).toBeNull();
  });
});
