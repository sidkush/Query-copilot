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
  radius: { sm: '6px', md: '10px', lg: '14px', xl: '18px', pill: '9999px' },
  transition: '200ms cubic-bezier(0.16,1,0.3,1)',
  // Fonts
  fontDisplay: "'Outfit', system-ui, sans-serif",
  fontBody: "'Plus Jakarta Sans', 'Outfit', system-ui, sans-serif",
  fontMono: "'JetBrains Mono', ui-monospace, monospace",
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
  // ── Status bar tokens (SP-1) ──
  statusBar: {
    height: 32,
    bg: '#18181b',
    border: '#27272a',
    font: "'JetBrains Mono', ui-monospace, monospace",
    fontSize: 11,
    dotSize: 6,
    // Connection status dot colors
    connected: '#22c55e',
    disconnected: '#ef4444',
    reconnecting: '#eab308',
    // Divider between sections
    divider: 'rgba(63,63,70,0.6)',
    // Muted label color
    label: '#71717a',
    value: '#a1a1aa',
  },
  // ── Context bar tokens (SP-1) ──
  contextBar: {
    height: 28,
    fontSize: 12,
    color: '#71717a',
    bg: 'rgba(20,20,23,0.95)',
    border: 'rgba(63,63,70,0.3)',
  },
  // ── Top bar tokens (SP-1) ──
  topBar: {
    height: 52,
    bg: 'rgba(24,24,27,0.95)',
    border: 'rgba(63,63,70,0.5)',
    breadcrumbMuted: '#71717a',
    breadcrumbActive: '#e4e4e7',
    // Edit mode badge colors
    editMode: {
      default: { dot: '#3b82f6', bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.2)', label: '#60a5fa' },
      pro: { dot: '#a855f7', bg: 'rgba(168,85,247,0.1)', border: 'rgba(168,85,247,0.2)', label: '#c084fc' },
      stage: { dot: '#22c55e', bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.2)', label: '#4ade80' },
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

/**
 * Per-archetype theme overrides — each of the 6 dashboard archetypes gets a
 * token override map. Merged on top of base TOKENS via resolveArchetypeTokens().
 *
 * Architecture: B (Premium Editorial) as daily-driver base, A (Hollywood HUD) as
 * Stage Mode swap, C (Data Cinema) principles baked into chart defaults.
 */
export const ARCHETYPE_THEMES = {
  // ── 1. Executive Briefing ──
  // Premium boardroom. White space, KPI hero row, AI narrative.
  briefing: {
    id: 'briefing',
    name: 'Executive Briefing',
    description: 'Premium boardroom aesthetic. Generous spacing, large KPI text, narrative-friendly.',
    colorScheme: 'dark', // default scheme; user can toggle
    background: {
      dashboard: 'var(--bg-page)',
      tile: 'var(--glass-bg-card)',
      section: 'transparent',
    },
    spacing: {
      tileGap: 20,
      tileRadius: 20,
      tilePadding: 24,
      sectionGap: 32,
      density: 'comfortable', // comfortable | compact | dense
    },
    typography: {
      headingFont: "'Outfit', system-ui, sans-serif",
      bodyFont: "'Plus Jakarta Sans', system-ui, sans-serif",
      dataFont: "'JetBrains Mono', ui-monospace, monospace",
      headingSize: 36,
      headingWeight: 700,
      bodySize: 14,
      dataSize: 13,
    },
    palette: 'default',
    tile: {
      borderWidth: 0,
      shadow: true,
      glass: true,
      hoverLift: 2, // px translate on hover
    },
    kpi: {
      valueFontSize: 48,
      valueFontWeight: 800,
      labelFontSize: 10,
    },
    accent: 'var(--accent)',
  },

  // ── 2. Analyst Dense Workbench ──
  // Tableau-class density. Many tiles, filter chips, click-to-cross-filter.
  workbench: {
    id: 'workbench',
    name: 'Analyst Workbench',
    description: 'Tableau-class density. Compact spacing, small text, high information density.',
    colorScheme: 'dark',
    background: {
      dashboard: '#08080d',
      tile: 'rgba(17,17,22,0.85)',
      section: 'transparent',
    },
    spacing: {
      tileGap: 10,
      tileRadius: 10,
      tilePadding: 12,
      sectionGap: 16,
      density: 'dense',
    },
    typography: {
      headingFont: "'Outfit', system-ui, sans-serif",
      bodyFont: "'Plus Jakarta Sans', system-ui, sans-serif",
      dataFont: "'JetBrains Mono', ui-monospace, monospace",
      headingSize: 13,
      headingWeight: 650,
      bodySize: 12,
      dataSize: 11,
    },
    palette: 'default',
    tile: {
      borderWidth: 1,
      shadow: false,
      glass: false,
      hoverLift: 0,
    },
    kpi: {
      valueFontSize: 28,
      valueFontWeight: 750,
      labelFontSize: 8,
    },
    accent: 'var(--accent)',
  },

  // ── 3. Live Operations ──
  // Datadog-class NOC. Pure dark. Auto-refresh. Traffic-light KPIs.
  ops: {
    id: 'ops',
    name: 'Live Operations',
    description: 'NOC-class operations center. Dark, traffic-light accents, monospace data.',
    colorScheme: 'dark', // forced dark
    background: {
      dashboard: '#050508',
      tile: 'rgba(12,12,16,0.92)',
      section: 'transparent',
    },
    spacing: {
      tileGap: 8,
      tileRadius: 8,
      tilePadding: 12,
      sectionGap: 12,
      density: 'dense',
    },
    typography: {
      headingFont: "'JetBrains Mono', ui-monospace, monospace",
      bodyFont: "'JetBrains Mono', ui-monospace, monospace",
      dataFont: "'JetBrains Mono', ui-monospace, monospace",
      headingSize: 12,
      headingWeight: 600,
      bodySize: 11,
      dataSize: 12,
    },
    palette: 'default',
    tile: {
      borderWidth: 1,
      shadow: false,
      glass: false,
      hoverLift: 0,
    },
    kpi: {
      valueFontSize: 32,
      valueFontWeight: 700,
      labelFontSize: 9,
    },
    accent: '#22c55e', // green — ops/health
    statusColors: {
      healthy: '#22c55e',
      warning: '#eab308',
      critical: '#ef4444',
      unknown: '#6b7280',
    },
  },

  // ── 4. Story / Scrollytelling ──
  // NYT/Pudding editorial. Cream paper. Serif headings. Annotated charts.
  story: {
    id: 'story',
    name: 'Story Mode',
    description: 'Editorial scrollytelling. Cream/paper tones, serif headings, editorial spacing.',
    colorScheme: 'light', // story prefers light
    background: {
      dashboard: '#FDFBF7', // warm cream
      tile: '#FFFFFF',
      section: 'transparent',
    },
    spacing: {
      tileGap: 24,
      tileRadius: 6,
      tilePadding: 28,
      sectionGap: 48,
      density: 'comfortable',
    },
    typography: {
      headingFont: "'Georgia', 'Playfair Display', 'Times New Roman', serif",
      bodyFont: "'Source Serif 4', Georgia, serif",
      dataFont: "'JetBrains Mono', ui-monospace, monospace",
      headingSize: 28,
      headingWeight: 700,
      bodySize: 16,
      dataSize: 13,
    },
    palette: 'default',
    tile: {
      borderWidth: 0,
      shadow: false,
      glass: false,
      hoverLift: 0,
    },
    kpi: {
      valueFontSize: 44,
      valueFontWeight: 700,
      labelFontSize: 11,
    },
    accent: '#1d4ed8', // deep blue — editorial
    editorial: {
      annotationBorder: '#3b82f6',
      annotationBg: 'rgba(59,130,246,0.06)',
      chapterLabel: 'var(--text-muted)',
    },
  },

  // ── 5. Pitch / Presentation ──
  // Apple Keynote cinematic. Dark. One hero per slide.
  pitch: {
    id: 'pitch',
    name: 'Pitch Mode',
    description: 'Cinematic dark presentation. Oversized headings, minimal chrome.',
    colorScheme: 'dark',
    background: {
      dashboard: '#000000',
      tile: 'rgba(15,15,20,0.9)',
      section: 'transparent',
    },
    spacing: {
      tileGap: 0, // edge-to-edge slides
      tileRadius: 0,
      tilePadding: 40,
      sectionGap: 0,
      density: 'comfortable',
    },
    typography: {
      headingFont: "'Outfit', system-ui, sans-serif",
      bodyFont: "'Plus Jakarta Sans', system-ui, sans-serif",
      dataFont: "'JetBrains Mono', ui-monospace, monospace",
      headingSize: 48,
      headingWeight: 800,
      bodySize: 18,
      dataSize: 14,
    },
    palette: 'default',
    tile: {
      borderWidth: 0,
      shadow: false,
      glass: false,
      hoverLift: 0,
    },
    kpi: {
      valueFontSize: 64,
      valueFontWeight: 800,
      labelFontSize: 12,
    },
    accent: '#6366f1', // indigo — keynote
  },

  // ── 6. Tableau Classic ──
  // Familiar BI tool aesthetic. Dense grid, filters across top, light background.
  tableau: {
    id: 'tableau',
    name: 'Tableau Classic',
    description: 'Traditional BI aesthetic. Light background, Tableau 10 palette, dense grid.',
    colorScheme: 'light',
    background: {
      dashboard: '#F0F0F4',
      tile: '#FFFFFF',
      section: 'transparent',
    },
    spacing: {
      tileGap: 8,
      tileRadius: 4,
      tilePadding: 10,
      sectionGap: 16,
      density: 'dense',
    },
    typography: {
      headingFont: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      bodyFont: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      dataFont: "'Consolas', 'Menlo', ui-monospace, monospace",
      headingSize: 13,
      headingWeight: 600,
      bodySize: 12,
      dataSize: 11,
    },
    palette: 'tableau10',
    tile: {
      borderWidth: 1,
      shadow: false,
      glass: false,
      hoverLift: 0,
    },
    kpi: {
      valueFontSize: 28,
      valueFontWeight: 700,
      labelFontSize: 9,
    },
    accent: '#4E79A7', // Tableau blue
    filterBar: {
      bg: '#FFFFFF',
      border: 'rgba(0,0,0,0.08)',
      chipBg: '#EEF2FF',
      chipText: '#1E3A8A',
    },
  },
};

/**
 * Hollywood HUD Stage Mode — Iron Man / Westworld aesthetic.
 * Activated when user selects "Stage" edit mode. Dark only.
 * Performance budget: all effects CSS-only, must maintain 60fps.
 */
export const STAGE_MODE_THEME = {
  id: 'hollywood_hud',
  name: 'Hollywood HUD',
  description: 'Cinematic sci-fi HUD. Neon accents, glow effects, scan-lines, holographic shimmer.',
  colorScheme: 'dark', // forced dark — no light option
  background: {
    dashboard: '#020205',
    tile: 'rgba(8,8,14,0.92)',
    section: 'transparent',
  },
  spacing: {
    tileGap: 12,
    tileRadius: 6,
    tilePadding: 16,
    sectionGap: 20,
    density: 'compact',
  },
  typography: {
    headingFont: "'Outfit', system-ui, sans-serif",
    bodyFont: "'Plus Jakarta Sans', system-ui, sans-serif",
    dataFont: "'JetBrains Mono', ui-monospace, monospace",
    headingSize: 14,
    headingWeight: 700,
    bodySize: 13,
    dataSize: 12,
  },
  palette: 'default',
  tile: {
    borderWidth: 1,
    shadow: true,
    glass: true,
    hoverLift: 1,
  },
  kpi: {
    valueFontSize: 40,
    valueFontWeight: 800,
    labelFontSize: 9,
  },
  accent: '#a855f7', // electric purple
  neon: {
    primary: '#a855f7',    // electric purple
    secondary: '#06b6d4',  // cyan
    tertiary: '#ec4899',   // hot pink
    glow: '0 0 20px rgba(168,85,247,0.4), 0 0 60px rgba(168,85,247,0.1)',
    glowCyan: '0 0 20px rgba(6,182,212,0.4), 0 0 60px rgba(6,182,212,0.1)',
    glowPink: '0 0 20px rgba(236,72,153,0.4), 0 0 60px rgba(236,72,153,0.1)',
    borderGlow: 'rgba(168,85,247,0.35)',
    scanlineOpacity: 0.03,
    scanlineSize: '2px',
    shimmerAngle: '135deg',
    shimmerColors: 'rgba(168,85,247,0.08), rgba(6,182,212,0.06), rgba(236,72,153,0.04)',
    gridlineColor: 'rgba(168,85,247,0.12)',
    gridlineWidth: 0.5,
    particleDensity: 30, // CSS particles — number of dots
    particleColor: 'rgba(168,85,247,0.3)',
  },
};

/**
 * Data Cinema defaults — Tufte data-ink ratio principles baked into every
 * chart render. These are NOT a separate theme mode but principles applied
 * globally to improve default chart quality.
 */
export const DATA_CINEMA_DEFAULTS = {
  // Remove chart junk
  gridlineOpacity: 0.06,    // faint, not heavy
  gridlineColor: 'var(--text-muted)',
  gridlineStroke: 0.5,
  axisLineWidth: 1,
  axisTitleSize: 11,
  axisLabelSize: 10,
  // Color usage as story device
  defaultColorOpacity: 0.75, // muted by default
  highlightColorOpacity: 1,  // full on hover/focus
  // Typography for annotations
  annotationFont: "'Source Serif 4', Georgia, serif",
  annotationSize: 12,
  annotationColor: 'var(--text-secondary)',
  // Subtitle / annotation field
  subtitleFont: "'Plus Jakarta Sans', system-ui, sans-serif",
  subtitleSize: 12,
  subtitleColor: 'var(--text-muted)',
  subtitleWeight: 400,
  // Print-ready: no glass/blur when exporting
  exportClean: true,
  // Small multiples
  smallMultipleGap: 8,
  smallMultipleHeaderSize: 10,
};

/**
 * Merge base TOKENS + archetype-specific overrides into a resolved token set.
 * Used by layout components and DashboardTileCanvas to adapt styling per mode.
 *
 * @param {string} archetypeId — one of: briefing, workbench, ops, story, pitch, tableau
 * @param {string|null} editMode — 'stage' activates STAGE_MODE_THEME overrides
 * @returns {object} merged theme object with { tokens, archetype, isStageMode }
 */
export function resolveArchetypeTokens(archetypeId = 'briefing', editMode = null) {
  const archetype = ARCHETYPE_THEMES[archetypeId] || ARCHETYPE_THEMES.briefing;
  const isStageMode = editMode === 'stage';
  const stageOverrides = isStageMode ? STAGE_MODE_THEME : null;

  return {
    tokens: TOKENS,
    archetype: stageOverrides || archetype,
    isStageMode,
    dataCinema: DATA_CINEMA_DEFAULTS,
    palette: CHART_PALETTES[
      (stageOverrides || archetype).palette
    ] || CHART_PALETTES.default,
  };
}
