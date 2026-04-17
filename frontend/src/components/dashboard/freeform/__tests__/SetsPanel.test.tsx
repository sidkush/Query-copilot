import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import React from 'react';

import SetsPanel from '../panels/SetsPanel';
import { useStore } from '../../../../store';

function seed(sets = []) {
  useStore.setState({
    analystProDashboard: {
      id: 'd1',
      archetype: 'analyst-pro',
      size: { mode: 'automatic' },
      tiledRoot: { id: 'r', type: 'container-horz', w: 100000, h: 100000, children: [] },
      floatingLayer: [],
      worksheets: [],
      parameters: [],
      actions: [],
      sets,
    },
    analystProHistory: { past: [], present: null, future: [], maxEntries: 500 },
  });
}

const demoSet = {
  id: 's1',
  name: 'Top Regions',
  dimension: 'region',
  members: ['East'],
  createdAt: '2026-04-16T00:00:00Z',
};

describe('SetsPanel', () => {
  beforeEach(() => seed());

  it('renders the Sets heading and empty-state copy when no sets exist', () => {
    render(<SetsPanel />);
    expect(screen.getByRole('heading', { name: /sets/i })).toBeTruthy();
    expect(screen.getByText(/no sets yet/i)).toBeTruthy();
  });

  it('+ New Set opens the create form with name + dimension inputs', () => {
    render(<SetsPanel />);
    fireEvent.click(screen.getByRole('button', { name: /\+ new set/i }));
    expect(screen.getByPlaceholderText(/set name/i)).toBeTruthy();
    expect(screen.getByPlaceholderText(/dimension/i)).toBeTruthy();
  });

  it('Create adds a new set via addSetAnalystPro', () => {
    const spy = vi.spyOn(useStore.getState(), 'addSetAnalystPro');
    render(<SetsPanel />);
    fireEvent.click(screen.getByRole('button', { name: /\+ new set/i }));
    fireEvent.change(screen.getByPlaceholderText(/set name/i), { target: { value: 'My Set' } });
    fireEvent.change(screen.getByPlaceholderText(/dimension/i), { target: { value: 'region' } });
    fireEvent.click(screen.getByRole('button', { name: /^create$/i }));
    expect(spy).toHaveBeenCalledTimes(1);
    const callArg = spy.mock.calls[0][0];
    expect(callArg).toMatchObject({ name: 'My Set', dimension: 'region', members: [] });
    expect(callArg.id).toBeTruthy();
    expect(callArg.createdAt).toBeTruthy();
    spy.mockRestore();
  });

  it('rejects duplicate names (case-insensitive)', () => {
    seed([demoSet]);
    const spy = vi.spyOn(useStore.getState(), 'addSetAnalystPro');
    render(<SetsPanel />);
    fireEvent.click(screen.getByRole('button', { name: /\+ new set/i }));
    fireEvent.change(screen.getByPlaceholderText(/set name/i), { target: { value: 'top regions' } });
    fireEvent.change(screen.getByPlaceholderText(/dimension/i), { target: { value: 'region' } });
    fireEvent.click(screen.getByRole('button', { name: /^create$/i }));
    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByText(/already exists/i)).toBeTruthy();
    spy.mockRestore();
  });

  it('rejects invalid dimension identifier', () => {
    const spy = vi.spyOn(useStore.getState(), 'addSetAnalystPro');
    render(<SetsPanel />);
    fireEvent.click(screen.getByRole('button', { name: /\+ new set/i }));
    fireEvent.change(screen.getByPlaceholderText(/set name/i), { target: { value: 'X' } });
    fireEvent.change(screen.getByPlaceholderText(/dimension/i), { target: { value: 'bad field' } });
    fireEvent.click(screen.getByRole('button', { name: /^create$/i }));
    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByText(/invalid dimension/i)).toBeTruthy();
    spy.mockRestore();
  });

  it('lists existing sets with Edit / Delete buttons', () => {
    seed([demoSet]);
    render(<SetsPanel />);
    const row = screen.getByTestId('set-row-s1');
    expect(within(row).getByText('Top Regions')).toBeTruthy();
    expect(within(row).getByText(/region · 1/)).toBeTruthy();
    expect(within(row).getByRole('button', { name: /edit members/i })).toBeTruthy();
    expect(within(row).getByRole('button', { name: /delete/i })).toBeTruthy();
  });

  it('Delete calls deleteSetAnalystPro after confirm', () => {
    seed([demoSet]);
    const spy = vi.spyOn(useStore.getState(), 'deleteSetAnalystPro');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<SetsPanel />);
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(spy).toHaveBeenCalledWith('s1');
    spy.mockRestore();
  });

  it('Edit Members opens SetMemberDialog with that set selected', () => {
    seed([demoSet]);
    render(<SetsPanel />);
    fireEvent.click(screen.getByRole('button', { name: /edit members/i }));
    expect(screen.getByRole('dialog', { name: /edit set members/i })).toBeTruthy();
  });

  it('Rename flow calls renameSetAnalystPro with trimmed value', () => {
    seed([demoSet]);
    const spy = vi.spyOn(useStore.getState(), 'renameSetAnalystPro');
    render(<SetsPanel />);
    fireEvent.doubleClick(screen.getByText('Top Regions'));
    const input = screen.getByDisplayValue('Top Regions');
    fireEvent.change(input, { target: { value: '  Bottom Regions  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(spy).toHaveBeenCalledWith('s1', 'Bottom Regions');
    spy.mockRestore();
  });

  it('Escape discards rename draft and does not call renameSetAnalystPro', () => {
    seed([demoSet]);
    const spy = vi.spyOn(useStore.getState(), 'renameSetAnalystPro');
    render(<SetsPanel />);
    fireEvent.doubleClick(screen.getByText('Top Regions'));
    const input = screen.getByDisplayValue('Top Regions');
    fireEvent.change(input, { target: { value: 'Bottom Regions' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(spy).not.toHaveBeenCalled();
    // Original name still rendered (input is gone)
    expect(screen.getByText('Top Regions')).toBeTruthy();
    spy.mockRestore();
  });

  it('Rename to a duplicate name shows an inline error and does not commit', () => {
    seed([
      demoSet,
      { ...demoSet, id: 's2', name: 'Other' },
    ]);
    const spy = vi.spyOn(useStore.getState(), 'renameSetAnalystPro');
    render(<SetsPanel />);
    const otherRow = screen.getByTestId('set-row-s2');
    fireEvent.doubleClick(within(otherRow).getByText('Other'));
    const input = screen.getByDisplayValue('Other');
    fireEvent.change(input, { target: { value: 'Top Regions' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByTestId('rename-error-s2')).toBeTruthy();
    spy.mockRestore();
  });
});
