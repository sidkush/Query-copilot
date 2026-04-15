import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import useChartEditorHotkeys from '../../../components/editor/useChartEditorHotkeys';

function Harness({ undo, redo, enabled }: { undo: () => void; redo: () => void; enabled?: boolean }) {
  useChartEditorHotkeys({ undo, redo, enabled });
  return <div data-testid="harness" />;
}

function fireCtrlZ({ shift = false }: { shift?: boolean } = {}) {
  const ev = new KeyboardEvent('keydown', {
    key: 'z',
    ctrlKey: true,
    shiftKey: shift,
    bubbles: true,
    cancelable: true,
  });
  window.dispatchEvent(ev);
}

describe('useChartEditorHotkeys', () => {
  it('calls undo on Ctrl-Z', () => {
    const undo = vi.fn();
    const redo = vi.fn();
    render(<Harness undo={undo} redo={redo} />);
    fireCtrlZ();
    expect(undo).toHaveBeenCalledTimes(1);
    expect(redo).not.toHaveBeenCalled();
  });

  it('calls redo on Ctrl-Shift-Z', () => {
    const undo = vi.fn();
    const redo = vi.fn();
    render(<Harness undo={undo} redo={redo} />);
    fireCtrlZ({ shift: true });
    expect(redo).toHaveBeenCalledTimes(1);
    expect(undo).not.toHaveBeenCalled();
  });

  it('ignores keystrokes when the event target is an INPUT', () => {
    const undo = vi.fn();
    const redo = vi.fn();
    render(<Harness undo={undo} redo={redo} />);
    const input = document.createElement('input');
    document.body.appendChild(input);
    const ev = new KeyboardEvent('keydown', {
      key: 'z',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    // Dispatch on the input so e.target.tagName === 'INPUT'
    input.dispatchEvent(ev);
    expect(undo).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it('removes the listener on unmount', () => {
    const undo = vi.fn();
    const redo = vi.fn();
    const { unmount } = render(<Harness undo={undo} redo={redo} />);
    unmount();
    fireCtrlZ();
    expect(undo).not.toHaveBeenCalled();
  });

  it('does not bind when enabled: false', () => {
    const undo = vi.fn();
    const redo = vi.fn();
    render(<Harness undo={undo} redo={redo} enabled={false} />);
    fireCtrlZ();
    expect(undo).not.toHaveBeenCalled();
  });
});
