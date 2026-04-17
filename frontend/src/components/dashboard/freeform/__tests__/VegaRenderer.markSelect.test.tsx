import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import VegaRenderer from '../../../editor/renderers/VegaRenderer';

type Listener = (event: unknown, item: unknown) => void;
const eventListeners = new Map<string, Listener[]>();

vi.mock('react-vega', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  VegaLite: ({ onNewView }: any) => {
    const fakeView = {
      addEventListener: (name: string, fn: Listener) => {
        const list = eventListeners.get(name) ?? [];
        list.push(fn);
        eventListeners.set(name, list);
      },
      addSignalListener: () => {},
      change: () => ({ insert: () => ({ run: () => {} }) }),
      run: () => {},
    };
    setTimeout(() => onNewView?.(fakeView), 0);
    return <div data-testid="vega-mock" />;
  },
}));

const baseSpec = {
  type: 'cartesian',
  encoding: { x: { field: 'region' }, y: { field: 'sales' } },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;
const resultSet = { columns: ['region', 'sales'], rows: [['East', 10]] };

beforeEach(() => eventListeners.clear());

function fireClick(event: Partial<MouseEvent>, item: unknown) {
  for (const fn of eventListeners.get('click') ?? []) fn(event, item);
}

describe('VegaRenderer onMarkSelect', () => {
  it('fires onMarkSelect with datum fields and shiftKey on mark click', async () => {
    const onMarkSelect = vi.fn();
    render(
      <VegaRenderer
        spec={baseSpec}
        resultSet={resultSet}
        sheetId="sheet-a"
        onMarkSelect={onMarkSelect}
      />,
    );
    await waitFor(() => expect(eventListeners.get('click')?.length).toBeGreaterThan(0));
    fireClick({ shiftKey: false }, { datum: { region: 'East', sales: 10, _vgsid_: 99 } });
    expect(onMarkSelect).toHaveBeenCalledWith(
      'sheet-a',
      { region: 'East', sales: 10 },
      { shiftKey: false },
    );
  });

  it('fires onMarkSelect with null on empty-area click', async () => {
    const onMarkSelect = vi.fn();
    render(
      <VegaRenderer
        spec={baseSpec}
        resultSet={resultSet}
        sheetId="sheet-a"
        onMarkSelect={onMarkSelect}
      />,
    );
    await waitFor(() => expect(eventListeners.get('click')?.length).toBeGreaterThan(0));
    fireClick({ shiftKey: false }, null);
    expect(onMarkSelect).toHaveBeenCalledWith('sheet-a', null, { shiftKey: false });
  });

  it('forwards shiftKey=true on shift+click', async () => {
    const onMarkSelect = vi.fn();
    render(
      <VegaRenderer
        spec={baseSpec}
        resultSet={resultSet}
        sheetId="sheet-a"
        onMarkSelect={onMarkSelect}
      />,
    );
    await waitFor(() => expect(eventListeners.get('click')?.length).toBeGreaterThan(0));
    fireClick({ shiftKey: true }, { datum: { region: 'East', sales: 10 } });
    expect(onMarkSelect).toHaveBeenCalledWith(
      'sheet-a',
      { region: 'East', sales: 10 },
      { shiftKey: true },
    );
  });

  it('does NOT call onMarkSelect when sheetId is empty (preserves legacy)', async () => {
    const onMarkSelect = vi.fn();
    render(
      <VegaRenderer
        spec={baseSpec}
        resultSet={resultSet}
        onMarkSelect={onMarkSelect}
      />,
    );
    await waitFor(() => eventListeners.get('click') !== undefined);
    fireClick({ shiftKey: false }, { datum: { region: 'East' } });
    expect(onMarkSelect).not.toHaveBeenCalled();
  });
});
