import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useStore } from '../../../../store';
import { publish, _resetForTests } from '../lib/markEventBus';
import { useActionRuntime } from '../hooks/useActionRuntime';

beforeEach(() => {
  _resetForTests();
  useStore.setState({
    analystProSheetHighlights: {},
    analystProSheetFilters: {},
    analystProActionCascadeToken: 0,
    analystProActiveCascadeTargets: {},
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    analystProDashboard: {
      sets: [],
      parameters: [],
      actions: [
        {
          id: 'h1',
          name: 'Highlight by region',
          kind: 'highlight',
          enabled: true,
          trigger: 'select',
          sourceSheets: ['sheet-a'],
          targetSheets: ['sheet-b'],
          fieldMapping: [{ source: 'region', target: 'region' }],
        },
      ],
    } as any,
  });
});

describe('Plan 6d cascade: mark select → highlight target sheet', () => {
  it('publishing a select MarkEvent on source sheet writes target highlight slice', () => {
    renderHook(() => useActionRuntime());
    act(() => {
      publish({
        sourceSheetId: 'sheet-a',
        trigger: 'select',
        markData: { region: 'East' },
        timestamp: Date.now(),
      });
    });
    expect(useStore.getState().analystProSheetHighlights['sheet-b']).toEqual({
      region: 'East',
    });
  });

  it('publishing empty markData clears target highlight slice', () => {
    renderHook(() => useActionRuntime());
    useStore.getState().setSheetHighlightAnalystPro('sheet-b', { region: 'East' });
    act(() => {
      publish({
        sourceSheetId: 'sheet-a',
        trigger: 'select',
        markData: {},
        timestamp: Date.now(),
      });
    });
    expect('sheet-b' in useStore.getState().analystProSheetHighlights).toBe(false);
  });

  it('non-matching source sheet does NOT touch target', () => {
    renderHook(() => useActionRuntime());
    act(() => {
      publish({
        sourceSheetId: 'sheet-z',
        trigger: 'select',
        markData: { region: 'East' },
        timestamp: Date.now(),
      });
    });
    expect(useStore.getState().analystProSheetHighlights).toEqual({});
  });
});
