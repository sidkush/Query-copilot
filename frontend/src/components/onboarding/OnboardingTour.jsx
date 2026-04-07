import { useState, useEffect, useRef, useCallback } from "react";
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from "framer-motion";
import { CHART_PALETTES } from "../dashboard/tokens";

const PANELS = [
  {
    key: "ask",
    title: "Ask",
    description: "Type a question in plain English",
    typingText: "Show me revenue by region last quarter",
  },
  {
    key: "review",
    title: "Review",
    description: "Inspect the generated SQL before running",
  },
  {
    key: "insight",
    title: "Insight",
    description: "Get charts and summaries instantly",
    bars: [
      { label: "North", pct: 85 },
      { label: "West", pct: 68 },
      { label: "South", pct: 52 },
      { label: "East", pct: 40 },
    ],
  },
];

const SQL_KEYWORDS = new Set(["SELECT", "FROM", "WHERE", "GROUP", "ORDER", "BY", "AS", "SUM", "DESC"]);

const AUTO_ADVANCE_MS = 3500;

function TypingDemo({ text }) {
  const [displayed, setDisplayed] = useState("");
  const indexRef = useRef(0);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDisplayed("");
    indexRef.current = 0;
    const id = setInterval(() => {
      indexRef.current += 1;
      if (indexRef.current > text.length) {
        clearInterval(id);
        return;
      }
      setDisplayed(text.slice(0, indexRef.current));
    }, 35);
    return () => clearInterval(id);
  }, [text]);

  return (
    <div className="glass rounded-lg px-4 py-3 text-sm text-gray-200 font-mono min-h-[44px]">
      {displayed}
      <span className="inline-block w-[2px] h-4 bg-purple-400 ml-0.5 animate-pulse align-middle" />
    </div>
  );
}

function SQLPreview() {
  // Render SQL with keyword highlighting using React elements (no dangerouslySetInnerHTML)
  const lines = [
    ["SELECT", " region, ", "SUM", "(revenue) ", "AS", " total_revenue"],
    ["FROM", "   sales"],
    ["WHERE", "  quarter = 'Q4'"],
    ["GROUP", "  ", "BY", " region"],
    ["ORDER", "  ", "BY", " total_revenue ", "DESC", ";"],
  ];

  return (
    <pre className="glass rounded-lg px-4 py-3 text-sm text-gray-300 font-mono overflow-x-auto whitespace-pre">
      {lines.map((tokens, lineIdx) => (
        <span key={lineIdx}>
          {tokens.map((tok, tokIdx) =>
            SQL_KEYWORDS.has(tok.replace(/;$/, "")) || SQL_KEYWORDS.has(tok) ? (
              <span key={tokIdx} className="text-green-400 font-semibold">{tok}</span>
            ) : (
              <span key={tokIdx}>{tok}</span>
            ),
          )}
          {lineIdx < lines.length - 1 ? "\n" : ""}
        </span>
      ))}
    </pre>
  );
}

function BarChart({ bars }) {
  const palette = CHART_PALETTES.default;
  return (
    <div className="space-y-3 mt-1">
      {bars.map((bar, i) => (
        <div key={bar.label} className="flex items-center gap-3">
          <span className="text-xs text-gray-400 w-12 text-right">{bar.label}</span>
          <div className="flex-1 h-5 rounded-full bg-white/5 overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${bar.pct}%` }}
              transition={{ duration: 0.8, delay: i * 0.12, ease: "easeOut" }}
              className="h-full rounded-full"
              style={{ backgroundColor: palette[i % palette.length] }}
            />
          </div>
          <span className="text-xs text-gray-500 w-8">{bar.pct}%</span>
        </div>
      ))}
    </div>
  );
}

export default function OnboardingTour({ onNext }) {
  const [active, setActive] = useState(0);
  const [allSeen, setAllSeen] = useState(false);
  const timerRef = useRef(null);

  const advance = useCallback(() => {
    setActive((prev) => {
      const next = prev + 1;
      if (next >= PANELS.length) {
        setAllSeen(true);
        return prev; // stay on last
      }
      return next;
    });
  }, []);

  // Auto-advance timer
  useEffect(() => {
    if (allSeen) return;
    timerRef.current = setTimeout(advance, AUTO_ADVANCE_MS);
    return () => clearTimeout(timerRef.current);
  }, [active, allSeen, advance]);

  const handlePanelClick = (idx) => {
    clearTimeout(timerRef.current);
    setActive(idx);
    if (idx === PANELS.length - 1) setAllSeen(true);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-2xl w-full">
        <motion.h2
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-xl font-bold text-white text-center mb-8"
        >
          How it works
        </motion.h2>

        <div className="space-y-4">
          {PANELS.map((panel, idx) => {
            const isActive = idx === active;
            return (
              <motion.div
                key={panel.key}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
                onClick={() => handlePanelClick(idx)}
                className={`bg-white/5 backdrop-blur-sm border rounded-xl p-6 cursor-pointer transition-all duration-300 ${
                  isActive
                    ? "border-purple-500/50 shadow-lg shadow-purple-500/10"
                    : "border-white/10 opacity-60 hover:opacity-80"
                }`}
              >
                <div className="flex items-center gap-3 mb-3">
                  <span className={`text-xs font-semibold uppercase tracking-wider ${isActive ? "text-purple-400" : "text-gray-500"}`}>
                    {panel.title}
                  </span>
                  <span className="text-xs text-gray-600">{panel.description}</span>
                </div>

                <AnimatePresence mode="wait">
                  {isActive && (
                    <motion.div
                      key={`${panel.key}-content`}
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.25 }}
                    >
                      {panel.typingText && <TypingDemo text={panel.typingText} />}
                      {panel.key === "review" && <SQLPreview />}
                      {panel.bars && <BarChart bars={panel.bars} />}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: allSeen ? 1 : 0 }}
          className="text-center mt-8"
        >
          {allSeen && (
            <button
              onClick={onNext}
              className="px-8 py-3 rounded-xl text-white font-semibold bg-purple-600 hover:bg-purple-500 shadow-lg shadow-purple-500/25 transition-all duration-200 cursor-pointer"
            >
              Continue
            </button>
          )}
        </motion.div>
      </div>
    </div>
  );
}
