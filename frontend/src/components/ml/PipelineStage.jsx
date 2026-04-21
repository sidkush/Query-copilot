import { motion } from 'framer-motion';
import { TOKENS } from '../dashboard/tokens';

const FONT_DISPLAY = "'Outfit', system-ui, sans-serif";
const FONT_MONO = "'JetBrains Mono', ui-monospace, monospace";
const EASE = [0.32, 0.72, 0, 1];

const STATUS_CONFIG = {
  idle: {
    barGradient: 'transparent',
    iconColor: TOKENS.text.muted,
    bgGradient: 'var(--surface-glass-soft)',
    borderColor: 'var(--glass-border)',
    chipBg: 'var(--surface-glass-subtle)',
    chipFg: TOKENS.text.muted,
    glow: '0 1px 0 var(--glass-highlight) inset, 0 14px 26px -18px var(--shadow-mid)',
  },
  active: {
    barGradient: 'linear-gradient(90deg, rgba(96,165,250,0.0), rgba(96,165,250,1) 50%, rgba(96,165,250,0.0))',
    iconColor: '#2563eb',
    bgGradient: 'linear-gradient(180deg, rgba(37,99,235,0.16), rgba(37,99,235,0.04))',
    borderColor: 'rgba(37,99,235,0.55)',
    chipBg: 'rgba(37,99,235,0.14)',
    chipFg: '#2563eb',
    glow:
      '0 1px 0 var(--glass-highlight) inset, 0 0 0 1px rgba(37,99,235,0.18), 0 24px 44px -16px rgba(37,99,235,0.42), 0 0 0 5px rgba(37,99,235,0.10)',
  },
  complete: {
    barGradient: 'linear-gradient(90deg, rgba(34,197,94,0.0), rgba(34,197,94,1) 50%, rgba(34,197,94,0.0))',
    iconColor: '#16a34a',
    bgGradient: 'linear-gradient(180deg, rgba(34,197,94,0.14), rgba(34,197,94,0.03))',
    borderColor: 'rgba(34,197,94,0.42)',
    chipBg: 'rgba(34,197,94,0.14)',
    chipFg: '#16a34a',
    glow:
      '0 1px 0 var(--glass-highlight) inset, 0 0 0 1px rgba(34,197,94,0.18), 0 22px 40px -18px rgba(34,197,94,0.38)',
  },
  error: {
    barGradient: 'linear-gradient(90deg, rgba(239,68,68,0.0), rgba(239,68,68,1) 50%, rgba(239,68,68,0.0))',
    iconColor: '#dc2626',
    bgGradient: 'linear-gradient(180deg, rgba(239,68,68,0.14), rgba(239,68,68,0.03))',
    borderColor: 'rgba(239,68,68,0.45)',
    chipBg: 'rgba(239,68,68,0.14)',
    chipFg: '#dc2626',
    glow:
      '0 1px 0 var(--glass-highlight) inset, 0 0 0 1px rgba(239,68,68,0.18), 0 22px 40px -18px rgba(239,68,68,0.42)',
  },
};

const STATUS_TEXT = {
  idle: 'Idle',
  active: 'Running',
  complete: 'Done',
  error: 'Failed',
};

/* Shake on error */
const shakeVariants = {
  idle: { x: 0 },
  active: { x: 0 },
  complete: { x: 0 },
  error: {
    x: [0, -3, 3, -2, 2, 0],
    transition: { duration: 0.45, ease: EASE },
  },
};

/* Pulse halo for active state */
function PulseHalo() {
  return (
    <>
      <motion.div
        style={{
          position: 'absolute',
          inset: -3,
          borderRadius: 22,
          border: '1.5px solid rgba(37,99,235,0.55)',
          pointerEvents: 'none',
        }}
        animate={{ opacity: [0.6, 0, 0.6], scale: [1, 1.05, 1] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: EASE }}
      />
      <motion.div
        style={{
          position: 'absolute',
          inset: -8,
          borderRadius: 26,
          border: '1px solid rgba(37,99,235,0.32)',
          pointerEvents: 'none',
        }}
        animate={{ opacity: [0.4, 0, 0.4], scale: [1, 1.08, 1] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: EASE, delay: 0.3 }}
      />
    </>
  );
}

/* Shimmer overlay for active state */
function ShimmerOverlay() {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        borderRadius: 20,
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      <motion.div
        style={{
          position: 'absolute',
          top: 0,
          width: '60%',
          height: '100%',
          background:
            'linear-gradient(90deg, transparent, rgba(96,165,250,0.18) 50%, transparent)',
        }}
        animate={{ left: ['-100%', '180%'] }}
        transition={{ duration: 2.6, repeat: Infinity, ease: EASE, repeatDelay: 0.6 }}
      />
    </div>
  );
}

/* Spring-animated checkmark badge */
function CheckBadge() {
  return (
    <motion.div
      initial={{ scale: 0, opacity: 0, rotate: -45 }}
      animate={{ scale: 1, opacity: 1, rotate: 0 }}
      transition={{ type: 'spring', stiffness: 460, damping: 18, delay: 0.12 }}
      style={{
        position: 'absolute',
        top: -6,
        right: -6,
        width: 22,
        height: 22,
        borderRadius: '50%',
        background: 'linear-gradient(180deg, #4ade80, #16a34a)',
        border: '1.5px solid rgba(16,185,129,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow:
          '0 8px 20px -6px rgba(34,197,94,0.65), inset 0 1px 0 rgba(255,255,255,0.45)',
        zIndex: 3,
      }}
    >
      <svg width={11} height={11} viewBox="0 0 11 11" fill="none">
        <path d="M3 5.6l1.8 1.8L8.4 3.6" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </motion.div>
  );
}

export default function PipelineStage({ icon, label, status = 'idle', onClick, isActive, stageNumber }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.idle;
  const statusText = STATUS_TEXT[status] || '';
  const isRunning = status === 'active';

  return (
    <motion.button
      onClick={onClick}
      variants={shakeVariants}
      animate={status}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.96, y: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 22 }}
      data-active={isActive || undefined}
      data-status={status}
      className="ml-stage-card"
      style={{
        position: 'relative',
        width: 108,
        minWidth: 108,
        height: 116,
        borderRadius: 22,
        background: config.bgGradient,
        border: `1px solid ${config.borderColor}`,
        boxShadow: isActive
          ? `${config.glow}, 0 0 0 4px rgba(37,99,235,0.18)`
          : config.glow,
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        gap: 6,
        padding: '14px 10px 12px',
        overflow: 'visible',
        outline: 'none',
        backdropFilter: 'blur(14px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(14px) saturate(1.4)',
      }}
    >
      {/* Top accent bar */}
      <motion.div
        style={{
          position: 'absolute',
          top: 0,
          left: 14,
          right: 14,
          height: 2,
          borderRadius: '0 0 2px 2px',
          background: config.barGradient,
          opacity: config.barGradient === 'transparent' ? 0 : 1,
        }}
        transition={{ duration: 0.42 }}
      />

      {/* Active-state effects */}
      {isRunning && <PulseHalo />}
      {isRunning && <ShimmerOverlay />}

      {/* Complete badge */}
      {status === 'complete' && <CheckBadge />}

      {/* Stage number eyebrow */}
      <span style={{
        fontSize: 8,
        fontWeight: 700,
        letterSpacing: '0.20em',
        color: config.chipFg,
        opacity: 0.7,
        fontFamily: FONT_MONO,
        position: 'relative',
        zIndex: 1,
      }}>
        {String(stageNumber || 0).padStart(2, '0')}
      </span>

      {/* Icon — bigger, in an inner well */}
      <motion.div
        animate={{ color: config.iconColor }}
        transition={{ duration: 0.32, ease: EASE }}
        style={{
          width: 30,
          height: 30,
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
          fontSize: 10.5,
          fontFamily: FONT_DISPLAY,
          fontWeight: 700,
          color: status === 'idle' ? TOKENS.text.secondary : TOKENS.text.primary,
          lineHeight: 1.15,
          textAlign: 'center',
          position: 'relative',
          zIndex: 1,
          maxWidth: '100%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          letterSpacing: '-0.012em',
        }}
      >
        {label}
      </span>

      {/* Status chip */}
      <motion.span
        style={{
          fontSize: 8.5,
          fontFamily: FONT_DISPLAY,
          fontWeight: 700,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          padding: '2px 8px',
          borderRadius: 9999,
          background: config.chipBg,
          color: config.chipFg,
          border: `1px solid ${config.borderColor}`,
          position: 'relative',
          zIndex: 1,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        {isRunning && (
          <motion.span
            style={{
              width: 4, height: 4, borderRadius: '50%',
              background: config.chipFg,
            }}
            animate={{ opacity: [0.4, 1, 0.4], scale: [0.85, 1.1, 0.85] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: EASE }}
          />
        )}
        {statusText}
      </motion.span>
    </motion.button>
  );
}
