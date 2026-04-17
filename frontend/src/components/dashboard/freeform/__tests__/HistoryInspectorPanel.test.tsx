import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useStore } from '../../../../store';
import HistoryInspectorPanel from '../panels/HistoryInspectorPanel';

function dash(name = 'v0', floating: any[] = []) {
  return {
    schemaVersion: 'askdb/dashboard/v1', id: 'd1', name, archetype: 'analyst-pro',
    size: { mode: 'automatic' },
    tiledRoot: { id: 'root', type: 'container-vert', w: 100000, h: 100000, children: [] },
    floatingLayer: floating, worksheets: [], parameters: [], sets: [], actions: [],
  };
}

beforeEach(() => {
  useStore.setState({
    analystProDashboard: dash('v0'),
    analystProHistory: null,
    analystProHistoryPanelOpen: true,
  } as any);
  useStore.getState().initAnalystProHistory(dash('v0'));
});

describe('HistoryInspectorPanel (Plan 6b T6)', () => {
  it('returns null when panel closed', () => {
    useStore.setState({ analystProHistoryPanelOpen: false } as any);
    const { container } = render(<HistoryInspectorPanel />);
    expect(container.firstChild).toBeNull();
  });

  it('lists past operations newest-first with diff preview', () => {
    useStore.getState().pushAnalystProHistory(
      dash('v1', [{ id: 'f1', type: 'blank', w: 0, h: 0, floating: true, x: 0, y: 0, pxW: 50, pxH: 50 }]),
      'Insert object',
    );
    useStore.getState().pushAnalystProHistory(
      dash('v2', [{ id: 'f1', type: 'blank', w: 0, h: 0, floating: true, x: 10, y: 20, pxW: 50, pxH: 50 },
                  { id: 'f2', type: 'blank', w: 0, h: 0, floating: true, x: 0, y: 0, pxW: 50, pxH: 50 }]),
      'Insert object',
    );
    render(<HistoryInspectorPanel />);
    const region = screen.getByRole('region', { name: /history inspector/i });
    expect(region).toHaveAttribute('aria-live', 'polite');

    const rows = screen.getAllByTestId(/^history-row-/);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Insert object');
    expect(rows[0]).toHaveTextContent('+1');
  });

  it('clicking a row dispatches jumpToHistoryAnalystPro', () => {
    useStore.getState().pushAnalystProHistory(dash('v1'), 'op-1');
    useStore.getState().pushAnalystProHistory(dash('v2'), 'op-2');
    render(<HistoryInspectorPanel />);
    act(() => { fireEvent.click(screen.getByTestId('history-row-1')); });
    expect(useStore.getState().analystProDashboard.name).toBe('v0');
  });

  it('caps rendered past rows at 50', () => {
    for (let i = 0; i < 60; i++) {
      useStore.getState().pushAnalystProHistory(dash(`v${i + 1}`), `op-${i}`);
    }
    render(<HistoryInspectorPanel />);
    expect(screen.getAllByTestId(/^history-row-/)).toHaveLength(50);
  });
});
