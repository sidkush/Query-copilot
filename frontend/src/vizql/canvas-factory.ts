/**
 * Canvas factory — browser-only canvas creation.
 *
 * Browser: uses native HTMLCanvasElement
 */

export const IS_BROWSER = true;

export interface PortableCanvas {
  width: number;
  height: number;
  getContext(type: '2d'): CanvasRenderingContext2D;
  toDataURL?(type?: string): string;
}

export function createPortableCanvas(width: number, height: number): PortableCanvas {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return c as unknown as PortableCanvas;
}

export function getOrCreateCanvas(
  target: HTMLCanvasElement | string | null,
  width: number,
  height: number,
): PortableCanvas {
  if (target) {
    const el = typeof target === 'string'
      ? document.querySelector<HTMLCanvasElement>(target)
      : target;
    if (el) { el.width = width; el.height = height; return el as unknown as PortableCanvas; }
  }
  return createPortableCanvas(width, height);
}
