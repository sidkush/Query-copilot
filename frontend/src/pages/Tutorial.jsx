import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { api } from "../api";
import { useStore } from "../store";
import MotionButton from "../components/animation/MotionButton";

const STEPS = [
  {
    title: (<>Welcome to <span className="text-white">Query</span><span className="text-indigo-400">Copilot</span></>),
    subtitle: "Let's get you set up in 60 seconds.",
    icon: (
      <svg className="w-20 h-20 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    ),
    content: "QueryCopilot is your AI-powered analytics copilot. Ask questions about your data in plain English and get instant SQL queries, charts, and insights.",
  },
  {
    title: "Connect a Database",
    subtitle: "We support 4 major databases.",
    icon: (
      <div className="grid grid-cols-2 gap-4">
        {[
          { name: "PostgreSQL", color: "text-blue-400" },
          { name: "MySQL", color: "text-orange-400" },
          { name: "Snowflake", color: "text-cyan-400" },
          { name: "BigQuery", color: "text-violet-400" },
        ].map((db) => (
          <div key={db.name} className="glass rounded-xl p-3 text-center">
            <svg className={`w-6 h-6 ${db.color} mx-auto mb-1`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375" />
            </svg>
            <span className="text-xs text-gray-400">{db.name}</span>
          </div>
        ))}
      </div>
    ),
    content: "Connect your database with read-only credentials. QueryCopilot auto-discovers your schema and can never modify your data.",
  },
  {
    title: "Ask Questions",
    subtitle: "Natural language to SQL in seconds.",
    icon: (
      <div className="glass rounded-xl p-4 font-mono text-sm text-left max-w-sm mx-auto">
        <p className="text-cyan-400">$ <span className="text-yellow-300">How many users signed up this week?</span></p>
        <p className="text-gray-600 mt-1">Generating SQL...</p>
        <p className="text-green-400/80 mt-1 text-xs">SELECT COUNT(*) FROM users WHERE created_at &gt;= NOW() - INTERVAL '7 days'</p>
      </div>
    ),
    content: "Type any business question. QueryCopilot generates SQL, shows it for your review, and executes only after your approval. Human-in-the-loop safety.",
  },
  {
    title: "Get Instant Results",
    subtitle: "Tables, charts, and exports — all in one place.",
    icon: (
      <div className="flex items-end gap-2 justify-center h-20">
        {[40, 65, 50, 80, 55, 72, 60].map((h, i) => (
          <div key={i} className="w-6 rounded-t-md bg-gradient-to-t from-indigo-500 to-violet-400" style={{ height: `${h}%`, animationDelay: `${i * 0.1}s` }} />
        ))}
      </div>
    ),
    content: "Results come with auto-generated charts, interactive tables, CSV export, and a plain-English summary. Everything you need in under 3 seconds.",
  },
];

const stepVariants = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1, transition: { type: "spring", stiffness: 300, damping: 25 } },
  exit: { opacity: 0, scale: 0.95, transition: { duration: 0.2 } },
};

export default function Tutorial() {
  const [step, setStep] = useState(0);
  const navigate = useNavigate();
  const setTutorialComplete = useStore((s) => s.setTutorialComplete);

  const finish = useCallback(() => {
    setTutorialComplete(true);
    api.completeTutorial().catch(() => {});
    navigate("/dashboard");
  }, [setTutorialComplete, navigate]);

  // Keyboard navigation: arrow keys to go forward/back
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        if (step < STEPS.length - 1) setStep((s) => s + 1);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        if (step > 0) setStep((s) => s - 1);
      } else if (e.key === "Enter" && step === STEPS.length - 1) {
        finish();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [step, finish]);

  const s = STEPS[step];

  return (
    <div className="min-h-screen bg-[#06060e] flex items-center justify-center px-4 relative noise-overlay">
      <div className="absolute inset-0 mesh-gradient opacity-30 pointer-events-none" />
      <div className="max-w-lg w-full relative z-10">
        {/* Skip */}
        <div className="flex justify-end mb-4">
          <button onClick={finish} className="text-sm text-gray-600 hover:text-gray-400 transition cursor-pointer">
            Skip tutorial
          </button>
        </div>

        {/* Card */}
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            variants={stepVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="glass-card rounded-2xl p-8 text-center"
          >
            {/* Icon area */}
            <div className="mb-6 flex justify-center">{s.icon}</div>

            <h2 className="text-2xl font-bold text-white mb-1">{s.title}</h2>
            <p className="text-indigo-400 text-sm font-medium mb-4">{s.subtitle}</p>
            <p className="text-gray-400 text-sm leading-relaxed mb-8">{s.content}</p>

            {/* Progress dots + step counter */}
            <div className="flex flex-col items-center gap-2 mb-6">
              <div className="flex items-center gap-2" role="progressbar" aria-valuenow={step + 1} aria-valuemin={1} aria-valuemax={STEPS.length} aria-label={`Step ${step + 1} of ${STEPS.length}`}>
                {STEPS.map((_, i) => (
                  <motion.button
                    key={i}
                    onClick={() => setStep(i)}
                    className={`h-2 rounded-full cursor-pointer ${i === step ? "bg-indigo-500" : i < step ? "bg-indigo-500/50" : "bg-gray-700"}`}
                    animate={{ width: i === step ? 24 : 8 }}
                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                    aria-label={`Go to step ${i + 1}`}
                  />
                ))}
              </div>
              <span className="text-xs text-gray-500">Step {step + 1} of {STEPS.length}</span>
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between">
              <MotionButton
                onClick={() => setStep(step - 1)}
                disabled={step === 0}
                className="px-5 py-2 text-sm text-gray-500 hover:text-white disabled:opacity-30 disabled:cursor-default transition cursor-pointer"
              >
                Back
              </MotionButton>
              {step < STEPS.length - 1 ? (
                <MotionButton
                  onClick={() => setStep(step + 1)}
                  className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-sm font-semibold rounded-full transition cursor-pointer btn-glow shadow-lg shadow-indigo-500/20"
                >
                  Next
                </MotionButton>
              ) : (
                <MotionButton
                  onClick={finish}
                  className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-bold rounded-full shadow-lg shadow-indigo-500/25 hover:-translate-y-0.5 transition cursor-pointer btn-glow"
                >
                  Get Started
                </MotionButton>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
