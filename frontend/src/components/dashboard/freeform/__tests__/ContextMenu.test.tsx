import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useStore } from '../../../../store';
import ContextMenu from '../ContextMenu';

function resetStore() {
  useStore.setState({
    analystProContextMenu: null,
    analystProDashboard: {
      schemaVersion: 'askdb/dashboard/v1', id: 'd', name: 't', archetype: 'analyst-pro',
      size: { mode: 'automatic' },
      tiledRoot: { id: 'root', type: 'container-vert', w: 100000, h: 100000, children: [] },
      floatingLayer: [], worksheets: [], parameters: [], sets: [], actions: [],
    },
  });
}

beforeEach(resetStore);

describe('<ContextMenu /> portal shell', () => {
  it('renders nothing while analystProContextMenu is null', () => {
    render(<ContextMenu />);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('renders the menu when the slice is populated', () => {
    render(<ContextMenu />);
    act(() => {
      useStore.setState({
        analystProContextMenu: {
          x: 100, y: 100, zoneId: null,
          items: [
            { kind: 'command', id: 'canvas.paste', label: 'Paste' },
          ],
        },
      });
    });
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByText('Paste')).toBeInTheDocument();
  });

  it('closes on Escape', () => {
    render(<ContextMenu />);
    act(() => {
      useStore.setState({
        analystProContextMenu: {
          x: 100, y: 100, zoneId: null,
          items: [{ kind: 'command', id: 'canvas.paste', label: 'Paste' }],
        },
      });
    });
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes on click-away (pointerdown outside the menu)', () => {
    render(<ContextMenu />);
    act(() => {
      useStore.setState({
        analystProContextMenu: {
          x: 100, y: 100, zoneId: null,
          items: [{ kind: 'command', id: 'canvas.paste', label: 'Paste' }],
        },
      });
    });
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

describe('<ContextMenu /> keyboard navigation', () => {
  it('focuses the first enabled item on open and moves with ArrowDown / ArrowUp', () => {
    render(<ContextMenu />);
    act(() => {
      useStore.setState({
        analystProContextMenu: {
          x: 100, y: 100, zoneId: null,
          items: [
            { kind: 'command', id: 'canvas.addText',  label: 'Add Text'  },
            { kind: 'command', id: 'canvas.addImage', label: 'Add Image' },
            { kind: 'command', id: 'canvas.addBlank', label: 'Add Blank' },
          ],
        },
      });
    });
    const menuEl = screen.getByRole('menu');
    expect(menuEl.querySelector('[data-focused="true"]')?.textContent).toBe('Add Text');
    fireEvent.keyDown(menuEl, { key: 'ArrowDown' });
    expect(menuEl.querySelector('[data-focused="true"]')?.textContent).toBe('Add Image');
    fireEvent.keyDown(menuEl, { key: 'ArrowDown' });
    expect(menuEl.querySelector('[data-focused="true"]')?.textContent).toBe('Add Blank');
    fireEvent.keyDown(menuEl, { key: 'ArrowDown' }); // wraps
    expect(menuEl.querySelector('[data-focused="true"]')?.textContent).toBe('Add Text');
    fireEvent.keyDown(menuEl, { key: 'ArrowUp' });   // wraps the other way
    expect(menuEl.querySelector('[data-focused="true"]')?.textContent).toBe('Add Blank');
  });

  it('skips separators and disabled items during ArrowDown navigation', () => {
    render(<ContextMenu />);
    act(() => {
      useStore.setState({
        analystProContextMenu: {
          x: 100, y: 100, zoneId: null,
          items: [
            { kind: 'command', id: 'canvas.addText',  label: 'Add Text'  },
            { kind: 'separator' },
            { kind: 'command', id: 'canvas.addImage', label: 'Add Image', disabled: true },
            { kind: 'command', id: 'canvas.addBlank', label: 'Add Blank' },
          ],
        },
      });
    });
    const menuEl = screen.getByRole('menu');
    expect(menuEl.querySelector('[data-focused="true"]')?.textContent).toBe('Add Text');
    fireEvent.keyDown(menuEl, { key: 'ArrowDown' });
    expect(menuEl.querySelector('[data-focused="true"]')?.textContent).toBe('Add Blank');
  });

  it('ArrowRight on a submenu opens a flyout; ArrowLeft closes it', () => {
    render(<ContextMenu />);
    act(() => {
      useStore.setState({
        analystProContextMenu: {
          x: 100, y: 100, zoneId: null,
          items: [
            {
              kind: 'submenu', id: 'fit', label: 'Fit',
              items: [
                { kind: 'command', id: 'setFitMode.fit', label: 'Fit' },
                { kind: 'command', id: 'setFitMode.fitWidth', label: 'Fit Width' },
              ],
            },
          ],
        },
      });
    });
    const menuEl = screen.getByRole('menu');
    fireEvent.keyDown(menuEl, { key: 'ArrowRight' });
    // Flyout should render with its own role=menu
    const menus = screen.getAllByRole('menu');
    expect(menus.length).toBe(2);
    fireEvent.keyDown(menus[1], { key: 'ArrowLeft' });
    expect(screen.getAllByRole('menu').length).toBe(1);
  });
});
