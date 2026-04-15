import ChartEditor from "../components/editor/ChartEditor";

/**
 * DevChartEditor — development-only route that mounts <ChartEditor mode="pro" />
 * with a hardcoded sample ChartSpec + synthetic result set. Gated behind
 * import.meta.env.DEV in App.jsx so it never ships to production bundles.
 *
 * Purpose: visual smoke-test for Sub-project A Phase 1 editor shell. Lets
 * us eyeball the 3-pane grid, topbar, data rail, canvas (stub VegaRenderer
 * with compiled VL JSON), bottom dock, and inspector tabs without going
 * through the full query → result → dashboard-tile flow.
 */

const SAMPLE_SPEC = {
  $schema: "askdb/chart-spec/v1",
  type: "cartesian",
  title: "Sample revenue by region",
  mark: "bar",
  encoding: {
    x: { field: "region", type: "nominal" },
    y: { field: "revenue", type: "quantitative", aggregate: "sum" },
    color: { field: "region", type: "nominal" },
  },
};

const SAMPLE_RESULT_SET = {
  columns: ["region", "revenue"],
  rows: [
    ["North", 125_430],
    ["South", 98_210],
    ["East", 142_890],
    ["West", 112_560],
  ],
  columnProfile: [
    {
      name: "region",
      dtype: "string",
      role: "dimension",
      semanticType: "nominal",
      cardinality: 4,
      nullPct: 0.0,
      sampleValues: ["North", "South", "East", "West"],
    },
    {
      name: "revenue",
      dtype: "float",
      role: "measure",
      semanticType: "quantitative",
      cardinality: 4,
      nullPct: 0.0,
      sampleValues: [125_430, 98_210, 142_890, 112_560],
    },
    {
      name: "order_date",
      dtype: "date",
      role: "dimension",
      semanticType: "temporal",
      cardinality: 12,
      nullPct: 0.0,
      sampleValues: ["2026-01-01", "2026-02-01", "2026-03-01"],
    },
  ],
};

export default function DevChartEditor() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--bg-page, #06060e)",
      }}
    >
      <ChartEditor
        spec={SAMPLE_SPEC}
        resultSet={SAMPLE_RESULT_SET}
        mode="pro"
        surface="dashboard-tile"
      />
    </div>
  );
}
