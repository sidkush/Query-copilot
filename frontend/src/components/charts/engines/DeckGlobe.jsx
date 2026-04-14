import { useMemo, useState, useRef, useEffect } from 'react';
import DeckGL from '@deck.gl/react';
// _GlobeView is still flagged experimental at deck.gl 9.x — stable path
// not available yet, so we alias the underscored export.
import { _GlobeView as GlobeView } from '@deck.gl/core';
import { ScatterplotLayer, SolidPolygonLayer, GeoJsonLayer } from '@deck.gl/layers';
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

// zoom 1.2 places the whole sphere at ~70% of a medium tile footprint
// with points clearly readable. zoom 0 (deck.gl default) shows the
// entire globe as a tiny dot at tile scale — visibly broken.
const INITIAL_VIEW = {
  longitude: 0,
  latitude: 25,
  zoom: 1.2,
  pitch: 0,
  bearing: 0,
};

// Point-radius band in meters. Used for proportional sizing by the
// optional 3rd numeric measure. Paired with radiusMinPixels below so
// small values still render even when the sphere zoom is low.
const MIN_POINT_RADIUS_M = 150_000;
const MAX_POINT_RADIUS_M = 700_000;

// Public-domain world country outlines GeoJSON. ~250KB, stable URL,
// MIT-licensed (johan/world.geo.json). Loaded by deck.gl's built-in
// fetch path in GeoJsonLayer on first globe mount; subsequent tiles
// reuse the browser cache.
const WORLD_GEOJSON_URL =
  'https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json';

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
        longitude: (prev.longitude + 0.04) % 360,
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
        setViewState((prev) => ({ ...prev, longitude: (prev.longitude + 0.04) % 360 }));
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
        // Ocean sphere — opaque navy base. The rectangle gets wrapped
        // around the full sphere by GlobeView's projection.
        new SolidPolygonLayer({
          id: 'globe-ocean',
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
          getFillColor: [9, 16, 38, 255],
          stroked: false,
        }),
        // Country outlines — fills land with a lighter navy so users
        // can orient themselves on the sphere, with a subtle accent
        // hairline for each border. Without this the globe looks like
        // an uninterpretable black dot, which was the old bug.
        new GeoJsonLayer({
          id: 'globe-countries',
          data: WORLD_GEOJSON_URL,
          stroked: true,
          filled: true,
          getFillColor: [28, 40, 72, 255],
          getLineColor: [96, 165, 250, 90],
          lineWidthMinPixels: 0.4,
          pickable: false,
          parameters: { depthTest: false },
        }),
        // Data points — brighter fill, white stroke, radiusMinPixels
        // guarantees visibility even at low zoom or tiny tile sizes.
        new ScatterplotLayer({
          id: 'globe-points',
          data,
          getPosition: (d) => d.position,
          getRadius: (d) => d.radius,
          getFillColor: [96, 165, 250, 245],
          getLineColor: [255, 255, 255, 230],
          stroked: true,
          filled: true,
          lineWidthMinPixels: 1.4,
          lineWidthUnits: 'pixels',
          radiusUnits: 'meters',
          radiusMinPixels: 4,
          radiusMaxPixels: 28,
          pickable: true,
          parameters: { depthTest: false },
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
