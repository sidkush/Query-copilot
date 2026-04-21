import React, { useMemo, useRef, useCallback } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useGPUTier, scaleParticles } from "../../lib/gpuDetect.js";
import { useStore } from "../../store";

/* ═══════���═══════════════════════════════════════════════════════
   Background3D — Enhanced Neural Pulse Network (Dora-inspired)

   Upgrades over v1:
   - Mouse-reactive dashboard wireframe (smooth lerp tilt)
   - Magnetic cursor particles drifting toward mouse
   - Z-based opacity falloff simulating depth-of-field
   - Enhanced neural pulses (24 paths, varying sizes, burst effect)
   - GPU tier-aware particle scaling
   ════════════��═══════════════════════════���══════════════════════ */

// Shared mouse position ref (normalized -1 to 1)
const mouseRef = { x: 0, y: 0 };

function MouseTracker() {
  const { size } = useThree();
  const onMove = useCallback((e) => {
    mouseRef.x = (e.clientX / size.width) * 2 - 1;
    mouseRef.y = -(e.clientY / size.height) * 2 + 1;
  }, [size]);

  // Attach to window for smooth tracking even at edges
  React.useEffect(() => {
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [onMove]);

  return null;
}

/* ── LAYER 1: Starfield with z-based opacity falloff ── */
function Starfield({ count = 600, isLight = false }) {
  const ref = useRef();

  const [positions, _opacities] = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const alpha = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const z = -5 - Math.random() * 25;
      pos[i * 3] = (Math.random() - 0.5) * 60;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 40;
      pos[i * 3 + 2] = z;
      // Depth-of-field simulation: distant particles fade
      alpha[i] = Math.max(0.1, 1 - Math.abs(z + 15) / 20);
    }
    return [pos, alpha];
  }, [count]);

  useFrame((s) => {
    if (ref.current) ref.current.rotation.y = s.clock.getElapsedTime() * 0.005;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.05} color={isLight ? "#3B82F6" : "#4f46e5"} transparent opacity={isLight ? 0.3 : 0.4} sizeAttenuation depthWrite={false} blending={isLight ? THREE.NormalBlending : THREE.AdditiveBlending} />
    </points>
  );
}

/* ── LAYER 2: Dashboard screen wireframe (mouse-reactive) ── */
function DashboardScreen({ enableMouseTracking = true, isLight = false }) {
  const groupRef = useRef();
  const glowRef = useRef();
  const targetRot = useRef({ x: 0, y: 0 });

  useFrame((s) => {
    const t = s.clock.getElapsedTime();
    if (groupRef.current) {
      if (enableMouseTracking) {
        // Smooth lerp toward mouse-driven rotation
        targetRot.current.y = mouseRef.x * 0.15;
        targetRot.current.x = mouseRef.y * -0.08;
        groupRef.current.rotation.y += (targetRot.current.y - groupRef.current.rotation.y) * 0.04;
        groupRef.current.rotation.x += (targetRot.current.x - groupRef.current.rotation.x) * 0.04;
      } else {
        groupRef.current.rotation.y = Math.sin(t * 0.15) * 0.05;
        groupRef.current.rotation.x = Math.sin(t * 0.1) * 0.02;
      }
    }
    if (glowRef.current) {
      glowRef.current.material.opacity = 0.03 + Math.sin(t * 0.8) * 0.015;
    }
  });

  const bars = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => ({
      x: -2.2 + i * 0.8,
      height: 0.5 + Math.random() * 1.8,
    }));
  }, []);

  return (
    <group ref={groupRef} position={[0, 0, -10]}>
      <mesh>
        <planeGeometry args={[8, 5]} />
        <meshBasicMaterial color={isLight ? "#3B82F6" : "#2563EB"} wireframe transparent opacity={isLight ? 0.08 : 0.06} depthWrite={false} blending={isLight ? THREE.NormalBlending : THREE.AdditiveBlending} />
      </mesh>
      <mesh ref={glowRef} position={[0, 0, -0.1]}>
        <planeGeometry args={[9, 6]} />
        <meshBasicMaterial color={isLight ? "#3B82F6" : "#2563EB"} transparent opacity={isLight ? 0.05 : 0.03} depthWrite={false} blending={isLight ? THREE.NormalBlending : THREE.AdditiveBlending} />
      </mesh>
      {bars.map((bar, i) => (
        <mesh key={i} position={[bar.x, -1.5 + bar.height / 2, 0.01]}>
          <planeGeometry args={[0.4, bar.height]} />
          <meshBasicMaterial color={i % 2 === 0 ? (isLight ? "#3B82F6" : "#3B82F6") : (isLight ? "#a78bfa" : "#a78bfa")} transparent opacity={isLight ? 0.10 : 0.07} depthWrite={false} blending={isLight ? THREE.NormalBlending : THREE.AdditiveBlending} />
        </mesh>
      ))}
      {[-0.5, 0.5, 1.5].map((y, i) => (
        <mesh key={`h${i}`} position={[0, y, 0.01]}>
          <planeGeometry args={[7, 0.005]} />
          <meshBasicMaterial color={isLight ? "#3B82F6" : "#2563EB"} transparent opacity={isLight ? 0.08 : 0.08} depthWrite={false} blending={isLight ? THREE.NormalBlending : THREE.AdditiveBlending} />
        </mesh>
      ))}
    </group>
  );
}

/* ── LAYER 3: Enhanced Neural Pulses (24 paths, burst effect) ── */
function NeuralPulses({ count = 24, particlesPerPath = 25, isLight = false }) {
  const totalParticles = count * particlesPerPath;
  const ref = useRef();

  const curves = useMemo(() => {
    return Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.3;
      const edgeR = 15 + Math.random() * 8;
      const startX = Math.cos(angle) * edgeR;
      const startY = Math.sin(angle) * edgeR * 0.6;
      const startZ = -2 - Math.random() * 6;
      const endX = (Math.random() - 0.5) * 4;
      const endY = (Math.random() - 0.5) * 2.5;
      const endZ = -9 - Math.random() * 2;
      const midX = (startX + endX) * 0.5 + (Math.random() - 0.5) * 6;
      const midY = (startY + endY) * 0.5 + (Math.random() - 0.5) * 5;
      const midZ = (startZ + endZ) * 0.5 - Math.random() * 3;

      return new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(startX, startY, startZ),
        new THREE.Vector3(midX, midY, midZ),
        new THREE.Vector3(endX, endY, endZ)
      );
    });
  }, [count]);

  const [positions, sizes] = useMemo(() => {
    const pos = new Float32Array(totalParticles * 3);
    const sz = new Float32Array(totalParticles);
    for (let c = 0; c < count; c++) {
      for (let p = 0; p < particlesPerPath; p++) {
        const idx = c * particlesPerPath + p;
        const t = p / particlesPerPath;
        const pt = curves[c].getPoint(t);
        pos[idx * 3] = pt.x;
        pos[idx * 3 + 1] = pt.y;
        pos[idx * 3 + 2] = pt.z;
        // Burst effect: particles grow as they approach dashboard
        sz[idx] = 0.03 + t * t * 0.15;
      }
    }
    return [pos, sz];
  }, [curves, totalParticles, count, particlesPerPath]);

  useFrame((state) => {
    const geo = ref.current?.geometry;
    if (!geo) return;
    const t = state.clock.getElapsedTime();
    const posArr = geo.attributes.position.array;

    for (let c = 0; c < count; c++) {
      const speed = 0.06 + (c % 4) * 0.02;
      const offset = c * 0.7;
      for (let p = 0; p < particlesPerPath; p++) {
        const idx = c * particlesPerPath + p;
        // Burst: accelerate near end (easeInQuad)
        const linearProgress = ((p / particlesPerPath) + t * speed + offset) % 1;
        const progress = linearProgress * linearProgress * 0.5 + linearProgress * 0.5;
        const pt = curves[c].getPoint(Math.min(progress, 0.999));
        posArr[idx * 3] = pt.x;
        posArr[idx * 3 + 1] = pt.y;
        posArr[idx * 3 + 2] = pt.z;
      }
    }
    geo.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-size" args={[sizes, 1]} />
      </bufferGeometry>
      <pointsMaterial size={0.1} color={isLight ? "#7c3aed" : "#a78bfa"} transparent opacity={isLight ? 0.45 : 0.7} sizeAttenuation depthWrite={false} blending={isLight ? THREE.NormalBlending : THREE.AdditiveBlending} />
    </points>
  );
}

/* ── LAYER 4: Outgoing pulses ── */
function OutgoingPulses({ count = 8, particlesPerPath = 15, isLight = false }) {
  const totalParticles = count * particlesPerPath;
  const ref = useRef();

  const curves = useMemo(() => {
    return Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * Math.PI * 2 + 0.4;
      const edgeR = 12 + Math.random() * 6;
      return new THREE.QuadraticBezierCurve3(
        new THREE.Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 2, -9),
        new THREE.Vector3(Math.cos(angle) * edgeR * 0.4, Math.sin(angle) * edgeR * 0.25, -6),
        new THREE.Vector3(Math.cos(angle) * edgeR, Math.sin(angle) * edgeR * 0.5, -3)
      );
    });
  }, [count]);

  const positions = useMemo(() => {
    const pos = new Float32Array(totalParticles * 3);
    for (let c = 0; c < count; c++) {
      for (let p = 0; p < particlesPerPath; p++) {
        const pt = curves[c].getPoint(p / particlesPerPath);
        const idx = (c * particlesPerPath + p) * 3;
        pos[idx] = pt.x; pos[idx + 1] = pt.y; pos[idx + 2] = pt.z;
      }
    }
    return pos;
  }, [curves, totalParticles, count, particlesPerPath]);

  useFrame((state) => {
    const geo = ref.current?.geometry;
    if (!geo) return;
    const t = state.clock.getElapsedTime();
    const arr = geo.attributes.position.array;
    for (let c = 0; c < count; c++) {
      const speed = 0.04 + (c % 3) * 0.015;
      for (let p = 0; p < particlesPerPath; p++) {
        const progress = ((p / particlesPerPath) + t * speed + c * 0.5) % 1;
        const pt = curves[c].getPoint(progress);
        const idx = (c * particlesPerPath + p) * 3;
        arr[idx] = pt.x; arr[idx + 1] = pt.y; arr[idx + 2] = pt.z;
      }
    }
    geo.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.07} color={isLight ? "#10b981" : "#34d399"} transparent opacity={isLight ? 0.35 : 0.5} sizeAttenuation depthWrite={false} blending={isLight ? THREE.NormalBlending : THREE.AdditiveBlending} />
    </points>
  );
}

/* ── LAYER 5: Orbital rings ── */
function OrbitalRings({ isLight = false }) {
  const ring1 = useRef(), ring2 = useRef();

  useFrame((s) => {
    const t = s.clock.getElapsedTime();
    if (ring1.current) { ring1.current.rotation.x = t * 0.04; ring1.current.rotation.z = t * 0.025; }
    if (ring2.current) { ring2.current.rotation.y = t * 0.035; ring2.current.rotation.x = t * 0.02 + 1; }
  });

  return (
    <group position={[0, 0, -8]}>
      <mesh ref={ring1}>
        <torusGeometry args={[11, 0.015, 8, 100]} />
        <meshBasicMaterial color={isLight ? "#3B82F6" : "#2563EB"} transparent opacity={isLight ? 0.12 : 0.1} depthWrite={false} blending={isLight ? THREE.NormalBlending : THREE.AdditiveBlending} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={ring2}>
        <torusGeometry args={[14, 0.01, 8, 120]} />
        <meshBasicMaterial color={isLight ? "#a855f7" : "#a855f7"} transparent opacity={isLight ? 0.10 : 0.07} depthWrite={false} blending={isLight ? THREE.NormalBlending : THREE.AdditiveBlending} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/* ── LAYER 6: Grid floor ── */
function GridFloor({ isLight = false }) {
  const ref = useRef();
  useFrame((s) => {
    if (ref.current) ref.current.position.z = -((s.clock.getElapsedTime() * 0.5) % 2);
  });

  return (
    <group ref={ref} position={[0, -10, -10]} rotation={[-Math.PI / 3, 0, 0]}>
      <gridHelper args={[60, 40, isLight ? "#3B82F6" : "#2563EB", isLight ? "#c7d2fe" : "#1e1b4b"]} material-transparent material-opacity={isLight ? 0.10 : 0.08} material-depthWrite={false} />
    </group>
  );
}

/* ── LAYER 7 (NEW): Magnetic cursor particles ── */
function MagneticParticles({ count = 200, isLight = false }) {
  const ref = useRef();
  const velocities = useRef(null);

  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 30;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 20;
      pos[i * 3 + 2] = -3 - Math.random() * 10;
      vel[i * 3] = 0;
      vel[i * 3 + 1] = 0;
      vel[i * 3 + 2] = 0;
    }
    velocities.current = vel;
    return pos;
  }, [count]);

  useFrame(() => {
    const geo = ref.current?.geometry;
    if (!geo || !velocities.current) return;
    const posArr = geo.attributes.position.array;
    const vel = velocities.current;

    // Mouse world position (approximate)
    const mx = mouseRef.x * 15;
    const my = mouseRef.y * 10;

    for (let i = 0; i < count; i++) {
      const ix = i * 3, iy = i * 3 + 1, _iz = i * 3 + 2;
      const dx = mx - posArr[ix];
      const dy = my - posArr[iy];
      const dist = Math.sqrt(dx * dx + dy * dy) + 0.1;

      // Spring force toward mouse (stronger when close)
      const force = Math.min(0.003, 0.05 / (dist * dist));
      vel[ix] += dx * force;
      vel[iy] += dy * force;

      // Damping
      vel[ix] *= 0.96;
      vel[iy] *= 0.96;

      // Apply velocity
      posArr[ix] += vel[ix];
      posArr[iy] += vel[iy];

      // Gentle drift back if too far from origin
      posArr[ix] += (0 - posArr[ix]) * 0.001;
      posArr[iy] += (0 - posArr[iy]) * 0.001;
    }
    geo.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.06} color={isLight ? "#2563EB" : "#3B82F6"} transparent opacity={isLight ? 0.25 : 0.35} sizeAttenuation depthWrite={false} blending={isLight ? THREE.NormalBlending : THREE.AdditiveBlending} />
    </points>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN EXPORT — GPU-tier aware
   ═══════���══════════════════════════════���════════════════════════ */
export default function Background3D({ className = "" }) {
  const tier = useGPUTier();
  const resolvedTheme = useStore(s => s.resolvedTheme);
  const isLight = resolvedTheme === 'light';

  // Low tier: don't render 3D at all (caller shows 2D fallback)
  if (tier === "low") return null;

  const isHigh = tier === "high";

  return (
    <div className={`absolute inset-0 pointer-events-none three-canvas-wrapper ${className}`} aria-hidden="true" style={{ zIndex: 0 }}>
      <Canvas
        camera={{ position: [0, 0, 18], fov: 50 }}
        dpr={[1, isHigh ? 1.5 : 1]}
        gl={{ antialias: false, alpha: true, powerPreference: "high-performance" }}
      >
        <fog attach="fog" args={[isLight ? "#F8F9FB" : "#06060e", 15, 45]} />
        {isHigh && <MouseTracker />}
        <Starfield count={scaleParticles(600, tier)} isLight={isLight} />
        <DashboardScreen enableMouseTracking={isHigh} isLight={isLight} />
        <NeuralPulses count={scaleParticles(24, tier)} isLight={isLight} />
        <OutgoingPulses count={scaleParticles(8, tier)} isLight={isLight} />
        <OrbitalRings isLight={isLight} />
        <GridFloor isLight={isLight} />
        {isHigh && <MagneticParticles count={200} isLight={isLight} />}
      </Canvas>
    </div>
  );
}
