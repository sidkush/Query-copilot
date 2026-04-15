import { useMemo } from "react";
import { briefingGridPlacement } from "../lib/importanceScoring";
import DashboardTileCanvas from "../lib/DashboardTileCanvas";

/**
 * ExecBriefingLayout — Phase 4c real implementation.
 *
 * Spec S7.1: importance-scored bin-packing on a 12-column grid.
 *   KPI cards    →  3 cols (4-up row)
 *   Hero chart   → 12 cols (first chart of the briefing)
 *   Supporting  →  6 cols (2-up)
 *   Table       → 12 cols (full width)
 *
 * Each tile renders a real chart via DashboardTileCanvas (which mounts
 * EditorCanvas → VegaRenderer). No ECharts in this path.
 *
 * Tile shape accepted: { id, title, chart_spec, rows?, columns? }.
 * Uses briefingGridPlacement() from lib/importanceScoring.js for the
 * shared ranking heuristic (also used by PitchLayout).
 */
export default function ExecBriefingLayout({ tiles = [], onTileClick }) {
  const placement = useMemo(() => briefingGridPlacement(tiles), [tiles]);

  if (placement.length === 0) {
    return (
      <div
        data-testid="layout-briefing"
        style={{
          padding: 24,
          display: "grid",
          gridTemplateColumns: "repeat(12, 1fr)",
          gap: 16,
        }}
      >
        <EmptyBriefing />
      </div>
    );
  }

  return (
    <div
      data-testid="layout-briefing"
      data-tile-count={placement.length}
      style={{
        padding: 24,
        display: "grid",
        gridTemplateColumns: "repeat(12, 1fr)",
        gridAutoRows: "minmax(180px, auto)",
        gap: 16,
        background: "var(--bg-page, #06060e)",
        minHeight: "100%",
      }}
    >
      {placement.map((entry, idx) => (
        <div
          key={entry.tile.id || idx}
          data-testid={`layout-briefing-tile-${entry.tile.id || idx}`}
          data-row-hint={entry.rowHint}
          data-col-span={entry.colSpan}
          style={{
            gridColumn: `span ${entry.colSpan}`,
            minHeight: entry.rowHint === "hero" ? 280 : 180,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <DashboardTileCanvas tile={entry.tile} onTileClick={onTileClick} />
        </div>
      ))}
    </div>
  );
}

function EmptyBriefing() {
  return (
    <div
      data-testid="layout-empty"
      style={{
        gridColumn: "1 / -1",
        padding: 40,
        fontSize: 13,
        color: "var(--text-muted, rgba(255,255,255,0.5))",
        fontStyle: "italic",
        textAlign: "center",
      }}
    >
      Executive briefing empty. Add KPI cards + hero chart to start.
    </div>
  );
}
