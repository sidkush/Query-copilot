import React, { useRef, useMemo, useEffect, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useGPUTier } from "../../lib/gpuDetect";

/* ═══════════════════════════════════════════════════════════════
   DeviceFrame3D — Wireframe laptop/monitor for demo section.
   Built from pure geometry (no GLTF). Screen shows demo screenshot
   via CanvasTexture. Mouse-reactive tilt.
   ═══════════════════════════════════════════════════════════════ */

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

function MonitorFrame({ imageSrc }) {
  const groupRef = useRef();
  const [texture, setTexture] = useState(null);

  // Load image as texture
  useEffect(() => {
    if (!imageSrc) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const tex = new THREE.Texture(img);
      tex.needsUpdate = true;
      setTexture(tex);
    };
    img.src = imageSrc;
  }, [imageSrc]);

  useFrame(() => {
    if (groupRef.current) {
      const targetY = mouseRef.x * 0.1;
      const targetX = mouseRef.y * -0.05;
      groupRef.current.rotation.y += (targetY - groupRef.current.rotation.y) * 0.05;
      groupRef.current.rotation.x += (targetX - groupRef.current.rotation.x) * 0.05;
    }
  });

  // Monitor dimensions
  const screenW = 5.6, screenH = 3.5;
  const bezelW = 6, bezelH = 4;
  const bezelD = 0.12;

  return (
    <group ref={groupRef} position={[0, 0.3, 0]}>
      {/* Bezel (frame) wireframe */}
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(bezelW, bezelH, bezelD)]} />
        <lineBasicMaterial color="#2563EB" transparent opacity={0.3} />
      </lineSegments>

      {/* Screen content */}
      <mesh position={[0, 0, bezelD / 2 + 0.01]}>
        <planeGeometry args={[screenW, screenH]} />
        {texture ? (
          <meshBasicMaterial map={texture} transparent opacity={0.85} />
        ) : (
          <meshBasicMaterial color="#0a0a12" transparent opacity={0.6} />
        )}
      </mesh>

      {/* Screen glow */}
      <mesh position={[0, 0, -bezelD / 2 - 0.1]}>
        <planeGeometry args={[bezelW + 1, bezelH + 0.5]} />
        <meshBasicMaterial color="#2563EB" transparent opacity={0.02} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>

      {/* Stand */}
      <lineSegments position={[0, -bezelH / 2 - 0.5, 0]}>
        <edgesGeometry args={[new THREE.BoxGeometry(0.3, 1, 0.1)]} />
        <lineBasicMaterial color="#2563EB" transparent opacity={0.2} />
      </lineSegments>

      {/* Base */}
      <lineSegments position={[0, -bezelH / 2 - 1, 0.2]}>
        <edgesGeometry args={[new THREE.BoxGeometry(2.5, 0.08, 1.2)]} />
        <lineBasicMaterial color="#2563EB" transparent opacity={0.2} />
      </lineSegments>
    </group>
  );
}

function ParticleDust({ count = 60 }) {
  const ref = useRef();
  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 14;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 10;
      pos[i * 3 + 2] = -1 - Math.random() * 6;
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
      <pointsMaterial size={0.04} color="#818cf8" transparent opacity={0.3} sizeAttenuation depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
}

export default function DeviceFrame3D({ imageSrc, className = "" }) {
  const tier = useGPUTier();

  if (tier === "low" || tier === "medium") return null;

  return (
    <div className={`w-full h-full min-h-[300px] relative three-canvas-wrapper ${className}`}>
      <Canvas
        camera={{ position: [0, 0, 8], fov: 45 }}
        dpr={[1, 1.5]}
        gl={{ antialias: false, alpha: true, powerPreference: "high-performance" }}
      >
        <MouseTracker />
        <MonitorFrame imageSrc={imageSrc} />
        <ParticleDust count={60} />
      </Canvas>
    </div>
  );
}
