// frontend/src/components/dashboard/freeform/__tests__/FreeformCanvas.integration.test.tsx
/**
 * Integration tests for FreeformCanvas — Plan 2b T5: locked zone enforcement.
 *
 * These tests mount FreeformCanvas with a real Zustand store and verify that:
 *   A) Pointer-down + move on a locked floating zone does NOT update x/y in the store.
 *   B) Delete key removes unlocked zones in a mixed selection but leaves locked ones intact.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import FreeformCanvas from '../FreeformCanvas';
import type { Dashboard, FloatingZone } from '../lib/types';
import { useStore } from '../../../../store';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeFloatingZone(id: string, overrides: Partial<FloatingZone> = {}): FloatingZone {
  return {
    id,
    type: 'legend',
    floating: true,
    x: 100,
    y: 50,
    pxW: 200,
    pxH: 150,
    zIndex: 1,
    w: 0,
    h: 0,
    ...overrides,
  };
}

function makeBaseDashboard(floatingLayer: FloatingZone[]): Dashboard {
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
      children: [
        { id: 'kpi1', type: 'worksheet', w: 100000, h: 100000, worksheetRef: 'ws1' },
      ],
    },
    floatingLayer,
    worksheets: [],
    parameters: [],
    sets: [],
    actions: [],
  };
}

/** Dashboard with a single locked floating zone. */
function makeDashboardWithLockedFloatingZone(): Dashboard {
  return makeBaseDashboard([
    makeFloatingZone('locked-float', { x: 100, y: 50, locked: true }),
  ]);
}

/** Dashboard with one locked and one unlocked floating zone. */
function makeDashboardWithLockedAndUnlockedFloating(): Dashboard {
  return makeBaseDashboard([
    makeFloatingZone('locked-float', { x: 100, y: 50, locked: true }),
    makeFloatingZone('unlocked-float', { x: 400, y: 200, zIndex: 2 }),
  ]);
}

const renderLeaf = (zone: { id: string; type: string }) => (
  <div data-testid={`leaf-${zone.id}`}>{zone.id}</div>
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Reset Zustand store between tests to avoid cross-test contamination. */
function resetStore() {
  useStore.setState({
    analystProDashboard: null,
    analystProSelection: new Set(),
    analystProHistory: null,
    analystProDragState: null,
    analystProSnapEnabled: false, // disable snap for deterministic deltas
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// T7: drop-on-canvas wiring
// ---------------------------------------------------------------------------

const MIME = 'application/askdb-analyst-pro-object+json';

/**
 * Dispatch a synthetic drop event on `el` with proper clientX/clientY.
 * fireEvent.drop does not propagate MouseEvent init properties (clientX/Y)
 * to the DragEvent in jsdom, so we build a real DragEvent and dispatch it.
 */
function fireDrop(
  el: HTMLElement,
  typePayload: string | null,
  clientX = 100,
  clientY = 100,
) {
  const dataTransfer = {
    types: typePayload !== null ? [MIME] : [] as string[],
    getData: (mime: string) =>
      mime === MIME && typePayload !== null ? typePayload : '',
    dropEffect: 'none' as DataTransfer['dropEffect'],
  };

  // Build a native DragEvent with clientX/clientY in the init dict.
  const event = new MouseEvent('drop', {
    bubbles: true,
    cancelable: true,
    clientX,
    clientY,
  }) as unknown as DragEvent;

  // Attach our mock dataTransfer via defineProperty (read-only on real DragEvent).
  Object.defineProperty(event, 'dataTransfer', {
    value: dataTransfer,
    writable: false,
  });

  act(() => { el.dispatchEvent(event); });
}

describe('FreeformCanvas — Plan 2b T7: drop-on-canvas wiring', () => {
  beforeEach(() => {
    resetStore();
    // jsdom getBoundingClientRect returns {left:0, top:0} by default.
    // Explicitly mock to guarantee zero-origin so clientX=100 → x=100.
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 1280, height: 800,
      right: 1280, bottom: 800, x: 0, y: 0,
      toJSON: () => ({}),
    } as DOMRect);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it('drop text payload at (100,100) adds floating zone of type "text"', async () => {
    const dash = makeBaseDashboard([]);
    render(<FreeformCanvas dashboard={dash} renderLeaf={renderLeaf} />);

    const sheet = screen.getByTestId('freeform-sheet');
    fireDrop(sheet, JSON.stringify({ type: 'text' }), 100, 100);

    const state = useStore.getState().analystProDashboard;
    expect(state?.floatingLayer.length).toBe(1);
    const zone = state!.floatingLayer[0];
    expect(zone.type).toBe('text');
    // rect.left=0, rect.top=0, so x === clientX, y === clientY
    expect(zone.x).toBe(100);
    expect(zone.y).toBe(100);
  });

  it('drop with no payload is a no-op (floatingLayer stays empty)', async () => {
    const dash = makeBaseDashboard([]);
    render(<FreeformCanvas dashboard={dash} renderLeaf={renderLeaf} />);

    const sheet = screen.getByTestId('freeform-sheet');
    fireDrop(sheet, null, 100, 100);

    const state = useStore.getState().analystProDashboard;
    expect(state?.floatingLayer.length).toBe(0);
  });

  it('drop container-horz adds zone with one blank child', async () => {
    const dash = makeBaseDashboard([]);
    render(<FreeformCanvas dashboard={dash} renderLeaf={renderLeaf} />);

    const sheet = screen.getByTestId('freeform-sheet');
    fireDrop(sheet, JSON.stringify({ type: 'container-horz' }), 200, 150);

    const state = useStore.getState().analystProDashboard;
    expect(state?.floatingLayer.length).toBe(1);
    const zone = state!.floatingLayer[0] as any;
    expect(zone.type).toBe('container-horz');
    expect(Array.isArray(zone.children)).toBe(true);
    expect(zone.children.length).toBe(1);
    expect(zone.children[0].type).toBe('blank');
  });
});

describe('FreeformCanvas — Plan 2b T5: locked zone enforcement', () => {
  beforeEach(() => {
    resetStore();
  });

  afterEach(() => {
    cleanup();
  });

  it('locked floating zone does not drag on pointerdown+move', async () => {
    const dash = makeDashboardWithLockedFloatingZone();
    render(<FreeformCanvas dashboard={dash} renderLeaf={renderLeaf} />);

    // After mount the store should have the dashboard.
    const initialDash = useStore.getState().analystProDashboard;
    expect(initialDash).not.toBeNull();

    const floatingEl = screen.getByTestId('floating-zone-locked-float');
    expect(floatingEl).toBeInTheDocument();

    // Fire pointerdown on the locked floating zone.
    await act(async () => {
      fireEvent.pointerDown(floatingEl, {
        pointerId: 1,
        clientX: 200,
        clientY: 125,
        bubbles: true,
      });
    });

    // Fire a pointermove with a 50px horizontal delta.
    await act(async () => {
      fireEvent.pointerMove(window, {
        pointerId: 1,
        clientX: 250,
        clientY: 125,
        bubbles: true,
      });
    });

    await act(async () => {
      fireEvent.pointerUp(window, { pointerId: 1, bubbles: true });
    });

    // The locked zone's x/y must be unchanged in the store.
    const afterDash = useStore.getState().analystProDashboard;
    const lockedZone = afterDash?.floatingLayer.find((f) => f.id === 'locked-float');
    expect(lockedZone).toBeDefined();
    expect(lockedZone!.x).toBe(100);
    expect(lockedZone!.y).toBe(50);
  });

  it('Delete key skips locked zones in mixed selection', async () => {
    const dash = makeDashboardWithLockedAndUnlockedFloating();
    render(<FreeformCanvas dashboard={dash} renderLeaf={renderLeaf} />);

    // Both floating zones must be rendered.
    expect(screen.getByTestId('floating-zone-locked-float')).toBeInTheDocument();
    expect(screen.getByTestId('floating-zone-unlocked-float')).toBeInTheDocument();

    // Select both zones via the store directly.
    await act(async () => {
      useStore.getState().setAnalystProSelection(['locked-float', 'unlocked-float']);
    });

    expect(useStore.getState().analystProSelection.has('locked-float')).toBe(true);
    expect(useStore.getState().analystProSelection.has('unlocked-float')).toBe(true);

    // Fire Delete key at the document level (not in an input).
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Delete', bubbles: true });
    });

    // The unlocked zone should be gone; the locked one should remain.
    const afterDash = useStore.getState().analystProDashboard;
    const remainingIds = afterDash?.floatingLayer.map((f) => f.id) ?? [];
    expect(remainingIds).toContain('locked-float');
    expect(remainingIds).not.toContain('unlocked-float');
  });
});
