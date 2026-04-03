import { TOKENS } from './tokens';

export default function CrossFilterBadge({ crossFilter, onClear }) {
  if (!crossFilter) return null;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px',
      background: TOKENS.accentGlow, border: `1px solid ${TOKENS.accent}30`,
      borderRadius: 10, marginBottom: 12, marginLeft: 24, marginRight: 24,
    }}>
      <svg style={{ width: 14, height: 14, color: TOKENS.accent, flexShrink: 0 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
      </svg>
      <span style={{ fontSize: 12, color: TOKENS.text.primary }}>
        Filtered by <strong style={{ color: TOKENS.accentLight }}>{crossFilter.field}</strong> = <strong>{crossFilter.value}</strong>
      </span>
      <button onClick={onClear} style={{
        background: 'none', border: 'none', cursor: 'pointer', color: TOKENS.text.muted,
        fontSize: 14, marginLeft: 4, padding: '0 4px', lineHeight: 1,
      }}>x</button>
    </div>
  );
}
