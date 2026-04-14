import { useMemo, useState, useRef, useEffect } from 'react';
import DeckGL from '@deck.gl/react';
// _GlobeView is still flagged experimental at deck.gl 9.x — stable path
// not available yet, so we alias the underscored export.
import { _GlobeView as GlobeView } from '@deck.gl/core';
import { ScatterplotLayer, SolidPolygonLayer } from '@deck.gl/layers';
import { useGPUTier } from '../../../lib/gpuDetect';
import useViewportMount from '../../../lib/useViewportMount';
import { acquireContext, releaseContext, touchContext } from '../../../lib/webglContextPool';
import { isCoordinatePair } from '../../../lib/fieldClassification';
import { TOKENS } from '../../dashboard/tokens';

/**
 * DeckGlobe — deck.gl GlobeView with points + optional magnitude sizing.
 *
 * Uses the experimental _GlobeView — renders a 3D sphere that users can
 * drag to rotate and scroll to zoom. Auto-detects lat/lng columns via
 * isCoordinatePair. If a 3rd numeric column exists, points are sized by
 * that measure (normalized to a visible min/max range).
 *
 * Safety harness:
 *   - useViewportMount — deck doesn't mount until visible
 *   - webglContextPool — globe is a heavy WebGL consumer, gets evicted
 *     gracefully if too many 3D tiles compete for contexts
 *   - useGPUTier — 'low' falls back to a message card
 *
 * Premium aesthetic:
 *   - Dark slate sphere base (matches --bg-elevated on dark theme)
 *   - Accent blue points with glow
 *   - Auto-rotation kicks in after 3s of idle (via viewState animation)
 */

const INITIAL_VIEW = {
  longitude: 0,
  latitude: 25,
  zoom: 0,
  pitch: 0,
  bearing: 0,
};

const MIN_POINT_RADIUS_M = 40_000;
const MAX_POINT_RADIUS_M = 400_000;

let _anonCounter = 0;
const nextAnonId = () => String(++_anonCounter);

export default function DeckGlobe({ tile }) {
  const { ref: wrapperRef, mounted } = useViewportMount({ rootMargin: '250px' });
  const gpu = useGPUTier();
  const [evicted, setEvicted] = useState(false);
  const [viewState, setViewState] = useState(INITIAL_VIEW);
  const idleTimerRef = useRef(null);
  const rafRef = useRef(null);
  const tileIdRef = useRef(null);
  if (tileIdRef.current === null) {
    tileIdRef.current = tile?.id ? `globe-${tile.id}` : `globe-${nextAnonId()}`;
  }

  useEffect(() => {
    if (!mounted || gpu === 'low') return;
    const id = tileIdRef.current;
    acquireContext(id, () => setEvicted(true));
    return () => releaseContext(id);
  }, [mounted, gpu]);

  const { pair, data, sampled } = useMemo(() => {
    const columns = tile?.columns || [];
    const rows = tile?.rows || [];
    const found = isCoordinatePair(columns, rows);
    if (!found) return { pair: null, data: [], sampled: false };

    const measureCol = columns.find(
      (c) =>
        c !== found.latCol &&
        c !== found.lngCol &&
        rows.some((r) => Number.isFinite(Number(r[c])))
    );

    const cap = Math.min(rows.length, 20_000);
    const slice = rows.slice(0, cap);
    const sampled = rows.length > 20_000;

    let vMin = 0;
    let vMax = 1;
    if (measureCol) {
      const vals = slice.map((r) => Number(r[measureCol])).filter(Number.isFinite);
      if (vals.length) {
        vMin = Math.min(...vals);
        vMax = Math.max(...vals) || vMin + 1;
      }
    }

    const points = slice
      .map((r) => {
        const lat = Number(r[found.latCol]);
        const lng = Number(r[found.lngCol]);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        const raw = measureCol ? Number(r[measureCol]) || 0 : 0.5;
        const norm = (raw - vMin) / (vMax - vMin || 1);
        return {
          position: [lng, lat],
          radius: MIN_POINT_RADIUS_M + norm * (MAX_POINT_RADIUS_M - MIN_POINT_RADIUS_M),
          value: raw,
        };
      })
      .filter(Boolean);

    return { pair: found, data: points, sampled };
  }, [tile?.columns, tile?.rows]);

  // Auto-rotate after 3s of idle — pleasant subtle motion the user can
  // interrupt by dragging. Resets on every viewport interaction.
  useEffect(() => {
    if (!mounted || gpu === 'low' || evicted || data.length === 0) return;
    let active = true;
    const rotate = () => {
      if (!active) return;
      setViewState((prev) => ({
        ...prev,
        longitude: (prev.longitude + 0.08) % 360,
      }));
      rafRef.current = requestAnimationFrame(rotate);
    };
    idleTimerRef.current = setTimeout(() => {
      rafRef.current = requestAnimationFrame(rotate);
    }, 3000);
    return () => {
      active = false;
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [mounted, gpu, evicted, data.length]);

  const handleViewStateChange = ({ viewState: next }) => {
    setViewState(next);
    // Reset idle timer on user interaction — rotation pauses
    touchContext(tileIdRef.current);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    idleTimerRef.current = setTimeout(() => {
      const rotate = () => {
        setViewState((prev) => ({ ...prev, longitude: (prev.longitude + 0.08) % 360 }));
        rafRef.current = requestAnimationFrame(rotate);
      };
      rafRef.current = requestAnimationFrame(rotate);
    }, 3000);
  };

  if (gpu === 'low') {
    return (
      <div
        ref={wrapperRef}
        className="h-full flex items-center justify-center"
        style={{ color: TOKENS.text.muted, fontSize: 11, fontFamily: TOKENS.fontBody, textAlign: 'center', padding: 20 }}
      >
        Globe unavailable on this device
      </div>
    );
  }
  if (evicted) {
    return (
      <div
        ref={wrapperRef}
        className="h-full flex items-center justify-center"
        style={{ color: TOKENS.text.muted, fontSize: 11, fontFamily: TOKENS.fontBody, textAlign: 'center', padding: 20 }}
      >
        Globe paused · too many 3D tiles on screen
      </div>
    );
  }
  if (!pair) {
    return (
      <div
        ref={wrapperRef}
        className="h-full flex items-center justify-center"
        style={{ color: TOKENS.text.muted, fontSize: 11, fontFamily: TOKENS.fontBody, textAlign: 'center', padding: 20 }}
      >
        Globe needs a latitude + longitude column
      </div>
    );
  }

  const layers = mounted
    ? [
        new SolidPolygonLayer({
          id: 'globe-background',
          data: [
            {
              polygon: [
                [-180, -90],
                [180, -90],
                [180, 90],
                [-180, 90],
              ],
            },
          ],
          getPolygon: (d) => d.polygon,
          getFillColor: [15, 23, 42, 180],
          stroked: false,
        }),
        new ScatterplotLayer({
          id: 'globe-points',
          data,
          getPosition: (d) => d.position,
          getRadius: (d) => d.radius,
          getFillColor: [96, 165, 250, 210],
          getLineColor: [147, 197, 253, 255],
          stroked: true,
          lineWidthMinPixels: 0.5,
          radiusUnits: 'meters',
          pickable: true,
        }),
      ]
    : [];

  return (
    <div
      ref={wrapperRef}
      style={{ width: '100%', height: '100%', position: 'relative', minHeight: 240 }}
      onPointerDown={() => touchContext(tileIdRef.current)}
    >
      {mounted && (
        <>
          <DeckGL
            views={[new GlobeView({ id: 'globe', controller: true })]}
            viewState={viewState}
            onViewStateChange={handleViewStateChange}
            layers={layers}
            style={{ position: 'relative' }}
          />
          {sampled && (
            <div
              style={{
                position: 'absolute',
                top: 12,
                right: 12,
                padding: '3px 9px',
                borderRadius: 9999,
                background: 'color-mix(in oklab, var(--status-warning) 14%, transparent)',
                border: '1px solid color-mix(in oklab, var(--status-warning) 28%, transparent)',
                fontSize: 9,
                color: 'var(--status-warning)',
                fontFamily: TOKENS.fontDisplay,
                fontWeight: 700,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                pointerEvents: 'none',
              }}
            >
              Sampled 20,000 / {tile.rows.length.toLocaleString()}
            </div>
          )}
        </>
      )}
    </div>
  );
}
