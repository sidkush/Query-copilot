// eslint-disable-next-line no-unused-vars
import { motion } from "framer-motion";
import AskDBLogo from "../AskDBLogo";

export default function OnboardingWelcome({ onNext }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <AskDBLogo size="lg" />
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="text-lg mt-4"
          style={{ color: 'var(--text-secondary)' }}
        >
          Your data, one question away.
        </motion.p>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.5 }}
          className="mt-10"
        >
          <button
            onClick={onNext}
            className="px-8 py-3 rounded-xl text-white font-semibold bg-purple-600 hover:bg-purple-500 shadow-lg shadow-purple-500/25 transition-all duration-200 cursor-pointer"
          >
            Get Started
          </button>
        </motion.div>
      </div>
    </div>
  );
}
