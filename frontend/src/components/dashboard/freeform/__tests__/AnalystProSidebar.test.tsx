import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import AnalystProSidebar from '../panels/AnalystProSidebar';
import { useStore } from '../../../../store';

describe('Plan 6c — AnalystProSidebar', () => {
  beforeEach(() => {
    useStore.setState({
      analystProSidebarTab: 'dashboard',
      analystProSidebarCollapsed: new Set<string>(),
      analystProSelection: new Set<string>(),
      analystProDashboard: {
        schemaVersion: 'askdb/dashboard/v1',
        id: 'd1', name: 'X', archetype: 'analyst-pro',
        size: { mode: 'automatic' },
        tiledRoot: { id: 'root', type: 'container-vert', w: 100000, h: 100000, children: [] },
        floatingLayer: [],
        worksheets: [{ id: 'sheetA', chartSpec: {} }],
        parameters: [], sets: [], actions: [],
      } as any,
    });
  });

  it('tablist has three tabs with role=tab (Plan 9a T9 added Analytics)', () => {
    render(<AnalystProSidebar />);
    const list = screen.getByRole('tablist');
    const tabs = within(list).getAllByRole('tab');
    expect(tabs).toHaveLength(3);
    expect(tabs.map((t) => t.textContent)).toEqual(['Dashboard', 'Layout', 'Analytics']);
  });

  it('Dashboard tab aria-selected=true by default, Layout aria-selected=false', () => {
    render(<AnalystProSidebar />);
    expect(screen.getByRole('tab', { name: 'Dashboard' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Layout'    })).toHaveAttribute('aria-selected', 'false');
  });

  it('clicking Layout tab updates the store AND aria-selected flips', () => {
    render(<AnalystProSidebar />);
    fireEvent.click(screen.getByRole('tab', { name: 'Layout' }));
    expect(useStore.getState().analystProSidebarTab).toBe('layout');
    expect(screen.getByRole('tab', { name: 'Layout'    })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Dashboard' })).toHaveAttribute('aria-selected', 'false');
  });

  it('Dashboard tab mounts Objects, Sheets, Sets, Parameters sections', () => {
    render(<AnalystProSidebar />);
    expect(screen.getByTestId('sidebar-section-objects')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-section-sheets')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-section-sets')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-section-parameters')).toBeInTheDocument();
  });

  it('Layout tab mounts Item Hierarchy + Selected Item sections', () => {
    useStore.setState({ analystProSidebarTab: 'layout' });
    render(<AnalystProSidebar />);
    expect(screen.getByTestId('sidebar-section-hierarchy')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-section-selected')).toBeInTheDocument();
  });

  it('inactive tab panel is not in the DOM', () => {
    render(<AnalystProSidebar />);
    expect(screen.queryByTestId('sidebar-section-hierarchy')).not.toBeInTheDocument();
  });

  it('tabpanel element has role=tabpanel and references the active tab via aria-labelledby', () => {
    render(<AnalystProSidebar />);
    const panel = screen.getByRole('tabpanel');
    const labelId = panel.getAttribute('aria-labelledby');
    expect(labelId).toBeTruthy();
    const tab = screen.getByRole('tab', { name: 'Dashboard' });
    expect(tab.id).toBe(labelId);
  });
});
