import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import AlignmentToolbar from '../panels/AlignmentToolbar';
import { useStore } from '../../../../store';

function makeDash(floatingIds: string[]) {
  return {
    schemaVersion: 'askdb/dashboard/v1',
    id: 'd1', name: 'T', archetype: 'analyst-pro',
    size: { mode: 'automatic' },
    tiledRoot: { id: 'root', type: 'container-horz', w: 100000, h: 100000, children: [] },
    floatingLayer: floatingIds.map((id, i) => ({
      id, type: 'text', floating: true,
      x: i * 100, y: 0, pxW: 100, pxH: 100, zIndex: i + 1,
      w: 0, h: 0,
    })),
    worksheets: [], parameters: [], sets: [], actions: [],
  };
}

describe('AlignmentToolbar', () => {
  beforeEach(() => {
    useStore.setState({
      analystProDashboard: makeDash(['a', 'b', 'c', 'd']),
      analystProSelection: new Set(),
    });
  });

  it('all buttons disabled when selection < 2', () => {
    useStore.setState({ analystProSelection: new Set(['a']) });
    render(<AlignmentToolbar />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
  });

  it('align buttons enabled when selection == 2, distribute disabled', () => {
    useStore.setState({ analystProSelection: new Set(['a', 'b']) });
    render(<AlignmentToolbar />);
    expect((screen.getByLabelText('Align Left') as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByLabelText('Distribute Horizontally') as HTMLButtonElement).disabled).toBe(true);
  });

  it('all buttons enabled when selection >= 3', () => {
    useStore.setState({ analystProSelection: new Set(['a', 'b', 'c']) });
    render(<AlignmentToolbar />);
    expect((screen.getByLabelText('Distribute Horizontally') as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByLabelText('Distribute Vertically') as HTMLButtonElement).disabled).toBe(false);
  });

  it('clicking Align Left calls alignSelectionAnalystPro with left', () => {
    const spy = vi.fn();
    useStore.setState({
      analystProSelection: new Set(['a', 'b']),
      alignSelectionAnalystPro: spy,
    });
    render(<AlignmentToolbar />);
    fireEvent.click(screen.getByLabelText('Align Left'));
    expect(spy).toHaveBeenCalledWith('left');
  });

  it('clicking Distribute Horizontally calls distributeSelectionAnalystPro with horizontal', () => {
    const spy = vi.fn();
    useStore.setState({
      analystProSelection: new Set(['a', 'b', 'c']),
      distributeSelectionAnalystPro: spy,
    });
    render(<AlignmentToolbar />);
    fireEvent.click(screen.getByLabelText('Distribute Horizontally'));
    expect(spy).toHaveBeenCalledWith('horizontal');
  });
});
