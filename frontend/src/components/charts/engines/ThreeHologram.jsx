import { useRef, useMemo, useState, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import * as THREE from 'three';
import { useGPUTier } from '../../../lib/gpuDetect';
import useViewportMount from '../../../lib/useViewportMount';
import { acquireContext, releaseContext, touchContext } from '../../../lib/webglContextPool';
import { TOKENS, CHART_PALETTES } from '../../dashboard/tokens';

/**
 * ThreeHologram — 3D scatter in a holographic / Tron aesthetic.
 *
 * Same data contract as ThreeScatter3D (X/Y/Z numeric + optional
 * categorical color column) but the visual treatment is drastically
 * different:
 *
 *   - Wireframe grid floor + back wall in cool accent blue
 *   - Points render with meshBasicMaterial + additive blending so they
 *     glow rather than shade. No PBR lighting — this is a projection,
 *     not a physical object.
 *   - CSS scan-line overlay on top of the Canvas (::after pseudo via
 *     inline style) for the classic CRT holo look
 *   - Faint outer vignette so the scene reads as "projected"
 *
 * Phase 5 will wire the time-animation hook to produce per-frame
 * decaying trails from a ring buffer. For now, the scaffold renders
 * static points + grid — zero animation until the hook exists, so
 * shipping this chart does not commit us to an animation API.
 */

const MAX_POINTS = 8_000;
let _anonCounter = 0;
const nextAnonId = () => String(++_anonCounter);

function HologramPoints({ points, colors }) {
  const meshRef = useRef(null);

  useEffect(() => {
    if (!meshRef.current || points.length === 0) return;
    const tmp = new THREE.Object3D();
    const colorObj = new THREE.Color();
    for (let i = 0; i < points.length; i++) {
      tmp.position.set(points[i].x, points[i].y, points[i].z);
      tmp.scale.setScalar(0.06);
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
      <sphereGeometry args={[1, 10, 10]} />
      <meshBasicMaterial
        vertexColors
        transparent
        opacity={0.92}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </instancedMesh>
  );
}

export default function ThreeHologram({ tile }) {
  const { ref: wrapperRef, mounted } = useViewportMount({ rootMargin: '250px' });
  const gpu = useGPUTier();
  const [evicted, setEvicted] = useState(false);
  const tileIdRef = useRef(null);
  if (tileIdRef.current === null) {
    tileIdRef.current = tile?.id ? `hologram-${tile.id}` : `hologram-${nextAnonId()}`;
  }

  useEffect(() => {
    if (!mounted || gpu === 'low') return;
    const id = tileIdRef.current;
    acquireContext(id, () => setEvicted(true));
    return () => releaseContext(id);
  }, [mounted, gpu]);

  const { points, colors } = useMemo(() => {
    const rows = tile?.rows || [];
    const columns = tile?.columns || [];
    if (rows.length < 2 || columns.length < 3) return { points: [], colors: [] };

    const numericColumns = columns.filter((c) =>
      rows.some((r) => Number.isFinite(Number(r[c])))
    );
    if (numericColumns.length < 3) return { points: [], colors: [] };
    const [cx, cy, cz] = numericColumns;

    const cap = Math.min(rows.length, MAX_POINTS);
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
    }));

    const palette = CHART_PALETTES.ocean;
    const colorCol = columns.find((c) => !numericColumns.slice(0, 3).includes(c));
    let ptColors;
    if (colorCol) {
      const vals = slice.map((r) => r[colorCol]);
      const uniq = [...new Set(vals)];
      const map = new Map(uniq.map((v, idx) => [v, palette[idx % palette.length]]));
      ptColors = vals.map((v) => map.get(v) || palette[0]);
    } else {
      ptColors = slice.map(() => '#22d3ee');
    }

    return { points: pts, colors: ptColors };
  }, [tile?.rows, tile?.columns]);

  if (gpu === 'low') {
    return (
      <div
        ref={wrapperRef}
        className="h-full flex items-center justify-center"
        style={{ color: TOKENS.text.muted, fontSize: 11, fontFamily: TOKENS.fontBody, textAlign: 'center', padding: 20 }}
      >
        Hologram unavailable on this device
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
        Hologram paused · too many 3D tiles on screen
      </div>
    );
  }
  if (points.length === 0) {
    return (
      <div
        ref={wrapperRef}
        className="h-full flex items-center justify-center"
        style={{ color: TOKENS.text.muted, fontSize: 11, fontFamily: TOKENS.fontBody, textAlign: 'center', padding: 20 }}
      >
        Hologram needs 3+ numeric columns and 2+ rows
      </div>
    );
  }

  return (
    <div
      ref={wrapperRef}
      style={{ width: '100%', height: '100%', position: 'relative', minHeight: 220, overflow: 'hidden' }}
      onPointerDown={() => touchContext(tileIdRef.current)}
    >
      {mounted && (
        <>
          <Canvas
            camera={{ position: [4.8, 4, 6], fov: 48 }}
            gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
            dpr={[1, gpu === 'high' ? 2 : 1.5]}
            style={{ background: 'transparent' }}
          >
            {/* No scene lights — meshBasicMaterial ignores lighting. The
                additive blending + vertex colors create the glow. */}
            <Grid
              args={[16, 16]}
              position={[0, -2, 0]}
              cellColor="#1e40af"
              sectionColor="#60a5fa"
              sectionThickness={1.4}
              cellThickness={0.7}
              fadeDistance={28}
              fadeStrength={1.6}
              infiniteGrid={false}
            />
            {/* Back wall — thin glowing grid for the depth hint */}
            <gridHelper args={[8, 8, '#60a5fa', '#1e40af']} position={[0, 0, -3]} rotation={[Math.PI / 2, 0, 0]} />
            <HologramPoints points={points} colors={colors} />
            <OrbitControls enablePan enableZoom enableRotate enableDamping dampingFactor={0.1} makeDefault />
          </Canvas>

          {/* CSS scan-line overlay for the CRT / Tron feel */}
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              background:
                'repeating-linear-gradient(0deg, rgba(96,165,250,0.05) 0px, rgba(96,165,250,0.05) 1px, transparent 1px, transparent 3px)',
              mixBlendMode: 'screen',
            }}
          />
          {/* Radial vignette — projected feel */}
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              background: 'radial-gradient(ellipse at center, transparent 45%, rgba(2, 6, 23, 0.45) 100%)',
            }}
          />
        </>
      )}
    </div>
  );
}
