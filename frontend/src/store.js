import { create } from "zustand";

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
  setMessages: (msgs) => set({ messages: msgs }),

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
  dashboardGlobalFilters: { dateColumn: "", range: "all_time", fields: [] },
  dashboardFilterVersion: 0,
  applyGlobalFilters: (filters) => set((s) => ({
    dashboardGlobalFilters: {
      dateColumn: filters?.dateColumn ?? "",
      range: filters?.range ?? "all_time",
      dateStart: filters?.dateStart,
      dateEnd: filters?.dateEnd,
      fields: Array.isArray(filters?.fields) ? filters.fields : [],
    },
    dashboardFilterVersion: s.dashboardFilterVersion + 1,
  })),
  resetGlobalFilters: () => set({
    dashboardGlobalFilters: { dateColumn: "", range: "all_time", fields: [] },
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

  // ── Agent Slice ──────────────────────────────────────────────
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
  addAgentStep: (step) => set((s) => {
    const base = { agentSteps: [...s.agentSteps, step] };
    if (step.type === "cached_result") {
      return { ...base, dualResponseActive: true, cachedResultStep: step };
    }
    if (step.type === "live_correction" || step.type === "result") {
      return { ...base, dualResponseActive: false };
    }
    return base;
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
  }),
  setDualResponseActive: (active) => set({ dualResponseActive: active }),
  setCachedResultStep: (step) => set({ cachedResultStep: step }),
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

  // Agent history persistence (localStorage, max 20 conversations)
  saveAgentHistory: () => {
    const { agentChatId, agentSteps } = get();
    if (!agentChatId || !agentSteps.length) return;
    try {
      const raw = JSON.parse(localStorage.getItem("qc_agent_history") || "{}");
      raw[agentChatId] = {
        steps: agentSteps,
        updatedAt: Date.now(),
      };
      // Keep only last 20 conversations
      const keys = Object.keys(raw).sort((a, b) => (raw[b].updatedAt || 0) - (raw[a].updatedAt || 0));
      if (keys.length > 20) {
        for (const k of keys.slice(20)) delete raw[k];
      }
      localStorage.setItem("qc_agent_history", JSON.stringify(raw));
    } catch { /* quota exceeded or corrupt — ignore */ }
  },
  loadAgentHistory: (chatId) => {
    try {
      const raw = JSON.parse(localStorage.getItem("qc_agent_history") || "{}");
      const entry = raw[chatId];
      if (entry?.steps?.length) {
        set({ agentSteps: entry.steps, agentChatId: chatId });
        return true;
      }
    } catch { /* corrupt — ignore */ }
    return false;
  },
  getAgentHistoryList: () => {
    try {
      const raw = JSON.parse(localStorage.getItem("qc_agent_history") || "{}");
      return Object.entries(raw)
        .map(([id, v]) => ({
          chatId: id,
          updatedAt: v.updatedAt || 0,
          preview: v.steps?.find((s) => s.type === "result")?.content?.slice(0, 80)
            || v.steps?.[0]?.content?.slice(0, 80)
            || "Agent conversation",
          stepCount: v.steps?.length || 0,
        }))
        .sort((a, b) => b.updatedAt - a.updatedAt);
    } catch { return []; }
  },
  deleteAgentHistory: (chatId) => {
    try {
      const raw = JSON.parse(localStorage.getItem("qc_agent_history") || "{}");
      delete raw[chatId];
      localStorage.setItem("qc_agent_history", JSON.stringify(raw));
    } catch { /* ignore */ }
  },
}));
