import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useStore } from '../../../../store';
import ZonePropertiesPanel from '../panels/ZonePropertiesPanel';

function seedDashboard() {
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
        children: [{ id: 'z1', type: 'worksheet', worksheetRef: 'sheet-a', w: 100000, h: 100000 }],
      },
      floatingLayer: [],
      worksheets: [],
      parameters: [
        { id: 'p1', name: 'view', type: 'string', value: 'priority', domain: { kind: 'free' }, createdAt: '' },
      ],
      sets: [
        { id: 's1', name: 'Top', dimension: 'region', members: ['East'], createdAt: '' },
      ],
      actions: [],
    },
  });
  useStore.setState({ analystProSheetFilters: { 'z1': [] } });
}

beforeEach(() => {
  seedDashboard();
  useStore.getState().setAnalystProSelection(['z1']);
});

describe('ZonePropertiesPanel', () => {
  it('renders nothing when no zone is selected', () => {
    useStore.getState().setAnalystProSelection([]);
    const { container } = render(<ZonePropertiesPanel />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when more than one zone is selected', () => {
    useStore.getState().setAnalystProSelection(['z1', 'root']);
    const { container } = render(<ZonePropertiesPanel />);
    expect(container.firstChild).toBeNull();
  });

  it('shows "always" by default for a zone without a rule', () => {
    render(<ZonePropertiesPanel />);
    fireEvent.click(screen.getByRole('tab', { name: /visibility/i }));
    const select = screen.getByLabelText(/visibility rule/i) as HTMLSelectElement;
    expect(select.value).toBe('always');
  });

  it('saves a parameterEquals rule', () => {
    render(<ZonePropertiesPanel />);
    fireEvent.click(screen.getByRole('tab', { name: /visibility/i }));
    fireEvent.change(screen.getByLabelText(/visibility rule/i), { target: { value: 'parameterEquals' } });
    fireEvent.change(screen.getByLabelText(/parameter/i), { target: { value: 'p1' } });
    fireEvent.change(screen.getByLabelText(/value/i), { target: { value: 'priority' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    const z = useStore.getState().analystProDashboard!.tiledRoot.children[0] as any;
    expect(z.visibilityRule).toEqual({ kind: 'parameterEquals', parameterId: 'p1', value: 'priority' });
  });

  it('saves a setMembership rule', () => {
    render(<ZonePropertiesPanel />);
    fireEvent.click(screen.getByRole('tab', { name: /visibility/i }));
    fireEvent.change(screen.getByLabelText(/visibility rule/i), { target: { value: 'setMembership' } });
    fireEvent.change(screen.getByLabelText(/^set$/i), { target: { value: 's1' } });
    fireEvent.change(screen.getByLabelText(/^mode$/i), { target: { value: 'hasAny' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    const z = useStore.getState().analystProDashboard!.tiledRoot.children[0] as any;
    expect(z.visibilityRule).toEqual({ kind: 'setMembership', setId: 's1', mode: 'hasAny' });
  });

  it('saves a hasActiveFilter rule', () => {
    render(<ZonePropertiesPanel />);
    fireEvent.click(screen.getByRole('tab', { name: /visibility/i }));
    fireEvent.change(screen.getByLabelText(/visibility rule/i), { target: { value: 'hasActiveFilter' } });
    fireEvent.change(screen.getByLabelText(/^sheet$/i), { target: { value: 'sheet-a' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    const z = useStore.getState().analystProDashboard!.tiledRoot.children[0] as any;
    expect(z.visibilityRule).toEqual({ kind: 'hasActiveFilter', sheetId: 'sheet-a' });
  });

  it('clears the rule when "always" is selected and saved', () => {
    useStore.getState().updateZoneAnalystPro('z1', {
      visibilityRule: { kind: 'parameterEquals', parameterId: 'p1', value: 'priority' },
    });
    render(<ZonePropertiesPanel />);
    fireEvent.click(screen.getByRole('tab', { name: /visibility/i }));
    fireEvent.change(screen.getByLabelText(/visibility rule/i), { target: { value: 'always' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    const z = useStore.getState().analystProDashboard!.tiledRoot.children[0] as any;
    expect(z.visibilityRule).toBeUndefined();
  });

  it('switches tabs and shows each tab body (Plan 5d T11)', () => {
    render(<ZonePropertiesPanel />);
    fireEvent.click(screen.getByRole('tab', { name: /layout/i }));
    expect(screen.getByTestId('zone-properties-layout-tab')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /style/i }));
    expect(screen.getByTestId('zone-properties-style-tab')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /visibility/i }));
    expect(screen.getByTestId('zone-properties-visibility-tab')).toBeInTheDocument();
  });

  it('defaults to Layout tab when slice is null (Plan 5d T11)', () => {
    useStore.setState({ analystProPropertiesTab: null } as any);
    render(<ZonePropertiesPanel />);
    expect(screen.getByTestId('zone-properties-layout-tab')).toBeInTheDocument();
  });
});
