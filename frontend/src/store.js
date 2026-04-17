import { create } from "zustand";
import { detectCorrections } from "./chart-ir";
import { alignZones, distributeZones } from "./components/dashboard/freeform/lib/alignmentOps";
import { groupSelection, ungroupContainer, toggleLock, toggleLockFloating, reorderZone, moveZoneAcrossContainers, wrapInContainer, removeChild } from "./components/dashboard/freeform/lib/zoneTreeOps";
import { generateZoneId } from "./components/dashboard/freeform/lib/zoneTree";
import { applySetChange } from './components/dashboard/freeform/lib/setOps';
import { buildContextMenu } from './components/dashboard/freeform/lib/contextMenuBuilder';
import {
  validateParamName,
  coerceValue,
  validateAgainstDomain,
} from './components/dashboard/freeform/lib/parameterOps';

let _themeTimer = null;

function findZoneById(dashboard, id) {
  if (!dashboard || !id) return null;
  const stack = [dashboard.tiledRoot, ...(dashboard.floatingLayer || [])];
  while (stack.length) {
    const node = stack.pop();
    if (!node) continue;
    if (node.id === id) return node;
    if (node.children && node.children.length) stack.push(...node.children);
  }
  return null;
}

export const useStore = create((set, get) => ({
  user: JSON.parse(localStorage.getItem("user") || "null"),
  token: localStorage.getItem("token") || null,

  setAuth: (user, token) => {
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(user));
    set({ user, token });
  },

  logout: () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("connections");
    set({ user: null, token: null, connections: [], activeConnId: null });
  },

  // Theme
  theme: localStorage.getItem("askdb-theme") || "system",
  resolvedTheme: (() => {
    const pref = localStorage.getItem("askdb-theme") || "system";
    if (pref === "system") return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    return pref;
  })(),
  setTheme: (preference) => {
    localStorage.setItem("askdb-theme", preference);
    const resolved = preference === "system"
      ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : preference;
    // Smooth transition class (clear previous timer to prevent stacking)
    clearTimeout(_themeTimer);
    document.documentElement.classList.add("theme-transitioning");
    document.documentElement.classList.toggle("light", resolved === "light");
    _themeTimer = setTimeout(() => document.documentElement.classList.remove("theme-transitioning"), 350);
    set({ theme: preference, resolvedTheme: resolved });
  },

  // Engagement — hot metric ambient pulse (Phase 2.4)
  // Per-user opt-in toggle; defaults to ON. Persisted to localStorage.
  hotMetricsEnabled: localStorage.getItem("askdb.hotMetricsEnabled") !== "false",
  setHotMetricsEnabled: (enabled) => {
    localStorage.setItem("askdb.hotMetricsEnabled", enabled ? "true" : "false");
    set({ hotMetricsEnabled: enabled });
  },
  // Per-dashboard tile heat classification map computed by hotMetricDetector.
  // Shape: { [tileId]: 'cold' | 'warm' | 'warm-negative' | 'hot' | 'hot-negative' }
  // Written by Dashboard builder on data change, read by TileWrapper selectors.
  tileHeatMap: {},
  setTileHeatMap: (map) => set({ tileHeatMap: map || {} }),

  // Onboarding state (replaces tutorialComplete)
  tutorialComplete: localStorage.getItem("tutorialComplete") === "true",
  setTutorialComplete: (v) => {
    localStorage.setItem("tutorialComplete", v ? "true" : "false");
    set({ tutorialComplete: v });
  },
  onboardingComplete: localStorage.getItem("onboardingComplete") === "true",
  setOnboardingComplete: (v) => {
    localStorage.setItem("onboardingComplete", v ? "true" : "false");
    set({ onboardingComplete: v });
  },

  // API Key / BYOK state
  apiKeyStatus: null, // { provider, valid, validated_at, masked_key, configured }
  preferredModel: localStorage.getItem("preferredModel") || null,
  availableModels: [], // [{ id, name, tier, cost }]
  setApiKeyStatus: (s) => set({ apiKeyStatus: s }),
  setPreferredModel: (m) => {
    if (m) localStorage.setItem("preferredModel", m);
    else localStorage.removeItem("preferredModel");
    set({ preferredModel: m });
  },
  setAvailableModels: (models) => set({ availableModels: models }),

  // Multi-DB connection state (persisted)
  connections: JSON.parse(localStorage.getItem("connections") || "[]"),
  activeConnId: null,

  setConnections: (conns) => {
    localStorage.setItem("connections", JSON.stringify(conns));
    set({ connections: conns });
  },

  addConnection: (conn) => {
    const updated = [...get().connections, conn];
    localStorage.setItem("connections", JSON.stringify(updated));
    set({ connections: updated });
  },

  removeConnection: (connId) => {
    const updated = get().connections.filter((c) => c.conn_id !== connId);
    localStorage.setItem("connections", JSON.stringify(updated));
    set({ connections: updated });
  },

  setActiveConnId: (id) => set({ activeConnId: id }),

  // Chat history
  messages: [],
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  clearMessages: () => set({ messages: [] }),
  setMessages: (msgs) => {
    if (typeof msgs === "function") {
      set((s) => ({ messages: msgs(s.messages) }));
    } else {
      set({ messages: Array.isArray(msgs) ? msgs : [] });
    }
  },

  // Saved connections
  savedConnections: [],
  setSavedConnections: (conns) => set({ savedConnections: conns }),

  // Chat list & active chat
  chats: [],
  setChats: (chats) => set({ chats }),
  activeChatId: null,
  setActiveChatId: (id) => set({ activeChatId: id }),

  // User profile
  profile: null,
  setProfile: (p) => set({ profile: p }),

  // Dashboard
  activeDashboardId: null,
  setActiveDashboardId: (id) => set({ activeDashboardId: id }),

  // Reactive dashboard filters — tiles subscribe to version counters
  // dateFilters: array of { id, dateColumn, range, dateStart, dateEnd }
  dashboardGlobalFilters: { dateFilters: [], fields: [] },
  dashboardFilterVersion: 0,
  applyGlobalFilters: (filters) => set((s) => {
    // Migration shim: convert old single-dateColumn format to dateFilters array
    let dateFilters = filters?.dateFilters;
    if (!dateFilters && filters?.dateColumn) {
      dateFilters = [{ id: "df_migrated", dateColumn: filters.dateColumn, range: filters.range || "all_time", dateStart: filters.dateStart || "", dateEnd: filters.dateEnd || "" }];
    }
    return {
      dashboardGlobalFilters: {
        dateFilters: Array.isArray(dateFilters) ? dateFilters : [],
        fields: Array.isArray(filters?.fields) ? filters.fields : [],
      },
      dashboardFilterVersion: s.dashboardFilterVersion + 1,
    };
  }),
  resetGlobalFilters: () => set({
    dashboardGlobalFilters: { dateFilters: [], fields: [] },
    dashboardFilterVersion: 0,
  }),

  // Tile edit version — bumped after TileEditor save to trigger refresh
  tileEditVersion: 0,
  bumpTileEditVersion: () => set((s) => ({ tileEditVersion: s.tileEditVersion + 1 })),

  // Prefetch cache for dashboard tiles
  prefetchCache: {},
  setPrefetchData: (dashboardId, tileId, data) => set((s) => ({
    prefetchCache: {
      ...s.prefetchCache,
      [dashboardId]: {
        ...(s.prefetchCache[dashboardId] || {}),
        [tileId]: { ...data, _ts: Date.now() },
      },
    },
  })),
  getPrefetchData: (dashboardId, tileId) => {
    const entry = get().prefetchCache[dashboardId]?.[tileId];
    if (!entry) return null;
    // Expire after 5 minutes
    if (Date.now() - entry._ts > 300000) return null;
    return { columns: entry.columns, rows: entry.rows };
  },
  clearPrefetchCache: (dashboardId) => set((s) => {
    const cache = { ...s.prefetchCache };
    if (dashboardId) delete cache[dashboardId];
    else return { prefetchCache: {} };
    return { prefetchCache: cache };
  }),

  // ── SP-2: Dashboard Tile CRUD (agent-driven real-time updates) ──
  // dashboardTiles: live tile array mirroring the dashboard state.
  // Mutations here are optimistic; AnalyticsShell reconciles on reload.
  dashboardTiles: [],
  setDashboardTiles: (tiles) => set({ dashboardTiles: Array.isArray(tiles) ? tiles : [] }),
  addDashboardTile: (tile) => set((s) => ({
    dashboardTiles: [...s.dashboardTiles, tile],
    tileEditVersion: s.tileEditVersion + 1,
  })),
  updateDashboardTile: (tileId, updates) => set((s) => ({
    dashboardTiles: s.dashboardTiles.map((t) =>
      t.id === tileId ? { ...t, ...updates } : t
    ),
    tileEditVersion: s.tileEditVersion + 1,
  })),
  removeDashboardTile: (tileId) => set((s) => ({
    dashboardTiles: s.dashboardTiles.filter((t) => t.id !== tileId),
    tileEditVersion: s.tileEditVersion + 1,
  })),

  // Agent-editing tracking: set of tile IDs currently being modified by agent
  agentEditingTiles: new Set(),
  setAgentEditingTile: (tileId, editing) => set((s) => {
    const next = new Set(s.agentEditingTiles);
    if (editing) next.add(tileId);
    else next.delete(tileId);
    return { agentEditingTiles: next };
  }),
  clearAgentEditingTiles: () => set({ agentEditingTiles: new Set() }),

  // Suggested action chips after agent tile operations
  agentSuggestedChips: [],
  setAgentSuggestedChips: (chips) => set({ agentSuggestedChips: Array.isArray(chips) ? chips : [] }),
  clearAgentSuggestedChips: () => set({ agentSuggestedChips: [] }),

  // ── ML Engine Slice ──────────────────────────────────────────
  mlModels: [],
  mlTrainingTaskId: null,
  mlTrainingProgress: null,
  setMLModels: (models) => set({ mlModels: models }),
  setMLTrainingTaskId: (id) => set({ mlTrainingTaskId: id }),
  setMLTrainingProgress: (progress) => set({ mlTrainingProgress: progress }),

  // ML Pipeline Visualization
  mlPipelineStages: {
    ingest:   { status: 'idle', data: null },
    clean:    { status: 'idle', data: null },
    features: { status: 'idle', data: null },
    train:    { status: 'idle', data: null },
    evaluate: { status: 'idle', data: null },
    results:  { status: 'idle', data: null },
  },
  mlPipelineActiveStage: null,
  updatePipelineStage: (stage, update) => set((s) => ({
    mlPipelineStages: {
      ...s.mlPipelineStages,
      [stage]: { ...s.mlPipelineStages[stage], ...update },
    },
  })),
  setMLPipelineActiveStage: (stage) => set({ mlPipelineActiveStage: stage }),
  resetMLPipeline: () => set({
    mlPipelineStages: {
      ingest:   { status: 'idle', data: null },
      clean:    { status: 'idle', data: null },
      features: { status: 'idle', data: null },
      train:    { status: 'idle', data: null },
      evaluate: { status: 'idle', data: null },
      results:  { status: 'idle', data: null },
    },
    mlPipelineActiveStage: null,
  }),

  // ML Workflow persistence
  mlActiveWorkflow: null,
  mlWorkflows: [],
  setMLActiveWorkflow: (wf) => set({ mlActiveWorkflow: wf }),
  setMLWorkflows: (list) => set({ mlWorkflows: list }),
  updateWorkflowStage: (stageKey, update) => set((s) => {
    if (!s.mlActiveWorkflow) return {};
    const stages = { ...s.mlActiveWorkflow.stages };
    stages[stageKey] = { ...stages[stageKey], ...update };
    return {
      mlActiveWorkflow: { ...s.mlActiveWorkflow, stages, updated_at: new Date().toISOString() },
    };
  }),

  // ── Voice Slice ──────────────────────────────────────────────
  voiceActive: false,
  voiceMode: 'ptt',          // 'ptt' | 'wakeword' | 'hotmic'
  voiceListening: false,
  voiceTranscribing: false,
  voiceTranscript: '',        // interim transcript text
  voiceFinalTranscript: '',   // final committed transcript
  wakeWordActive: false,      // wake-word detector running (separate from listening)
  voiceConfig: { sttProvider: 'browser', ttsProvider: 'browser', voiceId: null, autoListen: true, speed: 1.0, silenceDelayMs: 1200, wakePhrase: 'Hey Ask' },
  setVoiceActive: (active) => set({ voiceActive: active }),
  setVoiceMode: (mode) => {
    const valid = ['ptt', 'wakeword', 'hotmic'];
    set({ voiceMode: valid.includes(mode) ? mode : 'ptt' });
  },
  setVoiceListening: (v) => set({ voiceListening: !!v }),
  setVoiceTranscribing: (v) => set({ voiceTranscribing: !!v }),
  setVoiceTranscript: (text) => set({ voiceTranscript: text || '' }),
  setVoiceFinalTranscript: (text) => set({ voiceFinalTranscript: text || '' }),
  setWakeWordActive: (v) => set({ wakeWordActive: !!v }),
  setVoiceConfig: (config) => set((s) => ({ voiceConfig: { ...s.voiceConfig, ...config } })),

  // ── Agent Slice ──────────────────────────────────────────────
  agentContext: 'query', // 'query' | 'dashboard' | 'ml'
  setAgentContext: (ctx) => set({ agentContext: ctx }),
  agentSteps: [],
  agentLoading: false,
  agentError: null,
  agentWaiting: null,
  agentAutoExecute: true,
  agentPersona: localStorage.getItem("qc_agent_persona") || null, // explorer, auditor, storyteller
  agentPermissionMode: localStorage.getItem("qc_agent_permission_mode") || "supervised", // supervised or autonomous
  agentChatId: null,
  agentTierInfo: null, // {tier: string, cacheAge: number, estimatedMs: number, elapsedMs: number}
  turboStatus: {}, // connId -> {enabled: bool, syncing: bool, twinInfo: object}
  queryIntelligence: { schemaProfileLoaded: false, memoryInsightCount: 0, lastTierHit: null },
  dualResponseActive: false,
  cachedResultStep: null,
  agentChecklist: [],
  agentPhase: null,
  agentElapsedMs: 0,
  agentEstimatedMs: 0,
  agentVerification: null,
  performanceMetrics: {
    lastQueryMs: null,
    lastTierName: null,
    lastTransferMethod: null,
    lastRowsScanned: null,
  },
  setPerformanceMetrics: (metrics) => set({ performanceMetrics: metrics }),
  agentDock: "float",
  agentPanelWidth: 380,
  agentPanelHeight: 500,
  agentPanelOpen: false,
  agentResizing: false,
  setAgentDock: (d) => {
    const valid = ["float", "right", "bottom", "left"];
    set({ agentDock: valid.includes(d) ? d : "float" });
  },
  setAgentPanelWidth: (w) => {
    if (typeof w === "function") {
      set((s) => {
        const n = Number(w(s.agentPanelWidth));
        return { agentPanelWidth: Number.isFinite(n) ? Math.max(280, n) : s.agentPanelWidth };
      });
    } else {
      const n = Number(w);
      if (Number.isFinite(n)) set({ agentPanelWidth: Math.max(280, n) });
    }
  },
  setAgentPanelHeight: (h) => {
    if (typeof h === "function") {
      set((s) => {
        const n = Number(h(s.agentPanelHeight));
        return { agentPanelHeight: Number.isFinite(n) ? Math.max(200, n) : s.agentPanelHeight };
      });
    } else {
      const n = Number(h);
      if (Number.isFinite(n)) set({ agentPanelHeight: Math.max(200, n) });
    }
  },
  setAgentPanelOpen: (v) => set({ agentPanelOpen: !!v }),
  setAgentResizing: (v) => set({ agentResizing: !!v }),

  setAgentSteps: (steps) => set({ agentSteps: Array.isArray(steps) ? steps : [] }),
  addAgentStep: (step) => set((state) => {
    const newSteps = [...state.agentSteps, step];
    const updates = { agentSteps: newSteps };
    if (step.type === "cached_result") {
      updates.dualResponseActive = true;
      updates.cachedResultStep = step;
    }
    if (step.type === "live_correction" || step.type === "result") {
      updates.dualResponseActive = false;
    }
    if (step.type === "checklist_update" && step.checklist) {
      updates.agentChecklist = step.checklist;
      if (step.elapsed_ms != null) updates.agentElapsedMs = step.elapsed_ms;
      if (step.estimated_total_ms != null) updates.agentEstimatedMs = step.estimated_total_ms;
    }
    if (step.type === "phase_start") {
      updates.agentPhase = step.phase;
    }
    if (step.type === "phase_complete") {
      updates.agentPhase = null;
    }
    if (step.type === "verification") {
      updates.agentVerification = step.tool_input;
    }
    return updates;
  }),
  clearAgent: () => set({
    agentSteps: [],
    agentLoading: false,
    agentError: null,
    agentWaiting: null,
    agentWaitingOptions: null,
    agentChatId: null,
    dualResponseActive: false,
    cachedResultStep: null,
    agentChecklist: [],
    agentPhase: null,
    agentElapsedMs: 0,
    agentEstimatedMs: 0,
    agentVerification: null,
  }),
  softClearAgent: () => set({
    agentSteps: [],
    agentError: null,
    agentWaiting: null,
    agentWaitingOptions: null,
    agentLoading: false,
    agentChecklist: [],
    agentPhase: null,
    agentElapsedMs: 0,
    agentEstimatedMs: 0,
    agentVerification: null,
    dualResponseActive: false,
    cachedResultStep: null,
    // NOTE: agentChatId intentionally NOT cleared — preserves conversation thread
  }),
  setDualResponseActive: (active) => set({ dualResponseActive: active }),
  setCachedResultStep: (step) => set({ cachedResultStep: step }),
  setAgentChecklist: (checklist) => set({ agentChecklist: checklist }),
  setAgentPhase: (phase) => set({ agentPhase: phase }),
  setAgentElapsedMs: (ms) => set({ agentElapsedMs: ms }),
  setAgentEstimatedMs: (ms) => set({ agentEstimatedMs: ms }),
  setAgentVerification: (v) => set({ agentVerification: v }),
  setAgentLoading: (v) => set({ agentLoading: v }),
  setAgentError: (e) => set({ agentError: e }),
  agentWaitingOptions: null,
  setAgentWaiting: (q, options) => set({ agentWaiting: q, agentWaitingOptions: options || null }),
  clearAgentWaiting: () => set({ agentWaiting: null, agentWaitingOptions: null }),
  setAgentAutoExecute: (v) => set({ agentAutoExecute: v }),
  setAgentPersona: (p) => { localStorage.setItem("qc_agent_persona", p || ""); set({ agentPersona: p || null }); },
  setAgentPermissionMode: (m) => { const v = m === "autonomous" ? "autonomous" : "supervised"; localStorage.setItem("qc_agent_permission_mode", v); set({ agentPermissionMode: v }); },
  setAgentChatId: (id) => set({ agentChatId: id }),
  setAgentTierInfo: (info) => set({ agentTierInfo: info }),
  setTurboStatus: (connId, status) => set((s) => ({
    turboStatus: { ...s.turboStatus, [connId]: status },
  })),
  setQueryIntelligence: (update) => set((s) => ({
    queryIntelligence: { ...s.queryIntelligence, ...update },
  })),

  // Agent history persistence (server-side via API — Invariant-5)
  // Backend auto-saves on SSE completion; saveAgentHistory is now a no-op
  // kept for backward compatibility with callers in AgentPanel.jsx
  saveAgentHistory: () => {
    // No-op: backend persists sessions to SQLite automatically (Task 3)
  },
  loadAgentHistory: async (chatId) => {
    try {
      const { api } = await import("./api");
      const session = await api.agentSessionLoad(chatId);
      if (session?.steps?.length) {
        set({ agentSteps: session.steps, agentChatId: chatId, agentSessionProgress: session.progress || null });
        return true;
      }
    } catch (err) {
      void err;
    }
    return false;
  },
  getAgentHistoryList: async () => {
    try {
      const { api } = await import("./api");
      const data = await api.agentSessions();
      return (data?.sessions || []).map((s) => ({
        chatId: s.chat_id,
        updatedAt: s.updated_at ? s.updated_at * 1000 : 0, // Convert epoch seconds to ms
        preview: s.title || "Agent conversation",
        stepCount: s.step_count || 0,
        hasPending: s.has_pending || false,
      }));
    } catch (err) {
      void err;
      return [];
    }
  },
  deleteAgentHistory: async (chatId) => {
    try {
      const { api } = await import("./api");
      await api.agentSessionDelete(chatId);
    } catch (err) {
      void err;
    }
  },
  // Progress state for continue/resume UI
  agentSessionProgress: null,
  setAgentSessionProgress: (p) => set({ agentSessionProgress: p }),

  // --- chartEditor slice (Sub-project A Phase 1 + Phase 2) -------------
  // Holds the ChartSpec under edit + a linear undo/redo history stack.
  //
  // History model: array of snapshots, historyIndex points at the spec
  // currently shown. pushChartEditorHistory truncates any forward-of-index
  // branch (standard linear undo), then appends. Bounded at 100 snapshots
  // per A spec §12 Phase 2 — oldest entry dropped when cap reached.
  chartEditor: {
    currentSpec: null,
    history: [],
    historyIndex: -1,
    mode: "default",
    historyCap: 100,
  },
  setChartEditorSpec: (nextSpec, { pushHistory = true } = {}) =>
    set((s) => {
      const editor = s.chartEditor;
      if (!pushHistory) {
        return { chartEditor: { ...editor, currentSpec: nextSpec } };
      }
      // Truncate forward branch, append, enforce cap.
      const truncated = editor.history.slice(0, editor.historyIndex + 1);
      truncated.push(nextSpec);
      let nextHistory = truncated;
      let nextIndex = truncated.length - 1;
      if (nextHistory.length > editor.historyCap) {
        const overflow = nextHistory.length - editor.historyCap;
        nextHistory = nextHistory.slice(overflow);
        nextIndex = nextHistory.length - 1;
      }

      // Teach-by-correction (D3): detect spec deltas and queue suggestions
      const prevSpec = editor.history[editor.historyIndex] || null;
      if (prevSpec && nextSpec && pushHistory) {
        try {
          const corrections = detectCorrections(prevSpec, nextSpec);
          if (corrections.length > 0) {
            const now = Date.now();
            const recentCount = s.correctionSuggestions.filter(
              (c) => c._ts && now - c._ts < 60000
            ).length;
            if (recentCount < 2) {
              const tagged = corrections.map((c) => ({ ...c, _ts: now }));
              return {
                chartEditor: {
                  ...editor,
                  currentSpec: nextSpec,
                  history: nextHistory,
                  historyIndex: nextIndex,
                },
                correctionSuggestions: [...s.correctionSuggestions, ...tagged],
              };
            }
          }
        } catch {
          // Non-fatal
        }
      }

      return {
        chartEditor: {
          ...editor,
          currentSpec: nextSpec,
          history: nextHistory,
          historyIndex: nextIndex,
        },
      };
    }),
  initChartEditorSpec: (spec) =>
    set((s) => ({
      chartEditor: {
        ...s.chartEditor,
        currentSpec: spec,
        history: [spec],
        historyIndex: 0,
      },
    })),
  undoChartEditor: () =>
    set((s) => {
      const editor = s.chartEditor;
      if (editor.historyIndex <= 0) return s;
      const nextIndex = editor.historyIndex - 1;
      return {
        chartEditor: {
          ...editor,
          historyIndex: nextIndex,
          currentSpec: editor.history[nextIndex],
        },
      };
    }),
  redoChartEditor: () =>
    set((s) => {
      const editor = s.chartEditor;
      if (editor.historyIndex >= editor.history.length - 1) return s;
      const nextIndex = editor.historyIndex + 1;
      return {
        chartEditor: {
          ...editor,
          historyIndex: nextIndex,
          currentSpec: editor.history[nextIndex],
        },
      };
    }),
  setChartEditorMode: (mode) =>
    set((s) => ({
      chartEditor: { ...s.chartEditor, mode },
    })),

  // --- activeSemanticModel slice (Sub-project D Phase 4c) ----------------
  // Holds the currently-active SemanticModel for the editor. Sibling to
  // chartEditor so history stays spec-scoped. Hydrated via api.listSemanticModels
  // on Inspector mount; semantic field drops resolve against this.
  activeSemanticModel: null,
  availableSemanticModels: [],
  setActiveSemanticModel: (model) => set({ activeSemanticModel: model }),
  setAvailableSemanticModels: (models) =>
    set({ availableSemanticModels: Array.isArray(models) ? models : [] }),

  // --- Semantic Layer connection-scoped slices (D0 Task 5) ---------------
  // linguisticModel: per-connection linguistic overrides (aliases, synonyms, units)
  // colorMap: per-connection series/category → hex color assignments
  // semanticBootstrapStatus: lifecycle of the AI bootstrap call (D1)
  // correctionSuggestions: pending user-authored correction cards (D3)
  linguisticModel: null,
  colorMap: null,
  semanticBootstrapStatus: 'idle',  // idle | loading | done | error
  correctionSuggestions: [],
  setLinguisticModel: (m) => set({ linguisticModel: m }),
  setColorMap: (m) => set({ colorMap: m }),
  setSemanticBootstrapStatus: (s) => set({ semanticBootstrapStatus: s }),
  addCorrectionSuggestion: (s) => set((state) => ({
    correctionSuggestions: [...state.correctionSuggestions, s],
  })),
  dismissCorrectionSuggestion: (id) => set((state) => ({
    correctionSuggestions: state.correctionSuggestions.filter((s) => s.id !== id),
  })),

  // --- featureFlags slice (Phase 4c+1) -----------------------------------
  // Dashboard feature-flag state hydrated from /api/v1/dashboards/feature-flags
  // on app boot. The primary flag is NEW_CHART_EDITOR_ENABLED which gates
  // route-level switching between the legacy DashboardBuilder and the new
  // DashboardShell. Defaults are all-false (legacy path) so production
  // stays unchanged until the server explicitly returns `true`.
  featureFlags: {
    NEW_CHART_EDITOR_ENABLED: false,
  },
  featureFlagsLoaded: false,
  setFeatureFlags: (flags) =>
    set((s) => ({
      featureFlags: { ...s.featureFlags, ...(flags || {}) },
      featureFlagsLoaded: true,
    })),

  // --- Dev-mode tier badge (B5 Task 5) -----------------------------------
  // Toggle with Cmd+Alt+P (Mac) / Ctrl+Alt+P (other). Displays RSR tier,
  // renderer family/backend, streaming mode, downsample info, and reason
  // as a small overlay in the top-right corner of EditorCanvas.
  showTierBadge: false,
  toggleTierBadge: () => set((s) => ({ showTierBadge: !s.showTierBadge })),

  // --- installedChartTypes slice (Sub-project C Tier 2) ------------------
  // Holds the list of user-authored chart types loaded from the backend.
  // Each entry conforms to UserChartType extended with optional Tier 2
  // fields: { tier: 'code', bundle: string } for code-based (iframe) types.
  // Populated via setInstalledChartTypes (called after API fetch on connect
  // or on the chart-type management page). EditorCanvas reads this to route
  // specs carrying a userTypeId to IframeChartHost when tier === 'code'.
  installedChartTypes: [],
  setInstalledChartTypes: (types) =>
    set({ installedChartTypes: Array.isArray(types) ? types : [] }),

  // ── Analyst Pro archetype (Plan 1 + 2) ──
  analystProDashboard: null,
  setAnalystProDashboard: (dashboard) => set({ analystProDashboard: dashboard }),
  analystProSize: { mode: 'automatic' },
  setAnalystProSize: (size) => {
    const dash = get().analystProDashboard;
    if (dash) {
      set({
        analystProDashboard: { ...dash, size },
        analystProSize: size,
      });
    } else {
      set({ analystProSize: size });
    }
  },

  // Plan 2: selection
  analystProSelection: new Set(),
  setAnalystProSelection: (ids) =>
    set({ analystProSelection: new Set(Array.isArray(ids) ? ids : [ids]) }),
  addToSelection: (id) => {
    const next = new Set(get().analystProSelection);
    next.add(id);
    set({ analystProSelection: next });
  },
  removeFromSelection: (id) => {
    const next = new Set(get().analystProSelection);
    next.delete(id);
    set({ analystProSelection: next });
  },
  clearSelection: () => set({ analystProSelection: new Set() }),

  // Plan 2 + 5b: drag state
  //   {
  //     zoneId: string,
  //     parentId: string,
  //     dx: number,
  //     dy: number,
  //     targetContainerId?: string | null,
  //     targetIndex?: number | null,
  //     dropEdge?: 'top' | 'bottom' | 'left' | 'right' | 'center' | null,
  //     activeGuides?: Array<{ axis: 'x'|'y'; position: number; start: number; end: number }>,
  //   }
  analystProDragState: null,
  setAnalystProDragState: (state) => set({ analystProDragState: state }),

  // Plan 2: snap toggle
  analystProSnapEnabled: true,
  setAnalystProSnapEnabled: (enabled) => set({ analystProSnapEnabled: !!enabled }),

  // Plan 6a — canvas view-state (ephemeral, NOT pushed to history)
  analystProCanvasZoom: 1.0,
  analystProCanvasPan: { x: 0, y: 0 },
  analystProRulersVisible: false,
  analystProActiveDevice: 'desktop',
  setCanvasZoomAnalystPro: (zoom, anchor) => set(() => {
    const clamped = Math.max(0.1, Math.min(4.0, Number(zoom) || 1));
    if (!anchor) return { analystProCanvasZoom: clamped };
    const nextPan = {
      x: anchor.screenX - anchor.sheetX * clamped,
      y: anchor.screenY - anchor.sheetY * clamped,
    };
    return { analystProCanvasZoom: clamped, analystProCanvasPan: nextPan };
  }),
  setCanvasPanAnalystPro: (x, y) => set({ analystProCanvasPan: { x: Number(x) || 0, y: Number(y) || 0 } }),
  toggleRulersAnalystPro: () => set((state) => ({ analystProRulersVisible: !state.analystProRulersVisible })),
  setActiveDeviceAnalystPro: (device) => set(() => {
    if (device !== 'desktop' && device !== 'tablet' && device !== 'phone') return {};
    return { analystProActiveDevice: device };
  }),

  // Plan 2: marquee selection rectangle during drag
  analystProMarquee: null,
  setAnalystProMarquee: (rect) => set({ analystProMarquee: rect }),

  // Plan 5a: hovered zone id (set by ZoneFrame onMouseEnter, cleared on leave)
  analystProHoveredZoneId: null,
  setAnalystProHoveredZoneId: (id) =>
    set({ analystProHoveredZoneId: id == null ? null : String(id) }),

  // Plan 5c: right-click context menu.
  // `items` is computed eagerly by openContextMenuAnalystPro via
  // buildContextMenu(zone, dashboard, selection) — kept in state so
  // ContextMenu.jsx stays purely presentational.
  analystProContextMenu: null,
  openContextMenuAnalystPro: (x, y, zoneId) => {
    const dash = get().analystProDashboard;
    const selection = get().analystProSelection;
    const zone = zoneId == null ? null : findZoneById(dash, zoneId);
    const items = buildContextMenu(zone, dash, selection);
    set({
      analystProContextMenu: {
        x: Number(x) || 0,
        y: Number(y) || 0,
        zoneId: zoneId == null ? null : String(zoneId),
        items,
      },
    });
  },
  closeContextMenuAnalystPro: () => set({ analystProContextMenu: null }),

  // Plan 5d: which inspector tab is active ('layout' | 'style' | 'visibility').
  // Persists across selection changes so switching zones keeps the user's tab.
  // null = never touched; UI defaults to 'layout' on render.
  analystProPropertiesTab: null,
  setPropertiesTabAnalystPro: (tab) => {
    if (tab !== 'layout' && tab !== 'style' && tab !== 'visibility') return;
    set({ analystProPropertiesTab: tab });
  },
  // Used by Plan 5c context menu: "Background…"/"Border…"/"Padding…" items
  // dispatch openPropertiesTabAnalystPro('style'); layout items dispatch 'layout'.
  // Effect is identical to setPropertiesTabAnalystPro today; kept as a distinct
  // verb so Phase 6c (tabbed sidebar) can hook "also focus the right rail" later.
  openPropertiesTabAnalystPro: (tab) => {
    if (tab !== 'layout' && tab !== 'style' && tab !== 'visibility') return;
    set({ analystProPropertiesTab: tab });
  },

  // Plan 5c: minimal zone clipboard shim (full subtree semantics — Plan 5e).
  // Stores a structured clone of the zone so Paste produces an independent tree.
  analystProZoneClipboard: null,
  copyZoneToClipboardAnalystPro: (zone) => {
    if (!zone) return;
    const clone = JSON.parse(JSON.stringify(zone));
    set({ analystProZoneClipboard: clone });
  },
  clearZoneClipboardAnalystPro: () => set({ analystProZoneClipboard: null }),

  // Plan 3: Actions runtime
  analystProActionCascadeToken: 0,
  analystProActionsDialogOpen: false,
  analystProActiveCascadeTargets: {},

  setActionsDialogOpen: (open) => set({ analystProActionsDialogOpen: !!open }),

  addActionAnalystPro: (action) => {
    const dash = get().analystProDashboard;
    if (!dash) return;
    const nextDash = { ...dash, actions: [...(dash.actions || []), action] };
    set({ analystProDashboard: nextDash });
    get().pushAnalystProHistory(nextDash, 'Add action');
  },

  updateActionAnalystPro: (actionId, patch) => {
    const dash = get().analystProDashboard;
    if (!dash) return;
    const next = (dash.actions || []).map((a) => (a.id === actionId ? { ...a, ...patch } : a));
    const nextDash = { ...dash, actions: next };
    set({ analystProDashboard: nextDash });
    get().pushAnalystProHistory(nextDash, 'Update action');
  },

  deleteActionAnalystPro: (actionId) => {
    const dash = get().analystProDashboard;
    if (!dash) return;
    const next = (dash.actions || []).filter((a) => a.id !== actionId);
    const nextDash = { ...dash, actions: next };
    set({ analystProDashboard: nextDash });
    get().pushAnalystProHistory(nextDash, 'Delete action');
  },

  fireActionCascadeAnalystPro: () => {
    const token = get().analystProActionCascadeToken + 1;
    set({ analystProActionCascadeToken: token, analystProActiveCascadeTargets: {} });
    return token;
  },

  markCascadeTargetStatus: (sheetId, status, token) => {
    if (token !== get().analystProActionCascadeToken) return;
    set((s) => ({
      analystProActiveCascadeTargets: {
        ...s.analystProActiveCascadeTargets,
        [sheetId]: status,
      },
    }));
  },

  // Plan 4a: per-sheet filter + highlight state driven by action cascade.
  // Shape: { [sheetId]: [{ field, op, value }] } for filters,
  //        { [sheetId]: { [field]: value } } for highlights.
  analystProSheetFilters: {},
  analystProSheetHighlights: {},

  setSheetFilterAnalystPro: (sheetId, filters) => {
    if (!sheetId) return;
    const normalized = Array.isArray(filters) ? filters : [];
    set((s) => ({
      analystProSheetFilters: {
        ...s.analystProSheetFilters,
        [sheetId]: normalized,
      },
    }));
  },

  clearSheetFilterAnalystPro: (sheetId) => {
    if (!sheetId) return;
    set((s) => {
      if (!(sheetId in s.analystProSheetFilters)) return s;
      const next = { ...s.analystProSheetFilters };
      delete next[sheetId];
      return { analystProSheetFilters: next };
    });
  },

  clearAllSheetFiltersAnalystPro: () =>
    set({ analystProSheetFilters: {} }),

  setSheetHighlightAnalystPro: (sheetId, fieldValues) => {
    if (!sheetId) return;
    set((s) => ({
      analystProSheetHighlights: {
        ...s.analystProSheetHighlights,
        [sheetId]: fieldValues && typeof fieldValues === 'object' ? fieldValues : {},
      },
    }));
  },

  clearSheetHighlightAnalystPro: (sheetId) => {
    if (!sheetId) return;
    set((s) => {
      if (!(sheetId in s.analystProSheetHighlights)) return s;
      const next = { ...s.analystProSheetHighlights };
      delete next[sheetId];
      return { analystProSheetHighlights: next };
    });
  },

  clearAllSheetHighlightsAnalystPro: () =>
    set({ analystProSheetHighlights: {} }),

  // Plan 4b: Sets subsystem.
  // Sets live inside analystProDashboard.sets so the existing save/load path
  // carries them for free. Every mutation pushes onto analystProHistory —
  // undo/redo covers every set edit.

  addSetAnalystPro: (newSet) => {
    const dash = get().analystProDashboard;
    if (!dash || !newSet || !newSet.id) return;
    const existing = dash.sets || [];
    const nextDash = { ...dash, sets: [...existing, newSet] };
    set({ analystProDashboard: nextDash });
    get().pushAnalystProHistory(nextDash, 'Add set');
  },

  updateSetAnalystPro: (setId, patch) => {
    const dash = get().analystProDashboard;
    if (!dash || !setId || !patch) return;
    const existing = dash.sets || [];
    const next = existing.map((s) => (s.id === setId ? { ...s, ...patch } : s));
    const nextDash = { ...dash, sets: next };
    set({ analystProDashboard: nextDash });
    get().pushAnalystProHistory(nextDash, 'Update set');
  },

  renameSetAnalystPro: (setId, name) => {
    get().updateSetAnalystPro(setId, { name });
  },

  deleteSetAnalystPro: (setId) => {
    const dash = get().analystProDashboard;
    if (!dash || !setId) return;
    const existing = dash.sets || [];
    const next = existing.filter((s) => s.id !== setId);
    const nextDash = { ...dash, sets: next };
    set({ analystProDashboard: nextDash });
    get().pushAnalystProHistory(nextDash, 'Delete set');
  },

  applySetChangeAnalystPro: (setId, mode, members) => {
    const dash = get().analystProDashboard;
    if (!dash || !setId) return;
    const existing = dash.sets || [];
    const target = existing.find((s) => s.id === setId);
    if (!target) return;
    const nextSet = applySetChange(target, members || [], mode);
    const next = existing.map((s) => (s.id === setId ? nextSet : s));
    const nextDash = { ...dash, sets: next };
    set({ analystProDashboard: nextDash });
    get().pushAnalystProHistory(nextDash, 'Change set members');
  },

  // Plan 4c: Parameters subsystem. Parameters live inside
  // analystProDashboard.parameters so the existing save/load path carries
  // them for free. Every mutation also pushes an undo snapshot.

  addParameterAnalystPro: (param) => {
    const dash = get().analystProDashboard;
    if (!dash || !param || !param.id || !param.name) return;
    const existing = dash.parameters || [];
    const check = validateParamName(param.name, existing);
    if (!check.ok) return;
    const nextDash = { ...dash, parameters: [...existing, param] };
    set({ analystProDashboard: nextDash });
    get().pushAnalystProHistory(nextDash, 'Add parameter');
  },

  updateParameterAnalystPro: (paramId, patch) => {
    const dash = get().analystProDashboard;
    if (!dash || !paramId || !patch) return;
    const existing = dash.parameters || [];
    const target = existing.find((p) => p.id === paramId);
    if (!target) return;
    if (patch.name) {
      const check = validateParamName(patch.name, existing, paramId);
      if (!check.ok) return;
    }
    const nextParam = { ...target, ...patch };
    const next = existing.map((p) => (p.id === paramId ? nextParam : p));
    const nextDash = { ...dash, parameters: next };
    set({ analystProDashboard: nextDash });
    get().pushAnalystProHistory(nextDash, 'Update parameter');
  },

  deleteParameterAnalystPro: (paramId) => {
    const dash = get().analystProDashboard;
    if (!dash || !paramId) return;
    const existing = dash.parameters || [];
    const next = existing.filter((p) => p.id !== paramId);
    const nextDash = { ...dash, parameters: next };
    set({ analystProDashboard: nextDash });
    get().pushAnalystProHistory(nextDash, 'Delete parameter');
  },

  setParameterValueAnalystPro: (paramId, rawValue) => {
    const dash = get().analystProDashboard;
    if (!dash || !paramId) return;
    const existing = dash.parameters || [];
    const target = existing.find((p) => p.id === paramId);
    if (!target) return;
    let coerced;
    try {
      coerced = coerceValue(target.type, rawValue);
    } catch {
      return;
    }
    const domainCheck = validateAgainstDomain(target, coerced);
    if (!domainCheck.ok) return;
    const nextParam = { ...target, value: coerced };
    const next = existing.map((p) => (p.id === paramId ? nextParam : p));
    const nextDash = { ...dash, parameters: next };
    set({ analystProDashboard: nextDash });
    get().pushAnalystProHistory(nextDash, 'Change parameter value');
  },

  // Plan 6b: history buffer — entries of { snapshot, operation, timestamp }.
  // Single workbook-level stack (Build_Tableau.md §XVII.1). Each push = one
  // WorkbookCommittedEdit-equivalent (§I.4). Cap 500; panel shows newest 50.
  analystProHistory: null,
  initAnalystProHistory: (dashboard) => {
    const entry = { snapshot: dashboard, operation: 'Initial state', timestamp: Date.now() };
    set({ analystProHistory: { past: [], present: entry, future: [], maxEntries: 500 } });
  },
  pushAnalystProHistory: (dashboard, operation = 'Edit dashboard') => {
    const h = get().analystProHistory;
    const entry = { snapshot: dashboard, operation, timestamp: Date.now() };
    if (!h) {
      set({ analystProHistory: { past: [], present: entry, future: [], maxEntries: 500 } });
      return;
    }
    const past = [h.present, ...h.past].slice(0, h.maxEntries);
    set({ analystProHistory: { ...h, past, present: entry, future: [] } });
  },
  undoAnalystPro: () => {
    const h = get().analystProHistory;
    if (!h || h.past.length === 0) return;
    const [prev, ...restPast] = h.past;
    set({
      analystProHistory: { ...h, past: restPast, present: prev, future: [h.present, ...h.future] },
      analystProDashboard: prev.snapshot,
    });
  },
  redoAnalystPro: () => {
    const h = get().analystProHistory;
    if (!h || h.future.length === 0) return;
    const [next, ...restFuture] = h.future;
    set({
      analystProHistory: { ...h, past: [h.present, ...h.past], present: next, future: restFuture },
      analystProDashboard: next.snapshot,
    });
  },
  jumpToHistoryAnalystPro: (index) => {
    const h = get().analystProHistory;
    if (!h) return;
    if (!Number.isInteger(index) || index < 0 || index >= h.past.length) return;
    const newPresent = h.past[index];
    // Entries newer than newPresent in past (in time-ascending order) roll onto
    // future, followed by the old present, then any pre-existing future. First
    // redo step walks toward the original present.
    const newer = h.past.slice(0, index).reverse();
    const future = [...newer, h.present, ...h.future];
    const newPast = h.past.slice(index + 1);
    set({
      analystProHistory: { ...h, past: newPast, present: newPresent, future },
      analystProDashboard: newPresent.snapshot,
    });
  },

  // Plan 2b: layout overlay toggle
  analystProLayoutOverlay: false,
  toggleLayoutOverlayAnalystPro: () =>
    set((s) => ({ analystProLayoutOverlay: !s.analystProLayoutOverlay })),

  // Plan 6b: history inspector panel visibility — ephemeral view-state.
  analystProHistoryPanelOpen: false,
  toggleHistoryPanelAnalystPro: () =>
    set((s) => ({ analystProHistoryPanelOpen: !s.analystProHistoryPanelOpen })),

  // Plan 2b: alignment + distribute
  alignSelectionAnalystPro: (op) => {
    const { analystProDashboard: dash, analystProSelection: sel } = get();
    if (!dash || sel.size < 2) return;
    const selected = dash.floatingLayer.filter((z) => sel.has(z.id));
    if (selected.length < 2) return;
    const aligned = alignZones(selected, op);
    const alignedMap = new Map(aligned.map((z) => [z.id, z]));
    const nextFloating = dash.floatingLayer.map((z) => alignedMap.get(z.id) || z);
    const nextDash = { ...dash, floatingLayer: nextFloating };
    set({ analystProDashboard: nextDash });
    get().pushAnalystProHistory(nextDash, 'Align zones');
  },

  distributeSelectionAnalystPro: (axis) => {
    const { analystProDashboard: dash, analystProSelection: sel } = get();
    if (!dash || sel.size < 3) return;
    const selected = dash.floatingLayer.filter((z) => sel.has(z.id));
    if (selected.length < 3) return;
    const distributed = distributeZones(selected, axis);
    const distMap = new Map(distributed.map((z) => [z.id, z]));
    const nextFloating = dash.floatingLayer.map((z) => distMap.get(z.id) || z);
    const nextDash = { ...dash, floatingLayer: nextFloating };
    set({ analystProDashboard: nextDash });
    get().pushAnalystProHistory(nextDash, 'Distribute zones');
  },

  // Plan 2b: group / ungroup
  groupSelectionAnalystPro: () => {
    const { analystProDashboard: dash, analystProSelection: sel } = get();
    if (!dash || sel.size < 2) return;
    const result = groupSelection(dash.tiledRoot, [...sel]);
    if (!result.newContainerId) return;
    const nextDash = { ...dash, tiledRoot: result.root };
    set({
      analystProDashboard: nextDash,
      analystProSelection: new Set([result.newContainerId]),
    });
    get().pushAnalystProHistory(nextDash, 'Group zones');
  },

  ungroupAnalystPro: (containerId) => {
    const { analystProDashboard: dash } = get();
    if (!dash) return;
    const nextRoot = ungroupContainer(dash.tiledRoot, containerId);
    if (nextRoot === dash.tiledRoot) return;
    const nextDash = { ...dash, tiledRoot: nextRoot };
    set({ analystProDashboard: nextDash });
    get().pushAnalystProHistory(nextDash, 'Ungroup container');
  },

  // Plan 2b: lock toggle
  toggleLockAnalystPro: (zoneId) => {
    const { analystProDashboard: dash } = get();
    if (!dash) return;
    const inFloating = dash.floatingLayer.some((z) => z.id === zoneId);
    if (inFloating) {
      const nextFloating = toggleLockFloating(dash.floatingLayer, zoneId);
      if (nextFloating === dash.floatingLayer) return;
      const nextDash = { ...dash, floatingLayer: nextFloating };
      set({ analystProDashboard: nextDash });
      get().pushAnalystProHistory(nextDash, 'Toggle zone lock');
    } else {
      const nextRoot = toggleLock(dash.tiledRoot, zoneId);
      if (nextRoot === dash.tiledRoot) return;
      const nextDash = { ...dash, tiledRoot: nextRoot };
      set({ analystProDashboard: nextDash });
      get().pushAnalystProHistory(nextDash, 'Toggle zone lock');
    }
  },

  // Plan 2b: insert a new floating zone from the object library
  insertObjectAnalystPro: ({ type, x, y }) => {
    const { analystProDashboard: dash } = get();
    if (!dash) return;
    const isContainer = type === 'container-horz' || type === 'container-vert';
    const defaultSize =
      type === 'webpage' || isContainer ? { pxW: 480, pxH: 320 } : { pxW: 320, pxH: 200 };
    const maxZ = dash.floatingLayer.reduce((m, z) => Math.max(m, z.zIndex || 0), 0);
    const id = generateZoneId();
    let newZone;
    if (isContainer) {
      newZone = {
        id,
        type,
        w: 0,
        h: 0,
        floating: true,
        x,
        y,
        pxW: defaultSize.pxW,
        pxH: defaultSize.pxH,
        zIndex: maxZ + 1,
        children: [
          { id: generateZoneId(), type: 'blank', w: 100000, h: 100000 },
        ],
      };
    } else {
      newZone = {
        id,
        type,
        w: 0,
        h: 0,
        floating: true,
        x,
        y,
        pxW: defaultSize.pxW,
        pxH: defaultSize.pxH,
        zIndex: maxZ + 1,
      };
    }
    const nextDash = {
      ...dash,
      floatingLayer: [...dash.floatingLayer, newZone],
    };
    set({
      analystProDashboard: nextDash,
      analystProSelection: new Set([id]),
    });
    get().pushAnalystProHistory(nextDash, 'Insert object');
  },

  // Plan 2b: update zone displayName (or other patches)
  updateZoneAnalystPro: (zoneId, patch) => {
    const { analystProDashboard: dash } = get();
    if (!dash) return;
    // Try floating first
    const floatingIdx = dash.floatingLayer.findIndex((z) => z.id === zoneId);
    let nextDash = dash;
    if (floatingIdx >= 0) {
      const next = [...dash.floatingLayer];
      next[floatingIdx] = { ...next[floatingIdx], ...patch };
      nextDash = { ...dash, floatingLayer: next };
    } else {
      // Walk tiled tree and patch the zone if found.
      const patchInTree = (zone) => {
        if (zone.id === zoneId) return { ...zone, ...patch };
        if (zone.children) {
          const nextChildren = zone.children.map(patchInTree);
          if (nextChildren.some((c, i) => c !== zone.children[i])) {
            return { ...zone, children: nextChildren };
          }
        }
        return zone;
      };
      const nextRoot = patchInTree(dash.tiledRoot);
      if (nextRoot === dash.tiledRoot) return;
      nextDash = { ...dash, tiledRoot: nextRoot };
    }
    set({ analystProDashboard: nextDash });
    get().pushAnalystProHistory(nextDash, 'Update zone');
  },

  // Plan 5d: patch arbitrary zone fields (innerPadding, outerPadding, background,
  // border, showTitle, showCaption, fitMode, ...). Deep-equal short-circuit
  // prevents slider-drag sprays from flooding the 500-entry history stack.
  setZonePropertyAnalystPro: (zoneId, patch) => {
    const { analystProDashboard: dash } = get();
    if (!dash || !zoneId || !patch || typeof patch !== 'object') return;

    const isSameValue = (a, b) => {
      if (a === b) return true;
      if (a == null || b == null) return false;
      if (typeof a !== 'object' || typeof b !== 'object') return false;
      try {
        return JSON.stringify(a) === JSON.stringify(b);
      } catch {
        return false;
      }
    };
    const patchMatches = (zone) =>
      Object.keys(patch).every((k) => isSameValue(zone[k], patch[k]));

    const floatingIdx = dash.floatingLayer.findIndex((z) => z.id === zoneId);
    let nextDash = dash;
    if (floatingIdx >= 0) {
      const current = dash.floatingLayer[floatingIdx];
      if (patchMatches(current)) return;
      const nextFloating = [...dash.floatingLayer];
      nextFloating[floatingIdx] = { ...current, ...patch };
      nextDash = { ...dash, floatingLayer: nextFloating };
    } else {
      let found = false;
      const patchInTree = (zone) => {
        if (found) return zone;
        if (zone.id === zoneId) {
          found = true;
          if (patchMatches(zone)) return zone;
          return { ...zone, ...patch };
        }
        if (zone.children) {
          const nextChildren = zone.children.map(patchInTree);
          if (nextChildren.some((c, i) => c !== zone.children[i])) {
            return { ...zone, children: nextChildren };
          }
        }
        return zone;
      };
      const nextRoot = patchInTree(dash.tiledRoot);
      if (nextRoot === dash.tiledRoot) return;
      nextDash = { ...dash, tiledRoot: nextRoot };
    }
    set({ analystProDashboard: nextDash });
    get().pushAnalystProHistory(nextDash, 'Change zone property');
  },

  // Plan 4e: tree drag-to-reorder
  reorderZoneAnalystPro: (sourceId, targetId, position) => {
    const { analystProDashboard: dash } = get();
    if (!dash) return;
    const nextRoot = reorderZone(dash.tiledRoot, sourceId, targetId, position);
    if (nextRoot === dash.tiledRoot) return;
    const nextDash = { ...dash, tiledRoot: nextRoot };
    set({ analystProDashboard: nextDash });
    get().pushAnalystProHistory(nextDash, 'Reorder zone');
  },

  // Plan 5b: drop-into-container-at-index (canvas cross-container drag).
  moveZoneAcrossContainersAnalystPro: (sourceId, targetContainerId, targetIndex) => {
    const { analystProDashboard: dash } = get();
    if (!dash?.tiledRoot) return;
    const nextRoot = moveZoneAcrossContainers(dash.tiledRoot, sourceId, targetContainerId, targetIndex);
    if (nextRoot === dash.tiledRoot) return;
    const nextDash = { ...dash, tiledRoot: nextRoot };
    set({ analystProDashboard: nextDash });
    get().pushAnalystProHistory(nextDash, 'Move zone across containers');
  },

  // Plan 5b: drop-on-edge wrap. Removes source from its current location, then
  // wraps target + source in a new split container sized to inherit target's
  // parent-axis proportion.
  wrapInContainerAnalystPro: (targetZoneId, sourceZone, side) => {
    const { analystProDashboard: dash } = get();
    if (!dash?.tiledRoot) return;
    if (!sourceZone?.id) return;
    const afterRemove = removeChild(dash.tiledRoot, sourceZone.id);
    const nextRoot = wrapInContainer(afterRemove, targetZoneId, sourceZone, side);
    if (nextRoot === dash.tiledRoot) return;
    const nextDash = { ...dash, tiledRoot: nextRoot };
    set({ analystProDashboard: nextDash });
    get().pushAnalystProHistory(nextDash, 'Wrap in container');
  },
}));
