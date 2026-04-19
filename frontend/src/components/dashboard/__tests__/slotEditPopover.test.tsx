import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import SlotEditPopover from '../SlotEditPopover';
import { useStore } from '../../../store';
import { emptyDashboardForPreset } from '../freeform/lib/dashboardShape';

// Helper — a detached anchor element the popover can measure against.
function makeAnchor(): HTMLElement {
  const el = document.createElement('div');
  el.getBoundingClientRect = () =>
    ({
      top: 100,
      bottom: 140,
      left: 40,
      right: 200,
      width: 160,
      height: 40,
      x: 40,
      y: 100,
      toJSON: () => ({}),
    }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

const SCHEMA = {
  columns: [
    { name: 'mrr', dtype: 'numeric', role: 'measure', semantic_type: 'quantitative' },
    { name: 'region', dtype: 'text', role: 'dimension', semantic_type: 'nominal' },
  ],
};

describe('SlotEditPopover', () => {
  beforeEach(() => {
    cleanup();
    const d = emptyDashboardForPreset('board-pack');
    useStore.setState({ analystProDashboard: { ...d, id: 'd1' } });
  });

  it('renders KPI variant with measure combobox + aggregation select', () => {
    const anchor = makeAnchor();
    render(
      <SlotEditPopover
        open
        onClose={() => {}}
        presetId="board-pack"
        slotId="bp.kpi-0"
        anchorEl={anchor}
        binding={undefined}
        schemaProfile={SCHEMA}
      />
    );
    const popover = screen.getByTestId('slot-edit-popover');
    expect(popover).toHaveAttribute('data-slot-kind', 'kpi');
    expect(screen.getByTestId('slot-edit-measure')).toBeInTheDocument();
    expect(screen.getByTestId('slot-edit-agg')).toBeInTheDocument();
  });

  it('renders Narrative variant with textarea when slot kind is narrative', () => {
    const anchor = makeAnchor();
    render(
      <SlotEditPopover
        open
        onClose={() => {}}
        presetId="board-pack"
        slotId="bp.hero-narrative"
        anchorEl={anchor}
        binding={undefined}
        schemaProfile={SCHEMA}
      />
    );
    const popover = screen.getByTestId('slot-edit-popover');
    expect(popover).toHaveAttribute('data-slot-kind', 'narrative');
    expect(screen.getByTestId('slot-edit-narrative')).toBeInTheDocument();
    expect(screen.getByTestId('slot-edit-pin')).toBeInTheDocument();
    // Narrative variant has no Advanced button.
    expect(screen.queryByTestId('slot-edit-advanced')).toBeNull();
  });

  it('Save fires setSlotBinding with the chosen measure + aggregation', () => {
    const spy = vi.fn();
    useStore.setState({ setSlotBinding: spy });
    const onClose = vi.fn();
    const anchor = makeAnchor();
    render(
      <SlotEditPopover
        open
        onClose={onClose}
        presetId="board-pack"
        slotId="bp.kpi-0"
        anchorEl={anchor}
        binding={undefined}
        schemaProfile={SCHEMA}
      />
    );
    fireEvent.change(screen.getByTestId('slot-edit-measure'), {
      target: { value: 'mrr' },
    });
    fireEvent.change(screen.getByTestId('slot-edit-agg'), {
      target: { value: 'AVG' },
    });
    fireEvent.click(screen.getByTestId('slot-edit-save'));
    expect(spy).toHaveBeenCalledTimes(1);
    const [presetArg, slotArg, patch] = spy.mock.calls[0];
    expect(presetArg).toBe('board-pack');
    expect(slotArg).toBe('bp.kpi-0');
    expect(patch.kind).toBe('kpi');
    expect(patch.measure).toEqual({ column: 'mrr', agg: 'AVG' });
    expect(onClose).toHaveBeenCalled();
  });

  it('Advanced… fires openAdvancedEditor and closes the popover', () => {
    const openSpy = vi.fn();
    useStore.setState({ openAdvancedEditor: openSpy });
    const onClose = vi.fn();
    const anchor = makeAnchor();
    render(
      <SlotEditPopover
        open
        onClose={onClose}
        presetId="board-pack"
        slotId="bp.kpi-0"
        anchorEl={anchor}
        binding={undefined}
        schemaProfile={SCHEMA}
      />
    );
    fireEvent.change(screen.getByTestId('slot-edit-measure'), {
      target: { value: 'mrr' },
    });
    fireEvent.click(screen.getByTestId('slot-edit-advanced'));
    expect(openSpy).toHaveBeenCalledTimes(1);
    const [slotArg, bindingArg] = openSpy.mock.calls[0];
    expect(slotArg).toBe('bp.kpi-0');
    expect(bindingArg.measure).toEqual({ column: 'mrr', agg: 'SUM' });
    expect(onClose).toHaveBeenCalled();
  });

  it('outside click closes without firing save', () => {
    const saveSpy = vi.fn();
    useStore.setState({ setSlotBinding: saveSpy });
    const onClose = vi.fn();
    const anchor = makeAnchor();
    render(
      <SlotEditPopover
        open
        onClose={onClose}
        presetId="board-pack"
        slotId="bp.kpi-0"
        anchorEl={anchor}
        binding={undefined}
        schemaProfile={SCHEMA}
      />
    );
    // Click somewhere outside (document.body at an element not inside the popover
    // and not inside the anchor).
    const outside = document.createElement('div');
    document.body.appendChild(outside);
    fireEvent.mouseDown(outside);
    expect(onClose).toHaveBeenCalled();
    expect(saveSpy).not.toHaveBeenCalled();
  });
});
