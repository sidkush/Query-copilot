import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Guard: VizQLRenderer must scale canvas backing store by CSS zoom
 * to prevent blurry tiles when Analyst Pro freeform canvas is zoomed
 * via CSS transform: scale(zoom).
 *
 * Root cause: ResizeObserver.contentRect reports pre-transform dimensions;
 * canvas physical pixels = contentRect × dpr alone → raster is upscaled
 * by the CSS transform → bilinear blur.
 *
 * Fix: effectiveScale = dpr × cssZoom; canvas.width = cssWidth × effectiveScale.
 */
describe('VizQLRenderer zoom-aware DPR', () => {
  const src = readFileSync(
    resolve(__dirname, '../components/editor/renderers/VizQLRenderer.tsx'),
    'utf-8',
  );

  it('reads analystProCanvasZoom from the store', () => {
    expect(src).toContain('analystProCanvasZoom');
  });

  it('computes effectiveScale from dpr × cssZoom', () => {
    expect(src).toMatch(/effectiveScale\s*=\s*dpr\s*\*\s*cssZoom/);
  });

  it('uses effectiveScale for canvas backing store dimensions', () => {
    expect(src).toMatch(/canvasSize\.width\s*\*\s*effectiveScale/);
    expect(src).toMatch(/canvasSize\.height\s*\*\s*effectiveScale/);
  });

  it('uses effectiveScale in setTransform (not bare dpr)', () => {
    // Must NOT have setTransform(dpr, 0, 0, dpr, ...) — must use effectiveScale
    expect(src).toMatch(/setTransform\(effectiveScale/);
    expect(src).not.toMatch(/setTransform\(dpr,\s*0,\s*0,\s*dpr/);
  });

  it('includes cssZoom in render effect dependency array', () => {
    expect(src).toMatch(/\[\s*vizqlSpec[^\]]*cssZoom[^\]]*\]/s);
  });
});
