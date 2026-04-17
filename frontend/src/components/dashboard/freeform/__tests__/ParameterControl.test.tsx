import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

import ParameterControl from '../panels/ParameterControl';
import { useStore } from '../../../../store';

function seed(parameters) {
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

describe('ParameterControl', () => {
  beforeEach(() => {
    seed([]);
  });

  it('renders a <select> for a list domain and commits a new value on change', () => {
    const p = {
      id: 'p1', name: 'region', type: 'string',
      value: 'West',
      domain: { kind: 'list', values: ['East', 'West', 'North'] },
      createdAt: '2026-04-16T00:00:00Z',
    };
    seed([p]);
    const spy = vi.spyOn(useStore.getState(), 'setParameterValueAnalystPro');
    render(<ParameterControl param={p} />);
    const select = screen.getByRole('combobox', { name: /region/i });
    fireEvent.change(select, { target: { value: 'East' } });
    expect(spy).toHaveBeenCalledWith('p1', 'East');
    spy.mockRestore();
  });

  it('renders a slider for a range domain and commits numeric values', () => {
    const p = {
      id: 'p2', name: 'threshold', type: 'number',
      value: 5,
      domain: { kind: 'range', min: 0, max: 10, step: 1 },
      createdAt: '2026-04-16T00:00:00Z',
    };
    seed([p]);
    const spy = vi.spyOn(useStore.getState(), 'setParameterValueAnalystPro');
    render(<ParameterControl param={p} />);
    const slider = screen.getByRole('slider', { name: /threshold/i });
    fireEvent.change(slider, { target: { value: '7' } });
    expect(spy).toHaveBeenCalledWith('p2', '7');
    spy.mockRestore();
  });

  it('renders a checkbox for a boolean parameter', () => {
    const p = {
      id: 'p3', name: 'active', type: 'boolean',
      value: false,
      domain: { kind: 'free' },
      createdAt: '2026-04-16T00:00:00Z',
    };
    seed([p]);
    const spy = vi.spyOn(useStore.getState(), 'setParameterValueAnalystPro');
    render(<ParameterControl param={p} />);
    const cb = screen.getByRole('checkbox', { name: /active/i });
    fireEvent.click(cb);
    expect(spy).toHaveBeenCalledWith('p3', true);
    spy.mockRestore();
  });

  it('renders a date input for a date parameter', () => {
    const p = {
      id: 'p4', name: 'asof', type: 'date',
      value: '2026-04-16',
      domain: { kind: 'free' },
      createdAt: '2026-04-16T00:00:00Z',
    };
    seed([p]);
    const spy = vi.spyOn(useStore.getState(), 'setParameterValueAnalystPro');
    render(<ParameterControl param={p} />);
    const input = screen.getByLabelText(/asof/i);
    expect(input).toHaveProperty('type', 'date');
    fireEvent.change(input, { target: { value: '2026-05-01' } });
    expect(spy).toHaveBeenCalledWith('p4', '2026-05-01');
    spy.mockRestore();
  });

  it('renders a text input for a free string parameter', () => {
    const p = {
      id: 'p5', name: 'label', type: 'string',
      value: 'hi',
      domain: { kind: 'free' },
      createdAt: '2026-04-16T00:00:00Z',
    };
    seed([p]);
    const spy = vi.spyOn(useStore.getState(), 'setParameterValueAnalystPro');
    render(<ParameterControl param={p} />);
    const input = screen.getByLabelText(/label/i);
    fireEvent.change(input, { target: { value: 'there' } });
    expect(spy).toHaveBeenLastCalledWith('p5', 'there');
    spy.mockRestore();
  });
});
