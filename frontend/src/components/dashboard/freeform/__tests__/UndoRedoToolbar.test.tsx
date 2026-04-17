import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useStore } from '../../../../store';
import UndoRedoToolbar from '../panels/UndoRedoToolbar';

function baseDash(name = 'v0') {
  return {
    schemaVersion: 'askdb/dashboard/v1', id: 'd1', name, archetype: 'analyst-pro',
    size: { mode: 'automatic' },
    tiledRoot: { id: 'root', type: 'container-vert', w: 100000, h: 100000, children: [] },
    floatingLayer: [], worksheets: [], parameters: [], sets: [], actions: [],
  };
}

beforeEach(() => {
  useStore.setState({
    analystProDashboard: baseDash('v0'),
    analystProHistory: null,
    analystProHistoryPanelOpen: false,
  } as any);
  useStore.getState().initAnalystProHistory(baseDash('v0'));
});

describe('UndoRedoToolbar (Plan 6b T5)', () => {
  it('renders with counts of 0 and both buttons disabled when stack empty', () => {
    render(<UndoRedoToolbar />);
    const undo = screen.getByRole('button', { name: /Undo 0/ });
    const redo = screen.getByRole('button', { name: /Redo 0/ });
    expect(undo).toBeDisabled();
    expect(redo).toBeDisabled();
  });

  it('reflects past/future counts after a push and an undo', () => {
    useStore.getState().pushAnalystProHistory(baseDash('v1'), 'Resize zone');
    useStore.getState().pushAnalystProHistory(baseDash('v2'), 'Insert object');
    render(<UndoRedoToolbar />);
    expect(screen.getByRole('button', { name: /Undo 2/ })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /Redo 0/ })).toBeDisabled();
    act(() => { useStore.getState().undoAnalystPro(); });
    expect(screen.getByRole('button', { name: /Undo 1/ })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /Redo 1/ })).not.toBeDisabled();
  });

  it('tooltip shows last operation name on undo button', () => {
    useStore.getState().pushAnalystProHistory(baseDash('v1'), 'Resize zone');
    render(<UndoRedoToolbar />);
    const undo = screen.getByRole('button', { name: /Last: Resize zone/ });
    expect(undo).toBeInTheDocument();
  });

  it('clicking undo calls undoAnalystPro', () => {
    useStore.getState().pushAnalystProHistory(baseDash('v1'), 'Resize zone');
    render(<UndoRedoToolbar />);
    fireEvent.click(screen.getByRole('button', { name: /Undo/ }));
    expect(useStore.getState().analystProDashboard.name).toBe('v0');
  });

  it('history toggle flips aria-pressed + store flag', () => {
    render(<UndoRedoToolbar />);
    const btn = screen.getByRole('button', { name: /Toggle history inspector/ });
    expect(btn).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(btn);
    expect(useStore.getState().analystProHistoryPanelOpen).toBe(true);
    expect(btn).toHaveAttribute('aria-pressed', 'true');
  });
});
