/**
 * MapLibreRenderer — Phase 1 placeholder.
 *
 * Real integration: Phase 2/3 (per A spec §11.1). Wraps maplibre-gl with
 * spec.map.provider/style/center/zoom → GL instance, spec.map.layers →
 * MapLibre source+layer pairs.
 */
export default function MapLibreRenderer({ spec }) {
  return (
    <PlaceholderCard
      title="MapLibre renderer"
      phase="Phase 2/3"
      spec={spec}
      summary="Wraps maplibre-gl. Consumes spec.map.{provider,style,center,zoom,layers}."
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
