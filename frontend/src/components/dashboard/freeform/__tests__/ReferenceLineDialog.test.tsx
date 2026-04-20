// Plan 9a T10 — ReferenceLineDialog unit tests.
//
// Per Corrections C6 (no MSW) and C10 (dialog wiring mirrors CalcEditorDialog),
// these are pure component tests that exercise the dialog against the real
// store. Worksheets are an ARRAY keyed by `.id` (see T8 tests / corrections
// C4/C5), not an object map; assertions use `.find(w => w.id === SHEET)`.

import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ReferenceLineDialog from '../panels/ReferenceLineDialog';
import { useStore } from '../../../../store';
import { emptyDashboardForPreset } from '../lib/dashboardShape';

const SHEET = 'sheet-1';

function findSheet(id: string): any {
  const dash: any = useStore.getState().analystProDashboard;
  return (dash?.worksheets ?? []).find((w: any) => w.id === id);
}

beforeEach(() => {
  const base = emptyDashboardForPreset('analyst-pro');
  useStore.setState({
    analystProReferenceLineDialog: { sheetId: SHEET, kind: 'reference_line', preset: {} },
    analystProDashboard: {
      ...base,
      worksheets: [
        {
          id: SHEET,
          name: 'Sales',
          analytics: {
            referenceLines: [],
            referenceBands: [],
            distributions: [],
            totals: [],
          },
        },
      ],
    } as any,
    analystProHistory: null,
  });
});

describe('ReferenceLineDialog', () => {
  it('renders all spec form controls', () => {
    render(<ReferenceLineDialog />);
    expect(screen.getByLabelText('Axis')).toBeInTheDocument();
    expect(screen.getByLabelText('Aggregation')).toBeInTheDocument();
    expect(screen.getByLabelText('Scope')).toBeInTheDocument();
    expect(screen.getByLabelText('Label')).toBeInTheDocument();
    expect(screen.getByLabelText('Line style')).toBeInTheDocument();
    expect(screen.getByLabelText('Color')).toBeInTheDocument();
    expect(screen.getByLabelText('Show marker')).toBeInTheDocument();
  });

  it('Save pushes a ReferenceLineSpec through addReferenceLineAnalystPro', () => {
    render(<ReferenceLineDialog />);
    fireEvent.change(screen.getByLabelText('Axis'), { target: { value: 'y' } });
    fireEvent.change(screen.getByLabelText('Aggregation'), { target: { value: 'mean' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    const sheet = findSheet(SHEET);
    expect(sheet.analytics.referenceLines).toHaveLength(1);
    expect(useStore.getState().analystProReferenceLineDialog).toBeNull();
  });

  it('Cancel does not modify state', () => {
    render(<ReferenceLineDialog />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    const sheet = findSheet(SHEET);
    expect(sheet.analytics.referenceLines).toHaveLength(0);
    expect(useStore.getState().analystProReferenceLineDialog).toBeNull();
  });

  it('percentile aggregation reveals percentile input', () => {
    render(<ReferenceLineDialog />);
    fireEvent.change(screen.getByLabelText('Aggregation'), { target: { value: 'percentile' } });
    expect(screen.getByLabelText('Percentile')).toBeInTheDocument();
  });
});
