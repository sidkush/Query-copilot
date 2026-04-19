import { create } from "zustand";
import { detectCorrections } from "./chart-ir";
import { alignZones, distributeZones } from "./components/dashboard/freeform/lib/alignmentOps";
import { groupSelection, ungroupContainer, toggleLock, toggleLockFloating, reorderZone, moveZoneAcrossContainers, wrapInContainer, removeChild, insertChild, distributeEvenly, fitContainerToContent, removeContainer, resizeZone } from "./components/dashboard/freeform/lib/zoneTreeOps";
import { resolveLayout } from "./components/dashboard/freeform/lib/layoutResolver";
import { generateZoneId } from "./components/dashboard/freeform/lib/zoneTree";
import { applySetChange } from './components/dashboard/freeform/lib/setOps';
import { buildContextMenu } from './components/dashboard/freeform/lib/contextMenuBuilder';
import {
  validateParamName,
  coerceValue,
  validateAgainstDomain,
} from './components/dashboard/freeform/lib/parameterOps';
import { applyPreset } from './components/dashboard/presets/applyPreset';
import { emptyDashboardForPreset } from './components/dashboard/freeform/lib/dashboardShape';
import { api } from './api';

let _themeTimer = null;

// ── TSS W3-A — inline SSE parser ─────────────────────────────────────────
// Consumes a ReadableStream of `data: {json}\n\n` frames and yields parsed
// payloads. Malformed frames are silently skipped — the autogen pipeline
// emits heartbeats + tool-level events, and we only care about the typed
// ones. `saveDashboardAndAutogen` is the only consumer today; keeping the
// helper inline (rather than lifting to a util file) matches the existing
// `rebuildAllPresets` inline-stub convention.
async function* _parseSSE(stream) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const frames = buf.split('\n\n');
    buf = frames.pop() || '';
    for (const frame of frames) {
      const line = frame.split('\n').find((l) => l.startsWith('data: '));
      if (!line) continue;
      try {
        yield JSON.parse(line.slice(6));
      } catch {
        /* ignore malformed frames */
      }
    }
  }
}

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

  // ── Preset infrastructure (Plan A — Wave 3, Task 9) ──
  // switchPreset delegates to the pure applyPreset helper which swaps
  // activePresetId and seeds presetLayouts[id] from the preset's starter
  // template on first entry. persistPresetLayout saves the current zone
  // tree under the active preset key so re-entering a preset restores
  // whatever the user last edited.
  switchPreset: (presetId) => {
    const d = get().analystProDashboard ?? emptyDashboardForPreset(presetId);
    set({ analystProDashboard: applyPreset(d, presetId) });
  },
  persistPresetLayout: (serialized) => {
    const d = get().analystProDashboard;
    if (!d) return;
    const id = d.activePresetId;
    set({
      analystProDashboard: {
        ...d,
        presetLayouts: { ...d.presetLayouts, [id]: serialized },
      },
    });
  },

  // ── Typed-Seeking-Spring W2-C — preset-autogen progress ──
  // Drives the DashboardShell progress chip + the RebuildButton confirm
  // flow. `done` / `total` count preset-mode completion (0-5) and
  // `activePresets` is the list currently being generated (used by the
  // chip subtitle + by W2-A to know which SSE stream is in flight).
  // Defaults to the empty shape so any component reading it pre-wiring
  // sees "nothing running" and renders nothing.
  autogenProgress: { done: 0, total: 0, activePresets: [] },
  setAutogenProgress: (progress) => {
    const safe = progress && typeof progress === 'object' ? progress : {};
    set({
      autogenProgress: {
        done: Number.isFinite(safe.done) ? safe.done : 0,
        total: Number.isFinite(safe.total) ? safe.total : 0,
        activePresets: Array.isArray(safe.activePresets) ? safe.activePresets : [],
      },
    });
  },

  /**
   * rebuildAllPresets — kick a full regeneration of every preset's
   * binding set for the active dashboard. W2-A will land the
   * `api.autogenAllPresets` helper + the POST /dashboards/{id}/
   * autogen-all-presets route; this stub wires the SSE consumption so
   * the UI can sit on top of it today. Until W2-A merges, this resolves
   * without touching the server — it just flips bindingAutogenState
   * through the lifecycle so the chip demo renders.
   *
   * TODO (W2-A): replace the inline fetch stub with
   * `import { autogenAllPresets } from '../../api'` — that helper will
   * POST to `/api/v1/dashboards/{id}/autogen-all-presets` and yield SSE
   * events that update `autogenProgress` as each preset lands.
   */
  rebuildAllPresets: async ({ skipPinned = true } = {}) => {
    const dash = get().analystProDashboard;
    if (!dash) return;
    const dashboardId = dash.id || get().activeDashboardId;
    const boundConnId = dash.boundConnId || get().activeConnId;
    const semanticTags = dash.semanticTags || {};
    if (!dashboardId || !boundConnId) return;

    set({
      analystProDashboard: { ...dash, bindingAutogenState: 'running' },
      autogenProgress: { done: 0, total: 5, activePresets: [] },
    });

    try {
      // TODO(W2-A): replace with api.autogenAllPresets(dashboardId, body).
      // For now we issue a raw fetch so the wiring is complete and the
      // SSE shape matches the backend contract.
      const token = get().token;
      const response = await fetch(
        `/api/v1/dashboards/${encodeURIComponent(dashboardId)}/autogen-all-presets`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            conn_id: boundConnId,
            semantic_tags: semanticTags,
            skip_pinned: skipPinned,
          }),
        },
      );

      if (!response.ok || !response.body) {
        throw new Error(`autogen-all-presets failed: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      // Basic SSE line reader — W2-A will ship a richer parser that
      // reuses agent_routes' AgentStep shape; this just pulls "data: {…}"
      // frames and forwards progress snapshots.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const dataLine = frame
            .split('\n')
            .find((l) => l.startsWith('data:'));
          if (!dataLine) continue;
          try {
            const payload = JSON.parse(dataLine.slice(5).trim());
            if (payload?.type === 'progress' && payload.progress) {
              get().setAutogenProgress(payload.progress);
            }
          } catch {
            // Ignore malformed frames — W2-A hardens this path.
          }
        }
      }

      const latest = get().analystProDashboard;
      set({
        analystProDashboard: latest
          ? { ...latest, bindingAutogenState: 'complete' }
          : latest,
      });
    } catch (err) {
      const latest = get().analystProDashboard;
      set({
        analystProDashboard: latest
          ? {
              ...latest,
              bindingAutogenState: 'error',
              bindingAutogenError: err?.message || String(err),
            }
          : latest,
      });
    }
  },

  // ── TSS W3-A — Save-new-dashboard flow ──────────────────────────────
  // `saveDashboardDialogOpen` toggles the SaveDashboardDialog modal;
  // `semanticTagWizardOpen` toggles the 5-question wizard that writes
  // into dashboard.semanticTags before autogen fires.
  saveDashboardDialogOpen: false,
  openSaveDashboardDialog: () => set({ saveDashboardDialogOpen: true }),
  closeSaveDashboardDialog: () => set({ saveDashboardDialogOpen: false }),

  semanticTagWizardOpen: false,
  // `semanticTagWizardContext` carries { dashboardId, connId, schemaProfile }
  // for the wizard; null when the wizard is not mounted.
  semanticTagWizardContext: null,
  openSemanticTagWizard: (ctx) =>
    set({ semanticTagWizardOpen: true, semanticTagWizardContext: ctx || null }),
  closeSemanticTagWizard: () =>
    set({ semanticTagWizardOpen: false, semanticTagWizardContext: null }),

  /**
   * saveDashboardAndAutogen — the orchestrator behind the "Save & Build"
   * button in SaveDashboardDialog.
   *
   * Two entry paths:
   *   A. Initial call from the dialog — { name, connId, runSmartBuild,
   *      tags: {} }. Creates the dashboard, persists the binding, opens
   *      the wizard (when runSmartBuild && tags is empty).
   *   B. Wizard onComplete — { dashboardId, connId, tags: {...} }.
   *      Skips the create step; fires autogen directly with the
   *      collected tags.
   *
   * Flow (path A):
   *   1. Create dashboard server-side via api.createDashboard(name).
   *   2. Persist boundConnId via api.saveDashboardBinding (best-effort).
   *   3. Mirror into analystProDashboard.
   *   4. If runSmartBuild and no tags yet → open wizard, return.
   *   5. Otherwise pipe through the autogen SSE stream.
   *
   * Returns the dashboardId for convenience.
   */
  saveDashboardAndAutogen: async ({
    name,
    connId,
    runSmartBuild = true,
    tags = null,
    dashboardId: dashboardIdIn = null,
  }) => {
    if (!connId) return null;

    // Path B — wizard onComplete already has dashboardId + tags. Skip
    // the create/bind steps and go straight to autogen.
    let dashboardId = dashboardIdIn;
    let serverDash = null;

    if (!dashboardId) {
      if (!name) return null;
      // Step 1 — create the dashboard on the backend.
      try {
        serverDash = await api.createDashboard(name);
        dashboardId = serverDash?.id || serverDash?.dashboard_id || null;
      } catch (err) {
        set({
          analystProDashboard: {
            ...(get().analystProDashboard || emptyDashboardForPreset('analyst-pro')),
            bindingAutogenState: 'error',
            bindingAutogenError: err?.message || 'Failed to create dashboard',
          },
        });
        return null;
      }

      // Step 2 — persist the connection binding. Best-effort: if the
      // backend does not yet accept PATCH for this field, we still
      // mirror it locally so the UI proceeds.
      if (dashboardId) {
        try {
          await api.saveDashboardBinding(dashboardId, {
            boundConnId: connId,
            semanticTags: tags || {},
          });
        } catch {
          /* non-fatal — local state below still carries the binding */
        }
      }

      // Step 3 — mirror into analystProDashboard.
      const prior = get().analystProDashboard || emptyDashboardForPreset('analyst-pro');
      const nextDash = {
        ...prior,
        ...(serverDash || {}),
        id: dashboardId,
        name,
        boundConnId: connId,
        semanticTags: tags || prior.semanticTags || {},
        bindingAutogenState: runSmartBuild ? 'queued' : (prior.bindingAutogenState || null),
      };
      set({ analystProDashboard: nextDash, activeConnId: connId });

      if (!runSmartBuild) return dashboardId;

      // Step 4 — open wizard when we need tags. Wizard context carries
      // dashboardId + name so onComplete can re-enter this action
      // directly without going back through the dialog.
      if (tags === null || (tags && Object.keys(tags).length === 0 && runSmartBuild)) {
        let schemaProfile = null;
        try {
          schemaProfile = await api.getSchemaProfile(connId);
        } catch {
          /* non-fatal — wizard renders empty and user skips through */
        }
        set({
          semanticTagWizardOpen: true,
          semanticTagWizardContext: {
            dashboardId,
            connId,
            schemaProfile,
            dashboardName: name,
          },
        });
        return dashboardId;
      }
    } else {
      // Path B — carry new tags onto the existing dashboard record.
      const prior = get().analystProDashboard || emptyDashboardForPreset('analyst-pro');
      set({
        analystProDashboard: {
          ...prior,
          id: dashboardId,
          boundConnId: connId,
          semanticTags: tags || {},
          bindingAutogenState: 'queued',
        },
      });
      // Persist tags onto the backend (best-effort).
      try {
        await api.saveDashboardBinding(dashboardId, {
          semanticTags: tags || {},
        });
      } catch {
        /* non-fatal */
      }
    }

    // Step 5 — fire autogen. Tags may be {} (pure heuristics) — the
    // backend falls back to schema-only inference.
    set({
      analystProDashboard: { ...get().analystProDashboard, bindingAutogenState: 'running' },
      autogenProgress: { done: 0, total: 5, activePresets: [] },
    });
    try {
      const stream = await api.autogenAllPresets(dashboardId, {
        conn_id: connId,
        semantic_tags: tags || {},
      });
      if (stream) {
        for await (const payload of _parseSSE(stream)) {
          const type = payload?.type;
          if (type === 'progress' && payload.progress) {
            get().setAutogenProgress(payload.progress);
          } else if (type === 'tool_result') {
            // Each completed preset emits a tool_result; bump the done
            // counter if the payload carries it, otherwise increment.
            const prog = get().autogenProgress;
            const done = Number.isFinite(payload.progress?.done)
              ? payload.progress.done
              : Math.min((prog.done || 0) + 1, prog.total || 5);
            get().setAutogenProgress({
              done,
              total: prog.total || 5,
              activePresets: payload.progress?.activePresets || prog.activePresets || [],
            });
          } else if (type === 'complete') {
            const latest = get().analystProDashboard;
            set({
              analystProDashboard: latest
                ? { ...latest, bindingAutogenState: 'complete' }
                : latest,
            });
          } else if (type === 'error') {
            const latest = get().analystProDashboard;
            set({
              analystProDashboard: latest
                ? {
                    ...latest,
                    bindingAutogenState: 'error',
                    bindingAutogenError: payload?.message || 'Autogen error',
                  }
                : latest,
            });
          }
        }
        // Stream drained without an explicit `complete` frame — treat as
        // success so the UI does not hang on 'running'.
        const final = get().analystProDashboard;
        if (final && final.bindingAutogenState === 'running') {
          set({
            analystProDashboard: { ...final, bindingAutogenState: 'complete' },
          });
        }
      }
    } catch (err) {
      const latest = get().analystProDashboard;
      set({
        analystProDashboard: latest
          ? {
              ...latest,
              bindingAutogenState: 'error',
              bindingAutogenError: err?.message || String(err),
            }
          : latest,
      });
    }
    return dashboardId;
  },

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

  // Plan 6c — tabbed sidebar state
  analystProSidebarTab: 'dashboard',                 // 'dashboard' | 'layout'
  analystProSidebarCollapsed: new Set(),             // Set<string> of collapsed section ids
  setSidebarTabAnalystPro: (tab) => {
    if (tab !== 'dashboard' && tab !== 'layout') return;
    if (get().analystProSidebarTab === tab) return;
    set({ analystProSidebarTab: tab });
  },
  toggleSidebarSectionAnalystPro: (sectionId) => {
    if (typeof sectionId !== 'string' || sectionId.length === 0) return;
    const current = get().analystProSidebarCollapsed;
    const next = new Set(current);
    if (next.has(sectionId)) next.delete(sectionId);
    else next.add(sectionId);
    set({ analystProSidebarCollapsed: next });
  },

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

  viewDataDrawer: {
    open: false,
    sheetId: null,
    connId: null,
    sql: null,
    markSelection: {},
  },

  openViewDataDrawer: ({ sheetId, connId, sql, markSelection } = {}) => {
    if (!sheetId || !sql) return;
    set({
      viewDataDrawer: {
        open: true,
        sheetId,
        connId: connId ?? null,
        sql,
        markSelection: markSelection && typeof markSelection === 'object' ? markSelection : {},
      },
    });
  },

  closeViewDataDrawer: () =>
    set({
      viewDataDrawer: {
        open: false,
        sheetId: null,
        connId: null,
        sql: null,
        markSelection: {},
      },
    }),

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

  // Plan 5e: Distribute Evenly — equal-share override on container children.
  distributeEvenlyAnalystPro: (containerId) => {
    const { analystProDashboard: dash } = get();
    if (!dash?.tiledRoot || !containerId) return;
    const nextRoot = distributeEvenly(dash.tiledRoot, containerId);
    if (nextRoot === dash.tiledRoot) return;
    const nextDash = { ...dash, tiledRoot: nextRoot };
    set({ analystProDashboard: nextDash });
    get().pushAnalystProHistory(nextDash, 'Distribute evenly');
  },

  // Plan 5e: Fit to Content — write sizeOverride from DOM-measured child sizes.
  // Resolver-side honouring for tiled containers lands in Plan 7a; floating
  // containers already respect pxW/pxH.
  fitContainerToContentAnalystPro: (containerId) => {
    const { analystProDashboard: dash } = get();
    if (!dash?.tiledRoot || !containerId) return;
    const measured = {};
    if (typeof document !== 'undefined') {
      const nodes = document.querySelectorAll('[data-zone-id]');
      nodes.forEach((n) => {
        const id = n.getAttribute('data-zone-id');
        if (!id) return;
        const r = n.getBoundingClientRect();
        measured[id] = { width: r.width || 0, height: r.height || 0 };
      });
    }
    const nextRoot = fitContainerToContent(dash.tiledRoot, containerId, measured);
    if (nextRoot === dash.tiledRoot) return;
    const nextDash = { ...dash, tiledRoot: nextRoot };
    set({ analystProDashboard: nextDash });
    get().pushAnalystProHistory(nextDash, 'Fit container to content');
  },

  // Plan 5e: Remove Container — unwrap children into grandparent, renormalize.
  // Collapses selection to the grandparent of the removed container.
  removeContainerAnalystPro: (containerId) => {
    const { analystProDashboard: dash, analystProSelection: sel } = get();
    if (!dash?.tiledRoot || !containerId) return;
    const findParentId = (zone, targetId, parentId) => {
      if (zone.id === targetId) return parentId;
      if (!zone.children) return null;
      for (const c of zone.children) {
        const found = findParentId(c, targetId, zone.id);
        if (found !== null) return found;
      }
      return null;
    };
    const grandparentId = findParentId(dash.tiledRoot, containerId, null);
    const nextRoot = removeContainer(dash.tiledRoot, containerId);
    if (nextRoot === dash.tiledRoot) return;
    const nextDash = { ...dash, tiledRoot: nextRoot };
    const nextSel = sel.has(containerId) && grandparentId
      ? new Set([grandparentId])
      : sel;
    set({ analystProDashboard: nextDash, analystProSelection: nextSel });
    get().pushAnalystProHistory(nextDash, 'Remove container');
  },

  // Plan 5e: Toggle tiled <-> floating on a zone.
  //   - Tiled -> floating: resolve the zone's pixel rect via layoutResolver,
  //     remove from tree (removeChild renormalizes siblings per Appendix E.11),
  //     push a FloatingZone preserving all non-layout fields.
  //   - Floating -> tiled: strip floating/x/y/pxW/pxH/zIndex, reset w=h=100000,
  //     insert as last child of targetContainerId (default dash.tiledRoot.id).
  toggleZoneFloatAnalystPro: (zoneId, targetContainerId) => {
    const { analystProDashboard: dash } = get();
    if (!dash || !zoneId) return;

    // Canvas pixel dims for resolved rect. Fall back to 1440x900 for
    // automatic/range modes (matches smart-layout heuristic default).
    const canvasW = dash.size?.mode === 'fixed' ? dash.size.width : 1440;
    const canvasH = dash.size?.mode === 'fixed' ? dash.size.height : 900;

    // Floating -> tiled?
    const floatingIdx = dash.floatingLayer.findIndex((z) => z.id === zoneId);
    if (floatingIdx >= 0) {
      const fz = dash.floatingLayer[floatingIdx];
      const {
        floating: _f, x: _x, y: _y, pxW: _w, pxH: _h, zIndex: _z,
        ...rest
      } = fz;
      const tiledZone = { ...rest, w: 100000, h: 100000 };
      const nextFloating = [
        ...dash.floatingLayer.slice(0, floatingIdx),
        ...dash.floatingLayer.slice(floatingIdx + 1),
      ];
      const parentId = targetContainerId || dash.tiledRoot.id;
      const nextRoot = insertChild(dash.tiledRoot, parentId, tiledZone, Number.MAX_SAFE_INTEGER);
      if (nextRoot === dash.tiledRoot) return;
      const nextDash = { ...dash, tiledRoot: nextRoot, floatingLayer: nextFloating };
      set({
        analystProDashboard: nextDash,
        analystProSelection: new Set([zoneId]),
      });
      get().pushAnalystProHistory(nextDash, 'Dock zone');
      return;
    }

    // Tiled -> floating?
    const resolved = resolveLayout(dash.tiledRoot, dash.floatingLayer, canvasW, canvasH);
    const hit = resolved.find((r) => r.zone.id === zoneId && r.depth >= 0);
    if (!hit) return;

    const src = hit.zone;
    const maxZ = dash.floatingLayer.reduce((m, z) => Math.max(m, z.zIndex || 0), 0);
    const { children: _children, w: _sw, h: _sh, ...leafFields } = src;
    const newFloating = {
      ...leafFields,
      floating: true,
      x: hit.x,
      y: hit.y,
      pxW: hit.width,
      pxH: hit.height,
      zIndex: maxZ + 1,
      w: 0,
      h: 0,
    };

    const nextRoot = removeChild(dash.tiledRoot, zoneId);
    if (nextRoot === dash.tiledRoot) return;
    const nextDash = {
      ...dash,
      tiledRoot: nextRoot,
      floatingLayer: [...dash.floatingLayer, newFloating],
    };
    set({
      analystProDashboard: nextDash,
      analystProSelection: new Set([zoneId]),
    });
    get().pushAnalystProHistory(nextDash, 'Float zone');
  },

  // Plan 2b: insert a new floating zone from the object library
  // Plan 6c: accepts optional worksheetRef for `type: 'worksheet'` insertions.
  insertObjectAnalystPro: ({ type, x, y, worksheetRef }) => {
    const { analystProDashboard: dash } = get();
    if (!dash) return;
    const isContainer = type === 'container-horz' || type === 'container-vert';
    const isWorksheet = type === 'worksheet';
    const defaultSize = isWorksheet
      ? { pxW: 480, pxH: 320 }
      : type === 'webpage' || isContainer
        ? { pxW: 480, pxH: 320 }
        : { pxW: 320, pxH: 200 };
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
    } else if (isWorksheet) {
      newZone = {
        id,
        type: 'worksheet',
        worksheetRef: String(worksheetRef || ''),
        w: 0,
        h: 0,
        floating: true,
        x,
        y,
        pxW: defaultSize.pxW,
        pxH: defaultSize.pxH,
        zIndex: maxZ + 1,
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

  // Plan 8 T25 — detach a tiled tile into the floating layer so it gains
  // independent pxW/pxH. Used when the user edits a single tile's height
  // (or width) but the tile lives in a shared-axis container — e.g. a
  // horz row, whose children must all share height. Structural fix: move
  // the tile out of the row entirely so its size is no longer constrained.
  detachTileToFloatAnalystPro: (leafId, pxRect) => {
    const { analystProDashboard: dash } = get();
    if (!dash?.tiledRoot || !leafId) return;
    const findByIdRec = (zone) => {
      if (!zone) return null;
      if (zone.id === leafId) return zone;
      for (const c of zone.children || []) {
        const f = findByIdRec(c);
        if (f) return f;
      }
      return null;
    };
    const leaf = findByIdRec(dash.tiledRoot);
    if (!leaf) return;

    const MIN_PX = 40;
    const pxW = Math.max(MIN_PX, Number(pxRect?.pxW) || 0);
    const pxH = Math.max(MIN_PX, Number(pxRect?.pxH) || 0);
    const x = Number.isFinite(pxRect?.x) ? pxRect.x : 40;
    const y = Number.isFinite(pxRect?.y) ? pxRect.y : 40;
    const maxZ = (dash.floatingLayer || []).reduce(
      (m, z) => Math.max(m, Number(z.zIndex) || 0),
      0,
    );

    // Strip tiled-only fields (w/h proportions) and add floating-only fields.
    const { w: _w, h: _h, ...rest } = leaf;
    void _w; void _h;
    const floatingZone = {
      ...rest,
      floating: true,
      x,
      y,
      pxW,
      pxH,
      zIndex: maxZ + 1,
    };

    const nextRoot = removeChild(dash.tiledRoot, leafId);
    const nextFloating = [...(dash.floatingLayer || []), floatingZone];
    const nextDash = { ...dash, tiledRoot: nextRoot, floatingLayer: nextFloating };
    set({ analystProDashboard: nextDash });
    get().setAnalystProSelection([leafId]);
    get().pushAnalystProHistory(nextDash, 'Detach tile');
  },

  // Plan 7 T15 — resize a tiled zone by setting proportional w/h values.
  // Renormalizes the parent's siblings via the resizeZone pure helper so
  // the sum stays at 100000 (invariant). Floating zones get a direct
  // pxW/pxH patch instead (via setZonePropertyAnalystPro).
  resizeZoneAnalystPro: (zoneId, size) => {
    const { analystProDashboard: dash } = get();
    if (!dash?.tiledRoot || !zoneId || !size) return;
    const nextRoot = resizeZone(dash.tiledRoot, zoneId, size);
    if (nextRoot === dash.tiledRoot) return;
    const nextDash = { ...dash, tiledRoot: nextRoot };
    set({ analystProDashboard: nextDash });
    get().pushAnalystProHistory(nextDash, 'Resize zone');
  },

  // Plan 5b: drop-on-edge wrap. Removes source from its current location, then
  // wraps target + source in a new split container sized to inherit target's
  // parent-axis proportion.
  //
  // Plan 7 T4: callers may pass canvasSize { canvasWPx, canvasHPx } so the
  // wrap-guard can reject drops that would produce <120 px children. When
  // omitted (non-drag callers, legacy tests), the guard is skipped.
  wrapInContainerAnalystPro: (targetZoneId, sourceZone, side, canvasSize) => {
    const { analystProDashboard: dash } = get();
    if (!dash?.tiledRoot) return;
    if (!sourceZone?.id) return;
    const afterRemove = removeChild(dash.tiledRoot, sourceZone.id);
    const nextRoot = wrapInContainer(afterRemove, targetZoneId, sourceZone, side, canvasSize);
    if (nextRoot === dash.tiledRoot) return;
    const nextDash = { ...dash, tiledRoot: nextRoot };
    set({ analystProDashboard: nextDash });
    get().pushAnalystProHistory(nextDash, 'Wrap in container');
  },
}));
