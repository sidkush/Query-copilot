import DashboardShell from "../components/dashboard/DashboardShell";

/**
 * DevDashboardShell — dev-only route (behind import.meta.env.DEV)
 * that mounts <DashboardShell /> with a hardcoded sample tile set so
 * the six archetype layouts can be eyeballed without running the
 * real migration + flag flip.
 *
 * Phase 4b: gate stays on the dev route until NEW_CHART_EDITOR_ENABLED
 * is flipped (Phase 4c cutover).
 */
const SAMPLE_TILES = [
  {
    id: "t1",
    title: "Revenue by region",
    chart_spec: {
      $schema: "askdb/chart-spec/v1",
      type: "cartesian",
      mark: "bar",
      encoding: {
        x: { field: "region", type: "nominal" },
        y: { field: "revenue", type: "quantitative", aggregate: "sum" },
      },
    },
  },
  {
    id: "t2",
    title: "Users over time",
    tab: "Users",
    chart_spec: {
      $schema: "askdb/chart-spec/v1",
      type: "cartesian",
      mark: "line",
      encoding: {
        x: { field: "date", type: "temporal" },
        y: { field: "users", type: "quantitative", aggregate: "sum" },
      },
    },
  },
  {
    id: "t3",
    title: "Conversion funnel",
    chart_spec: {
      $schema: "askdb/chart-spec/v1",
      type: "cartesian",
      mark: "bar",
      encoding: {
        x: { field: "stage", type: "nominal" },
        y: { field: "count", type: "quantitative", aggregate: "sum" },
      },
    },
  },
  {
    id: "t4",
    title: "Top 5 products",
    tab: "Products",
    chart_spec: {
      $schema: "askdb/chart-spec/v1",
      type: "cartesian",
      mark: "bar",
      encoding: {
        x: { field: "product", type: "nominal" },
        y: { field: "revenue", type: "quantitative", aggregate: "sum" },
      },
    },
  },
];

export default function DevDashboardShell() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--bg-page, #06060e)",
      }}
    >
      <DashboardShell tiles={SAMPLE_TILES} initialMode="briefing" />
    </div>
  );
}
