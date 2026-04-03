import { TOKENS, CHART_PALETTES } from './tokens';

const PALETTE_KEYS = ['default', 'ocean', 'sunset', 'forest', 'colorblind'];

export default function FloatingToolbar({ tile, onQuickUpdate, onOpenEditor }) {
  const vc = tile?.visualConfig || {};
  const currentPalette = vc?.colors?.palette || tile?.palette || 'default';
  const legendVisible = vc?.legend?.show !== false;
  const labelsVisible = vc?.dataLabels?.show === true;

  const update = (path, value) => {
    const newVc = JSON.parse(JSON.stringify(tile?.visualConfig || {}));
    const keys = path.split('.');
    let obj = newVc;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!obj[keys[i]]) obj[keys[i]] = {};
      obj = obj[keys[i]];
    }
    obj[keys[keys.length - 1]] = value;
    onQuickUpdate({ ...tile, visualConfig: newVc });
  };

  const toggleBtnStyle = (active) => ({
    background: active ? TOKENS.accentGlow : 'transparent',
    color: active ? TOKENS.accent : TOKENS.text.muted,
    border: active ? `1px solid ${TOKENS.accent}` : `1px solid transparent`,
    borderRadius: 8,
    padding: '6px 12px',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    transition: `all ${TOKENS.transition}`,
    whiteSpace: 'nowrap',
  });

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        background: TOKENS.bg.elevated,
        border: `1px solid ${TOKENS.border.hover}`,
        borderRadius: 12,
        padding: '6px 10px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.3)',
      }}
    >
      {/* Palette swatches */}
      {PALETTE_KEYS.map((key) => (
        <button
          key={key}
          title={key.charAt(0).toUpperCase() + key.slice(1)}
          onClick={() => update('colors.palette', key)}
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            border: currentPalette === key
              ? `2px solid ${TOKENS.accent}`
              : `2px solid transparent`,
            background: `linear-gradient(135deg, ${CHART_PALETTES[key][0]} 50%, ${CHART_PALETTES[key][1]} 50%)`,
            cursor: 'pointer',
            transition: `all ${TOKENS.transition}`,
            flexShrink: 0,
          }}
        />
      ))}

      {/* Divider */}
      <div style={{ width: 1, height: 20, background: TOKENS.border.hover, margin: '0 4px', flexShrink: 0 }} />

      {/* Legend toggle */}
      <button
        style={toggleBtnStyle(legendVisible)}
        onClick={() => update('legend.show', !legendVisible)}
      >
        Legend
      </button>

      {/* Labels toggle */}
      <button
        style={toggleBtnStyle(labelsVisible)}
        onClick={() => update('dataLabels.show', !labelsVisible)}
      >
        Labels
      </button>

      {/* Divider */}
      <div style={{ width: 1, height: 20, background: TOKENS.border.hover, margin: '0 4px', flexShrink: 0 }} />

      {/* Format... button */}
      <button
        onClick={() => onOpenEditor?.()}
        style={{
          background: 'transparent',
          color: TOKENS.accent,
          border: `1px solid ${TOKENS.accent}`,
          borderRadius: 8,
          padding: '6px 12px',
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
          transition: `all ${TOKENS.transition}`,
          whiteSpace: 'nowrap',
        }}
      >
        Format...
      </button>
    </div>
  );
}
