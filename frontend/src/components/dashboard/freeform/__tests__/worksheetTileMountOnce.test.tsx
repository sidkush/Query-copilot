// Plan 7 T20 — Analyst Pro tiles must mount once and stay mounted.
//
// The Briefing / Workbench / Pitch layouts share DashboardTileCanvas
// which uses useViewportMount({ rootMargin: '300px' }) with default
// `once: false` — a scroll-out-of-view perf optimization that unmounts
// heavy Vega renders when the tile leaves the viewport. On Analyst Pro
// the dashboard canvas is tall (6–10k px) and the user expects every
// chart to stay readable as they scroll past; with the default
// behaviour, 30+ of 38 tiles show empty bands whenever the user isn't
// actively hovering them.
//
// Fix: AnalystProWorksheetTile must forward `mountOnce: true` into
// DashboardTileCanvas so the viewport-mount hook uses `once: true`.
//
// This test reproduces the bug by observing the prop chain: a rendered
// AnalystProWorksheetTile must pass `mountOnce: true` to its child
// DashboardTileCanvas.
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import AnalystProWorksheetTile from '../AnalystProWorksheetTile';

// Spy on DashboardTileCanvas: swap the module for a spy component that
// records the props it receives so we can assert on `mountOnce`.
const mockCanvasProps = vi.fn();
vi.mock('../../lib/DashboardTileCanvas', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    mockCanvasProps(props);
    return <div data-testid="mock-dashboard-tile-canvas" />;
  },
}));

// Also avoid pulling in VegaRenderer / api network.
vi.mock('../../../../api', () => ({ api: { executeUnderlying: vi.fn() } }));

describe('Plan 7 T20 — AnalystProWorksheetTile forwards mountOnce:true', () => {
  it('passes mountOnce=true to DashboardTileCanvas so tiles stay mounted after scroll', () => {
    mockCanvasProps.mockClear();
    const tile = {
      id: 't-1',
      title: 'Sample',
      sql: 'SELECT 1',
      chart_spec: {
        mark: 'bar',
        encoding: {
          x: { field: 'a', type: 'nominal' },
          y: { field: 'b', type: 'quantitative' },
        },
      },
    };
    render(<AnalystProWorksheetTile tile={tile} sheetId="t-1" />);
    expect(mockCanvasProps).toHaveBeenCalled();
    const props = mockCanvasProps.mock.calls[0][0] as { mountOnce?: boolean };
    expect(props.mountOnce).toBe(true);
  });
});
