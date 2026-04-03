import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, Float, OrthographicCamera } from '@react-three/drei';
import * as THREE from 'three';

const glassMaterial = new THREE.MeshPhysicalMaterial({
  color: '#e2e8f0',
  metalness: 0.1,
  roughness: 0.15,
  transmission: 0.95, // glass-like transparency
  thickness: 2.5,
  ior: 1.5,
  side: THREE.DoubleSide,
  transparent: true,
  opacity: 1,
});

const darkGlassMaterial = new THREE.MeshPhysicalMaterial({
  color: '#1e293b',
  metalness: 0.5,
  roughness: 0.2,
  transmission: 0.9,
  thickness: 2.0,
  ior: 1.4,
  side: THREE.DoubleSide,
  transparent: true,
  opacity: 1,
});

const accentGlassMaterial = new THREE.MeshPhysicalMaterial({
  color: '#3b82f6',
  metalness: 0.2,
  roughness: 0.25,
  transmission: 0.9,
  thickness: 1.5,
  ior: 1.5,
  transparent: true,
  opacity: 0.8,
});

/* ── Shapes ── */
function DatabaseCylinder({ position, scale = 1, speed = 1 }) {
  const ref = useRef();
  useFrame((state) => {
    if (ref.current) {
      ref.current.rotation.y = state.clock.getElapsedTime() * 0.2 * speed;
      ref.current.rotation.z = Math.sin(state.clock.getElapsedTime() * 0.5 * speed) * 0.05;
    }
  });

  return (
    <Float speed={1.5 * speed} rotationIntensity={0.2} floatIntensity={1}>
      <group position={position} ref={ref} scale={scale}>
        {[0, 1.2, 2.4].map((y, i) => (
          <mesh key={i} position={[0, y, 0]} material={glassMaterial}>
            <cylinderGeometry args={[1, 1, 1, 32]} />
            <lineSegments>
              <edgesGeometry args={[new THREE.CylinderGeometry(1, 1, 1, 32)]} />
              <lineBasicMaterial color="#ffffff" transparent opacity={0.15} />
            </lineSegments>
          </mesh>
        ))}
      </group>
    </Float>
  );
}

function ChartBar({ position, scale = 1, speed = 1, size = [1, 3, 1], material = darkGlassMaterial }) {
  const ref = useRef();
  useFrame((state) => {
    if (ref.current) {
      ref.current.rotation.y = state.clock.getElapsedTime() * 0.1 * speed;
    }
  });

  return (
    <Float speed={1 * speed} rotationIntensity={0.4} floatIntensity={1.5}>
      <mesh position={position} ref={ref} scale={scale} material={material}>
        <boxGeometry args={size} />
        <lineSegments>
          <edgesGeometry args={[new THREE.BoxGeometry(...size)]} />
          <lineBasicMaterial color="#ffffff" transparent opacity={0.1} />
        </lineSegments>
      </mesh>
    </Float>
  );
}

function DataSheet({ position, rotation, scale = 1, speed = 1 }) {
  const ref = useRef();
  useFrame((state) => {
    if (ref.current) {
      ref.current.rotation.x = rotation[0] + Math.sin(state.clock.getElapsedTime() * 0.3 * speed) * 0.05;
      ref.current.rotation.z = rotation[2] + Math.cos(state.clock.getElapsedTime() * 0.2 * speed) * 0.05;
    }
  });

  return (
    <Float speed={2 * speed} rotationIntensity={0.1} floatIntensity={0.5}>
      <mesh position={position} ref={ref} rotation={rotation} scale={scale} material={glassMaterial}>
        <planeGeometry args={[6, 4]} />
        <gridHelper args={[6, 8, '#ffffff', '#ffffff']} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.01]} material-transparent material-opacity={0.15} />
      </mesh>
    </Float>
  );
}

/* ── Particles ── */
function DustParticles() {
  const count = 100;
  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 40;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 30;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 20 - 10;
    }
    return pos;
  }, []);

  const ref = useRef();
  useFrame((state) => {
    if (ref.current) {
      ref.current.rotation.y = state.clock.getElapsedTime() * 0.02;
    }
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.08} color="#94a3b8" transparent opacity={0.4} sizeAttenuation depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
}

const Scene = () => {
  return (
    <>
      <ambientLight intensity={0.2} />
      <directionalLight position={[10, 10, 5]} intensity={1} color="#ffffff" />
      <directionalLight position={[-10, 10, -5]} intensity={2} color="#3b82f6" />
      <spotLight position={[0, 15, 0]} intensity={1} angle={0.6} penumbra={1} color="#e0f2fe" />

      {/* Semantic Objects */}
      <DatabaseCylinder position={[-8, -2, -5]} scale={1.2} speed={0.8} />
      <DatabaseCylinder position={[10, 4, -8]} scale={0.8} speed={1.2} />

      <ChartBar position={[6, -4, -4]} scale={1} size={[1, 4, 1]} speed={1} material={accentGlassMaterial} />
      <ChartBar position={[7.2, -4.5, -4]} scale={1} size={[1, 3, 1]} speed={1.1} />
      <ChartBar position={[8.4, -3.5, -4]} scale={1} size={[1, 5, 1]} speed={0.9} />

      <ChartBar position={[-6, 6, -6]} scale={0.8} size={[4, 1, 4]} speed={0.5} material={darkGlassMaterial} />

      <DataSheet position={[0, -6, -2]} rotation={[-Math.PI / 3, 0, Math.PI / 6]} scale={1.5} speed={0.6} />
      <DataSheet position={[-12, 5, -10]} rotation={[Math.PI / 6, Math.PI / 4, 0]} scale={2} speed={0.4} />

      <DustParticles />
      <Environment preset="city" />
    </>
  );
};

export default function FrostedBackground3D({ className = "" }) {
  return (
    <div className={`absolute inset-0 pointer-events-none ${className}`} aria-hidden="true" style={{ zIndex: 0 }}>
      {/* We add a subtle dark gradient behind the 3D canvas so the glass shows up well */}
      <div className="absolute inset-0 bg-gradient-to-br from-black via-slate-950 to-[#050510]" />
      <Canvas
        camera={{ position: [0, 0, 15], fov: 45 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
      >
        <Scene />
      </Canvas>
    </div>
  );
}
