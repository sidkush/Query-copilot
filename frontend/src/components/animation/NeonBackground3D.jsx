/* eslint-disable react-hooks/purity -- particle seeds live inside useMemo, so Math.random runs once on mount */
import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from '../../store';

// Neon Tron Materials
const neonCyanMaterial = new THREE.MeshBasicMaterial({
  color: '#00faff',
  wireframe: true,
  transparent: true,
  opacity: 0.8,
  blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide,
});

const neonPinkMaterial = new THREE.MeshBasicMaterial({
  color: '#ff007f',
  wireframe: true,
  transparent: true,
  opacity: 0.6,
  blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide,
});

const neonPurpleMaterial = new THREE.MeshBasicMaterial({
  color: '#a855f7',
  wireframe: true,
  transparent: true,
  opacity: 0.5,
  blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide,
});

const neonGridMaterial = new THREE.MeshBasicMaterial({
  color: '#4f46e5',
  wireframe: true,
  transparent: true,
  opacity: 0.3,
  blending: THREE.AdditiveBlending,
});

/* ── Shapes ── */
function TronDatabase({ position, scale = 1, speed = 1 }) {
  const ref = useRef();
  useFrame((state) => {
    if (ref.current) {
      ref.current.rotation.y = state.clock.getElapsedTime() * 0.4 * speed;
    }
  });

  return (
    <Float speed={2 * speed} rotationIntensity={0.5} floatIntensity={1}>
      <group position={position} ref={ref} scale={scale}>
        {[0, 1.2, 2.4].map((y, i) => (
          <mesh key={i} position={[0, y, 0]} material={neonCyanMaterial}>
            <cylinderGeometry args={[1.5, 1.5, 0.8, 16]} />
          </mesh>
        ))}
        {/* Central Core */}
        <mesh position={[0, 1.2, 0]} material={neonPinkMaterial}>
          <cylinderGeometry args={[0.5, 0.5, 3.5, 8]} />
        </mesh>
      </group>
    </Float>
  );
}

function TronChartBar({ position, scale = 1, speed = 1, size = [1, 3, 1], material = neonPurpleMaterial }) {
  const ref = useRef();
  useFrame((state) => {
    if (ref.current) ref.current.rotation.y = state.clock.getElapsedTime() * 0.1 * speed;
  });

  return (
    <Float speed={1 * speed} rotationIntensity={0.8} floatIntensity={1.5}>
      <mesh position={position} ref={ref} scale={scale} material={material}>
        <boxGeometry args={size} />
      </mesh>
    </Float>
  );
}

function TronDataPlane({ position, rotation, scale = 1, speed = 1 }) {
  const ref = useRef();
  useFrame((state) => {
    if (ref.current) {
      ref.current.rotation.z = rotation[2] + Math.sin(state.clock.getElapsedTime() * 0.5 * speed) * 0.1;
    }
  });

  return (
    <Float speed={2 * speed} rotationIntensity={0.2} floatIntensity={0.8}>
      <mesh position={position} ref={ref} rotation={rotation} scale={scale} material={neonGridMaterial}>
        <planeGeometry args={[10, 10, 10, 10]} />
      </mesh>
    </Float>
  );
}

function GridFloor() {
  const ref = useRef();
  useFrame((state) => {
    if (ref.current) {
      ref.current.position.z = (state.clock.getElapsedTime() * 2) % 2; // Moving grid effect
    }
  });

  return (
    <group position={[0, -5, -15]} rotation={[-Math.PI / 2.2, 0, 0]}>
      <mesh ref={ref}>
        <planeGeometry args={[100, 100, 50, 50]} />
        <meshBasicMaterial color="#3b82f6" wireframe transparent opacity={0.15} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  );
}

function DigitalRain() {
  const count = 150;
  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 50;
      pos[i * 3 + 1] = Math.random() * 40 - 10;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 30 - 10;
    }
    return pos;
  }, []);

  const ref = useRef();
  useFrame((_state) => {
    if (!ref.current) return;
    const pos = ref.current.geometry.attributes.position.array;
    for (let i = 0; i < count; i++) {
      pos[i * 3 + 1] -= 0.1; // fall down
      if (pos[i * 3 + 1] < -20) {
        pos[i * 3 + 1] = 20; // reset to top
      }
    }
    ref.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.1} color="#00faff" transparent opacity={0.6} sizeAttenuation blending={THREE.AdditiveBlending} />
    </points>
  );
}

const Scene = () => {
  return (
    <>
      <fog attach="fog" args={['#050510', 10, 40]} />

      <GridFloor />
      
      {/* Semantic Objects */}
      <TronDatabase position={[-8, -1, -8]} scale={1} speed={0.9} />
      <TronDatabase position={[12, 5, -15]} scale={0.6} speed={1.3} />

      <TronChartBar position={[6, -2, -6]} scale={1} size={[1.5, 6, 1.5]} speed={1} material={neonPinkMaterial} />
      <TronChartBar position={[8.5, -3, -6]} scale={1} size={[1.5, 4, 1.5]} speed={1.1} />
      <TronChartBar position={[11, -1, -6]} scale={1} size={[1.5, 8, 1.5]} speed={0.9} />

      {/* Floating Sheets/Data frames */}
      <TronDataPlane position={[-4, 8, -12]} rotation={[-0.2, 0.4, 0.1]} scale={1.2} speed={0.7} />
      <TronDataPlane position={[8, 10, -20]} rotation={[0.1, -0.3, -0.2]} scale={1.8} speed={0.5} />

      <DigitalRain />
    </>
  );
};

export default function NeonBackground3D({ className = "" }) {
  const resolvedTheme = useStore(s => s.resolvedTheme);
  const isLight = resolvedTheme === 'light';

  return (
    <div className={`absolute inset-0 pointer-events-none ${className}`} aria-hidden="true" style={{ zIndex: 0, opacity: isLight ? 0.3 : 1 }}>
      <div className={`absolute inset-0 ${isLight ? 'bg-slate-50' : 'bg-[#020208]'}`} />
      <Canvas
        camera={{ position: [0, 2, 20], fov: 45 }}
        dpr={[1, 1.5]}
        gl={{ antialias: false, alpha: false, powerPreference: "high-performance" }}
      >
        <Scene />
      </Canvas>
    </div>
  );
}
