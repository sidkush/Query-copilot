# Color System — AskDB AgentEngine

## Theme-Specific Palettes

### Workbench Theme (Dark Professional)

```css
/* Background */
--bg-primary: #0D1117
--bg-secondary: #161B22
--bg-tertiary: #1C2128
--bg-card: #21262D

/* Text */
--text-primary: #E6EDF3
--text-secondary: #8B949E
--text-muted: #484F58

/* Accent (primary brand) */
--accent-primary: #388BFD     /* Blue — primary metric */
--accent-success: #3FB950     /* Green — positive performance */
--accent-danger: #F85149      /* Red — negative / alert */
--accent-warning: #D29922     /* Amber — warning / neutral */
--accent-purple: #A371F7      /* Purple — secondary metric */

/* Chart series (in order) */
--series-1: #388BFD           /* Primary */
--series-2: #3FB950           /* Secondary */
--series-3: #D29922           /* Tertiary */
--series-4: #A371F7           /* Quaternary */
--series-5: #F78166           /* Quinary */
--series-other: #484F58       /* "Other" / de-emphasized */

/* Grid and borders */
--grid-line: rgba(56, 139, 253, 0.08)
--border-subtle: rgba(255, 255, 255, 0.08)
```

### Board Pack Theme (Editorial Light)

```css
/* Background */
--bg-primary: #FAFAF8
--bg-secondary: #F4F4F1
--bg-tertiary: #EBEBEB
--bg-card: #FFFFFF

/* Text */
--text-primary: #1A1A18
--text-secondary: #5A5A56
--text-muted: #9A9A96

/* Accent */
--accent-primary: #1A1A18     /* Near-black — editorial */
--accent-highlight: #C84B31   /* Warm red — callouts */
--accent-success: #2D6A4F     /* Forest green */
--accent-warning: #E9C46A     /* Golden — highlights */
--accent-link: #264653        /* Dark teal */

/* Chart series */
--series-1: #264653           /* Dark teal */
--series-2: #2A9D8F           /* Teal */
--series-3: #E9C46A           /* Gold */
--series-4: #F4A261           /* Warm orange */
--series-5: #C84B31           /* Red */
--series-other: #9A9A96       /* Gray */

/* Annotation colors */
--annotation-positive: #2D6A4F
--annotation-negative: #C84B31
--annotation-neutral: #5A5A56

/* Grid */
--grid-line: rgba(0, 0, 0, 0.06)
--border-subtle: rgba(0, 0, 0, 0.08)
```

### LiveOps Theme (Terminal / Monitoring)

```css
/* Background — terminal aesthetic */
--bg-primary: #080A0F
--bg-secondary: #0D1017
--bg-panel: #111519
--bg-card: #141820

/* Text */
--text-primary: #E8E6E0
--text-secondary: #8892A0
--text-muted: #3D4450

/* Signal colors (status-oriented) */
--signal-ok: #1D9E75          /* Green — nominal */
--signal-warn: #E9C46A        /* Amber — degraded */
--signal-error: #E24B4A       /* Red — critical */
--signal-info: #4A9EFF        /* Blue — informational */

/* Chart traces */
--trace-primary: #1D9E75      /* Main metric line */
--trace-secondary: #4A9EFF    /* Secondary metric */
--trace-anomaly: #E24B4A      /* Anomaly highlight */
--trace-forecast: #8892A0     /* Forecast (dimmer) */

/* Event markers */
--event-positive: #1D9E75
--event-negative: #E24B4A
--event-neutral: #4A9EFF

/* Terminal elements */
--terminal-green: #1D9E75
--terminal-cursor: #E8E6E0
--scanline: rgba(0, 255, 0, 0.02)  /* Optional scanline effect */

/* Grid */
--grid-line: rgba(74, 158, 255, 0.05)
```

### Briefing Theme (Warm Editorial)

```css
/* Background — warm paper */
--bg-primary: #FAF8F4
--bg-secondary: #F0EDE6
--bg-card: #FFFFFF
--bg-accent: #F5EDD8

/* Text — warm blacks */
--text-primary: #2C2A24
--text-secondary: #6B6660
--text-muted: #A09B96

/* Accent */
--accent-primary: #8B4513    /* Saddle brown — editorial anchor */
--accent-highlight: #C17D3C  /* Warm amber — callouts */
--accent-success: #3A6B4A    /* Forest green */
--accent-danger: #A33A2A     /* Warm red */

/* Chart series */
--series-1: #8B4513          /* Brown */
--series-2: #3A6B4A          /* Green */
--series-3: #2C5F8A          /* Navy blue */
--series-4: #8A5A2C          /* Tan */
--series-5: #6B3A3A          /* Burgundy */
--series-other: #A09B96      /* Warm gray */

/* Drop cap accent */
--drop-cap-color: #C17D3C

/* Grid */
--grid-line: rgba(139, 69, 19, 0.06)
```

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

## Colorblind Accessibility

Default palettes are designed to be distinguishable for common color vision deficiencies:

**Deuteranopia (red-green) check:**
- Never rely on red vs green alone
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
