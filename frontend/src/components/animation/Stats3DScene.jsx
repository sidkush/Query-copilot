import React, { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useGPUTier } from "../../lib/gpuDetect";

/* ═══════════════════════════════════════════════════════════════
   Stats3DScene — Animated ring arcs with overlaid HTML counters.
   Each stat gets a colored arc that animates from 0 to target angle.
   ═══════════════════════════════════════════════════════════════ */

const STAT_CONFIGS = [
  { value: 18, suffix: "+", label: "Database engines supported", color: "#6366f1", targetAngle: 0.9 },
  { value: 6, suffix: " layers", label: "SQL security validation", color: "#a855f7", targetAngle: 0.75 },
  { value: 100, suffix: "%", label: "Read-only data guarantee", color: "#3b82f6", targetAngle: 1.0 },
  { value: 0, suffix: " breaches", label: "By design, not by promise", color: "#818cf8", targetAngle: 0.0 },
];

function AnimatedRing({ position, color, targetAngle, delay = 0 }) {
  const ref = useRef();
  const progress = useRef(0);
  const started = useRef(false);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (t < delay) return;
    if (!started.current) started.current = true;

    // Ease-out animation
    progress.current += (targetAngle - progress.current) * 0.02;

    if (ref.current) {
      ref.current.geometry.dispose();
      ref.current.geometry = new THREE.RingGeometry(1.6, 2, 64, 1, 0, progress.current * Math.PI * 2);
      ref.current.rotation.z = t * 0.15;
    }
  });

  return (
    <mesh ref={ref} position={position}>
      <ringGeometry args={[1.6, 2, 64, 1, 0, 0.01]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={0.25}
        side={THREE.DoubleSide}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

function ParticleDust({ count = 80 }) {
  const ref = useRef();
  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 24;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 12;
      pos[i * 3 + 2] = -1 - Math.random() * 8;
    }
    return pos;
  }, [count]);

  useFrame((s) => {
    if (ref.current) ref.current.rotation.y = s.clock.getElapsedTime() * 0.008;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.04} color="#6366f1" transparent opacity={0.3} sizeAttenuation depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
}

function StatsScene() {
  const spacing = 6;
  const positions = STAT_CONFIGS.map((_, i) => [
    (i - 1.5) * spacing, 0, -5
  ]);

  return (
    <group>
      {STAT_CONFIGS.map((stat, i) => (
        <AnimatedRing
          key={stat.label}
          position={positions[i]}
          color={stat.color}
          targetAngle={stat.targetAngle}
          delay={i * 0.3}
        />
      ))}
      <ParticleDust count={80} />
    </group>
  );
}

export default function Stats3DScene({ className = "" }) {
  const tier = useGPUTier();

  if (tier === "low") return null;

  return (
    <div className={`w-full h-64 relative three-canvas-wrapper ${className}`}>
      <Canvas
        camera={{ position: [0, 0, 12], fov: 50 }}
        dpr={[1, tier === "high" ? 1.5 : 1]}
        gl={{ antialias: false, alpha: true, powerPreference: "high-performance" }}
      >
        <StatsScene />
      </Canvas>
    </div>
  );
}
