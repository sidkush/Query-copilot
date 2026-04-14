import { useState, useEffect, useRef, Suspense, Component, lazy } from "react";
import { useNavigate } from "react-router-dom";
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../api";
import { useStore } from "../store";
import UserDropdown from "../components/UserDropdown";
import { StaggerContainer, StaggerItem } from "../components/animation/StaggerContainer";
import AnimatedCounter from "../components/animation/AnimatedCounter";

import AnimatedBackground from "../components/animation/AnimatedBackground";
import { GPUTierProvider } from "../lib/gpuDetect";
const PageBackground3D = lazy(() => import("../components/animation/PageBackground3D"));
class _WebGLBound extends Component { constructor(p){super(p);this.state={e:false};} static getDerivedStateFromError(){return{e:true};} render(){return this.state.e?this.props.fallback:this.props.children;} }

const DB_NAMES = {
  postgresql: "PostgreSQL", mysql: "MySQL", mariadb: "MariaDB", sqlite: "SQLite",
  mssql: "SQL Server", cockroachdb: "CockroachDB", snowflake: "Snowflake",
  bigquery: "BigQuery", redshift: "Redshift", databricks: "Databricks",
  clickhouse: "ClickHouse", duckdb: "DuckDB", trino: "Trino",
  oracle: "Oracle", sap_hana: "SAP HANA", ibm_db2: "IBM Db2",
};

const DB_COLORS = {
  postgresql: "bg-blue-500/20 text-blue-400 border-blue-700/40",
  mysql: "bg-orange-500/20 text-orange-400 border-orange-700/40",
  mariadb: "bg-teal-500/20 text-teal-400 border-teal-700/40",
  sqlite: "bg-gray-500/20 text-gray-400 border-gray-700/40",
  mssql: "bg-red-500/20 text-red-400 border-red-700/40",
  cockroachdb: "bg-purple-500/20 text-purple-400 border-purple-700/40",
  snowflake: "bg-cyan-500/20 text-cyan-400 border-cyan-700/40",
  bigquery: "bg-blue-500/20 text-blue-400 border-blue-700/40",
  redshift: "bg-orange-500/20 text-orange-400 border-orange-700/40",
  databricks: "bg-red-500/20 text-red-400 border-red-700/40",
  clickhouse: "bg-yellow-500/20 text-yellow-400 border-yellow-700/40",
  duckdb: "bg-amber-500/20 text-amber-400 border-amber-700/40",
  trino: "bg-blue-500/20 text-blue-400 border-blue-700/40",
  oracle: "bg-red-500/20 text-red-400 border-red-700/40",
  sap_hana: "bg-blue-500/20 text-blue-400 border-blue-700/40",
  ibm_db2: "bg-blue-500/20 text-blue-300 border-blue-700/40",
};

function StatCard({ value, label, gradient = "from-blue-400 to-cyan-400", isNumber = false }) {
  return (
    <motion.div
      className="glass rounded-xl p-4 text-center"
      whileHover={{ y: -2, transition: { duration: 0.2 } }}
    >
      <p className={`text-2xl font-extrabold bg-gradient-to-r ${gradient} bg-clip-text text-transparent`}>
        {isNumber ? <AnimatedCounter value={value} className={`bg-gradient-to-r ${gradient} bg-clip-text text-transparent`} /> : value}
      </p>
      <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{label}</p>
    </motion.div>
  );
}

function DbBadge({ dbType }) {
  const name = DB_NAMES[dbType] || dbType;
  const color = DB_COLORS[dbType] || "bg-gray-500/20 text-gray-400 border-gray-700/40";
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${color}`}>{name}</span>;
}

const DEMO_EMAIL = "demo@askdb.dev";

const MODEL_TIERS = { fast: "Fast", balanced: "Balanced", powerful: "Most Capable" };
const FALLBACK_MODELS = [
  { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5", tier: "fast" },
  { id: "claude-sonnet-4-5-20250514", name: "Claude Sonnet 4.5", tier: "balanced" },
  { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4", tier: "balanced" },
  { id: "claude-opus-4-20250514", name: "Claude Opus 4", tier: "powerful" },
];

function MaskedApiKey({ masked, isDemo }) {
  const [revealed, setRevealed] = useState(false);
  if (!masked && !isDemo) return <span style={{ color: 'var(--text-muted)' }}>Not set</span>;

  const initials = masked?.slice(0, 7) || "sk-ant-";
  const displayMasked = `${initials}••••••••`;
  const displayFull = masked || initials + "••••";

  return (
    <span className="flex items-center gap-2">
      <span style={{ color: 'var(--text-secondary)' }}>{revealed ? displayFull : displayMasked}</span>
      <button
        type="button"
        onClick={() => setRevealed(!revealed)}
        className="text-[10px] transition cursor-pointer underline" style={{ color: 'var(--text-muted)' }}
      >
        {revealed ? "hide" : "show"}
      </button>
      {isDemo && (
        <span className="text-[10px] text-purple-400 bg-purple-500/10 border border-purple-500/20 px-1.5 py-0.5 rounded">demo</span>
      )}
    </span>
  );
}

function ApiConfigSection() {
  const [keyStatus, setKeyStatus] = useState(null);
  const [models, setModels] = useState(FALLBACK_MODELS);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [keyValidating, setKeyValidating] = useState(false);
  const [keyError, setKeyError] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const setApiKeyStatus = useStore((s) => s.setApiKeyStatus);
  const preferredModel = useStore((s) => s.preferredModel);
  const setPreferredModel = useStore((s) => s.setPreferredModel);
  const user = useStore((s) => s.user);
  const keyModalRef = useRef(null);

  const isDemo = user?.email === DEMO_EMAIL;

  const [statusFetched, setStatusFetched] = useState(false);

  const refreshStatus = () => {
    api.getApiKeyStatus()
      .then((data) => { setKeyStatus(data); setApiKeyStatus(data); setStatusFetched(true); })
      .catch(() => {
        // Backend unreachable — set a fallback status instead of staying on "Loading..."
        if (isDemo) {
          const fallback = { provider: "anthropic", valid: true, configured: true, masked_key: null };
          setKeyStatus(fallback);
          setApiKeyStatus(fallback);
        } else {
          setKeyStatus({ configured: false, valid: false });
        }
        setStatusFetched(true);
      });
  };

  useEffect(() => {
    refreshStatus();
    api.getAvailableModels().then((data) => {
      const list = data?.models || (Array.isArray(data) ? data : []);
      if (list.length) setModels(list);
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Status logic: never hardcode green. Reflect actual backend state.
  // Demo user: treat as configured+valid when backend confirms OR on fallback.
  const isConfigured = keyStatus?.configured || false;
  const isValid = keyStatus?.valid || false;
  const statusColor = !statusFetched ? "bg-gray-500"
    : isValid ? "bg-green-500"
    : isConfigured ? "bg-red-500"
    : "bg-gray-500";
  const statusLabel = !statusFetched ? "Checking..."
    : isValid ? "Active"
    : isConfigured ? "Invalid"
    : "Not configured";

  const handleSaveKey = async () => {
    if (!newKey.trim()) return;
    setKeyValidating(true);
    setKeyError("");
    try {
      await api.saveApiKey(newKey.trim());
      // Re-fetch full status after save (save returns {"status":"ok"}, not full status)
      refreshStatus();
      setShowKeyModal(false);
      setNewKey("");
    } catch (err) {
      const msg = err.message || "";
      if (msg.includes("Cannot connect") || msg.includes("Server error") || msg.includes("Failed to fetch") || msg.includes("Not Found")) {
        setKeyError("Cannot reach the server. Please ensure the backend is running on port 8002.");
      } else {
        setKeyError(msg || "Failed to save API key");
      }
    } finally {
      setKeyValidating(false);
    }
  };

  const handleDeleteKey = async () => {
    if (!window.confirm("Remove your API key? You won't be able to run queries until you add a new one.")) return;
    setDeleting(true);
    try {
      await api.deleteApiKey();
      refreshStatus();
    } catch { /* ignore */ }
    setDeleting(false);
  };

  const handleModelChange = async (e) => {
    const model = e.target.value;
    try {
      await api.updatePreferredModel(model);
      setPreferredModel(model);
    } catch { /* ignore */ }
  };

  return (
    <>
      <StaggerItem>
        <div className="bezel-shell">
          <div className="bezel-core glass-card p-8" style={{ borderRadius: 'calc(2rem - 6px)' }}>
          <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>API configuration</h2>
          <div className="space-y-4">
            {/* Status */}
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Status</label>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${statusColor}`} />
                  <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{statusLabel}</span>
                </div>
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Provider</label>
                <span className="text-sm" style={{ color: 'var(--text-primary)' }}>Anthropic</span>
              </div>
            </div>

            {/* Masked Key — show initials + dots, click to reveal */}
            <div>
              <label className="block text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>API key</label>
              <div className="text-sm font-mono">
                <MaskedApiKey masked={keyStatus?.masked_key} isDemo={isDemo} />
              </div>
            </div>

            {/* Preferred Model — no $ symbols, show tier instead */}
            <div>
              <label className="block text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Preferred model</label>
              <select
                value={preferredModel || ""}
                onChange={handleModelChange}
                className="w-full glass-input rounded-lg px-3 py-2 text-sm bg-transparent" style={{ color: 'var(--text-primary)' }}
              >
                <option value="" style={{ background: 'var(--bg-base)' }}>Default (Haiku 4.5)</option>
                {models.map((m) => (
                  <option key={m.id} value={m.id} style={{ background: 'var(--bg-base)' }}>
                    {m.name} — {MODEL_TIERS[m.tier] || m.tier}
                  </option>
                ))}
              </select>
            </div>

            {/* Last Validated */}
            {keyStatus?.validated_at && (
              <div>
                <label className="block text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Last validated</label>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{new Date(keyStatus.validated_at).toLocaleString()}</p>
              </div>
            )}

            {/* Action Buttons — primary gets Button-in-Button treatment */}
            <div className="flex items-center gap-3">
              <motion.button
                onClick={() => setShowKeyModal(true)}
                whileTap={{ scale: 0.98 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                className="group inline-flex items-center gap-2 pl-5 pr-2 py-2 text-sm font-semibold text-blue-400 bg-blue-900/20 border border-blue-800/50 rounded-full hover:bg-blue-900/30 ease-spring cursor-pointer"
              >
                <span>{isConfigured ? "Update key" : "Add key"}</span>
                <span className="flex items-center justify-center w-7 h-7 rounded-full bg-blue-500/20 ease-spring transition-transform duration-300 group-hover:translate-x-1 group-hover:-translate-y-[1px]">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 12h14M13 5l7 7-7 7" />
                  </svg>
                </span>
              </motion.button>
              {isConfigured && (
                <motion.button
                  onClick={handleDeleteKey}
                  disabled={deleting}
                  whileTap={{ scale: 0.98 }}
                  transition={{ type: "spring", stiffness: 400, damping: 25 }}
                  className="inline-flex items-center px-4 py-2 text-sm font-medium text-red-400 bg-red-900/20 border border-red-800/50 rounded-full hover:bg-red-900/30 ease-spring cursor-pointer disabled:opacity-50"
                >
                  {deleting ? "Removing..." : "Remove key"}
                </motion.button>
              )}
            </div>
          </div>
          </div>
        </div>
      </StaggerItem>

      {/* Update Key Modal */}
      <AnimatePresence>
        {showKeyModal && (
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Update API key"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50"
            onClick={() => { setShowKeyModal(false); setNewKey(""); setKeyError(""); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              ref={keyModalRef}
              className="glass-card rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Update API Key</h3>
              <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>Enter your Anthropic API key. It will be validated and encrypted before saving.</p>

              <div className="relative mb-3">
                <input
                  type={showKey ? "text" : "password"}
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !keyValidating) handleSaveKey(); }}
                  placeholder="sk-ant-..."
                  className="w-full glass-input rounded-lg px-4 py-2.5 pr-10 input-glow" style={{ color: 'var(--text-primary)' }}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }}
                >
                  {showKey ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.879L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>

              {keyError && (
                <p className="text-sm text-red-400 mb-3">{keyError}</p>
              )}

              <div className="flex gap-3">
                <motion.button
                  onClick={() => { setShowKeyModal(false); setNewKey(""); setKeyError(""); }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ type: "spring", stiffness: 400, damping: 25 }}
                  className="flex-1 glass hover:bg-white/10 text-gray-300 font-medium rounded-full py-2.5 ease-spring cursor-pointer"
                >
                  Cancel
                </motion.button>
                <motion.button
                  onClick={handleSaveKey}
                  disabled={keyValidating || !newKey.trim()}
                  whileTap={{ scale: 0.98 }}
                  transition={{ type: "spring", stiffness: 400, damping: 25 }}
                  className="group flex-1 flex items-center justify-center gap-2 pl-5 pr-2 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-semibold rounded-full ease-spring cursor-pointer"
                >
                  {keyValidating ? (
                    <span className="flex items-center justify-center gap-2 py-0.5">
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Validating
                    </span>
                  ) : (
                    <>
                      <span className="text-sm">Validate &amp; save</span>
                      <span className="flex items-center justify-center w-7 h-7 rounded-full bg-white/15 ease-spring transition-transform duration-300 group-hover:translate-x-1 group-hover:-translate-y-[1px]">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M5 12l5 5L20 7" />
                        </svg>
                      </span>
                    </>
                  )}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export default function Account() {
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [clearing, setClearing] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [actionMsg, setActionMsg] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState("");
  const navigate = useNavigate();
  const logout = useStore((s) => s.logout);
  const setConnections = useStore((s) => s.setConnections);
  const setSavedConnections = useStore((s) => s.setSavedConnections);
  const deleteModalRef = useRef(null);
  const previousFocusRef = useRef(null);

  useEffect(() => {
    if (showDeleteModal) {
      previousFocusRef.current = document.activeElement;
      setTimeout(() => deleteModalRef.current?.focus(), 0);
      return () => {
        previousFocusRef.current?.focus();
      };
    }
  }, [showDeleteModal]);

  useEffect(() => {
    api.getAccount()
      .then((data) => setAccount(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const authLabel = (p) => ({ email: "Email & Password", google: "Google OAuth", github: "GitHub OAuth" }[p] || "Email & Password");

  const handleClearHistory = async () => {
    setClearing(true); setActionMsg("");
    try {
      await api.clearChatHistory();
      setActionMsg("Chat history cleared successfully.");
      setAccount((a) => a ? { ...a, chat_count: 0 } : a);
    } catch (err) { setActionMsg(err.message); }
    finally { setClearing(false); }
  };

  const handleResetConnections = async () => {
    setResetting(true); setActionMsg("");
    try {
      await api.resetConnections();
      setActionMsg("All connections reset successfully.");
      setConnections([]); setSavedConnections([]);
      setAccount((a) => a ? { ...a, active_connection_count: 0, active_connections: [], saved_connections: 0, saved_connections_list: [], trained_tables: 0 } : a);
    } catch (err) { setActionMsg(err.message); }
    finally { setResetting(false); }
  };

  const qs = account?.query_stats || {};

  return (
    <div className="flex-1 overflow-y-auto relative" style={{ background: 'var(--bg-page)' }}>
      <div className="fixed inset-0 mesh-gradient opacity-30 pointer-events-none" />
      <GPUTierProvider>
        <_WebGLBound fallback={<AnimatedBackground className="fixed inset-0 pointer-events-none" />}>
          <Suspense fallback={<AnimatedBackground className="fixed inset-0 pointer-events-none" />}>
            <PageBackground3D mode="data" className="fixed inset-0" />
          </Suspense>
        </_WebGLBound>
      </GPUTierProvider>
      <header className="glass-navbar sticky top-0 z-20 flex items-center justify-between px-6 py-3">
        <div className="page-hero" style={{ gap: 2 }}>
          <span className="page-hero__eyebrow">
            <span className="eyebrow-dot" aria-hidden="true" />
            Account · Overview
          </span>
          <h1 style={{
            fontSize: 20,
            fontWeight: 800,
            color: 'var(--text-primary)',
            fontFamily: "'Outfit', system-ui, sans-serif",
            letterSpacing: '-0.022em',
            lineHeight: 1.1,
            margin: 0,
          }}>Account</h1>
        </div>
        <UserDropdown />
      </header>

      <div className="max-w-2xl mx-auto px-4 py-16 space-y-6 relative z-10">
        {loading ? (
          <div className="flex items-center gap-3 text-sm" style={{ color: 'var(--text-muted)' }}>
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            Loading account...
          </div>
        ) : error ? (
          <motion.div
            initial={{ opacity: 0, x: 0 }}
            animate={{ opacity: 1, x: [0, -8, 8, -4, 4, 0] }}
            className="bg-red-900/20 border border-red-800/50 text-red-400 rounded-lg p-3 text-sm backdrop-blur-sm"
            role="alert"
          >
            {error}
          </motion.div>
        ) : (
          <StaggerContainer className="space-y-6">
            {/* 1. Account Info */}
            <StaggerItem>
              <div className="glass-card rounded-2xl p-6">
                <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Account Information</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Email</label>
                    <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{account?.email}</p>
                  </div>
                  <div>
                    <label className="block text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Plan</label>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400 border border-blue-700/40 capitalize">{account?.plan || "free"}</span>
                  </div>
                  <div>
                    <label className="block text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Member Since</label>
                    <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{account?.created_at ? new Date(account.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "N/A"}</p>
                  </div>
                  <div>
                    <label className="block text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Authentication</label>
                    <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{authLabel(account?.oauth_provider)}</p>
                  </div>
                </div>
              </div>
            </StaggerItem>

            {/* 2. Active Connections */}
            <StaggerItem>
              <div className="glass-card rounded-2xl p-6">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Active Connections</h2>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{account?.active_connection_count || 0} live</span>
                </div>
                {account?.active_connections?.length > 0 ? (
                  <div className="space-y-2">
                    {account.active_connections.map((c, i) => (
                      <motion.div
                        key={c.conn_id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className="flex items-center gap-3 glass rounded-lg px-3 py-2"
                      >
                        <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" /></span>
                        <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{c.database_name}</span>
                        <DbBadge dbType={c.db_type} />
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No active connections</p>
                )}
              </div>
            </StaggerItem>

            {/* 3. Query Statistics */}
            <StaggerItem>
              <div className="glass-card rounded-2xl p-6">
                <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Query Statistics</h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <StatCard value={qs.total_queries ?? 0} label="Total Queries" isNumber />
                  <StatCard value={qs.queries_this_month ?? 0} label="This Month" gradient="from-green-400 to-emerald-400" isNumber />
                  <StatCard value={qs.avg_latency_ms ? `${(qs.avg_latency_ms / 1000).toFixed(1)}s` : "\u2014"} label="Avg Response" gradient="from-cyan-400 to-blue-400" />
                  <StatCard value={qs.success_rate ? `${qs.success_rate}%` : "\u2014"} label="Success Rate" gradient="from-yellow-400 to-orange-400" />
                </div>
                {qs.last_query_at && <p className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>Last query: {new Date(qs.last_query_at).toLocaleString()}</p>}
              </div>
            </StaggerItem>

            {/* 4. Storage & Usage */}
            <StaggerItem>
              <div className="glass-card rounded-2xl p-6">
                <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Storage &amp; usage</h2>
                <div className="grid grid-cols-3 gap-3">
                  <StatCard value={account?.saved_connections ?? 0} label="Saved connections" isNumber />
                  <StatCard value={account?.chat_count ?? 0} label="Chat sessions" gradient="from-purple-400 to-pink-400" isNumber />
                  <StatCard value={account?.trained_tables ?? 0} label="Trained tables" gradient="from-emerald-400 to-teal-400" isNumber />
                </div>
              </div>
            </StaggerItem>

            {/* 5. Saved Databases */}
            <AnimatePresence>
              {account?.saved_connections_list?.length > 0 && (
                <StaggerItem>
                  <div className="glass-card rounded-2xl p-6">
                    <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Saved databases</h2>
                    <div className="flex flex-wrap gap-2">
                      {account.saved_connections_list.map((s, i) => (
                        <motion.div
                          key={s.id}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: i * 0.04 }}
                          className="flex items-center gap-2 glass rounded-lg px-3 py-1.5"
                        >
                          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{s.label}</span>
                          <DbBadge dbType={s.db_type} />
                        </motion.div>
                      ))}
                    </div>
                  </div>
                </StaggerItem>
              )}
            </AnimatePresence>

            {/* 6. API Configuration */}
            <ApiConfigSection />

            {/* 7. Danger Zone */}
            <StaggerItem>
              <div className="glass-card border-red-900/30 rounded-2xl p-6">
                <h2 className="text-sm font-semibold text-red-400 mb-2">Danger zone</h2>
                <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>These actions cannot be undone.</p>
                <AnimatePresence>
                  {actionMsg && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="glass rounded-lg p-3 text-sm mb-4 text-gray-300 overflow-hidden"
                      role="alert"
                    >
                      {actionMsg}
                    </motion.div>
                  )}
                </AnimatePresence>
                <div className="space-y-3">
                  <div className="flex items-center justify-between glass rounded-xl px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-yellow-400">Clear chat history</p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Remove {account?.chat_count ?? 0} chat session{(account?.chat_count ?? 0) !== 1 ? "s" : ""} and all saved queries</p>
                    </div>
                    <motion.button onClick={handleClearHistory} disabled={clearing || (account?.chat_count ?? 0) === 0}
                      whileTap={{ scale: 0.98 }}
                      transition={{ type: "spring", stiffness: 400, damping: 25 }}
                      className="px-4 py-2 text-sm font-medium text-yellow-400 bg-yellow-900/20 border border-yellow-800/50 rounded-full hover:bg-yellow-900/40 ease-spring cursor-pointer disabled:opacity-50 flex-shrink-0">
                      {clearing ? "Clearing..." : "Clear"}
                    </motion.button>
                  </div>
                  <div className="flex items-center justify-between glass rounded-xl px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-orange-400">Reset all connections</p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Disconnect {account?.active_connection_count ?? 0} active and remove {account?.saved_connections ?? 0} saved connection{(account?.saved_connections ?? 0) !== 1 ? "s" : ""}</p>
                    </div>
                    <motion.button onClick={handleResetConnections} disabled={resetting}
                      whileTap={{ scale: 0.98 }}
                      transition={{ type: "spring", stiffness: 400, damping: 25 }}
                      className="px-4 py-2 text-sm font-medium text-orange-400 bg-orange-900/20 border border-orange-800/50 rounded-full hover:bg-orange-900/40 ease-spring cursor-pointer disabled:opacity-50 flex-shrink-0">
                      {resetting ? "Resetting..." : "Reset"}
                    </motion.button>
                  </div>
                  <div className="flex items-center justify-between glass rounded-xl px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-red-400">Delete account</p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Permanently revoke access. Your data is retained for records.</p>
                    </div>
                    <motion.button onClick={() => setShowDeleteModal(true)} disabled={deleting}
                      whileTap={{ scale: 0.98 }}
                      transition={{ type: "spring", stiffness: 400, damping: 25 }}
                      className="px-4 py-2 text-sm font-medium text-red-400 bg-red-900/20 border border-red-800/50 rounded-full hover:bg-red-900/40 ease-spring cursor-pointer disabled:opacity-50 flex-shrink-0">
                      {deleting ? "Deleting..." : "Delete"}
                    </motion.button>
                  </div>
                </div>
              </div>
            </StaggerItem>

            {/* Delete Account Confirmation Modal */}
            <AnimatePresence>
              {showDeleteModal && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50"
                  onClick={() => setShowDeleteModal(false)}
                  onKeyDown={(e) => { if (e.key === "Escape") setShowDeleteModal(false); }}
                >
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 20 }}
                    transition={{ type: "spring", stiffness: 300, damping: 25 }}
                    ref={deleteModalRef}
                    tabIndex={-1}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="delete-modal-title"
                    className="glass-card rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl outline-none"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
                      <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                      </svg>
                    </div>
                    <h3 id="delete-modal-title" className="text-lg font-bold text-center mb-2" style={{ color: 'var(--text-primary)' }}>Delete your account?</h3>
                    <p className="text-sm text-center mb-4" style={{ color: 'var(--text-secondary)' }}>
                      This will permanently revoke your access. You&apos;ll need to register again. Type your email to confirm.
                    </p>
                    <input
                      type="email"
                      value={deleteConfirmEmail}
                      onChange={(e) => setDeleteConfirmEmail(e.target.value)}
                      placeholder={account?.email || "your@email.com"}
                      className="w-full glass-input rounded-lg px-4 py-2.5 mb-4 input-glow" style={{ color: 'var(--text-primary)' }}
                      aria-label="Confirm email to delete account"
                    />
                    <div className="flex gap-3">
                      <motion.button onClick={() => { setShowDeleteModal(false); setDeleteConfirmEmail(""); }}
                        whileTap={{ scale: 0.98 }}
                        transition={{ type: "spring", stiffness: 400, damping: 25 }}
                        className="flex-1 glass hover:bg-white/10 text-gray-300 font-medium rounded-full py-2.5 ease-spring cursor-pointer">
                        Cancel
                      </motion.button>
                      <motion.button
                        onClick={async () => {
                          setDeleting(true); setShowDeleteModal(false);
                          try { await api.deleteAccount(); logout(); navigate("/login"); }
                          catch (err) { setActionMsg(err.message); setDeleting(false); }
                        }}
                        disabled={deleteConfirmEmail !== account?.email}
                        whileTap={{ scale: 0.98 }}
                        transition={{ type: "spring", stiffness: 400, damping: 25 }}
                        className="flex-1 bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white font-semibold rounded-full py-2.5 ease-spring cursor-pointer">
                        Delete forever
                      </motion.button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </StaggerContainer>
        )}
      </div>
    </div>
  );
}
