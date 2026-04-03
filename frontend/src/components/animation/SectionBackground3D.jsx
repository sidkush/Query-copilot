import React, { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

/* ═══════════════════════════════════════════════════════════════
   SectionBackground3D — Lightweight particle-only 3D scenes.
   NO glass materials, NO physical materials, NO mesh opacity.
   Only particles, wireframes, and additive blending.
   ═══════════════════════════════════════════════════════════════ */

/* ── Shared: subtle particle dust ── */
function ParticleDust({ count = 120, spread = 20, depth = 12, color = "#6366f1", size = 0.04 }) {
  const ref = useRef();
  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * spread;
      pos[i * 3 + 1] = (Math.random() - 0.5) * spread * 0.6;
      pos[i * 3 + 2] = -1 - Math.random() * depth;
    }
    return pos;
  }, [count, spread, depth]);

  useFrame((s) => {
    if (ref.current) ref.current.rotation.y = s.clock.getElapsedTime() * 0.008;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={size} color={color} transparent opacity={0.4} sizeAttenuation depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
}

/* ── Shared: Neural pulse along a curve ── */
function NeuralPath({ curve, particleCount = 20, speed = 0.08, color = "#818cf8", size = 0.08, offset = 0 }) {
  const ref = useRef();
  const positions = useMemo(() => {
    const pos = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      const pt = curve.getPoint(i / particleCount);
      pos[i * 3] = pt.x; pos[i * 3 + 1] = pt.y; pos[i * 3 + 2] = pt.z;
    }
    return pos;
  }, [curve, particleCount]);

  useFrame((state) => {
    const geo = ref.current?.geometry;
    if (!geo) return;
    const t = state.clock.getElapsedTime();
    const arr = geo.attributes.position.array;
    for (let i = 0; i < particleCount; i++) {
      const progress = ((i / particleCount) + t * speed + offset) % 1;
      const pt = curve.getPoint(progress);
      arr[i * 3] = pt.x; arr[i * 3 + 1] = pt.y; arr[i * 3 + 2] = pt.z;
    }
    geo.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={size} color={color} transparent opacity={0.6} sizeAttenuation depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MODE: features — wireframe polyhedra + neural pulses between
   ═══════════════════════════════════════════════════════════════ */
function FeaturesScene() {
  const group = useRef();
  const shapes = useMemo(() =>
    Array.from({ length: 6 }, (_, i) => ({
      pos: new THREE.Vector3((Math.random() - 0.5) * 18, (Math.random() - 0.5) * 10, -4 - Math.random() * 8),
      type: i % 3,
      scale: 0.3 + Math.random() * 0.4,
      color: ["#6366f1", "#a855f7", "#3b82f6"][i % 3],
      speed: 0.3 + Math.random(),
    })), []);

  const curves = useMemo(() => {
    const c = [];
    for (let i = 0; i < shapes.length - 1; i++) {
      c.push(new THREE.QuadraticBezierCurve3(
        shapes[i].pos,
        new THREE.Vector3(
          (shapes[i].pos.x + shapes[i + 1].pos.x) * 0.5,
          (shapes[i].pos.y + shapes[i + 1].pos.y) * 0.5 + 2,
          (shapes[i].pos.z + shapes[i + 1].pos.z) * 0.5
        ),
        shapes[i + 1].pos
      ));
    }
    return c;
  }, [shapes]);

  useFrame((s) => {
    if (group.current) group.current.rotation.y = s.clock.getElapsedTime() * 0.006;
  });

  return (
    <group ref={group}>
      {shapes.map((s, i) => (
        <mesh key={i} position={s.pos} scale={s.scale}>
          {s.type === 0 && <icosahedronGeometry args={[1, 0]} />}
          {s.type === 1 && <octahedronGeometry args={[1, 0]} />}
          {s.type === 2 && <dodecahedronGeometry args={[1, 0]} />}
          <meshBasicMaterial color={s.color} wireframe transparent opacity={0.1} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
      ))}
      {curves.map((curve, i) => (
        <NeuralPath key={i} curve={curve} particleCount={15} speed={0.06} color="#818cf8" size={0.06} offset={i * 0.3} />
      ))}
      <ParticleDust count={180} spread={24} color="#6366f1" />
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MODE: howItWorks — 3 node points with flowing pulses between
   ═══════════════════════════════════════════════════════════════ */
function HowItWorksScene() {
  const nodePositions = useMemo(() => [
    new THREE.Vector3(-7, 0, -5),
    new THREE.Vector3(0, 0, -5),
    new THREE.Vector3(7, 0, -5),
  ], []);

  const curves = useMemo(() => [
    new THREE.QuadraticBezierCurve3(nodePositions[0], new THREE.Vector3(-3.5, 3, -4), nodePositions[1]),
    new THREE.QuadraticBezierCurve3(nodePositions[1], new THREE.Vector3(3.5, -3, -4), nodePositions[2]),
  ], [nodePositions]);

  const ringRefs = [useRef(), useRef(), useRef()];

  useFrame((s) => {
    const t = s.clock.getElapsedTime();
    ringRefs.forEach((r, i) => {
      if (r.current) {
        r.current.rotation.z = t * (0.2 + i * 0.05);
        r.current.scale.setScalar(1 + Math.sin(t * 1.2 + i * 2) * 0.1);
      }
    });
  });

  return (
    <group>
      {nodePositions.map((pos, i) => (
        <mesh key={i} ref={ringRefs[i]} position={pos}>
          <torusGeometry args={[1.2, 0.01, 8, 40]} />
          <meshBasicMaterial color={["#6366f1", "#a855f7", "#3b82f6"][i]} transparent opacity={0.15} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
      ))}
      {curves.map((curve, i) => (
        <NeuralPath key={i} curve={curve} particleCount={20} speed={0.08} color="#a78bfa" size={0.08} offset={i * 0.5} />
      ))}
      <ParticleDust count={120} spread={20} color="#6366f1" />
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MODE: demo — wireframe monitor + incoming data pulses
   ═══════════════════════════════════════════════════════════════ */
function DemoScene() {
  const screenRef = useRef();

  const curves = useMemo(() =>
    Array.from({ length: 4 }, (_, i) => {
      const angle = (i / 4) * Math.PI * 2;
      return new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(Math.cos(angle) * 10, Math.sin(angle) * 6, -3),
        new THREE.Vector3(Math.cos(angle) * 4, Math.sin(angle) * 2, -5),
        new THREE.Vector3(0, 0, -7)
      );
    }), []);

  useFrame((s) => {
    if (screenRef.current) {
      const t = s.clock.getElapsedTime();
      screenRef.current.rotation.y = Math.sin(t * 0.12) * 0.04;
    }
  });

  return (
    <group>
      <mesh ref={screenRef} position={[0, 0, -7]}>
        <planeGeometry args={[6, 4]} />
        <meshBasicMaterial color="#6366f1" wireframe transparent opacity={0.05} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      {curves.map((curve, i) => (
        <NeuralPath key={i} curve={curve} particleCount={12} speed={0.07} color="#818cf8" size={0.07} offset={i * 0.4} />
      ))}
      <ParticleDust count={100} spread={18} color="#a855f7" />
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MODE: stats — spiral particle vortex (pure particles)
   ═══════════════════════════════════════════════════════════════ */
function StatsScene() {
  const ref = useRef();
  const count = 250;
  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 8;
      const radius = 1 + (i / count) * 9;
      pos[i * 3] = Math.cos(angle) * radius;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 4;
      pos[i * 3 + 2] = Math.sin(angle) * radius * 0.2 - 5;
    }
    return pos;
  }, []);

  useFrame((s) => {
    if (ref.current) ref.current.rotation.z = s.clock.getElapsedTime() * 0.015;
  });

  return (
    <group>
      <points ref={ref}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        </bufferGeometry>
        <pointsMaterial size={0.05} color="#818cf8" transparent opacity={0.35} sizeAttenuation depthWrite={false} blending={THREE.AdditiveBlending} />
      </points>
      <ParticleDust count={80} spread={18} color="#6366f1" size={0.03} />
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MODE: testimonials — floating neuron network (no glass!)
   ═══════════════════════════════════════════════════════════════ */
function TestimonialsScene() {
  const group = useRef();
  const nodeCount = 12;

  const nodes = useMemo(() =>
    Array.from({ length: nodeCount }, () => new THREE.Vector3(
      (Math.random() - 0.5) * 20,
      (Math.random() - 0.5) * 10,
      -3 - Math.random() * 8
    )), []);

  const curves = useMemo(() => {
    const c = [];
    for (let i = 0; i < nodeCount; i++) {
      const closest = nodes
        .map((n, j) => ({ j, dist: nodes[i].distanceTo(n) }))
        .filter(n => n.j !== i)
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 2);
      closest.forEach(({ j }) => {
        c.push(new THREE.QuadraticBezierCurve3(
          nodes[i],
          new THREE.Vector3(
            (nodes[i].x + nodes[j].x) * 0.5 + (Math.random() - 0.5) * 2,
            (nodes[i].y + nodes[j].y) * 0.5 + (Math.random() - 0.5) * 2,
            (nodes[i].z + nodes[j].z) * 0.5
          ),
          nodes[j]
        ));
      });
    }
    return c;
  }, [nodes]);

  useFrame((s) => {
    if (group.current) group.current.rotation.y = s.clock.getElapsedTime() * 0.005;
  });

  return (
    <group ref={group}>
      {/* Node glow dots */}
      {nodes.map((pos, i) => (
        <mesh key={i} position={pos}>
          <circleGeometry args={[0.08, 8]} />
          <meshBasicMaterial color="#a78bfa" transparent opacity={0.4} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
      ))}
      {/* Pulse paths */}
      {curves.map((curve, i) => (
        <NeuralPath key={i} curve={curve} particleCount={10} speed={0.05} color="#818cf8" size={0.05} offset={i * 0.2} />
      ))}
      <ParticleDust count={100} spread={22} color="#a855f7" />
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MODE: pricing — ascending particle columns (value tiers)
   ═══════════════════════════════════════════════════════════════ */
function PricingScene() {
  const columns = 3;
  const particlesPerCol = 30;
  const refs = [useRef(), useRef(), useRef()];

  const columnPositions = useMemo(() => {
    const all = [];
    for (let c = 0; c < columns; c++) {
      const pos = new Float32Array(particlesPerCol * 3);
      const xBase = (c - 1) * 7;
      for (let p = 0; p < particlesPerCol; p++) {
        pos[p * 3] = xBase + (Math.random() - 0.5) * 1.5;
        pos[p * 3 + 1] = (p / particlesPerCol) * 12 - 6;
        pos[p * 3 + 2] = -4 - Math.random() * 4;
      }
      all.push(pos);
    }
    return all;
  }, []);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    refs.forEach((ref, c) => {
      const geo = ref.current?.geometry;
      if (!geo) return;
      const arr = geo.attributes.position.array;
      const xBase = (c - 1) * 7;
      for (let p = 0; p < particlesPerCol; p++) {
        const y = ((p / particlesPerCol + t * (0.05 + c * 0.015)) % 1) * 12 - 6;
        arr[p * 3] = xBase + Math.sin(t + p * 0.5) * 0.5;
        arr[p * 3 + 1] = y;
      }
      geo.attributes.position.needsUpdate = true;
    });
  });

  const colors = ["#6366f1", "#a855f7", "#818cf8"];

  return (
    <group>
      {columnPositions.map((pos, i) => (
        <points key={i} ref={refs[i]}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[pos, 3]} />
          </bufferGeometry>
          <pointsMaterial size={0.07} color={colors[i]} transparent opacity={0.4} sizeAttenuation depthWrite={false} blending={THREE.AdditiveBlending} />
        </points>
      ))}
      <ParticleDust count={120} spread={22} color="#6366f1" />
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MODE: cta — converging light streaks toward center
   ═══════════════════════════════════════════════════════════════ */
function CTAScene() {
  const count = 10;
  const particlesPerStreak = 20;

  const curves = useMemo(() =>
    Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * Math.PI * 2;
      const r = 14;
      return new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(Math.cos(angle) * r, Math.sin(angle) * r * 0.4, -10),
        new THREE.Vector3(Math.cos(angle) * r * 0.3, Math.sin(angle) * r * 0.12, -6),
        new THREE.Vector3(0, 0, -4)
      );
    }), []);

  return (
    <group>
      {curves.map((curve, i) => (
        <NeuralPath key={i} curve={curve} particleCount={particlesPerStreak} speed={0.1} color="#a78bfa" size={0.09} offset={i * 0.3} />
      ))}
      <ParticleDust count={80} spread={16} color="#6366f1" />
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════════ */
const SCENES = {
  features: FeaturesScene,
  howItWorks: HowItWorksScene,
  demo: DemoScene,
  stats: StatsScene,
  testimonials: TestimonialsScene,
  pricing: PricingScene,
  cta: CTAScene,
};

export default function SectionBackground3D({ mode = "features", className = "" }) {
  const SceneComponent = SCENES[mode];
  if (!SceneComponent) return null;

  return (
    <div className={`absolute inset-0 pointer-events-none ${className}`} aria-hidden="true" style={{ zIndex: 0 }}>
      <Canvas
        camera={{ position: [0, 0, 12], fov: 50 }}
        dpr={[1, 1.5]}
        gl={{ antialias: false, alpha: true, powerPreference: "high-performance" }}
      >
        <fog attach="fog" args={["#06060e", 8, 25]} />
        <SceneComponent />
      </Canvas>
    </div>
  );
}
