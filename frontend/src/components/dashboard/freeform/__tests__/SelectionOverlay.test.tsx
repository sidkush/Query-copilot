import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import SelectionOverlay from '../SelectionOverlay';

const makeResolved = () => [{
  zone: { id: 'z1', type: 'worksheet' as const, w: 100000, h: 100000, worksheetRef: 'ws1' },
  x: 0, y: 0, width: 400, height: 300,
}];

describe('SelectionOverlay — click-through behavior', () => {
  it('selection ring body has pointer-events: none so underlying buttons receive clicks', () => {
    render(<SelectionOverlay selectedResolved={makeResolved()} />);
    const ring = screen.getByTestId('selection-ring-z1') as HTMLDivElement;
    expect(ring.style.pointerEvents).toBe('none');
  });

  it('resize handles still receive pointer events (pointer-events: auto)', () => {
    render(<SelectionOverlay selectedResolved={makeResolved()} />);
    const handleNe = screen.getByTestId('resize-handle-z1-ne') as HTMLDivElement;
    expect(handleNe.style.pointerEvents).toBe('auto');
  });
});
