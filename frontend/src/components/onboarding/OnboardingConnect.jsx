import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../../api";
import { useStore } from "../../store";

const DB_OPTIONS = [
  { key: "postgresql", name: "PostgreSQL", color: "text-blue-400 border-blue-700/40 bg-blue-500/10", defaultPort: "5432" },
  { key: "mysql", name: "MySQL", color: "text-orange-400 border-orange-700/40 bg-orange-500/10", defaultPort: "3306" },
  { key: "snowflake", name: "Snowflake", color: "text-cyan-400 border-cyan-700/40 bg-cyan-500/10", defaultPort: "" },
  { key: "bigquery", name: "BigQuery", color: "text-indigo-400 border-indigo-700/40 bg-indigo-500/10", defaultPort: "" },
  { key: "redshift", name: "Redshift", color: "text-orange-400 border-orange-700/40 bg-orange-500/10", defaultPort: "5439" },
  { key: "sqlite", name: "SQLite", color: "text-gray-400 border-gray-700/40 bg-gray-500/10", defaultPort: "" },
];

const STATUS_IDLE = "idle";
const STATUS_CONNECTING = "connecting";
const STATUS_SUCCESS = "success";
const STATUS_ERROR = "error";

export default function OnboardingConnect({ onNext }) {
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ host: "", port: "", database: "", user: "", password: "" });
  const [status, setStatus] = useState(STATUS_IDLE);
  const [errorMsg, setErrorMsg] = useState("");
  const [tableCount, setTableCount] = useState(0);
  const addConnection = useStore((s) => s.addConnection);

  const handleSelect = (dbKey) => {
    const opt = DB_OPTIONS.find((d) => d.key === dbKey);
    setSelected(dbKey);
    setForm({ host: "", port: opt?.defaultPort || "", database: "", user: "", password: "" });
    setStatus(STATUS_IDLE);
    setErrorMsg("");
  };

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleConnect = async (e) => {
    e.preventDefault();
    if (!selected || status === STATUS_CONNECTING) return;

    setStatus(STATUS_CONNECTING);
    setErrorMsg("");

    try {
      const result = await api.connectDB(selected, {
        host: form.host,
        port: form.port ? parseInt(form.port, 10) : undefined,
        database: form.database,
        username: form.user,
        password: form.password,
      });
      addConnection(result);
      setTableCount(result.table_count || result.tables?.length || 0);
      setStatus(STATUS_SUCCESS);
      setTimeout(() => onNext(), 1500);
    } catch (err) {
      setStatus(STATUS_ERROR);
      setErrorMsg(err.message || "Connection failed. Check your credentials.");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-lg w-full">
        <motion.h2
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-xl font-bold text-white text-center mb-2"
        >
          Connect your database
        </motion.h2>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="text-sm text-gray-400 text-center mb-8"
        >
          Choose a database to start querying with natural language.
        </motion.p>

        {/* DB type grid */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {DB_OPTIONS.map((db, idx) => (
            <motion.button
              key={db.key}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: idx * 0.05 }}
              onClick={() => handleSelect(db.key)}
              className={`border rounded-xl p-4 text-center transition-all duration-200 cursor-pointer ${
                selected === db.key
                  ? `${db.color} border-purple-500/50 shadow-lg shadow-purple-500/10`
                  : `${db.color} hover:border-white/20`
              }`}
            >
              <span className="text-sm font-medium">{db.name}</span>
            </motion.button>
          ))}
        </div>

        {/* Connection form */}
        <AnimatePresence mode="wait">
          {selected && status !== STATUS_SUCCESS && (
            <motion.form
              key={selected}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              onSubmit={handleConnect}
              className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6 space-y-3"
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">Host</label>
                  <input
                    type="text"
                    value={form.host}
                    onChange={(e) => handleChange("host", e.target.value)}
                    placeholder="localhost"
                    className="w-full glass-input rounded-lg px-3 py-2 text-white text-sm input-glow"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">Port</label>
                  <input
                    type="text"
                    value={form.port}
                    onChange={(e) => handleChange("port", e.target.value)}
                    placeholder="5432"
                    className="w-full glass-input rounded-lg px-3 py-2 text-white text-sm input-glow"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">Database</label>
                <input
                  type="text"
                  value={form.database}
                  onChange={(e) => handleChange("database", e.target.value)}
                  placeholder="my_database"
                  className="w-full glass-input rounded-lg px-3 py-2 text-white text-sm input-glow"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">User</label>
                  <input
                    type="text"
                    value={form.user}
                    onChange={(e) => handleChange("user", e.target.value)}
                    placeholder="username"
                    className="w-full glass-input rounded-lg px-3 py-2 text-white text-sm input-glow"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">Password</label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => handleChange("password", e.target.value)}
                    placeholder="password"
                    className="w-full glass-input rounded-lg px-3 py-2 text-white text-sm input-glow"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={status === STATUS_CONNECTING}
                className="w-full py-3 rounded-xl text-white font-semibold bg-purple-600 hover:bg-purple-500 shadow-lg shadow-purple-500/25 transition-all duration-200 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
              >
                {status === STATUS_CONNECTING && (
                  <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                )}
                {status === STATUS_CONNECTING ? "Connecting..." : "Connect"}
              </button>

              <AnimatePresence>
                {status === STATUS_ERROR && errorMsg && (
                  <motion.p
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="text-sm text-red-400"
                  >
                    {errorMsg}
                  </motion.p>
                )}
              </AnimatePresence>
            </motion.form>
          )}

          {status === STATUS_SUCCESS && (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-8"
            >
              <div className="w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-3">
                <svg className="w-7 h-7 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-white font-semibold">Connected!</p>
              {tableCount > 0 && (
                <p className="text-sm text-gray-400 mt-1">Found {tableCount} tables</p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Skip link */}
        {status !== STATUS_SUCCESS && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="text-center mt-6"
          >
            <button
              onClick={onNext}
              className="text-sm text-gray-500 hover:text-gray-300 underline underline-offset-2 transition cursor-pointer"
            >
              Skip for now
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );
}
