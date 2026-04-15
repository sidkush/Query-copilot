/**
 * ExecBriefingLayout — Phase 4a skeleton.
 *
 * Target experience (spec S7.1): importance-scored bin-packing into
 * 16:9 slide-style frames. KPI cards dominate, charts below, tables
 * last. Phase 4b wires real bin-packing reusing PresentationEngine's
 * scoring logic.
 *
 * Phase 4a: renders tiles in a simple CSS grid with KPI-first order so
 * downstream work (drag-drop placement, importance scoring, slide-
 * aware layout) has a scaffold to slot into.
 *
 * TODO(a4b): importance scoring + bin-packing.
 */
export default function ExecBriefingLayout({ tiles = [] }) {
  return (
    <div
      data-testid="layout-briefing"
      style={{
        display: "grid",
        gap: 12,
        padding: 16,
        gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
      }}
    >
      {tiles.length === 0 && <EmptyLayout mode="Exec Briefing" />}
      {tiles.map((tile, i) => (
        <TilePlaceholder key={tile.id || i} tile={tile} />
      ))}
    </div>
  );
}

function TilePlaceholder({ tile }) {
  return (
    <div
      data-testid={`layout-briefing-tile-${tile.id || "tile"}`}
      style={{
        padding: 12,
        borderRadius: 6,
        background: "var(--bg-elev-1, rgba(255,255,255,0.02))",
        border: "1px solid var(--border-subtle, rgba(255,255,255,0.08))",
        minHeight: 140,
      }}
    >
      <div style={{ fontSize: 11, color: "var(--text-muted, rgba(255,255,255,0.5))" }}>
        {tile.title || tile.id || "Untitled tile"}
      </div>
    </div>
  );
}

function EmptyLayout({ mode }) {
  return (
    <div
      data-testid="layout-empty"
      style={{
        gridColumn: "1 / -1",
        padding: 24,
        fontSize: 12,
        color: "var(--text-muted, rgba(255,255,255,0.5))",
        fontStyle: "italic",
        textAlign: "center",
      }}
    >
      No tiles yet. {mode} layout will auto-pack charts when data arrives.
    </div>
  );
}
