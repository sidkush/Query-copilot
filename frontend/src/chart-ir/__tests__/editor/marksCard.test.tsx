import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MarksCard from '../../../components/editor/MarksCard';
import { SIMPLE_BAR } from '../fixtures/canonical-charts';
import type { ChartSpec } from '../../types';

function makeDragEvent(payload: unknown) {
  const data: Record<string, string> = {
    'application/x-askdb-field': JSON.stringify(payload),
  };
  return {
    dataTransfer: {
      types: ['application/x-askdb-field'],
      getData: (key: string) => data[key] || '',
      setData: vi.fn(),
      dropEffect: '',
      effectAllowed: '',
    },
    preventDefault: vi.fn(),
  };
}

describe('MarksCard', () => {
  it('renders positional + channel slots for a cartesian spec', () => {
    render(<MarksCard spec={SIMPLE_BAR} onSpecChange={() => {}} />);
    expect(screen.getByTestId('marks-card')).toBeDefined();
    // Positionals
    expect(screen.getByTestId('channel-slot-x')).toBeDefined();
    expect(screen.getByTestId('channel-slot-y')).toBeDefined();
    // Channels
    expect(screen.getByTestId('channel-slot-color')).toBeDefined();
    expect(screen.getByTestId('channel-slot-size')).toBeDefined();
    expect(screen.getByTestId('channel-slot-shape')).toBeDefined();
    expect(screen.getByTestId('channel-slot-tooltip')).toBeDefined();
  });

  it('renders the existing encoding bindings as pills', () => {
    render(<MarksCard spec={SIMPLE_BAR} onSpecChange={() => {}} />);
    const xSlot = screen.getByTestId('channel-slot-x');
    const ySlot = screen.getByTestId('channel-slot-y');
    expect(xSlot.getAttribute('data-filled')).toBe('true');
    expect(ySlot.getAttribute('data-filled')).toBe('true');
  });

  it('dispatches an add patch on dropping a field into an empty channel', () => {
    const onSpecChange = vi.fn();
    render(<MarksCard spec={SIMPLE_BAR} onSpecChange={onSpecChange} />);

    const colorSlot = screen.getByTestId('channel-slot-color');
    const payload = {
      field: 'region',
      semanticType: 'nominal',
      role: 'dimension',
    };
    // Simulate dragover then drop
    fireEvent.dragOver(colorSlot, makeDragEvent(payload));
    fireEvent.drop(colorSlot, makeDragEvent(payload));

    expect(onSpecChange).toHaveBeenCalledTimes(1);
    const nextSpec = onSpecChange.mock.calls[0]?.[0] as ChartSpec;
    expect(nextSpec.encoding?.color).toEqual({ field: 'region', type: 'nominal' });
    // Original spec not mutated
    expect(SIMPLE_BAR.encoding?.color).toBeUndefined();
  });

  it('auto-aggregates measures when dropped on X/Y/size/opacity', () => {
    const onSpecChange = vi.fn();
    const bareSpec: ChartSpec = {
      $schema: 'askdb/chart-spec/v1',
      type: 'cartesian',
      mark: 'bar',
    };
    render(<MarksCard spec={bareSpec} onSpecChange={onSpecChange} />);
    const xSlot = screen.getByTestId('channel-slot-x');
    const payload = {
      field: 'revenue',
      semanticType: 'quantitative',
      role: 'measure',
    };
    fireEvent.dragOver(xSlot, makeDragEvent(payload));
    fireEvent.drop(xSlot, makeDragEvent(payload));

    const nextSpec = onSpecChange.mock.calls[0]?.[0] as ChartSpec;
    expect(nextSpec.encoding?.x).toEqual({
      field: 'revenue',
      type: 'quantitative',
      aggregate: 'sum',
    });
  });

  it('blocks non-quantitative drops onto the Size channel', () => {
    const onSpecChange = vi.fn();
    render(<MarksCard spec={SIMPLE_BAR} onSpecChange={onSpecChange} />);
    const sizeSlot = screen.getByTestId('channel-slot-size');
    const payload = {
      field: 'region',
      semanticType: 'nominal',
      role: 'dimension',
    };
    fireEvent.dragOver(sizeSlot, makeDragEvent(payload));
    fireEvent.drop(sizeSlot, makeDragEvent(payload));
    expect(onSpecChange).not.toHaveBeenCalled();
    expect(sizeSlot.getAttribute('data-invalid')).toBe('true');
  });

  it('replaces the existing binding when a new field is dropped onto a filled channel', () => {
    const onSpecChange = vi.fn();
    render(<MarksCard spec={SIMPLE_BAR} onSpecChange={onSpecChange} />);
    const xSlot = screen.getByTestId('channel-slot-x');
    const payload = {
      field: 'product',
      semanticType: 'nominal',
      role: 'dimension',
    };
    fireEvent.dragOver(xSlot, makeDragEvent(payload));
    fireEvent.drop(xSlot, makeDragEvent(payload));
    const nextSpec = onSpecChange.mock.calls[0]?.[0] as ChartSpec;
    expect(nextSpec.encoding?.x).toEqual({ field: 'product', type: 'nominal' });
  });

  it('renders a disabled banner for non-cartesian specs', () => {
    const mapSpec: ChartSpec = {
      $schema: 'askdb/chart-spec/v1',
      type: 'map',
      map: { provider: 'maplibre', style: 'positron', center: [0, 0], zoom: 2, layers: [] },
    };
    render(<MarksCard spec={mapSpec} onSpecChange={() => {}} />);
    expect(screen.getByTestId('marks-card-disabled')).toBeDefined();
    expect(screen.queryByTestId('marks-card')).toBeNull();
  });
});
