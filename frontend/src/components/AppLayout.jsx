// eslint-disable-next-line no-unused-vars
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useStore } from "../store";
import AppSidebar from "./AppSidebar";

export default function AppLayout({ children }) {
  const navigate = useNavigate();
  const apiKeyStatus = useStore((s) => s.apiKeyStatus);
  const user = useStore((s) => s.user);

  const showBanner = apiKeyStatus?.valid === false && user?.email !== "demo@datalens.dev";

  return (
    <div className="flex h-screen bg-[#06060e]">
      {/* Skip to main content - accessibility */}
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-indigo-600 focus:text-white focus:rounded-lg focus:text-sm focus:font-medium">
        Skip to main content
      </a>

      {/* Invalid API key banner */}
      {showBanner && (
        <div
          className="fixed top-0 left-0 right-0 z-50 px-4 py-2 text-center text-sm font-medium"
          style={{ background: "linear-gradient(90deg, rgba(245,158,11,0.15), rgba(239,68,68,0.15))", borderBottom: "1px solid rgba(245,158,11,0.3)" }}
        >
          <span className="text-amber-400">Your API key is no longer valid.</span>
          <button onClick={() => navigate("/account")} className="ml-2 text-purple-400 underline hover:text-purple-300">
            Update Key
          </button>
        </div>
      )}

      <motion.div
        initial={{ x: -56, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
      >
        <AppSidebar />
      </motion.div>
      <motion.main
        id="main-content"
        className={`flex-1 flex flex-col min-w-0 overflow-hidden ${showBanner ? "pt-10" : ""}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15, duration: 0.3 }}
      >
        {children}
      </motion.main>
    </div>
  );
}
