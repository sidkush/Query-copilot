import { useState, useEffect, useRef, Suspense, Component, lazy } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../api";
import { useStore } from "../store";
import UserDropdown from "../components/UserDropdown";
import { StaggerContainer, StaggerItem } from "../components/animation/StaggerContainer";
import AnimatedCounter from "../components/animation/AnimatedCounter";
import MotionButton from "../components/animation/MotionButton";
import TiltCard from "../components/animation/TiltCard";
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
  bigquery: "bg-indigo-500/20 text-indigo-400 border-indigo-700/40",
  redshift: "bg-orange-500/20 text-orange-400 border-orange-700/40",
  databricks: "bg-red-500/20 text-red-400 border-red-700/40",
  clickhouse: "bg-yellow-500/20 text-yellow-400 border-yellow-700/40",
  duckdb: "bg-amber-500/20 text-amber-400 border-amber-700/40",
  trino: "bg-blue-500/20 text-blue-400 border-blue-700/40",
  oracle: "bg-red-500/20 text-red-400 border-red-700/40",
  sap_hana: "bg-blue-500/20 text-blue-400 border-blue-700/40",
  ibm_db2: "bg-blue-500/20 text-blue-300 border-blue-700/40",
};

function StatCard({ value, label, gradient = "from-indigo-400 to-violet-400", isNumber = false }) {
  return (
    <motion.div
      className="glass rounded-xl p-4 text-center"
      whileHover={{ y: -2, transition: { duration: 0.2 } }}
    >
      <p className={`text-2xl font-extrabold bg-gradient-to-r ${gradient} bg-clip-text text-transparent`}>
        {isNumber ? <AnimatedCounter value={value} className={`bg-gradient-to-r ${gradient} bg-clip-text text-transparent`} /> : value}
      </p>
      <p className="text-xs text-gray-500 mt-1">{label}</p>
    </motion.div>
  );
}

function DbBadge({ dbType }) {
  const name = DB_NAMES[dbType] || dbType;
  const color = DB_COLORS[dbType] || "bg-gray-500/20 text-gray-400 border-gray-700/40";
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${color}`}>{name}</span>;
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
    <div className="flex-1 overflow-y-auto bg-[#06060e] relative">
      <div className="fixed inset-0 mesh-gradient opacity-30 pointer-events-none" />
      <GPUTierProvider>
        <_WebGLBound fallback={<AnimatedBackground className="fixed inset-0 pointer-events-none" />}>
          <Suspense fallback={<AnimatedBackground className="fixed inset-0 pointer-events-none" />}>
            <PageBackground3D mode="data" className="fixed inset-0" />
          </Suspense>
        </_WebGLBound>
      </GPUTierProvider>
      <header className="glass-navbar sticky top-0 z-20 flex items-center justify-between px-6 py-3">
        <div>
          <h1 className="text-xl font-bold text-white">Account</h1>
          <p className="text-xs text-gray-400">Your data ecosystem at a glance</p>
        </div>
        <UserDropdown />
      </header>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6 relative z-10">
        {loading ? (
          <div className="flex items-center gap-3 text-gray-500 text-sm">
            <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
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
              <TiltCard><div className="glass-card rounded-2xl p-6">
                <h2 className="text-sm font-semibold text-white mb-4">Account Information</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">Email</label>
                    <p className="text-sm text-gray-200">{account?.email}</p>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">Plan</label>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-500/20 text-indigo-400 border border-indigo-700/40 capitalize">{account?.plan || "free"}</span>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">Member Since</label>
                    <p className="text-sm text-gray-200">{account?.created_at ? new Date(account.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "N/A"}</p>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">Authentication</label>
                    <p className="text-sm text-gray-200">{authLabel(account?.oauth_provider)}</p>
                  </div>
                </div>
              </div></TiltCard>
            </StaggerItem>

            {/* 2. Active Connections */}
            <StaggerItem>
              <TiltCard><div className="glass-card rounded-2xl p-6">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-white">Active Connections</h2>
                  <span className="text-xs text-gray-500">{account?.active_connection_count || 0} live</span>
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
                        <span className="text-sm text-gray-200">{c.database_name}</span>
                        <DbBadge dbType={c.db_type} />
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-600">No active connections</p>
                )}
              </div></TiltCard>
            </StaggerItem>

            {/* 3. Query Statistics */}
            <StaggerItem>
              <TiltCard><div className="glass-card rounded-2xl p-6">
                <h2 className="text-sm font-semibold text-white mb-4">Query Statistics</h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <StatCard value={qs.total_queries ?? 0} label="Total Queries" isNumber />
                  <StatCard value={qs.queries_this_month ?? 0} label="This Month" gradient="from-green-400 to-emerald-400" isNumber />
                  <StatCard value={qs.avg_latency_ms ? `${(qs.avg_latency_ms / 1000).toFixed(1)}s` : "\u2014"} label="Avg Response" gradient="from-cyan-400 to-blue-400" />
                  <StatCard value={qs.success_rate ? `${qs.success_rate}%` : "\u2014"} label="Success Rate" gradient="from-yellow-400 to-orange-400" />
                </div>
                {qs.last_query_at && <p className="text-xs text-gray-600 mt-3">Last query: {new Date(qs.last_query_at).toLocaleString()}</p>}
              </div></TiltCard>
            </StaggerItem>

            {/* 4. Storage & Usage */}
            <StaggerItem>
              <TiltCard><div className="glass-card rounded-2xl p-6">
                <h2 className="text-sm font-semibold text-white mb-4">Storage & Usage</h2>
                <div className="grid grid-cols-3 gap-3">
                  <StatCard value={account?.saved_connections ?? 0} label="Saved Connections" isNumber />
                  <StatCard value={account?.chat_count ?? 0} label="Chat Sessions" gradient="from-purple-400 to-pink-400" isNumber />
                  <StatCard value={account?.trained_tables ?? 0} label="Trained Tables" gradient="from-emerald-400 to-teal-400" isNumber />
                </div>
              </div></TiltCard>
            </StaggerItem>

            {/* 5. Saved Databases */}
            <AnimatePresence>
              {account?.saved_connections_list?.length > 0 && (
                <StaggerItem>
                  <TiltCard><div className="glass-card rounded-2xl p-6">
                    <h2 className="text-sm font-semibold text-white mb-3">Saved Databases</h2>
                    <div className="flex flex-wrap gap-2">
                      {account.saved_connections_list.map((s, i) => (
                        <motion.div
                          key={s.id}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: i * 0.04 }}
                          className="flex items-center gap-2 glass rounded-lg px-3 py-1.5"
                        >
                          <span className="text-sm text-gray-300">{s.label}</span>
                          <DbBadge dbType={s.db_type} />
                        </motion.div>
                      ))}
                    </div>
                  </div></TiltCard>
                </StaggerItem>
              )}
            </AnimatePresence>

            {/* 6. Danger Zone */}
            <StaggerItem>
              <TiltCard><div className="glass-card border-red-900/30 rounded-2xl p-6">
                <h2 className="text-sm font-semibold text-red-400 mb-2">Danger Zone</h2>
                <p className="text-xs text-gray-500 mb-4">These actions cannot be undone.</p>
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
                  <div className="flex items-center justify-between glass rounded-lg px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-yellow-400">Clear Chat History</p>
                      <p className="text-xs text-gray-500">Remove {account?.chat_count ?? 0} chat session{(account?.chat_count ?? 0) !== 1 ? "s" : ""} and all saved queries</p>
                    </div>
                    <MotionButton onClick={handleClearHistory} disabled={clearing || (account?.chat_count ?? 0) === 0}
                      className="px-4 py-2 text-sm font-medium text-yellow-400 bg-yellow-900/20 border border-yellow-800/50 rounded-lg hover:bg-yellow-900/40 transition cursor-pointer disabled:opacity-50 flex-shrink-0">
                      {clearing ? "Clearing..." : "Clear"}
                    </MotionButton>
                  </div>
                  <div className="flex items-center justify-between glass rounded-lg px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-orange-400">Reset All Connections</p>
                      <p className="text-xs text-gray-500">Disconnect {account?.active_connection_count ?? 0} active and remove {account?.saved_connections ?? 0} saved connection{(account?.saved_connections ?? 0) !== 1 ? "s" : ""}</p>
                    </div>
                    <MotionButton onClick={handleResetConnections} disabled={resetting}
                      className="px-4 py-2 text-sm font-medium text-orange-400 bg-orange-900/20 border border-orange-800/50 rounded-lg hover:bg-orange-900/40 transition cursor-pointer disabled:opacity-50 flex-shrink-0">
                      {resetting ? "Resetting..." : "Reset"}
                    </MotionButton>
                  </div>
                  <div className="flex items-center justify-between glass rounded-lg px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-red-400">Delete Account</p>
                      <p className="text-xs text-gray-500">Permanently revoke access. Your data is retained for records.</p>
                    </div>
                    <MotionButton onClick={() => setShowDeleteModal(true)} disabled={deleting}
                      className="px-4 py-2 text-sm font-medium text-red-400 bg-red-900/20 border border-red-800/50 rounded-lg hover:bg-red-900/40 transition cursor-pointer disabled:opacity-50 flex-shrink-0">
                      {deleting ? "Deleting..." : "Delete"}
                    </MotionButton>
                  </div>
                </div>
              </div></TiltCard>
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
                    <h3 id="delete-modal-title" className="text-lg font-bold text-white text-center mb-2">Delete Your Account?</h3>
                    <p className="text-sm text-gray-400 text-center mb-4">
                      This will permanently revoke your access. You&apos;ll need to register again. Type your email to confirm.
                    </p>
                    <input
                      type="email"
                      value={deleteConfirmEmail}
                      onChange={(e) => setDeleteConfirmEmail(e.target.value)}
                      placeholder={account?.email || "your@email.com"}
                      className="w-full glass-input rounded-lg px-4 py-2.5 text-white mb-4 input-glow"
                      aria-label="Confirm email to delete account"
                    />
                    <div className="flex gap-3">
                      <MotionButton onClick={() => { setShowDeleteModal(false); setDeleteConfirmEmail(""); }}
                        className="flex-1 glass hover:bg-white/10 text-gray-300 font-medium rounded-lg py-2.5 transition cursor-pointer">
                        Cancel
                      </MotionButton>
                      <MotionButton
                        onClick={async () => {
                          setDeleting(true); setShowDeleteModal(false);
                          try { await api.deleteAccount(); logout(); navigate("/login"); }
                          catch (err) { setActionMsg(err.message); setDeleting(false); }
                        }}
                        disabled={deleteConfirmEmail !== account?.email}
                        className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white font-medium rounded-lg py-2.5 transition cursor-pointer">
                        Delete Forever
                      </MotionButton>
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
