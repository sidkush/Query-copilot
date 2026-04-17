import React from 'react';

/**
 * Perpetually breathing status indicator dot.
 * Replaces ad-hoc `animation: pulse 2s ...` scattered across tiles.
 *
 * Usage:
 *   <BreathingDot color="#22c55e" size={8} label="LIVE" />
 *
 * - Color defaults to current accent
 * - Respects prefers-reduced-motion (animation hidden by .premium-breathe class)
 * - ARIA: parent should wrap the accompanying text in role="status" aria-live
 */
function BreathingDot({
  color = 'var(--accent, #2563EB)',
  size = 8,
  glow = true,
  className = '',
  style,
  ...rest
}) {
  return (
    <span
      aria-hidden="true"
      className={`premium-breathe ${className}`.trim()}
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        background: color,
        boxShadow: glow ? `0 0 ${size + 4}px ${color}` : 'none',
        flexShrink: 0,
        ...style,
      }}
      {...rest}
    />
  );
}

export default React.memo(BreathingDot);
