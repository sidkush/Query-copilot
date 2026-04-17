import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { useStore } from '../../../../store';
import * as bus from '../lib/markEventBus';
import AnalystProWorksheetTile from '../AnalystProWorksheetTile';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let capturedProps: any = null;

vi.mock('../../lib/DashboardTileCanvas', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: (props: any) => {
    capturedProps = props;
    return (
      <div
        data-testid="tile-canvas"
        data-spec-encoding={JSON.stringify(props.tile?.chart_spec?.encoding ?? {})}
        data-sheet-id={props.sheetId ?? ''}
      />
    );
  },
}));

const baseTile = {
  id: 'tile-1',
  sql: 'select 1',
  chart_spec: { type: 'cartesian', encoding: { x: { field: 'region' }, y: { field: 'sales' } } },
};

beforeEach(() => {
  useStore.setState({
    analystProSheetHighlights: {},
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    analystProDashboard: { actions: [], parameters: [] } as any,
  });
  bus._resetForTests();
  capturedProps = null;
});

describe('AnalystProWorksheetTile highlight integration', () => {
  it('passes sheetId + onMarkSelect to tile canvas', () => {
    const { getByTestId } = render(
      <AnalystProWorksheetTile tile={baseTile} sheetId="sheet-a" />,
    );
    expect(getByTestId('tile-canvas').getAttribute('data-sheet-id')).toBe('sheet-a');
    expect(typeof capturedProps.onMarkSelect).toBe('function');
  });

  it('injects opacity encoding when slice has values', () => {
    useStore.getState().setSheetHighlightAnalystPro('sheet-a', { region: 'East' });
    const { getByTestId } = render(
      <AnalystProWorksheetTile tile={baseTile} sheetId="sheet-a" />,
    );
    const enc = JSON.parse(getByTestId('tile-canvas').getAttribute('data-spec-encoding')!);
    expect(enc.opacity).toBeTruthy();
    expect(enc.opacity.value).toBe(0.15);
    expect(enc.opacity.condition.test).toContain("datum['region']");
  });

  it('does NOT inject opacity when slice is empty', () => {
    const { getByTestId } = render(
      <AnalystProWorksheetTile tile={baseTile} sheetId="sheet-a" />,
    );
    const enc = JSON.parse(getByTestId('tile-canvas').getAttribute('data-spec-encoding')!);
    expect(enc.opacity).toBeUndefined();
  });

  it('mark click writes own slice + publishes MarkEvent', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const events: any[] = [];
    bus.subscribe((e) => events.push(e));
    render(<AnalystProWorksheetTile tile={baseTile} sheetId="sheet-a" />);
    act(() => capturedProps.onMarkSelect('sheet-a', { region: 'East' }, { shiftKey: false }));
    expect(useStore.getState().analystProSheetHighlights['sheet-a']).toEqual({ region: 'East' });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      sourceSheetId: 'sheet-a',
      trigger: 'select',
      markData: { region: 'East' },
    });
  });

  it('shift+click on existing selection appends to array', () => {
    useStore.getState().setSheetHighlightAnalystPro('sheet-a', { region: 'East' });
    render(<AnalystProWorksheetTile tile={baseTile} sheetId="sheet-a" />);
    act(() => capturedProps.onMarkSelect('sheet-a', { region: 'West' }, { shiftKey: true }));
    expect(useStore.getState().analystProSheetHighlights['sheet-a']).toEqual({
      region: ['East', 'West'],
    });
  });

  it('empty-area click clears own slice + publishes empty-fields MarkEvent', () => {
    useStore.getState().setSheetHighlightAnalystPro('sheet-a', { region: 'East' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const events: any[] = [];
    bus.subscribe((e) => events.push(e));
    render(<AnalystProWorksheetTile tile={baseTile} sheetId="sheet-a" />);
    act(() => capturedProps.onMarkSelect('sheet-a', null, { shiftKey: false }));
    expect('sheet-a' in useStore.getState().analystProSheetHighlights).toBe(false);
    expect(events[0]).toMatchObject({
      sourceSheetId: 'sheet-a',
      trigger: 'select',
      markData: {},
    });
  });
});
