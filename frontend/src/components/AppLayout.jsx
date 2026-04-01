import { motion } from "framer-motion";
import AppSidebar from "./AppSidebar";

export default function AppLayout({ children }) {
  return (
    <div className="flex h-screen bg-[#06060e]">
      {/* Skip to main content - accessibility */}
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-indigo-600 focus:text-white focus:rounded-lg focus:text-sm focus:font-medium">
        Skip to main content
      </a>
      <motion.div
        initial={{ x: -56, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
      >
        <AppSidebar />
      </motion.div>
      <motion.main
        id="main-content"
        className="flex-1 flex flex-col min-w-0 overflow-hidden"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15, duration: 0.3 }}
      >
        {children}
      </motion.main>
    </div>
  );
}
