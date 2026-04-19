import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import RebuildButton from '../RebuildButton';
import { useStore } from '../../../store';

describe('RebuildButton', () => {
  beforeEach(() => {
    cleanup();
    useStore.setState({
      autogenProgress: { done: 0, total: 0, activePresets: [] },
    });
  });

  it('clicking the button opens a confirm popover', () => {
    render(<RebuildButton />);
    fireEvent.click(screen.getByRole('button', { name: /rebuild/i }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveTextContent(/regenerate bindings/i);
    expect(dialog).toHaveTextContent(/pinned edits will be preserved/i);
  });

  it('confirming fires store.rebuildAllPresets', () => {
    const spy = vi.fn().mockResolvedValue(undefined);
    useStore.setState({ rebuildAllPresets: spy });
    render(<RebuildButton />);
    fireEvent.click(screen.getByRole('button', { name: /rebuild/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirm|regenerate/i }));
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
