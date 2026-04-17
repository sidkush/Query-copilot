import React, { useCallback, useRef } from 'react';

/**
 * Cursor-tracked spotlight border card.
 * Applies `.premium-spotlight` class and updates --spot-x / --spot-y on mouse move.
 * Uses rAF throttle to stay 60fps with many tiles on a grid.
 *
 * Usage:
 *   <SpotlightCard style={{ ... }}>
 *     tile contents
 *   </SpotlightCard>
 *
 * Non-interactive / print / prefers-reduced-motion safe — CSS hides the ring.
 */
function SpotlightCard({
  as: Tag = 'div',
  className = '',
  style,
  disabled = false,
  children,
  onMouseMove,
  ...rest
}) {
  const ref = useRef(null);
  const rafRef = useRef(0);

  const handleMouseMove = useCallback(
    (e) => {
      if (onMouseMove) onMouseMove(e);
      if (disabled) return;
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        el.style.setProperty('--spot-x', `${x}%`);
        el.style.setProperty('--spot-y', `${y}%`);
      });
    },
    [disabled, onMouseMove]
  );

  return (
    <Tag
      ref={ref}
      className={`${disabled ? '' : 'premium-spotlight'} ${className}`.trim()}
      style={style}
      onMouseMove={handleMouseMove}
      {...rest}
    >
      {children}
    </Tag>
  );
}

export default React.memo(SpotlightCard);
