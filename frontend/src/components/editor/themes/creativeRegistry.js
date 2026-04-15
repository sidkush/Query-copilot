/**
 * Stage-mode creative lane registry — maps creative.component names
 * (from ChartSpec.creative.component) to their React component refs.
 *
 * Phase 5 seeds the registry with the two Three.js renderers the spec
 * marks as kept (ThreeHologram, ThreeParticleFlow). Scatter3D,
 * LiquidGauge, D3Ridgeline are retired per spec S9.4 and are not
 * registered here.
 *
 * Lazy-loaded per entry so the Three.js runtime only lands in the
 * bundle if a Stage scene actually uses a creative renderer.
 *
 * GPU tier gate: callers consult getGPUTier() and avoid mounting
 * high-cost creative renderers on low tiers. This registry stays
 * oblivious to GPU state — the CreativeRenderer (or a wrapper) is
 * responsible for enforcing the gate.
 */
import { lazy } from "react";

const Hologram = lazy(() => import("../../charts/engines/ThreeHologram"));
const ParticleFlow = lazy(() => import("../../charts/engines/ThreeParticleFlow"));

const REGISTRY = {
  Hologram,
  ParticleFlow,
};

export function getCreativeComponent(name) {
  return REGISTRY[name] || null;
}

export function listCreativeComponents() {
  return Object.keys(REGISTRY);
}
