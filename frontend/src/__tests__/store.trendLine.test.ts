import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '../store';

describe('store — analystProTrendLines CRUD + history', () => {
  beforeEach(() => {
    useStore.setState((s: any) => ({
      ...s,
      analystProTrendLines: [],
      analystProHistory: [],
      analystProFuture: [],
    }));
  });

  it('addTrendLineAnalystPro appends + snapshots history', () => {
    const before = (useStore.getState() as any).analystProHistory?.length ?? 0;
    (useStore.getState() as any).addTrendLineAnalystPro({
      id: 't1',
      tileId: 'chart-1',
      spec: {
        fit_type: 'linear',
        degree: null,
        factor_fields: [],
        show_confidence_bands: false,
        confidence_level: 0.95,
        color_by_factor: false,
        trend_line_label: true,
      },
      fits: [],
    });
    const after: any = useStore.getState();
    expect(after.analystProTrendLines).toHaveLength(1);
    expect(after.analystProHistory?.length ?? 0).toBe(before + 1);
  });

  it('updateTrendLineAnalystPro mutates matching id', () => {
    (useStore.getState() as any).addTrendLineAnalystPro({
      id: 't1',
      tileId: 'chart-1',
      spec: {
        fit_type: 'linear',
        degree: null,
        factor_fields: [],
        show_confidence_bands: false,
        confidence_level: 0.95,
        color_by_factor: false,
        trend_line_label: false,
      },
      fits: [],
    });
    (useStore.getState() as any).updateTrendLineAnalystPro('t1', {
      spec: {
        fit_type: 'polynomial',
        degree: 3,
        factor_fields: [],
        show_confidence_bands: true,
        confidence_level: 0.99,
        color_by_factor: false,
        trend_line_label: true,
      },
    });
    const tl: any = (useStore.getState() as any).analystProTrendLines[0];
    expect(tl.spec.fit_type).toBe('polynomial');
    expect(tl.spec.degree).toBe(3);
  });

  it('deleteTrendLineAnalystPro removes by id', () => {
    (useStore.getState() as any).addTrendLineAnalystPro({
      id: 't1',
      tileId: 'c',
      spec: {
        fit_type: 'linear',
        degree: null,
        factor_fields: [],
        show_confidence_bands: false,
        confidence_level: 0.95,
        color_by_factor: false,
        trend_line_label: false,
      },
      fits: [],
    });
    (useStore.getState() as any).deleteTrendLineAnalystPro('t1');
    expect((useStore.getState() as any).analystProTrendLines).toHaveLength(0);
  });
});
