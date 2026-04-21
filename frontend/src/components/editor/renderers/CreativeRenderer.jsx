import { Suspense } from "react";
import { getCreativeComponent } from "../themes/creativeRegistry";
import { getGPUTier } from "../../../lib/gpuDetect.js";

/**
 * CreativeRenderer — Phase 5 landing.
 *
 * Reads spec.creative.component from the ChartSpec and looks it up in
 * the Stage creative-lane registry (Phase 5). Registered components:
 *
 *   - Hologram     -> charts/engines/ThreeHologram.jsx
 *   - ParticleFlow -> charts/engines/ThreeParticleFlow.jsx
 *
 * GPU tier gate: low-tier GPUs render the placeholder card instead of
 * mounting the Three.js runtime. medium/high tiers lazy-load the
 * component via React.Suspense.
 */
export default function CreativeRenderer({ spec }) {
  const gpuTier = getGPUTier() || "medium";
  const name = spec?.creative?.component;
  const Component = name ? getCreativeComponent(name) : null;

  if (gpuTier === "low" || !Component) {
    return (
      <PlaceholderCard
        title={name ? `Creative · ${name}` : "Creative (Three.js) renderer"}
        phase="Phase 5 — Stage Mode"
        spec={spec}
        summary={
          gpuTier === "low"
            ? "Stage Mode creative renderers disabled on low-tier GPUs."
            : "Unknown creative component. Registered: Hologram, ParticleFlow."
        }
      />
    );
  }

  const props = spec?.creative?.props || {};
  return (
    <div
      data-testid="creative-renderer"
      data-component={name}
      data-gpu-tier={gpuTier}
      style={{
        height: "100%",
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Suspense fallback={<CreativeLoading />}>
        <Component {...props} />
      </Suspense>
    </div>
  );
}

function CreativeLoading() {
  return (
    <div
      data-testid="creative-loading"
      style={{
        fontSize: 11,
        color: "var(--text-muted, rgba(255,255,255,0.5))",
        fontStyle: "italic",
      }}
    >
      Loading creative runtime…
    </div>
  );
}

function PlaceholderCard({ title, phase, spec, summary }) {
  return (
    <div
      data-testid="renderer-placeholder"
      data-title={title}
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 32,
        borderRadius: 8,
        border: "1px dashed var(--border-subtle, rgba(255,255,255,0.15))",
        background: "rgba(255,255,255,0.015)",
        color: "var(--text-secondary, #b0b0b6)",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>{title}</div>
      <div
        style={{
          fontSize: 11,
          color: "var(--text-muted, rgba(255,255,255,0.5))",
          marginBottom: 12,
        }}
      >
        {phase}
      </div>
      <div style={{ fontSize: 12, maxWidth: 480, lineHeight: 1.5 }}>{summary}</div>
      {spec?.type && (
        <div
          style={{
            marginTop: 16,
            padding: "4px 10px",
            fontSize: 10,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 4,
            fontFamily: "monospace",
          }}
        >
          spec.type: {spec.type}
        </div>
      )}
    </div>
  );
}
