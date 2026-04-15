import { useMemo } from "react";
import DashboardTileCanvas from "./DashboardTileCanvas";
import { columnsRowsToChartSpec } from "./columnsRowsToChartSpec";

/**
 * LegacyResultChart — Phase 4c+3 migration bridge.
 *
 * Drop-in replacement for `<ResultsChart columns={...} rows={...} />`
 * that renders on the new VegaRenderer path (DashboardTileCanvas →
 * EditorCanvas → VegaRenderer) instead of the legacy ECharts bundle.
 *
 * For callers that already have a `chart_spec` (e.g. migrated dashboard
 * tiles), pass it via `chartSpec` and the helper skips recommendation.
 * When only columns + rows are available (Chat query results, agent
 * step results, share-link tiles), the Show Me recommender picks a
 * sensible default spec on the fly.
 *
 * Props:
 *   - columns         string[]
 *   - rows            object[] | any[][]
 *   - title           optional tile title
 *   - subtitle        optional subtitle (e.g. SQL snippet, question text)
 *   - chartSpec       optional pre-built ChartSpec (skips recommendation)
 *   - height          CSS height (default 100%)
 *   - showTitleBar    boolean (default true)
 *   - onTileClick     click handler forwarded to DashboardTileCanvas
 *
 * Callers that previously used `onAddToDashboard` / `defaultChartType` /
 * `defaultPalette` / `dashboardPalette` / `formatting` on ResultsChart:
 * those props are intentionally dropped in this bridge. The new editor
 * surface exposes all of the above via the Marks card + Inspector when
 * the user promotes a chat-result chart to a dashboard tile (Phase 4c+4
 * work — wire the `add-to-dashboard` agent tool to the new shell).
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
}) {
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

  return (
    <DashboardTileCanvas
      tile={tile}
      height={height}
      showTitleBar={showTitleBar}
      onTileClick={onTileClick}
      resultSetOverride={{ columns, rows, columnProfile }}
    />
  );
}
