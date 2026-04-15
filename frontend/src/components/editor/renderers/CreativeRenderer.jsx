/**
 * CreativeRenderer — Phase 1 placeholder.
 *
 * Real integration: Phase 5 (per A spec §12). Mounts Three.js / react-three-fiber
 * Stage Mode visuals from the creative-lane registry (Hologram, ParticleFlow).
 * Gated by GPU tier detection.
 */
export default function CreativeRenderer({ spec }) {
  return (
    <PlaceholderCard
      title="Creative (Three.js) renderer"
      phase="Phase 5 — Stage Mode"
      spec={spec}
      summary="Registers Stage Mode creative tiles via three / r3f. GPU-tier gated."
    />
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
      <div style={{ fontSize: 11, color: "var(--text-muted, rgba(255,255,255,0.5))", marginBottom: 12 }}>
        Coming in {phase}
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
