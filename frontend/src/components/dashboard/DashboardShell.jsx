import { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "../../store";
import { SPRINGS } from "./motion";
import { ARCHETYPE_THEMES } from "./tokens";
import DashboardTopBar, { ARCHETYPE_EDIT_MAP } from "./DashboardTopBar";
import DashboardContextBar from "./DashboardContextBar";
import DashboardStatusBar from "./DashboardStatusBar";
import DashboardModeToggle from "./DashboardModeToggle";
import CommandPalette from "./CommandPalette";
import ExecBriefingLayout from "./modes/ExecBriefingLayout";
import AnalystWorkbenchLayout from "./modes/AnalystWorkbenchLayout";
import LiveOpsLayout from "./modes/LiveOpsLayout";
import StoryLayout from "./modes/StoryLayout";
import PitchLayout from "./modes/PitchLayout";
import WorkbookLayout from "./modes/WorkbookLayout";
import TableauClassicLayout from "./modes/TableauClassicLayout";
import AnalystProLayout from "./modes/AnalystProLayout";
import MobileLayout from "./modes/MobileLayout";
import useTileLinking from "./lib/useTileLinking";
import useVoicePipeline from "./hooks/useVoicePipeline";
import VoiceModeSelector from "./VoiceModeSelector";
import VoiceTranscriptOverlay from "./VoiceTranscriptOverlay";

/**
 * DashboardShell — SP-1 full-stack shell composition.
 *
 * Layout (top to bottom):
 *   TopBar (52px)     — logo, breadcrumb, archetype pill, edit-mode badge, share/save
 *   ContextBar (28px) — business summary, refresh timestamp
 *                       Collapse rule: hides when there are zero tiles (existing), when
 *                       viewport < 768px (chrome trims to TopBar + StatusBar on mobile),
 *                       or when the bar has no filters + no meta to display. Prevents a
 *                       3-layer top chrome (~112px) eating viewport on narrow screens.
 *   FilterBar          — existing GlobalFilterBar (mounted externally or passed as children)
 *   Content Area       — flex:1, overflow auto, active archetype layout
 *   StatusBar (32px)  — connection, rows, tier, voice placeholder
 *
 * Auto-map: archetype change sets edit mode per ARCHETYPE_EDIT_MAP.
 * Manual override persists until next archetype change.
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

const ARCHETYPES = [
  { id: "briefing",     label: "Briefing",     Layout: ExecBriefingLayout },
  { id: "workbench",    label: "Workbench",    Layout: AnalystWorkbenchLayout },
  { id: "ops",          label: "LiveOps",      Layout: LiveOpsLayout },
  { id: "story",        label: "Story",        Layout: StoryLayout },
  { id: "pitch",        label: "Pitch",        Layout: PitchLayout },
  { id: "tableau",      label: "Tableau",      Layout: TableauClassicLayout },
  { id: "analyst-pro",  label: "Analyst Pro",  Layout: AnalystProLayout },
];

// Keep mobile as responsive fallback (not shown in pills)
const MOBILE_BREAKPOINT = 640;

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
}) {
  const [mode, setMode] = useState(initialMode);
  const [editMode, setEditMode] = useState(ARCHETYPE_EDIT_MAP[initialMode] || 'default');
  const [editModeOverride, setEditModeOverride] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
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

  // Store access
  const activeSemanticModel = useStore((s) => s.activeSemanticModel);
  const setChartEditorSpec = useStore((s) => s.setChartEditorSpec);
  const agentTierInfo = useStore((s) => s.agentTierInfo);
  const turboStatus = useStore((s) => s.turboStatus);
  const connections = useStore((s) => s.connections);
  // Analyst Pro canvas size — reactive so SizeToggleDropdown updates re-render the canvas.
  const analystProSize = useStore((s) => s.analystProSize);
  const setAnalystProSize = useStore((s) => s.setAnalystProSize);

  // Detect mobile viewport
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    setIsMobile(mq.matches);
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

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

  // Archetypes adapt to the global website theme (user-controlled).
  // Each archetype resolves its dashboard + tile bg through CSS vars that
  // flip automatically when `<html>.light` class toggles.
  // See `--archetype-*-bg` / `--archetype-*-tile` in index.css.

  // Auto-map edit mode when archetype changes
  const handleArchetypeChange = (nextMode) => {
    setMode(nextMode);
    // Reset edit mode to auto-mapped value (clear override)
    setEditMode(ARCHETYPE_EDIT_MAP[nextMode] || 'default');
    setEditModeOverride(false);
    onModeChange?.(nextMode);

    // SP-5c: Stage Mode (pitch) auto-switches to wake word for hands-free demo
    if (nextMode === 'pitch') {
      setVoiceMode('wakeword');
    }
    // Theme follows global user preference — no scheme forcing per archetype.
  };

  // Manual edit mode override
  const handleEditModeChange = (nextEditMode) => {
    setEditMode(nextEditMode);
    setEditModeOverride(true);
  };

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

  // Choose layout — mobile override or archetype
  const activeArchetype = isMobile ? null : (ARCHETYPES.find((m) => m.id === mode) ?? ARCHETYPES[0]);
  const Layout = isMobile ? MobileLayout : activeArchetype.Layout;

  const archetypeModes = ARCHETYPES.map((m) => ({ id: m.id, label: m.label }));

  return (
    <motion.div
      data-testid="dashboard-shell"
      data-active-mode={mode}
      data-edit-mode={editMode}
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
        orgName={orgName}
        workspaceName={workspaceName}
        archetypeMode={mode}
        archetypeModes={archetypeModes}
        onArchetypeChange={handleArchetypeChange}
        editMode={editMode}
        onEditModeChange={handleEditModeChange}
        onNameChange={onNameChange}
        onShare={onShare}
        onSave={onSave}
        saving={saving}
      />

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

      {/* ═══ Content Area ═══ */}
      <div style={{ flex: 1, minHeight: 0, overflow: "auto", position: "relative" }}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={isMobile ? "__mobile" : mode}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0, transition: { duration: 0.18, ease: [0.16, 1, 0.3, 1] } }}
            exit={{ opacity: 0, y: -4, transition: { duration: 0.12, ease: [0.22, 1, 0.36, 1] } }}
            style={{ minHeight: "100%" }}
          >
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
              activeFilters={allActiveFilters}
              size={analystProSize}
              onSizeChange={setAnalystProSize}
            />
          </motion.div>
        </AnimatePresence>
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
      <VoiceTranscriptOverlay archetype={mode} />

      {/* SP-5: Voice mode selector popover */}
      <VoiceModeSelector
        open={voiceModeMenuOpen}
        onClose={() => setVoiceModeMenuOpen(false)}
        anchorRect={voiceModeAnchor}
        dashboardId={dashboardId}
      />

      {/* SP-2: Agent toggle FAB — bottom-right, glass style */}
      <AgentFAB />
    </motion.div>
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
