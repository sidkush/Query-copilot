import Background3D from "./Background3D";

/* ═══════════════════════════════════════════════════════════════
   PageBackground3D — Wraps Background3D (the full landing hero
   neural network) for consistent visuals across all inner app pages.

   Every page now gets the same starfield, dashboard wireframe,
   neural pulses, orbital rings, grid floor, and magnetic particles.

   Accepts `mode` (ignored) and `className` for backward compat.
   ═══════════════════════════════════════════════════════════════ */
export default function PageBackground3D({ mode, className = "" }) {
  return <Background3D className={className} />;
}
