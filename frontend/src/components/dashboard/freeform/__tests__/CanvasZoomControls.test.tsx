import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CanvasZoomControls from '../CanvasZoomControls';
import { useStore } from '../../../../store';

function reset() {
  useStore.setState({
    analystProCanvasZoom: 1.0,
    analystProCanvasPan: { x: 100, y: 100 },
  });
}

describe('<CanvasZoomControls />', () => {
  beforeEach(reset);

  it('displays the current zoom as a percentage', () => {
    useStore.setState({ analystProCanvasZoom: 1.5 });
    render(<CanvasZoomControls />);
    expect(screen.getByTestId('canvas-zoom-display')).toHaveTextContent('150%');
  });

  it('clicking a preset sets that zoom', () => {
    render(<CanvasZoomControls />);
    fireEvent.click(screen.getByTestId('zoom-preset-50'));
    expect(useStore.getState().analystProCanvasZoom).toBe(0.5);
  });

  it('clicking Fit resets zoom to 1 and pan to {0,0}', () => {
    useStore.setState({ analystProCanvasZoom: 2.5, analystProCanvasPan: { x: -200, y: -150 } });
    render(<CanvasZoomControls />);
    fireEvent.click(screen.getByTestId('zoom-fit'));
    expect(useStore.getState().analystProCanvasZoom).toBe(1.0);
    expect(useStore.getState().analystProCanvasPan).toEqual({ x: 0, y: 0 });
  });

  it('has all seven preset buttons', () => {
    render(<CanvasZoomControls />);
    for (const pct of [25, 50, 75, 100, 150, 200]) {
      expect(screen.getByTestId(`zoom-preset-${pct}`)).toBeInTheDocument();
    }
    expect(screen.getByTestId('zoom-fit')).toBeInTheDocument();
  });
});
