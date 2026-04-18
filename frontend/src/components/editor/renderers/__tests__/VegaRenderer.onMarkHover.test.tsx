import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import VegaRenderer from '../VegaRenderer';

vi.mock('react-vega', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  VegaLite: ({ onNewView }: any) => {
    const listeners: Record<string, any> = {};
    const view = {
      addEventListener: (name: string, cb: any) => { listeners[name] = cb; },
      addSignalListener: () => {},
      __triggerMouseover: (datum: any) => {
        listeners.mouseover?.(
          { clientX: 11, clientY: 22 },
          { datum },
        );
      },
    };
    setTimeout(() => onNewView?.(view), 0);
    (globalThis as any).__lastVegaView = view;
    return <div data-testid="vega-mock" />;
  },
}));

const stubSpec = {
  type: 'cartesian',
  encoding: { x: { field: 'a' }, y: { field: 'b' } },
} as unknown as Parameters<typeof VegaRenderer>[0]['spec'];

describe('VegaRenderer onMarkHover (Plan 6e)', () => {
  it('emits onMarkHover with sheetId, datum, and screen coords', async () => {
    const onMarkHover = vi.fn();
    render(
      <VegaRenderer
        spec={stubSpec}
        resultSet={{ columns: ['a', 'b'], rows: [[1, 2]] }}
        sheetId="sheet-x"
        onMarkHover={onMarkHover}
      />,
    );
    await new Promise((r) => setTimeout(r, 5));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__lastVegaView.__triggerMouseover({ a: 1, b: 2, _vgsid_: 99 });
    expect(onMarkHover).toHaveBeenCalledWith(
      'sheet-x',
      { a: 1, b: 2 },
      11,
      22,
    );
  });

  it('does NOT mount MiniChartTooltip when onMarkHover is supplied', async () => {
    const { queryByTestId } = render(
      <VegaRenderer
        spec={stubSpec}
        resultSet={{ columns: ['a', 'b'], rows: [[1, 2]] }}
        sheetId="sheet-x"
        onMarkHover={() => {}}
      />,
    );
    await new Promise((r) => setTimeout(r, 5));
    expect(queryByTestId('mini-chart-tooltip')).toBeNull();
  });
});
