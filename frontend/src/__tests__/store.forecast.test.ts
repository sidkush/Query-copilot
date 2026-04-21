import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../store';

describe('Plan 9c — store forecast CRUD', () => {
  beforeEach(() => {
    (useStore as any).setState({
      analystProForecasts: [],
      analystProForecastDialogCtx: null,
    });
  });

  it('addForecastAnalystPro pushes onto list', () => {
    useStore.getState().addForecastAnalystPro({
      id: 'fc-1', tileId: 't1', spec: {}, fits: [],
    });
    expect(useStore.getState().analystProForecasts).toHaveLength(1);
    expect(useStore.getState().analystProForecasts[0].id).toBe('fc-1');
  });

  it('updateForecastAnalystPro merges by id', () => {
    useStore.getState().addForecastAnalystPro({
      id: 'fc-1', tileId: 't1', spec: { model: 'auto' }, fits: [],
    });
    useStore.getState().updateForecastAnalystPro('fc-1', { spec: { model: 'additive' } });
    expect(useStore.getState().analystProForecasts[0].spec.model).toBe('additive');
  });

  it('deleteForecastAnalystPro removes by id', () => {
    useStore.getState().addForecastAnalystPro({ id: 'fc-1', tileId: 't1', spec: {}, fits: [] });
    useStore.getState().addForecastAnalystPro({ id: 'fc-2', tileId: 't1', spec: {}, fits: [] });
    useStore.getState().deleteForecastAnalystPro('fc-1');
    expect(useStore.getState().analystProForecasts.map((f: any) => f.id)).toEqual(['fc-2']);
  });

  it('open/closeForecastDialogAnalystPro toggles ctx', () => {
    useStore.getState().openForecastDialogAnalystPro({ tileId: 't1', preset: {}, rows: [] });
    expect(useStore.getState().analystProForecastDialogCtx).not.toBeNull();
    useStore.getState().closeForecastDialogAnalystPro();
    expect(useStore.getState().analystProForecastDialogCtx).toBeNull();
  });
});
