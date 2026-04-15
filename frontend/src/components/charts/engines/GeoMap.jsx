import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import DeckGL from '@deck.gl/react';
import { WebMercatorViewport } from '@deck.gl/core';
import { ScatterplotLayer, BitmapLayer } from '@deck.gl/layers';
import { TileLayer } from '@deck.gl/geo-layers';
import { useStore } from '../../../store';
import { useGPUTier } from '../../../lib/gpuDetect';
import useViewportMount from '../../../lib/useViewportMount';
import { acquireContext, releaseContext, touchContext } from '../../../lib/webglContextPool';
import { isCoordinatePair } from '../../../lib/fieldClassification';
import { TOKENS } from '../../dashboard/tokens';

/**
 * GeoMap — Tableau-style bubble map. 2D web mercator basemap with
 * circular markers sized proportionally to an optional measure column.
 * Replaces the previous 3D globe which read as an unreadable "black
 * dot" at typical tile footprints.
 *
 * Architecture:
 *   - deck.gl TileLayer fetches CartoDB free basemap tiles (dark-matter
 *     on dark theme, positron on light theme). No API key, no Mapbox
 *     account. Attribution shown in the corner.
 *   - ScatterplotLayer renders a glow halo + a primary bubble per data
 *     point. Radius in PIXELS (not meters) so bubbles stay readable at
 *     every zoom level — this is the key difference from a zoom-
 *     dependent meter-radius globe.
 *   - Auto-fit to data bounds on mount via WebMercatorViewport.fitBounds.
 *   - Hover picking → glass tooltip showing label + value.
 *   - Size legend (3-bubble scale) + attribution pill.
 *
 * Data contract:
 *   - lat + lng columns (auto-detected via isCoordinatePair)
 *   - 3rd numeric column (optional) → bubble size
 *   - 4th string column (optional) → hover label (e.g. "city")
 *
 * Phase 3 safety harness:
 *   - useViewportMount — map only mounts when scrolled in
 *   - webglContextPool — one context slot per tile; LRU eviction
 *   - useGPUTier — gated to medium+, falls back to message on low
 */

const DARK_TILES =
  'https://cartodb-basemaps-a.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png';
const LIGHT_TILES =
  'https://cartodb-basemaps-a.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png';

const MIN_BUBBLE_PX = 6;
const MAX_BUBBLE_PX = 44;

const DEFAULT_VIEW = {
  longitude: 0,
  latitude: 20,
  zoom: 1.5,
  pitch: 0,
  bearing: 0,
};

let _anonCounter = 0;
const nextAnonId = () => String(++_anonCounter);

function formatShort(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  const abs = Math.abs(v);
  if (abs >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  if (v % 1 !== 0) return v.toFixed(1);
  return v.toLocaleString();
}

export default function GeoMap({ tile }) {
  const { ref: wrapperRef, mounted } = useViewportMount({ rootMargin: '250px' });
  const gpu = useGPUTier();
  const resolvedTheme = useStore((s) => s.resolvedTheme);
  const [evicted, setEvicted] = useState(false);
  const [viewState, setViewState] = useState(DEFAULT_VIEW);
  const [hoverInfo, setHoverInfo] = useState(null);
  const tileIdRef = useRef(null);
  if (tileIdRef.current === null) {
    tileIdRef.current = tile?.id ? `geomap-${tile.id}` : `geomap-${nextAnonId()}`;
  }

  useEffect(() => {
    if (!mounted || gpu === 'low') return;
    const id = tileIdRef.current;
    acquireContext(id, () => setEvicted(true));
    return () => releaseContext(id);
  }, [mounted, gpu]);

  const { pair, points, valueRange } = useMemo(() => {
    const columns = tile?.columns || [];
    const rows = tile?.rows || [];
    const found = isCoordinatePair(columns, rows);
    if (!found) return { pair: null, points: [], valueRange: [0, 1] };

    const measureCol = columns.find(
      (c) =>
        c !== found.latCol &&
        c !== found.lngCol &&
        rows.some((r) => Number.isFinite(Number(r[c])))
    );
    const labelCol = columns.find(
      (c) =>
        c !== found.latCol &&
        c !== found.lngCol &&
        c !== measureCol &&
        rows.some((r) => typeof r[c] === 'string' && r[c])
    );

    const cap = Math.min(rows.length, 10_000);
    const slice = rows.slice(0, cap);
    const values = measureCol
      ? slice.map((r) => Number(r[measureCol])).filter(Number.isFinite)
      : [];
    const vMin = values.length ? Math.min(...values) : 0;
    const vMax = values.length ? Math.max(...values) : 1;

    const points = slice
      .map((r) => {
        const lat = Number(r[found.latCol]);
        const lng = Number(r[found.lngCol]);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        const raw = measureCol ? Number(r[measureCol]) || 0 : 1;
        const norm = vMax > vMin ? (raw - vMin) / (vMax - vMin) : 0.5;
        return {
          position: [lng, lat],
          radiusPx: MIN_BUBBLE_PX + norm * (MAX_BUBBLE_PX - MIN_BUBBLE_PX),
          value: raw,
          label: labelCol ? String(r[labelCol] || '') : '',
        };
      })
      .filter(Boolean);

    return { pair: found, points, valueRange: [vMin, vMax] };
  }, [tile?.columns, tile?.rows]);

  // Auto-fit to data bounds once we have points AND the wrapper is sized.
  // Runs after mount to ensure wrapperRef.current has a real bounding rect.
  //
  // The setViewState calls inside this effect are intentional:
  // we're synchronizing React state (viewState) with a truly external
  // system — DOM layout, which we must measure via getBoundingClientRect
  // after the tile mounts. This cannot be done during render because
  // there is no DOM size yet. The rule's "cascading render" concern
  // does not apply: fitBounds only runs when data/size changes, and
  // setViewState is the terminal side-effect.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!mounted || !points.length || !wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    const width = rect.width || 600;
    const height = rect.height || 400;
    if (width <= 0 || height <= 0) return;

    let minLat = 90;
    let maxLat = -90;
    let minLng = 180;
    let maxLng = -180;
    for (const p of points) {
      const [lng, lat] = p.position;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    }

    // Single-point data has zero span → default zoom 5 around the point.
    if (minLat === maxLat && minLng === maxLng) {
      setViewState({
        longitude: minLng,
        latitude: minLat,
        zoom: 5,
        pitch: 0,
        bearing: 0,
      });
      return;
    }

    try {
      const vp = new WebMercatorViewport({ width, height });
      const fitted = vp.fitBounds(
        [
          [minLng, minLat],
          [maxLng, maxLat],
        ],
        { padding: 50 }
      );
      setViewState({
        longitude: fitted.longitude,
        latitude: fitted.latitude,
        zoom: Math.max(0.5, fitted.zoom - 0.2),
        pitch: 0,
        bearing: 0,
      });
    } catch {
      // fitBounds edge cases (all-same-latitude data, etc.) — silently
      // keep the default view instead of crashing the tile.
    }
  }, [mounted, points, wrapperRef]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleViewStateChange = useCallback(
    ({ viewState: next }) => {
      setViewState(next);
      touchContext(tileIdRef.current);
    },
    []
  );

  if (gpu === 'low') {
    return (
      <div
        ref={wrapperRef}
        className="h-full flex items-center justify-center"
        style={{
          color: TOKENS.text.muted,
          fontSize: 11,
          fontFamily: TOKENS.fontBody,
          textAlign: 'center',
          padding: 20,
        }}
      >
        Map unavailable on this device
      </div>
    );
  }
  if (evicted) {
    return (
      <div
        ref={wrapperRef}
        className="h-full flex items-center justify-center"
        style={{
          color: TOKENS.text.muted,
          fontSize: 11,
          fontFamily: TOKENS.fontBody,
          textAlign: 'center',
          padding: 20,
        }}
      >
        Map paused · too many WebGL tiles on screen
      </div>
    );
  }
  if (!pair) {
    return (
      <div
        ref={wrapperRef}
        className="h-full flex items-center justify-center"
        style={{
          color: TOKENS.text.muted,
          fontSize: 11,
          fontFamily: TOKENS.fontBody,
          textAlign: 'center',
          padding: 20,
        }}
      >
        Map needs a latitude + longitude column
      </div>
    );
  }

  const isLight = resolvedTheme === 'light';
  const tileUrl = isLight ? LIGHT_TILES : DARK_TILES;
  const accentRgb = isLight ? [37, 99, 235] : [96, 165, 250];

  const layers = mounted
    ? [
        // Basemap. TileLayer streams map tiles from CartoDB's free
        // endpoint; subLayers wrap each tile in a BitmapLayer at the
        // correct bbox. No mapbox-gl, no GL library beyond deck.gl.
        new TileLayer({
          id: `basemap-${resolvedTheme}`,
          data: tileUrl,
          minZoom: 0,
          maxZoom: 19,
          tileSize: 256,
          renderSubLayers: (props) => {
            const { bbox } = props.tile;
            return new BitmapLayer({
              id: `${props.id}-bitmap`,
              image: props.data,
              bounds: [bbox.west, bbox.south, bbox.east, bbox.north],
              opacity: 0.95,
            });
          },
        }),
        // Glow halo — wider, lower opacity, draws first
        new ScatterplotLayer({
          id: 'bubbles-glow',
          data: points,
          getPosition: (d) => d.position,
          getRadius: (d) => d.radiusPx * 1.7,
          getFillColor: [...accentRgb, 55],
          radiusUnits: 'pixels',
          stroked: false,
          filled: true,
          parameters: { depthTest: false },
        }),
        // Primary bubbles — solid fill, white stroke, pickable
        new ScatterplotLayer({
          id: 'bubbles',
          data: points,
          getPosition: (d) => d.position,
          getRadius: (d) => d.radiusPx,
          getFillColor: [...accentRgb, 220],
          getLineColor: [255, 255, 255, 235],
          stroked: true,
          filled: true,
          lineWidthMinPixels: 1.3,
          lineWidthUnits: 'pixels',
          radiusUnits: 'pixels',
          pickable: true,
          onHover: (info) => setHoverInfo(info.object ? info : null),
          parameters: { depthTest: false },
        }),
      ]
    : [];

  return (
    <div
      ref={wrapperRef}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        minHeight: 240,
        borderRadius: 10,
        overflow: 'hidden',
      }}
      onPointerDown={() => touchContext(tileIdRef.current)}
    >
      {mounted && (
        <>
          <DeckGL
            viewState={viewState}
            onViewStateChange={handleViewStateChange}
            controller={{ dragRotate: false, touchRotate: false, doubleClickZoom: true }}
            layers={layers}
            style={{ position: 'absolute', inset: 0 }}
          />

          {/* Hover tooltip — premium glass pill */}
          {hoverInfo && hoverInfo.object && (
            <div
              style={{
                position: 'absolute',
                left: Math.min(hoverInfo.x + 14, 9999),
                top: Math.max(hoverInfo.y - 6, 4),
                pointerEvents: 'none',
                background: 'var(--glass-bg-card)',
                backdropFilter: 'blur(14px) saturate(1.3)',
                WebkitBackdropFilter: 'blur(14px) saturate(1.3)',
                border: '1px solid var(--glass-border)',
                borderRadius: 10,
                padding: '7px 11px',
                fontSize: 10.5,
                color: TOKENS.text.primary,
                fontFamily: TOKENS.fontDisplay,
                fontWeight: 600,
                letterSpacing: '-0.005em',
                boxShadow: '0 12px 28px -16px var(--shadow-deep)',
                zIndex: 5,
                maxWidth: 180,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {hoverInfo.object.label && (
                <div style={{ color: TOKENS.text.primary }}>{hoverInfo.object.label}</div>
              )}
              <div
                style={{
                  fontVariantNumeric: 'tabular-nums',
                  color: TOKENS.text.secondary,
                  marginTop: hoverInfo.object.label ? 1 : 0,
                  fontSize: 9.5,
                }}
              >
                {formatShort(hoverInfo.object.value)}
              </div>
            </div>
          )}

          {/* Size legend — 3-bubble proportional scale */}
          <SizeLegend valueRange={valueRange} accentRgb={accentRgb} />

          {/* Attribution pill — CartoDB license requirement */}
          <div
            style={{
              position: 'absolute',
              right: 8,
              bottom: 6,
              fontSize: 8.5,
              color: TOKENS.text.muted,
              fontFamily: TOKENS.fontBody,
              letterSpacing: '0.01em',
              pointerEvents: 'none',
              padding: '2px 6px',
              borderRadius: 6,
              background: 'color-mix(in oklab, var(--bg-elevated) 70%, transparent)',
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)',
              opacity: 0.85,
            }}
          >
            © OSM · CARTO
          </div>
        </>
      )}
    </div>
  );
}

function SizeLegend({ valueRange, accentRgb }) {
  const [min, max] = valueRange;
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return null;
  const mid = (min + max) / 2;
  const bubbleFill = `rgba(${accentRgb.join(',')}, 0.55)`;
  const bubbleStroke = `rgba(${accentRgb.join(',')}, 0.95)`;
  const sizes = [MIN_BUBBLE_PX, (MIN_BUBBLE_PX + MAX_BUBBLE_PX) / 2, MAX_BUBBLE_PX];
  const values = [min, mid, max];

  return (
    <div
      style={{
        position: 'absolute',
        left: 10,
        bottom: 8,
        display: 'flex',
        alignItems: 'flex-end',
        gap: 10,
        padding: '6px 12px 5px',
        background: 'var(--glass-bg-card)',
        backdropFilter: 'blur(12px) saturate(1.2)',
        WebkitBackdropFilter: 'blur(12px) saturate(1.2)',
        border: '1px solid var(--glass-border)',
        borderRadius: 9999,
        pointerEvents: 'none',
        boxShadow: '0 10px 22px -14px var(--shadow-deep)',
      }}
    >
      {sizes.map((px, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 3,
          }}
        >
          <div
            style={{
              width: px,
              height: px,
              borderRadius: '50%',
              background: bubbleFill,
              border: `1px solid ${bubbleStroke}`,
              boxShadow: `0 0 6px ${bubbleFill}`,
            }}
          />
          <span
            style={{
              fontSize: 8.5,
              color: 'var(--text-muted)',
              fontFamily: "'Outfit', system-ui, sans-serif",
              fontWeight: 700,
              letterSpacing: '0.04em',
              fontVariantNumeric: 'tabular-nums',
              textTransform: 'uppercase',
            }}
          >
            {formatShort(values[i])}
          </span>
        </div>
      ))}
    </div>
  );
}
