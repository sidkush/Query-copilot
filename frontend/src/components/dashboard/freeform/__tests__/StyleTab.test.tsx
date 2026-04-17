import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import StyleTab from '../panels/zoneInspector/StyleTab';

function zone(extra: Record<string, unknown> = {}) {
  return { id: 'z1', type: 'worksheet', worksheetRef: 'z1', w: 100000, h: 100000, ...extra } as any;
}

describe('StyleTab (Plan 5d)', () => {
  it('patches background color on change', () => {
    const onPatch = vi.fn();
    render(<StyleTab zone={zone()} onPatch={onPatch} />);
    fireEvent.input(screen.getByLabelText(/background color/i), { target: { value: '#112233' } });
    expect(onPatch).toHaveBeenCalledWith({
      background: { color: '#112233', opacity: 1 },
    });
  });

  it('patches background opacity on slider change', () => {
    const onPatch = vi.fn();
    render(<StyleTab zone={zone({ background: { color: '#aabbcc', opacity: 1 } })} onPatch={onPatch} />);
    fireEvent.change(screen.getByLabelText(/background opacity/i), { target: { value: '0.5' } });
    expect(onPatch).toHaveBeenCalledWith({
      background: { color: '#aabbcc', opacity: 0.5 },
    });
  });

  it('patches border weight per-edge', () => {
    const onPatch = vi.fn();
    render(<StyleTab zone={zone()} onPatch={onPatch} />);
    fireEvent.change(screen.getByLabelText(/border left/i), { target: { value: '3' } });
    expect(onPatch).toHaveBeenCalledWith({
      border: { weight: [3, 0, 0, 0], color: '#000000', style: 'solid' },
    });
  });

  it('patches border style to dashed', () => {
    const onPatch = vi.fn();
    render(<StyleTab zone={zone()} onPatch={onPatch} />);
    fireEvent.change(screen.getByLabelText(/border style/i), { target: { value: 'dashed' } });
    expect(onPatch).toHaveBeenCalledWith({
      border: { weight: [0, 0, 0, 0], color: '#000000', style: 'dashed' },
    });
  });

  it('toggles Show Title', () => {
    const onPatch = vi.fn();
    render(<StyleTab zone={zone()} onPatch={onPatch} />);
    fireEvent.click(screen.getByLabelText(/show title/i));
    expect(onPatch).toHaveBeenCalledWith({ showTitle: false });
  });

  it('toggles Show Caption (worksheet only)', () => {
    const onPatch = vi.fn();
    render(<StyleTab zone={zone()} onPatch={onPatch} />);
    fireEvent.click(screen.getByLabelText(/show caption/i));
    expect(onPatch).toHaveBeenCalledWith({ showCaption: false });
  });

  it('hides Show Caption for non-worksheet zones', () => {
    render(<StyleTab zone={zone({ type: 'blank' })} onPatch={vi.fn()} />);
    expect(screen.queryByLabelText(/show caption/i)).toBeNull();
  });
});
