// frontend/src/components/dashboard/freeform/__tests__/FreeformCanvas.test.tsx
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import FreeformCanvas from '../FreeformCanvas';
import type { Dashboard } from '../lib/types';

// jsdom lacks ResizeObserver; stub it.
beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as typeof ResizeObserver;
});

const sampleDashboard: Dashboard = {
  schemaVersion: 'askdb/dashboard/v1',
  id: 'd1',
  name: 'Test',
  archetype: 'analyst-pro',
  size: { mode: 'fixed', width: 1000, height: 500, preset: 'custom' },
  tiledRoot: {
    id: 'root',
    type: 'container-vert',
    w: 100000,
    h: 100000,
    children: [
      {
        id: 'kpi-row',
        type: 'container-horz',
        w: 100000,
        h: 50000,
        children: [
          { id: 'kpi1', type: 'worksheet', w: 50000, h: 100000, worksheetRef: 'ws1' },
          { id: 'kpi2', type: 'worksheet', w: 50000, h: 100000, worksheetRef: 'ws2' },
        ],
      },
      { id: 'chart', type: 'worksheet', w: 100000, h: 50000, worksheetRef: 'ws3' },
    ],
  },
  floatingLayer: [
    { id: 'f1', type: 'legend', floating: true, x: 100, y: 50, pxW: 200, pxH: 150, zIndex: 5, w: 0, h: 0 },
  ],
  worksheets: [],
  parameters: [],
  sets: [],
  actions: [],
};

const renderLeaf = (zone: { id: string; type: string }) => (
  <div data-testid={`leaf-${zone.id}`} data-leaf-type={zone.type}>
    {zone.id}
  </div>
);

describe('FreeformCanvas', () => {
  it('renders the sheet at the fixed canvas size', () => {
    render(<FreeformCanvas dashboard={sampleDashboard} renderLeaf={renderLeaf} />);
    const sheet = screen.getByTestId('freeform-sheet');
    expect(sheet.style.width).toBe('1000px');
    expect(sheet.style.height).toBe('500px');
  });

  it('renders the tiled containers + leaves', () => {
    render(<FreeformCanvas dashboard={sampleDashboard} renderLeaf={renderLeaf} />);
    expect(screen.getByTestId('tiled-container-root')).toBeInTheDocument();
    expect(screen.getByTestId('tiled-container-kpi-row')).toBeInTheDocument();
    expect(screen.getByTestId('tiled-leaf-kpi1')).toBeInTheDocument();
    expect(screen.getByTestId('tiled-leaf-kpi2')).toBeInTheDocument();
    expect(screen.getByTestId('tiled-leaf-chart')).toBeInTheDocument();
  });

  it('renders the floating layer', () => {
    render(<FreeformCanvas dashboard={sampleDashboard} renderLeaf={renderLeaf} />);
    const f = screen.getByTestId('floating-zone-f1');
    expect(f.style.left).toBe('100px');
    expect(f.style.top).toBe('50px');
    expect(f.style.width).toBe('200px');
    expect(f.style.height).toBe('150px');
  });

  it('calls renderLeaf for each leaf zone', () => {
    const spy = vi.fn(renderLeaf);
    render(<FreeformCanvas dashboard={sampleDashboard} renderLeaf={spy} />);
    const ids = spy.mock.calls.map((c) => (c[0] as { id: string }).id).sort();
    expect(ids).toEqual(['chart', 'f1', 'kpi1', 'kpi2']);
  });
});
