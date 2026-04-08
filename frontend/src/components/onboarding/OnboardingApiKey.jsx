import { useState, useEffect, useRef } from "react";
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../../api";
import { useStore } from "../../store";

// States: idle | validating | success | error
const STATUS_IDLE = "idle";
const STATUS_VALIDATING = "validating";
const STATUS_SUCCESS = "success";
const STATUS_ERROR = "error";

export default function OnboardingApiKey({ onNext, onSkip, isDemo = false }) {
  const [key, setKey] = useState(isDemo ? "demo-key-active" : "");
  const [showKey, setShowKey] = useState(false);
  const [status, setStatus] = useState(STATUS_IDLE);
  const [errorMsg, setErrorMsg] = useState("");
  const setApiKeyStatus = useStore((s) => s.setApiKeyStatus);
  const timerRef = useRef(null);

  // Demo mode: auto-advance after 1.5s
  useEffect(() => {
    if (isDemo) {
      timerRef.current = setTimeout(() => onNext(), 1500);
      return () => clearTimeout(timerRef.current);
    }
  }, [isDemo, onNext]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!key.trim() || status === STATUS_VALIDATING) return;

    setStatus(STATUS_VALIDATING);
    setErrorMsg("");

    try {
      await api.saveApiKey(key.trim());
      // Fetch full status to populate the store correctly
      try {
        const fullStatus = await api.getApiKeyStatus();
        setApiKeyStatus(fullStatus);
      } catch {
        setApiKeyStatus({ configured: true, valid: true, provider: "anthropic" });
      }
      setStatus(STATUS_SUCCESS);
      setTimeout(() => onNext(), 1000);
    } catch (err) {
      setStatus(STATUS_ERROR);
      const msg = err.message || "";
      if (msg.includes("Cannot connect") || msg.includes("Server error") || msg.includes("Not Found") || msg.includes("Failed to fetch")) {
        setErrorMsg("Cannot reach the server. Please ensure the backend is running on port 8002.");
      } else {
        setErrorMsg(msg || "Invalid API key. Please try again.");
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8 max-w-md w-full"
      >
        <h2 className="text-xl font-bold text-white mb-2">Bring Your Own Key</h2>
        <p className="text-sm text-gray-400 mb-6">
          DataLens uses Claude AI to understand your questions and generate SQL.
          Enter your Anthropic API key to get started.
        </p>

        {isDemo && (
          <div className="flex items-center gap-2 mb-6 px-3 py-2 rounded-lg bg-purple-500/15 border border-purple-500/30">
            <span className="text-xs font-semibold text-purple-400 uppercase tracking-wider">Demo key active</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <input
              type={showKey ? "text" : "password"}
              value={key}
              onChange={(e) => { setKey(e.target.value); setStatus(STATUS_IDLE); setErrorMsg(""); }}
              disabled={isDemo}
              placeholder="sk-ant-..."
              className="w-full glass-input rounded-lg px-4 py-3 pr-12 text-white text-sm input-glow disabled:opacity-60"
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition cursor-pointer"
              tabIndex={-1}
            >
              {showKey ? (
                // Eye-off icon
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                </svg>
              ) : (
                // Eye icon
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              )}
            </button>
          </div>

          <a
            href="https://console.anthropic.com/account/keys"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-purple-400 hover:text-purple-300 underline underline-offset-2 transition"
          >
            Get an API key from Anthropic
          </a>

          <button
            type="submit"
            disabled={!key.trim() || status === STATUS_VALIDATING || status === STATUS_SUCCESS || isDemo}
            className="w-full py-3 rounded-xl text-white font-semibold bg-purple-600 hover:bg-purple-500 shadow-lg shadow-purple-500/25 transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {status === STATUS_VALIDATING && (
              <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            )}
            {status === STATUS_SUCCESS && (
              <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
            {status === STATUS_IDLE && "Save API Key"}
            {status === STATUS_VALIDATING && "Validating..."}
            {status === STATUS_SUCCESS && "Verified"}
            {status === STATUS_ERROR && "Retry"}
          </button>
        </form>

        <AnimatePresence>
          {status === STATUS_ERROR && errorMsg && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="text-sm text-red-400 mt-3"
            >
              {errorMsg}
            </motion.p>
          )}
        </AnimatePresence>

        {/* Skip for now — user can set up API key later from Account settings */}
        {!isDemo && onSkip && (
          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={onSkip}
              className="text-xs text-gray-500 hover:text-gray-400 transition underline underline-offset-2 cursor-pointer"
            >
              Skip for now
            </button>
            <p className="text-[10px] text-gray-600 mt-1">
              You can add your API key later in Account settings
            </p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
