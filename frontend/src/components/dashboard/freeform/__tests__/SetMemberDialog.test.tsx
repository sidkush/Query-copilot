import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

import SetMemberDialog from '../panels/SetMemberDialog';
import { useStore } from '../../../../store';

function seedDashboardWithSet() {
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
      sets: [{
        id: 's1',
        name: 'Top Regions',
        dimension: 'region',
        members: ['East', 'West'],
        createdAt: '2026-04-16T00:00:00Z',
      }],
    },
    analystProHistory: { past: [], present: null, future: [], maxEntries: 500 },
  });
}

describe('SetMemberDialog', () => {
  beforeEach(() => {
    seedDashboardWithSet();
  });

  it('renders nothing when setId prop is null', () => {
    const { container } = render(<SetMemberDialog setId={null} onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders members as a list with remove buttons', () => {
    render(<SetMemberDialog setId="s1" onClose={() => {}} />);
    expect(screen.getByRole('dialog', { name: /edit set members/i })).toBeTruthy();
    expect(screen.getByText('East')).toBeTruthy();
    expect(screen.getByText('West')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /remove/i }).length).toBe(2);
  });

  it('adds a new member via the input', () => {
    render(<SetMemberDialog setId="s1" onClose={() => {}} />);
    const input = screen.getByPlaceholderText(/add member/i);
    fireEvent.change(input, { target: { value: 'North' } });
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
    expect(screen.getByText('North')).toBeTruthy();
  });

  it('dedups when adding an existing member', () => {
    render(<SetMemberDialog setId="s1" onClose={() => {}} />);
    const input = screen.getByPlaceholderText(/add member/i);
    fireEvent.change(input, { target: { value: 'East' } });
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
    // East should still only appear once in the list
    expect(screen.getAllByText('East').length).toBe(1);
  });

  it('Save flushes members via applySetChangeAnalystPro(replace) and calls onClose', () => {
    const spy = vi.spyOn(useStore.getState(), 'applySetChangeAnalystPro');
    const onClose = vi.fn();
    render(<SetMemberDialog setId="s1" onClose={onClose} />);

    // Remove East
    fireEvent.click(screen.getAllByRole('button', { name: /remove/i })[0]);
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(spy).toHaveBeenCalledWith('s1', 'replace', ['West']);
    expect(onClose).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('Cancel closes without flushing', () => {
    const spy = vi.spyOn(useStore.getState(), 'applySetChangeAnalystPro');
    const onClose = vi.fn();
    render(<SetMemberDialog setId="s1" onClose={onClose} />);

    fireEvent.click(screen.getAllByRole('button', { name: /remove/i })[0]);
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(spy).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
    spy.mockRestore();
  });
});
