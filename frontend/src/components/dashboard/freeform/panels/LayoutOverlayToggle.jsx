// frontend/src/components/dashboard/freeform/panels/LayoutOverlayToggle.jsx
import React from 'react';
import { useStore } from '../../../../store';

export default function LayoutOverlayToggle() {
  const enabled = useStore((s) => s.analystProLayoutOverlay);
  const toggle = useStore((s) => s.toggleLayoutOverlayAnalystPro);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label="Layout overlay"
      title="Toggle layout overlay (Cmd/Ctrl+;)"
      onClick={toggle}
      style={{
        background: enabled ? 'var(--accent, #3b82f6)' : 'transparent',
        border: '1px solid var(--chrome-bar-border)',
        color: enabled ? '#fff' : 'var(--fg)',
        padding: '4px 8px',
        cursor: 'pointer',
        fontSize: '12px',
        borderRadius: '4px',
      }}
    >
      ⧉ Overlay
    </button>
  );
}
