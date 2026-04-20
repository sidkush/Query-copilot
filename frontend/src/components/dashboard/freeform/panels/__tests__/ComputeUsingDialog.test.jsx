// frontend/src/components/dashboard/freeform/panels/__tests__/ComputeUsingDialog.test.jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ComputeUsingDialog from '../ComputeUsingDialog';

const baseSpec = {
  calc_id: 'c1', function: 'RUNNING_SUM', arg_field: 'Sales',
  addressing: ['Year'], partitioning: ['Region'],
  direction: 'specific', sort: 'asc', offset: null,
};

const fields = [
  { id: 'Year', name: 'Year' },
  { id: 'Region', name: 'Region' },
  { id: 'Quarter', name: 'Quarter' },
];

describe('ComputeUsingDialog', () => {
  it('renders preset compute-using options', () => {
    render(<ComputeUsingDialog open spec={baseSpec} fields={fields}
                                onSave={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByLabelText(/Table \(Across\)/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Table \(Down\)/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Specific Dimensions/i)).toBeInTheDocument();
  });

  it('Save fires onSave with updated spec', () => {
    const onSave = vi.fn();
    render(<ComputeUsingDialog open spec={baseSpec} fields={fields}
                                onSave={onSave} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByLabelText(/Table \(Down\)/i));
    fireEvent.click(screen.getByRole('button', { name: /Save/i }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0].direction).toBe('down');
  });

  it('Specific Dimensions exposes addressing checklist + sort picker', () => {
    render(<ComputeUsingDialog open
                                spec={{ ...baseSpec, direction: 'specific' }}
                                fields={fields}
                                onSave={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('checkbox', { name: /Year/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Quarter/ })).not.toBeChecked();
    expect(screen.getByRole('combobox', { name: /Sort direction/i })).toBeInTheDocument();
  });
});
