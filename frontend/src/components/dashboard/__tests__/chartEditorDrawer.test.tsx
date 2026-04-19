import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

// Mock the heavy ChartEditor so the drawer test is fast + deterministic.
// This must be registered before the drawer import resolves.
vi.mock('../../editor/ChartEditor', () => ({
  default: (props: { spec: unknown; onSpecChange?: (s: unknown) => void }) => (
    <div data-testid="mock-chart-editor" data-has-spec={props.spec ? 'yes' : 'no'} />
  ),
}));

import ChartEditorDrawer from '../ChartEditorDrawer';
import { useStore } from '../../../store';
import { emptyDashboardForPreset } from '../freeform/lib/dashboardShape';

const BASE_BINDING = {
  slotId: 'bp.kpi-0',
  kind: 'kpi' as const,
  measure: { column: 'mrr', agg: 'SUM' as const },
};

describe('ChartEditorDrawer', () => {
  beforeEach(() => {
    cleanup();
    const d = emptyDashboardForPreset('board-pack');
    useStore.setState({ analystProDashboard: { ...d, id: 'd1' } });
  });

  it('renders with a close button and a mounted ChartEditor shell', () => {
    render(
      <ChartEditorDrawer
        open
        onClose={() => {}}
        slotId="bp.kpi-0"
        binding={BASE_BINDING}
        onSave={() => {}}
      />
    );
    expect(screen.getByTestId('chart-editor-drawer')).toBeInTheDocument();
    expect(screen.getByTestId('chart-editor-drawer-close')).toBeInTheDocument();
    const mockEditor = screen.getByTestId('mock-chart-editor');
    expect(mockEditor).toBeInTheDocument();
    expect(mockEditor).toHaveAttribute('data-has-spec', 'yes');
  });

  it('backdrop click closes the drawer', () => {
    const onClose = vi.fn();
    render(
      <ChartEditorDrawer
        open
        onClose={onClose}
        slotId="bp.kpi-0"
        binding={BASE_BINDING}
        onSave={() => {}}
      />
    );
    fireEvent.click(screen.getByTestId('chart-editor-drawer-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('internal Save fires onSave with a spec-derived binding patch', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(
      <ChartEditorDrawer
        open
        onClose={onClose}
        slotId="bp.kpi-0"
        binding={BASE_BINDING}
        onSave={onSave}
      />
    );
    fireEvent.click(screen.getByTestId('chart-editor-drawer-save'));
    expect(onSave).toHaveBeenCalledTimes(1);
    const patch = onSave.mock.calls[0][0];
    expect(patch.kind).toBe('kpi');
    // Spec built from binding should round-trip the measure back into the patch.
    expect(patch.measure).toEqual({ column: 'mrr', agg: 'SUM' });
    expect(onClose).toHaveBeenCalled();
  });
});
