const API_BASE = "/api";

function getHeaders() {
  const token = localStorage.getItem("token");
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      headers: getHeaders(),
      ...options,
    });
  } catch (err) {
    throw new Error("Cannot connect to server. Please ensure the backend is running.");
  }
  if (res.status === 401) {
    localStorage.removeItem("token");
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(res.ok ? "Invalid response from server" : `Server error (${res.status})`);
  }
  if (!res.ok) throw new Error(data.detail || "Request failed");
  return data;
}

export const api = {
  // Auth
  register: (data) =>
    request("/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  login: (data) =>
    request("/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  demoLogin: () =>
    request("/auth/demo-login", { method: "POST" }),

  getMe: () => request("/auth/me"),

  completeTutorial: () =>
    request("/auth/tutorial-complete", { method: "POST" }),

  // OTP verification
  sendEmailOTP: (email) =>
    request("/auth/send-email-otp", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),

  verifyEmailOTP: (email, code) =>
    request("/auth/verify-email-otp", {
      method: "POST",
      body: JSON.stringify({ email, code }),
    }),

  sendPhoneOTP: (phone, country_code) =>
    request("/auth/send-phone-otp", {
      method: "POST",
      body: JSON.stringify({ phone, country_code }),
    }),

  verifyPhoneOTP: (phone, country_code, code) =>
    request("/auth/verify-phone-otp", {
      method: "POST",
      body: JSON.stringify({ phone, country_code, code }),
    }),

  // OAuth
  getOAuthURL: (provider) => request(`/auth/oauth/${provider}`),

  handleOAuthCallback: (provider, code, state) => {
    // Use URLSearchParams to safely encode — avoids double-encoding since
    // searchParams.get() in OAuthCallback already returns decoded values.
    const qs = new URLSearchParams({ provider, code, state }).toString();
    return request(`/auth/oauth/callback?${qs}`);
  },

  // Database connections
  testConnection: (dbType, params) =>
    request("/connections/test", {
      method: "POST",
      body: JSON.stringify({ db_type: dbType, ...params }),
    }),

  connectDB: (dbType, params, save = false, label = "") =>
    request("/connections/connect", {
      method: "POST",
      body: JSON.stringify({ db_type: dbType, save, label: label || undefined, ...params }),
    }),

  listConnections: () => request("/connections/list"),

  disconnectDB: (connId) =>
    request(`/connections/disconnect/${connId}`, { method: "POST" }),

  // Saved connections
  getSavedConnections: () => request("/connections/saved"),

  saveConnection: (config) =>
    request("/connections/save", {
      method: "POST",
      body: JSON.stringify(config),
    }),

  deleteSavedConnection: (configId) =>
    request(`/connections/saved/${configId}`, { method: "DELETE" }),

  reconnect: (configId) =>
    request(`/connections/reconnect/${configId}`, { method: "POST" }),

  // Queries (human-in-the-loop)
  generateSQL: (question, connId = null) =>
    request("/queries/generate", {
      method: "POST",
      body: JSON.stringify({ question, conn_id: connId }),
    }),

  executeSQL: (sql, question, connId = null) =>
    request("/queries/execute", {
      method: "POST",
      body: JSON.stringify({ sql, question, conn_id: connId }),
    }),

  generateDashboard: (requestText, connId = null) =>
    request("/queries/generate-dashboard", {
      method: "POST",
      body: JSON.stringify({ request: requestText, conn_id: connId }),
    }),

  sendFeedback: (question, sql, is_correct, connId = null) =>
    request("/queries/feedback", {
      method: "POST",
      body: JSON.stringify({ question, sql, is_correct, conn_id: connId }),
    }),

  getStats: () => request("/queries/stats"),
  getSuggestions: (connId = null) =>
    request(`/queries/suggestions${connId ? `?conn_id=${connId}` : ""}`),

  // Schema
  getTables: (connId = null) =>
    request(`/schema/tables${connId ? `?conn_id=${connId}` : ""}`),
  getDDL: (connId = null) =>
    request(`/schema/ddl${connId ? `?conn_id=${connId}` : ""}`),

  getERPositions: (connId = null) =>
    request(`/schema/er-positions${connId ? `?conn_id=${connId}` : ""}`),

  saveERPositions: (positions, connId = null) =>
    request(`/schema/er-positions${connId ? `?conn_id=${connId}` : ""}`, {
      method: "PUT",
      body: JSON.stringify({ positions }),
    }),

  // Chats
  listChats: () => request("/chats/"),

  createChat: (title, connId = null, dbType = null, databaseName = null) =>
    request("/chats/", {
      method: "POST",
      body: JSON.stringify({
        title,
        conn_id: connId || undefined,
        db_type: dbType || undefined,
        database_name: databaseName || undefined,
      }),
    }),

  loadChat: (chatId) => request(`/chats/${chatId}`),

  appendMessage: (chatId, msg) =>
    request(`/chats/${chatId}/messages`, {
      method: "PUT",
      body: JSON.stringify(msg),
    }),

  deleteChat: (chatId) =>
    request(`/chats/${chatId}`, { method: "DELETE" }),

  // User profile / account / billing
  getProfile: () => request("/user/profile"),

  updateProfile: (data) =>
    request("/user/profile", {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  getAccount: () => request("/user/account"),

  clearChatHistory: () =>
    request("/user/clear-history", { method: "POST" }),

  resetConnections: () =>
    request("/user/reset-connections", { method: "POST" }),

  getBilling: () => request("/user/billing"),

  // Self-delete account
  deleteAccount: () =>
    request("/user/delete-account", { method: "POST" }),

  // Support tickets (user-facing)
  submitSupportTicket: (data) =>
    request("/user/support-ticket", { method: "POST", body: JSON.stringify(data) }),

  getMyTickets: () => request("/user/support-tickets"),

  // Dashboards
  getDashboards: () => request("/dashboards/"),
  createDashboard: (name) =>
    request("/dashboards/", { method: "POST", body: JSON.stringify({ name }) }),
  getDashboard: (id) => request(`/dashboards/${id}`),
  updateDashboard: (id, data) =>
    request(`/dashboards/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteDashboard: (id) =>
    request(`/dashboards/${id}`, { method: "DELETE" }),
  addDashboardTile: (dashboardId, tile) =>
    request(`/dashboards/${dashboardId}/tiles`, { method: "POST", body: JSON.stringify(tile) }),
  removeDashboardTile: (dashboardId, tileId) =>
    request(`/dashboards/${dashboardId}/tiles/${tileId}`, { method: "DELETE" }),

  // ── Dashboard Tabs ──
  addTab: (dashboardId, name) =>
    request(`/dashboards/${dashboardId}/tabs`, { method: "POST", body: JSON.stringify({ name }) }),
  deleteTab: (dashboardId, tabId) =>
    request(`/dashboards/${dashboardId}/tabs/${tabId}`, { method: "DELETE" }),

  // ── Dashboard Sections ──
  addSection: (dashboardId, tabId, name) =>
    request(`/dashboards/${dashboardId}/tabs/${tabId}/sections`, { method: "POST", body: JSON.stringify({ name }) }),
  deleteSection: (dashboardId, tabId, sectionId) =>
    request(`/dashboards/${dashboardId}/tabs/${tabId}/sections/${sectionId}`, { method: "DELETE" }),

  // ── Tile CRUD (hierarchical) ──
  addTileToSection: (dashboardId, tabId, sectionId, tile) =>
    request(`/dashboards/${dashboardId}/tabs/${tabId}/sections/${sectionId}/tiles`, { method: "POST", body: JSON.stringify(tile) }),
  updateTile: (dashboardId, tileId, updates) =>
    request(`/dashboards/${dashboardId}/tiles/${tileId}`, { method: "PUT", body: JSON.stringify(updates) }),
  refreshTile: (dashboardId, tileId, connId, filters = null, sourceId = null) =>
    request(`/dashboards/${dashboardId}/tiles/${tileId}/refresh`, { method: "POST", body: JSON.stringify({ conn_id: connId, filters, source_id: sourceId }) }),

  // ── Annotations ──
  addDashboardAnnotation: (dashboardId, text, authorName) =>
    request(`/dashboards/${dashboardId}/annotations`, { method: "POST", body: JSON.stringify({ text, authorName }) }),
  addTileAnnotation: (dashboardId, tileId, text, authorName) =>
    request(`/dashboards/${dashboardId}/tiles/${tileId}/annotations`, { method: "POST", body: JSON.stringify({ text, authorName }) }),

  // ── AI Suggestions ──
  aiSuggestChart: (dashboardId, tileId, columns, sampleRows, question) =>
    request(`/dashboards/${dashboardId}/tiles/${tileId}/ai-suggest`, {
      method: "POST",
      body: JSON.stringify({ columns, sample_rows: sampleRows, question }),
    }),

  // ── Bookmarks ──
  saveBookmark: (dashboardId, name, state) =>
    request(`/dashboards/${dashboardId}/bookmarks`, { method: "POST", body: JSON.stringify({ name, state }) }),
  listBookmarks: (dashboardId) =>
    request(`/dashboards/${dashboardId}/bookmarks`),
  deleteBookmark: (dashboardId, bookmarkId) =>
    request(`/dashboards/${dashboardId}/bookmarks/${bookmarkId}`, { method: "DELETE" }),

  // ── Generation with preferences ──
  generateDashboardV2: (requestText, connId, preferences) =>
    request('/queries/generate-dashboard', { method: "POST", body: JSON.stringify({ request: requestText, conn_id: connId, preferences }) }),

  // Health
  health: () => request("/health"),
};

// ── Admin API (separate auth token) ─────────────────────────

function adminHeaders() {
  const token = localStorage.getItem("admin_token");
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

async function adminRequest(path, options = {}) {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { headers: adminHeaders(), ...options });
  } catch { throw new Error("Cannot connect to server"); }
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { throw new Error(`Server error (${res.status})`); }
  if (!res.ok) throw new Error(data.detail || "Request failed");
  return data;
}

export const adminApi = {
  login: (username, password) =>
    adminRequest("/admin/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  dashboard: () => adminRequest("/admin/dashboard"),
  listUsers: () => adminRequest("/admin/users"),
  getUserDetail: (email) => adminRequest(`/admin/users/${encodeURIComponent(email)}`),
  updateUserPlan: (email, plan) =>
    adminRequest(`/admin/users/${encodeURIComponent(email)}/plan`, { method: "PUT", body: JSON.stringify({ plan }) }),
  deleteUser: (email) =>
    adminRequest(`/admin/users/${encodeURIComponent(email)}`, { method: "DELETE" }),
  listTickets: () => adminRequest("/admin/tickets"),
  replyToTicket: (ticketId, message) =>
    adminRequest(`/admin/tickets/${ticketId}/reply`, { method: "PUT", body: JSON.stringify({ message }) }),
  closeTicket: (ticketId) =>
    adminRequest(`/admin/tickets/${ticketId}/close`, { method: "PUT" }),
  listDeletedUsers: () => adminRequest("/admin/deleted-users"),
};
