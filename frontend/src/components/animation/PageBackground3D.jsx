import React, { useMemo, useRef, useCallback, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useGPUTier, scaleParticles } from "../../lib/gpuDetect";

/* ═══════════════════════════════════════════════════════════════
   PageBackground3D — Subtle 3D background for inner app pages.

   Lighter than the landing hero Background3D but much richer than
   the flat 2D AnimatedBackground. Features:
   - Floating wireframe polyhedra with gentle rotation
   - Neural connection pulses between shapes
   - Ambient particle dust
   - Mouse-reactive subtle camera sway
   - GPU tier aware (low = null, medium = half, high = full)

   Modes: "default" | "data" | "auth" | "profile"
   Each mode adjusts colors and shapes to match page context.
   ═══════════════════════════════════════════════════════════════ */

const MODE_CONFIG = {
  default: {
    primaryColor: "#6366f1",
    secondaryColor: "#a855f7",
    accentColor: "#818cf8",
    shapes: ["icosahedron", "octahedron", "dodecahedron", "tetrahedron"],
    shapeCount: 5,
    dustCount: 100,
    pathCount: 4,
  },
  data: {
    primaryColor: "#3b82f6",
    secondaryColor: "#6366f1",
    accentColor: "#60a5fa",
    shapes: ["box", "octahedron", "icosahedron", "cylinder"],
    shapeCount: 6,
    dustCount: 120,
    pathCount: 5,
  },
  auth: {
    primaryColor: "#6366f1",
    secondaryColor: "#8b5cf6",
    accentColor: "#a78bfa",
    shapes: ["dodecahedron", "icosahedron", "torus"],
    shapeCount: 4,
    dustCount: 80,
    pathCount: 3,
  },
  profile: {
    primaryColor: "#8b5cf6",
    secondaryColor: "#a855f7",
    accentColor: "#c084fc",
    shapes: ["sphere", "octahedron", "torus"],
    shapeCount: 4,
    dustCount: 90,
    pathCount: 3,
  },
};

// Shared mouse ref
const mouseRef = { x: 0, y: 0 };

function MouseTracker() {
  const { size } = useThree();
  useEffect(() => {
    const onMove = (e) => {
      mouseRef.x = (e.clientX / size.width) * 2 - 1;
      mouseRef.y = -(e.clientY / size.height) * 2 + 1;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [size]);
  return null;
}

/* ── Ambient particle dust ── */
function ParticleDust({ count = 100, color = "#6366f1" }) {
  const ref = useRef();
  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 30;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 20;
      pos[i * 3 + 2] = -2 - Math.random() * 15;
    }
    return pos;
  }, [count]);

  useFrame((s) => {
    if (ref.current) ref.current.rotation.y = s.clock.getElapsedTime() * 0.006;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.04} color={color} transparent opacity={0.35} sizeAttenuation depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
}

/* ── Floating wireframe shapes ── */
function FloatingShapes({ config }) {
  const groupRef = useRef();
  const shapeRefs = useRef([]);

  const shapes = useMemo(() => {
    return Array.from({ length: config.shapeCount }, (_, i) => ({
      type: config.shapes[i % config.shapes.length],
      pos: new THREE.Vector3(
        (Math.random() - 0.5) * 20,
        (Math.random() - 0.5) * 12,
        -4 - Math.random() * 10
      ),
      scale: 0.3 + Math.random() * 0.5,
      rotSpeed: 0.1 + Math.random() * 0.3,
      floatSpeed: 0.3 + Math.random() * 0.4,
      floatAmp: 0.3 + Math.random() * 0.5,
      color: i % 2 === 0 ? config.primaryColor : config.secondaryColor,
    }));
  }, [config]);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    // Subtle camera sway from mouse
    if (groupRef.current) {
      groupRef.current.rotation.y += (mouseRef.x * 0.02 - groupRef.current.rotation.y) * 0.02;
      groupRef.current.rotation.x += (mouseRef.y * -0.01 - groupRef.current.rotation.x) * 0.02;
    }
    // Individual shape animation
    shapeRefs.current.forEach((ref, i) => {
      if (!ref) return;
      const s = shapes[i];
      ref.rotation.x = t * s.rotSpeed * 0.3;
      ref.rotation.y = t * s.rotSpeed * 0.5;
      ref.position.y = s.pos.y + Math.sin(t * s.floatSpeed + i * 2) * s.floatAmp;
    });
  });

  const getGeometry = (type) => {
    switch (type) {
      case "icosahedron": return <icosahedronGeometry args={[1, 0]} />;
      case "octahedron": return <octahedronGeometry args={[1, 0]} />;
      case "dodecahedron": return <dodecahedronGeometry args={[1, 0]} />;
      case "tetrahedron": return <tetrahedronGeometry args={[1, 0]} />;
      case "box": return <boxGeometry args={[1.2, 1.2, 1.2]} />;
      case "torus": return <torusGeometry args={[0.8, 0.25, 8, 20]} />;
      case "sphere": return <sphereGeometry args={[1, 12, 8]} />;
      case "cylinder": return <cylinderGeometry args={[0.6, 0.6, 1.5, 8]} />;
      default: return <icosahedronGeometry args={[1, 0]} />;
    }
  };

  return (
    <group ref={groupRef}>
      {shapes.map((s, i) => (
        <mesh
          key={i}
          ref={(el) => (shapeRefs.current[i] = el)}
          position={s.pos}
          scale={s.scale}
        >
          {getGeometry(s.type)}
          <meshBasicMaterial
            color={s.color}
            wireframe
            transparent
            opacity={0.08}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      ))}
    </group>
  );
}

/* ── Neural connection pulses between shapes ── */
function NeuralConnections({ config }) {
  const shapes = useMemo(() => {
    return Array.from({ length: config.shapeCount }, () =>
      new THREE.Vector3(
        (Math.random() - 0.5) * 18,
        (Math.random() - 0.5) * 10,
        -4 - Math.random() * 8
      )
    );
  }, [config.shapeCount]);

  const curves = useMemo(() => {
    const c = [];
    for (let i = 0; i < Math.min(config.pathCount, shapes.length - 1); i++) {
      const a = shapes[i], b = shapes[i + 1];
      c.push(new THREE.QuadraticBezierCurve3(
        a,
        new THREE.Vector3(
          (a.x + b.x) * 0.5 + (Math.random() - 0.5) * 3,
          (a.y + b.y) * 0.5 + (Math.random() - 0.5) * 3,
          (a.z + b.z) * 0.5
        ),
        b
      ));
    }
    return c;
  }, [shapes, config.pathCount]);

  return (
    <>
      {curves.map((curve, i) => (
        <NeuralPath
          key={i}
          curve={curve}
          color={config.accentColor}
          particleCount={12}
          speed={0.05}
          offset={i * 0.4}
        />
      ))}
    </>
  );
}

function NeuralPath({ curve, particleCount = 12, speed = 0.05, color = "#818cf8", offset = 0 }) {
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
      <pointsMaterial size={0.06} color={color} transparent opacity={0.5} sizeAttenuation depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
}

/* ── Subtle orbital ring ── */
function OrbitalRing({ color = "#6366f1" }) {
  const ref = useRef();
  useFrame((s) => {
    if (ref.current) {
      const t = s.clock.getElapsedTime();
      ref.current.rotation.x = t * 0.02;
      ref.current.rotation.z = t * 0.015;
    }
  });

  return (
    <mesh ref={ref} position={[0, 0, -8]}>
      <torusGeometry args={[10, 0.01, 8, 80]} />
      <meshBasicMaterial color={color} transparent opacity={0.06} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
    </mesh>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN EXPORT
   ═══════════════════════════════════════════════════════════════ */
export default function PageBackground3D({ mode = "default", className = "" }) {
  const tier = useGPUTier();

  if (tier === "low") return null;

  const config = MODE_CONFIG[mode] || MODE_CONFIG.default;
  const isHigh = tier === "high";

  return (
    <div className={`absolute inset-0 pointer-events-none three-canvas-wrapper ${className}`} aria-hidden="true" style={{ zIndex: 0 }}>
      <Canvas
        camera={{ position: [0, 0, 14], fov: 50 }}
        dpr={[1, isHigh ? 1.5 : 1]}
        gl={{ antialias: false, alpha: true, powerPreference: "high-performance" }}
      >
        <fog attach="fog" args={["#06060e", 10, 30]} />
        {isHigh && <MouseTracker />}
        <ParticleDust count={scaleParticles(config.dustCount, tier)} color={config.primaryColor} />
        <FloatingShapes config={config} />
        <NeuralConnections config={config} />
        <OrbitalRing color={config.primaryColor} />
      </Canvas>
    </div>
  );
}
