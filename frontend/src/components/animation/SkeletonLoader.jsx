import { motion } from "framer-motion";

const shimmer = {
  animate: {
    backgroundPosition: ["200% 0", "-200% 0"],
    transition: { duration: 1.8, repeat: Infinity, ease: "linear" },
  },
};

const baseClass =
  "rounded-lg bg-gradient-to-r from-gray-800/60 via-gray-700/40 to-gray-800/60 bg-[length:200%_100%]";

export function CardSkeleton({ count = 1, className = "" }) {
  return (
    <div className={`grid gap-4 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <motion.div
          key={i}
          variants={shimmer}
          animate="animate"
          className={`${baseClass} h-32 rounded-2xl`}
        />
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 4, className = "" }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {/* Header */}
      <div className="flex gap-3">
        {Array.from({ length: cols }).map((_, i) => (
          <motion.div
            key={`h-${i}`}
            variants={shimmer}
            animate="animate"
            className={`${baseClass} h-8 flex-1`}
          />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3">
          {Array.from({ length: cols }).map((_, c) => (
            <motion.div
              key={`${r}-${c}`}
              variants={shimmer}
              animate="animate"
              className={`${baseClass} h-6 flex-1`}
              style={{ animationDelay: `${r * 0.05}s` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function ChartSkeleton({ className = "" }) {
  return (
    <div className={`relative ${className}`}>
      <motion.div
        variants={shimmer}
        animate="animate"
        className={`${baseClass} h-64 rounded-2xl`}
      />
      {/* Fake bar chart lines */}
      <div className="absolute bottom-4 left-4 right-4 flex items-end gap-2 h-40">
        {[40, 65, 50, 80, 55, 72, 45, 68].map((h, i) => (
          <motion.div
            key={i}
            initial={{ height: 0 }}
            animate={{ height: `${h}%` }}
            transition={{ delay: i * 0.08, duration: 0.6, ease: "easeOut" }}
            className="flex-1 rounded-t-md bg-indigo-500/10"
          />
        ))}
      </div>
    </div>
  );
}
