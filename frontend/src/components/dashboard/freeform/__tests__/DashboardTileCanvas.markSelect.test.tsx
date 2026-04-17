import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import DashboardTileCanvas from '../../lib/DashboardTileCanvas';

vi.mock('../../../editor/EditorCanvas', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: (props: any) => (
    <div
      data-testid="editor-canvas"
      data-sheet-id={props.sheetId ?? ''}
      data-has-on-mark-select={String(typeof props.onMarkSelect === 'function')}
    />
  ),
}));

describe('DashboardTileCanvas onMarkSelect plumbing', () => {
  it('forwards sheetId + onMarkSelect to EditorCanvas', () => {
    const fn = vi.fn();
    const { getByTestId } = render(
      <DashboardTileCanvas
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tile={{ id: 't1', chart_spec: { type: 'cartesian', encoding: {} }, columns: [], rows: [] } as any}
        sheetId="sheet-a"
        onMarkSelect={fn}
      />,
    );
    const ec = getByTestId('editor-canvas');
    expect(ec.getAttribute('data-sheet-id')).toBe('sheet-a');
    expect(ec.getAttribute('data-has-on-mark-select')).toBe('true');
  });

  it('does not pass sheetId when omitted (legacy callers)', () => {
    const { getByTestId } = render(
      <DashboardTileCanvas
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tile={{ id: 't1', chart_spec: { type: 'cartesian', encoding: {} }, columns: [], rows: [] } as any}
      />,
    );
    expect(getByTestId('editor-canvas').getAttribute('data-sheet-id')).toBe('');
    expect(getByTestId('editor-canvas').getAttribute('data-has-on-mark-select')).toBe('false');
  });
});
