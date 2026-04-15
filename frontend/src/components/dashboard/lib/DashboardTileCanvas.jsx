import { useMemo } from "react";
import EditorCanvas from "../../editor/EditorCanvas";

/**
 * DashboardTileCanvas — tile-sized ChartEditor view.
 *
 * Dashboard layouts (Briefing, Workbench, Pitch, Story, Workbook) mount
 * a miniature ChartEditor per tile. A full 3-pane ChartEditor (topbar +
 * data rail + inspector + dock) doesn't fit inside a 300×200 tile, so
 * we render EditorCanvas directly with a lightweight title bar on top.
 * This keeps every new-path tile flowing through the same VegaRenderer
 * / MapLibreRenderer / DeckRenderer dispatch as the full editor — no
 * ECharts, no legacy ResultsChart.
 *
 * Tile shape (accepts both):
 *   - New:    { id, title, chart_spec, columns?, rows? }
 *   - Legacy: { id, title, chartType, columns, rows }   (migration leaves
 *             legacy fields alongside chart_spec; rollback can still
 *             read them via the old path)
 *
 * For legacy tiles, we build a resultSet = {columns, rows, columnProfile:[]}
 * from the legacy columns/rows fields. Vega infers types from data when
 * no columnProfile is present.
 *
 * Props:
 *   - tile              the tile object
 *   - height            CSS height (default 100%)
 *   - showTitleBar      boolean (default true)
 *   - onTileClick       (tile) => void — click the canvas body to open
 *                       the full ChartEditor in a drawer (Phase 4c+1).
 */
export default function DashboardTileCanvas({
  tile,
  height = "100%",
  showTitleBar = true,
  onTileClick,
  resultSetOverride,
}) {
  const spec = tile?.chart_spec || tile?.chartSpec || null;

  const resultSet = useMemo(() => {
    // resultSetOverride wins when supplied (e.g. WorkbookLayout blends
    // filter-bar-driven SQL re-exec results in without mutating the
    // parent tile object). Falls back to the legacy tile fields.
    if (resultSetOverride && typeof resultSetOverride === "object") {
      const columns = Array.isArray(resultSetOverride.columns)
        ? resultSetOverride.columns
        : [];
      const rows = Array.isArray(resultSetOverride.rows)
        ? resultSetOverride.rows
        : [];
      const columnProfile = Array.isArray(resultSetOverride.columnProfile)
        ? resultSetOverride.columnProfile
        : [];
      return { columns, rows, columnProfile };
    }
    const columns = Array.isArray(tile?.columns) ? tile.columns : [];
    const rows = Array.isArray(tile?.rows) ? tile.rows : [];
    const columnProfile = Array.isArray(tile?.columnProfile) ? tile.columnProfile : [];
    return { columns, rows, columnProfile };
  }, [tile?.columns, tile?.rows, tile?.columnProfile, resultSetOverride]);

  const handleClick = () => {
    if (onTileClick) onTileClick(tile);
  };

  return (
    <div
      data-testid={`dashboard-tile-canvas-${tile?.id || "tile"}`}
      data-has-spec={spec ? "true" : "false"}
      className="dashboard-tile-canvas"
      style={{
        height,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        borderRadius: 8,
        overflow: "hidden",
        background: "var(--bg-elev-1, rgba(255,255,255,0.02))",
        border: "1px solid var(--border-subtle, rgba(255,255,255,0.08))",
      }}
    >
      {showTitleBar && (
        <div
          style={{
            padding: "10px 14px 6px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            borderBottom: "1px solid var(--border-subtle, rgba(255,255,255,0.05))",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--text-primary, #e7e7ea)",
              letterSpacing: "-0.01em",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {tile?.title || tile?.id || "Untitled"}
          </span>
          {tile?.subtitle && (
            <span
              style={{
                fontSize: 11,
                color: "var(--text-muted, rgba(255,255,255,0.5))",
                whiteSpace: "nowrap",
              }}
            >
              {tile.subtitle}
            </span>
          )}
        </div>
      )}
      <div
        onClick={handleClick}
        style={{
          flex: 1,
          minHeight: 0,
          cursor: onTileClick ? "pointer" : "default",
        }}
      >
        {spec ? (
          <EditorCanvas spec={spec} resultSet={resultSet} />
        ) : (
          <EmptyTile />
        )}
      </div>
    </div>
  );
}

function EmptyTile() {
  return (
    <div
      data-testid="dashboard-tile-canvas-empty"
      style={{
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 12,
        color: "var(--text-muted, rgba(255,255,255,0.4))",
        fontStyle: "italic",
      }}
    >
      No chart spec
    </div>
  );
}
