import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../api";
import ERDiagram from "../components/ERDiagram";
import { StaggerContainer, StaggerItem } from "../components/animation/StaggerContainer";
import MotionButton from "../components/animation/MotionButton";
import { ChartSkeleton } from "../components/animation/SkeletonLoader";

export default function SchemaView() {
  const [tables, setTables] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [loadingSchema, setLoadingSchema] = useState(true);
  const [loadingSuggestions, setLoadingSuggestions] = useState(true);
  const [savedPositions, setSavedPositions] = useState(null);
  const [tableSearch, setTableSearch] = useState("");
  const [erZoom, setErZoom] = useState(1);
  const connIdRef = useRef(null);
  const navigate = useNavigate();

  const filteredTables = tableSearch
    ? tables.filter((t) => {
        const q = tableSearch.toLowerCase();
        return (t.name || t.table_name || "").toLowerCase().includes(q) ||
          (t.columns || []).some((c) => (c.name || c.column_name || "").toLowerCase().includes(q));
      })
    : tables;

  useEffect(() => {
    api.getTables()
      .then((data) => {
        setTables(data.tables || []);
        connIdRef.current = data.conn_id || null;
        if (data.conn_id) {
          api.getERPositions(data.conn_id)
            .then((res) => setSavedPositions(res.positions || null))
            .catch(() => {});
        }
      })
      .catch(() => {})
      .finally(() => setLoadingSchema(false));

    api.getSuggestions()
      .then((data) => setSuggestions(data.suggestions || []))
      .catch(() => {})
      .finally(() => setLoadingSuggestions(false));
  }, []);

  const saveTimerRef = useRef(null);
  const handlePositionsChange = useCallback((positions) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      api.saveERPositions(positions, connIdRef.current).catch(() => {});
    }, 500);
  }, []);

  return (
    <div className="flex-1 overflow-y-auto bg-[#06060e] relative">
      <div className="fixed inset-0 mesh-gradient opacity-30 pointer-events-none" />
      {/* Header */}
      <div className="glass-navbar sticky top-0 z-20 flex items-center justify-between px-6 py-3">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
        >
          <h1 className="text-xl font-bold text-white">Schema Explorer</h1>
          <p className="text-xs text-gray-400">Drag tables to rearrange &middot; {tables.length} tables discovered</p>
        </motion.div>
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-yellow-500" />PK</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-indigo-500" />FK</span>
            <span className="flex items-center gap-1.5">
              <svg className="w-3 h-2" viewBox="0 0 12 8"><path d="M0 4 L8 4" stroke="#6366f1" strokeWidth="1.5" /><polygon points="8 1, 12 4, 8 7" fill="#6366f1" /></svg>
              Relation
            </span>
          </div>
          <MotionButton
            onClick={() => navigate("/chat")}
            className="px-5 py-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-sm font-medium rounded-lg transition cursor-pointer btn-glow shadow-lg shadow-indigo-500/20"
          >
            Start Querying
          </MotionButton>
        </div>
      </div>

      <div className="px-4 py-6 max-w-7xl mx-auto relative z-10">
        {/* ER Diagram */}
        <motion.div
          className="mb-10"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.4 }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="w-2 h-2 bg-indigo-500 rounded-full" aria-hidden="true" />
              Entity Relationship Diagram
            </h2>
            <div className="flex items-center gap-3">
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={tableSearch}
                  onChange={(e) => setTableSearch(e.target.value)}
                  placeholder="Search tables or columns..."
                  className="glass-input rounded-lg pl-9 pr-3 py-1.5 text-sm text-white placeholder-gray-500 w-64 input-glow"
                  aria-label="Search tables"
                />
                <AnimatePresence>
                  {tableSearch && (
                    <motion.button
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.5 }}
                      onClick={() => setTableSearch("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white cursor-pointer"
                      aria-label="Clear search"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>
              <button
                onClick={() => { setSavedPositions(null); }}
                className="glass hover:bg-white/10 text-gray-400 hover:text-white text-xs px-3 py-1.5 rounded-lg transition cursor-pointer"
                aria-label="Reset diagram layout"
              >
                Auto-layout
              </button>
              {tableSearch && (
                <span className="text-xs text-gray-500">{filteredTables.length} of {tables.length}</span>
              )}
            </div>
          </div>
          {loadingSchema ? (
            <ChartSkeleton className="h-48" />
          ) : (
            <motion.div
              className="relative overflow-auto"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              <div className="absolute top-3 right-3 flex items-center gap-1 glass rounded-lg px-2 py-1 z-10">
                <button onClick={() => setErZoom(z => Math.max(0.25, z - 0.15))} className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-white rounded transition" aria-label="Zoom out">-</button>
                <span className="text-xs text-gray-400 w-10 text-center">{Math.round(erZoom * 100)}%</span>
                <button onClick={() => setErZoom(z => Math.min(2, z + 0.15))} className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-white rounded transition" aria-label="Zoom in">+</button>
                <button onClick={() => setErZoom(1)} className="text-xs text-gray-500 hover:text-white ml-1 transition" aria-label="Reset zoom">Reset</button>
              </div>
              <div style={{ transform: `scale(${erZoom})`, transformOrigin: 'top left', transition: 'transform 0.2s ease' }}>
                <ERDiagram tables={tableSearch ? filteredTables : tables} savedPositions={savedPositions} onPositionsChange={handlePositionsChange} />
              </div>
            </motion.div>
          )}
        </motion.div>

        {/* Suggested Questions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.4 }}
        >
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <span className="w-2 h-2 bg-violet-500 rounded-full" />
            Suggested Questions
          </h2>
          {loadingSuggestions ? (
            <div className="flex items-center gap-3 text-gray-500 text-sm">
              <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
              AI is analyzing your schema for smart suggestions...
            </div>
          ) : suggestions.length > 0 ? (
            <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {suggestions.map((q, i) => (
                <StaggerItem key={i}>
                  <motion.button
                    onClick={() => navigate("/chat", { state: { prefill: q } })}
                    whileHover={{ y: -3, transition: { duration: 0.2 } }}
                    className="w-full text-left glass-card rounded-xl px-5 py-4 text-sm text-gray-300 hover:border-indigo-500/50 transition-all duration-200 cursor-pointer group"
                  >
                    <span className="text-indigo-400 mr-2 group-hover:text-indigo-300">?</span>
                    {q}
                  </motion.button>
                </StaggerItem>
              ))}
            </StaggerContainer>
          ) : (
            <p className="text-gray-600 text-sm">Connect a database to get AI-powered query suggestions.</p>
          )}
        </motion.div>
      </div>
    </div>
  );
}
