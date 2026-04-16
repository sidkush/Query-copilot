import { useState, useEffect, useMemo } from "react";
import { useStore } from "../../store";
import DashboardModeToggle from "./DashboardModeToggle";
import CommandPalette from "./CommandPalette";
import ExecBriefingLayout from "./modes/ExecBriefingLayout";
import AnalystWorkbenchLayout from "./modes/AnalystWorkbenchLayout";
import LiveOpsLayout from "./modes/LiveOpsLayout";
import StoryLayout from "./modes/StoryLayout";
import PitchLayout from "./modes/PitchLayout";
import WorkbookLayout from "./modes/WorkbookLayout";
import useTileLinking from "./lib/useTileLinking";

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
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Brush-to-detail cross-tile filtering.
  // Source tiles call onBrush(sourceTileId, field, range) via their VegaRenderer.
  // Detail tiles read getFiltersForTile(tileId) and batch-refresh with the filters.
  const { linkConfig, addLink, removeLink, onBrush, getFiltersForTile } = useTileLinking();

  // Semantic model + chart editor from store
  const activeSemanticModel = useStore((s) => s.activeSemanticModel);
  const setChartEditorSpec = useStore((s) => s.setChartEditorSpec);

  // ⌘K / Ctrl+K keyboard shortcut to open command palette
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Build semantic commands from the active semantic model.
  // Each dimension/measure/metric becomes a searchable command that applies
  // the field to the relevant encoding channel via setChartEditorSpec.
  const semanticCommands = useMemo(() => {
    if (!activeSemanticModel) return [];

    const applyEncoding = (channelKey, channelValue) => {
      const current = useStore.getState().chartEditor.currentSpec;
      const base = current || { $schema: "askdb/chart-spec/v1", type: "cartesian", mark: "bar", encoding: {} };
      setChartEditorSpec({
        ...base,
        encoding: {
          ...(base.encoding || {}),
          [channelKey]: channelValue,
        },
      });
    };

    const dimensionCommands = (activeSemanticModel.dimensions || []).map((dim) => ({
      id: `dim:${dim.id}`,
      label: dim.label,
      kind: "dimension",
      hint: `${dim.field} · ${dim.semanticType}`,
      action: () =>
        applyEncoding("x", {
          field: dim.field,
          type: dim.semanticType,
          title: dim.label,
        }),
    }));

    const measureCommands = (activeSemanticModel.measures || []).map((ms) => ({
      id: `ms:${ms.id}`,
      label: ms.label,
      kind: "measure",
      hint: `${ms.aggregate}(${ms.field})`,
      action: () =>
        applyEncoding("y", {
          field: ms.field,
          type: "quantitative",
          aggregate: ms.aggregate,
          title: ms.label,
        }),
    }));

    const metricCommands = (activeSemanticModel.metrics || []).map((m) => ({
      id: `metric:${m.id}`,
      label: m.label,
      kind: "metric",
      hint: `${m.formula}${m.format ? " · " + m.format : ""}`,
      action: () =>
        applyEncoding("y", {
          field: `metric:${m.id}`,
          type: "quantitative",
          title: m.label,
        }),
    }));

    return [...dimensionCommands, ...measureCommands, ...metricCommands];
  }, [activeSemanticModel, setChartEditorSpec]);

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
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <DashboardModeToggle
            modes={MODES.map((m) => ({ id: m.id, label: m.label }))}
            activeMode={mode}
            onChange={handleModeChange}
          />
          {/* ⌘K command palette trigger */}
          <button
            onClick={() => setPaletteOpen(true)}
            title="Open command palette (⌘K)"
            aria-label="Open command palette"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 10px",
              borderRadius: 6,
              background: "var(--bg-elev-2, rgba(255,255,255,0.04))",
              border: "1px solid var(--border-subtle, rgba(255,255,255,0.08))",
              color: "var(--text-secondary, #b0b0b6)",
              fontSize: 11,
              fontWeight: 500,
              cursor: "pointer",
              letterSpacing: "0.02em",
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <span>Search</span>
            <span
              style={{
                padding: "1px 5px",
                borderRadius: 4,
                background: "var(--bg-elev-3, rgba(255,255,255,0.06))",
                border: "1px solid var(--border-subtle, rgba(255,255,255,0.1))",
                fontSize: 10,
                fontFamily: "ui-monospace, monospace",
              }}
            >
              ⌘K
            </span>
          </button>
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        <Layout
          tiles={tiles}
          dashboardId={dashboardId}
          dashboardName={dashboardName}
          onTileClick={onTileClick}
          onLayoutChange={onLayoutChange}
          onBrush={onBrush}
          getFiltersForTile={getFiltersForTile}
          linkConfig={linkConfig}
          addLink={addLink}
          removeLink={removeLink}
        />
      </div>

      {/* Command palette — floats above all content */}
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        commands={semanticCommands}
      />
    </div>
  );
}
