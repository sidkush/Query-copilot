---
applies_to: chart-selection, dashboard-build
description: A well-designed dashboard communicates its most important insight to
  a non-technical user within 10 seconds of viewing. If a user needs to read...
legacy: true
name: dashboard-aesthetics
priority: 3
tokens_budget: 1400
---

# Dashboard Aesthetics — AskDB AgentEngine

## The 10-Second Rule

A well-designed dashboard communicates its most important insight to a non-technical user within 10 seconds of viewing. If a user needs to read axis labels or count bars to understand the key message, the dashboard has failed.

**Test before finalizing:** "If I showed this to a VP for 10 seconds, what would they remember?" That thing should be the largest, most prominent element.

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
- Never use red + green as the only distinction (affects 8% of men)
- Pair color with secondary encoding: shape, pattern, or label
- Red/green pair for performance: always add ↑↓ arrows too

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
