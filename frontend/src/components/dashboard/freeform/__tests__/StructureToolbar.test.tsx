// frontend/src/components/dashboard/freeform/__tests__/StructureToolbar.test.tsx
/**
 * Unit tests for StructureToolbar (Plan 2b fixup 3).
 *
 * 1. All 3 buttons disabled when selection is empty.
 * 2. Group button enabled + click calls groupSelectionAnalystPro when ≥2 tiled zones selected.
 * 3. Lock button click calls toggleLockAnalystPro for each selected id.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import StructureToolbar from '../panels/StructureToolbar';
import { useStore } from '../../../../store';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeBaseDashboard(tiledChildren: any[] = [], floatingLayer: any[] = []) {
  return {
    schemaVersion: 'askdb/dashboard/v1',
    id: 'test-dash',
    name: 'Test',
    archetype: 'analyst-pro',
    size: { mode: 'fixed', width: 1000, height: 600, preset: 'custom' },
    tiledRoot: {
      id: 'root',
      type: 'container-vert',
      w: 100000,
      h: 100000,
      children: tiledChildren,
    },
    floatingLayer,
    worksheets: [],
    parameters: [],
    sets: [],
    actions: [],
  };
}

function resetStore() {
  useStore.setState({
    analystProDashboard: null,
    analystProSelection: new Set(),
    analystProHistory: null,
    analystProDragState: null,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('StructureToolbar', () => {
  beforeEach(() => {
    resetStore();
  });

  afterEach(() => {
    cleanup();
  });

  it('all 3 buttons are disabled when selection is empty', () => {
    const dash = makeBaseDashboard([
      { id: 'z1', type: 'worksheet', w: 100000, h: 50000, worksheetRef: 'ws1' },
      { id: 'z2', type: 'worksheet', w: 100000, h: 50000, worksheetRef: 'ws2' },
    ]);
    useStore.setState({ analystProDashboard: dash, analystProSelection: new Set() });
    render(<StructureToolbar />);

    expect(screen.getByRole('button', { name: 'Group' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Ungroup' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Toggle lock' })).toBeDisabled();
  });

  it('Group button enabled and click calls groupSelectionAnalystPro when ≥2 tiled zones selected', () => {
    const tiledChildren = [
      { id: 'z1', type: 'worksheet', w: 100000, h: 50000, worksheetRef: 'ws1' },
      { id: 'z2', type: 'worksheet', w: 100000, h: 50000, worksheetRef: 'ws2' },
    ];
    const dash = makeBaseDashboard(tiledChildren);
    useStore.setState({ analystProDashboard: dash, analystProSelection: new Set(['z1', 'z2']) });

    // Spy on the store action.
    const groupSpy = vi.fn();
    useStore.setState({ groupSelectionAnalystPro: groupSpy });

    render(<StructureToolbar />);

    const groupBtn = screen.getByRole('button', { name: 'Group' });
    expect(groupBtn).not.toBeDisabled();

    act(() => { fireEvent.click(groupBtn); });
    expect(groupSpy).toHaveBeenCalledTimes(1);
  });

  it('Distribute Evenly button enabled when a container with >=2 children is selected', () => {
    const dash = makeBaseDashboard([
      {
        id: 'inner',
        type: 'container-horz',
        w: 100000,
        h: 100000,
        children: [
          { id: 'x', type: 'blank', w: 50000, h: 100000 },
          { id: 'y', type: 'blank', w: 50000, h: 100000 },
        ],
      },
    ]);
    useStore.setState({ analystProDashboard: dash, analystProSelection: new Set(['inner']) });
    const spy = vi.fn();
    useStore.setState({ distributeEvenlyAnalystPro: spy });

    render(<StructureToolbar />);
    const btn = screen.getByRole('button', { name: 'Distribute Evenly' });
    expect(btn).not.toBeDisabled();
    act(() => { fireEvent.click(btn); });
    expect(spy).toHaveBeenCalledWith('inner');
  });

  it('Fit to Content button calls fitContainerToContentAnalystPro', () => {
    const dash = makeBaseDashboard([
      {
        id: 'inner',
        type: 'container-vert',
        w: 100000,
        h: 100000,
        children: [{ id: 'x', type: 'blank', w: 100000, h: 100000 }],
      },
    ]);
    useStore.setState({ analystProDashboard: dash, analystProSelection: new Set(['inner']) });
    const spy = vi.fn();
    useStore.setState({ fitContainerToContentAnalystPro: spy });
    render(<StructureToolbar />);
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Fit to Content' })); });
    expect(spy).toHaveBeenCalledWith('inner');
  });

  it('Remove Container button disabled when root is selected', () => {
    const dash = makeBaseDashboard([
      { id: 'a', type: 'blank', w: 100000, h: 100000 },
    ]);
    useStore.setState({ analystProDashboard: dash, analystProSelection: new Set(['root']) });
    render(<StructureToolbar />);
    expect(screen.getByRole('button', { name: 'Remove Container' })).toBeDisabled();
  });

  it('Remove Container button calls removeContainerAnalystPro for non-root container', () => {
    const dash = makeBaseDashboard([
      {
        id: 'inner',
        type: 'container-horz',
        w: 100000,
        h: 100000,
        children: [{ id: 'x', type: 'blank', w: 100000, h: 100000 }],
      },
    ]);
    useStore.setState({ analystProDashboard: dash, analystProSelection: new Set(['inner']) });
    const spy = vi.fn();
    useStore.setState({ removeContainerAnalystPro: spy });
    render(<StructureToolbar />);
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Remove Container' })); });
    expect(spy).toHaveBeenCalledWith('inner');
  });

  it('all three new buttons disabled when selection is empty', () => {
    const dash = makeBaseDashboard([
      { id: 'a', type: 'blank', w: 100000, h: 100000 },
    ]);
    useStore.setState({ analystProDashboard: dash, analystProSelection: new Set() });
    render(<StructureToolbar />);
    expect(screen.getByRole('button', { name: 'Distribute Evenly' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Fit to Content' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remove Container' })).toBeDisabled();
  });

  it('Lock button click calls toggleLockAnalystPro for each selected id', () => {
    const dash = makeBaseDashboard([], [
      { id: 'f1', type: 'legend', floating: true, x: 0, y: 0, pxW: 100, pxH: 100, zIndex: 1, w: 0, h: 0 },
      { id: 'f2', type: 'text',   floating: true, x: 0, y: 0, pxW: 100, pxH: 100, zIndex: 2, w: 0, h: 0 },
    ]);
    useStore.setState({ analystProDashboard: dash, analystProSelection: new Set(['f1', 'f2']) });

    const lockSpy = vi.fn();
    useStore.setState({ toggleLockAnalystPro: lockSpy });

    render(<StructureToolbar />);

    const lockBtn = screen.getByRole('button', { name: 'Toggle lock' });
    expect(lockBtn).not.toBeDisabled();

    act(() => { fireEvent.click(lockBtn); });
    // Should have been called once per selected id.
    expect(lockSpy).toHaveBeenCalledTimes(2);
    const calledWith = lockSpy.mock.calls.map(([id]: [string]) => id).sort();
    expect(calledWith).toEqual(['f1', 'f2']);
  });
});
