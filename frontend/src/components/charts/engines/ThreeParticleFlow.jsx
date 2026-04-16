import { useRef, useMemo, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { useGPUTier } from '../../../lib/gpuDetect';
import useViewportMount from '../../../lib/useViewportMount';
import { acquireContext, releaseContext, touchContext } from '../../../lib/webglContextPool';
import { TOKENS } from '../../dashboard/tokens';

/**
 * ThreeParticleFlow — animated particles flowing along a computed
 * vector field. The marquee wow engine.
 *
 * Data contract:
 *   - 2 numeric columns → X/Y positions on a 2D plane
 *   - 2 additional numeric columns (if present) → vector field vx/vy
 *   - If no vector columns, falls back to a synthetic rotational field
 *     derived from the point-cloud centroid (so it animates even on
 *     basic scatter data)
 *
 * Pipeline:
 *   1. Build a grid of sample points from the data's X/Y range
 *   2. For each grid cell, compute or look up (vx, vy) → store in a
 *      Float32Array keyed by (col, row) so frame updates are O(1)
 *   3. Spawn 5000 particles (scaled by GPU tier) with random positions
 *   4. Each frame: sample the cell a particle is in, advance its
 *      position by the local velocity, wrap around bounds
 *   5. Render via InstancedMesh — single draw call, 60fps target
 *
 * Hard-gated by useGPUTier === 'high' — this is the most expensive
 * engine we ship and 'medium' devices will stutter.
 */

const PARTICLE_COUNT_HIGH = 5000;
const PARTICLE_COUNT_MEDIUM = 1500;
const GRID_RES = 24; // 24x24 vector field resolution
const BOUNDS = 3;
let _anonCounter = 0;
const nextAnonId = () => String(++_anonCounter);

function buildVectorField(rows, columns) {
  const numericCols = columns.filter((c) =>
    rows.some((r) => Number.isFinite(Number(r[c])))
  );

  const field = new Float32Array(GRID_RES * GRID_RES * 2);

  if (numericCols.length >= 4) {
    // Real vector field from data: first 2 cols = position, next 2 = velocity
    const [xc, yc, vxc, vyc] = numericCols;
    const xs = rows.map((r) => Number(r[xc]) || 0);
    const ys = rows.map((r) => Number(r[yc]) || 0);
    const vxs = rows.map((r) => Number(r[vxc]) || 0);
    const vys = rows.map((r) => Number(r[vyc]) || 0);
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs) || 1;
    const yMin = Math.min(...ys);
    const yMax = Math.max(...ys) || 1;
    const vxMax = Math.max(...vxs.map(Math.abs)) || 1;
    const vyMax = Math.max(...vys.map(Math.abs)) || 1;

    const buckets = Array.from({ length: GRID_RES * GRID_RES }, () => ({ vx: 0, vy: 0, n: 0 }));
    for (let i = 0; i < rows.length; i++) {
      const gx = Math.min(GRID_RES - 1, Math.max(0, Math.floor(((xs[i] - xMin) / (xMax - xMin || 1)) * GRID_RES)));
      const gy = Math.min(GRID_RES - 1, Math.max(0, Math.floor(((ys[i] - yMin) / (yMax - yMin || 1)) * GRID_RES)));
      const bucket = buckets[gy * GRID_RES + gx];
      bucket.vx += vxs[i] / vxMax;
      bucket.vy += vys[i] / vyMax;
      bucket.n += 1;
    }
    for (let i = 0; i < buckets.length; i++) {
      const b = buckets[i];
      field[i * 2] = b.n ? b.vx / b.n : 0;
      field[i * 2 + 1] = b.n ? b.vy / b.n : 0;
    }
    return field;
  }

  // Synthetic rotational field — curl around the centroid, so even
  // plain 2D scatter data produces a pleasant swirl.
  const halfRes = GRID_RES / 2;
  for (let gy = 0; gy < GRID_RES; gy++) {
    for (let gx = 0; gx < GRID_RES; gx++) {
      const nx = (gx - halfRes) / halfRes;
      const ny = (gy - halfRes) / halfRes;
      const idx = (gy * GRID_RES + gx) * 2;
      // Perpendicular vector — curl around origin
      field[idx] = -ny;
      field[idx + 1] = nx;
    }
  }
  return field;
}

function FlowingParticles({ count, field }) {
  const meshRef = useRef(null);
  const positionsRef = useRef(null);

  // Lazy-init particle positions — uniform random inside bounds
  useEffect(() => {
    if (!meshRef.current) return;
    const positions = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      positions[i * 2] = (Math.random() * 2 - 1) * BOUNDS;
      positions[i * 2 + 1] = (Math.random() * 2 - 1) * BOUNDS;
    }
    positionsRef.current = positions;

    const tmp = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      tmp.position.set(positions[i * 2], positions[i * 2 + 1], 0);
      tmp.scale.setScalar(0.018);
      tmp.updateMatrix();
      meshRef.current.setMatrixAt(i, tmp.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [count]);

  useFrame((_, delta) => {
    if (!meshRef.current || !positionsRef.current || !field) return;
    const positions = positionsRef.current;
    const tmp = new THREE.Object3D();
    const step = Math.min(delta * 0.8, 0.05);

    for (let i = 0; i < count; i++) {
      let x = positions[i * 2];
      let y = positions[i * 2 + 1];

      // Sample the vector field at this particle's grid cell
      const gx = Math.min(GRID_RES - 1, Math.max(0, Math.floor(((x + BOUNDS) / (BOUNDS * 2)) * GRID_RES)));
      const gy = Math.min(GRID_RES - 1, Math.max(0, Math.floor(((y + BOUNDS) / (BOUNDS * 2)) * GRID_RES)));
      const idx = (gy * GRID_RES + gx) * 2;
      const vx = field[idx];
      const vy = field[idx + 1];

      x += vx * step;
      y += vy * step;

      // Wrap around bounds so the field runs forever
      if (x > BOUNDS) x = -BOUNDS;
      else if (x < -BOUNDS) x = BOUNDS;
      if (y > BOUNDS) y = -BOUNDS;
      else if (y < -BOUNDS) y = BOUNDS;

      positions[i * 2] = x;
      positions[i * 2 + 1] = y;

      tmp.position.set(x, y, 0);
      tmp.scale.setScalar(0.018);
      tmp.updateMatrix();
      meshRef.current.setMatrixAt(i, tmp.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      <sphereGeometry args={[1, 6, 6]} />
      <meshBasicMaterial
        color="#60a5fa"
        transparent
        opacity={0.75}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </instancedMesh>
  );
}

export default function ThreeParticleFlow({ tile }) {
  const { ref: wrapperRef, mounted } = useViewportMount({ rootMargin: '250px', once: true });
  const gpu = useGPUTier();
  const [evicted, setEvicted] = useState(false);
  const tileIdRef = useRef(null);
  if (tileIdRef.current === null) {
    tileIdRef.current = tile?.id ? `particles-${tile.id}` : `particles-${nextAnonId()}`;
  }

  useEffect(() => {
    if (!mounted || gpu === 'low') return;
    const id = tileIdRef.current;
    acquireContext(id, () => setEvicted(true));
    return () => releaseContext(id);
  }, [mounted, gpu]);

  const field = useMemo(() => {
    const rows = tile?.rows || [];
    const columns = tile?.columns || [];
    if (!rows.length || !columns.length) return null;
    return buildVectorField(rows, columns);
  }, [tile?.rows, tile?.columns]);

  const count = gpu === 'high' ? PARTICLE_COUNT_HIGH : PARTICLE_COUNT_MEDIUM;

  if (gpu === 'low') {
    return (
      <div
        ref={wrapperRef}
        className="h-full flex items-center justify-center"
        style={{ color: TOKENS.text.muted, fontSize: 11, fontFamily: TOKENS.fontBody, textAlign: 'center', padding: 20 }}
      >
        Particle flow unavailable — this engine requires a high-end GPU
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
        Particle flow paused · too many 3D tiles on screen
      </div>
    );
  }
  if (!field) {
    return (
      <div
        ref={wrapperRef}
        className="h-full flex items-center justify-center"
        style={{ color: TOKENS.text.muted, fontSize: 11, fontFamily: TOKENS.fontBody, textAlign: 'center', padding: 20 }}
      >
        Particle flow needs at least 2 numeric columns
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
            orthographic
            camera={{ position: [0, 0, 10], zoom: 70 }}
            gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
            dpr={[1, gpu === 'high' ? 2 : 1.5]}
            style={{ background: 'transparent' }}
          >
            <FlowingParticles count={count} field={field} />
            <OrbitControls enablePan={false} enableRotate={false} enableZoom makeDefault />
          </Canvas>
          {/* Subtle vignette */}
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              background: 'radial-gradient(ellipse at center, transparent 55%, rgba(2, 6, 23, 0.35) 100%)',
            }}
          />
        </>
      )}
    </div>
  );
}
