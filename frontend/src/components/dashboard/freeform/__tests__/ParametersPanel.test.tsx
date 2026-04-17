import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import React from 'react';

import ParametersPanel from '../panels/ParametersPanel';
import { useStore } from '../../../../store';

function seed(parameters = []) {
  useStore.setState({
    analystProDashboard: {
      id: 'd1',
      archetype: 'analyst-pro',
      size: { mode: 'automatic' },
      tiledRoot: { id: 'r', type: 'container-horz', w: 100000, h: 100000, children: [] },
      floatingLayer: [],
      worksheets: [],
      parameters,
      sets: [],
      actions: [],
    },
    analystProHistory: { past: [], present: null, future: [], maxEntries: 500 },
  });
}

const demoParam = {
  id: 'p1', name: 'region', type: 'string',
  value: 'West',
  domain: { kind: 'list', values: ['East', 'West'] },
  createdAt: '2026-04-16T00:00:00Z',
};

describe('ParametersPanel', () => {
  beforeEach(() => seed());

  it('renders the Parameters heading and empty-state copy', () => {
    render(<ParametersPanel />);
    expect(screen.getByRole('heading', { name: /parameters/i })).toBeTruthy();
    expect(screen.getByText(/no parameters yet/i)).toBeTruthy();
  });

  it('+ New Parameter opens the create form with name/type/initial-value inputs', () => {
    render(<ParametersPanel />);
    fireEvent.click(screen.getByRole('button', { name: /\+ new parameter/i }));
    expect(screen.getByPlaceholderText(/parameter name/i)).toBeTruthy();
    expect(screen.getByLabelText(/type/i)).toBeTruthy();
  });

  it('Create adds a new parameter via addParameterAnalystPro', () => {
    const spy = vi.spyOn(useStore.getState(), 'addParameterAnalystPro');
    render(<ParametersPanel />);
    fireEvent.click(screen.getByRole('button', { name: /\+ new parameter/i }));
    fireEvent.change(screen.getByPlaceholderText(/parameter name/i), { target: { value: 'year' } });
    fireEvent.change(screen.getByLabelText(/type/i), { target: { value: 'number' } });
    fireEvent.change(screen.getByPlaceholderText(/initial value/i), { target: { value: '2026' } });
    fireEvent.click(screen.getByRole('button', { name: /^create$/i }));
    expect(spy).toHaveBeenCalledTimes(1);
    const arg = spy.mock.calls[0][0];
    expect(arg).toMatchObject({ name: 'year', type: 'number', value: 2026 });
    expect(arg.id).toBeTruthy();
    expect(arg.createdAt).toBeTruthy();
    spy.mockRestore();
  });

  it('rejects duplicate names (case-insensitive)', () => {
    seed([demoParam]);
    const spy = vi.spyOn(useStore.getState(), 'addParameterAnalystPro');
    render(<ParametersPanel />);
    fireEvent.click(screen.getByRole('button', { name: /\+ new parameter/i }));
    fireEvent.change(screen.getByPlaceholderText(/parameter name/i), { target: { value: 'REGION' } });
    fireEvent.change(screen.getByPlaceholderText(/initial value/i), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: /^create$/i }));
    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByText(/already exists/i)).toBeTruthy();
    spy.mockRestore();
  });

  it('rejects invalid names', () => {
    render(<ParametersPanel />);
    fireEvent.click(screen.getByRole('button', { name: /\+ new parameter/i }));
    fireEvent.change(screen.getByPlaceholderText(/parameter name/i), { target: { value: 'bad name' } });
    fireEvent.click(screen.getByRole('button', { name: /^create$/i }));
    expect(screen.getByText(/invalid name/i)).toBeTruthy();
  });

  it('lists existing parameters with a ParameterControl and Delete button', () => {
    seed([demoParam]);
    render(<ParametersPanel />);
    const row = screen.getByTestId('parameter-row-p1');
    expect(within(row).getByRole('combobox', { name: /region/i })).toBeTruthy();
    expect(within(row).getByRole('button', { name: /delete/i })).toBeTruthy();
  });

  it('Delete calls deleteParameterAnalystPro after confirm', () => {
    seed([demoParam]);
    const spy = vi.spyOn(useStore.getState(), 'deleteParameterAnalystPro');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<ParametersPanel />);
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(spy).toHaveBeenCalledWith('p1');
    spy.mockRestore();
  });
});
