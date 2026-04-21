import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { CalcTestValues } from '../CalcTestValues';

vi.mock('../../../../../api', () => ({
  fetchSampleRows: vi.fn().mockResolvedValue({
    columns: ['id', 'Sales', 'Region'],
    rows: [
      { id: 1, Sales: 100, Region: 'West' },
      { id: 2, Sales: 200, Region: 'East' },
    ],
  }),
}));

describe('CalcTestValues', () => {
  it('renders fetched rows and allows row selection', async () => {
    const onSelect = vi.fn();
    render(<CalcTestValues connId="c1" selectedRowIdx={0} onSelectRow={onSelect} />);
    await waitFor(() => expect(screen.getByText('West')).toBeInTheDocument());
    // Auto-fires with the default row once data arrives so the evaluator
    // has a bound row on first render (fixes the "unknown field" 500).
    expect(onSelect).toHaveBeenCalledWith(
      0,
      expect.objectContaining({ id: 1, Region: 'West' }),
    );
    fireEvent.click(screen.getByText('East'));
    expect(onSelect).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ id: 2, Region: 'East' }),
    );
  });

  it('renders empty-state hint when API returns no rows', async () => {
    const mod = await import('../../../../../api');
    mod.fetchSampleRows.mockResolvedValueOnce({ columns: [], rows: [] });
    render(<CalcTestValues connId="c1" selectedRowIdx={0} onSelectRow={() => {}} />);
    await waitFor(() => expect(screen.getByText(/No sample rows available/i)).toBeInTheDocument());
  });
});
