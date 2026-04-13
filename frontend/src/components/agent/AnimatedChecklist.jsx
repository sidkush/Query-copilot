// eslint-disable-next-line no-unused-vars
import { motion } from 'framer-motion';
import { TOKENS } from '../dashboard/tokens';

const CHECK_VARIANTS = {
  pending: { scale: 1, opacity: 0.4 },
  active: { scale: 1.05, opacity: 1 },
  done: { scale: 1, opacity: 1 },
};

export default function AnimatedChecklist({ items, elapsedMs, estimatedMs }) {
  if (!items || items.length === 0) return null;

  const doneCount = items.filter(it => it.status === 'done').length;
  const progress = items.length > 0 ? (doneCount / items.length) * 100 : 0;

  return (
    <div style={{
      padding: '10px 14px',
      borderRadius: TOKENS.radius.md,
      background: TOKENS.accentLight,
      border: `1px solid ${TOKENS.border.default}`,
    }}>
      {/* Progress bar */}
      <div style={{ height: 3, borderRadius: 2, background: TOKENS.border.default, marginBottom: 10, overflow: 'hidden' }}>
        <motion.div
          style={{ height: '100%', background: TOKENS.accent, borderRadius: 2 }}
          initial={{ width: '0%' }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        />
      </div>

      {/* Checklist items */}
      <div className="flex flex-col gap-1.5">
        {items.map((item, i) => (
          <motion.div
            key={item.label || i}
            className="flex items-center gap-2 text-xs"
            variants={CHECK_VARIANTS}
            animate={item.status}
          >
            {item.status === 'done' ? (
              <motion.svg
                width={14} height={14} viewBox="0 0 14 14"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 15 }}
              >
                <circle cx={7} cy={7} r={6} fill="#22c55e" opacity={0.15} />
                <path d="M4 7l2 2 4-4" stroke="#22c55e" strokeWidth={1.5} fill="none" strokeLinecap="round" />
              </motion.svg>
            ) : item.status === 'active' ? (
              <motion.div
                style={{ width: 14, height: 14, borderRadius: '50%', border: `2px solid ${TOKENS.accent}` }}
                animate={{ opacity: [1, 0.4, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
            ) : (
              <div style={{ width: 14, height: 14, borderRadius: '50%', border: `1.5px solid ${TOKENS.border.default}` }} />
            )}
            <span style={{
              color: item.status === 'done' ? TOKENS.success : item.status === 'active' ? TOKENS.text.primary : TOKENS.text.muted,
              textDecoration: item.status === 'done' ? 'line-through' : 'none',
            }}>
              {item.label}
            </span>
          </motion.div>
        ))}
      </div>

      {elapsedMs > 0 && (
        <div className="text-xs mt-2" style={{ color: TOKENS.text.muted }}>
          {(elapsedMs / 1000).toFixed(1)}s elapsed
          {estimatedMs > 0 && ` / ~${(estimatedMs / 1000).toFixed(0)}s estimated`}
        </div>
      )}
    </div>
  );
}
