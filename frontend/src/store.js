import { create } from "zustand";

let _themeTimer = null;

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

  // ── ML Engine Slice ──────────────────────────────────────────
  mlModels: [],
  mlTrainingTaskId: null,
  mlTrainingProgress: null,
  setMLModels: (models) => set({ mlModels: models }),
  setMLTrainingTaskId: (id) => set({ mlTrainingTaskId: id }),
  setMLTrainingProgress: (progress) => set({ mlTrainingProgress: progress }),

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
}));
