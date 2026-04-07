import { createContext, useContext } from "react";

/**
 * GPU tier classification for progressive 3D enhancement.
 * - "high":   dedicated GPU — full particles, DOF, mouse tracking
 * - "medium": integrated GPU — 50% particles, no DOF
 * - "low":    mobile / old — disable 3D, fall back to 2D
 */

let _cachedTier = null;

export function getGPUTier() {
  if (_cachedTier) return _cachedTier;

  // Mobile / low-power heuristic
  const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  const cores = navigator.hardwareConcurrency || 2;

  // Try WebGL renderer info
  let renderer = "";
  try {
    const gl = document.createElement("canvas").getContext("webgl");
    if (gl) {
      const dbg = gl.getExtension("WEBGL_debug_renderer_info");
      if (dbg) renderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || "";
    }
  } catch {
    // WebGL not available
  }

  const r = renderer.toLowerCase();

  // Known low-power patterns
  const isLowGPU =
    !renderer ||
    r.includes("swiftshader") ||
    r.includes("llvmpipe") ||
    r.includes("software") ||
    r.includes("mesa");

  // Known dedicated GPU patterns
  const isDedicatedGPU =
    r.includes("nvidia") ||
    r.includes("geforce") ||
    r.includes("radeon") ||
    r.includes("rx ") ||
    r.includes("rtx") ||
    r.includes("gtx") ||
    r.includes("quadro") ||
    r.includes("arc a");

  if (isLowGPU || (isMobile && cores <= 4)) {
    _cachedTier = "low";
  } else if (isDedicatedGPU && cores >= 6) {
    _cachedTier = "high";
  } else if (isMobile) {
    _cachedTier = "medium";
  } else {
    // Desktop integrated (Intel UHD, Apple M-series, etc.)
    _cachedTier = cores >= 8 ? "high" : "medium";
  }

  return _cachedTier;
}

// React context — wrap app or landing page in <GPUTierProvider>
export const GPUTierContext = createContext("medium");

export function GPUTierProvider({ children }) {
  const tier = getGPUTier();
  return <GPUTierContext.Provider value={tier}>{children}</GPUTierContext.Provider>;
}

export function useGPUTier() {
  return useContext(GPUTierContext);
}

/**
 * Particle count scaler based on tier.
 * Usage: const count = scaleParticles(600);
 *   high → 600, medium → 300, low → 0
 */
export function scaleParticles(baseCount, tier) {
  if (tier === "high") return baseCount;
  if (tier === "medium") return Math.round(baseCount * 0.5);
  return 0;
}
