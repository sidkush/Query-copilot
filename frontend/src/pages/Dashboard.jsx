import { useState, useEffect, useRef, useCallback, Suspense, Component, lazy } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { StaggerContainer, StaggerItem } from "../components/animation/StaggerContainer";
import AnimatedBackground from "../components/animation/AnimatedBackground";
import { api } from "../api";
import { useStore } from "../store";
import UserDropdown from "../components/UserDropdown";
import SavedDbPill from "../components/SavedDbPill";
import { GPUTierProvider } from "../lib/gpuDetect";
const PageBackground3D = lazy(() => import("../components/animation/PageBackground3D"));
class _WebGLBound extends Component { constructor(p){super(p);this.state={e:false};} static getDerivedStateFromError(){return{e:true};} render(){return this.state.e?this.props.fallback:this.props.children;} }

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
  const [turboStates, setTurboStates] = useState({}); // conn_id → {enabled, syncing, twinInfo}
  const turboPolls = useRef({}); // conn_id → interval ID
  const navigate = useNavigate();
  const connections = useStore((s) => s.connections);
  const addConnection = useStore((s) => s.addConnection);
  const removeConnection = useStore((s) => s.removeConnection);
  const savedConnections = useStore((s) => s.savedConnections);
  const setSavedConnections = useStore((s) => s.setSavedConnections);
  const setConnections = useStore((s) => s.setConnections);
  const setTurboStatus = useStore((s) => s.setTurboStatus);

  const db = DB_MAP[selected] || null;

  // Fetch turbo status for all live connections
  const fetchTurboStatuses = useCallback(async (conns) => {
    for (const c of conns) {
      try {
        const status = await api.getTurboStatus(c.conn_id);
        setTurboStates((prev) => ({ ...prev, [c.conn_id]: status }));
        setTurboStatus(c.conn_id, status);
      } catch { /* turbo not available for this connection */ }
    }
  }, [setTurboStatus]);

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
        // Always update — clears stale localStorage connections when backend has none
        setConnections(live);
        if (live.length > 0) fetchTurboStatuses(live);
      })
      .catch(() => {});
    // Cleanup polling on unmount
    return () => Object.values(turboPolls.current).forEach(clearInterval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTurboToggle = async (connId, currentlyEnabled) => {
    try {
      if (currentlyEnabled) {
        await api.disableTurbo(connId);
        setTurboStates((prev) => ({ ...prev, [connId]: { enabled: false, syncing: false, twin_info: null } }));
        setTurboStatus(connId, { enabled: false, syncing: false });
        if (turboPolls.current[connId]) {
          clearInterval(turboPolls.current[connId]);
          delete turboPolls.current[connId];
        }
      } else {
        await api.enableTurbo(connId);
        setTurboStates((prev) => ({ ...prev, [connId]: { enabled: true, syncing: true, twin_info: null } }));
        setTurboStatus(connId, { enabled: true, syncing: true });
        // Poll for sync completion every 3s
        turboPolls.current[connId] = setInterval(async () => {
          try {
            const status = await api.getTurboStatus(connId);
            setTurboStates((prev) => ({ ...prev, [connId]: status }));
            setTurboStatus(connId, status);
            if (status.enabled && !status.syncing) {
              clearInterval(turboPolls.current[connId]);
              delete turboPolls.current[connId];
            }
          } catch {
            clearInterval(turboPolls.current[connId]);
            delete turboPolls.current[connId];
          }
        }, 3000);
      }
    } catch (err) {
      setError(err.message || "Turbo mode toggle failed");
    }
  };

  const isLive = (saved) => {
    // BigQuery uses project/dataset, not database — normalize for comparison
    const savedDbName = saved.database || saved.project || saved.host || "";
    return connections.some(
      (c) => c.db_type === saved.db_type && (
        c.database_name === savedDbName ||
        c.conn_id === saved.id  // Fallback: match by conn_id if names differ
      )
    );
  };

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
    // Normalize database name same as isLive() — BigQuery uses project, not database
    const savedDbName = saved.database || saved.project || saved.host || "";
    const match = connections.find(
      (c) => c.db_type === saved.db_type && (
        c.database_name === savedDbName ||
        c.conn_id === saved.id
      )
    );
    if (match) {
      try { await api.disconnectDB(match.conn_id); } catch { /* noop */ }
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
    <div className="flex-1 overflow-y-auto relative" style={{ background: 'var(--bg-page)' }}>
      {/* Background mesh */}
      <div className="fixed inset-0 mesh-gradient opacity-30 pointer-events-none" />
      <GPUTierProvider>
        <_WebGLBound fallback={<AnimatedBackground className="fixed inset-0 pointer-events-none" />}>
          <Suspense fallback={<AnimatedBackground className="fixed inset-0 pointer-events-none" />}>
            <PageBackground3D mode="data" className="fixed inset-0" />
          </Suspense>
        </_WebGLBound>
      </GPUTierProvider>

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 glass-navbar sticky top-0 z-20">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Connect database</h1>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Choose a database engine to get started</p>
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
              className="fixed inset-0 backdrop-blur-sm z-50 flex items-center justify-center" style={{ background: 'color-mix(in srgb, var(--bg-page) 95%, transparent)' }}
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
                <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Connecting to {db?.name}...</h3>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Discovering schema and training AI</p>
                <div className="mt-4 flex items-center justify-center gap-1.5">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
                <button
                  onClick={() => { setStatus("idle"); }}
                  className="mt-6 px-5 py-2 glass text-sm rounded-full hover:border-indigo-500/40 transition-all duration-200 cursor-pointer" style={{ color: 'var(--text-secondary)' }}
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
              className="fixed inset-0 backdrop-blur-sm z-50 flex items-center justify-center" style={{ background: 'color-mix(in srgb, var(--bg-page) 95%, transparent)' }}
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
                <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Connected!</h3>
                {tablesFound != null && (
                  <p className="text-indigo-400 text-sm font-medium mb-1">{tablesFound} table{tablesFound !== 1 ? "s" : ""} discovered</p>
                )}
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loading schema explorer...</p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Saved connections ─────────────────────────────── */}
        {savedConnections.length > 0 && !selected && status === "idle" && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Saved databases</h2>
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
            <StaggerContainer className="space-y-3">
              {savedConnections.map((saved) => {
                const info = DB_LABELS[saved.db_type] || { name: saved.db_type };
                const live = isLive(saved);
                const isReconnecting = reconnecting === saved.id;
                // Find the live conn_id for turbo operations
                const savedDbName = saved.database || saved.project || saved.host || "";
                const liveConn = connections.find(
                  (c) => c.db_type === saved.db_type && (c.database_name === savedDbName || c.conn_id === saved.id)
                );
                const liveConnId = liveConn?.conn_id;
                const turbo = liveConnId ? turboStates[liveConnId] : null;
                const turboEnabled = turbo?.enabled || false;
                const turboSyncing = turbo?.syncing || false;
                const turboInfo = turbo?.twin_info || null;

                return (
                  <StaggerItem key={saved.id}>
                    <SavedDbPill
                      saved={saved}
                      dbName={info.name}
                      icon={
                        <DbIcon className={`w-5 h-5 ${DB_MAP[saved.db_type]?.iconColor || "text-gray-400"}`} />
                      }
                      live={live}
                      isReconnecting={isReconnecting}
                      turboEnabled={turboEnabled}
                      turboSyncing={turboSyncing}
                      turboInfo={turboInfo}
                      liveConnId={liveConnId}
                      onReconnect={handleReconnect}
                      onDisconnect={handleDisconnectLive}
                      onTurboToggle={handleTurboToggle}
                      deleteConfirm={deleteConfirm === saved.id}
                      onRequestDelete={() => setDeleteConfirm(saved.id)}
                      onConfirmDelete={() => { handleDeleteSaved(saved.id); setDeleteConfirm(null); }}
                      onCancelDelete={() => setDeleteConfirm(null)}
                    />
                  </StaggerItem>
                );
              })}
            </StaggerContainer>
            <div className="mt-4 flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
              <span>Select a database below to add another connection, or</span>
              <button onClick={() => navigate("/chat")} className="text-indigo-400 hover:text-indigo-300 font-medium transition cursor-pointer">go to chat</button>
            </div>
          </div>
        )}

        {/* ── Live-only connections (no saved) ─────────────── */}
        {connections.length > 0 && savedConnections.length === 0 && !selected && status === "idle" && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Connected databases</h2>
            <div className="space-y-2">
              {connections.map((conn) => {
                const lbl = DB_LABELS[conn.db_type] || { name: conn.db_type };
                return (
                  <div key={conn.conn_id} className="flex items-center justify-between glass-card rounded-xl px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="relative flex h-2.5 w-2.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" /><span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" /></span>
                      <DbIcon className={`w-5 h-5 ${DB_MAP[conn.db_type]?.iconColor || "text-gray-400"}`} />
                      <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{conn.database_name}</span>
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{lbl.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Turbo Mode toggle for live connection */}
                      {(() => {
                        const ts = turboStates[conn.conn_id];
                        const tEnabled = ts?.enabled || false;
                        const tSyncing = ts?.syncing || false;
                        return (
                          <button
                            onClick={() => handleTurboToggle(conn.conn_id, tEnabled)}
                            disabled={tSyncing}
                            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-lg transition cursor-pointer disabled:opacity-60 ${
                              tEnabled && !tSyncing
                                ? "bg-cyan-900/20 border border-cyan-700/50 text-cyan-400 hover:bg-cyan-900/40"
                                : tSyncing
                                ? "bg-amber-900/20 border border-amber-700/50 text-amber-400"
                                : "bg-gray-800/50 border border-gray-700/50 text-gray-500 hover:text-cyan-400 hover:border-cyan-700/50 hover:bg-cyan-900/20"
                            }`}
                            title={tEnabled ? "Disable Turbo Mode" : tSyncing ? "Syncing local replica..." : "Enable DuckDB Turbo Mode for <100ms queries"}
                            aria-label={`${tEnabled ? "Disable" : "Enable"} Turbo Mode`}
                          >
                            {tSyncing ? (
                              <div className="w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                              </svg>
                            )}
                            {tSyncing ? "Syncing..." : "Turbo"}
                          </button>
                        );
                      })()}
                      <motion.button whileTap={{ scale: 0.96 }} transition={{ type: "spring", stiffness: 400, damping: 25 }} onClick={async () => { try { await api.disconnectDB(conn.conn_id); } catch { /* noop */ } removeConnection(conn.conn_id); }} className="px-3 py-1 text-xs font-medium text-red-400 bg-red-900/20 border border-red-800/50 rounded-full hover:bg-red-900/40 ease-spring cursor-pointer" aria-label={`Disconnect ${conn.database_name}`}>Disconnect</motion.button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
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
                  <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{cat.title}</h2>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{cat.subtitle}</p>
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
                        <h3 className="text-base font-bold mb-0.5" style={{ color: 'var(--text-primary)' }}>{d.name}</h3>
                        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>{d.desc}</p>
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
              <button onClick={() => setSelected(null)} className="flex items-center gap-2 text-sm mb-6 transition cursor-pointer group" style={{ color: 'var(--text-muted)' }} aria-label="Back to databases">
                <svg className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                Back to databases
              </button>

              <div className="glass-card rounded-2xl p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${db.color} flex items-center justify-center shadow-lg`}>
                    <DbIcon className="w-5 h-5 text-white" />
                  </div>
                  <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{db.name}</h2>
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
                    <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>Connection label <span style={{ color: 'var(--text-muted)' }}>(optional)</span></label>
                    <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Production DB, Staging Analytics" className="w-full glass-input rounded-lg px-4 py-2.5 placeholder-gray-600 focus:outline-none input-glow transition" style={{ color: 'var(--text-primary)' }} />
                  </div>

                  {db.fields.map((field) => (
                    <div key={field.key}>
                      <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>{field.label}</label>
                      <input
                        type={field.type}
                        value={form[field.key] || ""}
                        onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                        placeholder={field.placeholder}
                        className="w-full glass-input rounded-lg px-4 py-2.5 placeholder-gray-600 focus:outline-none input-glow transition"
                        style={{ color: 'var(--text-primary)' }}
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
                  <motion.button
                    onClick={handleTestConnection}
                    disabled={testResult === "testing"}
                    whileTap={{ scale: 0.98 }}
                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                    className="flex-1 py-3 glass text-white font-semibold rounded-full hover:border-blue-500/40 ease-spring cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {testResult === "testing" ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Testing...
                      </>
                    ) : "Test connection"}
                  </motion.button>
                  <motion.button
                    onClick={handleConnect}
                    whileTap={{ scale: 0.98 }}
                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                    className="group flex-1 flex items-center justify-between pl-6 pr-2 py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-full shadow-lg shadow-blue-600/20 ease-spring cursor-pointer"
                  >
                    <span className="text-sm">Connect &amp; save</span>
                    <span className="flex items-center justify-center w-9 h-9 rounded-full bg-white/15 ease-spring transition-transform duration-300 group-hover:translate-x-1 group-hover:-translate-y-[1px]">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M5 12h14M13 5l7 7-7 7" />
                      </svg>
                    </span>
                  </motion.button>
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
              <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Connection failed</h3>
              <motion.p
                animate={{ x: [0, -8, 8, -4, 4, 0] }}
                transition={{ duration: 0.4 }}
                className="text-sm mb-6"
                style={{ color: 'var(--text-secondary)' }}
              >
                {error}
              </motion.p>
              <div className="flex items-center justify-center gap-3">
                <motion.button
                  onClick={() => setStatus("idle")}
                  whileTap={{ scale: 0.98 }}
                  transition={{ type: "spring", stiffness: 400, damping: 25 }}
                  className="px-5 py-2 glass text-white text-sm font-medium rounded-full hover:border-blue-500/30 ease-spring cursor-pointer"
                >
                  Edit credentials
                </motion.button>
                <motion.button
                  onClick={handleConnect}
                  whileTap={{ scale: 0.98 }}
                  transition={{ type: "spring", stiffness: 400, damping: 25 }}
                  className="group inline-flex items-center gap-2 pl-5 pr-2 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-full shadow-lg shadow-blue-600/15 ease-spring cursor-pointer"
                >
                  <span>Retry</span>
                  <span className="flex items-center justify-center w-7 h-7 rounded-full bg-white/15 ease-spring transition-transform duration-300 group-hover:rotate-180">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M23 4v6h-6M1 20v-6h6" />
                      <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
                    </svg>
                  </span>
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
