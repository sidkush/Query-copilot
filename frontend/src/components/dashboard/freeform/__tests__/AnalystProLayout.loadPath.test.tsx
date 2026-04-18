// Plan 7 T10 — AnalystProLayout load path prefers authored server tiledRoot
// over the legacy tile-array shim.
//
// Before: AnalystProLayout always ran legacyTilesToDashboard(tiles, …) on
// every mount, so a server-side refresh cycle wiped authored layouts.
// After: if `authoredLayout` prop carries a truthy tiledRoot, feed it
// straight to FreeformCanvas; else fall back to the legacy shim.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import AnalystProLayout from '../../modes/AnalystProLayout';
import { useStore } from '../../../../store';

// Mock api to avoid autosave network noise (Plan 7 T9 hook is mounted).
vi.mock('../../../../api', () => ({
  updateDashboard: vi.fn(() => Promise.resolve({})),
}));

function makeAuthoredDashboard() {
  return {
    schemaVersion: 'askdb/dashboard/v1',
    id: 'd1',
    name: 'Authored',
    archetype: 'analyst-pro',
    size: { mode: 'fixed', width: 1440, height: 900, preset: 'custom' },
    tiledRoot: {
      id: 'server-root',
      type: 'container-vert',
      w: 100000,
      h: 100000,
      children: [
        {
          id: 'server-leaf-1',
          type: 'worksheet',
          w: 100000,
          h: 50000,
          worksheetRef: 'ws1',
          displayName: 'Server-authored leaf 1',
        },
        {
          id: 'server-leaf-2',
          type: 'worksheet',
          w: 100000,
          h: 50000,
          worksheetRef: 'ws2',
          displayName: 'Server-authored leaf 2',
        },
      ],
    },
    floatingLayer: [],
    worksheets: [],
    parameters: [],
    sets: [],
    actions: [],
  };
}

describe('Plan 7 T10 — AnalystProLayout load path', () => {
  beforeEach(() => {
    // Reset store so the FreeformCanvas seeding effect reads the new prop.
    useStore.setState({ analystProDashboard: null, analystProHistoryStack: [] });
  });

  it('uses authoredLayout.tiledRoot when prop carries a truthy tiledRoot', () => {
    const authored = makeAuthoredDashboard();
    render(
      <AnalystProLayout
        tiles={[{ id: 'IGNORE_ME', title: 'Legacy shim leaf', chart_spec: {} }]}
        dashboardId="d1"
        dashboardName="Authored"
        authoredLayout={authored}
      />
    );
    // The server-authored leaves should appear in the DOM; the legacy tile
    // id (IGNORE_ME) should not.
    expect(screen.getByTestId('zone-frame-server-leaf-1')).toBeInTheDocument();
    expect(screen.getByTestId('zone-frame-server-leaf-2')).toBeInTheDocument();
    expect(screen.queryByTestId('zone-frame-IGNORE_ME')).toBeNull();
  });

  it('falls back to legacyTilesToDashboard when authoredLayout is absent', () => {
    render(
      <AnalystProLayout
        tiles={[{ id: 'legacy-a', title: 'Legacy A', chart_spec: {} }]}
        dashboardId="d-legacy"
        dashboardName="Legacy"
      />
    );
    expect(screen.getByTestId('zone-frame-legacy-a')).toBeInTheDocument();
  });

  it('falls back to legacyTilesToDashboard when authoredLayout.tiledRoot is null', () => {
    const blankServer = { ...makeAuthoredDashboard(), tiledRoot: null };
    render(
      <AnalystProLayout
        tiles={[{ id: 'legacy-b', title: 'Legacy B', chart_spec: {} }]}
        dashboardId="d-legacy-2"
        dashboardName="Legacy2"
        authoredLayout={blankServer as unknown as ReturnType<typeof makeAuthoredDashboard>}
      />
    );
    expect(screen.getByTestId('zone-frame-legacy-b')).toBeInTheDocument();
  });
});
