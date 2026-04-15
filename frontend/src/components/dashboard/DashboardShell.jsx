import { useState } from "react";
import DashboardModeToggle from "./DashboardModeToggle";
import ExecBriefingLayout from "./modes/ExecBriefingLayout";
import AnalystWorkbenchLayout from "./modes/AnalystWorkbenchLayout";
import LiveOpsLayout from "./modes/LiveOpsLayout";
import StoryLayout from "./modes/StoryLayout";
import PitchLayout from "./modes/PitchLayout";
import WorkbookLayout from "./modes/WorkbookLayout";

/**
 * DashboardShell — Phase 4a archetype shell.
 *
 * Hosts the six dashboard modes from A spec S7 and swaps the layout
 * component based on the active mode. The shell itself is minimal:
 *   - mode toggle pill at the top
 *   - active layout below
 *
 * Phase 4a ships the shell + toggle + skeleton layouts. Phase 4b wires
 * real bin-packing (ExecBriefing), Live Ops WebSocket refresh, Story
 * scroll + annotations, Workbook shared filters, and the Pitch mode's
 * existing PresentationEngine integration. Each mode file carries a
 * TODO(a4b) marker for the deferred work.
 *
 * Not hooked into production routing yet — behind
 * NEW_CHART_EDITOR_ENABLED (see config / Phase 4b cutover). This
 * component is consumable via the /dev/chart-editor dev route or any
 * caller that mounts <DashboardShell />.
 */
const MODES = [
  { id: "briefing", label: "Briefing", Layout: ExecBriefingLayout },
  { id: "workbench", label: "Workbench", Layout: AnalystWorkbenchLayout },
  { id: "ops", label: "Live Ops", Layout: LiveOpsLayout },
  { id: "story", label: "Story", Layout: StoryLayout },
  { id: "pitch", label: "Pitch", Layout: PitchLayout },
  { id: "workbook", label: "Workbook", Layout: WorkbookLayout },
];

export default function DashboardShell({
  tiles = [],
  initialMode = "briefing",
  onModeChange,
  dashboardId = null,
  dashboardName,
  onTileClick,
  onLayoutChange,
}) {
  const [mode, setMode] = useState(initialMode);

  const handleModeChange = (nextMode) => {
    setMode(nextMode);
    onModeChange && onModeChange(nextMode);
  };

  const active = MODES.find((m) => m.id === mode) ?? MODES[0];
  const Layout = active.Layout;

  return (
    <div
      data-testid="dashboard-shell"
      data-active-mode={mode}
      style={{
        height: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        background: "var(--bg-page, #06060e)",
        color: "var(--text-primary, #e7e7ea)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 16px",
          borderBottom: "1px solid var(--border-subtle, rgba(255,255,255,0.08))",
        }}
      >
        <div style={{ fontSize: 12, color: "var(--text-secondary, #b0b0b6)" }}>
          Dashboard · {active.label}
        </div>
        <DashboardModeToggle
          modes={MODES.map((m) => ({ id: m.id, label: m.label }))}
          activeMode={mode}
          onChange={handleModeChange}
        />
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        <Layout
          tiles={tiles}
          dashboardId={dashboardId}
          dashboardName={dashboardName}
          onTileClick={onTileClick}
          onLayoutChange={onLayoutChange}
        />
      </div>
    </div>
  );
}
