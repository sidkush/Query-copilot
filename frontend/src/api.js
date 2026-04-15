const API_BASE = "/api/v1";

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
  } catch {
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
  if (!res.ok) {
    // Detect invalid API key errors and flag in store
    if (res.status === 422 && data.error === "api_key_invalid") {
      try {
        const store = await import("./store");
        // Merge with existing status to preserve `configured` field
        // (P2 fix: partial object was missing `configured`, breaking ProtectedRoute gate)
        const current = store.useStore.getState().apiKeyStatus || {};
        store.useStore.getState().setApiKeyStatus({ ...current, valid: false });
      } catch { /* store not available */ }
    }
    throw new Error(data.detail || "Request failed");
  }
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

  // Turbo Mode (Query Intelligence)
  enableTurbo: (connId) =>
    request(`/connections/${connId}/turbo/enable`, { method: "POST" }),

  disableTurbo: (connId) =>
    request(`/connections/${connId}/turbo/disable`, { method: "POST" }),

  getTurboStatus: (connId) =>
    request(`/connections/${connId}/turbo/status`),

  refreshTurbo: (connId) =>
    request(`/connections/${connId}/turbo/refresh`, { method: "POST" }),

  getSchemaProfile: (connId) =>
    request(`/connections/${connId}/schema-profile`),

  refreshSchema: (connId) =>
    request(`/connections/${connId}/refresh-schema`, { method: "POST" }),

  // API Key Management (BYOK)
  saveApiKey: (key) =>
    request("/user/api-key", { method: "POST", body: JSON.stringify({ api_key: key }) }),

  getApiKeyStatus: () =>
    request("/user/api-key/status"),

  deleteApiKey: () =>
    request("/user/api-key", { method: "DELETE" }),

  validateApiKey: () =>
    request("/user/api-key/validate", { method: "POST" }),

  updatePreferredModel: (model) =>
    request("/user/preferred-model", { method: "PUT", body: JSON.stringify({ model }) }),

  getAvailableModels: () =>
    request("/user/available-models"),

  // Queries (human-in-the-loop)
  generateSQL: (question, connId = null) =>
    request("/queries/generate", {
      method: "POST",
      body: JSON.stringify({ question, conn_id: connId }),
    }),

  /**
   * Stream SQL generation tokens via SSE.
   * @param {string} question
   * @param {string|null} connId
   * @param {function} onToken - called with each text chunk
   * @returns {Promise<{sql: string|null, error: string|null}>}
   */
  generateSQLStream: async (question, connId, onToken) => {
    const token = localStorage.getItem("token");
    const params = new URLSearchParams({ question });
    if (connId) params.set("conn_id", connId);
    const res = await fetch(`${API_BASE}/queries/generate-stream?${params}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error("Stream failed");
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let validatedSql = null;
    let error = null;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") continue;
          if (data.startsWith("__VALID__:")) { validatedSql = data.slice(10); continue; }
          if (data.startsWith("__ERROR__:")) { error = data.slice(10); continue; }
          onToken?.(data);
        }
      }
    }
    return { sql: validatedSql, error };
  },

  previewSQL: (sql, connId = null) =>
    request("/queries/preview", {
      method: "POST",
      body: JSON.stringify({ question: sql, conn_id: connId }),
    }),

  executeSQL: (sql, question, connId = null, originalSql = null) =>
    request("/queries/execute", {
      method: "POST",
      body: JSON.stringify({ sql, question, conn_id: connId, original_sql: originalSql || undefined }),
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

  getPredictions: (connId = null, currentQuestion = "", currentSql = "") =>
    request("/queries/predictions", {
      method: "POST",
      body: JSON.stringify({
        conn_id: connId || null,
        current_question: currentQuestion,
        current_sql: currentSql,
      }),
    }),

  submitBehaviorDelta: (delta) =>
    request("/behavior/delta", {
      method: "POST",
      body: JSON.stringify(delta),
    }),

  getBehaviorConsent: () => request("/behavior/consent"),

  updateBehaviorConsent: (level) =>
    request("/behavior/consent", {
      method: "PUT",
      body: JSON.stringify({ consent_level: level }),
    }),

  getAutocomplete: (query, connId = null) =>
    request(`/queries/autocomplete?q=${encodeURIComponent(query)}${connId ? `&conn_id=${connId}` : ""}`),

  getPersonas: () => request("/behavior/personas"),

  getInsightChains: () => request("/behavior/insight-chains"),
  getPreloadTargets: () => request("/behavior/preload-targets"),
  getPrecacheQueries: () => request("/behavior/precache-queries"),
  getWorkflowPatterns: () => request("/behavior/workflow-patterns"),
  getSkillGaps: () => request("/behavior/skill-gaps"),
  getCollaborativeSuggestions: () => request("/behavior/collaborative-suggestions"),

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

  // ── Phase 2.5 — tile survival telemetry ──
  auditTileEvent: (payload) =>
    request('/dashboards/audit/tile-event', { method: "POST", body: JSON.stringify(payload) }),

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
  refreshTile: (dashboardId, tileId, connId, filters = null, sourceId = null, parameters = null) =>
    request(`/dashboards/${dashboardId}/tiles/${tileId}/refresh`, { method: "POST", body: JSON.stringify({ conn_id: connId, filters, source_id: sourceId, parameters: parameters || undefined }) }),

  // ── Tile Move & Copy ──
  moveTile: (dashboardId, tileId, targetTabId, targetSectionId) =>
    request(`/dashboards/${dashboardId}/tiles/${tileId}/move`, { method: "POST", body: JSON.stringify({ target_tab_id: targetTabId, target_section_id: targetSectionId }) }),
  copyTile: (dashboardId, tileId, targetTabId, targetSectionId) =>
    request(`/dashboards/${dashboardId}/tiles/${tileId}/copy`, { method: "POST", body: JSON.stringify({ target_tab_id: targetTabId, target_section_id: targetSectionId }) }),

  // ── Annotations ──
  addDashboardAnnotation: (dashboardId, text, authorName) =>
    request(`/dashboards/${dashboardId}/annotations`, { method: "POST", body: JSON.stringify({ text, authorName }) }),
  addTileAnnotation: (dashboardId, tileId, text, authorName) =>
    request(`/dashboards/${dashboardId}/tiles/${tileId}/annotations`, { method: "POST", body: JSON.stringify({ text, authorName }) }),
  deleteDashboardAnnotation: (dashboardId, annotationId) =>
    request(`/dashboards/${dashboardId}/annotations/${annotationId}`, { method: "DELETE" }),
  deleteTileAnnotation: (dashboardId, tileId, annotationId) =>
    request(`/dashboards/${dashboardId}/tiles/${tileId}/annotations/${annotationId}`, { method: "DELETE" }),

  editTileNL: (instruction, tileState, connId = null) =>
    request('/queries/edit-tile', {
      method: "POST",
      body: JSON.stringify({ instruction, tile_state: tileState, conn_id: connId }),
    }),
  imageToDashboard: (imageBase64, mediaType = 'image/png', connId = null) =>
    request('/queries/image-to-dashboard', {
      method: "POST",
      body: JSON.stringify({ image_base64: imageBase64, media_type: mediaType, conn_id: connId }),
    }),

  generateColumnSQL: (connId, existingSQL, newColumns) =>
    request('/dashboards/generate-column-sql', {
      method: 'POST',
      body: JSON.stringify({ conn_id: connId, existing_sql: existingSQL, new_columns: newColumns }),
    }),

  explainAnomaly: (data) =>
    request('/queries/explain-anomaly', {
      method: "POST",
      body: JSON.stringify(data),
    }),
  explainChart: (columns, rows, chartType, question, title) =>
    request('/queries/explain-chart', {
      method: "POST",
      body: JSON.stringify({ columns, rows: rows?.slice(0, 20), chartType, question, title }),
    }),
  drillDownSuggestions: (sql, columns, rows, question) =>
    request('/queries/drill-down-suggestions', {
      method: "POST",
      body: JSON.stringify({ sql, columns, rows: rows?.slice(0, 5), question }),
    }),
  explainValue: (sql, column, value, rowContext, connId = null) =>
    request('/queries/explain-value', {
      method: "POST",
      body: JSON.stringify({ sql, column, value: String(value), row_context: rowContext, conn_id: connId }),
    }),
  statisticalInsight: (columns, rows, question, title) =>
    request('/queries/statistical-insight', {
      method: "POST",
      body: JSON.stringify({ columns, rows, question, title }),
    }),
  drillDown: (parentSql, dimension, value, connId = null) =>
    request('/queries/drill-down', {
      method: "POST",
      body: JSON.stringify({ parent_sql: parentSql, dimension, value, conn_id: connId }),
    }),
  batchRefreshTiles: (dashboardId, tileIds, connId, filters = null, parameters = null) =>
    request(`/dashboards/${dashboardId}/tiles/batch-refresh`, {
      method: "POST",
      body: JSON.stringify({ tile_ids: tileIds, conn_id: connId, filters, parameters }),
    }),
  refreshAllBackground: (dashboardId, connId) =>
    request(`/dashboards/${dashboardId}/refresh-all`, {
      method: "POST",
      body: JSON.stringify({ conn_id: connId }),
    }),
  getDashboardTemplates: (connId) =>
    request(`/queries/dashboard-templates?conn_id=${connId || ''}`),
  shareDashboard: (dashboardId, expiresHours = 168) =>
    request(`/dashboards/${dashboardId}/share`, {
      method: "POST",
      body: JSON.stringify({ expires_hours: expiresHours }),
    }),
  revokeShare: (dashboardId, token) =>
    request(`/dashboards/${dashboardId}/share/${token}`, { method: "DELETE" }),
  getSharedDashboard: (token) =>
    request(`/dashboards/shared/${token}`),

  // ── Version History ──
  listVersions: (dashboardId) =>
    request(`/dashboards/${dashboardId}/versions`),
  restoreVersion: (dashboardId, versionId) =>
    request(`/dashboards/${dashboardId}/versions/restore`, { method: "POST", body: JSON.stringify({ version_id: versionId }) }),

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

  // ── Alerts ──
  listAlerts: () => request("/alerts/"),
  createAlert: (rule) =>
    request("/alerts/", { method: "POST", body: JSON.stringify(rule) }),
  updateAlert: (alertId, updates) =>
    request(`/alerts/${alertId}`, { method: "PUT", body: JSON.stringify(updates) }),
  deleteAlert: (alertId) =>
    request(`/alerts/${alertId}`, { method: "DELETE" }),
  checkAlert: (alertId) =>
    request(`/alerts/${alertId}/check`, { method: "POST" }),
  parseAlertCondition: (conditionText, connId = null) =>
    request("/alerts/parse", { method: "POST", body: JSON.stringify({ condition_text: conditionText, conn_id: connId }) }),

  // ── Live Tile Updates (SSE) ──
  subscribeTileUpdates: (dashboardId, onUpdate) => {
    const token = localStorage.getItem("token");
    const url = `${API_BASE}/dashboards/${dashboardId}/subscribe`;
    const controller = new AbortController();
    let retryCount = 0;
    const MAX_RETRIES = 3;

    const connect = async () => {
      try {
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (res.status === 503 || res.status === 429) {
          // Redis unavailable or too many connections — no retry, SSE not available
          console.info("[SSE] Server returned", res.status, "— real-time updates unavailable");
          return;
        }
        if (!res.ok) return;
        retryCount = 0; // Reset on successful connection
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6).trim();
              if (data === "ping" || !data) continue;
              try {
                onUpdate(JSON.parse(data));
              } catch { /* ignore parse errors */ }
            }
          }
        }
        // Stream ended — reconnect with backoff if not aborted
        if (!controller.signal.aborted && retryCount < MAX_RETRIES) {
          retryCount++;
          const delay = Math.min(1000 * Math.pow(2, retryCount), 10000);
          setTimeout(connect, delay);
        }
      } catch {
        if (controller.signal.aborted) return; // intentional close
        if (retryCount < MAX_RETRIES) {
          retryCount++;
          const delay = Math.min(1000 * Math.pow(2, retryCount), 10000);
          setTimeout(connect, delay);
        }
      }
    };

    connect();
    return { close: () => controller.abort() };
  },

  // ── Agent ──────────────────────────────────────────────────
  agentRun: (question, connId, chatId, onStep, { persona, permissionMode, agentContext } = {}) => {
    const controller = new AbortController();
    const body = JSON.stringify({
      question,
      conn_id: connId || null,
      chat_id: chatId || null,
      persona: persona || null,
      permission_mode: permissionMode || "supervised",
      agent_context: agentContext || "query",
    });
    const run = async () => {
      try {
        const res = await fetch(`${API_BASE}/agent/run`, {
          method: "POST",
          headers: getHeaders(),
          body,
          signal: controller.signal,
        });
        if (res.status === 401) {
          localStorage.removeItem("token");
          window.location.href = "/login";
          return;
        }
        if (!res.ok) {
          const errText = await res.text();
          onStep({ type: "error", content: errText || `Server error (${res.status})` });
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                onStep(data);
              } catch { /* skip malformed */ }
            }
          }
        }
        // Process remaining buffer
        if (buffer.startsWith("data: ")) {
          try {
            onStep(JSON.parse(buffer.slice(6)));
          } catch { /* skip */ }
        }
      } catch (err) {
        if (err.name !== "AbortError") {
          onStep({ type: "error", content: err.message });
        }
      }
    };
    run();
    return { close: () => controller.abort() };
  },

  agentRespond: (chatId, response) =>
    request("/agent/respond", {
      method: "POST",
      body: JSON.stringify({ chat_id: chatId, response }),
    }),

  agentCancel: (chatId) =>
    request(`/agent/cancel/${chatId}`, { method: "POST" }),

  // ── Agent Session Persistence ──────────────────────────────
  agentSessions: () => request("/agent/sessions"),

  agentSessionLoad: (chatId) => request(`/agent/sessions/${chatId}`),

  agentSessionDelete: (chatId) =>
    request(`/agent/sessions/${chatId}`, { method: "DELETE" }),

  agentContinue: (chatId, connId, onStep, { persona, permissionMode, agentContext } = {}) => {
    const controller = new AbortController();
    const body = JSON.stringify({
      chat_id: chatId,
      conn_id: connId || null,
      persona: persona || null,
      permission_mode: permissionMode || "supervised",
      agent_context: agentContext || "query",
    });
    const run = async () => {
      try {
        const res = await fetch(`${API_BASE}/agent/continue`, {
          method: "POST",
          headers: getHeaders(),
          body,
          signal: controller.signal,
        });
        if (res.status === 401) {
          localStorage.removeItem("token");
          window.location.href = "/login";
          return;
        }
        if (!res.ok) {
          const errText = await res.text();
          onStep({ type: "error", content: errText || `Server error (${res.status})` });
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                onStep(data);
              } catch { /* skip malformed */ }
            }
          }
        }
        if (buffer.startsWith("data: ")) {
          try {
            onStep(JSON.parse(buffer.slice(6)));
          } catch { /* skip */ }
        }
      } catch (err) {
        if (err.name !== "AbortError") {
          onStep({ type: "error", content: err.message });
        }
      }
    };
    run();
    return { close: () => controller.abort() };
  },

  // ML Engine
  mlTrain: (connId, tables, targetColumn, modelNames, taskType) =>
    request("/ml/train", {
      method: "POST",
      body: JSON.stringify({ conn_id: connId, tables, target_column: targetColumn, model_names: modelNames, task_type: taskType }),
    }),
  mlStatus: (taskId) => request(`/ml/status/${taskId}`),
  mlModels: () => request("/ml/models"),
  mlGetModel: (modelId) => request(`/ml/models/${modelId}`),
  mlDeleteModel: (modelId) => request(`/ml/models/${modelId}`, { method: "DELETE" }),

  // ML Pipeline Workflows
  mlCreatePipeline: (name, connId, tables, targetColumn) =>
    request("/ml/pipelines", {
      method: "POST",
      body: JSON.stringify({ name, conn_id: connId, tables: tables || [], target_column: targetColumn }),
    }),
  mlListPipelines: () => request("/ml/pipelines"),
  mlLoadPipeline: (id) => request(`/ml/pipelines/${id}`),
  mlUpdatePipeline: (id, updates) =>
    request(`/ml/pipelines/${id}`, {
      method: "PUT",
      body: JSON.stringify(updates),
    }),
  mlDeletePipeline: (id) =>
    request(`/ml/pipelines/${id}`, { method: "DELETE" }),
  mlRunStage: (pipelineId, stageKey, config) =>
    request(`/ml/pipelines/${pipelineId}/stages/${stageKey}/run`, {
      method: "POST",
      body: JSON.stringify({ config: config || {} }),
    }),
  mlAnalyze: (connId, tables) =>
    request("/ml/pipelines/analyze", {
      method: "POST",
      body: JSON.stringify({ conn_id: connId, tables: tables || [] }),
    }),
  mlCatalog: () => request("/ml/pipelines/catalog"),

  // Sub-project A Phase 4b — chart-system feature flags + migration
  getDashboardFeatureFlags: () => request("/dashboards/feature-flags"),
  migrateAllDashboards: () =>
    request("/dashboards/migrate", { method: "POST" }),
  migrateDashboard: (dashboardId) =>
    request(`/dashboards/${dashboardId}/migrate`, { method: "POST" }),

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
