import { TOKENS } from './tokens';

export default function LayoutModeToggle({ mode = 'grid', onToggle }) {
  const btn = (value, title, icon) => (
    <button
      onClick={() => onToggle(value)}
      title={title}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 26, height: 26, borderRadius: 6, border: 'none', cursor: 'pointer',
        background: mode === value ? TOKENS.accentGlow : 'transparent',
        color: mode === value ? TOKENS.accent : TOKENS.text.muted,
        transition: `all ${TOKENS.transition}`,
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        {icon}
      </svg>
    </button>
  );

  return (
    <div style={{
      display: 'inline-flex', gap: 2, padding: 2,
      borderRadius: 8, background: TOKENS.bg.surface,
      border: `1px solid ${TOKENS.border.default}`,
    }}>
      {btn('grid', 'Grid layout', <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>)}
      {btn('freeform', 'Freeform layout', <>
        <rect x="2" y="4" width="8" height="6" rx="1" />
        <rect x="12" y="2" width="10" height="7" rx="1" />
        <rect x="5" y="13" width="9" height="8" rx="1" />
        <rect x="16" y="12" width="6" height="9" rx="1" />
      </>)}
    </div>
  );
}
