/**
 * PitchLayout — Phase 4a skeleton.
 *
 * Target experience (spec S7.5): wraps the existing PresentationEngine
 * binning logic to render tiles as 16:9 slides. Phase 4b will actually
 * mount <PresentationEngine /> with the new ChartEditor tiles instead
 * of ResultsChart tiles — for Phase 4a we show a slide-frame scaffold
 * so the shell + toggle works end-to-end.
 *
 * TODO(a4b): mount PresentationEngine with ChartSpec tiles.
 */
export default function PitchLayout({ tiles = [] }) {
  return (
    <div
      data-testid="layout-pitch"
      style={{
        padding: 24,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "100%",
      }}
    >
      <div
        style={{
          width: "min(960px, 100%)",
          aspectRatio: "16 / 9",
          borderRadius: 8,
          background: "var(--bg-elev-1, rgba(255,255,255,0.02))",
          border: "1px solid var(--border-subtle, rgba(255,255,255,0.08))",
          display: "flex",
          flexDirection: "column",
          padding: 24,
          boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
        }}
      >
        <div
          style={{
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: "var(--text-muted, rgba(255,255,255,0.4))",
            marginBottom: 10,
          }}
        >
          Slide 1 of {Math.max(tiles.length, 1)}
        </div>
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
            color: "var(--text-secondary, #b0b0b6)",
          }}
        >
          {tiles[0]?.title || "Pitch mode — PresentationEngine integration lands in Phase 4b."}
        </div>
      </div>
    </div>
  );
}
