import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../../../store';
import { SIMPLE_BAR, TIME_SERIES_LINE } from '../fixtures/canonical-charts';

describe('chartEditor store slice', () => {
  beforeEach(() => {
    // Reset history between tests
    useStore.setState({
      chartEditor: {
        currentSpec: null,
        history: [],
        historyIndex: -1,
        mode: 'default',
        historyCap: 100,
      },
    });
  });

  it('initChartEditorSpec seeds history with a single snapshot at index 0', () => {
    useStore.getState().initChartEditorSpec(SIMPLE_BAR);
    const s = useStore.getState().chartEditor;
    expect(s.currentSpec).toBe(SIMPLE_BAR);
    expect(s.history).toHaveLength(1);
    expect(s.historyIndex).toBe(0);
  });

  it('setChartEditorSpec appends to history and advances the index', () => {
    useStore.getState().initChartEditorSpec(SIMPLE_BAR);
    useStore.getState().setChartEditorSpec(TIME_SERIES_LINE);
    const s = useStore.getState().chartEditor;
    expect(s.history).toHaveLength(2);
    expect(s.historyIndex).toBe(1);
    expect(s.currentSpec).toBe(TIME_SERIES_LINE);
  });

  it('undoChartEditor walks the index back to the previous snapshot', () => {
    const { initChartEditorSpec, setChartEditorSpec, undoChartEditor } = useStore.getState();
    initChartEditorSpec(SIMPLE_BAR);
    setChartEditorSpec(TIME_SERIES_LINE);
    undoChartEditor();
    const s = useStore.getState().chartEditor;
    expect(s.historyIndex).toBe(0);
    expect(s.currentSpec).toBe(SIMPLE_BAR);
  });

  it('redoChartEditor walks the index forward after an undo', () => {
    const { initChartEditorSpec, setChartEditorSpec, undoChartEditor, redoChartEditor } =
      useStore.getState();
    initChartEditorSpec(SIMPLE_BAR);
    setChartEditorSpec(TIME_SERIES_LINE);
    undoChartEditor();
    redoChartEditor();
    const s = useStore.getState().chartEditor;
    expect(s.historyIndex).toBe(1);
    expect(s.currentSpec).toBe(TIME_SERIES_LINE);
  });

  it('undo is a no-op at the start of history', () => {
    useStore.getState().initChartEditorSpec(SIMPLE_BAR);
    useStore.getState().undoChartEditor();
    const s = useStore.getState().chartEditor;
    expect(s.historyIndex).toBe(0);
    expect(s.currentSpec).toBe(SIMPLE_BAR);
  });

  it('redo is a no-op at the head of history', () => {
    useStore.getState().initChartEditorSpec(SIMPLE_BAR);
    useStore.getState().redoChartEditor();
    const s = useStore.getState().chartEditor;
    expect(s.historyIndex).toBe(0);
  });

  it('pushing a new spec after an undo truncates the forward branch', () => {
    const { initChartEditorSpec, setChartEditorSpec, undoChartEditor } = useStore.getState();
    initChartEditorSpec(SIMPLE_BAR);
    setChartEditorSpec(TIME_SERIES_LINE);
    undoChartEditor();
    // Now at SIMPLE_BAR, history = [SIMPLE_BAR, TIME_SERIES_LINE], index = 0
    const branchSpec = { ...SIMPLE_BAR, title: 'branched' };
    setChartEditorSpec(branchSpec);
    const s = useStore.getState().chartEditor;
    expect(s.history).toHaveLength(2);
    expect(s.history[0]).toBe(SIMPLE_BAR);
    expect(s.history[1]).toEqual(branchSpec);
    expect(s.historyIndex).toBe(1);
  });

  it('history is bounded at historyCap (drops the oldest when full)', () => {
    // test fixture — store shape isn't worth re-typing for one assertion
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    useStore.setState((state: any) => ({
      chartEditor: { ...state.chartEditor, historyCap: 3 },
    }));
    const { initChartEditorSpec, setChartEditorSpec } = useStore.getState();
    initChartEditorSpec({ ...SIMPLE_BAR, title: 'v0' });
    setChartEditorSpec({ ...SIMPLE_BAR, title: 'v1' });
    setChartEditorSpec({ ...SIMPLE_BAR, title: 'v2' });
    setChartEditorSpec({ ...SIMPLE_BAR, title: 'v3' });
    const s = useStore.getState().chartEditor;
    expect(s.history).toHaveLength(3);
    expect((s.history[0] as typeof SIMPLE_BAR).title).toBe('v1');
    expect((s.history[2] as typeof SIMPLE_BAR).title).toBe('v3');
    expect(s.historyIndex).toBe(2);
  });

  it('setChartEditorSpec with { pushHistory: false } updates current without touching history', () => {
    const { initChartEditorSpec, setChartEditorSpec } = useStore.getState();
    initChartEditorSpec(SIMPLE_BAR);
    setChartEditorSpec(TIME_SERIES_LINE, { pushHistory: false });
    const s = useStore.getState().chartEditor;
    expect(s.currentSpec).toBe(TIME_SERIES_LINE);
    expect(s.history).toHaveLength(1);
    expect(s.historyIndex).toBe(0);
  });
});
