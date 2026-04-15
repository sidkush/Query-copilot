import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, createEvent } from '@testing-library/react';
import ChannelSlot from '../../../components/editor/ChannelSlot';

function buildDropEvent(payload: object) {
  const target = document.createElement('div');
  const ev = createEvent.drop(target);
  Object.defineProperty(ev, 'dataTransfer', {
    value: {
      getData: (type: string) =>
        type === 'application/x-askdb-field' ? JSON.stringify(payload) : '',
      types: ['application/x-askdb-field'],
    },
  });
  return ev;
}

describe('ChannelSlot semantic drop', () => {
  it('forwards semantic envelope drops via onSemanticDrop instead of onDrop', () => {
    const onDrop = vi.fn();
    const onSemanticDrop = vi.fn();
    render(
      <ChannelSlot
        channel="x"
        label="X"
        fieldRef={null}
        onDrop={onDrop}
        onRemove={() => {}}
        onChange={() => {}}
        onSemanticDrop={onSemanticDrop}
      />,
    );
    const slot = screen.getByTestId('channel-slot-x');
    const payload = {
      field: 'semantic:region',
      semanticType: 'nominal',
      role: 'dimension',
      semantic: { dimension: 'region' },
    };
    const ev = buildDropEvent(payload);
    fireEvent(slot, ev);
    expect(onSemanticDrop).toHaveBeenCalledWith({ dimension: 'region' }, 'x');
    expect(onDrop).not.toHaveBeenCalled();
  });

  it('rejects semantic drops that violate the channel allow list (size + dimension)', () => {
    const onDrop = vi.fn();
    const onSemanticDrop = vi.fn();
    render(
      <ChannelSlot
        channel="size"
        label="Size"
        fieldRef={null}
        onDrop={onDrop}
        onRemove={() => {}}
        onChange={() => {}}
        onSemanticDrop={onSemanticDrop}
      />,
    );
    const slot = screen.getByTestId('channel-slot-size');
    const payload = {
      field: 'semantic:region',
      semanticType: 'nominal',
      role: 'dimension',
      semantic: { dimension: 'region' },
    };
    const ev = buildDropEvent(payload);
    fireEvent(slot, ev);
    expect(onSemanticDrop).not.toHaveBeenCalled();
    // Allow-list rejection flashes invalid state.
    expect(slot.getAttribute('data-invalid')).toBe('true');
  });

  it('accepts semantic drops for measures/metrics into quantitative-only slots', () => {
    const onSemanticDrop = vi.fn();
    render(
      <ChannelSlot
        channel="size"
        label="Size"
        fieldRef={null}
        onDrop={() => {}}
        onRemove={() => {}}
        onChange={() => {}}
        onSemanticDrop={onSemanticDrop}
      />,
    );
    const slot = screen.getByTestId('channel-slot-size');
    const payload = {
      field: 'semantic:revenue',
      semanticType: 'quantitative',
      role: 'measure',
      semantic: { measure: 'revenue' },
    };
    const ev = buildDropEvent(payload);
    fireEvent(slot, ev);
    expect(onSemanticDrop).toHaveBeenCalledWith({ measure: 'revenue' }, 'size');
  });
});
