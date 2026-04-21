import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AnalystProCalcEditorMount } from '../../../modes/AnalystProLayout';
import { useStore } from '../../../../../store';

vi.mock('@monaco-editor/react', () => ({
  default: ({ value, onChange }) => (
    <textarea
      data-testid="monaco-editor"
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
    />
  ),
}));

vi.mock('../../../../../api', () => ({
  validateCalc: vi.fn().mockResolvedValue({ valid: true, warnings: [] }),
  evaluateCalc: vi.fn().mockResolvedValue({ value: null, type: null, error: null }),
  fetchSampleRows: vi.fn().mockResolvedValue({ columns: [], rows: [] }),
  suggestCalc: vi.fn().mockResolvedValue({ formula: '', explanation: '', confidence: 0 }),
  api: {
    getTables: vi.fn().mockResolvedValue({
      conn_id: 'c1',
      tables: [
        {
          name: 'trips',
          columns: [
            { name: 'ride_id', type: 'VARCHAR', nullable: true },
            { name: 'fare',    type: 'NUMERIC', nullable: true },
          ],
          primary_key: ['ride_id'],
          foreign_keys: [],
          column_count: 2,
        },
      ],
    }),
  },
}));

describe('AnalystProCalcEditorMount — schemaFields wiring', () => {
  beforeEach(() => {
    useStore.setState({
      ...useStore.getState(),
      activeConnId: 'c1',
      analystProDashboard: { id: 'd1', calcs: [], parameters: [], sets: [] },
      analystProCalcEditor: {
        open: true,
        editingCalcId: null,
        seedName: '',
        seedFormula: '',
      },
    });
  });

  it('fetches /schema/tables on open and passes real columns to CalcEditorDialog', async () => {
    render(<AnalystProCalcEditorMount />);

    // Fields tab should transition from 0 → 2 after fetch resolves.
    await waitFor(() => {
      const fieldsTab = screen
        .getAllByRole('tab')
        .find((t) => /Fields/i.test(t.textContent || ''));
      expect(fieldsTab?.textContent).toMatch(/Fields\s*2/);
    });

    // The two real column names should appear in the sidebar list,
    // proving the fetch + flatten path actually threads schemaFields.
    expect(screen.getByText('ride_id')).toBeInTheDocument();
    expect(screen.getByText('fare')).toBeInTheDocument();
  });
});
