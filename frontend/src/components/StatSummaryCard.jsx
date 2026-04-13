import { motion } from "framer-motion";
import AnimatedCounter from "./animation/AnimatedCounter";

const GRADIENTS = {
  indigo: "from-blue-600/20 to-blue-500/20",
  emerald: "from-emerald-600/20 to-teal-600/20",
  amber: "from-amber-600/20 to-orange-600/20",
  violet: "from-blue-500/20 to-cyan-600/20",
  rose: "from-rose-600/20 to-pink-600/20",
  cyan: "from-cyan-600/20 to-sky-600/20",
};

const ICON_COLORS = {
  indigo: "text-blue-400",
  emerald: "text-emerald-400",
  amber: "text-amber-400",
  violet: "text-violet-400",
  rose: "text-rose-400",
  cyan: "text-cyan-400",
};

const BORDER_COLORS = {
  indigo: "border-indigo-500/20",
  emerald: "border-emerald-500/20",
  amber: "border-amber-500/20",
  violet: "border-violet-500/20",
  rose: "border-rose-500/20",
  cyan: "border-cyan-500/20",
};

export default function StatSummaryCard({
  title,
  value,
  suffix = "",
  prefix = "",
  decimals = 0,
  icon,
  color = "indigo",
  trend,
  sparkline,
  className = "",
}) {
  const gradient = GRADIENTS[color] || GRADIENTS.indigo;
  const iconColor = ICON_COLORS[color] || ICON_COLORS.indigo;
  const borderColor = BORDER_COLORS[color] || BORDER_COLORS.indigo;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 24 }}
      whileHover={{ y: -4, transition: { type: "spring", stiffness: 300, damping: 20 } }}
      className={`glass-card rounded-2xl p-5 border ${borderColor} relative overflow-hidden group cursor-default ${className}`}
    >
      {/* Gradient bg */}
      <div
        className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`}
      />

      <div className="relative z-10">
        {/* Header row */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
            {title}
          </span>
          {icon && <span className={`${iconColor}`}>{icon}</span>}
        </div>

        {/* Value */}
        <div className="flex items-end gap-2 mb-2">
          <AnimatedCounter
            value={value}
            prefix={prefix}
            suffix={suffix}
            decimals={decimals}
            className="text-2xl font-bold tabular-nums"
            style={{ color: 'var(--text-primary)' }}
          />
          {trend !== undefined && (
            <span
              className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                trend >= 0
                  ? "text-emerald-400 bg-emerald-400/10"
                  : "text-red-400 bg-red-400/10"
              }`}
            >
              {trend >= 0 ? "+" : ""}
              {trend}%
            </span>
          )}
        </div>

        {/* Sparkline */}
        {sparkline && sparkline.length > 1 && (
          <div className="h-8 flex items-end gap-px mt-1">
            {sparkline.map((v, i) => {
              const max = Math.max(...sparkline);
              const pct = max > 0 ? (v / max) * 100 : 0;
              return (
                <div
                  key={i}
                  className={`flex-1 rounded-t-sm bg-gradient-to-t ${
                    color === "emerald"
                      ? "from-emerald-500/60 to-emerald-400/30"
                      : color === "amber"
                      ? "from-amber-500/60 to-amber-400/30"
                      : color === "violet"
                      ? "from-blue-500/60 to-cyan-400/30"
                      : "from-blue-500/60 to-blue-400/30"
                  } transition-all duration-300`}
                  style={{ height: `${Math.max(pct, 4)}%` }}
                />
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
}
