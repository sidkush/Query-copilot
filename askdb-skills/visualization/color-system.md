---
applies_to: chart-selection, dashboard-build
description: 'css /* Background */ --bg-primary: #0D1117 --bg-secondary: #161B22 --bg-tertiary:
  #1C2128 --bg-card: #21262D'
legacy: true
name: color-system
priority: 3
tokens_budget: 1100
---

# Color System — AskDB AgentEngine

## Theme-Specific Palettes

Theme CSS tokens (Workbench, Board Pack, LiveOps, Briefing) have been **moved to `dashboard-aesthetics.md` §Theme CSS Palettes** to eliminate duplication (research-context §2.2 dedup). See that file for hex values and CSS custom properties.

This file retains only semantic color rules applicable across all themes.

## Semantic Color Rules (Apply Across All Themes)

### Performance indicators (universal)
```
POSITIVE (above target, growth, improvement):
  Workbench: --accent-success (#3FB950 green)
  Board Pack: --accent-success (#2D6A4F forest green)
  LiveOps: --signal-ok (#1D9E75 green)
  Briefing: --accent-success (#3A6B4A forest green)

NEGATIVE (below target, decline, alert):
  Workbench: --accent-danger (#F85149 red)
  Board Pack: --accent-highlight (#C84B31 warm red)
  LiveOps: --signal-error (#E24B4A red)
  Briefing: --accent-danger (#A33A2A warm red)

WARNING (at risk, approaching threshold):
  All themes: amber/yellow variant of theme palette

NEUTRAL (comparison, historical, "Other"):
  All themes: muted gray variant
```

### Delta Indicators (Always Color + Icon)
```
Positive delta:  ↑ 18%   (green text + up arrow)
Negative delta:  ↓ 5%    (red text + down arrow)
Neutral delta:   → 0%    (gray text + right arrow)
No data:         —       (muted text, em dash)
```

## Color Assignment Algorithm

When multiple series need colors, assign deterministically:

```python
def assign_series_colors(series_names, theme):
    palette = get_theme_palette(theme)
    assignments = {}
    
    # Special assignments first
    for name in series_names:
        if name.lower() in ['other', 'others', 'remaining']:
            assignments[name] = palette.series_other
        elif name.lower() in ['target', 'goal', 'budget']:
            assignments[name] = palette.text_muted  # Dashed reference line
    
    # Regular series in palette order
    regular_series = [s for s in series_names if s not in assignments]
    for i, name in enumerate(regular_series):
        assignments[name] = palette.series[i % len(palette.series)]
    
    return assignments
```

## Colorblind Accessibility (research-context §3.8 color rules 2-4)

**CVD prevalence:** ~8% of men have red-green color vision deficiency (deuteranopia / protanopia). Color is **never** the sole encoding — always pair with shape, label, or direction arrow.

**Sequential palettes for continuous data:**
- **Viridis** and **Cividis** pass all CVD tests (deuteranopia, protanopia, tritanopia) and perceptual uniformity tests. Prefer over custom ramps.
- **Diverging:** RdBu, BrBG, PiYG — only when there is a meaningful midpoint (e.g., deviation from target).

**OkLCH for custom ramps (2024-2026 CSS standard; research-context §3.8 color rule 4):**
When Viridis/Cividis don't fit the brand, generate custom sequential ramps in OkLCH color space for perceptually equal brightness steps (HSL produces unequal steps across hues):
```css
/* OkLCH sequential ramp (blue, 5 steps, perceptually uniform) */
oklch(0.95 0.03 250) → oklch(0.80 0.08 250) → oklch(0.65 0.14 250)
→ oklch(0.50 0.18 250) → oklch(0.35 0.20 250)
```

**Dark mode:** Invert lightness only (L channel in OkLCH); cap saturation (chroma) at ~60% to prevent oversaturation.

**Deuteranopia (red-green) check:**
- Never rely on red vs green alone (~8% of men affected)
- Always add: arrows (↑↓), labels, or patterns as secondary encoding
- KPI deltas: color + directional symbol

**High contrast mode (optional):**
- Increase text contrast to minimum 7:1 (WCAG AAA)
- Increase border opacity on charts
- Add outline to chart marks

---

## Examples

**Workbench theme, 3-series line chart:**
- Enterprise: `#388BFD` (series-1, blue)
- Mid-market: `#3FB950` (series-2, green)
- SMB: `#D29922` (series-3, amber)

**Board Pack theme, positive KPI delta:**
- Text: `#2D6A4F` (forest green)
- Icon: ↑
- Display: "↑ 18% vs last quarter" in forest green

**LiveOps theme, P95 latency chart:**
- Trace: `#1D9E75` (signal-ok green) when within SLA
- Trace: `#E24B4A` (signal-error red) when above SLA threshold
- Reference line at SLA: `#E9C46A` (amber, dashed)
