import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../../../../store';

describe('analystProSheetHighlights slice', () => {
  beforeEach(() => {
    useStore.setState({ analystProSheetHighlights: {} });
  });

  it('setSheetHighlightAnalystPro stores scalar fieldValues', () => {
    useStore.getState().setSheetHighlightAnalystPro('sheet-a', { region: 'East' });
    expect(useStore.getState().analystProSheetHighlights['sheet-a']).toEqual({ region: 'East' });
  });

  it('setSheetHighlightAnalystPro stores array fieldValues (multi-select)', () => {
    useStore.getState().setSheetHighlightAnalystPro('sheet-a', { region: ['East', 'West'] });
    expect(useStore.getState().analystProSheetHighlights['sheet-a']).toEqual({
      region: ['East', 'West'],
    });
  });

  it('setSheetHighlightAnalystPro replaces existing slice value', () => {
    useStore.getState().setSheetHighlightAnalystPro('sheet-a', { region: 'East' });
    useStore.getState().setSheetHighlightAnalystPro('sheet-a', { region: 'West' });
    expect(useStore.getState().analystProSheetHighlights['sheet-a']).toEqual({ region: 'West' });
  });

  it('clearSheetHighlightAnalystPro removes the entry entirely', () => {
    useStore.getState().setSheetHighlightAnalystPro('sheet-a', { region: 'East' });
    useStore.getState().clearSheetHighlightAnalystPro('sheet-a');
    expect('sheet-a' in useStore.getState().analystProSheetHighlights).toBe(false);
  });

  it('ignores empty sheetId (no throw, no write)', () => {
    useStore.getState().setSheetHighlightAnalystPro('', { region: 'East' });
    useStore.getState().setSheetHighlightAnalystPro(null, { region: 'East' });
    expect(useStore.getState().analystProSheetHighlights).toEqual({});
  });
});
