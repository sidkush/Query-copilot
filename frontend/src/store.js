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

  // Tutorial state
  tutorialComplete: localStorage.getItem("tutorialComplete") === "true",
  setTutorialComplete: (v) => {
    localStorage.setItem("tutorialComplete", v ? "true" : "false");
    set({ tutorialComplete: v });
  },

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
  agentChatId: null,

  addAgentStep: (step) => set((s) => ({
    agentSteps: [...s.agentSteps, step],
  })),
  clearAgent: () => set({
    agentSteps: [],
    agentLoading: false,
    agentError: null,
    agentWaiting: null,
  }),
  setAgentLoading: (v) => set({ agentLoading: v }),
  setAgentError: (e) => set({ agentError: e }),
  setAgentWaiting: (q) => set({ agentWaiting: q }),
  clearAgentWaiting: () => set({ agentWaiting: null }),
  setAgentAutoExecute: (v) => set({ agentAutoExecute: v }),
  setAgentChatId: (id) => set({ agentChatId: id }),
}));
