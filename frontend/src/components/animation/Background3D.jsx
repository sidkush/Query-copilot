import React, { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

/* ═══════════════════════════════════════════════════════════════
   Background3D — Neural Pulse Network
   
   Concept: Tiny glowing neuron-like pulses travel along curved
   paths from the edges of the screen, converging toward a
   central "dashboard screen" wireframe. Represents data flowing
   into QueryCopilot and becoming insights/dashboards.
   ═══════════════════════════════════════════════════════════════ */

/* ── LAYER 1: Ambient starfield (tiny dots, very subtle) ── */
function Starfield() {
  const ref = useRef();
  const count = 600;

  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 60;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 40;
      pos[i * 3 + 2] = -5 - Math.random() * 25;
    }
    return pos;
  }, []);

  useFrame((s) => {
    if (ref.current) ref.current.rotation.y = s.clock.getElapsedTime() * 0.005;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.05} color="#4f46e5" transparent opacity={0.4} sizeAttenuation depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
}

/* ── LAYER 2: Dashboard screen wireframe (center-back) ── */
function DashboardScreen() {
  const groupRef = useRef();
  const glowRef = useRef();

  useFrame((s) => {
    const t = s.clock.getElapsedTime();
    if (groupRef.current) {
      groupRef.current.rotation.y = Math.sin(t * 0.15) * 0.05;
      groupRef.current.rotation.x = Math.sin(t * 0.1) * 0.02;
    }
    if (glowRef.current) {
      glowRef.current.material.opacity = 0.03 + Math.sin(t * 0.8) * 0.015;
    }
  });

  // Internal dashboard elements (chart bars, grid lines)
  const bars = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => ({
      x: -2.2 + i * 0.8,
      height: 0.5 + Math.random() * 1.8,
    }));
  }, []);

  return (
    <group ref={groupRef} position={[0, 0, -10]}>
      {/* Main screen outline */}
      <mesh>
        <planeGeometry args={[8, 5]} />
        <meshBasicMaterial color="#6366f1" wireframe transparent opacity={0.06} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>

      {/* Screen glow backdrop */}
      <mesh ref={glowRef} position={[0, 0, -0.1]}>
        <planeGeometry args={[9, 6]} />
        <meshBasicMaterial color="#6366f1" transparent opacity={0.03} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>

      {/* Dashboard bar chart inside */}
      {bars.map((bar, i) => (
        <mesh key={i} position={[bar.x, -1.5 + bar.height / 2, 0.01]}>
          <planeGeometry args={[0.4, bar.height]} />
          <meshBasicMaterial color={i % 2 === 0 ? "#818cf8" : "#a78bfa"} transparent opacity={0.07} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
      ))}

      {/* Horizontal grid lines */}
      {[-0.5, 0.5, 1.5].map((y, i) => (
        <mesh key={`h${i}`} position={[0, y, 0.01]}>
          <planeGeometry args={[7, 0.005]} />
          <meshBasicMaterial color="#6366f1" transparent opacity={0.08} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
      ))}
    </group>
  );
}

/* ── LAYER 3: Neural pulse network — the hero effect ── */
function NeuralPulses() {
  const count = 14; // number of neural paths
  const particlesPerPath = 25;
  const totalParticles = count * particlesPerPath;
  const ref = useRef();

  // Generate bezier curves from edges toward center dashboard
  const curves = useMemo(() => {
    return Array.from({ length: count }, (_, i) => {
      // Start from random edge positions
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.3;
      const edgeR = 15 + Math.random() * 8;
      const startX = Math.cos(angle) * edgeR;
      const startY = Math.sin(angle) * edgeR * 0.6;
      const startZ = -2 - Math.random() * 6;

      // End near the dashboard screen center
       const endX = (Math.random() - 0.5) * 4;
      const endY = (Math.random() - 0.5) * 2.5;
      const endZ = -9 - Math.random() * 2;

      // Control points create nice arcs
      const midX = (startX + endX) * 0.5 + (Math.random() - 0.5) * 6;
      const midY = (startY + endY) * 0.5 + (Math.random() - 0.5) * 5;
      const midZ = (startZ + endZ) * 0.5 - Math.random() * 3;

      return new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(startX, startY, startZ),
        new THREE.Vector3(midX, midY, midZ),
        new THREE.Vector3(endX, endY, endZ)
      );
    });
  }, []);

  // Initial positions
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
        // Particles get brighter/bigger as they approach the dashboard
        sz[idx] = 0.04 + t * 0.12;
      }
    }
    return [pos, sz];
  }, [curves, totalParticles]);

  useFrame((state) => {
    const geo = ref.current?.geometry;
    if (!geo) return;
    const t = state.clock.getElapsedTime();
    const posArr = geo.attributes.position.array;

    for (let c = 0; c < count; c++) {
      const speed = 0.06 + (c % 4) * 0.02;
      const offset = c * 0.7; // stagger each path
      for (let p = 0; p < particlesPerPath; p++) {
        const idx = c * particlesPerPath + p;
        const progress = ((p / particlesPerPath) + t * speed + offset) % 1;
        const pt = curves[c].getPoint(progress);
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
      <pointsMaterial
        size={0.1}
        color="#a78bfa"
        transparent
        opacity={0.7}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

/* ── LAYER 4: Outgoing pulses (from dashboard outward — insights) ── */
function OutgoingPulses() {
  const count = 8;
  const particlesPerPath = 15;
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
  }, []);

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
  }, [curves, totalParticles]);

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
      <pointsMaterial size={0.07} color="#34d399" transparent opacity={0.5} sizeAttenuation depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
}

/* ── LAYER 5: Orbital rings ── */
function OrbitalRings() {
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
        <meshBasicMaterial color="#6366f1" transparent opacity={0.1} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={ring2}>
        <torusGeometry args={[14, 0.01, 8, 120]} />
        <meshBasicMaterial color="#a855f7" transparent opacity={0.07} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/* ── LAYER 6: Grid floor ── */
function GridFloor() {
  const ref = useRef();
  useFrame((s) => {
    if (ref.current) ref.current.position.z = -((s.clock.getElapsedTime() * 0.5) % 2);
  });

  return (
    <group ref={ref} position={[0, -10, -10]} rotation={[-Math.PI / 3, 0, 0]}>
      <gridHelper args={[60, 40, "#6366f1", "#1e1b4b"]} material-transparent material-opacity={0.08} material-depthWrite={false} />
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN EXPORT
   ═══════════════════════════════════════════════════════════════ */
export default function Background3D({ className = "" }) {
  return (
    <div className={`absolute inset-0 pointer-events-none ${className}`} aria-hidden="true" style={{ zIndex: 0 }}>
      <Canvas
        camera={{ position: [0, 0, 18], fov: 50 }}
        dpr={[1, 1.5]}
        gl={{ antialias: false, alpha: true, powerPreference: "high-performance" }}
      >
        <fog attach="fog" args={["#06060e", 15, 45]} />
        <Starfield />
        <DashboardScreen />
        <NeuralPulses />
        <OutgoingPulses />
        <OrbitalRings />
        <GridFloor />
      </Canvas>
    </div>
  );
}
