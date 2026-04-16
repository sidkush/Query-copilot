/**
 * WebGL instanced scatter renderer using regl.
 *
 * For >10k point marks in browser, this replaces Canvas 2D fillRect
 * with GPU-instanced circle drawing — SDF anti-aliased circles in
 * a single draw call.
 *
 * Performance: 100k points in ~3ms (vs ~15ms Canvas fillRect)
 */

import type { InstanceBuffers } from './buffers';
import { IS_BROWSER } from '../canvas-factory';

let _reglCanvas: HTMLCanvasElement | null = null;
let _reglInstance: any = null;
let _drawCmd: any = null;
let _reglCreateFn: any = null;

const VERT = `
  precision highp float;
  attribute vec2 position;
  attribute vec2 center;
  attribute float radius;
  attribute vec3 color;
  uniform vec2 resolution;
  varying vec2 vUV;
  varying vec3 vColor;
  void main() {
    vUV = position;
    vColor = color;
    vec2 p = center + position * radius;
    gl_Position = vec4(
      (p.x / resolution.x) * 2.0 - 1.0,
      1.0 - (p.y / resolution.y) * 2.0,
      0.0, 1.0
    );
  }
`;

const FRAG = `
  precision highp float;
  varying vec2 vUV;
  varying vec3 vColor;
  uniform float uAlpha;
  void main() {
    float d = length(vUV);
    float alpha = 1.0 - smoothstep(0.85, 1.0, d);
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(vColor, alpha * uAlpha);
  }
`;

const QUAD_VERTS = new Float32Array([
  -1, -1,  1, -1,  1, 1,
  -1, -1,  1,  1, -1, 1,
]);

function hexToRGB(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
}

/**
 * Initialize regl with a provided factory function.
 * Call this from browser/main.ts after importing regl.
 */
export function initRegl(createRegl: any): void {
  _reglCreateFn = createRegl;
}

function ensureRegl(width: number, height: number): boolean {
  if (!IS_BROWSER || !_reglCreateFn) return false;

  try {
    if (!_reglCanvas) {
      _reglCanvas = document.createElement('canvas');
    }

    // Resize if needed
    if (_reglCanvas.width !== width || _reglCanvas.height !== height) {
      _reglCanvas.width = width;
      _reglCanvas.height = height;
      // Must recreate regl instance on resize
      if (_reglInstance) {
        try { _reglInstance.destroy(); } catch {}
      }
      _reglInstance = null;
      _drawCmd = null;
    }

    if (!_reglInstance) {
      _reglInstance = _reglCreateFn({
        canvas: _reglCanvas,
        attributes: { alpha: true, premultipliedAlpha: false, antialias: true },
      });
      _drawCmd = null;
    }

    if (!_drawCmd) {
      _drawCmd = _reglInstance({
        vert: VERT,
        frag: FRAG,
        attributes: {
          position: { buffer: _reglInstance.buffer(QUAD_VERTS), size: 2, divisor: 0 },
          center: { buffer: _reglInstance.prop('centerBuf' as any), size: 2, divisor: 1 },
          radius: { buffer: _reglInstance.prop('radiusBuf' as any), size: 1, divisor: 1 },
          color: { buffer: _reglInstance.prop('colorBuf' as any), size: 3, divisor: 1 },
        },
        uniforms: {
          resolution: _reglInstance.prop('resolution' as any),
          uAlpha: _reglInstance.prop('alpha' as any),
        },
        count: 6,
        instances: _reglInstance.prop('instances' as any),
        blend: {
          enable: true,
          func: { srcRGB: 'src alpha', srcAlpha: 'one', dstRGB: 'one minus src alpha', dstAlpha: 'one minus src alpha' },
        },
        depth: { enable: false },
      });
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Render scatter points via WebGL instanced draw.
 * Returns true if WebGL was used, false if fallback needed.
 */
export function renderScatterWebGL(
  targetCtx: CanvasRenderingContext2D,
  buffers: InstanceBuffers,
  plotBounds: { left: number; right: number; top: number; bottom: number },
  canvasWidth: number,
  canvasHeight: number,
  alpha = 0.8,
): boolean {
  if (!ensureRegl(canvasWidth, canvasHeight)) return false;

  const { x, y, size, colorIdx, count, palette } = buffers;

  const centers = new Float32Array(count * 2);
  const radii = new Float32Array(count);
  const colors = new Float32Array(count * 3);

  const palRGB = palette.map(hexToRGB);

  let visible = 0;
  for (let i = 0; i < count; i++) {
    const px = x[i], py = y[i];
    if (px < plotBounds.left || px > plotBounds.right ||
        py < plotBounds.top || py > plotBounds.bottom) continue;

    centers[visible * 2] = px;
    centers[visible * 2 + 1] = py;
    radii[visible] = Math.max(1.5, size[i]);
    const rgb = palRGB[colorIdx[i]] ?? palRGB[0];
    colors[visible * 3] = rgb[0];
    colors[visible * 3 + 1] = rgb[1];
    colors[visible * 3 + 2] = rgb[2];
    visible++;
  }

  if (visible === 0) return true;

  try {
    _reglInstance.clear({ color: [0, 0, 0, 0] });

    // Create buffers for this frame
    const centerBuf = _reglInstance.buffer(centers.subarray(0, visible * 2));
    const radiusBuf = _reglInstance.buffer(radii.subarray(0, visible));
    const colorBuf = _reglInstance.buffer(colors.subarray(0, visible * 3));

    _drawCmd({
      centerBuf,
      radiusBuf,
      colorBuf,
      resolution: [canvasWidth, canvasHeight],
      alpha,
      instances: visible,
    });

    // Composite onto Canvas 2D
    targetCtx.drawImage(_reglCanvas!, 0, 0);

    // Clean up GPU buffers
    centerBuf.destroy();
    radiusBuf.destroy();
    colorBuf.destroy();

    return true;
  } catch {
    return false;
  }
}

/**
 * Check if WebGL instanced rendering is available.
 */
export function isWebGLAvailable(): boolean {
  if (!IS_BROWSER) return false;
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl');
    if (!gl) return false;
    // Check for ANGLE_instanced_arrays (needed for instanced draw)
    const ext = gl.getExtension('ANGLE_instanced_arrays');
    return !!ext;
  } catch {
    return false;
  }
}
