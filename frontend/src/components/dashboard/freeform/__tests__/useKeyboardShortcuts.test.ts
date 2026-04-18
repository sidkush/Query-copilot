import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useStore } from '../../../../store';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';

function baseDash() {
  return {
    schemaVersion: 'askdb/dashboard/v1',
    id: 'd1',
    name: 'T',
    archetype: 'analyst-pro',
    size: { mode: 'fixed', width: 1000, height: 600, preset: 'custom' },
    tiledRoot: {
      id: 'root',
      type: 'container-vert',
      w: 100000,
      h: 100000,
      children: [{ id: 'z1', type: 'worksheet', w: 100000, h: 100000, worksheetRef: 'ws1' }],
    },
    floatingLayer: [],
    worksheets: [],
    parameters: [],
    sets: [],
    actions: [],
  };
}

describe('useKeyboardShortcuts — Plan 5e', () => {
  beforeEach(() => {
    useStore.setState({
      analystProDashboard: null,
      analystProSelection: new Set(),
      analystProHistory: null,
    });
  });

  it('Cmd+Shift+F calls toggleZoneFloatAnalystPro for every selected zone', () => {
    const dash = baseDash();
    const spy = vi.fn();
    useStore.setState({
      analystProDashboard: dash,
      analystProSelection: new Set(['z1']),
      toggleZoneFloatAnalystPro: spy,
    });
    useStore.getState().initAnalystProHistory(dash);
    renderHook(() => useKeyboardShortcuts());

    const ev = new KeyboardEvent('keydown', { key: 'f', metaKey: true, shiftKey: true, bubbles: true, cancelable: true });
    window.dispatchEvent(ev);
    expect(spy).toHaveBeenCalledWith('z1');
  });

  it('Ctrl+Shift+F triggers (Windows/Linux branch)', () => {
    const dash = baseDash();
    const spy = vi.fn();
    useStore.setState({
      analystProDashboard: dash,
      analystProSelection: new Set(['z1']),
      toggleZoneFloatAnalystPro: spy,
    });
    useStore.getState().initAnalystProHistory(dash);
    renderHook(() => useKeyboardShortcuts());
    const ev = new KeyboardEvent('keydown', { key: 'F', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true });
    window.dispatchEvent(ev);
    expect(spy).toHaveBeenCalledWith('z1');
  });

  it('Cmd+F (no shift) does NOT call the action', () => {
    const dash = baseDash();
    const spy = vi.fn();
    useStore.setState({
      analystProDashboard: dash,
      analystProSelection: new Set(['z1']),
      toggleZoneFloatAnalystPro: spy,
    });
    useStore.getState().initAnalystProHistory(dash);
    renderHook(() => useKeyboardShortcuts());
    const ev = new KeyboardEvent('keydown', { key: 'f', metaKey: true, shiftKey: false, bubbles: true, cancelable: true });
    window.dispatchEvent(ev);
    expect(spy).not.toHaveBeenCalled();
  });
});
