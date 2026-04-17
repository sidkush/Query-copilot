import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import ActionsDialog from '../panels/ActionsDialog';
import { useStore } from '../../../../store';

function makeDash(actions = []) {
  return {
    schemaVersion: 'askdb/dashboard/v1',
    id: 'd', name: 'T', archetype: 'analyst-pro',
    size: { mode: 'automatic' },
    tiledRoot: { id: 'root', type: 'container-horz', w: 100000, h: 100000, children: [] },
    floatingLayer: [],
    worksheets: [{ id: 'w1', chartSpec: {} }, { id: 'w2', chartSpec: {} }],
    parameters: [], sets: [],
    actions,
  };
}

describe('ActionsDialog', () => {
  beforeEach(() => {
    useStore.setState({
      analystProActionsDialogOpen: false,
      analystProDashboard: makeDash(),
    });
  });

  it('renders nothing when closed', () => {
    const { container } = render(<ActionsDialog />);
    expect(container.firstChild).toBeNull();
  });

  it('renders existing actions in a table when open', () => {
    const actions = [
      { id: 'a1', name: 'Act One', kind: 'filter', sourceSheets: ['w1'], targetSheets: ['w2'], fieldMapping: [], clearBehavior: 'show-all', trigger: 'select', enabled: true },
    ];
    useStore.setState({ analystProActionsDialogOpen: true, analystProDashboard: makeDash(actions) });
    render(<ActionsDialog />);
    expect(screen.getByText('Act One')).toBeInTheDocument();
    expect(screen.getByText('filter')).toBeInTheDocument();
  });

  it('clicking + Add Action shows the form', () => {
    useStore.setState({ analystProActionsDialogOpen: true, analystProDashboard: makeDash() });
    render(<ActionsDialog />);
    fireEvent.click(screen.getByText('+ Add Action'));
    expect(screen.getByText('Save')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('submitting form with a name calls addActionAnalystPro', () => {
    useStore.setState({ analystProActionsDialogOpen: true, analystProDashboard: makeDash() });
    render(<ActionsDialog />);
    fireEvent.click(screen.getByText('+ Add Action'));
    const nameInput = screen.getAllByRole('textbox')[0];
    fireEvent.change(nameInput, { target: { value: 'My Filter' } });
    fireEvent.click(screen.getByText('Save'));
    const actions = useStore.getState().analystProDashboard.actions;
    expect(actions.length).toBe(1);
    expect(actions[0].name).toBe('My Filter');
  });

  it('delete button removes action from store', () => {
    const actions = [
      { id: 'a1', name: 'Doomed', kind: 'filter', sourceSheets: ['w1'], targetSheets: ['w2'], fieldMapping: [], clearBehavior: 'show-all', trigger: 'select', enabled: true },
    ];
    useStore.setState({ analystProActionsDialogOpen: true, analystProDashboard: makeDash(actions) });
    render(<ActionsDialog />);
    fireEvent.click(screen.getByLabelText('Delete Doomed'));
    expect(useStore.getState().analystProDashboard.actions).toHaveLength(0);
  });
});
