/**
 * Design tokens — single source of truth for dashboard styling.
 * Values resolve to CSS custom properties defined in index.css,
 * automatically adapting to light/dark theme.
 */
export const TOKENS = {
  bg: {
    deep: 'var(--bg-page)',
    base: 'var(--bg-base)',
    elevated: 'var(--bg-elevated)',
    surface: 'var(--bg-surface)',
    hover: 'var(--bg-hover)',
  },
  border: {
    default: 'var(--border-default)',
    hover: 'var(--border-hover)',
  },
  text: {
    primary: 'var(--text-primary)',
    secondary: 'var(--text-secondary)',
    muted: 'var(--text-muted)',
  },
  accent: 'var(--accent)',
  accentLight: 'var(--accent-light)',
  accentGlow: 'var(--accent-glow)',
  brandPurple: '#A855F7',
  success: 'var(--status-success)',
  warning: 'var(--status-warning)',
  danger: 'var(--status-danger)',
  info: '#06b6d4',
  radius: { sm: '6px', md: '10px', lg: '14px', xl: '18px', xxl: '28px', pill: '9999px' },
  transition: '200ms cubic-bezier(0.16,1,0.3,1)',
  // Easing curves — exponential ease-out family, no bounce
  easing: {
    out: 'cubic-bezier(0.16, 1, 0.3, 1)',       // expo-out, default
    outSoft: 'cubic-bezier(0.22, 1, 0.36, 1)',  // softer expo-out
    inOut: 'cubic-bezier(0.65, 0, 0.35, 1)',    // smooth in-out
    quick: 'cubic-bezier(0.4, 0, 0.2, 1)',      // material
  },
  // Motion presets — use for Framer Motion `transition` prop
  motion: {
    // Spring families (no overshoot — damping high for premium feel)
    springSnappy: { type: 'spring', stiffness: 420, damping: 38, mass: 0.8 },
    springFluid:  { type: 'spring', stiffness: 260, damping: 30, mass: 0.9 },
    springSoft:   { type: 'spring', stiffness: 180, damping: 28, mass: 1 },
    // Duration-based (for non-layout opacity/transform)
    tweenQuick: { duration: 0.16, ease: [0.22, 1, 0.36, 1] },
    tweenEase:  { duration: 0.28, ease: [0.16, 1, 0.3, 1] },
    tweenSlow:  { duration: 0.48, ease: [0.16, 1, 0.3, 1] },
    // Stagger timings
    stagger: { childDelay: 0.035, totalMax: 0.6 },
  },
  // Premium shadow scale — diffusion family, tinted to brand hue
  shadow: {
    // Ambient depth — used on cards at rest
    card: '0 1px 0 var(--glass-highlight) inset, 0 18px 38px -24px var(--shadow-deep), 0 4px 10px -6px var(--shadow-soft)',
    cardHover: '0 1px 0 var(--glass-highlight) inset, 0 28px 56px -22px var(--shadow-deep), 0 10px 22px -10px var(--shadow-mid)',
    // Diffusion — wide, low, premium (Vercel-core). Theme-adaptive via CSS var.
    diffusion: 'var(--shadow-warm-diffusion)',
    diffusionLight: '0 20px 40px -15px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.04)',
    // Inner refraction — liquid glass edge highlight
    innerGlass: 'inset 0 1px 0 var(--glass-highlight), inset 0 -1px 0 color-mix(in oklab, var(--glass-highlight) 25%, transparent)',
    // Accent glow (subtle, use sparingly on active state)
    accentGlow: '0 0 0 1px color-mix(in oklab, var(--accent) 40%, transparent), 0 8px 30px -12px color-mix(in oklab, var(--accent) 55%, transparent)',
    // Status glow helper — used on live dots
    statusGlow: (color) => `0 0 0 1px ${color}33, 0 0 14px -2px ${color}`,
  },
  // Fonts — premium stack with Satoshi display
  // Satoshi (Fontshare) loaded in index.html; falls back to Cabinet Grotesk then Outfit
  fontDisplay: "'Satoshi', 'Cabinet Grotesk', 'Outfit', system-ui, sans-serif",
  fontBody: "'Plus Jakarta Sans', 'Satoshi', 'Outfit', system-ui, sans-serif",
  fontMono: "'JetBrains Mono', ui-monospace, monospace",
  fontSerif: "'Source Serif 4', 'Source Serif Pro', Georgia, serif",
  // Premium tile defaults — theme-aware via CSS vars
  tile: {
    // Background: glass card that adapts to theme
    surface: 'var(--glass-bg-card)',
    surfaceHover: 'var(--glass-bg-card-hover)',
    // Border: hairline that reads on both themes
    border: 'var(--glass-border)',
    borderHover: 'var(--glass-border-hover)',
    // Shadow stack — base + hover
    shadow:
      '0 1px 0 var(--glass-highlight) inset, 0 22px 44px -28px var(--shadow-deep), 0 6px 14px -10px var(--shadow-soft)',
    shadowHover:
      '0 1px 0 var(--glass-highlight) inset, 0 30px 56px -24px var(--shadow-deep), 0 10px 22px -12px var(--shadow-mid)',
    // Geometry
    radius: 20,
    innerRadius: 17, // radius - border width - pad
    headerHeight: 44,
    headerPad: '13px 16px',
    bodyPad: '4px 14px 14px',
    // Typography
    headerFont: "'Outfit', system-ui, sans-serif",
    titleSize: 14,
    titleWeight: 700,
    titleLetterSpacing: '-0.018em',
    eyebrowSize: 9,
    eyebrowLetterSpacing: '0.22em',
  },
  // KPI-specific premium tokens
  kpi: {
    valueFontSize: 40,
    valueFontWeight: 800,
    valueLetterSpacing: '-0.035em',
    labelFontSize: 9,
    labelLetterSpacing: '0.22em',
    pad: '22px 24px 20px',
  },
  // Dense tile family — Tableau-class information density.
  // Consumed by SparklineKPI / ScorecardTable / HBarCard / HeatMatrix.
  // Grid sizing hints (minW/minH) live on each chartDefs entry; these are
  // the visual/typographic scales that adapt dense tiles to tight footprints.
  dense: {
    // Compact header + body (vs. standard tile 44px header + 14px body pad)
    headerHeight: 32,
    headerPad: '8px 12px',
    bodyPad: '2px 12px 10px',
    innerGap: 6,
    // Title typography — one step smaller than standard tile title
    titleSize: 11.5,
    titleWeight: 650,
    titleLetterSpacing: '-0.012em',
    eyebrowSize: 8,
    eyebrowLetterSpacing: '0.2em',
    // Primary metric (the big value in a SparklineKPI)
    valueSize: 22,
    valueWeight: 750,
    valueLetterSpacing: '-0.028em',
    // Secondary metric (delta chip, sub-label)
    deltaSize: 10.5,
    deltaWeight: 600,
    labelSize: 9.5,
    labelMuted: 'var(--text-muted)',
    // Delta chip palette — delta-up reads as success, delta-down as danger
    deltaUpBg: 'color-mix(in oklab, var(--status-success) 14%, transparent)',
    deltaUpFg: 'var(--status-success)',
    deltaDownBg: 'color-mix(in oklab, var(--status-danger) 14%, transparent)',
    deltaDownFg: 'var(--status-danger)',
    deltaFlatBg: 'color-mix(in oklab, var(--text-muted) 10%, transparent)',
    deltaFlatFg: 'var(--text-muted)',
    // Sparkline / mini-chart stroke + area fill
    sparkStroke: 'var(--accent)',
    sparkStrokeWidth: 1.5,
    sparkArea: 'color-mix(in oklab, var(--accent) 18%, transparent)',
    sparkAreaMuted: 'color-mix(in oklab, var(--accent) 8%, transparent)',
    // Inline bar rail (HBarCard + ScorecardTable inline bars)
    barTrack: 'color-mix(in oklab, var(--text-muted) 14%, transparent)',
    barFill: 'var(--accent)',
    barFillAlt: 'color-mix(in oklab, var(--accent) 75%, var(--brand-purple, #a855f7) 25%)',
    barHeight: 4,
    barRadius: 2,
    // Row rhythm for ScorecardTable (8-row default dense list)
    rowHeight: 22,
    rowGap: 3,
    rowHover: 'var(--bg-hover)',
    rankFg: 'var(--text-muted)',
    rankSize: 10,
    // Heat matrix cell defaults
    heatCellGap: 1,
    heatCellRadius: 2,
    heatColdFg: 'color-mix(in oklab, var(--accent) 6%, var(--bg-elevated))',
    heatHotFg: 'var(--accent)',
    // Grid sizing — react-grid-layout contract (cols=12, rowHeight=60).
    // These are FALLBACK defaults; each chartDefs entry overrides via density.{minW,minH}.
    defaultMinW: 3,
    defaultMinH: 1,
    // Text fade for truncated labels (ScorecardTable long names)
    truncateFade: 'linear-gradient(90deg, transparent 0%, var(--bg-elevated) 92%)',
  },
  // ── Status bar tokens (theme-adaptive via CSS vars) ──
  statusBar: {
    height: 32,
    bg: 'var(--chrome-bar-bg)',
    border: 'var(--chrome-bar-border)',
    font: "'JetBrains Mono', ui-monospace, monospace",
    fontSize: 11,
    dotSize: 6,
    // Connection status dot colors — intrinsic semantic (same both themes)
    connected: 'var(--status-success)',
    disconnected: 'var(--status-danger)',
    reconnecting: 'var(--status-warning)',
    // Divider between sections
    divider: 'var(--chrome-bar-divider)',
    // Text colors
    label: 'var(--text-muted)',
    value: 'var(--text-secondary)',
  },
  // ── Context bar tokens (theme-adaptive) ──
  contextBar: {
    height: 28,
    fontSize: 12,
    color: 'var(--text-muted)',
    bg: 'var(--chrome-bar-bg-subtle)',
    border: 'var(--chrome-bar-border-subtle)',
  },
  // ── Top bar tokens (theme-adaptive) ──
  topBar: {
    height: 52,
    bg: 'var(--chrome-bar-bg)',
    border: 'var(--chrome-bar-border)',
    breadcrumbMuted: 'var(--text-muted)',
    breadcrumbActive: 'var(--text-primary)',
    // Edit mode badge colors — accent tints that adapt via color-mix.
    // Each badge: bg = tinted surface, border = tinted edge, label = readable accent.
    editMode: {
      default: {
        dot: 'var(--accent)',
        bg: 'color-mix(in oklab, var(--accent) 12%, transparent)',
        border: 'color-mix(in oklab, var(--accent) 25%, transparent)',
        label: 'var(--accent)',
      },
      pro: {
        dot: '#a855f7',
        bg: 'color-mix(in oklab, #a855f7 14%, transparent)',
        border: 'color-mix(in oklab, #a855f7 28%, transparent)',
        label: 'color-mix(in oklab, #a855f7 85%, var(--text-primary))',
      },
      stage: {
        dot: 'var(--status-success)',
        bg: 'color-mix(in oklab, var(--status-success) 14%, transparent)',
        border: 'color-mix(in oklab, var(--status-success) 28%, transparent)',
        label: 'var(--status-success)',
      },
    },
  },
};

export const KPI_ACCENTS = [
  'linear-gradient(90deg, #2563EB, #60a5fa)',
  'linear-gradient(90deg, #22c55e, #4ade80)',
  'linear-gradient(90deg, #a78bfa, #c4b5fd)',
  'linear-gradient(90deg, #f59e0b, #fbbf24)',
  'linear-gradient(90deg, #ef4444, #f87171)',
  'linear-gradient(90deg, #06b6d4, #22d3ee)',
];

export const CHART_PALETTES = {
  default: ['#2563EB', '#22C55E', '#A78BFA', '#F59E0B', '#EF4444', '#06B6D4', '#EC4899', '#64748B'],
  ocean: ['#0EA5E9', '#06B6D4', '#14B8A6', '#2DD4BF', '#0284C7', '#0891B2', '#0D9488', '#115E59'],
  sunset: ['#F97316', '#EF4444', '#EC4899', '#F59E0B', '#DC2626', '#DB2777', '#D97706', '#BE123C'],
  forest: ['#22C55E', '#16A34A', '#15803D', '#4ADE80', '#86EFAC', '#166534', '#14532D', '#052E16'],
  mono: ['#F8FAFC', '#CBD5E1', '#94A3B8', '#64748B', '#475569', '#334155', '#1E293B', '#0F172A'],
  colorblind: ['#0077BB', '#33BBEE', '#009988', '#EE7733', '#CC3311', '#EE3377', '#BBBBBB', '#000000'],
  tableau10: ['#4E79A7', '#F28E2B', '#E15759', '#76B7B2', '#59A14F', '#EDC948', '#B07AA1', '#FF9DA7', '#9C755F', '#BAB0AC'],
};

/**
 * Dashboard theme presets — adaptive personality for different user types.
 * Applied via themeConfig on the dashboard object. The agent or user can switch presets.
 * Each preset overrides: background, tile styling, typography, spacing, and chart palette.
 */
export const DASHBOARD_PRESETS = {
  creative_dark: {
    id: 'creative_dark',
    name: 'Creative Dark',
    description: 'Bold colors on dark canvas. Ideal for data visualization, heatmaps, and creative analytics.',
    background: { dashboard: '#0a0a0f', tile: '#141419', section: 'transparent' },
    spacing: { tileGap: 14, tileRadius: 16, sectionGap: 28 },
    typography: { headingFont: "'Outfit', system-ui, sans-serif", bodyFont: "'Inter', system-ui, sans-serif" },
    palette: 'default',
    tile: { borderWidth: 0, shadow: true, shadowBlur: 16 },
    accent: '#2563EB',
  },
  corporate_light: {
    id: 'corporate_light',
    name: 'Corporate Light',
    description: 'Clean professional layout. Suitable for boardroom presentations and executive reports.',
    background: { dashboard: '#FAFBFC', tile: '#FFFFFF', section: 'transparent' },
    spacing: { tileGap: 16, tileRadius: 12, sectionGap: 32 },
    typography: { headingFont: "'Inter', system-ui, sans-serif", bodyFont: "'Inter', system-ui, sans-serif" },
    palette: 'default',
    tile: { borderWidth: 1, shadow: false, shadowBlur: 0 },
    accent: '#1d4ed8',
  },
  finance_pro: {
    id: 'finance_pro',
    name: 'Finance Pro',
    description: 'High-density data display with strong contrast. Built for stock analysis and financial metrics.',
    background: { dashboard: '#080b12', tile: '#0f1219', section: 'transparent' },
    spacing: { tileGap: 10, tileRadius: 8, sectionGap: 20 },
    typography: { headingFont: "'JetBrains Mono', monospace", bodyFont: "'Inter', system-ui, sans-serif" },
    palette: 'ocean',
    tile: { borderWidth: 1, shadow: false, shadowBlur: 0 },
    accent: '#06b6d4',
  },
  minimal: {
    id: 'minimal',
    name: 'Minimal',
    description: 'Maximum whitespace, zero clutter. Data speaks for itself.',
    background: { dashboard: 'transparent', tile: 'transparent', section: 'transparent' },
    spacing: { tileGap: 20, tileRadius: 14, sectionGap: 36 },
    typography: { headingFont: "'Outfit', system-ui, sans-serif", bodyFont: "'Inter', system-ui, sans-serif" },
    palette: 'mono',
    tile: { borderWidth: 0, shadow: false, shadowBlur: 0 },
    accent: '#2563EB',
  },
  premium_editorial: {
    id: 'premium_editorial',
    name: 'Premium Editorial',
    description: 'Linear/Stripe/Vercel aesthetic. Frosted glass, thin strokes, generous white space.',
    background: { dashboard: 'var(--bg-page)', tile: 'var(--glass-bg-card)', section: 'transparent' },
    spacing: { tileGap: 18, tileRadius: 20, sectionGap: 28 },
    typography: { headingFont: "'Outfit', system-ui, sans-serif", bodyFont: "'Plus Jakarta Sans', system-ui, sans-serif" },
    palette: 'default',
    tile: { borderWidth: 0, shadow: true, shadowBlur: 24, glass: true },
    accent: '#2563EB',
  },
  hollywood_hud: {
    id: 'hollywood_hud',
    name: 'Hollywood HUD',
    description: 'Sci-fi HUD aesthetic. Neon purple/cyan/pink, glow effects, scan-lines.',
    background: { dashboard: '#020205', tile: 'rgba(8,8,14,0.92)', section: 'transparent' },
    spacing: { tileGap: 12, tileRadius: 6, sectionGap: 20 },
    typography: { headingFont: "'Outfit', system-ui, sans-serif", bodyFont: "'Plus Jakarta Sans', system-ui, sans-serif" },
    palette: 'default',
    tile: { borderWidth: 1, shadow: true, shadowBlur: 20, glass: true },
    accent: '#a855f7',
  },
  story_editorial: {
    id: 'story_editorial',
    name: 'Story Editorial',
    description: 'NYT/Pudding editorial. Cream paper, serif headings, annotated charts.',
    background: { dashboard: '#FDFBF7', tile: '#FFFFFF', section: 'transparent' },
    spacing: { tileGap: 24, tileRadius: 6, sectionGap: 48 },
    typography: { headingFont: "'Georgia', 'Playfair Display', serif", bodyFont: "'Source Serif 4', Georgia, serif" },
    palette: 'default',
    tile: { borderWidth: 0, shadow: false, shadowBlur: 0, glass: false },
    accent: '#1d4ed8',
  },
  live_ops: {
    id: 'live_ops',
    name: 'Live Ops',
    description: 'Datadog-class NOC. Pure dark, monospace, traffic-light status.',
    background: { dashboard: '#050508', tile: 'rgba(12,12,16,0.92)', section: 'transparent' },
    spacing: { tileGap: 8, tileRadius: 8, sectionGap: 12 },
    typography: { headingFont: "'JetBrains Mono', monospace", bodyFont: "'JetBrains Mono', monospace" },
    palette: 'default',
    tile: { borderWidth: 1, shadow: false, shadowBlur: 0, glass: false },
    accent: '#22c55e',
  },
  tableau_classic: {
    id: 'tableau_classic',
    name: 'Tableau Classic',
    description: 'Familiar BI aesthetic. Light background, Tableau 10 palette, dense grid.',
    background: { dashboard: '#F0F0F4', tile: '#FFFFFF', section: 'transparent' },
    spacing: { tileGap: 8, tileRadius: 4, sectionGap: 16 },
    typography: { headingFont: "system-ui, sans-serif", bodyFont: "system-ui, sans-serif" },
    palette: 'tableau10',
    tile: { borderWidth: 1, shadow: false, shadowBlur: 0, glass: false },
    accent: '#4E79A7',
  },
};
