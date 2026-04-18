import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../../../../store';

describe('Plan 6c — sidebar tab + collapse slices', () => {
  beforeEach(() => {
    useStore.setState({
      analystProSidebarTab: 'dashboard',
      analystProSidebarCollapsed: new Set<string>(),
    });
  });

  it('default tab is "dashboard"', () => {
    expect(useStore.getState().analystProSidebarTab).toBe('dashboard');
  });

  it('setSidebarTabAnalystPro switches to "layout"', () => {
    useStore.getState().setSidebarTabAnalystPro('layout');
    expect(useStore.getState().analystProSidebarTab).toBe('layout');
  });

  it('setSidebarTabAnalystPro ignores invalid tab ids', () => {
    useStore.getState().setSidebarTabAnalystPro('garbage' as any);
    expect(useStore.getState().analystProSidebarTab).toBe('dashboard');
  });

  it('toggleSidebarSectionAnalystPro flips collapsed membership', () => {
    useStore.getState().toggleSidebarSectionAnalystPro('objects');
    expect(useStore.getState().analystProSidebarCollapsed.has('objects')).toBe(true);
    useStore.getState().toggleSidebarSectionAnalystPro('objects');
    expect(useStore.getState().analystProSidebarCollapsed.has('objects')).toBe(false);
  });

  it('toggleSidebarSectionAnalystPro produces a new Set reference each call (so React re-renders)', () => {
    const a = useStore.getState().analystProSidebarCollapsed;
    useStore.getState().toggleSidebarSectionAnalystPro('objects');
    const b = useStore.getState().analystProSidebarCollapsed;
    expect(a).not.toBe(b);
  });
});

describe('Plan 6c — insertObjectAnalystPro worksheetRef', () => {
  beforeEach(() => {
    useStore.setState({
      analystProDashboard: {
        schemaVersion: 'askdb/dashboard/v1',
        id: 'd1',
        name: 'Test',
        archetype: 'analyst-pro',
        size: { mode: 'automatic' },
        tiledRoot: { id: 'root', type: 'container-vert', w: 100000, h: 100000, children: [] },
        floatingLayer: [],
        worksheets: [{ id: 'w1', chartSpec: {} }],
        parameters: [],
        sets: [],
        actions: [],
      } as any,
      analystProSelection: new Set<string>(),
    });
  });

  it('inserts a floating worksheet zone when worksheetRef is passed', () => {
    useStore.getState().insertObjectAnalystPro({ type: 'worksheet', worksheetRef: 'w1', x: 50, y: 60 });
    const dash = useStore.getState().analystProDashboard!;
    const inserted = dash.floatingLayer[dash.floatingLayer.length - 1];
    expect(inserted.type).toBe('worksheet');
    expect((inserted as any).worksheetRef).toBe('w1');
    expect(inserted.x).toBe(50);
    expect(inserted.y).toBe(60);
    expect(inserted.floating).toBe(true);
  });

  it('falls back to object insertion when worksheetRef is absent', () => {
    useStore.getState().insertObjectAnalystPro({ type: 'blank', x: 0, y: 0 });
    const dash = useStore.getState().analystProDashboard!;
    const inserted = dash.floatingLayer[dash.floatingLayer.length - 1];
    expect(inserted.type).toBe('blank');
    expect((inserted as any).worksheetRef).toBeUndefined();
  });
});
