import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { StaggerContainer, StaggerItem } from "../components/animation/StaggerContainer";
import MotionButton from "../components/animation/MotionButton";
import AnimatedBackground from "../components/animation/AnimatedBackground";
import { api } from "../api";
import { useStore } from "../store";
import UserDropdown from "../components/UserDropdown";

/* ── Shared DB icon (cylinder) with per-type color ─────────── */
const DbIcon = ({ className = "w-6 h-6 text-white" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
  </svg>
);

/* ── All 16 database definitions, organized by category ────── */
const DB_CATEGORIES = [
  {
    title: "Relational Databases",
    subtitle: "Traditional SQL databases for transactional workloads",
    dbs: [
      {
        id: "postgresql", name: "PostgreSQL", color: "from-blue-500 to-blue-700", iconColor: "text-blue-400",
        desc: "Advanced open-source relational database",
        fields: [
          { key: "host", label: "Host", placeholder: "localhost", type: "text" },
          { key: "port", label: "Port", placeholder: "5432", type: "number" },
          { key: "database", label: "Database", placeholder: "analytics", type: "text" },
          { key: "user", label: "Username", placeholder: "copilot_readonly", type: "text" },
          { key: "password", label: "Password", placeholder: "", type: "password" },
          { key: "schema_name", label: "Schema", placeholder: "public", type: "text" },
        ],
      },
      {
        id: "mysql", name: "MySQL", color: "from-orange-500 to-orange-700", iconColor: "text-orange-400",
        desc: "World's most popular open-source database",
        fields: [
          { key: "host", label: "Host", placeholder: "localhost", type: "text" },
          { key: "port", label: "Port", placeholder: "3306", type: "number" },
          { key: "database", label: "Database", placeholder: "analytics", type: "text" },
          { key: "user", label: "Username", placeholder: "readonly", type: "text" },
          { key: "password", label: "Password", placeholder: "", type: "password" },
        ],
      },
      {
        id: "mariadb", name: "MariaDB", color: "from-teal-500 to-teal-700", iconColor: "text-teal-400",
        desc: "MySQL-compatible community-driven fork",
        fields: [
          { key: "host", label: "Host", placeholder: "localhost", type: "text" },
          { key: "port", label: "Port", placeholder: "3306", type: "number" },
          { key: "database", label: "Database", placeholder: "analytics", type: "text" },
          { key: "user", label: "Username", placeholder: "readonly", type: "text" },
          { key: "password", label: "Password", placeholder: "", type: "password" },
        ],
      },
      {
        id: "sqlite", name: "SQLite", color: "from-gray-500 to-gray-700", iconColor: "text-gray-400",
        desc: "Embedded file-based database — zero setup",
        fields: [
          { key: "path", label: "Database Path", placeholder: ":memory: or /path/to/db.sqlite", type: "text" },
        ],
      },
      {
        id: "mssql", name: "SQL Server", color: "from-red-500 to-red-700", iconColor: "text-red-400",
        desc: "Microsoft enterprise relational database",
        fields: [
          { key: "host", label: "Host", placeholder: "localhost", type: "text" },
          { key: "port", label: "Port", placeholder: "1433", type: "number" },
          { key: "database", label: "Database", placeholder: "master", type: "text" },
          { key: "user", label: "Username", placeholder: "sa", type: "text" },
          { key: "password", label: "Password", placeholder: "", type: "password" },
        ],
      },
      {
        id: "cockroachdb", name: "CockroachDB", color: "from-purple-500 to-purple-700", iconColor: "text-purple-400",
        desc: "Distributed SQL — PostgreSQL compatible",
        fields: [
          { key: "host", label: "Host", placeholder: "localhost", type: "text" },
          { key: "port", label: "Port", placeholder: "26257", type: "number" },
          { key: "database", label: "Database", placeholder: "defaultdb", type: "text" },
          { key: "user", label: "Username", placeholder: "root", type: "text" },
          { key: "password", label: "Password", placeholder: "", type: "password" },
          { key: "ssl_mode", label: "SSL Mode", placeholder: "require", type: "text" },
        ],
      },
    ],
  },
  {
    title: "Cloud Data Warehouses",
    subtitle: "Scalable cloud-native analytics platforms",
    dbs: [
      {
        id: "snowflake", name: "Snowflake", color: "from-cyan-500 to-cyan-700", iconColor: "text-cyan-400",
        desc: "Multi-cloud data warehouse",
        fields: [
          { key: "account", label: "Account", placeholder: "abc123.us-east-1", type: "text" },
          { key: "warehouse", label: "Warehouse", placeholder: "COMPUTE_WH", type: "text" },
          { key: "database", label: "Database", placeholder: "ANALYTICS", type: "text" },
          { key: "schema_name", label: "Schema", placeholder: "PUBLIC", type: "text" },
          { key: "user", label: "Username", placeholder: "readonly_user", type: "text" },
          { key: "password", label: "Password", placeholder: "", type: "password" },
        ],
      },
      {
        id: "bigquery", name: "BigQuery", color: "from-indigo-500 to-indigo-700", iconColor: "text-indigo-400",
        desc: "Google Cloud serverless analytics",
        fields: [
          { key: "project", label: "GCP Project", placeholder: "my-project-123", type: "text" },
          { key: "dataset", label: "Dataset", placeholder: "analytics", type: "text" },
          { key: "credentials_path", label: "Credentials JSON path", placeholder: "/path/to/service-account.json", type: "text" },
        ],
      },
      {
        id: "redshift", name: "Amazon Redshift", color: "from-orange-600 to-red-700", iconColor: "text-orange-400",
        desc: "AWS cloud data warehouse",
        fields: [
          { key: "host", label: "Cluster Endpoint", placeholder: "cluster.abc123.us-east-1.redshift.amazonaws.com", type: "text" },
          { key: "port", label: "Port", placeholder: "5439", type: "number" },
          { key: "database", label: "Database", placeholder: "analytics", type: "text" },
          { key: "user", label: "Username", placeholder: "readonly", type: "text" },
          { key: "password", label: "Password", placeholder: "", type: "password" },
          { key: "schema_name", label: "Schema", placeholder: "public", type: "text" },
        ],
      },
      {
        id: "databricks", name: "Databricks SQL", color: "from-red-500 to-orange-600", iconColor: "text-red-400",
        desc: "Data lakehouse analytics",
        fields: [
          { key: "host", label: "Server Hostname", placeholder: "adb-1234567890.azuredatabricks.net", type: "text" },
          { key: "token", label: "Access Token", placeholder: "dapi...", type: "password" },
          { key: "http_path", label: "HTTP Path", placeholder: "/sql/1.0/warehouses/abc123", type: "text" },
          { key: "catalog", label: "Catalog", placeholder: "main", type: "text" },
          { key: "schema_name", label: "Schema", placeholder: "default", type: "text" },
        ],
      },
    ],
  },
  {
    title: "Analytics Engines",
    subtitle: "High-performance query engines for large-scale data",
    dbs: [
      {
        id: "clickhouse", name: "ClickHouse", color: "from-yellow-500 to-yellow-700", iconColor: "text-yellow-400",
        desc: "Column-oriented OLAP database",
        fields: [
          { key: "host", label: "Host", placeholder: "localhost", type: "text" },
          { key: "port", label: "HTTP Port", placeholder: "8123", type: "number" },
          { key: "database", label: "Database", placeholder: "default", type: "text" },
          { key: "user", label: "Username", placeholder: "default", type: "text" },
          { key: "password", label: "Password", placeholder: "", type: "password" },
        ],
      },
      {
        id: "duckdb", name: "DuckDB", color: "from-yellow-600 to-amber-700", iconColor: "text-amber-400",
        desc: "In-process analytical database",
        fields: [
          { key: "path", label: "Database Path", placeholder: ":memory: or /path/to/db.duckdb", type: "text" },
        ],
      },
      {
        id: "trino", name: "Trino", color: "from-blue-400 to-indigo-600", iconColor: "text-blue-400",
        desc: "Distributed SQL query engine",
        fields: [
          { key: "host", label: "Host", placeholder: "localhost", type: "text" },
          { key: "port", label: "Port", placeholder: "8080", type: "number" },
          { key: "user", label: "Username", placeholder: "trino_user", type: "text" },
          { key: "catalog_name", label: "Catalog", placeholder: "hive", type: "text" },
          { key: "schema_name", label: "Schema", placeholder: "default", type: "text" },
        ],
      },
    ],
  },
  {
    title: "Enterprise Databases",
    subtitle: "Mission-critical enterprise database systems",
    dbs: [
      {
        id: "oracle", name: "Oracle", color: "from-red-600 to-red-800", iconColor: "text-red-400",
        desc: "Enterprise-grade relational database",
        fields: [
          { key: "host", label: "Host", placeholder: "localhost", type: "text" },
          { key: "port", label: "Port", placeholder: "1521", type: "number" },
          { key: "service_name", label: "Service Name", placeholder: "ORCL", type: "text" },
          { key: "user", label: "Username", placeholder: "readonly", type: "text" },
          { key: "password", label: "Password", placeholder: "", type: "password" },
        ],
      },
      {
        id: "sap_hana", name: "SAP HANA", color: "from-blue-600 to-blue-800", iconColor: "text-blue-400",
        desc: "In-memory enterprise platform",
        fields: [
          { key: "host", label: "Host", placeholder: "hana-server.example.com", type: "text" },
          { key: "port", label: "Port", placeholder: "30015", type: "number" },
          { key: "user", label: "Username", placeholder: "SYSTEM", type: "text" },
          { key: "password", label: "Password", placeholder: "", type: "password" },
        ],
      },
      {
        id: "ibm_db2", name: "IBM Db2", color: "from-blue-700 to-blue-900", iconColor: "text-blue-300",
        desc: "IBM enterprise data server",
        fields: [
          { key: "host", label: "Host", placeholder: "localhost", type: "text" },
          { key: "port", label: "Port", placeholder: "50000", type: "number" },
          { key: "database", label: "Database", placeholder: "SAMPLE", type: "text" },
          { key: "user", label: "Username", placeholder: "db2inst1", type: "text" },
          { key: "password", label: "Password", placeholder: "", type: "password" },
        ],
      },
    ],
  },
];

/* Flat lookup helpers built from categories */
const ALL_DBS = DB_CATEGORIES.flatMap((c) => c.dbs);
const DB_MAP = Object.fromEntries(ALL_DBS.map((d) => [d.id, d]));
const DB_LABELS = Object.fromEntries(ALL_DBS.map((d) => [d.id, { name: d.name }]));

export default function Dashboard() {
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({});
  const [label, setLabel] = useState("");
  const [status, setStatus] = useState("idle"); // idle | connecting | success | error
  const [error, setError] = useState("");
  const [reconnecting, setReconnecting] = useState(null);
  const [tablesFound, setTablesFound] = useState(null);
  const [testResult, setTestResult] = useState(null); // null | "testing" | "success" | "fail"
  const [testMessage, setTestMessage] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(null); // config id awaiting confirmation
  const navigate = useNavigate();
  const connections = useStore((s) => s.connections);
  const addConnection = useStore((s) => s.addConnection);
  const removeConnection = useStore((s) => s.removeConnection);
  const savedConnections = useStore((s) => s.savedConnections);
  const setSavedConnections = useStore((s) => s.setSavedConnections);
  const setConnections = useStore((s) => s.setConnections);

  const db = DB_MAP[selected] || null;

  useEffect(() => {
    api.getSavedConnections()
      .then((data) => setSavedConnections(data.configs || data.connections || data || []))
      .catch(() => {});

    api.listConnections()
      .then((data) => {
        const live = (data.connections || []).map((c) => ({
          conn_id: c.conn_id,
          db_type: c.db_type,
          database_name: c.database_name,
        }));
        if (live.length > 0) setConnections(live);
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const isLive = (saved) =>
    connections.some((c) => c.database_name === saved.database && c.db_type === saved.db_type);

  const handleConnect = async () => {
    if (!db) return;
    const dbName = form.database || form.project || form.dataset || form.path || form.catalog || "";
    const alreadyConnected = connections.some(
      (c) => c.db_type === selected && c.database_name === dbName
    );
    if (alreadyConnected) {
      setError("Connection already exists. This database is already connected.");
      return;
    }

    setStatus("connecting");
    setError("");
    setTablesFound(null);
    try {
      const result = await api.connectDB(selected, form, true, label);
      setTablesFound(result.tables_found ?? null);
      setStatus("success");
      addConnection({
        conn_id: result.conn_id,
        db_type: selected,
        database_name: result.database_name,
        tables_found: result.tables_found,
      });
      api.getSavedConnections()
        .then((data) => setSavedConnections(data.configs || data.connections || data || []))
        .catch(() => {});
      setTimeout(() => navigate("/schema"), 1500);
    } catch (err) {
      setStatus("error");
      setError(err.message || "Connection failed");
    }
  };

  const handleTestConnection = async () => {
    if (!db) return;
    setTestResult("testing");
    setTestMessage("");
    try {
      const result = await api.testConnection(selected, form);
      setTestResult("success");
      setTestMessage(result.message || "Connection successful");
    } catch (err) {
      setTestResult("fail");
      setTestMessage(err.message || "Connection test failed");
    }
  };

  const handleReconnect = async (config) => {
    setReconnecting(config.id);
    try {
      const result = await api.reconnect(config.id);
      addConnection({
        conn_id: result.conn_id,
        db_type: config.db_type,
        database_name: result.database_name || config.database,
        tables_found: result.tables_found,
      });
    } catch (err) {
      setError(err.message || "Reconnect failed");
    } finally {
      setReconnecting(null);
    }
  };

  const handleDisconnectLive = async (saved) => {
    const match = connections.find(
      (c) => c.database_name === saved.database && c.db_type === saved.db_type
    );
    if (match) {
      try { await api.disconnectDB(match.conn_id); } catch {}
      removeConnection(match.conn_id);
    }
  };

  const handleDeleteSaved = async (configId) => {
    try {
      await api.deleteSavedConnection(configId);
      setSavedConnections(savedConnections.filter((c) => c.id !== configId));
    } catch (err) {
      setError(err.message || "Delete failed");
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#06060e] relative">
      {/* Background mesh */}
      <div className="fixed inset-0 mesh-gradient opacity-30 pointer-events-none" />
      <AnimatedBackground className="fixed inset-0 pointer-events-none" />

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 glass-navbar sticky top-0 z-20">
        <div>
          <h1 className="text-xl font-bold text-white">Connect Database</h1>
          <p className="text-xs text-gray-400">Choose a database engine to get started</p>
        </div>
        <UserDropdown />
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8 pb-12 relative z-10">

        {/* ── Connection overlay states ─────────────────────── */}
        <AnimatePresence>
          {status === "connecting" && (
            <motion.div
              key="connecting-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="fixed inset-0 bg-[#06060e]/95 backdrop-blur-sm z-50 flex items-center justify-center"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
                className="text-center"
              >
                <div className="relative w-24 h-24 mx-auto mb-6">
                  <div className="absolute inset-0 rounded-full border-2 border-indigo-500/30 pulse-ring" />
                  <div className="absolute inset-0 rounded-full border-2 border-indigo-500/20 pulse-ring" style={{ animationDelay: "0.5s" }} />
                  <div className="absolute inset-2 rounded-full glass flex items-center justify-center">
                    <DbIcon className={`w-6 h-6 ${db?.iconColor || "text-white"}`} />
                  </div>
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Connecting to {db?.name}...</h3>
                <p className="text-gray-500 text-sm">Discovering schema and training AI</p>
                <div className="mt-4 flex items-center justify-center gap-1.5">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
                <button
                  onClick={() => { setStatus("idle"); }}
                  className="mt-6 px-5 py-2 glass text-gray-400 text-sm rounded-full hover:text-white hover:border-indigo-500/40 transition-all duration-200 cursor-pointer"
                >
                  Cancel
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {status === "success" && (
            <motion.div
              key="success-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="fixed inset-0 bg-[#06060e]/95 backdrop-blur-sm z-50 flex items-center justify-center"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
                className="text-center"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 260, damping: 20, delay: 0.1 }}
                  className="w-24 h-24 mx-auto mb-6 rounded-full bg-green-500/10 border-2 border-green-500 flex items-center justify-center shadow-lg shadow-green-500/20"
                >
                  <svg className="w-12 h-12 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path className="check-draw" strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </motion.div>
                <h3 className="text-xl font-bold text-white mb-2">Connected!</h3>
                {tablesFound != null && (
                  <p className="text-indigo-400 text-sm font-medium mb-1">{tablesFound} table{tablesFound !== 1 ? "s" : ""} discovered</p>
                )}
                <p className="text-gray-400 text-sm">Loading schema explorer...</p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Saved connections ─────────────────────────────── */}
        {savedConnections.length > 0 && !selected && status === "idle" && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-white mb-3">Saved Databases</h2>
            {error && (
              <motion.div
                role="alert"
                animate={{ x: [0, -8, 8, -4, 4, 0] }}
                transition={{ duration: 0.4 }}
                className="bg-red-900/30 border border-red-800 text-red-400 rounded-lg p-3 mb-3 text-sm"
              >
                {error}
              </motion.div>
            )}
            <StaggerContainer className="space-y-2">
              {savedConnections.map((saved) => {
                const info = DB_LABELS[saved.db_type] || { name: saved.db_type };
                const live = isLive(saved);
                const isReconnecting = reconnecting === saved.id;

                return (
                  <StaggerItem key={saved.id} className="flex items-center justify-between glass-card rounded-xl px-4 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <DbIcon className={`w-5 h-5 flex-shrink-0 ${DB_MAP[saved.db_type]?.iconColor || "text-gray-400"}`} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-white font-medium truncate">{saved.label || saved.database}</span>
                          <span className="text-xs px-2 py-0.5 bg-gray-800 text-gray-500 rounded-full flex-shrink-0">{info.name}</span>
                        </div>
                        {saved.label && saved.database && <p className="text-xs text-gray-600 truncate">{saved.database}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {live ? (
                        <MotionButton onClick={() => handleDisconnectLive(saved)} className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-lg bg-green-900/20 border border-green-800/50 text-green-400 hover:bg-green-900/40 transition cursor-pointer" aria-label={`Disconnect ${saved.label || saved.database}`}>
                          <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" /></span>
                          Connected
                        </MotionButton>
                      ) : (
                        <MotionButton onClick={() => handleReconnect(saved)} disabled={isReconnecting} className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-lg bg-red-900/20 border border-red-800/50 text-red-400 hover:bg-red-900/40 transition cursor-pointer disabled:opacity-50" aria-label={`Reconnect ${saved.label || saved.database}`}>
                          {isReconnecting ? <div className="w-3 h-3 border-2 border-red-400 border-t-transparent rounded-full animate-spin" /> : <span className="relative flex h-2 w-2"><span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" /></span>}
                          {isReconnecting ? "Connecting..." : "Disconnected"}
                        </MotionButton>
                      )}
                      {deleteConfirm === saved.id ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-gray-400">Are you sure?</span>
                          <button onClick={() => { handleDeleteSaved(saved.id); setDeleteConfirm(null); }} className="px-2 py-0.5 text-xs font-medium rounded-lg bg-red-900/30 border border-red-800/50 text-red-400 hover:bg-red-900/50 transition cursor-pointer" aria-label="Confirm delete connection">Yes</button>
                          <button onClick={() => setDeleteConfirm(null)} className="px-2 py-0.5 text-xs font-medium rounded-lg glass text-gray-400 hover:text-white transition cursor-pointer" aria-label="Cancel delete connection">No</button>
                        </div>
                      ) : (
                        <button onClick={() => setDeleteConfirm(saved.id)} className="p-1.5 text-gray-600 hover:text-red-400 transition cursor-pointer rounded-lg hover:bg-gray-800" title="Remove saved connection" aria-label="Delete saved connection">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      )}
                    </div>
                  </StaggerItem>
                );
              })}
            </StaggerContainer>
            <div className="mt-4 flex items-center gap-2 text-sm text-gray-400">
              <span>Select a database below to add another connection, or</span>
              <button onClick={() => navigate("/chat")} className="text-indigo-400 hover:text-indigo-300 font-medium transition cursor-pointer">go to chat</button>
            </div>
          </div>
        )}

        {/* ── Live-only connections (no saved) ─────────────── */}
        {connections.length > 0 && savedConnections.length === 0 && !selected && status === "idle" && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-white mb-3">Connected Databases</h2>
            <div className="space-y-2">
              {connections.map((conn) => {
                const lbl = DB_LABELS[conn.db_type] || { name: conn.db_type };
                return (
                  <div key={conn.conn_id} className="flex items-center justify-between glass-card rounded-xl px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="relative flex h-2.5 w-2.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" /><span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" /></span>
                      <DbIcon className={`w-5 h-5 ${DB_MAP[conn.db_type]?.iconColor || "text-gray-400"}`} />
                      <span className="text-white font-medium">{conn.database_name}</span>
                      <span className="text-xs text-gray-500">{lbl.name}</span>
                    </div>
                    <MotionButton onClick={async () => { try { await api.disconnectDB(conn.conn_id); } catch {} removeConnection(conn.conn_id); }} className="px-3 py-1 text-xs font-medium text-red-400 bg-red-900/20 border border-red-800/50 rounded-lg hover:bg-red-900/40 transition cursor-pointer" aria-label={`Disconnect ${conn.database_name}`}>Disconnect</MotionButton>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex items-center gap-2 text-sm text-gray-400">
              <span>Select a database below to add another connection, or</span>
              <button onClick={() => navigate("/chat")} className="text-indigo-400 hover:text-indigo-300 font-medium transition cursor-pointer">go to chat</button>
            </div>
          </div>
        )}

        {/* ── Categorized DB cards ─────────────────────────── */}
        {!selected && status === "idle" && (
          <div className="space-y-10">
            {DB_CATEGORIES.map((cat) => (
              <div key={cat.title}>
                <div className="mb-4">
                  <h2 className="text-lg font-bold text-white">{cat.title}</h2>
                  <p className="text-xs text-gray-500">{cat.subtitle}</p>
                </div>
                <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {cat.dbs.map((d) => (
                    <StaggerItem key={d.id} as="div">
                      <motion.button
                        onClick={() => { setSelected(d.id); setForm({}); setLabel(""); setStatus("idle"); setError(""); setTestResult(null); setTestMessage(""); setDeleteConfirm(null); }}
                        className="w-full glass-card rounded-2xl p-5 text-left transition-all duration-300 cursor-pointer group"
                        whileHover={{ y: -4 }}
                        transition={{ type: "spring", stiffness: 400, damping: 17 }}
                      >
                        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${d.color} flex items-center justify-center mb-3 group-hover:scale-110 group-hover:shadow-lg transition-all duration-300`}>
                          <DbIcon className="w-5 h-5 text-white" />
                        </div>
                        <h3 className="text-base font-bold text-white mb-0.5">{d.name}</h3>
                        <p className="text-xs text-gray-500 leading-relaxed">{d.desc}</p>
                      </motion.button>
                    </StaggerItem>
                  ))}
                </StaggerContainer>
              </div>
            ))}
          </div>
        )}

        {/* ── Connection form ──────────────────────────────── */}
        <AnimatePresence mode="wait">
          {selected && status === "idle" && db && (
            <motion.div
              key="connection-form"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ type: "spring", stiffness: 300, damping: 28 }}
              className="max-w-md mx-auto"
            >
              <button onClick={() => setSelected(null)} className="flex items-center gap-2 text-sm text-gray-500 hover:text-white mb-6 transition cursor-pointer group" aria-label="Back to databases">
                <svg className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                Back to databases
              </button>

              <div className="glass-card rounded-2xl p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${db.color} flex items-center justify-center shadow-lg`}>
                    <DbIcon className="w-5 h-5 text-white" />
                  </div>
                  <h2 className="text-xl font-bold text-white">{db.name}</h2>
                </div>

                {error && (
                  <motion.div
                    role="alert"
                    animate={{ x: [0, -8, 8, -4, 4, 0] }}
                    transition={{ duration: 0.4 }}
                    className="bg-red-900/20 border border-red-800/50 text-red-400 rounded-lg p-3 mb-4 text-sm backdrop-blur-sm"
                  >
                    {error}
                  </motion.div>
                )}

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Connection Label <span className="text-gray-600">(optional)</span></label>
                    <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Production DB, Staging Analytics" className="w-full glass-input rounded-lg px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none input-glow transition" />
                  </div>

                  {db.fields.map((field) => (
                    <div key={field.key}>
                      <label className="block text-sm text-gray-400 mb-1">{field.label}</label>
                      <input
                        type={field.type}
                        value={form[field.key] || ""}
                        onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                        placeholder={field.placeholder}
                        className="w-full glass-input rounded-lg px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none input-glow transition"
                      />
                    </div>
                  ))}
                </div>

                {testResult && testResult !== "testing" && (
                  <div role="alert" className={`mt-4 rounded-lg p-3 text-sm backdrop-blur-sm ${testResult === "success" ? "bg-green-900/20 border border-green-800/50 text-green-400" : "bg-red-900/20 border border-red-800/50 text-red-400"}`}>
                    {testMessage}
                  </div>
                )}

                <div className="flex gap-3 mt-6">
                  <MotionButton onClick={handleTestConnection} disabled={testResult === "testing"} className="flex-1 py-3 glass text-white font-bold rounded-xl hover:border-indigo-500/40 transition-all duration-300 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2">
                    {testResult === "testing" ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Testing...
                      </>
                    ) : "Test Connection"}
                  </MotionButton>
                  <MotionButton onClick={handleConnect} className="flex-1 py-3 bg-gradient-to-r from-indigo-500 to-violet-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/35 transition-all duration-300 cursor-pointer btn-glow">
                    Connect & Save
                  </MotionButton>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Error state ──────────────────────────────────── */}
        {status === "error" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="max-w-md mx-auto text-center"
          >
            <div role="alert" className="glass-card border-red-800/30 rounded-2xl p-8">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/10 flex items-center justify-center">
                <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Connection Failed</h3>
              <motion.p
                animate={{ x: [0, -8, 8, -4, 4, 0] }}
                transition={{ duration: 0.4 }}
                className="text-sm text-gray-400 mb-6"
              >
                {error}
              </motion.p>
              <div className="flex items-center justify-center gap-3">
                <MotionButton onClick={() => setStatus("idle")} className="px-5 py-2 glass text-white text-sm rounded-full hover:border-indigo-500/40 transition-all duration-200 cursor-pointer">Edit credentials</MotionButton>
                <MotionButton onClick={handleConnect} className="px-5 py-2 bg-gradient-to-r from-indigo-500 to-violet-500 text-white text-sm font-semibold rounded-full shadow-lg shadow-indigo-500/20 hover:-translate-y-0.5 transition-all duration-300 cursor-pointer btn-glow">Retry</MotionButton>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
