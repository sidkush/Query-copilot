import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import CanvasRulers from '../CanvasRulers';

describe('<CanvasRulers />', () => {
  it('renders both rulers', () => {
    render(<CanvasRulers canvasWidth={800} canvasHeight={600} zoom={1} pan={{ x: 0, y: 0 }} />);
    expect(screen.getByTestId('canvas-ruler-h')).toBeInTheDocument();
    expect(screen.getByTestId('canvas-ruler-v')).toBeInTheDocument();
  });

  it('emits labels every 100 sheet px at zoom 1, pan 0', () => {
    render(<CanvasRulers canvasWidth={800} canvasHeight={600} zoom={1} pan={{ x: 0, y: 0 }} />);
    for (const px of [0, 100, 400, 700]) {
      expect(screen.getByTestId(`ruler-h-label-${px}`)).toBeInTheDocument();
    }
  });

  it('scales label positions with zoom', () => {
    render(<CanvasRulers canvasWidth={800} canvasHeight={600} zoom={2} pan={{ x: 0, y: 0 }} />);
    const label100 = screen.getByTestId('ruler-h-label-100');
    expect(label100).toHaveStyle({ left: '200px' });
  });

  it('offsets labels by pan', () => {
    render(<CanvasRulers canvasWidth={800} canvasHeight={600} zoom={1} pan={{ x: 50, y: 0 }} />);
    const label100 = screen.getByTestId('ruler-h-label-100');
    expect(label100).toHaveStyle({ left: '150px' });
  });
});
