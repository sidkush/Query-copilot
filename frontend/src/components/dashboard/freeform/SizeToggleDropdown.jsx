// frontend/src/components/dashboard/freeform/SizeToggleDropdown.jsx
import { useState } from 'react';
import { TOKENS } from '../tokens';

const PRESETS = [
  { id: 'automatic', label: 'Automatic', desc: 'Fills viewport' },
  { id: 'desktop', label: 'Desktop', desc: '1366 × 768' },
  { id: 'laptop', label: 'Laptop', desc: '1440 × 900' },
  { id: 'ipad-landscape', label: 'iPad Landscape', desc: '1024 × 768' },
  { id: 'ipad-portrait', label: 'iPad Portrait', desc: '768 × 1024' },
  { id: 'phone', label: 'Phone', desc: '375 × 667' },
  { id: 'custom', label: 'Custom…', desc: 'Set width × height' },
];

export default function SizeToggleDropdown({ currentSize, onChange }) {
  const [open, setOpen] = useState(false);

  const activeLabel = getSizeLabel(currentSize);

  return (
    <div data-testid="size-toggle" style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="premium-btn"
        style={{
          padding: '6px 14px',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-default)',
          borderRadius: 8,
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--text-primary)',
          fontFamily: TOKENS.fontDisplay,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="5" width="18" height="14" rx="2"/></svg>
        {activeLabel}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      {open && (
        <div
          data-testid="size-toggle-menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            right: 0,
            zIndex: 50,
            minWidth: 220,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-default)',
            borderRadius: 10,
            boxShadow: TOKENS.shadow.diffusion,
            padding: 6,
          }}
        >
          {PRESETS.map((p) => (
            <button
              type="button"
              key={p.id}
              data-testid={`size-preset-${p.id}`}
              onClick={() => {
                onChange(buildSize(p.id));
                setOpen(false);
              }}
              style={{
                width: '100%',
                padding: '8px 12px',
                background: 'transparent',
                border: 'none',
                borderRadius: 6,
                textAlign: 'left',
                cursor: 'pointer',
                color: 'var(--text-primary)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: 12,
                fontFamily: TOKENS.fontBody,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ fontWeight: 600 }}>{p.label}</span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: TOKENS.fontMono }}>{p.desc}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function getSizeLabel(size) {
  if (!size) return 'Automatic';
  if (size.mode === 'automatic') return 'Automatic';
  if (size.mode === 'fixed' && size.preset) {
    const preset = PRESETS.find((p) => p.id === size.preset);
    return preset?.label || 'Custom';
  }
  if (size.mode === 'fixed') return `${size.width} × ${size.height}`;
  if (size.mode === 'range') return 'Range';
  return 'Automatic';
}

function buildSize(presetId) {
  if (presetId === 'automatic') return { mode: 'automatic' };
  if (presetId === 'custom') return { mode: 'fixed', width: 1200, height: 800, preset: 'custom' };
  const sizes = {
    desktop: { width: 1366, height: 768 },
    laptop: { width: 1440, height: 900 },
    'ipad-landscape': { width: 1024, height: 768 },
    'ipad-portrait': { width: 768, height: 1024 },
    phone: { width: 375, height: 667 },
  };
  return { mode: 'fixed', preset: presetId, ...sizes[presetId] };
}
