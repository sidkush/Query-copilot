import { useMemo } from "react";
import { motion } from "framer-motion";
import { useStore } from "../../store";
import { TOKENS } from "../dashboard/tokens";
import { SPRINGS } from "../dashboard/motion";
import ChartEditorTopbar from "./ChartEditorTopbar";
import DataRail from "./DataRail";
import EditorCanvas from "./EditorCanvas";
import BottomDock from "./BottomDock";
import InspectorRoot from "./Inspector/InspectorRoot";
import CorrectionToast from "./CorrectionToast";

/**
 * ChartEditor — top-level 3-pane CSS grid shell.
 *
 * Layout:
 *   ┌─────────────────────────────────────┐
 *   │              Topbar (40)            │
 *   ├────────┬────────────────────┬───────┤
 *   │ DataR. │      Canvas        │ Insp. │
 *   │  200   │       fluid        │  320  │
 *   ├────────┴────────────────────┴───────┤
 *   │            BottomDock (44)          │
 *   └─────────────────────────────────────┘
 *
 * Mode rules (Sub-project A Phase 1):
 *   - default: DataRail + Inspector collapsed (rails hidden), canvas fills.
 *   - pro:     all rails + dock visible.
 *   - stage:   rails collapsed, dock collapsed (cinematic).
 *
 * Props:
 *   - spec:          ChartSpec object (cartesian / map / geo-overlay / creative)
 *   - resultSet:     { columns: string[], rows: unknown[][], columnProfile?: ColumnProfile[] }
 *   - mode:          'default' | 'stage' | 'pro' (default 'default')
 *   - surface:       'chat-result' | 'dashboard-tile' (informational)
 *   - onSpecChange:  (next: ChartSpec) => void — Phase 2 wires this to drag-drop.
 */
export default function ChartEditor({
  spec,
  resultSet,
  mode = "default",
  surface = "dashboard-tile",
  onSpecChange,
  onModeChange,
}) {
  const connId = useStore((s) => s.activeConnId);

  const showDataRail = mode === "pro";
  const showInspector = mode === "pro" || mode === "default";
  const showDock = mode !== "stage";

  const gridTemplateColumns = useMemo(() => {
    // Use minmax() so rails can shrink when the canvas is narrow; combined
    // with minWidth:0 on each grid child this lets inner content ellipsize
    // instead of forcing horizontal overflow.
    const left = showDataRail ? "minmax(180px, 220px)" : "0px";
    const right = showInspector ? "minmax(280px, 340px)" : "0px";
    return `${left} minmax(0, 1fr) ${right}`;
  }, [showDataRail, showInspector]);

  const gridTemplateRows = useMemo(() => {
    const top = "40px";
    const bottom = showDock ? "44px" : "0px";
    return `${top} 1fr ${bottom}`;
  }, [showDock]);

  return (
    <motion.div
      data-testid="chart-editor"
      data-mode={mode}
      data-surface={surface}
      className="chart-editor premium-liquid-glass"
      initial={{ opacity: 0, scale: 0.99 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={SPRINGS.fluid}
      style={{
        display: "grid",
        gridTemplateColumns,
        gridTemplateRows,
        gridTemplateAreas: `
          "topbar topbar topbar"
          "data   canvas inspector"
          "dock   dock   dock"
        `,
        width: "100%",
        height: "100%",
        minHeight: 0,
        background: "var(--bg-page, #06060e)",
        color: "var(--text-primary, #e7e7ea)",
        fontFamily: TOKENS.fontDisplay,
      }}
    >
      <div style={{ gridArea: "topbar", minWidth: 0 }}>
        <ChartEditorTopbar mode={mode} onModeChange={onModeChange} spec={spec} onSpecChange={onSpecChange} />
      </div>

      {showDataRail && (
        <div style={{ gridArea: "data", minWidth: 0, overflow: "hidden" }}>
          <DataRail columnProfile={resultSet?.columnProfile || []} />
        </div>
      )}

      <div style={{ gridArea: "canvas", minWidth: 0, minHeight: 0, overflow: "hidden", position: "relative" }}>
        <EditorCanvas
          spec={spec}
          resultSet={resultSet}
          onSpecChange={onSpecChange}
          mode={mode}
        />
        <CorrectionToast connId={connId} dockVisible={showDock} />
      </div>


      {showInspector && (
        <div style={{ gridArea: "inspector", minWidth: 0, overflow: "hidden" }}>
          <InspectorRoot
            spec={spec}
            onSpecChange={onSpecChange}
            columnProfile={resultSet?.columnProfile || []}
          />
        </div>
      )}

      {showDock && (
        <div style={{ gridArea: "dock", minWidth: 0 }}>
          <BottomDock />
        </div>
      )}
    </motion.div>
  );
}
