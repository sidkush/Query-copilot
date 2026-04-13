// eslint-disable-next-line no-unused-vars
import { motion } from 'framer-motion';
import { TOKENS } from '../dashboard/tokens';

export default function ThinkingBubble({ content }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex items-start gap-2"
      style={{ padding: '8px 12px', borderRadius: TOKENS.radius.md }}
    >
      {/* Animated dots */}
      <div className="flex items-center gap-1 mt-1 shrink-0">
        {[0, 1, 2].map(i => (
          <motion.div
            key={i}
            style={{ width: 4, height: 4, borderRadius: '50%', background: TOKENS.accent }}
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
          />
        ))}
      </div>
      {content && (
        <span className="text-sm italic" style={{ color: TOKENS.text.muted }}>
          {content}
        </span>
      )}
    </motion.div>
  );
}
