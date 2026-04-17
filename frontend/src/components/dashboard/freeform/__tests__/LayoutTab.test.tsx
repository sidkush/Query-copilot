import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import LayoutTab from '../panels/zoneInspector/LayoutTab';

function tiledZone(extra: Record<string, unknown> = {}) {
  return { id: 'z1', type: 'worksheet', worksheetRef: 'z1', w: 50000, h: 30000, ...extra } as any;
}
function floatingZone(extra: Record<string, unknown> = {}) {
  return {
    id: 'f1', type: 'blank', w: 0, h: 0, floating: true,
    x: 10, y: 20, pxW: 400, pxH: 300, zIndex: 1, ...extra,
  } as any;
}

describe('LayoutTab (Plan 5d)', () => {
  it('renders tiled marker + read-only proportion % for a tiled zone', () => {
    render(<LayoutTab zone={tiledZone()} onPatch={vi.fn()} />);
    expect(screen.getByLabelText(/^position$/i)).toHaveTextContent(/tiled/i);
    expect(screen.getByLabelText(/width %/i)).toHaveValue(50);
    expect(screen.getByLabelText(/height %/i)).toHaveValue(30);
  });

  it('renders X/Y pixel inputs for a floating zone', () => {
    render(<LayoutTab zone={floatingZone()} onPatch={vi.fn()} />);
    expect(screen.getByLabelText(/x \(px\)/i)).toHaveValue(10);
    expect(screen.getByLabelText(/y \(px\)/i)).toHaveValue(20);
  });

  it('fires onPatch({ innerPadding }) when the slider changes', () => {
    const onPatch = vi.fn();
    render(<LayoutTab zone={tiledZone()} onPatch={onPatch} />);
    fireEvent.change(screen.getByLabelText(/inner padding/i), { target: { value: '12' } });
    expect(onPatch).toHaveBeenCalledWith({ innerPadding: 12 });
  });

  it('fires onPatch({ fitMode }) when size mode changes', () => {
    const onPatch = vi.fn();
    render(<LayoutTab zone={tiledZone()} onPatch={onPatch} />);
    fireEvent.change(screen.getByLabelText(/size mode/i), { target: { value: 'fit-width' } });
    expect(onPatch).toHaveBeenCalledWith({ fitMode: 'fit-width' });
  });

  it('clamps inner padding to 0–100', () => {
    const onPatch = vi.fn();
    render(<LayoutTab zone={tiledZone()} onPatch={onPatch} />);
    fireEvent.change(screen.getByLabelText(/inner padding/i), { target: { value: '250' } });
    expect(onPatch).toHaveBeenCalledWith({ innerPadding: 100 });
    fireEvent.change(screen.getByLabelText(/inner padding/i), { target: { value: '-5' } });
    expect(onPatch).toHaveBeenCalledWith({ innerPadding: 0 });
  });
});
