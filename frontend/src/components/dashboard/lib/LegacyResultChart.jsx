import { useCallback, useMemo, useState } from "react";
import DashboardTileCanvas from "./DashboardTileCanvas";
import ChartToolbar from "./ChartToolbar";
import { columnsRowsToChartSpec } from "./columnsRowsToChartSpec";

/**
 * LegacyResultChart — Phase 4c+3 migration bridge.
 *
 * Drop-in replacement for `<ResultsChart columns={...} rows={...} />`
 * that renders on the new VegaRenderer path (DashboardTileCanvas →
 * EditorCanvas → VegaRenderer) instead of the legacy ECharts bundle.
 *
 * The chat page wraps the tile with a `ChartToolbar` that exposes PNG /
 * SVG / CSV download + "Open in editor" so users retain the same freedom
 * they had on dashboard tiles. Pass `hideToolbar` when embedding inside
 * a layout that already supplies its own actions (dashboard presets).
 */
export default function LegacyResultChart({
  columns = [],
  rows = [],
  title,
  subtitle,
  chartSpec,
  height = "100%",
  showTitleBar = true,
  onTileClick,
  hideToolbar = true,
  onEdit,
}) {
  const [vegaView, setVegaView] = useState(null);

  const { spec, columnProfile } = useMemo(() => {
    if (chartSpec) {
      return { spec: chartSpec, columnProfile: [] };
    }
    return columnsRowsToChartSpec(columns, rows);
  }, [chartSpec, columns, rows]);

  const tile = useMemo(
    () => ({
      id:
        title
          ? `legacy-${String(title).slice(0, 40).replace(/\s+/g, "-")}`
          : "legacy-result",
      title: title || "Result",
      subtitle,
      chart_spec: spec,
      columns,
      rows,
      columnProfile,
    }),
    [title, subtitle, spec, columns, rows, columnProfile],
  );

  const handleViewReady = useCallback((view) => setVegaView(view), []);

  const stats = useMemo(() => {
    if (!rows.length) return null;
    return `${rows.length.toLocaleString()} row${rows.length !== 1 ? "s" : ""} · ${columns.length} col${columns.length !== 1 ? "s" : ""}`;
  }, [rows.length, columns.length]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={{ flex: 1, minHeight: 0 }}>
        <DashboardTileCanvas
          tile={tile}
          height={height}
          showTitleBar={showTitleBar}
          onTileClick={onTileClick}
          resultSetOverride={{ columns, rows, columnProfile }}
          onViewReady={handleViewReady}
          surface="chat-result"
        />
      </div>
      {!hideToolbar && (
        <ChartToolbar
          view={vegaView}
          columns={columns}
          rows={rows}
          title={title}
          stats={stats}
          onEdit={onEdit}
        />
      )}
    </div>
  );
}
