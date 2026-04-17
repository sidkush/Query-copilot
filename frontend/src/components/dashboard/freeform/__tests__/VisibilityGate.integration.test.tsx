import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useStore } from '../../../../store';
import ZoneRenderer from '../ZoneRenderer';
import FloatingLayer from '../FloatingLayer';
import FreeformCanvas from '../FreeformCanvas';
import type { Zone, FloatingZone, ResolvedZone } from '../lib/types';

function resolvedMapOf(zones: Zone[]): Map<string, ResolvedZone> {
  const m = new Map<string, ResolvedZone>();
  zones.forEach((z, i) =>
    m.set(z.id, { zone: z, x: 0, y: i * 100, width: 200, height: 100, depth: 0 }),
  );
  return m;
}

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
      worksheets: [],
      parameters: [
        { id: 'p1', name: 'show', type: 'boolean', value: false, domain: { kind: 'free' }, createdAt: '' },
      ],
      sets: [
        { id: 's1', name: 'Top', dimension: 'region', members: [], createdAt: '' },
      ],
      actions: [],
    },
    analystProSheetFilters: {},
  });
});

describe('ZoneRenderer visibility gate', () => {
  it('renders a leaf when no rule is set', () => {
    const root: Zone = {
      id: 'root',
      type: 'container-vert',
      w: 100000,
      h: 100000,
      children: [{ id: 'a', type: 'blank', w: 100000, h: 100000 }],
    };
    const map = resolvedMapOf([root, ...root.children]);
    render(
      <ZoneRenderer
        root={root}
        resolvedMap={map}
        renderLeaf={(z) => <div data-testid={`leaf-${z.id}`}>{z.id}</div>}
      />,
    );
    expect(screen.getByTestId('leaf-a')).toBeInTheDocument();
  });

  it('skips a leaf with parameterEquals=false rule', () => {
    const root: Zone = {
      id: 'root',
      type: 'container-vert',
      w: 100000,
      h: 100000,
      children: [
        {
          id: 'a',
          type: 'blank',
          w: 100000,
          h: 100000,
          visibilityRule: { kind: 'parameterEquals', parameterId: 'p1', value: true },
        },
      ],
    };
    const map = resolvedMapOf([root, ...root.children]);
    render(
      <ZoneRenderer
        root={root}
        resolvedMap={map}
        renderLeaf={(z) => <div data-testid={`leaf-${z.id}`}>{z.id}</div>}
      />,
    );
    expect(screen.queryByTestId('leaf-a')).not.toBeInTheDocument();
  });

  it('re-renders the leaf when the parameter flips to matching value', () => {
    const root: Zone = {
      id: 'root',
      type: 'container-vert',
      w: 100000,
      h: 100000,
      children: [
        {
          id: 'a',
          type: 'blank',
          w: 100000,
          h: 100000,
          visibilityRule: { kind: 'parameterEquals', parameterId: 'p1', value: true },
        },
      ],
    };
    const map = resolvedMapOf([root, ...root.children]);
    render(
      <ZoneRenderer
        root={root}
        resolvedMap={map}
        renderLeaf={(z) => <div data-testid={`leaf-${z.id}`}>{z.id}</div>}
      />,
    );
    expect(screen.queryByTestId('leaf-a')).not.toBeInTheDocument();
    act(() => {
      useStore.getState().setParameterValueAnalystPro('p1', true);
    });
    expect(screen.getByTestId('leaf-a')).toBeInTheDocument();
  });

  it('hides an entire container subtree when container rule fails', () => {
    const inner = { id: 'a', type: 'blank' as const, w: 100000, h: 100000 };
    const box = {
      id: 'box',
      type: 'container-horz' as const,
      w: 100000,
      h: 100000,
      visibilityRule: { kind: 'setMembership' as const, setId: 's1', mode: 'hasAny' as const },
      children: [inner],
    };
    const root: Zone = {
      id: 'root',
      type: 'container-vert',
      w: 100000,
      h: 100000,
      children: [box],
    };
    const map = resolvedMapOf([root, box, inner]);
    render(
      <ZoneRenderer
        root={root}
        resolvedMap={map}
        renderLeaf={(z) => <div data-testid={`leaf-${z.id}`}>{z.id}</div>}
      />,
    );
    expect(screen.queryByTestId('leaf-a')).not.toBeInTheDocument();
  });
});

describe('FloatingLayer visibility gate', () => {
  it('skips a floating zone when hasActiveFilter rule fails', () => {
    const zones: FloatingZone[] = [
      {
        id: 'f1',
        type: 'blank',
        w: 100,
        h: 100,
        floating: true,
        x: 0,
        y: 0,
        pxW: 200,
        pxH: 100,
        zIndex: 0,
        visibilityRule: { kind: 'hasActiveFilter', sheetId: 'sheet-1' },
      },
    ];
    const { rerender } = render(
      <FloatingLayer zones={zones} renderLeaf={(z) => <div data-testid={`leaf-${z.id}`}>{z.id}</div>} />,
    );
    expect(screen.queryByTestId('leaf-f1')).not.toBeInTheDocument();
    act(() => {
      useStore.getState().setSheetFilterAnalystPro('sheet-1', [
        { field: 'region', op: '=', value: 'East' },
      ]);
    });
    rerender(
      <FloatingLayer zones={zones} renderLeaf={(z) => <div data-testid={`leaf-${z.id}`}>{z.id}</div>} />,
    );
    expect(screen.getByTestId('leaf-f1')).toBeInTheDocument();
  });
});

describe('FreeformCanvas — parameterEquals end-to-end (Plan 4d T8)', () => {
  it('toggles a leaf when the parameter value changes via the store', () => {
    const dashboard = {
      schemaVersion: 'askdb/dashboard/v1',
      id: 'd1',
      name: 'Test',
      archetype: 'analyst-pro',
      size: { mode: 'fixed', preset: 'desktop' },
      tiledRoot: {
        id: 'root',
        type: 'container-vert',
        w: 100000,
        h: 100000,
        children: [
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
      parameters: [],
      sets: [],
      actions: [],
    };
    useStore.setState({
      analystProDashboard: {
        ...dashboard,
        parameters: [
          { id: 'p1', name: 'view', type: 'string', value: 'normal', domain: { kind: 'free' }, createdAt: '' },
        ],
      },
    });
    render(
      <FreeformCanvas
        dashboard={useStore.getState().analystProDashboard as any}
        renderLeaf={(z: any) => <div data-testid={`leaf-${z.id}`}>{z.id}</div>}
      />,
    );
    expect(screen.queryByTestId('leaf-gated')).not.toBeInTheDocument();
    act(() => {
      useStore.getState().setParameterValueAnalystPro('p1', 'priority');
    });
    expect(screen.getByTestId('leaf-gated')).toBeInTheDocument();
  });
});

