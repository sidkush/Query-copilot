// frontend/src/components/dashboard/freeform/__tests__/FreeformCanvas.integration.test.tsx
/**
 * Integration tests for FreeformCanvas — Plan 2b T5: locked zone enforcement.
 *
 * These tests mount FreeformCanvas with a real Zustand store and verify that:
 *   A) Pointer-down + move on a locked floating zone does NOT update x/y in the store.
 *   B) Delete key removes unlocked zones in a mixed selection but leaves locked ones intact.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
