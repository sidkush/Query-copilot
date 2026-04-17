// frontend/src/components/dashboard/freeform/MarqueeOverlay.jsx
import { memo } from 'react';

function MarqueeOverlay({ rect }) {
  if (!rect) return null;
  const { x, y, width, height } = rect;
  return (
    <div
      data-testid="marquee-overlay"
      style={{
        position: 'absolute',
        left: Math.min(x, x + width),
        top: Math.min(y, y + height),
        width: Math.abs(width),
        height: Math.abs(height),
        border: '1px solid var(--accent, #2563eb)',
        background: 'color-mix(in oklab, var(--accent) 10%, transparent)',
        pointerEvents: 'none',
        zIndex: 999,
      }}
    />
  );
}

export default memo(MarqueeOverlay);
