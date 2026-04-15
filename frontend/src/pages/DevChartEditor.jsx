import { useEffect } from "react";
import { useStore } from "../store";
import ChartEditor from "../components/editor/ChartEditor";
import useChartEditorHotkeys from "../components/editor/useChartEditorHotkeys";

/**
 * DevChartEditor — development-only route that mounts <ChartEditor mode="pro" />
 * with a hardcoded sample ChartSpec + synthetic result set. Gated behind
 * import.meta.env.DEV in App.jsx so it never ships to production bundles.
 *
 * Phase 2: spec is now held in the chartEditor Zustand slice so drag-drop
 * from the Marks card actually mutates state + re-renders. Cmd-Z / Cmd-Shift-Z
 * undo/redo hotkeys are wired via useChartEditorHotkeys.
 */

const SAMPLE_SPEC = {
  $schema: "askdb/chart-spec/v1",
  type: "cartesian",
  title: "Sample revenue by region",
  mark: "bar",
  encoding: {
    x: { field: "region", type: "nominal" },
    y: { field: "revenue", type: "quantitative", aggregate: "sum" },
  },
};

const SAMPLE_RESULT_SET = {
  columns: ["region", "revenue", "order_date"],
  rows: [
    ["North", 125_430, "2026-01-01"],
    ["South", 98_210, "2026-02-01"],
    ["East", 142_890, "2026-03-01"],
    ["West", 112_560, "2026-04-01"],
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
  const currentSpec = useStore((s) => s.chartEditor.currentSpec);
  const initChartEditorSpec = useStore((s) => s.initChartEditorSpec);
  const setChartEditorSpec = useStore((s) => s.setChartEditorSpec);
  const undoChartEditor = useStore((s) => s.undoChartEditor);
  const redoChartEditor = useStore((s) => s.redoChartEditor);

  useEffect(() => {
    if (!currentSpec) {
      initChartEditorSpec(SAMPLE_SPEC);
    }
  }, [currentSpec, initChartEditorSpec]);

  useChartEditorHotkeys({ undo: undoChartEditor, redo: redoChartEditor });

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--bg-page, #06060e)",
      }}
    >
      <ChartEditor
        spec={currentSpec || SAMPLE_SPEC}
        resultSet={SAMPLE_RESULT_SET}
        mode="pro"
        surface="dashboard-tile"
        onSpecChange={(next) => setChartEditorSpec(next)}
      />
    </div>
  );
}
