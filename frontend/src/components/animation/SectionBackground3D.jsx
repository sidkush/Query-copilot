import Background3D from "./Background3D";

/* ═══════════════════════════════════════════════════════════════
   SectionBackground3D — Wraps Background3D for consistent visuals
   across all landing page sections. Every section now gets the same
   neural pulse network as the hero and inner pages.

   Accepts `mode` (ignored) and `className` for backward compat.
   ═══════════════════════════════════════════════════════════════ */
export default function SectionBackground3D({ mode: _mode, className = "" }) {
  return <Background3D className={className} />;
}
