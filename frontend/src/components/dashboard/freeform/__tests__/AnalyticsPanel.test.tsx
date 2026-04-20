import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AnalystProSidebar from '../panels/AnalystProSidebar';
import { useStore } from '../../../../store';

describe('Plan 9a T9 — Analytics sidebar tab', () => {
  beforeEach(() => {
    useStore.setState({
      analystProSidebarTab: 'dashboard',
      analystProSidebarCollapsed: new Set<string>(),
      analystProSelection: new Set<string>(),
      analystProDashboard: {
        schemaVersion: 'askdb/dashboard/v1',
        id: 'd1',
        name: 'X',
        archetype: 'analyst-pro',
        size: { mode: 'automatic' },
        tiledRoot: { id: 'root', type: 'container-vert', w: 100000, h: 100000, children: [] },
        floatingLayer: [],
        worksheets: [{ id: 'sheetA', chartSpec: {} }],
        parameters: [],
        sets: [],
        actions: [],
      } as any,
    });
  });

  it('tablist is exactly [Dashboard, Layout, Analytics]', () => {
    render(<AnalystProSidebar />);
    const tabs = screen.getAllByRole('tab').map((t) => t.textContent);
    expect(tabs).toEqual(['Dashboard', 'Layout', 'Analytics']);
  });

  it('clicking Analytics tab flips analystProSidebarTab state', () => {
    render(<AnalystProSidebar />);
    fireEvent.click(screen.getByRole('tab', { name: 'Analytics' }));
    expect(useStore.getState().analystProSidebarTab).toBe('analytics');
  });

  it('Analytics tab lists catalogue items per Build_Tableau §XIII.1', () => {
    useStore.setState({ analystProSidebarTab: 'analytics' });
    render(<AnalystProSidebar />);
    for (const label of [
      'Constant Line',
      'Average Line',
      'Median',
      'Reference Line',
      'Reference Band',
      'Reference Distribution',
      'Totals',
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('future-phase items (Trend, Forecast, Cluster, Box Plot) are listed but disabled', () => {
    useStore.setState({ analystProSidebarTab: 'analytics' });
    render(<AnalystProSidebar />);
    for (const label of ['Trend Line', 'Forecast', 'Cluster', 'Box Plot']) {
      const el = screen.getByText(label).closest('[data-analytics-item]');
      expect(el).not.toBeNull();
      expect(el!.getAttribute('data-disabled')).toBe('true');
    }
  });
});
