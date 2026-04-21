import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ZoneFrame from '../ZoneFrame';
import { useStore } from '../../../../store';

// Plan 7 T1 — worksheet tiles no longer show a frame title bar by default
// (Vega chart owns its title). These tests exercise the title-shown path,
// so pass `showTitle: true` explicitly to force the old behaviour.
const baseZone = {
  id: 'z1',
  type: 'worksheet' as const,
  w: 100000,
  h: 100000,
  worksheetRef: 'ws1',
  showTitle: true,
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
      // baseZone carries `showTitle: true` for Plan 7 T1 coverage; strip it here
      // so the default-hidden branch is exercised.
      const { showTitle: _showTitle, ...noTitleBase } = baseZone;
      void _showTitle;
      const { unmount } = render(
        <ZoneFrame
          zone={{ ...noTitleBase, type }}
          resolved={{ x: 0, y: 0, width: 400, height: 300 }}
        >
          <div />
        </ZoneFrame>,
      );
      expect(screen.queryByTestId('zone-frame-z1-title')).toBeNull();
      unmount();
    }
  });

  it('hides the title bar for worksheet by default (Plan 7 T1)', () => {
    // baseZone has explicit showTitle:true; strip it so this test sees the default.
    const { showTitle: _showTitle, ...noTitleBase } = baseZone;
    void _showTitle;
    render(
      <ZoneFrame
        zone={noTitleBase}
        resolved={{ x: 0, y: 0, width: 400, height: 300 }}
      >
        <div />
      </ZoneFrame>,
    );
    expect(screen.queryByTestId('zone-frame-z1-title')).toBeNull();
  });

  it('Plan 8 T26 — worksheet zones still expose ⋯/⛶/× actions when title bar is hidden', () => {
    // After Plan 7 T1 worksheet tiles render without a title bar by default.
    // The action cluster (menu / fit / close) previously lived INSIDE that
    // hidden title div, so it disappeared too — the user lost every entry
    // point to Fit, close, and more-menu on a worksheet tile. The action
    // cluster must render regardless of title visibility (hover-reveal CSS
    // is responsible for keeping it out of the way visually).
    const { showTitle: _showTitle, ...noTitleBase } = baseZone;
    void _showTitle;
    render(
      <ZoneFrame
        zone={noTitleBase}
        resolved={{ x: 0, y: 0, width: 400, height: 300 }}
      >
        <div />
      </ZoneFrame>,
    );
    expect(screen.queryByTestId('zone-frame-z1-title')).toBeNull();
    // Actions ARE present even though title is not.
    expect(screen.getByTestId('zone-frame-z1-actions')).toBeInTheDocument();
    expect(screen.getByTestId('zone-frame-z1-action-menu')).toBeInTheDocument();
    expect(screen.getByTestId('zone-frame-z1-action-fit')).toBeInTheDocument();
    expect(screen.getByTestId('zone-frame-z1-action-close')).toBeInTheDocument();
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

describe('ZoneFrame — quick-action buttons', () => {
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

  it('renders three quick-action buttons in the title bar', () => {
    render(
      <ZoneFrame zone={baseZone} resolved={{ x: 0, y: 0, width: 400, height: 300 }}>
        <div />
      </ZoneFrame>,
    );
    expect(screen.getByTestId('zone-frame-z1-action-menu')).toBeInTheDocument();
    expect(screen.getByTestId('zone-frame-z1-action-fit')).toBeInTheDocument();
    expect(screen.getByTestId('zone-frame-z1-action-close')).toBeInTheDocument();
  });

  it('menu button fires onContextMenu AND onQuickAction("menu", …)', () => {
    const onContextMenu = vi.fn();
    const onQuickAction = vi.fn();
    render(
      <ZoneFrame
        zone={baseZone}
        resolved={{ x: 0, y: 0, width: 400, height: 300 }}
        onContextMenu={onContextMenu}
        onQuickAction={onQuickAction}
      >
        <div />
      </ZoneFrame>,
    );
    fireEvent.click(screen.getByTestId('zone-frame-z1-action-menu'));
    expect(onContextMenu).toHaveBeenCalledTimes(1);
    expect(onQuickAction).toHaveBeenCalledWith('menu', baseZone, expect.anything());
  });

  it('fit button fires onQuickAction("fit", …) only', () => {
    const onContextMenu = vi.fn();
    const onQuickAction = vi.fn();
    render(
      <ZoneFrame
        zone={baseZone}
        resolved={{ x: 0, y: 0, width: 400, height: 300 }}
        onContextMenu={onContextMenu}
        onQuickAction={onQuickAction}
      >
        <div />
      </ZoneFrame>,
    );
    fireEvent.click(screen.getByTestId('zone-frame-z1-action-fit'));
    expect(onContextMenu).not.toHaveBeenCalled();
    expect(onQuickAction).toHaveBeenCalledWith('fit', baseZone, expect.anything());
  });

  it('close button fires onQuickAction("close", …)', () => {
    const onQuickAction = vi.fn();
    render(
      <ZoneFrame
        zone={baseZone}
        resolved={{ x: 0, y: 0, width: 400, height: 300 }}
        onQuickAction={onQuickAction}
      >
        <div />
      </ZoneFrame>,
    );
    fireEvent.click(screen.getByTestId('zone-frame-z1-action-close'));
    expect(onQuickAction).toHaveBeenCalledWith('close', baseZone, expect.anything());
  });

  it('clicking a quick-action button does not toggle inline rename', () => {
    render(
      <ZoneFrame zone={baseZone} resolved={{ x: 0, y: 0, width: 400, height: 300 }}>
        <div />
      </ZoneFrame>,
    );
    fireEvent.click(screen.getByTestId('zone-frame-z1-action-menu'));
    expect(screen.queryByTestId('zone-frame-z1-name-input')).toBeNull();
  });
});

describe('ZoneFrame — keyboard affordances', () => {
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

  it('frame is tabbable (tabIndex=0)', () => {
    render(
      <ZoneFrame zone={baseZone} resolved={{ x: 0, y: 0, width: 400, height: 300 }}>
        <div />
      </ZoneFrame>,
    );
    expect(screen.getByTestId('zone-frame-z1')).toHaveAttribute('tabindex', '0');
  });

  it('F2 opens the inline rename editor', () => {
    render(
      <ZoneFrame zone={baseZone} resolved={{ x: 0, y: 0, width: 400, height: 300 }}>
        <div />
      </ZoneFrame>,
    );
    const frame = screen.getByTestId('zone-frame-z1');
    frame.focus();
    fireEvent.keyDown(frame, { key: 'F2' });
    expect(screen.getByTestId('zone-frame-z1-name-input')).toBeInTheDocument();
  });

  it('Enter (when not editing) fires onContextMenu', () => {
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
    const frame = screen.getByTestId('zone-frame-z1');
    frame.focus();
    fireEvent.keyDown(frame, { key: 'Enter' });
    expect(onContextMenu).toHaveBeenCalledTimes(1);
  });

  it('Enter inside the rename input commits (does not bubble to frame)', () => {
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
    fireEvent.doubleClick(screen.getByTestId('zone-frame-z1-name'));
    const input = screen.getByTestId('zone-frame-z1-name-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Named via F2' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onContextMenu).not.toHaveBeenCalled();
    const tree = useStore.getState().analystProDashboard!.tiledRoot as { children: Array<{ id: string; displayName?: string }> };
    expect(tree.children[0].displayName).toBe('Named via F2');
  });

  it('applies inline background, border, and padding from the zone fields (Plan 5d T6)', () => {
    const zone = {
      id: 'z1',
      type: 'worksheet' as const,
      worksheetRef: 'z1',
      w: 100000,
      h: 100000,
      background: { color: '#112233', opacity: 0.5 },
      border: { weight: [1, 0, 2, 0], color: '#abcdef', style: 'solid' as const },
      innerPadding: 8,
      outerPadding: 4,
    };
    render(
      <ZoneFrame
        zone={zone}
        resolved={{ x: 0, y: 0, width: 400, height: 300 }}
        onContextMenu={() => {}}
        onQuickAction={() => {}}
      >
        <div data-testid="body">body</div>
      </ZoneFrame>,
    );
    const frame = screen.getByTestId('zone-frame-z1') as HTMLElement;
    const style = frame.getAttribute('style') ?? '';
    expect(style).toMatch(/background/);
    expect(style).toMatch(/border-left-width:\s*1px/);
    expect(style).toMatch(/border-top-width:\s*2px/);
    expect(style).toMatch(/padding:\s*8px/);
    expect(style).toMatch(/margin:\s*4px/);
  });

  it('hides title bar when showTitle === false even for a worksheet (Plan 5d T6)', () => {
    const zone = {
      id: 'z2',
      type: 'worksheet' as const,
      worksheetRef: 'z2',
      w: 100000,
      h: 100000,
      showTitle: false,
    };
    render(
      <ZoneFrame
        zone={zone}
        resolved={{ x: 0, y: 0, width: 400, height: 300 }}
        onContextMenu={() => {}}
        onQuickAction={() => {}}
      >
        <div data-testid="body">body</div>
      </ZoneFrame>,
    );
    expect(screen.queryByTestId('zone-frame-z2-title')).toBeNull();
  });
});

// Plan 10a T6 — ZoneFrame consults FormatResolver for StyledBox-layer styles.
// Sheet-level rules apply to every zone whose worksheetRef matches; mark-level
// rules (selector.markId === zone.id) override sheet-level. Fallback to the
// legacy `zone.background` fields is preserved when no rule is in play.
describe('ZoneFrame — Plan 10a StyledBox resolver integration', () => {
  beforeEach(() => {
    useStore.setState({ analystProFormatRules: [] });
  });

  it('applies resolved background-color from sheet-level rule', () => {
    useStore.setState({
      analystProFormatRules: [
        {
          selector: { kind: 'sheet', sheetId: 'sheetA' },
          properties: { 'background-color': '#abcdef' },
        },
      ],
    });
    const zone = {
      id: 'z10a1',
      type: 'worksheet' as const,
      worksheetRef: 'sheetA',
      w: 100000,
      h: 100000,
    };
    render(
      <ZoneFrame zone={zone} resolved={{ x: 0, y: 0, width: 400, height: 300 }}>
        <div />
      </ZoneFrame>,
    );
    const frame = screen.getByTestId('zone-frame-z10a1') as HTMLElement;
    // jsdom serialises #abcdef → rgb(171, 205, 239). Assert via the DOM's own
    // normalised form on style.background (which covers the shorthand set).
    expect(frame.style.background).toContain('rgb(171, 205, 239)');
  });

  it('mark-level rule overrides sheet-level rule', () => {
    useStore.setState({
      analystProFormatRules: [
        {
          selector: { kind: 'sheet', sheetId: 'sheetA' },
          properties: { 'background-color': '#abcdef' },
        },
        {
          selector: { kind: 'mark', markId: 'z10a2' },
          properties: { 'background-color': '#123456' },
        },
      ],
    });
    const zone = {
      id: 'z10a2',
      type: 'worksheet' as const,
      worksheetRef: 'sheetA',
      w: 100000,
      h: 100000,
    };
    render(
      <ZoneFrame zone={zone} resolved={{ x: 0, y: 0, width: 400, height: 300 }}>
        <div />
      </ZoneFrame>,
    );
    const frame = screen.getByTestId('zone-frame-z10a2') as HTMLElement;
    // #123456 → rgb(18, 52, 86); #abcdef → rgb(171, 205, 239).
    expect(frame.style.background).toContain('rgb(18, 52, 86)');
    expect(frame.style.background).not.toContain('rgb(171, 205, 239)');
  });
});
