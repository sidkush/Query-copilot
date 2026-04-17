import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ZoneFrame from '../ZoneFrame';
import { useStore } from '../../../../store';

const baseZone = {
  id: 'z1',
  type: 'worksheet' as const,
  w: 100000,
  h: 100000,
  worksheetRef: 'ws1',
};

describe('ZoneFrame — base chrome', () => {
  beforeEach(() => {
    useStore.setState({
      analystProDashboard: {
        schemaVersion: 'askdb/dashboard/v1',
        id: 'd1',
        name: 'd',
        archetype: 'analyst-pro',
        size: { mode: 'automatic' },
        tiledRoot: { id: 'root', type: 'container-vert', w: 100000, h: 100000, children: [baseZone] },
        floatingLayer: [],
        worksheets: [],
        parameters: [],
        sets: [],
        actions: [],
      },
      analystProHoveredZoneId: null,
    });
  });

  it('renders the zone-frame wrapper with the zone data attribute', () => {
    render(
      <ZoneFrame zone={baseZone} resolved={{ x: 0, y: 0, width: 400, height: 300 }}>
        <div data-testid="inner">hi</div>
      </ZoneFrame>,
    );
    const frame = screen.getByTestId('zone-frame-z1');
    expect(frame).toHaveAttribute('data-zone-id', 'z1');
    expect(frame.classList.contains('analyst-pro-zone-frame')).toBe(true);
    expect(screen.getByTestId('inner')).toBeInTheDocument();
  });

  it('renders the title bar for worksheet / text / webpage', () => {
    for (const type of ['worksheet', 'text', 'webpage'] as const) {
      const { unmount } = render(
        <ZoneFrame
          zone={{ ...baseZone, type }}
          resolved={{ x: 0, y: 0, width: 400, height: 300 }}
        >
          <div />
        </ZoneFrame>,
      );
      expect(screen.getByTestId('zone-frame-z1-title')).toBeInTheDocument();
      unmount();
    }
  });

  it('hides the title bar for blank / image by default', () => {
    for (const type of ['blank', 'image'] as const) {
      const { unmount } = render(
        <ZoneFrame
          zone={{ ...baseZone, type }}
          resolved={{ x: 0, y: 0, width: 400, height: 300 }}
        >
          <div />
        </ZoneFrame>,
      );
      expect(screen.queryByTestId('zone-frame-z1-title')).toBeNull();
      unmount();
    }
  });

  it('writes hovered zone id into store on mouseenter / clears on mouseleave', () => {
    render(
      <ZoneFrame zone={baseZone} resolved={{ x: 0, y: 0, width: 400, height: 300 }}>
        <div />
      </ZoneFrame>,
    );
    const frame = screen.getByTestId('zone-frame-z1');
    fireEvent.mouseEnter(frame);
    expect(useStore.getState().analystProHoveredZoneId).toBe('z1');
    fireEvent.mouseLeave(frame);
    expect(useStore.getState().analystProHoveredZoneId).toBeNull();
  });

  it('renders 8 edge-hotzone pseudo-element carriers (n/s/e/w + 4 corners)', () => {
    render(
      <ZoneFrame zone={baseZone} resolved={{ x: 0, y: 0, width: 400, height: 300 }}>
        <div />
      </ZoneFrame>,
    );
    const frame = screen.getByTestId('zone-frame-z1');
    const edges = frame.querySelectorAll('.analyst-pro-zone-frame__edge');
    expect(edges.length).toBe(8);
  });

  it('shows zone.displayName when set, otherwise falls back to inferred label', () => {
    const { rerender } = render(
      <ZoneFrame
        zone={{ ...baseZone, displayName: 'Revenue chart' }}
        resolved={{ x: 0, y: 0, width: 400, height: 300 }}
      >
        <div />
      </ZoneFrame>,
    );
    expect(screen.getByTestId('zone-frame-z1-name')).toHaveTextContent('Revenue chart');

    rerender(
      <ZoneFrame
        zone={baseZone}
        resolved={{ x: 0, y: 0, width: 400, height: 300 }}
      >
        <div />
      </ZoneFrame>,
    );
    expect(screen.getByTestId('zone-frame-z1-name')).toHaveTextContent(/worksheet/i);
  });

  it('fires onContextMenu prop when the frame receives a right-click', () => {
    const onContextMenu = vi.fn();
    render(
      <ZoneFrame
        zone={baseZone}
        resolved={{ x: 0, y: 0, width: 400, height: 300 }}
        onContextMenu={onContextMenu}
      >
        <div />
      </ZoneFrame>,
    );
    fireEvent.contextMenu(screen.getByTestId('zone-frame-z1'));
    expect(onContextMenu).toHaveBeenCalledTimes(1);
    expect(onContextMenu.mock.calls[0][1]).toEqual(baseZone); // (event, zone) signature
  });
});

describe('ZoneFrame — inline rename', () => {
  beforeEach(() => {
    useStore.setState({
      analystProDashboard: {
        schemaVersion: 'askdb/dashboard/v1',
        id: 'd1',
        name: 'd',
        archetype: 'analyst-pro',
        size: { mode: 'automatic' },
        tiledRoot: { id: 'root', type: 'container-vert', w: 100000, h: 100000, children: [baseZone] },
        floatingLayer: [],
        worksheets: [],
        parameters: [],
        sets: [],
        actions: [],
      },
      analystProHoveredZoneId: null,
    });
  });

  it('double-click on name swaps to an input seeded with current label', () => {
    render(
      <ZoneFrame zone={baseZone} resolved={{ x: 0, y: 0, width: 400, height: 300 }}>
        <div />
      </ZoneFrame>,
    );
    fireEvent.doubleClick(screen.getByTestId('zone-frame-z1-name'));
    const input = screen.getByTestId('zone-frame-z1-name-input') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.value).toMatch(/worksheet/i);
  });

  it('Enter commits the new displayName via updateZoneAnalystPro', () => {
    render(
      <ZoneFrame zone={baseZone} resolved={{ x: 0, y: 0, width: 400, height: 300 }}>
        <div />
      </ZoneFrame>,
    );
    fireEvent.doubleClick(screen.getByTestId('zone-frame-z1-name'));
    const input = screen.getByTestId('zone-frame-z1-name-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Revenue chart' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    // editor closes
    expect(screen.queryByTestId('zone-frame-z1-name-input')).toBeNull();
    // store updated
    const tree = useStore.getState().analystProDashboard!.tiledRoot as { children: Array<{ id: string; displayName?: string }> };
    expect(tree.children[0].displayName).toBe('Revenue chart');
  });

  it('Esc cancels without writing to store', () => {
    render(
      <ZoneFrame zone={baseZone} resolved={{ x: 0, y: 0, width: 400, height: 300 }}>
        <div />
      </ZoneFrame>,
    );
    fireEvent.doubleClick(screen.getByTestId('zone-frame-z1-name'));
    const input = screen.getByTestId('zone-frame-z1-name-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'discarded' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(screen.queryByTestId('zone-frame-z1-name-input')).toBeNull();
    const tree = useStore.getState().analystProDashboard!.tiledRoot as { children: Array<{ id: string; displayName?: string }> };
    expect(tree.children[0].displayName).toBeUndefined();
  });

  it('empty-string commit clears displayName to fallback', () => {
    // Seed with a name.
    useStore.getState().updateZoneAnalystPro('z1', { displayName: 'Old name' });
    render(
      <ZoneFrame
        zone={{ ...baseZone, displayName: 'Old name' }}
        resolved={{ x: 0, y: 0, width: 400, height: 300 }}
      >
        <div />
      </ZoneFrame>,
    );
    fireEvent.doubleClick(screen.getByTestId('zone-frame-z1-name'));
    const input = screen.getByTestId('zone-frame-z1-name-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    const tree = useStore.getState().analystProDashboard!.tiledRoot as { children: Array<{ id: string; displayName?: string }> };
    expect(tree.children[0].displayName).toBeUndefined();
  });

  it('blur commits the new displayName', () => {
    render(
      <ZoneFrame zone={baseZone} resolved={{ x: 0, y: 0, width: 400, height: 300 }}>
        <div />
      </ZoneFrame>,
    );
    fireEvent.doubleClick(screen.getByTestId('zone-frame-z1-name'));
    const input = screen.getByTestId('zone-frame-z1-name-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Via blur' } });
    fireEvent.blur(input);

    expect(screen.queryByTestId('zone-frame-z1-name-input')).toBeNull();
    const tree = useStore.getState().analystProDashboard!.tiledRoot as { children: Array<{ id: string; displayName?: string }> };
    expect(tree.children[0].displayName).toBe('Via blur');
  });
});
