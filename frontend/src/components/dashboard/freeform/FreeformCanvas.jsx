// frontend/src/components/dashboard/freeform/FreeformCanvas.jsx
import { useMemo, useRef, useState, useEffect } from 'react';
import { resolveLayout } from './lib/layoutResolver';
import ZoneRenderer from './ZoneRenderer';
import FloatingLayer from './FloatingLayer';
import { FIXED_PRESETS } from './lib/types';

/**
 * FreeformCanvas — the root authoring surface for Analyst Pro.
 *
 * Responsibilities in Plan 1 (read-only):
 *   1. Resolve canvas dimensions from `dashboard.size` + container bounds.
 *   2. Run the zone tree + floating layer through `resolveLayout`.
 *   3. Pass resolved coords to ZoneRenderer + FloatingLayer.
 *   4. Re-resolve on viewport resize (Automatic / Range modes).
 *
 * Plan 2 will extend this with drag/resize/select handlers.
 */
export default function FreeformCanvas({ dashboard, renderLeaf }) {
  const containerRef = useRef(null);
  const [viewportSize, setViewportSize] = useState({ width: 1200, height: 800 });

  // Measure container on mount + on resize
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setViewportSize({
          width: Math.floor(entry.contentRect.width),
          height: Math.floor(entry.contentRect.height),
        });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const canvasSize = useMemo(() => {
    return resolveCanvasSize(dashboard.size, viewportSize);
  }, [dashboard.size, viewportSize]);

  const resolved = useMemo(() => {
    return resolveLayout(
      dashboard.tiledRoot,
      dashboard.floatingLayer || [],
      canvasSize.width,
      canvasSize.height,
    );
  }, [dashboard.tiledRoot, dashboard.floatingLayer, canvasSize.width, canvasSize.height]);

  const resolvedMap = useMemo(() => {
    const m = new Map();
    for (const r of resolved) m.set(r.zone.id, r);
    return m;
  }, [resolved]);

  return (
    <div
      ref={containerRef}
      data-testid="freeform-canvas"
      data-archetype="analyst-pro"
      data-size-mode={dashboard.size?.mode ?? 'automatic'}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'auto',
        background: 'var(--archetype-analyst-pro-bg, var(--bg-page))',
      }}
    >
      <div
        data-testid="freeform-sheet"
        style={{
          position: 'relative',
          width: canvasSize.width,
          height: canvasSize.height,
          margin: dashboard.size?.mode === 'automatic' ? 0 : '0 auto',
        }}
      >
        <ZoneRenderer
          root={dashboard.tiledRoot}
          resolvedMap={resolvedMap}
          renderLeaf={renderLeaf}
        />
        <FloatingLayer zones={dashboard.floatingLayer || []} renderLeaf={renderLeaf} />
      </div>
    </div>
  );
}

function resolveCanvasSize(size, viewport) {
  if (!size || size.mode === 'automatic') {
    return { width: viewport.width || 1200, height: viewport.height || 800 };
  }
  if (size.mode === 'fixed') {
    if (size.preset && size.preset !== 'custom') {
      const preset = FIXED_PRESETS[size.preset];
      return { width: preset?.width ?? 1200, height: preset?.height ?? 800 };
    }
    return { width: size.width ?? 1200, height: size.height ?? 800 };
  }
  if (size.mode === 'range') {
    const w = Math.min(Math.max(viewport.width, size.minWidth), size.maxWidth);
    const h = Math.min(Math.max(viewport.height, size.minHeight), size.maxHeight);
    return { width: w, height: h };
  }
  return { width: 1200, height: 800 };
}
