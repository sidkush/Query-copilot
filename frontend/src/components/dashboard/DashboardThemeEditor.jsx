import { useState } from 'react';
import { motion } from 'framer-motion';
import { TOKENS, CHART_PALETTES } from './tokens';
import ColorPickerButton from './ColorPickerButton';

const PALETTE_KEYS = Object.keys(CHART_PALETTES);

const labelStyle = {
  display: 'block',
  fontSize: '11px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: TOKENS.text.secondary,
  marginBottom: '6px',
};

const sectionTitleStyle = {
  fontSize: '13px',
  fontWeight: 600,
  color: TOKENS.text.primary,
  marginBottom: '12px',
};

const sectionStyle = {
  padding: '16px 0',
  borderBottom: `1px solid ${TOKENS.border.default}`,
};

const sliderTrackStyle = {
  width: '100%',
  appearance: 'none',
  height: 4,
  borderRadius: 2,
  background: TOKENS.bg.surface,
  outline: 'none',
  cursor: 'pointer',
};

export default function DashboardThemeEditor({ themeConfig = {}, onSave, onClose }) {
  const [palette, setPalette] = useState(themeConfig.palette || 'default');
  const [customPalette, setCustomPalette] = useState(
    themeConfig.customPalette || [...CHART_PALETTES.default]
  );
  const [dashboardBg, setDashboardBg] = useState(
    themeConfig.background?.dashboard || TOKENS.bg.deep
  );
  const [tileBg, setTileBg] = useState(
    themeConfig.background?.tile || TOKENS.bg.elevated
  );
  const [tileGap, setTileGap] = useState(themeConfig.spacing?.tileGap ?? 12);
  const [tilePadding, setTilePadding] = useState(themeConfig.spacing?.tilePadding ?? 16);
  const [tileRadius, setTileRadius] = useState(themeConfig.spacing?.tileRadius ?? 10);

  const handleSave = () => {
    onSave({
      palette,
      customPalette: palette === 'custom' ? customPalette : undefined,
      background: { dashboard: dashboardBg, tile: tileBg },
      spacing: { tileGap, tilePadding, tileRadius },
    });
    onClose();
  };

  const updateCustomColor = (index, color) => {
    setCustomPalette((prev) => {
      const next = [...prev];
      next[index] = color;
      return next;
    });
  };

  return (
    <motion.div
      key="theme-editor-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.60)',
        zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <motion.div
        key="theme-editor-modal"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 520, maxHeight: '85vh',
          background: TOKENS.bg.elevated,
          border: `1px solid ${TOKENS.border.default}`,
          borderRadius: TOKENS.radius.xl,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: `1px solid ${TOKENS.border.default}`,
          flexShrink: 0,
        }}>
          <span style={{ fontSize: '16px', fontWeight: 600, color: TOKENS.text.primary }}>
            Dashboard Theme
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleSave} style={{
              padding: '6px 16px', borderRadius: TOKENS.radius.sm,
              background: TOKENS.accent, color: '#fff', border: 'none',
              fontSize: '13px', fontWeight: 600, cursor: 'pointer',
            }}>Save</button>
            <button onClick={onClose} style={{
              padding: '6px 12px', borderRadius: TOKENS.radius.sm,
              background: TOKENS.bg.surface, color: TOKENS.text.secondary,
              border: `1px solid ${TOKENS.border.default}`, fontSize: '13px', cursor: 'pointer',
            }}>Cancel</button>
          </div>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 20px' }}>

          {/* Section: Color Palette */}
          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>Color Palette</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {PALETTE_KEYS.map((key) => (
                <button
                  key={key}
                  onClick={() => setPalette(key)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: TOKENS.radius.sm,
                    fontSize: 12,
                    fontWeight: palette === key ? 600 : 400,
                    cursor: 'pointer',
                    background: palette === key ? TOKENS.accentGlow : TOKENS.bg.surface,
                    color: palette === key ? TOKENS.accentLight : TOKENS.text.secondary,
                    border: `1px solid ${palette === key ? TOKENS.accent : TOKENS.border.default}`,
                    transition: `all ${TOKENS.transition}`,
                    textTransform: 'capitalize',
                  }}
                >
                  {key}
                </button>
              ))}
              <button
                onClick={() => setPalette('custom')}
                style={{
                  padding: '6px 14px',
                  borderRadius: TOKENS.radius.sm,
                  fontSize: 12,
                  fontWeight: palette === 'custom' ? 600 : 400,
                  cursor: 'pointer',
                  background: palette === 'custom' ? TOKENS.accentGlow : TOKENS.bg.surface,
                  color: palette === 'custom' ? TOKENS.accentLight : TOKENS.text.secondary,
                  border: `1px solid ${palette === 'custom' ? TOKENS.accent : TOKENS.border.default}`,
                  transition: `all ${TOKENS.transition}`,
                }}
              >
                Custom
              </button>
            </div>

            {/* Preview swatches for preset palettes */}
            {palette !== 'custom' && CHART_PALETTES[palette] && (
              <div style={{ display: 'flex', gap: 4 }}>
                {CHART_PALETTES[palette].map((c, i) => (
                  <div key={i} style={{
                    width: 24, height: 24, borderRadius: 4,
                    background: c, border: `1px solid rgba(255,255,255,0.08)`,
                  }} />
                ))}
              </div>
            )}

            {/* Custom palette color pickers */}
            {palette === 'custom' && (
              <div>
                <span style={labelStyle}>Custom Colors</span>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {customPalette.slice(0, 8).map((c, i) => (
                    <ColorPickerButton
                      key={i}
                      color={c}
                      onChange={(newColor) => updateCustomColor(i, newColor)}
                      size={32}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Section: Background */}
          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>Background</div>
            <div style={{ display: 'flex', gap: 24 }}>
              <div style={{ flex: 1 }}>
                <span style={labelStyle}>Dashboard Background</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <ColorPickerButton color={dashboardBg} onChange={setDashboardBg} size={32} />
                  <span style={{ fontSize: 12, fontFamily: 'monospace', color: TOKENS.text.muted }}>
                    {dashboardBg}
                  </span>
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <span style={labelStyle}>Tile Default Background</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <ColorPickerButton color={tileBg} onChange={setTileBg} size={32} />
                  <span style={{ fontSize: 12, fontFamily: 'monospace', color: TOKENS.text.muted }}>
                    {tileBg}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Section: Spacing */}
          <div style={{ ...sectionStyle, borderBottom: 'none' }}>
            <div style={sectionTitleStyle}>Spacing</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Tile Gap */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={labelStyle}>Tile Gap</span>
                  <span style={{ fontSize: 12, color: TOKENS.text.muted }}>{tileGap}px</span>
                </div>
                <input
                  type="range" min={4} max={24} step={1}
                  value={tileGap}
                  onChange={(e) => setTileGap(Number(e.target.value))}
                  style={sliderTrackStyle}
                />
              </div>

              {/* Tile Padding */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={labelStyle}>Tile Padding</span>
                  <span style={{ fontSize: 12, color: TOKENS.text.muted }}>{tilePadding}px</span>
                </div>
                <input
                  type="range" min={8} max={32} step={1}
                  value={tilePadding}
                  onChange={(e) => setTilePadding(Number(e.target.value))}
                  style={sliderTrackStyle}
                />
              </div>

              {/* Tile Border Radius */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={labelStyle}>Tile Border Radius</span>
                  <span style={{ fontSize: 12, color: TOKENS.text.muted }}>{tileRadius}px</span>
                </div>
                <input
                  type="range" min={0} max={24} step={1}
                  value={tileRadius}
                  onChange={(e) => setTileRadius(Number(e.target.value))}
                  style={sliderTrackStyle}
                />
              </div>
            </div>
          </div>

        </div>
      </motion.div>
    </motion.div>
  );
}
