/**
 * AnalystWorkbenchLayout — Phase 4a skeleton.
 *
 * Target experience (spec S7.2): dense drag-resize grid using
 * react-grid-layout, showing many tiles at once, optimized for
 * side-by-side comparison and SQL inspection. Phase 4b integrates
 * react-grid-layout with tile persistence + the ChartEditor tile
 * editing surface.
 *
 * Phase 4a: dense 3-column grid with fixed-height tile placeholders.
 * Same TilePlaceholder prop shape as the other layouts so callers
 * can pass the same tile array to any mode.
 *
 * TODO(a4b): wire react-grid-layout + drag-resize persistence.
 */
export default function AnalystWorkbenchLayout({ tiles = [] }) {
  return (
    <div
      data-testid="layout-workbench"
      style={{
        display: "grid",
        gap: 8,
        padding: 12,
        gridTemplateColumns: "repeat(3, 1fr)",
      }}
    >
      {tiles.length === 0 && <EmptyCell />}
      {tiles.map((tile, i) => (
        <div
          key={tile.id || i}
          data-testid={`layout-workbench-tile-${tile.id || i}`}
          style={{
            minHeight: 180,
            padding: 10,
            borderRadius: 4,
            background: "var(--bg-elev-1, rgba(255,255,255,0.02))",
            border: "1px solid var(--border-subtle, rgba(255,255,255,0.06))",
          }}
        >
          <div style={{ fontSize: 10, color: "var(--text-muted, rgba(255,255,255,0.45))" }}>
            {tile.title || tile.id || "Untitled"}
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyCell() {
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
      Workbench ready. Drag tiles here to compare side-by-side.
    </div>
  );
}
