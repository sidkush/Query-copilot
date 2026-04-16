/**
 * InstancePool — unified pool for Vega Canvas / Vega SVG / MapLibre / deck.gl /
 * Three.js renderer instances.
 *
 * Replaces the legacy `lib/webglContextPool.js`, which only counted WebGL
 * contexts. The new pool is also memory-aware so dashboards dense with Vega
 * Canvas tiles don't OOM the renderer process even if zero WebGL contexts
 * are open.
 *
 * Eviction: LRU, with a preference for WebGL-consuming kinds when both a
 * WebGL and non-WebGL slot are eligible — WebGL contexts are the scarcer
 * resource on most GPUs.
 */

export type InstanceKind = 'vega-svg' | 'vega-canvas' | 'maplibre' | 'deck' | 'three' | 'custom-iframe';

interface SlotEntry {
  kind: InstanceKind;
  id: string;
  lastUsed: number;
  onEvict: () => void;
}

interface InstanceWeight {
  webglContext: 0 | 1;
  estimatedMb: number;
}

const WEIGHTS: Record<InstanceKind, InstanceWeight> = {
  'vega-svg': { webglContext: 0, estimatedMb: 5 },
  'vega-canvas': { webglContext: 0, estimatedMb: 12 },
  maplibre: { webglContext: 1, estimatedMb: 60 },
  deck: { webglContext: 1, estimatedMb: 80 },
  three: { webglContext: 1, estimatedMb: 50 },
  'custom-iframe': { webglContext: 0, estimatedMb: 30 },
};

export interface InstancePoolOptions {
  max?: number;
  memoryCapMb?: number;
}

export class InstancePool {
  private slots = new Map<string, SlotEntry>();
  private max: number;
  private memoryCap: number;
  /** Monotonic counter for deterministic LRU ordering (unaffected by clock). */
  private tick = 0;

  constructor(options: InstancePoolOptions = {}) {
    this.max = options.max ?? 12;
    this.memoryCap = options.memoryCapMb ?? 700;
  }

  acquireSlot(kind: InstanceKind, id: string, onEvict: () => void): void {
    if (!id) return;
    this.tick += 1;
    this.slots.set(id, { kind, id, lastUsed: this.tick, onEvict });
    this.enforceCap();
  }

  touchSlot(id: string): void {
    const entry = this.slots.get(id);
    if (entry) {
      this.tick += 1;
      entry.lastUsed = this.tick;
    }
  }

  releaseSlot(id: string): void {
    this.slots.delete(id);
  }

  activeWebglContexts(): number {
    let n = 0;
    for (const e of this.slots.values()) n += WEIGHTS[e.kind].webglContext;
    return n;
  }

  estimatedMemoryMb(): number {
    let m = 0;
    for (const e of this.slots.values()) m += WEIGHTS[e.kind].estimatedMb;
    return m;
  }

  pressureRatio(): number {
    const webglRatio = this.activeWebglContexts() / this.max;
    const memoryRatio = this.estimatedMemoryMb() / this.memoryCap;
    return Math.max(webglRatio, memoryRatio);
  }

  size(): number {
    return this.slots.size;
  }

  private enforceCap(): void {
    while (this.slots.size > this.max || this.estimatedMemoryMb() > this.memoryCap) {
      const victim = this.pickVictim();
      if (!victim) break;
      try {
        victim.onEvict();
      } catch {
        // swallow eviction handler errors
      }
      this.slots.delete(victim.id);
    }
  }

  private pickVictim(): SlotEntry | null {
    let webglVictim: SlotEntry | null = null;
    let webglTs = Infinity;
    let anyVictim: SlotEntry | null = null;
    let anyTs = Infinity;
    for (const e of this.slots.values()) {
      if (e.lastUsed < anyTs) {
        anyTs = e.lastUsed;
        anyVictim = e;
      }
      if (WEIGHTS[e.kind].webglContext === 1 && e.lastUsed < webglTs) {
        webglTs = e.lastUsed;
        webglVictim = e;
      }
    }
    return webglVictim ?? anyVictim;
  }
}

/** Process-wide singleton. */
export const globalInstancePool = new InstancePool();

/**
 * Detect GPU capabilities for adaptive pool sizing.
 * Uses WEBGL_debug_renderer_info when available.
 */
export function detectGpuCapabilities(): {
  renderer: string;
  vendor: string;
  estimatedTier: 'low' | 'medium' | 'high';
  maxContexts: number;
} {
  const defaults = { renderer: 'unknown', vendor: 'unknown', estimatedTier: 'medium' as const, maxContexts: 12 };

  if (typeof document === 'undefined') return defaults;

  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return defaults;

    const ext = (gl as WebGLRenderingContext).getExtension('WEBGL_debug_renderer_info');
    const renderer = ext
      ? (gl as WebGLRenderingContext).getParameter(ext.UNMASKED_RENDERER_WEBGL)
      : 'unknown';
    const vendor = ext
      ? (gl as WebGLRenderingContext).getParameter(ext.UNMASKED_VENDOR_WEBGL)
      : 'unknown';

    // Heuristic tier detection
    const rendererLower = String(renderer).toLowerCase();
    let estimatedTier: 'low' | 'medium' | 'high' = 'medium';
    let maxContexts = 12;

    if (rendererLower.includes('intel') && !rendererLower.includes('iris xe')) {
      estimatedTier = 'low';
      maxContexts = 6;
    } else if (rendererLower.includes('nvidia') || rendererLower.includes('amd') || rendererLower.includes('radeon')) {
      estimatedTier = 'high';
      maxContexts = 16;
    } else if (rendererLower.includes('apple') || rendererLower.includes('m1') || rendererLower.includes('m2') || rendererLower.includes('m3')) {
      estimatedTier = 'high';
      maxContexts = 16;
    }

    // Clean up
    const loseContext = (gl as WebGLRenderingContext).getExtension('WEBGL_lose_context');
    loseContext?.loseContext();

    return { renderer: String(renderer), vendor: String(vendor), estimatedTier, maxContexts };
  } catch {
    return defaults;
  }
}
