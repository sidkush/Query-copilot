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
import MobileLayout from "./modes/MobileLayout";
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
  { id: "mobile", label: "Mobile", Layout: MobileLayout },
];

export default function DashboardShell({
  tiles = [],
  initialMode = "briefing",
  onModeChange,
  dashboardId = null,
  dashboardName,
  dashboardList = [],
  onSwitchDashboard,
  onTileClick,
  onLayoutChange,
}) {
  const [mode, setMode] = useState(initialMode);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

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

  // Dashboard switch commands for ⌘K palette
  const dashboardCommands = useMemo(() => {
    if (!dashboardList?.length || !onSwitchDashboard) return [];
    return dashboardList.map((d) => ({
      id: `dash:${d.id}`,
      label: d.name || "Untitled Dashboard",
      kind: "dashboard",
      hint: d.id === dashboardId ? "Current" : `${d.tabs?.length || 0} tabs`,
      action: () => {
        onSwitchDashboard(d.id);
        setPaletteOpen(false);
      },
    }));
  }, [dashboardList, dashboardId, onSwitchDashboard]);

  // Merge all commands for the palette
  const allCommands = useMemo(() => [
    ...dashboardCommands,
    ...semanticCommands,
  ], [dashboardCommands, semanticCommands]);

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
        <div style={{ display: "flex", alignItems: "center", gap: 8, position: "relative" }}>
          {/* Dashboard picker dropdown */}
          <button
            onClick={() => setPickerOpen((v) => !v)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "3px 8px",
              borderRadius: 6,
              background: "transparent",
              border: "1px solid transparent",
              color: "var(--text-secondary, #b0b0b6)",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              transition: "all 150ms ease",
              letterSpacing: "-0.01em",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--bg-hover, rgba(255,255,255,0.06))";
              e.currentTarget.style.borderColor = "var(--border-subtle, rgba(255,255,255,0.1))";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.borderColor = "transparent";
            }}
          >
            <span style={{ color: "var(--text-muted, rgba(255,255,255,0.4))" }}>Dashboard</span>
            <span style={{ color: "var(--text-primary, #e7e7ea)", fontWeight: 600 }}>
              {dashboardName || "Untitled"}
            </span>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" style={{ opacity: 0.5 }}>
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          <span style={{ color: "var(--text-muted, rgba(255,255,255,0.25))", fontSize: 11 }}>·</span>
          <span style={{ color: "var(--text-secondary, #b0b0b6)", fontSize: 12 }}>{active.label}</span>

          {/* Dropdown menu */}
          {pickerOpen && dashboardList.length > 0 && (
            <>
              <div
                onClick={() => setPickerOpen(false)}
                style={{ position: "fixed", inset: 0, zIndex: 90 }}
              />
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 6px)",
                  left: 0,
                  minWidth: 240,
                  maxHeight: 320,
                  overflowY: "auto",
                  background: "var(--bg-elevated, #18182a)",
                  border: "1px solid var(--border-default, rgba(255,255,255,0.1))",
                  borderRadius: 10,
                  boxShadow: "0 16px 48px -8px rgba(0,0,0,0.6), 0 4px 12px rgba(0,0,0,0.3)",
                  zIndex: 100,
                  padding: "4px",
                }}
              >
                <div style={{
                  padding: "6px 10px 4px",
                  fontSize: 10,
                  fontWeight: 600,
                  color: "var(--text-muted, rgba(255,255,255,0.4))",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}>
                  Dashboards
                </div>
                {dashboardList.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => {
                      onSwitchDashboard?.(d.id);
                      setPickerOpen(false);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: 7,
                      background: d.id === dashboardId
                        ? "var(--accent-light, rgba(99,102,241,0.12))"
                        : "transparent",
                      border: "none",
                      color: d.id === dashboardId
                        ? "var(--accent, #6366f1)"
                        : "var(--text-primary, #e7e7ea)",
                      fontSize: 12.5,
                      fontWeight: d.id === dashboardId ? 600 : 400,
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "background 100ms ease",
                      letterSpacing: "-0.01em",
                    }}
                    onMouseEnter={(e) => {
                      if (d.id !== dashboardId) e.currentTarget.style.background = "var(--bg-hover, rgba(255,255,255,0.06))";
                    }}
                    onMouseLeave={(e) => {
                      if (d.id !== dashboardId) e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <span style={{
                      width: 6, height: 6, borderRadius: "50%",
                      background: d.id === dashboardId ? "var(--accent, #6366f1)" : "var(--text-muted, rgba(255,255,255,0.2))",
                      flexShrink: 0,
                    }} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {d.name || "Untitled"}
                    </span>
                    {d.id === dashboardId && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: "auto", flexShrink: 0, opacity: 0.7 }}>
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
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
        commands={allCommands}
      />
    </div>
  );
}
