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
          className="fixed inset-0 z-[200] flex flex-col items-center justify-center"
          style={{ background: 'var(--bg-page)' }}
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          {/* Pulsing logo */}
          <motion.div
            className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center shadow-2xl shadow-blue-600/25"
            animate={{
              scale: [1, 1.08, 1],
              boxShadow: [
                "0 0 0 0px rgba(37,99,235,0.3)",
                "0 0 0 20px rgba(37,99,235,0)",
                "0 0 0 0px rgba(37,99,235,0.3)",
              ],
            }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          >
            <span className="text-white font-bold text-2xl">Q</span>
          </motion.div>

          <motion.p
            className="mt-6 text-sm tracking-wider"
            style={{ color: 'var(--text-muted)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            Loading experience...
          </motion.p>

          {/* Thin progress bar */}
          <motion.div
            className="mt-4 h-[2px] rounded-full bg-blue-500"
            initial={{ width: 0 }}
            animate={{ width: 120 }}
            transition={{ duration: 2, ease: "easeOut" }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
