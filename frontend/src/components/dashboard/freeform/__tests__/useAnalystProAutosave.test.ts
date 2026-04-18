// Plan 7 T8 — autosave hook that PATCHes authored layout to backend.
//
// Debounced 1500 ms. Serializes payload and short-circuits when unchanged
// so a flurry of mutations within the debounce window produces at most one
// PATCH. Unmount cancels any pending timer. 401 / network errors logged but
// never thrown (editor keeps working).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock the API module before importing the hook (hoisted by vitest).
vi.mock('../../../../api', () => ({
  updateDashboard: vi.fn(() => Promise.resolve({})),
}));

import useAnalystProAutosave from '../hooks/useAnalystProAutosave';
import { useStore } from '../../../../store';
import * as api from '../../../../api';

const makeDash = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 'askdb/dashboard/v1',
  id: 'd1',
  name: 'Test',
  archetype: 'analyst-pro',
  size: { mode: 'automatic' },
  tiledRoot: { id: 'root', type: 'container-vert', w: 100000, h: 100000, children: [] },
  floatingLayer: [],
  worksheets: [],
  parameters: [],
  sets: [],
  actions: [],
  ...overrides,
});

describe('Plan 7 T8 — useAnalystProAutosave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    (api.updateDashboard as unknown as ReturnType<typeof vi.fn>).mockClear();
    useStore.setState({ analystProDashboard: makeDash() });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not PATCH immediately on mount', () => {
    renderHook(() => useAnalystProAutosave('d1'));
    expect(api.updateDashboard).not.toHaveBeenCalled();
  });

  it('PATCHes once 1500 ms after a mutation', () => {
    renderHook(() => useAnalystProAutosave('d1'));
    act(() => {
      useStore.setState({ analystProDashboard: makeDash({ name: 'Renamed' }) });
    });
    // Before the debounce expires — no PATCH.
    act(() => { vi.advanceTimersByTime(1499); });
    expect(api.updateDashboard).not.toHaveBeenCalled();
    // After debounce — PATCH fires exactly once.
    act(() => { vi.advanceTimersByTime(1); });
    expect(api.updateDashboard).toHaveBeenCalledTimes(1);
  });

  it('PATCH payload carries tiledRoot / floatingLayer / size / archetype / schemaVersion', () => {
    renderHook(() => useAnalystProAutosave('d1'));
    act(() => {
      useStore.setState({
        analystProDashboard: makeDash({
          size: { mode: 'fixed', width: 1440, height: 900, preset: 'custom' },
          floatingLayer: [{ id: 'f1', type: 'worksheet', floating: true, x: 10, y: 10, pxW: 200, pxH: 150, worksheetRef: 'w1' }],
        }),
      });
    });
    act(() => { vi.advanceTimersByTime(1500); });
    const [id, body] = (api.updateDashboard as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(id).toBe('d1');
    expect(body).toHaveProperty('schemaVersion', 'askdb/dashboard/v1');
    expect(body).toHaveProperty('archetype', 'analyst-pro');
    expect(body).toHaveProperty('size.mode', 'fixed');
    expect(body).toHaveProperty('tiledRoot');
    expect(body).toHaveProperty('floatingLayer');
    expect((body as { floatingLayer: unknown[] }).floatingLayer).toHaveLength(1);
  });

  it('debounce coalesces rapid mutations into one PATCH', () => {
    renderHook(() => useAnalystProAutosave('d1'));
    act(() => {
      useStore.setState({ analystProDashboard: makeDash({ name: 'A' }) });
    });
    act(() => { vi.advanceTimersByTime(500); });
    act(() => {
      useStore.setState({ analystProDashboard: makeDash({ name: 'B' }) });
    });
    act(() => { vi.advanceTimersByTime(500); });
    act(() => {
      useStore.setState({ analystProDashboard: makeDash({ name: 'C' }) });
    });
    act(() => { vi.advanceTimersByTime(1500); });
    expect(api.updateDashboard).toHaveBeenCalledTimes(1);
  });

  it('unmount cancels pending PATCH', () => {
    const { unmount } = renderHook(() => useAnalystProAutosave('d1'));
    act(() => {
      useStore.setState({ analystProDashboard: makeDash({ name: 'Renamed' }) });
    });
    act(() => { vi.advanceTimersByTime(1000); });
    unmount();
    act(() => { vi.advanceTimersByTime(5000); });
    expect(api.updateDashboard).not.toHaveBeenCalled();
  });

  it('does not PATCH when dashboardId is missing', () => {
    renderHook(() => useAnalystProAutosave(null as unknown as string));
    act(() => {
      useStore.setState({ analystProDashboard: makeDash({ name: 'Renamed' }) });
    });
    act(() => { vi.advanceTimersByTime(5000); });
    expect(api.updateDashboard).not.toHaveBeenCalled();
  });

  it('does not PATCH when payload is identical to last sent', () => {
    renderHook(() => useAnalystProAutosave('d1'));
    // First mutation.
    act(() => {
      useStore.setState({ analystProDashboard: makeDash({ name: 'X' }) });
    });
    act(() => { vi.advanceTimersByTime(1500); });
    expect(api.updateDashboard).toHaveBeenCalledTimes(1);
    // Touch an unrelated store slice (shouldn't change dashboard object ref,
    // but simulate the edge case by re-setting the identical dashboard).
    act(() => {
      useStore.setState({ analystProDashboard: makeDash({ name: 'X' }) });
    });
    act(() => { vi.advanceTimersByTime(1500); });
    // Should still be 1 — serialized payload unchanged.
    expect(api.updateDashboard).toHaveBeenCalledTimes(1);
  });
});
