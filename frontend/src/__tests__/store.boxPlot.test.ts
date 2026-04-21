import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '../store';

function resetStore(): void {
  useStore.setState({
    ...useStore.getState(),
    analystProBoxPlots: [],
    analystProBoxPlotDialogCtx: null,
    analystProDropLinesBySheet: {},
    analystProDropLinesDialogCtx: null,
  });
}

const SPEC = {
  axis: 'y',
  whisker_method: 'tukey',
  whisker_percentile: null,
  show_outliers: true,
  fill_color: '#4C78A8',
  fill_opacity: 0.3,
  scope: 'entire',
};

describe('store — box plot CRUD', () => {
  beforeEach(resetStore);

  it('addBoxPlotAnalystPro appends a box plot', () => {
    useStore.getState().addBoxPlotAnalystPro({ id: 'bp1', spec: SPEC, envelope: null });
    expect(useStore.getState().analystProBoxPlots).toHaveLength(1);
    expect(useStore.getState().analystProBoxPlots[0].id).toBe('bp1');
  });

  it('updateBoxPlotAnalystPro patches by id', () => {
    useStore.getState().addBoxPlotAnalystPro({ id: 'bp1', spec: SPEC, envelope: null });
    useStore.getState().updateBoxPlotAnalystPro('bp1', { envelope: { q1: -1 } });
    expect(useStore.getState().analystProBoxPlots[0].envelope).toEqual({ q1: -1 });
  });

  it('deleteBoxPlotAnalystPro removes by id', () => {
    useStore.getState().addBoxPlotAnalystPro({ id: 'bp1', spec: SPEC, envelope: null });
    useStore.getState().deleteBoxPlotAnalystPro('bp1');
    expect(useStore.getState().analystProBoxPlots).toHaveLength(0);
  });

  it('openBoxPlotDialogAnalystPro sets ctx; close clears it', () => {
    useStore.getState().openBoxPlotDialogAnalystPro({ kind: 'box_plot' });
    expect(useStore.getState().analystProBoxPlotDialogCtx).toEqual({ kind: 'box_plot' });
    useStore.getState().closeBoxPlotDialogAnalystPro();
    expect(useStore.getState().analystProBoxPlotDialogCtx).toBeNull();
  });
});

describe('store — drop lines per-sheet', () => {
  beforeEach(resetStore);

  const SHEET_A = 'sheet_a';
  const SHEET_B = 'sheet_b';
  const SPEC_A = { mode: 'both', color: '#888', line_style: 'dashed' };
  const SPEC_B = { mode: 'y',    color: '#E45756', line_style: 'dotted' };

  it('setDropLinesAnalystPro stores per sheet', () => {
    useStore.getState().setDropLinesAnalystPro(SHEET_A, SPEC_A);
    useStore.getState().setDropLinesAnalystPro(SHEET_B, SPEC_B);
    const map = useStore.getState().analystProDropLinesBySheet;
    expect(map[SHEET_A]).toEqual(SPEC_A);
    expect(map[SHEET_B]).toEqual(SPEC_B);
  });

  it('getDropLinesForSheet returns null for unknown sheet', () => {
    expect(useStore.getState().getDropLinesForSheet('nope')).toBeNull();
  });

  it("mode='off' persists as an explicit value", () => {
    useStore.getState().setDropLinesAnalystPro(SHEET_A, { mode: 'off', color: '#888', line_style: 'dashed' });
    expect(useStore.getState().analystProDropLinesBySheet[SHEET_A].mode).toBe('off');
  });
});
