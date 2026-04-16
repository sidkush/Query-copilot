import { useState, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  TOKENS,
  CHART_PALETTES,
  DASHBOARD_PRESETS,
  ARCHETYPE_THEMES,
  STAGE_MODE_THEME,
} from './tokens';
import ColorPickerButton from './ColorPickerButton';

const PALETTE_KEYS = Object.keys(CHART_PALETTES);
const PRESET_ENTRIES = Object.values(DASHBOARD_PRESETS);
const DENSITY_OPTIONS = ['comfortable', 'compact', 'dense'];

const DENSITY_VALUES = {
  comfortable: { tileGap: 18, tilePadding: 24, tileRadius: 20 },
  compact:     { tileGap: 12, tilePadding: 16, tileRadius: 12 },
  dense:       { tileGap: 8,  tilePadding: 10, tileRadius: 6  },
};

/* ── Shared styles ── */
const labelStyle = {
  display: 'block',
  fontSize: '10px',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: TOKENS.text.muted,
  marginBottom: '6px',
};

const sectionTitleStyle = {
  fontSize: '12px',
  fontWeight: 700,
  color: TOKENS.text.primary,
  marginBottom: '10px',
  letterSpacing: '-0.01em',
};

const sectionStyle = {
  padding: '14px 0',
  borderBottom: `1px solid ${TOKENS.border.default}`,
};

const sliderTrackStyle = {
  width: '100%',
  appearance: 'none',
  height: 3,
  borderRadius: 2,
  background: TOKENS.bg.surface,
  outline: 'none',
  cursor: 'pointer',
};

const pillBtnStyle = (active) => ({
  padding: '5px 12px',
  borderRadius: TOKENS.radius.sm,
  fontSize: 11,
  fontWeight: active ? 650 : 400,
  cursor: 'pointer',
  background: active ? TOKENS.accentGlow : TOKENS.bg.surface,
  color: active ? TOKENS.accentLight : TOKENS.text.secondary,
  border: `1px solid ${active ? TOKENS.accent : TOKENS.border.default}`,
  transition: `all ${TOKENS.transition}`,
  textTransform: 'capitalize',
  whiteSpace: 'nowrap',
});

/**
 * DashboardThemeEditor — SP-4d polished version.
 *
 * Features:
 *   - Preset quick-select (one-click apply full theme)
 *   - Live preview (changes apply instantly via onLivePreview callback)
 *   - Palette picker with swatches
 *   - Typography preview (heading/body/data samples)
 *   - Spacing density control (comfortable / compact / dense)
 *   - Export theme as JSON
 */
export default function DashboardThemeEditor({
  themeConfig = {},
  onSave,
  onClose,
  onLivePreview,
  archetypeMode: _archetypeMode, // eslint-disable-line no-unused-vars
}) {
  // ── State from existing config ──
  const [activePreset, setActivePreset] = useState(themeConfig.presetId || null);
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
  const [tileGap, setTileGap] = useState(themeConfig.spacing?.tileGap ?? 14);
  const [tilePadding, setTilePadding] = useState(themeConfig.spacing?.tilePadding ?? 16);
  const [tileRadius, setTileRadius] = useState(themeConfig.spacing?.tileRadius ?? 14);
  const [density, setDensity] = useState(themeConfig.spacing?.density || 'comfortable');
  const [accentColor, setAccentColor] = useState(themeConfig.accent || TOKENS.brandPurple);

  // Build current config for live preview
  const currentConfig = useMemo(() => ({
    presetId: activePreset,
    palette,
    customPalette: palette === 'custom' ? customPalette : undefined,
    background: { dashboard: dashboardBg, tile: tileBg },
    spacing: { tileGap, tilePadding, tileRadius, density },
    accent: accentColor,
  }), [activePreset, palette, customPalette, dashboardBg, tileBg, tileGap, tilePadding, tileRadius, density, accentColor]);

  // Emit live preview on every change
  const emitPreview = useCallback((config) => {
    if (onLivePreview) onLivePreview(config);
  }, [onLivePreview]);

  // ── Preset quick-select ──
  const applyPreset = (preset) => {
    setActivePreset(preset.id);
    setPalette(preset.palette || 'default');
    setDashboardBg(preset.background?.dashboard || TOKENS.bg.deep);
    setTileBg(preset.background?.tile || TOKENS.bg.elevated);
    setTileGap(preset.spacing?.tileGap ?? 14);
    setTileRadius(preset.spacing?.tileRadius ?? 14);
    setAccentColor(preset.accent || TOKENS.brandPurple);

    const config = {
      presetId: preset.id,
      palette: preset.palette || 'default',
      background: preset.background,
      spacing: preset.spacing,
      accent: preset.accent,
    };
    emitPreview(config);
  };

  // ── Apply archetype theme ──
  const applyArchetype = (archetypeId) => {
    const theme = ARCHETYPE_THEMES[archetypeId];
    if (!theme) return;
    setActivePreset(theme.id);
    setPalette(theme.palette || 'default');
    setDashboardBg(theme.background?.dashboard || TOKENS.bg.deep);
    setTileBg(theme.background?.tile || TOKENS.bg.elevated);
    setTileGap(theme.spacing?.tileGap ?? 14);
    setTilePadding(theme.spacing?.tilePadding ?? 16);
    setTileRadius(theme.spacing?.tileRadius ?? 14);
    setDensity(theme.spacing?.density || 'comfortable');
    setAccentColor(theme.accent || TOKENS.brandPurple);
    emitPreview({
      presetId: theme.id,
      palette: theme.palette,
      background: theme.background,
      spacing: theme.spacing,
      accent: theme.accent,
    });
  };

  // ── Density control ──
  const applyDensity = (d) => {
    setDensity(d);
    const vals = DENSITY_VALUES[d];
    setTileGap(vals.tileGap);
    setTilePadding(vals.tilePadding);
    setTileRadius(vals.tileRadius);
    emitPreview({ ...currentConfig, spacing: { ...vals, density: d } });
  };

  const handleSave = () => {
    onSave(currentConfig);
    onClose();
  };

  const handleExportJSON = () => {
    const json = JSON.stringify(currentConfig, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `askdb-theme-${activePreset || 'custom'}.json`;
    a.click();
    URL.revokeObjectURL(url);
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
        background: 'var(--modal-overlay)',
        zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <motion.div
        key="theme-editor-modal"
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 580, maxHeight: '88vh',
          background: TOKENS.bg.elevated,
          border: `1px solid ${TOKENS.border.default}`,
          borderRadius: TOKENS.radius.xl,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 24px 80px rgba(0,0,0,0.5), 0 0 40px rgba(37,99,235,0.04)',
        }}
      >
        {/* ═══ Header ═══ */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px',
          borderBottom: `1px solid ${TOKENS.border.default}`,
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '15px', fontWeight: 700, color: TOKENS.text.primary, letterSpacing: '-0.02em' }}>
              Theme Editor
            </span>
            {activePreset && (
              <span style={{
                fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.08em', padding: '2px 8px', borderRadius: 9999,
                background: TOKENS.accentGlow, color: TOKENS.accentLight,
                border: `1px solid ${TOKENS.accent}`,
              }}>
                {activePreset.replace(/_/g, ' ')}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={handleExportJSON} title="Export as JSON" style={{
              padding: '5px 10px', borderRadius: TOKENS.radius.sm,
              background: TOKENS.bg.surface, color: TOKENS.text.muted,
              border: `1px solid ${TOKENS.border.default}`, fontSize: '11px', cursor: 'pointer',
            }}>Export</button>
            <button onClick={handleSave} style={{
              padding: '5px 14px', borderRadius: TOKENS.radius.sm,
              background: TOKENS.accent, color: '#fff', border: 'none',
              fontSize: '12px', fontWeight: 650, cursor: 'pointer',
            }}>Save</button>
            <button onClick={onClose} style={{
              padding: '5px 10px', borderRadius: TOKENS.radius.sm,
              background: TOKENS.bg.surface, color: TOKENS.text.secondary,
              border: `1px solid ${TOKENS.border.default}`, fontSize: '12px', cursor: 'pointer',
            }}>Cancel</button>
          </div>
        </div>

        {/* ═══ Scrollable content ═══ */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 20px' }}>

          {/* ── Section: Quick Presets ── */}
          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>Quick Presets</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {PRESET_ENTRIES.map((p) => (
                <button
                  key={p.id}
                  onClick={() => applyPreset(p)}
                  title={p.description}
                  style={pillBtnStyle(activePreset === p.id)}
                >
                  {p.name}
                </button>
              ))}
            </div>

            {/* Archetype-aware quick-apply */}
            <div style={{ marginTop: 8 }}>
              <span style={labelStyle}>Archetype Themes</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {Object.values(ARCHETYPE_THEMES).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => applyArchetype(t.id)}
                    title={t.description}
                    style={pillBtnStyle(activePreset === t.id)}
                  >
                    {t.name}
                  </button>
                ))}
                <button
                  onClick={() => {
                    setActivePreset('hollywood_hud');
                    applyPreset(DASHBOARD_PRESETS.hollywood_hud);
                  }}
                  title={STAGE_MODE_THEME.description}
                  style={{
                    ...pillBtnStyle(activePreset === 'hollywood_hud'),
                    background: activePreset === 'hollywood_hud'
                      ? 'rgba(168,85,247,0.15)'
                      : TOKENS.bg.surface,
                    borderColor: activePreset === 'hollywood_hud'
                      ? '#a855f7'
                      : TOKENS.border.default,
                    color: activePreset === 'hollywood_hud'
                      ? '#c084fc'
                      : TOKENS.text.secondary,
                  }}
                >
                  HUD Stage
                </button>
              </div>
            </div>
          </div>

          {/* ── Section: Color Palette ── */}
          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>Color Palette</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {PALETTE_KEYS.map((key) => (
                <button
                  key={key}
                  onClick={() => { setPalette(key); setActivePreset(null); }}
                  style={pillBtnStyle(palette === key)}
                >
                  {key === 'tableau10' ? 'Tableau' : key}
                </button>
              ))}
              <button
                onClick={() => { setPalette('custom'); setActivePreset(null); }}
                style={pillBtnStyle(palette === 'custom')}
              >
                Custom
              </button>
            </div>

            {/* Swatch preview */}
            {palette !== 'custom' && CHART_PALETTES[palette] && (
              <div style={{ display: 'flex', gap: 3 }}>
                {CHART_PALETTES[palette].map((c, i) => (
                  <div key={i} style={{
                    width: 22, height: 22, borderRadius: 4,
                    background: c, border: `1px solid rgba(255,255,255,0.06)`,
                    transition: `transform ${TOKENS.transition}`,
                    cursor: 'default',
                  }}
                  title={c}
                  />
                ))}
              </div>
            )}

            {/* Custom palette pickers */}
            {palette === 'custom' && (
              <div>
                <span style={labelStyle}>Custom Colors</span>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {customPalette.slice(0, 8).map((c, i) => (
                    <ColorPickerButton
                      key={i}
                      color={c}
                      onChange={(newColor) => updateCustomColor(i, newColor)}
                      size={28}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── Section: Accent Color ── */}
          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>Accent Color</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <ColorPickerButton color={accentColor} onChange={setAccentColor} size={28} />
              <span style={{ fontSize: 11, fontFamily: TOKENS.fontMono, color: TOKENS.text.muted }}>
                {accentColor}
              </span>
              {/* Quick accent presets */}
              {['#2563EB', '#a855f7', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#4E79A7'].map((c) => (
                <div
                  key={c}
                  onClick={() => setAccentColor(c)}
                  style={{
                    width: 18, height: 18, borderRadius: 4, background: c,
                    cursor: 'pointer', border: accentColor === c
                      ? '2px solid #fff'
                      : '1px solid rgba(255,255,255,0.08)',
                    transition: `border ${TOKENS.transition}`,
                  }}
                />
              ))}
            </div>
          </div>

          {/* ── Section: Background ── */}
          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>Background</div>
            <div style={{ display: 'flex', gap: 20 }}>
              <div style={{ flex: 1 }}>
                <span style={labelStyle}>Dashboard</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ColorPickerButton color={dashboardBg} onChange={setDashboardBg} size={28} />
                  <span style={{ fontSize: 10, fontFamily: TOKENS.fontMono, color: TOKENS.text.muted }}>
                    {dashboardBg}
                  </span>
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <span style={labelStyle}>Tile</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ColorPickerButton color={tileBg} onChange={setTileBg} size={28} />
                  <span style={{ fontSize: 10, fontFamily: TOKENS.fontMono, color: TOKENS.text.muted }}>
                    {tileBg}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Section: Spacing & Density ── */}
          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>Spacing & Density</div>

            {/* Density quick-select */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
              {DENSITY_OPTIONS.map((d) => (
                <button
                  key={d}
                  onClick={() => applyDensity(d)}
                  style={pillBtnStyle(density === d)}
                >
                  {d}
                </button>
              ))}
            </div>

            {/* Fine-tune sliders */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <SliderRow label="Tile Gap" value={tileGap} min={4} max={28}
                onChange={(v) => { setTileGap(v); setDensity(null); }} />
              <SliderRow label="Tile Padding" value={tilePadding} min={6} max={40}
                onChange={(v) => { setTilePadding(v); setDensity(null); }} />
              <SliderRow label="Border Radius" value={tileRadius} min={0} max={28}
                onChange={(v) => { setTileRadius(v); setDensity(null); }} />
            </div>
          </div>

          {/* ── Section: Typography Preview ── */}
          <div style={{ ...sectionStyle, borderBottom: 'none' }}>
            <div style={sectionTitleStyle}>Typography Preview</div>
            <div style={{
              padding: 16, borderRadius: TOKENS.radius.md,
              background: TOKENS.bg.surface, border: `1px solid ${TOKENS.border.default}`,
              display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              <div style={{
                fontFamily: TOKENS.fontDisplay, fontSize: 28, fontWeight: 700,
                letterSpacing: '-0.03em', color: TOKENS.text.primary, lineHeight: 1.1,
              }}>
                Display Heading
              </div>
              <div style={{
                fontFamily: TOKENS.fontBody, fontSize: 14, fontWeight: 400,
                color: TOKENS.text.secondary, lineHeight: 1.5,
              }}>
                Body text — Plus Jakarta Sans, used for descriptions and paragraph content across the dashboard.
              </div>
              <div style={{
                fontFamily: TOKENS.fontMono, fontSize: 13, fontWeight: 500,
                color: TOKENS.text.primary, letterSpacing: '-0.01em',
                fontVariantNumeric: 'tabular-nums',
              }}>
                $1,234,567.89 &mdash; JetBrains Mono tabular numerics
              </div>
              <div style={{
                fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.22em', color: TOKENS.text.muted,
                fontFamily: TOKENS.fontDisplay,
              }}>
                EYEBROW LABEL
              </div>
            </div>
          </div>

        </div>
      </motion.div>
    </motion.div>
  );
}

/* ── Slider sub-component ── */
function SliderRow({ label, value, min, max, onChange }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={labelStyle}>{label}</span>
        <span style={{ fontSize: 10, color: TOKENS.text.muted, fontFamily: TOKENS.fontMono }}>{value}px</span>
      </div>
      <input
        type="range" min={min} max={max} step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={sliderTrackStyle}
      />
    </div>
  );
}
