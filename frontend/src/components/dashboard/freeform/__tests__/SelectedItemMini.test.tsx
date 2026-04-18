import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import SelectedItemMini from '../panels/SelectedItemMini';
import { useStore } from '../../../../store';

const baseDash = (floating: any[]) => ({
  schemaVersion: 'askdb/dashboard/v1',
  id: 'd1', name: 'X', archetype: 'analyst-pro',
  size: { mode: 'automatic' },
  tiledRoot: { id: 'root', type: 'container-vert', w: 100000, h: 100000, children: [] },
  floatingLayer: floating,
  worksheets: [], parameters: [], sets: [], actions: [],
});

describe('Plan 6c — SelectedItemMini', () => {
  beforeEach(() => {
    useStore.setState({
      analystProDashboard: baseDash([
        { id: 'z1', type: 'blank', floating: true, x: 10, y: 20, pxW: 300, pxH: 200, w: 0, h: 0, innerPadding: 8, outerPadding: 4 },
      ]) as any,
      analystProSelection: new Set<string>(),
    });
  });

  it('renders nothing when selection is empty', () => {
    const { container } = render(<SelectedItemMini />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when selection size > 1', () => {
    useStore.setState({ analystProSelection: new Set(['z1', 'z2']) });
    const { container } = render(<SelectedItemMini />);
    expect(container.firstChild).toBeNull();
  });

  it('shows Position / Size / Padding rows for the selected zone', () => {
    useStore.setState({ analystProSelection: new Set(['z1']) });
    render(<SelectedItemMini />);
    expect(screen.getByText(/Position/i)).toBeInTheDocument();
    expect(screen.getByText(/10.*20/)).toBeInTheDocument();
    expect(screen.getByText(/300.*200/)).toBeInTheDocument();
    expect(screen.getByText(/Padding/i)).toBeInTheDocument();
    expect(screen.getByText(/8.*\/.*4/)).toBeInTheDocument();
  });

  it('renders Background + Border rows with fallback labels when unset', () => {
    useStore.setState({ analystProSelection: new Set(['z1']) });
    render(<SelectedItemMini />);
    expect(screen.getByText(/Background/i)).toBeInTheDocument();
    expect(screen.getByText(/Border/i)).toBeInTheDocument();
  });
});
