import { useState, useEffect, useMemo, lazy, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "../../store";
import { useShallow } from "zustand/react/shallow";
import { SPRINGS } from "./motion";
import DashboardTopBar from "./DashboardTopBar";
import DashboardContextBar from "./DashboardContextBar";
import DashboardStatusBar from "./DashboardStatusBar";
import CommandPalette from "./CommandPalette";
// TSS W2-C — autogen lifecycle chrome.
import ConnectionMismatchBanner from "./ConnectionMismatchBanner";
import AutogenProgressChip from "./AutogenProgressChip";
// TSS W3-B — per-slot edit popover + advanced drawer (tail-mounted).
import SlotEditPopover from "./SlotEditPopover";
import ChartEditorDrawer from "./ChartEditorDrawer";
// TSS W3-A — save-new-dashboard flow + semantic-tag wizard.
import SaveDashboardDialog from "./SaveDashboardDialog";
import SemanticTagWizard from "./SemanticTagWizard";
const AnalystProLayout = lazy(() => import("./modes/AnalystProLayout"));
import {
  BoardPackLayout,
  OperatorConsoleLayout,
  SignalLayout,
  EditorialBriefLayout,
} from "./modes/presets";
import useTileLinking from "./lib/useTileLinking";
import useVoicePipeline from "./hooks/useVoicePipeline";
import { usePresetTheme } from "./presets/usePresetTheme";

// Plan A★ preset dispatch. activePresetId picks the active layout;
// unknown ids fall through to Analyst Pro (the freeform canvas).
const PRESET_LAYOUTS = {
  "analyst-pro": AnalystProLayout,
  "board-pack": BoardPackLayout,
  "operator-console": OperatorConsoleLayout,
  "signal": SignalLayout,
  "editorial-brief": EditorialBriefLayout,
};
const VoiceModeSelector = lazy(() => import("./VoiceModeSelector"));
const VoiceTranscriptOverlay = lazy(() => import("./VoiceTranscriptOverlay"));

/**
 * DashboardShell — post-archetype-collapse wrapper.
 *
 * Wave 2-A (2026-04-18 preset infrastructure plan): the shell no longer
 * dispatches between seven archetype layouts. Every dashboard renders
 * through AnalystProLayout. The preset system (Phase 2+ of that plan)
 * will add themed variants that still mount through this single layout.
 *
 * Layout (top to bottom):
 *   TopBar (52px)     — logo, breadcrumb, share/save
 *   ContextBar (28px) — business summary, refresh timestamp
 *                       Collapse rule: hides on viewport < 768px and
 *                       when the bar has no filters + no meta to display.
 *   FilterBar          — existing GlobalFilterBar (passed as children)
 *   Content Area       — flex:1, overflow auto, AnalystProLayout mount
 *   StatusBar (32px)   — connection, rows, tier, voice placeholder
 *
 * ─── Z-INDEX SCALE ─────────────────────────────────────────────────────
 *   modals   = 100   (TileTypePicker, ThemeEditor, dropdown menus above chrome)
 *   overlays = 50    (CommandPalette, VoiceTranscriptOverlay, ThemeEditor backdrop)
 *   floating = 40    (AgentFAB, docked/floating panels)
 *   default  = 0
 * All new floating UI MUST use one of these bands — no ad-hoc 9999 values.
 * ────────────────────────────────────────────────────────────────────────
 */

// Viewport breakpoint below which the ContextBar collapses into the TopBar
// (the breadcrumb already conveys context on mobile; saves ~28px of chrome).
const CONTEXT_BAR_COLLAPSE_BREAKPOINT = 768;

export default function DashboardShell({
  tiles = [],
  // `initialMode` is kept for backward compatibility with existing callers
  // but is no longer used to dispatch between layouts. Wave 3 replaces it
  // with an `initialPresetId` prop wired through the preset registry.
  initialMode = "analyst-pro",
  onModeChange: _onModeChange,
  dashboardId = null,
  dashboardName,
  dashboardList = [],
  onSwitchDashboard,
  onTileClick,
  onLayoutChange,
  // SP-1 new props
  orgName,
  workspaceName,
  onNameChange,
  onShare,
  onSave,
  saving = false,
  // Status bar data
  connectionStatus,
  dbType,
  databaseName,
  lastRefreshed,
  // GlobalFilterBar can be passed as children
  children,
  // SP-2: style override for flex layout when agent panel is docked
  style: styleProp,
  // Plan 7 T10 — server-authored Analyst Pro layout { tiledRoot,
  // floatingLayer, size, schemaVersion, archetype }.
  authoredLayout,
}) {
  // `mode` is retained as internal state so existing store/integration code
  // that reads `data-active-mode` off the shell continues to work. After the
  // preset system lands (Wave 3) this is replaced by `activePresetId`.
  const [mode] = useState(initialMode);

  // Wave 3 (Plan A T10): apply active preset's CSS vars + data-active-preset
  // attribute to <html> so global CSS + test assertions can react. Prefer
  // the store when the user has explicitly switched; otherwise fall back
  // to the authoredLayout's saved preset so reloads land on the last view.
  const storeActivePresetId = useStore((s) => s.analystProDashboard?.activePresetId);
  const activePresetId =
    storeActivePresetId || authoredLayout?.activePresetId || "analyst-pro";
  usePresetTheme(activePresetId);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [isNarrowViewport, setIsNarrowViewport] = useState(false);

  // Brush-to-detail cross-tile filtering
  const { linkConfig, addLink, removeLink, onBrush, getFiltersForTile, allActiveFilters } = useTileLinking();

  // SP-5: Voice pipeline — transcripts route to agent panel
  const voiceListening = useStore((s) => s.voiceListening);
  const voiceTranscribing = useStore((s) => s.voiceTranscribing);
  const setAgentPanelOpen = useStore((s) => s.setAgentPanelOpen);
  const setVoiceMode = useStore((s) => s.setVoiceMode);
  const [voiceModeMenuOpen, setVoiceModeMenuOpen] = useState(false);
  const [voiceModeAnchor, setVoiceModeAnchor] = useState(null);

  const { supported: voiceSupported, toggleListening: voiceToggle } = useVoicePipeline({
    onTranscript: (text) => {
      setAgentPanelOpen(true);
      useStore.getState().setVoiceFinalTranscript(text);
    },
  });

  // Restore per-workspace voice mode from localStorage
  useEffect(() => {
    if (!dashboardId) return;
    try {
      const saved = localStorage.getItem(`askdb-voice-mode-${dashboardId}`);
      if (saved && ['ptt', 'wakeword', 'hotmic'].includes(saved)) {
        setVoiceMode(saved);
      }
    } catch { /* ignore */ }
  }, [dashboardId, setVoiceMode]);

  // Store access — batch object selectors with shallow equality to prevent
  // re-renders when unrelated store slices change.
  const {
    activeSemanticModel,
    setChartEditorSpec,
    agentTierInfo,
    connections,
    analystProSize,
    setAnalystProSize,
  } = useStore(useShallow((s) => ({
    activeSemanticModel: s.activeSemanticModel,
    setChartEditorSpec: s.setChartEditorSpec,
    agentTierInfo: s.agentTierInfo,
    connections: s.connections,
    analystProSize: s.analystProSize,
    setAnalystProSize: s.setAnalystProSize,
  })));

  // TSS W2-C — preset-autogen lifecycle readers.
  // boundConnId + bindingAutogenState live inside the dashboard JSON, so
  // we read them from the same slice that powers the layout. activeConnId
  // drives the mismatch banner; autogenProgress feeds the chip.
  const boundConnId = useStore((s) => s.analystProDashboard?.boundConnId);
  const bindingAutogenState = useStore(
    (s) => s.analystProDashboard?.bindingAutogenState,
  );
  const activeConnId = useStore((s) => s.activeConnId);
  const mismatch = Boolean(boundConnId && activeConnId && activeConnId !== boundConnId);

  // TSS W3-B — per-slot edit popover + advanced drawer state.
  // Bindings come from EITHER the Analyst Pro store slice (when a
  // user saves / edits inline) OR the authoredLayout prop that
  // AnalyticsShell passes after fetching `/api/v1/dashboards/{id}`.
  // The authored path is the source of truth after a fresh page load
  // because AnalyticsShell already holds the full server JSON.
  const storeBindings = useStore(
    (s) => s.analystProDashboard?.presetBindings?.[activePresetId],
  );
  const authoredBindings = authoredLayout?.presetBindings?.[activePresetId];
  const presetBindings = storeBindings || authoredBindings;
  // Build a tileData map from the bindings themselves. The autogen backend
  // writes `rows` + `columns` inline on every TileBinding so the layout can
  // render real values without a separate refresh round-trip. Slots whose
  // binding is missing a row payload still fall through to the wireframe
  // fallback inside Slot.jsx.
  const presetTileData = useMemo(() => {
    if (!presetBindings || typeof presetBindings !== 'object') return undefined;
    const out = {};
    for (const binding of Object.values(presetBindings)) {
      const tileId = binding?.tileId;
      if (!tileId) continue;
      if (!Array.isArray(binding.rows) || binding.rows.length === 0) continue;
      out[tileId] = {
        columns: Array.isArray(binding.columns) ? binding.columns : Object.keys(binding.rows[0] || {}),
        rows: binding.rows,
      };
    }
    return out;
  }, [presetBindings]);
  const slotEditPopoverOpen = useStore((s) => s.slotEditPopoverOpen);
  const slotEditPopoverContext = useStore((s) => s.slotEditPopoverContext);
  const closeSlotEditPopover = useStore((s) => s.closeSlotEditPopover);
  const openSlotEditPopover = useStore((s) => s.openSlotEditPopover);
  const advancedEditorOpen = useStore((s) => s.advancedEditorOpen);
  const advancedEditorContext = useStore((s) => s.advancedEditorContext);
  const closeAdvancedEditor = useStore((s) => s.closeAdvancedEditor);
  const setSlotBinding = useStore((s) => s.setSlotBinding);

  // Detect narrow viewport — triggers ContextBar collapse into TopBar breadcrumb
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${CONTEXT_BAR_COLLAPSE_BREAKPOINT}px)`);
    setIsNarrowViewport(mq.matches);
    const handler = (e) => setIsNarrowViewport(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // ⌘K / Ctrl+K keyboard shortcut
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

  // Semantic commands for ⌘K palette
  const semanticCommands = useMemo(() => {
    if (!activeSemanticModel) return [];

    const applyEncoding = (channelKey, channelValue) => {
      const current = useStore.getState().chartEditor.currentSpec;
      const base = current || { $schema: "askdb/chart-spec/v1", type: "cartesian", mark: "bar", encoding: {} };
      setChartEditorSpec({
        ...base,
        encoding: { ...(base.encoding || {}), [channelKey]: channelValue },
      });
    };

    const dimensionCommands = (activeSemanticModel.dimensions || []).map((dim) => ({
      id: `dim:${dim.id}`,
      label: dim.label,
      kind: "dimension",
      hint: `${dim.field} · ${dim.semanticType}`,
      action: () => applyEncoding("x", { field: dim.field, type: dim.semanticType, title: dim.label }),
    }));

    const measureCommands = (activeSemanticModel.measures || []).map((ms) => ({
      id: `ms:${ms.id}`,
      label: ms.label,
      kind: "measure",
      hint: `${ms.aggregate}(${ms.field})`,
      action: () => applyEncoding("y", { field: ms.field, type: "quantitative", aggregate: ms.aggregate, title: ms.label }),
    }));

    const metricCommands = (activeSemanticModel.metrics || []).map((m) => ({
      id: `metric:${m.id}`,
      label: m.label,
      kind: "metric",
      hint: `${m.formula}${m.format ? " · " + m.format : ""}`,
      action: () => applyEncoding("y", { field: `metric:${m.id}`, type: "quantitative", title: m.label }),
    }));

    return [...dimensionCommands, ...measureCommands, ...metricCommands];
  }, [activeSemanticModel, setChartEditorSpec]);

  // Dashboard switch commands
  const dashboardCommands = useMemo(() => {
    if (!dashboardList?.length || !onSwitchDashboard) return [];
    return dashboardList.map((d) => ({
      id: `dash:${d.id}`,
      label: d.name || "Untitled Dashboard",
      kind: "dashboard",
      hint: d.id === dashboardId ? "Current" : `${d.tabs?.length || 0} tabs`,
      action: () => { onSwitchDashboard(d.id); setPaletteOpen(false); },
    }));
  }, [dashboardList, dashboardId, onSwitchDashboard]);

  const allCommands = useMemo(() => [
    ...dashboardCommands,
    ...semanticCommands,
  ], [dashboardCommands, semanticCommands]);

  // Derive connection info from store if not passed as props
  const resolvedConnectionStatus = connectionStatus || (connections?.length > 0 ? 'connected' : 'disconnected');
  const resolvedDbType = dbType || connections?.[0]?.db_type || null;
  const resolvedDbName = databaseName || connections?.[0]?.database_name || null;

  // Derive tier info from store
  const resolvedTier = agentTierInfo?.tier || null;
  const resolvedRowCount = agentTierInfo?.rowCount ?? null;
  const resolvedQueryTime = agentTierInfo?.queryTimeMs ?? null;

  return (
    <motion.div
      data-testid="dashboard-shell"
      data-active-mode={mode}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRINGS.fluid}
      style={{
        height: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        background: "var(--bg-page, #06060e)",
        color: "var(--text-primary, #e7e7ea)",
        ...styleProp,
      }}
    >
      {/* ═══ TopBar ═══ */}
      <DashboardTopBar
        dashboardName={dashboardName}
        dashboardId={dashboardId}
        dashboardList={dashboardList}
        onSwitchDashboard={onSwitchDashboard}
        orgName={orgName}
        workspaceName={workspaceName}
        onNameChange={onNameChange}
        onShare={onShare}
        onSave={onSave}
        saving={saving}
        rightSlot={<AutogenProgressChip bindingAutogenState={bindingAutogenState} />}
      />

      {/* ═══ TSS W2-C — Connection-mismatch banner (sits directly under
          the TopBar, above the ContextBar; non-dismissable). ═══ */}
      {mismatch ? (
        <ConnectionMismatchBanner boundConnId={boundConnId} />
      ) : null}

      {/* ═══ ContextBar ═══
          Collapses on narrow viewports (<768px) to reclaim vertical space;
          the TopBar breadcrumb already conveys dashboard/workspace context. */}
      {!isNarrowViewport && (
        <DashboardContextBar
          tiles={tiles}
          lastRefreshed={lastRefreshed}
        />
      )}

      {/* ═══ FilterBar slot (passed as children from parent) ═══ */}
      {children}

      {/* ═══ Content Area — preset-dispatched layout (Plan A★) ═══ */}
      <div style={{ flex: 1, minHeight: 0, overflow: "auto", position: "relative" }}>
        <Suspense fallback={<div data-testid="preset-layout-loading" style={{ minHeight: '100%', background: 'var(--bg-page, #06060e)' }} />}>
          {(() => {
            const ActiveLayout = PRESET_LAYOUTS[activePresetId] ?? AnalystProLayout;
            return (
              <ActiveLayout
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
                activeFilters={allActiveFilters}
                size={analystProSize}
                onSizeChange={setAnalystProSize}
                authoredLayout={authoredLayout}
                // TSS W3-B — slot-aware edit wiring.
                bindings={presetBindings}
                tileData={presetTileData}
                onSlotEdit={(slotId, anchor) =>
                  openSlotEditPopover(slotId, anchor, activePresetId)
                }
                editable={true}
              />
            );
          })()}
        </Suspense>
      </div>

      {/* ═══ StatusBar ═══ */}
      <DashboardStatusBar
        connectionStatus={resolvedConnectionStatus}
        dbType={resolvedDbType}
        databaseName={resolvedDbName}
        rowCount={resolvedRowCount}
        queryTimeMs={resolvedQueryTime}
        tier={resolvedTier}
        cached={resolvedTier === 'turbo' || resolvedTier === 'memory'}
        voiceSupported={voiceSupported}
        voiceListening={voiceListening}
        voiceTranscribing={voiceTranscribing}
        onVoiceToggle={voiceToggle}
        onVoiceModeMenu={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setVoiceModeAnchor(rect);
          setVoiceModeMenuOpen(true);
        }}
      />

      {/* Command palette — overlay band (zIndex 50 per scale) */}
      <div style={{ position: 'relative', zIndex: 50 }}>
        <CommandPalette
          open={paletteOpen}
          onClose={() => setPaletteOpen(false)}
          commands={allCommands}
        />
      </div>

      {/* SP-5d: Transcription overlay — floats above status bar */}
      <Suspense fallback={null}>
        <VoiceTranscriptOverlay archetype={mode} />
      </Suspense>

      {/* SP-5: Voice mode selector popover */}
      <Suspense fallback={null}>
        <VoiceModeSelector
          open={voiceModeMenuOpen}
          onClose={() => setVoiceModeMenuOpen(false)}
          anchorRect={voiceModeAnchor}
          dashboardId={dashboardId}
        />
      </Suspense>

      {/* ─── TSS W3-B tail mounts — slot edit popover + advanced drawer ─── */}
      {slotEditPopoverOpen && slotEditPopoverContext && (
        <SlotEditPopover
          open
          onClose={closeSlotEditPopover}
          presetId={slotEditPopoverContext.presetId}
          slotId={slotEditPopoverContext.slotId}
          anchorEl={slotEditPopoverContext.anchorEl}
          binding={
            presetBindings?.[slotEditPopoverContext.slotId]
          }
          schemaProfile={undefined}
        />
      )}
      {advancedEditorOpen && advancedEditorContext && (
        <ChartEditorDrawer
          open
          onClose={closeAdvancedEditor}
          slotId={advancedEditorContext.slotId}
          binding={advancedEditorContext.binding}
          onSave={(patch) => {
            const ctxPresetId =
              slotEditPopoverContext?.presetId ?? activePresetId;
            setSlotBinding(ctxPresetId, advancedEditorContext.slotId, patch);
          }}
        />
      )}

      {/* SP-2: Agent toggle FAB — bottom-right, glass style */}
      <AgentFAB />

      {/* TSS W3-A — save-new-dashboard flow tail mounts. Both components
          internally short-circuit on `open=false`; we still gate the mount
          to keep the render tree flat. */}
      <SaveDashboardFlowMount />
    </motion.div>
  );
}

/**
 * SaveDashboardFlowMount — TSS W3-A.
 *
 * Lifts the SaveDashboardDialog + SemanticTagWizard render decisions into
 * a tiny sub-component so DashboardShell's main render body stays lean.
 * Reads the two open flags + wizard context from the store.
 */
function SaveDashboardFlowMount() {
  const saveDashboardDialogOpen = useStore((s) => s.saveDashboardDialogOpen);
  const closeSaveDashboardDialog = useStore((s) => s.closeSaveDashboardDialog);
  const semanticTagWizardOpen = useStore((s) => s.semanticTagWizardOpen);
  const semanticTagWizardContext = useStore((s) => s.semanticTagWizardContext);
  const closeSemanticTagWizard = useStore((s) => s.closeSemanticTagWizard);
  const saveDashboardAndAutogen = useStore((s) => s.saveDashboardAndAutogen);

  return (
    <>
      {saveDashboardDialogOpen && (
        <SaveDashboardDialog
          open={saveDashboardDialogOpen}
          onClose={closeSaveDashboardDialog}
        />
      )}
      {semanticTagWizardOpen && (
        <SemanticTagWizard
          open={semanticTagWizardOpen}
          onClose={closeSemanticTagWizard}
          dashboardId={semanticTagWizardContext?.dashboardId}
          connId={semanticTagWizardContext?.connId}
          schemaProfile={semanticTagWizardContext?.schemaProfile}
          onComplete={(tags) => {
            // Re-enter saveDashboardAndAutogen with collected tags so the
            // autogen POST fires with them populated. We pass the
            // existing dashboardId so the action short-circuits the
            // create/bind steps (Path B).
            if (semanticTagWizardContext) {
              saveDashboardAndAutogen?.({
                dashboardId: semanticTagWizardContext.dashboardId,
                connId: semanticTagWizardContext.connId,
                runSmartBuild: true,
                tags: tags || {},
              });
            }
          }}
        />
      )}
    </>
  );
}

/** Floating action button to toggle the agent panel on/off. */
function AgentFAB() {
  const agentPanelOpen = useStore((s) => s.agentPanelOpen);
  const setAgentPanelOpen = useStore((s) => s.setAgentPanelOpen);
  const agentLoading = useStore((s) => s.agentLoading);

  return (
    <button
      data-testid="agent-fab"
      onClick={() => setAgentPanelOpen(!agentPanelOpen)}
      title={agentPanelOpen ? "Close agent panel" : "Open agent panel"}
      aria-label={agentPanelOpen ? "Close agent panel" : "Open agent panel"}
      style={{
        position: "absolute",
        bottom: 44, // above StatusBar
        right: 16,
        zIndex: 40,
        width: 48,
        height: 48,
        borderRadius: 16,
        border: agentPanelOpen
          ? "1px solid rgba(37,99,235,0.5)"
          : "1px solid var(--border-subtle, rgba(255,255,255,0.1))",
        background: agentPanelOpen
          ? "linear-gradient(135deg, rgba(37,99,235,0.22), rgba(37,99,235,0.08))"
          : "var(--glass-bg-card-elevated, rgba(12,12,20,0.85))",
        backdropFilter: "blur(16px) saturate(1.4)",
        WebkitBackdropFilter: "blur(16px) saturate(1.4)",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: agentPanelOpen
          ? "0 4px 24px rgba(37,99,235,0.25), inset 0 1px 0 rgba(255,255,255,0.08)"
          : "0 4px 20px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.04)",
        transition: "all 0.2s ease",
      }}
      onMouseEnter={(e) => {
        if (!agentPanelOpen) e.currentTarget.style.borderColor = "rgba(37,99,235,0.35)";
      }}
      onMouseLeave={(e) => {
        if (!agentPanelOpen) e.currentTarget.style.borderColor = "var(--border-subtle, rgba(255,255,255,0.1))";
      }}
    >
      {/* Sparkle icon — matches AgentStepFeed empty-state icon */}
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke={agentPanelOpen ? "#6366f1" : "var(--text-secondary, #b0b0b6)"}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ transition: "stroke 0.2s ease" }}
      >
        <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
        <path d="M18.259 8.715L18 9.75l-.259-1.035a2.25 2.25 0 00-1.456-1.456L15.25 7l1.035-.259a2.25 2.25 0 001.456-1.456L18 4.25l.259 1.035a2.25 2.25 0 001.456 1.456L20.75 7l-1.035.259a2.25 2.25 0 00-1.456 1.456z" />
      </svg>
      {/* Activity pulse when agent is running */}
      {agentLoading && (
        <span
          style={{
            position: "absolute",
            top: 6,
            right: 6,
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "#6366f1",
            boxShadow: "0 0 8px rgba(99,102,241,0.6)",
            animation: "pulse 1.5s ease-in-out infinite",
          }}
        />
      )}
    </button>
  );
}
