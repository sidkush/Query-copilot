import { useState } from "react";
// eslint-disable-next-line no-unused-vars
import { motion } from "framer-motion";
import { api } from "../../api";
import { useStore } from "../../store";

const CONFETTI_COLORS = [
  "#818cf8", "#a78bfa", "#c084fc", "#f472b6", "#34d399",
  "#38bdf8", "#facc15", "#fb923c", "#f87171", "#22d3ee",
];

const CONFETTI_DOTS = Array.from({ length: 24 }, (_, i) => ({
  id: i,
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  x: Math.random() * 100,
  delay: Math.random() * 0.6,
  size: 4 + Math.random() * 6,
}));

function ConfettiCelebration() {
  const dots = CONFETTI_DOTS;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {dots.map((d) => (
        <motion.div
          key={d.id}
          initial={{ opacity: 0, y: 20, scale: 0 }}
          animate={{ opacity: [0, 1, 1, 0], y: [-10, -40, -70, -100], scale: [0, 1.2, 1, 0.5] }}
          transition={{ duration: 1.8, delay: d.delay, ease: "easeOut" }}
          className="absolute rounded-full"
          style={{
            left: `${d.x}%`,
            bottom: "30%",
            width: d.size,
            height: d.size,
            background: d.color,
          }}
        />
      ))}
    </div>
  );
}

export default function OnboardingFirstQuery({ onNext }) {
  const connections = useStore((s) => s.connections);
  const [question, setQuestion] = useState("What are the top 10 records?");
  const [loading, setLoading] = useState(false);
  const [generatedSQL, setGeneratedSQL] = useState(null);
  const [error, setError] = useState("");
  const [showConfetti, setShowConfetti] = useState(false);

  const hasConnections = connections && connections.length > 0;
  const connId = hasConnections ? connections[0].conn_id : null;

  const handleSubmit = async () => {
    if (!question.trim() || !connId) return;
    setLoading(true);
    setError("");
    setGeneratedSQL(null);
    try {
      const data = await api.generateSQL(question, connId);
      setGeneratedSQL(data.sql || data.generated_sql || "-- No SQL generated");
      setShowConfetti(true);
    } catch (err) {
      setError(err.message || "Failed to generate SQL");
    } finally {
      setLoading(false);
    }
  };

  // No connections state
  if (!hasConnections) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card rounded-2xl p-8 max-w-md w-full text-center"
        >
          <div className="w-14 h-14 rounded-full bg-indigo-500/20 flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">Connect a database to start asking questions</h3>
          <p className="text-sm text-gray-400 mb-6">
            You need at least one database connection to try your first query.
          </p>
          <button
            onClick={() => { window.location.href = "/schema"; }}
            className="px-6 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition"
          >
            Connect Database
          </button>
        </motion.div>
      </div>
    );
  }

  // Has connections — mini chat interface
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card rounded-2xl p-8 max-w-lg w-full relative"
      >
        {showConfetti && <ConfettiCelebration />}

        <h3 className="text-lg font-semibold text-white mb-1">Try your first query</h3>
        <p className="text-sm text-gray-400 mb-5">Ask a question and see the SQL we generate.</p>

        {/* Chat-like input */}
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !loading) handleSubmit(); }}
            className="flex-1 glass-input rounded-lg px-4 py-2.5 text-white text-sm input-glow"
            placeholder="Ask a question about your data..."
          />
          <button
            onClick={handleSubmit}
            disabled={loading || !question.trim()}
            className="px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium transition flex-shrink-0"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Generating
              </span>
            ) : (
              "Ask"
            )}
          </button>
        </div>

        {/* Error */}
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="bg-red-900/20 border border-red-800/50 text-red-400 rounded-lg p-3 text-sm mb-4"
          >
            {error}
          </motion.div>
        )}

        {/* Generated SQL */}
        {generatedSQL && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4"
          >
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Generated SQL</p>
            <pre className="glass rounded-lg p-4 text-sm text-green-400 font-mono overflow-x-auto whitespace-pre-wrap">
              {generatedSQL}
            </pre>
          </motion.div>
        )}

        {/* Go to Dashboard button — shown after successful generation */}
        {generatedSQL && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-center"
          >
            <button
              onClick={onNext}
              className="px-6 py-2.5 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white text-sm font-medium transition"
            >
              Go to Dashboard
            </button>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
