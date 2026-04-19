---
applies_to: chart-selection, dashboard-build
description: A well-designed dashboard communicates its most important insight to
  a non-technical user within 10 seconds of viewing. If a user needs to read...
legacy: true
name: dashboard-aesthetics
priority: 3
tokens_budget: 2400
---

# Dashboard Aesthetics — AskDB AgentEngine

## The 5-Second Rule (research-context §3.8 layout rule 3)

A well-designed dashboard communicates its most important insight to a non-technical user within **5 seconds** of viewing (NN/g standard — not 10). If a user needs to read axis labels or count bars to understand the key message, the dashboard has failed.

**Test before finalizing:** "If I showed this to a VP for 5 seconds, what would they remember?" That thing should be the largest, most prominent element.

## Layout Hierarchy — Always Apply

```
Row 1: KPI tiles (3-5 metrics, full width)
        → Single numbers, trend indicators, sparklines
        → These are the "headline" — most critical metrics

Row 2: Primary insight chart (wide, 60-100% width)
        → The single most important trend or comparison
        → This answers "what's the main story?"

Row 3+: Supporting breakdowns (50% width tiles, side by side)
         → These answer "why?" and "where?"
         → Never more than 4 tiles per row

Bottom: Detail tables, drill-downs (full width)
         → For users who want raw data
```

**Exception:** LiveOps theme uses channel-based layout instead of KPI → chart hierarchy.

## Grid System and Spatial Rules (research-context §3.8 layout rules 1-2, 5)

**F-pattern reading (layout rule 1):** Users scan dashboards in an F-shape: first left-to-right on row 1, then left-to-right on row 2, then down the left edge. Place the most critical metric in the **top-left** tile.

**12-column grid (layout rule 2):** Tile widths snap to 3, 6, 9, or 12 columns. Gutters: 16–24 px between tiles. Never let tiles touch edge-to-edge.

| Tile type | Recommended width | Notes |
|-----------|------------------|-------|
| KPI / BAN | 3 columns (25%) | 4 per row = standard row 1 |
| Primary insight chart | 9–12 columns | Full or 3/4 width |
| Supporting breakdown | 6 columns | Side-by-side pairs |
| Detail table | 12 columns | Always full width |

**Whitespace ratio (layout rule 5):** 20-30% of canvas area should be empty space. Dashboards that use < 20% whitespace are perceptually cluttered; > 40% feel incomplete.

## Color Rules

### Palette limits
- **Maximum 5 distinct colors** per dashboard (including KPI accent colors)
- **Maximum 6 series** on a single chart using color distinction
- Beyond 6: Use patterns, opacity, or top-N + "Other" grouping

### Semantic color usage
| Color | When to use |
|-------|-------------|
| Green | Positive performance (above target, growth) |
| Red | Negative performance (below target, decline, alert) |
| Amber/Orange | Warning (at risk, approaching threshold) |
| Blue (primary) | Neutral data, primary metric |
| Gray | Secondary/comparison data, "Other" bucket |

### Colorblind safety rules
- Never use red + green as the only distinction (affects ~8% of men with red-green CVD / deuteranopia)
- Pair color with secondary encoding: shape, pattern, or label
- Red/green pair for performance: always add ↑↓ arrows too

### OkLCH for custom color ramps (research-context §3.8 color rule 4)

When generating custom palettes (not the four built-in themes), use the **OkLCH** color space (2024-2026 CSS standard) for perceptually uniform steps:

```css
/* OkLCH: oklch(lightness chroma hue) — perceptually equal spacing */
/* Sequential ramp example (blue, 5 steps) */
--step-1: oklch(0.95 0.03 250)   /* light */
--step-2: oklch(0.80 0.08 250)
--step-3: oklch(0.65 0.14 250)
--step-4: oklch(0.50 0.18 250)
--step-5: oklch(0.35 0.20 250)   /* dark */
```

OkLCH guarantees equal perceptual brightness steps unlike HSL (which produces uneven brightness across hues). Prefer over HSL for accessibility.

### Background colors
- Chart area: transparent or very light gray (#F8F8F8)
- Never bright/saturated chart backgrounds
- Grid lines: very light (10-15% opacity max)

## Typography Rules

### Title hierarchy
- Dashboard title: Largest, bold — 1 per dashboard
- Section label: Medium, caps or semibold — groups tiles
- Tile title: Medium weight — the INSIGHT, not the metric name
- Axis labels: Small, light — supporting context
- Data labels: Small — when added to chart marks

### Number formatting for visual impact
- KPI tiles: Large number ($8.2M not $8,200,000)
- Avoid scientific notation (1.23e6) — use suffix (1.2M)
- Delta indicators: "+18%" not "0.18" — always percentage for comparison
- Currency: Symbol prefix ($8.2M not 8.2M USD)

## Whitespace Principles

- **Between tiles:** Minimum 12px gap (16px preferred)
- **Within tile:** Minimum 16px padding on all sides
- **Between chart and title:** 8px
- **Chart breathing room:** Chart should not touch tile edges

"Data should breathe. Cramming more in a small space makes everything harder to read."

## What "Polished" Means

A polished dashboard has:
- ✅ All tiles aligned to the same grid
- ✅ Consistent font sizes within a tile type
- ✅ Consistent color usage (same metric = same color everywhere)
- ✅ Titles that are insights, not labels
- ✅ Numbers formatted for human reading (K/M/B suffixes)
- ✅ Reference lines or targets where relevant
- ✅ Delta indicators (vs prior period) on KPI tiles
- ✅ At most 2 font weights (regular + semibold)
- ✅ No more than 5 colors on the whole dashboard

A cluttered dashboard has:
- ❌ Different colors for same metric across tiles
- ❌ Raw numbers (8200000) instead of formatted (8.2M)
- ❌ Tiles packed edge-to-edge with no breathing room
- ❌ More than 6 series on one chart
- ❌ Titles that just say the metric name
- ❌ Pie charts with more than 6 slices
- ❌ Bar charts with Y-axis not starting at 0

## Dashboard Theme Application

### Board Pack theme
- Minimal, editorial aesthetic
- Titles prominent and narrative
- Data-ink ratio maximized
- Accent: single brand color only
- Best for: C-suite, board presentations, investor reports

### LiveOps theme
- Dark background (#0A0A0F or similar)
- Monochrome base with single accent color for alerts
- Dense information layout
- Status indicators (OK/WARN/ERR) prominent
- Best for: Engineering, operations, real-time monitoring

### Workbench theme
- Professional dark, comfortable for extended analysis
- More chart types, denser data
- AI signal panel prominent
- Best for: Analysts, data teams, weekly/daily use

### Briefing theme
- Warm paper-like aesthetic
- Editorial layout, chapter-based scrolling
- AI-generated narrative prominent
- Best for: Reports to stakeholders who don't use BI daily

## Theme CSS Palettes (moved from color-system.md — research-context §2.2 dedup)

Theme-specific design tokens. For semantic color rules (positive/negative/neutral encoding, CVD rules) see `color-system.md`.

### Workbench Theme
```css
--bg-primary: #0D1117; --bg-secondary: #161B22; --bg-card: #21262D;
--text-primary: #E6EDF3; --text-secondary: #8B949E;
--accent-primary: #388BFD; --accent-success: #3FB950;
--accent-danger: #F85149; --accent-warning: #D29922;
--series-1: #388BFD; --series-2: #3FB950; --series-3: #D29922;
--series-4: #A371F7; --series-5: #F78166; --series-other: #484F58;
```

### Board Pack Theme
```css
--bg-primary: #FAFAF8; --bg-card: #FFFFFF;
--text-primary: #1A1A18; --text-secondary: #5A5A56;
--accent-primary: #1A1A18; --accent-highlight: #C84B31;
--series-1: #264653; --series-2: #2A9D8F; --series-3: #E9C46A;
--series-4: #F4A261; --series-5: #C84B31; --series-other: #9A9A96;
```

### LiveOps Theme
```css
--bg-primary: #080A0F; --bg-card: #141820;
--text-primary: #E8E6E0; --text-secondary: #8892A0;
--signal-ok: #1D9E75; --signal-warn: #E9C46A; --signal-error: #E24B4A;
--trace-primary: #1D9E75; --trace-secondary: #4A9EFF;
```

### Briefing Theme
```css
--bg-primary: #FAF8F4; --bg-card: #FFFFFF;
--text-primary: #2C2A24; --text-secondary: #6B6660;
--accent-primary: #8B4513; --accent-highlight: #C17D3C;
--series-1: #8B4513; --series-2: #3A6B4A; --series-3: #2C5F8A;
--series-4: #8A5A2C; --series-5: #6B3A3A; --series-other: #A09B96;
```

---

## Examples

**Before (cluttered):**
- 12 KPI tiles in row 1
- Chart titles: "Revenue", "Orders", "Customers"
- 8 colors on one chart
- Numbers shown as raw (1234567)

**After (polished):**
- 4 KPI tiles (MRR, ARR, Churn, NRR) with sparklines
- Chart titles: "Revenue Growing 12% QoQ", "EMEA Leads with 45% of Orders"
- 4 colors max, green=positive, red=negative, blue=primary, gray=comparison
- Numbers: $1.2M, $14.8M, 2.31%, 117%

**Color assignment rule:**
"Enterprise" segment = Blue (primary)
"Mid-market" segment = Amber
"SMB" segment = Green
"Other" segment = Gray
→ These colors used consistently across ALL charts on dashboard
