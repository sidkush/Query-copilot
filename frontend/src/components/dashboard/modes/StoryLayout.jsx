/**
 * StoryLayout — Phase 4a skeleton.
 *
 * Target experience (spec S7.4): scrollytelling flow with per-section
 * annotations that appear as the user scrolls. Chart-driven narrative.
 * Phase 4b wires IntersectionObserver + annotation primitives.
 *
 * Phase 4a: renders tiles as a vertical stack with a section header
 * per tile and an annotation placeholder column. Good enough for the
 * shell + editor integration to hang off.
 *
 * TODO(a4b): scrollytelling IntersectionObserver + annotation popups.
 */
export default function StoryLayout({ tiles = [] }) {
  return (
    <div
      data-testid="layout-story"
      style={{
        padding: 24,
        display: "flex",
        flexDirection: "column",
        gap: 20,
        maxWidth: 820,
        margin: "0 auto",
      }}
    >
      {tiles.length === 0 && <EmptyStory />}
      {tiles.map((tile, i) => (
        <section
          key={tile.id || i}
          data-testid={`layout-story-tile-${tile.id || i}`}
          style={{
            display: "grid",
            gridTemplateColumns: "240px 1fr",
            gap: 16,
            alignItems: "start",
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: "var(--text-muted, rgba(255,255,255,0.5))",
              fontStyle: "italic",
            }}
          >
            {tile.annotation || "Annotation (Phase 4b)"}
          </div>
          <div
            style={{
              padding: 14,
              borderRadius: 6,
              background: "var(--bg-elev-1, rgba(255,255,255,0.02))",
              border: "1px solid var(--border-subtle, rgba(255,255,255,0.08))",
              minHeight: 180,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
              {tile.title || tile.id || "Chapter"}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted, rgba(255,255,255,0.45))" }}>
              Chart placeholder — real renderer wires at Phase 4b.
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}

function EmptyStory() {
  return (
    <div
      data-testid="layout-empty"
      style={{
        padding: 40,
        fontSize: 13,
        color: "var(--text-muted, rgba(255,255,255,0.5))",
        textAlign: "center",
      }}
    >
      Empty story. Add chapters by dragging tiles from the analytics drawer.
    </div>
  );
}
