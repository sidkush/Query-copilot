import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import LayoutTreePanel from '../panels/LayoutTreePanel';
import { useStore } from '../../../../store';

function seedStore(dashboard: unknown) {
  useStore.setState({
    analystProDashboard: dashboard,
    analystProSelection: new Set(),
  });
}

function makeDashboard() {
  return {
    schemaVersion: 'askdb/dashboard/v1',
    id: 'd1',
    name: 'Test',
    archetype: 'analyst-pro',
    size: { mode: 'automatic' },
    tiledRoot: {
      id: 'root',
      type: 'container-horz',
      w: 100000,
      h: 100000,
      children: [
        { id: 'a', type: 'text', w: 50000, h: 100000 },
        { id: 'b', type: 'worksheet', w: 50000, h: 100000 },
      ],
    },
    floatingLayer: [
      {
        id: 'f1',
        type: 'image',
        floating: true,
        x: 10,
        y: 10,
        pxW: 100,
        pxH: 100,
        zIndex: 1,
        w: 0,
        h: 0,
        locked: true,
      },
    ],
    worksheets: [],
    parameters: [],
    sets: [],
    actions: [],
  };
}

describe('LayoutTreePanel', () => {
  beforeEach(() => {
    useStore.setState({
      analystProDashboard: null,
      analystProSelection: new Set(),
    });
  });

  it('renders Tiled + Floating sections', () => {
    seedStore(makeDashboard());
    render(<LayoutTreePanel />);
    expect(screen.getByText(/Tiled/)).toBeInTheDocument();
    expect(screen.getByText(/Floating/)).toBeInTheDocument();
  });

  it('renders all zones including nested', () => {
    seedStore(makeDashboard());
    render(<LayoutTreePanel />);
    // Root container + 2 leaf children + 1 floating = 4 tree rows (role="button")
    const rows = screen.getAllByRole('button');
    expect(rows.length).toBeGreaterThanOrEqual(4);
  });

  it('click selects the zone', () => {
    seedStore(makeDashboard());
    render(<LayoutTreePanel />);
    const row = screen.getAllByRole('button').find((el) => el.textContent?.includes('Text'));
    fireEvent.click(row!);
    expect(useStore.getState().analystProSelection.has('a')).toBe(true);
  });

  it('double-click enables rename, Enter commits new displayName', () => {
    seedStore(makeDashboard());
    render(<LayoutTreePanel />);
    const row = screen.getAllByRole('button').find((el) => el.textContent?.includes('Text'));
    fireEvent.doubleClick(row!);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'My Title' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    const dash = useStore.getState().analystProDashboard as ReturnType<typeof makeDashboard>;
    const zone = dash.tiledRoot.children.find((c) => c.id === 'a');
    expect((zone as { displayName?: string }).displayName).toBe('My Title');
  });

  it('Escape cancels rename without writing displayName', () => {
    seedStore(makeDashboard());
    render(<LayoutTreePanel />);
    const row = screen.getAllByRole('button').find((el) => el.textContent?.includes('Text'));
    fireEvent.doubleClick(row!);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Should Not Save' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    const dash = useStore.getState().analystProDashboard as ReturnType<typeof makeDashboard>;
    const zone = dash.tiledRoot.children.find((c) => c.id === 'a');
    expect((zone as { displayName?: string }).displayName).toBeUndefined();
  });

  it('locked zone shows the lock icon', () => {
    seedStore(makeDashboard());
    render(<LayoutTreePanel />);
    expect(screen.getByLabelText('Locked')).toBeInTheDocument();
  });
});

describe('LayoutTreePanel — visibility decorations (Plan 4d T6)', () => {
  function seedVisDashboard(paramValue: string) {
    useStore.setState({
      analystProDashboard: {
        schemaVersion: 'askdb/dashboard/v1',
        id: 'd1',
        name: 'Test',
        archetype: 'analyst-pro',
        size: { mode: 'automatic' },
        tiledRoot: {
          id: 'root',
          type: 'container-vert',
          w: 100000,
          h: 100000,
          children: [
            { id: 'plain', type: 'blank', w: 100000, h: 100000 },
            {
              id: 'gated',
              type: 'blank',
              w: 100000,
              h: 100000,
              visibilityRule: { kind: 'parameterEquals', parameterId: 'p1', value: 'priority' },
            },
          ],
        },
        floatingLayer: [],
        worksheets: [],
        parameters: [
          { id: 'p1', name: 'view', type: 'string', value: paramValue, domain: { kind: 'free' }, createdAt: '' },
        ],
        sets: [],
        actions: [],
      },
      analystProSelection: new Set(),
      analystProSheetFilters: {},
    });
  }

  it('does not show a glyph for a zone without a rule', () => {
    seedVisDashboard('normal');
    render(<LayoutTreePanel />);
    expect(screen.queryByTestId('visibility-glyph-plain')).not.toBeInTheDocument();
  });

  it('shows a glyph for a zone with a non-always rule', () => {
    seedVisDashboard('normal');
    render(<LayoutTreePanel />);
    expect(screen.getByTestId('visibility-glyph-gated')).toBeInTheDocument();
  });

  it('marks the row hidden when the rule currently evaluates to false', () => {
    seedVisDashboard('normal');
    render(<LayoutTreePanel />);
    const row = screen.getByTestId('visibility-glyph-gated').closest('[role="button"]') as HTMLElement;
    expect(row).not.toBeNull();
    expect(row.getAttribute('data-visibility-hidden')).toBe('true');
  });

  it('does not mark the row hidden when the rule evaluates to true', () => {
    seedVisDashboard('priority');
    render(<LayoutTreePanel />);
    const row = screen.getByTestId('visibility-glyph-gated').closest('[role="button"]') as HTMLElement;
    expect(row.getAttribute('data-visibility-hidden')).toBe('false');
  });
});
