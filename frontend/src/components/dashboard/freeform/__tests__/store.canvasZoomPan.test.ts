import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../../../../store';

describe('analyst pro canvas view-state slices', () => {
  beforeEach(() => {
    useStore.setState({
      analystProCanvasZoom: 1.0,
      analystProCanvasPan: { x: 0, y: 0 },
      analystProRulersVisible: false,
      analystProActiveDevice: 'desktop',
    });
  });

  it('has sensible defaults', () => {
    const s = useStore.getState();
    expect(s.analystProCanvasZoom).toBe(1.0);
    expect(s.analystProCanvasPan).toEqual({ x: 0, y: 0 });
    expect(s.analystProRulersVisible).toBe(false);
    expect(s.analystProActiveDevice).toBe('desktop');
  });

  it('setCanvasZoomAnalystPro clamps to [0.1, 4.0]', () => {
    useStore.getState().setCanvasZoomAnalystPro(10);
    expect(useStore.getState().analystProCanvasZoom).toBe(4.0);
    useStore.getState().setCanvasZoomAnalystPro(0.01);
    expect(useStore.getState().analystProCanvasZoom).toBe(0.1);
    useStore.getState().setCanvasZoomAnalystPro(1.5);
    expect(useStore.getState().analystProCanvasZoom).toBe(1.5);
  });

  it('setCanvasZoomAnalystPro with anchor keeps sheet point under cursor', () => {
    useStore.getState().setCanvasZoomAnalystPro(2.0, { sheetX: 200, sheetY: 200, screenX: 200, screenY: 200 });
    const s = useStore.getState();
    expect(s.analystProCanvasZoom).toBe(2.0);
    expect(s.analystProCanvasPan).toEqual({ x: -200, y: -200 });
  });

  it('setCanvasPanAnalystPro sets pan coords', () => {
    useStore.getState().setCanvasPanAnalystPro(42, -17);
    expect(useStore.getState().analystProCanvasPan).toEqual({ x: 42, y: -17 });
  });

  it('toggleRulersAnalystPro flips boolean', () => {
    useStore.getState().toggleRulersAnalystPro();
    expect(useStore.getState().analystProRulersVisible).toBe(true);
    useStore.getState().toggleRulersAnalystPro();
    expect(useStore.getState().analystProRulersVisible).toBe(false);
  });

  it('setActiveDeviceAnalystPro accepts desktop|tablet|phone', () => {
    useStore.getState().setActiveDeviceAnalystPro('tablet');
    expect(useStore.getState().analystProActiveDevice).toBe('tablet');
    useStore.getState().setActiveDeviceAnalystPro('phone');
    expect(useStore.getState().analystProActiveDevice).toBe('phone');
    useStore.getState().setActiveDeviceAnalystPro('desktop');
    expect(useStore.getState().analystProActiveDevice).toBe('desktop');
  });

  it('setActiveDeviceAnalystPro ignores unknown device names', () => {
    useStore.getState().setActiveDeviceAnalystPro('desktop');
    // @ts-expect-error intentionally invalid
    useStore.getState().setActiveDeviceAnalystPro('watch');
    expect(useStore.getState().analystProActiveDevice).toBe('desktop');
  });
});
