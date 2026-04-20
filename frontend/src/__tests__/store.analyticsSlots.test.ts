// Plan 9a T8 — analytics slot CRUD actions + history.
//
// Seeds a dashboard via `emptyDashboardForPreset('analyst-pro')` and spreads
// a single worksheet into the `.worksheets` array (worksheets are an ARRAY
// keyed by `.id`, not an object map — see corrections C4/C5 in
// `docs/superpowers/plans/2026-04-20-analyst-pro-plan-9a-CORRECTIONS.md`).

import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../store';
import { emptyDashboardForPreset } from '../components/dashboard/freeform/lib/dashboardShape';

const SHEET = 'sheet-1';

function findSheet(id: string): any {
  const dash: any = useStore.getState().analystProDashboard;
  return (dash?.worksheets ?? []).find((w: any) => w.id === id);
}

function seedWithWorksheet() {
  const base = emptyDashboardForPreset('analyst-pro');
  useStore.setState({
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
}

function seedBareWorksheet() {
  // No `.analytics` field yet — exercises the lazy-init path.
  const base = emptyDashboardForPreset('analyst-pro');
  useStore.setState({
    analystProDashboard: {
      ...base,
      worksheets: [{ id: SHEET, name: 'Sales' }],
    } as any,
    analystProHistory: null,
  });
}

const RL_SPEC = {
  axis: 'y',
  aggregation: 'mean',
  scope: 'entire',
  label: 'computation',
  custom_label: '',
  line_style: 'solid',
  color: '#4C78A8',
  show_marker: true,
  value: null,
  percentile: null,
};

describe('analytics slot store actions', () => {
  beforeEach(seedWithWorksheet);

  it('addReferenceLineAnalystPro appends spec + pushes history entry', () => {
    const historyBefore = useStore.getState().analystProHistory;
    useStore.getState().addReferenceLineAnalystPro(SHEET, RL_SPEC);

    const sheet = findSheet(SHEET);
    expect(sheet.analytics.referenceLines).toHaveLength(1);
    expect(sheet.analytics.referenceLines[0]).toEqual(RL_SPEC);

    // History is a { past, present, future } record. Before: either null or
    // an initial entry. After an add: `present` equals the new dashboard and
    // a previous entry moved onto `past` (unless history was null, in which
    // case `pushAnalystProHistory` initialises it).
    const historyAfter: any = useStore.getState().analystProHistory;
    expect(historyAfter).not.toBeNull();
    expect(historyAfter.present.operation).toMatch(/reference line/i);
    if (historyBefore !== null) {
      expect(historyAfter.past.length).toBeGreaterThan((historyBefore as any).past.length);
    }
  });

  it('updateReferenceLineAnalystPro patches by index', () => {
    useStore.getState().addReferenceLineAnalystPro(SHEET, RL_SPEC);
    useStore.getState().updateReferenceLineAnalystPro(SHEET, 0, { color: '#d62728' });

    const rl = findSheet(SHEET).analytics.referenceLines[0];
    expect(rl.color).toBe('#d62728');
    expect(rl.aggregation).toBe('mean');
  });

  it('deleteReferenceLineAnalystPro removes by index', () => {
    useStore.getState().addReferenceLineAnalystPro(SHEET, RL_SPEC);
    useStore.getState().deleteReferenceLineAnalystPro(SHEET, 0);
    expect(findSheet(SHEET).analytics.referenceLines).toHaveLength(0);
  });

  it('addTotalsAnalystPro appends totals spec', () => {
    const tot = {
      kind: 'both',
      axis: 'both',
      aggregation: 'sum',
      position: 'after',
      should_affect_totals: true,
    };
    useStore.getState().addTotalsAnalystPro(SHEET, tot);
    expect(findSheet(SHEET).analytics.totals).toEqual([tot]);
  });

  it.each([
    ['Band', 'referenceBands'],
    ['Distribution', 'distributions'],
  ])('add/update/delete %s triples work', (kind, key) => {
    const state: any = useStore.getState();
    const addFn = state[`add${kind}AnalystPro`];
    const updateFn = state[`update${kind}AnalystPro`];
    const deleteFn = state[`delete${kind}AnalystPro`];

    addFn(SHEET, { axis: 'y', __placeholder__: true });
    expect(findSheet(SHEET).analytics[key]).toHaveLength(1);

    updateFn(SHEET, 0, { axis: 'x' });
    expect(findSheet(SHEET).analytics[key][0].axis).toBe('x');

    deleteFn(SHEET, 0);
    expect(findSheet(SHEET).analytics[key]).toHaveLength(0);
  });

  it('lazy-initialises .analytics when worksheet lacks the field', () => {
    seedBareWorksheet();
    expect(findSheet(SHEET).analytics).toBeUndefined();

    useStore.getState().addReferenceLineAnalystPro(SHEET, RL_SPEC);

    const sheet = findSheet(SHEET);
    expect(sheet.analytics).toBeDefined();
    expect(sheet.analytics.referenceLines).toEqual([RL_SPEC]);
    expect(sheet.analytics.referenceBands).toEqual([]);
    expect(sheet.analytics.distributions).toEqual([]);
    expect(sheet.analytics.totals).toEqual([]);
  });

  it('non-existent sheetId is a no-op for add', () => {
    const dashBefore = useStore.getState().analystProDashboard;
    useStore.getState().addReferenceLineAnalystPro('does-not-exist', RL_SPEC);
    const dashAfter = useStore.getState().analystProDashboard;

    // Dashboard reference is allowed to change (map returns a new array), but
    // no worksheet should have a populated referenceLines slot.
    const populated = (dashAfter?.worksheets ?? []).some(
      (w: any) => (w.analytics?.referenceLines ?? []).length > 0,
    );
    expect(populated).toBe(false);
    // The original sheet is still present and untouched.
    expect(findSheet(SHEET).analytics.referenceLines).toHaveLength(0);
    expect(dashBefore).toBeTruthy();
  });

  it('non-existent sheetId is a no-op for update and delete', () => {
    useStore.getState().updateReferenceLineAnalystPro('does-not-exist', 0, { color: 'red' });
    useStore.getState().deleteReferenceLineAnalystPro('does-not-exist', 0);
    expect(findSheet(SHEET).analytics.referenceLines).toHaveLength(0);
  });

  it('update with out-of-range index is a no-op', () => {
    useStore.getState().addReferenceLineAnalystPro(SHEET, RL_SPEC);
    useStore.getState().updateReferenceLineAnalystPro(SHEET, 99, { color: 'red' });
    expect(findSheet(SHEET).analytics.referenceLines[0].color).toBe('#4C78A8');
  });
});
