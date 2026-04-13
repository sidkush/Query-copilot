// eslint-disable-next-line no-unused-vars
import { motion } from 'framer-motion';
import { TOKENS } from '../dashboard/tokens';

const STATUS_CONFIG = {
  idle: {
    barColor: 'transparent',
    iconColor: TOKENS.text.muted,
    glow: 'none',
    bgTint: 'transparent',
    borderColor: TOKENS.border.default,
  },
  active: {
    barColor: TOKENS.accent,
    iconColor: TOKENS.accent,
    glow: `0 0 0 2px ${TOKENS.accent}, 0 0 20px rgba(37,99,235,0.15)`,
    bgTint: 'rgba(37,99,235,0.04)',
    borderColor: TOKENS.accent,
  },
  complete: {
    barColor: TOKENS.success,
    iconColor: TOKENS.success,
    glow: 'none',
    bgTint: 'rgba(34,197,94,0.04)',
    borderColor: TOKENS.border.default,
  },
  error: {
    barColor: TOKENS.danger,
    iconColor: TOKENS.danger,
    glow: 'none',
    bgTint: 'rgba(239,68,68,0.04)',
    borderColor: TOKENS.danger,
  },
};

const STATUS_TEXT = {
  idle: 'Waiting',
  active: 'Running...',
  complete: 'Done',
  error: 'Failed',
};

/* Shake keyframes for error state */
const shakeVariants = {
  idle: { x: 0 },
  active: { x: 0 },
  complete: { x: 0 },
  error: {
    x: [0, -3, 3, -2, 2, 0],
    transition: { duration: 0.4, ease: 'easeInOut' },
  },
};

/* Pulse ring for active state */
function PulseRing() {
  return (
    <motion.div
      style={{
        position: 'absolute',
        inset: -2,
        borderRadius: TOKENS.radius.lg,
        border: `1.5px solid ${TOKENS.accent}`,
        pointerEvents: 'none',
      }}
      animate={{ opacity: [0.6, 0, 0.6], scale: [1, 1.04, 1] }}
      transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
    />
  );
}

/* Shimmer overlay for active state */
function ShimmerOverlay() {
  return (
    <motion.div
      style={{
        position: 'absolute',
        inset: 0,
        borderRadius: TOKENS.radius.lg,
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      <motion.div
        style={{
          position: 'absolute',
          top: 0,
          left: '-100%',
          width: '50%',
          height: '100%',
          background: 'linear-gradient(90deg, transparent, rgba(37,99,235,0.06), transparent)',
        }}
        animate={{ left: ['−100%', '200%'] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'linear', repeatDelay: 0.8 }}
      />
    </motion.div>
  );
}

/* Spring-animated checkmark badge for complete state */
function CheckBadge() {
  return (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 500, damping: 18, delay: 0.1 }}
      style={{
        position: 'absolute',
        top: -5,
        right: -5,
        width: 18,
        height: 18,
        borderRadius: '50%',
        background: TOKENS.success,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 2px 6px rgba(34,197,94,0.3)',
        zIndex: 2,
      }}
    >
      <svg width={10} height={10} viewBox="0 0 10 10" fill="none">
        <path d="M2.5 5l2 2 3.5-4" stroke="#fff" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </motion.div>
  );
}

export default function PipelineStage({ icon, label, status = 'idle', onClick, isActive }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.idle;
  const statusText = STATUS_TEXT[status] || '';

  return (
    <motion.button
      onClick={onClick}
      variants={shakeVariants}
      animate={status}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.97 }}
      style={{
        position: 'relative',
        width: 85,
        minWidth: 85,
        height: 72,
        borderRadius: TOKENS.radius.lg,
        background: TOKENS.bg.surface,
        border: `1px solid ${config.borderColor}`,
        boxShadow: isActive
          ? `inset 0 1px 4px rgba(0,0,0,0.12), ${config.glow}`
          : config.glow !== 'none'
            ? config.glow
            : TOKENS.tile.shadow,
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        padding: '8px 6px 6px',
        overflow: 'visible',
        transition: `border-color ${TOKENS.transition}, box-shadow ${TOKENS.transition}, background ${TOKENS.transition}`,
        outline: 'none',
      }}
    >
      {/* Top accent bar */}
      <motion.div
        style={{
          position: 'absolute',
          top: 0,
          left: 8,
          right: 8,
          height: 3,
          borderRadius: '0 0 2px 2px',
        }}
        animate={{ background: config.barColor, opacity: config.barColor === 'transparent' ? 0 : 1 }}
        transition={{ duration: 0.3 }}
      />

      {/* Background tint */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: TOKENS.radius.lg,
          background: config.bgTint,
          pointerEvents: 'none',
          transition: `background ${TOKENS.transition}`,
        }}
      />

      {/* Active-state effects */}
      {status === 'active' && <PulseRing />}
      {status === 'active' && <ShimmerOverlay />}

      {/* Complete badge */}
      {status === 'complete' && <CheckBadge />}

      {/* Icon */}
      <motion.div
        animate={{ color: config.iconColor }}
        transition={{ duration: 0.25 }}
        style={{
          width: 24,
          height: 24,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          zIndex: 1,
          color: config.iconColor,
        }}
      >
        {icon}
      </motion.div>

      {/* Label */}
      <span
        style={{
          fontSize: 11,
          fontFamily: TOKENS.tile.headerFont,
          fontWeight: 600,
          color: status === 'idle' ? TOKENS.text.muted : TOKENS.text.primary,
          lineHeight: 1.2,
          textAlign: 'center',
          position: 'relative',
          zIndex: 1,
          transition: `color ${TOKENS.transition}`,
          maxWidth: '100%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>

      {/* Status text */}
      <motion.span
        animate={{ opacity: status === 'idle' ? 0.4 : 0.7 }}
        style={{
          fontSize: 9,
          color: config.iconColor,
          position: 'relative',
          zIndex: 1,
          fontWeight: 500,
          letterSpacing: '0.02em',
        }}
      >
        {statusText}
      </motion.span>
    </motion.button>
  );
}
