import { useRef, useMemo, useState, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Text, Grid } from '@react-three/drei';
import * as THREE from 'three';
import { useGPUTier } from '../../../lib/gpuDetect';
import useViewportMount from '../../../lib/useViewportMount';
import { acquireContext, releaseContext, touchContext } from '../../../lib/webglContextPool';
import { TOKENS, CHART_PALETTES } from '../../dashboard/tokens';

/**
 * ThreeScatter3D — orbitable 3D scatter engine (Phase 4.2).
 *
 * First flagship wow-factor chart. Shows the plane breaks the 2D ceiling
 * and gives AskDB a chart Tableau/Looker/PowerBI don't ship out of the
 * box. Three numeric columns become X/Y/Z, optional 4th categorical
 * column colors the points.
 *
 * Safety harness integration (Phase 3):
 *   - useViewportMount — canvas only mounts when the tile scrolls in
 *   - webglContextPool — 8 concurrent WebGL contexts max, LRU evicted
 *   - useGPUTier — 'low' tier falls back to a text message instead of
 *     rendering. Medium/high render full-fidelity.
 *   - TileBoundary (from TileWrapper) catches render-time throws above
 *
 * Performance:
 *   - InstancedMesh for up to 10K points (single draw call)
 *   - Rows above cap get sliced and a "sampled" badge shown
 *   - Low-poly sphere geometry (12×12) — one draw call, cheap shading
 */

const MAX_POINTS = 10_000;

// Module-level monotonic counter for tiles without a stable id. Using a
// ref-initialized counter keeps the pool id deterministic across renders
// for a given component instance, while Math.random() in render would be
// flagged as impure by react-hooks/purity.
let _anonCounter = 0;
function nextAnonId() {
  _anonCounter += 1;
  return String(_anonCounter);
}

function InstancedPoints({ points, colors }) {
  const meshRef = useRef(null);

  useEffect(() => {
    if (!meshRef.current) return;
    const tmp = new THREE.Object3D();
    const colorObj = new THREE.Color();
    for (let i = 0; i < points.length; i++) {
      tmp.position.set(points[i].x, points[i].y, points[i].z);
      tmp.scale.setScalar(points[i].size || 0.07);
      tmp.updateMatrix();
      meshRef.current.setMatrixAt(i, tmp.matrix);
      if (colors && meshRef.current.instanceColor) {
        colorObj.set(colors[i]);
        meshRef.current.setColorAt(i, colorObj);
      }
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (colors && meshRef.current.instanceColor) {
      meshRef.current.instanceColor.needsUpdate = true;
    }
  }, [points, colors]);

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, Math.max(points.length, 1)]}>
      <sphereGeometry args={[1, 12, 12]} />
      <meshStandardMaterial vertexColors metalness={0.22} roughness={0.42} />
    </instancedMesh>
  );
}

export default function ThreeScatter3D({ tile }) {
  const { ref: wrapperRef, mounted } = useViewportMount({ rootMargin: '250px' });
  const gpu = useGPUTier();
  const [showHint, setShowHint] = useState(true);
  const [evicted, setEvicted] = useState(false);
  // Stable pool id. useRef with a lazy initializer would be impure at render
  // time (Math.random is not deterministic). Derive from tile.id when
  // available, fall back to a counter-seeded ref set during the first effect.
  const tileIdRef = useRef(null);
  if (tileIdRef.current === null) {
    tileIdRef.current = tile?.id ? `scatter3d-${tile.id}` : `scatter3d-${nextAnonId()}`;
  }

  // Acquire a WebGL context slot from the pool; release on unmount.
  useEffect(() => {
    if (!mounted || gpu === 'low') return;
    const id = tileIdRef.current;
    acquireContext(id, () => setEvicted(true));
    return () => releaseContext(id);
  }, [mounted, gpu]);

  // Hint auto-dismiss
  useEffect(() => {
    if (!showHint || !mounted) return;
    const t = setTimeout(() => setShowHint(false), 4000);
    return () => clearTimeout(t);
  }, [showHint, mounted]);

  // Derived scene data — normalized to [-2, 2] so the camera frames cleanly
  const { points, colors, sampled, dims } = useMemo(() => {
    const rows = tile?.rows || [];
    const columns = tile?.columns || [];
    if (rows.length < 2 || columns.length < 3) {
      return { points: [], colors: [], sampled: false, dims: null };
    }

    // Pick the first 3 numeric-like columns for X/Y/Z
    const numericColumns = columns.filter((c) =>
      rows.some((r) => Number.isFinite(Number(r[c])))
    );
    if (numericColumns.length < 3) {
      return { points: [], colors: [], sampled: false, dims: null };
    }
    const [cx, cy, cz] = numericColumns;

    const cap = Math.min(rows.length, MAX_POINTS);
    const sampled = rows.length > MAX_POINTS;
    const slice = rows.slice(0, cap);

    const raw = [cx, cy, cz].map((col) => slice.map((r) => Number(r[col]) || 0));
    const ranges = raw.map((arr) => {
      const min = Math.min(...arr);
      const max = Math.max(...arr);
      return { min, max, range: (max - min) || 1 };
    });

    const pts = slice.map((_, i) => ({
      x: ((raw[0][i] - ranges[0].min) / ranges[0].range) * 4 - 2,
      y: ((raw[1][i] - ranges[1].min) / ranges[1].range) * 4 - 2,
      z: ((raw[2][i] - ranges[2].min) / ranges[2].range) * 4 - 2,
      size: 0.055,
    }));

    // Color by optional 4th column (categorical) OR fall back to accent
    const palette = CHART_PALETTES.default;
    let pointColors;
    const colorCol = columns.find((c) => !numericColumns.slice(0, 3).includes(c));
    if (colorCol) {
      const colorVals = slice.map((r) => r[colorCol]);
      const uniq = [...new Set(colorVals)];
      const colorMap = new Map(uniq.map((v, idx) => [v, palette[idx % palette.length]]));
      pointColors = colorVals.map((v) => colorMap.get(v) || palette[0]);
    } else {
      pointColors = slice.map(() => palette[0]);
    }

    return {
      points: pts,
      colors: pointColors,
      sampled,
      dims: { x: cx, y: cy, z: cz },
    };
  }, [tile?.rows, tile?.columns]);

  // GPU fallback — 'low' tier gets a message, not a canvas
  if (gpu === 'low') {
    return (
      <div
        ref={wrapperRef}
        className="h-full flex flex-col items-center justify-center"
        style={{
          color: TOKENS.text.muted,
          fontSize: 11,
          fontFamily: TOKENS.fontBody,
          textAlign: 'center',
          padding: 20,
          gap: 8,
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 2l9 4.5v11L12 22 3 17.5v-11L12 2z" />
          <path d="M3 6.5l9 4.5 9-4.5" />
          <path d="M12 11v11" />
        </svg>
        <span style={{ fontWeight: 650, color: TOKENS.text.secondary, fontSize: 12 }}>
          3D unavailable on this device
        </span>
        <span style={{ opacity: 0.75, maxWidth: 220, lineHeight: 1.4 }}>
          Your browser reported low GPU capability. Switch to a 2D scatter chart or try a different device.
        </span>
      </div>
    );
  }

  // Evicted by webglContextPool — graceful fallback
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
        3D view paused · too many 3D tiles on screen
      </div>
    );
  }

  // No valid data
  if (points.length === 0) {
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
        3D scatter needs 3+ numeric columns and 2+ rows
      </div>
    );
  }

  return (
    <div
      ref={wrapperRef}
      style={{ width: '100%', height: '100%', position: 'relative', minHeight: 220 }}
      onPointerDown={() => touchContext(tileIdRef.current)}
    >
      {mounted && (
        <>
          <Canvas
            camera={{ position: [4.5, 4.5, 6], fov: 48 }}
            gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
            dpr={[1, gpu === 'high' ? 2 : 1.5]}
            style={{ background: 'transparent' }}
          >
            <ambientLight intensity={0.55} />
            <pointLight position={[10, 10, 10]} intensity={0.85} color="#f8fafc" />
            <pointLight position={[-10, -6, -10]} intensity={0.35} color="#60a5fa" />
            <Grid
              args={[8, 8]}
              position={[0, -2, 0]}
              cellColor="#475569"
              sectionColor="#1e293b"
              fadeDistance={25}
              fadeStrength={1.4}
              infiniteGrid={false}
            />
            <InstancedPoints points={points} colors={colors} />
            {dims && (
              <>
                <Text position={[2.6, -1.95, 0]} fontSize={0.18} color="#94a3b8" anchorX="left">
                  {dims.x}
                </Text>
                <Text position={[-1.95, 2.5, 0]} fontSize={0.18} color="#94a3b8" anchorX="left">
                  {dims.y}
                </Text>
                <Text position={[-1.95, -1.95, 2.6]} fontSize={0.18} color="#94a3b8" anchorX="left">
                  {dims.z}
                </Text>
              </>
            )}
            <OrbitControls
              enablePan
              enableZoom
              enableRotate
              enableDamping
              dampingFactor={0.1}
              makeDefault
            />
          </Canvas>
          {showHint && (
            <div
              style={{
                position: 'absolute',
                top: 12,
                left: 12,
                padding: '5px 11px',
                borderRadius: 9999,
                background: 'var(--glass-bg-card)',
                border: '1px solid var(--glass-border)',
                backdropFilter: 'blur(12px) saturate(1.3)',
                WebkitBackdropFilter: 'blur(12px) saturate(1.3)',
                fontSize: 10,
                fontWeight: 600,
                color: TOKENS.text.secondary,
                fontFamily: TOKENS.fontDisplay,
                letterSpacing: '0.02em',
                pointerEvents: 'none',
                animation: 'threeScatterHintFade 4s ease-out forwards',
              }}
            >
              Drag to orbit · Scroll to zoom
            </div>
          )}
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
              Sampled {MAX_POINTS.toLocaleString()} / {tile.rows.length.toLocaleString()}
            </div>
          )}
        </>
      )}
    </div>
  );
}
