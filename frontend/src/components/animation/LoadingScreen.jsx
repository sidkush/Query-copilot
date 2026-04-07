import { motion, AnimatePresence } from "framer-motion";

/**
 * LoadingScreen — Full-screen overlay shown while hero 3D initializes.
 * Fades out when `visible` transitions to false.
 */
export default function LoadingScreen({ visible }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-[10000] flex flex-col items-center justify-center bg-[#06060e]"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          {/* Pulsing logo */}
          <motion.div
            className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center shadow-2xl shadow-indigo-500/30"
            animate={{
              scale: [1, 1.08, 1],
              boxShadow: [
                "0 0 0 0px rgba(99,102,241,0.3)",
                "0 0 0 20px rgba(99,102,241,0)",
                "0 0 0 0px rgba(99,102,241,0.3)",
              ],
            }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          >
            <span className="text-white font-bold text-2xl">Q</span>
          </motion.div>

          <motion.p
            className="mt-6 text-sm text-gray-500 tracking-wider"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            Loading experience...
          </motion.p>

          {/* Thin progress bar */}
          <motion.div
            className="mt-4 h-[2px] rounded-full bg-gradient-to-r from-indigo-500 to-violet-500"
            initial={{ width: 0 }}
            animate={{ width: 120 }}
            transition={{ duration: 2, ease: "easeOut" }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
