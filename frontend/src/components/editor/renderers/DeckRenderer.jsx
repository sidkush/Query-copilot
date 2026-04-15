/**
 * DeckRenderer — Phase 1 placeholder.
 *
 * Real integration: Phase 4 (per A spec §12). Mounts deck.gl as an overlay
 * above the MapLibre base. Consumes spec.overlay.layers[] — each entry is a
 * DeckLayer config (ScatterplotLayer / HexagonLayer / ArcLayer / …).
 */
export default function DeckRenderer({ spec }) {
  return (
    <PlaceholderCard
      title="deck.gl renderer"
      phase="Phase 4"
      spec={spec}
      summary="GPU-accelerated geo overlay via deck.gl on MapLibre base. Consumes spec.overlay.layers[]."
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
