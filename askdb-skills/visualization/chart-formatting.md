---
applies_to: chart-selection, dashboard-build
depends_on:
  - chart-selection
  - color-system
description: 'Currency: < $1,000 → $847 Currency K: $1K+ → $8.2K Currency M: $1M+
  → $8.2M'
legacy: true
name: chart-formatting
priority: 3
tokens_budget: 1700
---

# Chart Formatting — AskDB AgentEngine

## Axis Formatting

### Y-Axis Number Formats
```
Raw numbers:     < 1,000    → 847
Thousands:       1K–999K    → 8.2K
Millions:        1M–999M    → 8.2M
Billions:        1B+        → 1.2B

Currency:        < $1,000   → $847
Currency K:      $1K+       → $8.2K
Currency M:      $1M+       → $8.2M

Percentages:     Always XX.X% (one decimal)
Ratios:          X.Xx (one decimal, 'x' suffix)
```

### Y-Axis Scale Rules
- **Bar charts:** Always start at 0. Never truncate.
- **Line charts:** May start above 0 if variance is small relative to baseline. Disclose.
- **Logarithmic scale:** Only when data spans 3+ orders of magnitude.
- **Max Y-axis value:** Slightly above data max (5-10% headroom). Never clip data.

### X-Axis Date Formatting
```
Daily data:      Jan 1, Jan 15, Feb 1     (sparse labels)
Weekly:          W1 '24, W2 '24           (week number)
Monthly:         Jan '24, Feb '24         (abbreviated month + year)
Quarterly:       Q1 '24, Q2 '24
Yearly:          2022, 2023, 2024
```

**Auto-select label density:** Show max 12 labels on X-axis. Skip intermediate dates if > 12 points.

## Locale-Aware Number Formatting (research-context §3.8 typography rule 3)

Use `Intl.NumberFormat` for locale-aware compact notation rather than hardcoded K/M/B suffixes:

```javascript
// Compact notation (en-US): 8200000 → "8.2M"
new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(8_200_000)
// → "8.2M"

// en-IN (lakh/crore): 8200000 → "82L" (82 lakh), 10000000 → "1Cr"
new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(8_200_000)
// → "82L"

// Currency compact (en-US):
new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD',
  notation: 'compact', maximumFractionDigits: 1
}).format(8_200_000)
// → "$8.2M"

// Detect user locale from connection metadata or browser navigator.language
```

**Rule:** Detect user locale from connection profile or `navigator.language`. Default `en-US` if unknown. Do not hardcode suffix logic.

## Tabular Numbers for Aligned Columns (research-context §3.8 typography rule)

In data tables and tooltip columns where numbers need vertical alignment:

```css
.chart-value, .table-cell-numeric {
  font-variant-numeric: tabular-nums;  /* Fixed-width digits for alignment */
  font-feature-settings: "tnum";       /* Fallback for older browsers */
}
```

Without `tabular-nums`, variable-width digits cause misaligned decimal points in columns.

## Legend Placement

- **Position:** Below chart title, above chart area (NOT floating inside chart)
- **Orientation:** Horizontal for ≤ 4 series. Vertical sidebar for 5-8 series.
- **Format:** Color swatch (10×10px square) + series name + current value (if applicable)
- **Interaction:** Click to toggle series visibility

## Gridlines

- **Horizontal gridlines:** Light — 10-15% opacity. Guides the eye without dominating.
- **Vertical gridlines:** None (usually). Add only for time-series with specific event markers.
- **Zero line:** Always show for charts that can have negative values. Slightly darker.
- **Reference line:** Dashed. Label with value and context ("Target: $2M").

## Tooltip Format

```
[Date or Category Label]

[Series 1 name]: [Value] ([% of total or change])
[Series 2 name]: [Value]
[Subtotal if applicable]: [Value]
```

**Tooltip rules:**
- Always show on hover, never on click
- Position: Top-right of cursor (never cover data being inspected)
- Maximum 5 metrics in tooltip
- Format numbers consistently with axis labels

## Data Labels (On-Chart Numbers)

**Show data labels when:**
- Chart has ≤ 8 bars/slices
- Numbers are the primary message (not the visual shape)
- User explicitly requests them

**Hide data labels when:**
- Too many data points (makes chart unreadable)
- Chart is very small (labels don't fit)
- Values are available in tooltip on hover

**Placement:**
- Bar chart: Above bar (outside) or end of bar (inside if bar is tall enough)
- Donut: Outside with leader line for small slices
- Line chart: On last data point only (end label)

## Annotation and Reference Lines

**When to add automatically:**
- Target or goal line when `target`, `goal`, `budget` column exists in data
- Average line when distribution is the story
- Event marker when date column correlates with known events in schema

**Format:**
```
Target line:    Dashed line, amber color, labeled "$2M Target"
Average line:   Dashed line, gray, labeled "Avg: $847K"
Event marker:   Vertical dashed line, labeled with event name
Forecast:       Dashed continuation of trend line (different opacity)
Anomaly callout: Filled circle + arrow + inline label "Spike: +42% — investigate"
```

**Annotation placement rule (research-context §3.8 typography rule 4):** Annotate anomalies **directly on the chart**, not in a footnote. Footnotes are missed; inline annotations are seen.

**Annotation copy format:**
- Anomaly: `"[Event]: [magnitude] — [suggested action]"` (max 60 chars)
- Reference line: `"[Label]: [value]"` (max 30 chars)
- Forecast endpoint: `"[Period]: [value] (forecast)"` (max 40 chars)

## Responsive Tile Sizing

When tile is smaller than minimum readable size, adapt:
```
Width < 300px:  Hide axis labels, show only data + title
Width < 200px:  Collapse to sparkline + single number
Height < 180px: Collapse to single row KPI format
```

## Color Assignment for Series

When multiple series exist, assign colors deterministically:

```python
# Series color assignment order (map to theme palette)
COLOR_ORDER = [
  primary_blue,    # First / most important series
  secondary_green, # Second
  accent_amber,    # Third
  muted_purple,    # Fourth
  neutral_gray,    # Fifth and beyond (or "Other")
]
```

**Consistency rule:** Same dimension value (e.g., "Enterprise") = same color everywhere on dashboard.

---

## Examples

**Bar chart, 12 months of revenue:**
- Y-axis: $0 to $2.5M (formatted as $0, $500K, $1M, $1.5M, $2M, $2.5M)
- X-axis: Jan '24, Feb '24... (abbreviated, all 12 visible)
- Bars: Blue fill, no outline
- Gridlines: Light horizontal only
- Data labels: None (too many bars)
- Tooltip: Shows "March 2024: $1.2M (+8% vs Feb)"

**KPI tile formatting:**
```
PIPELINE
$8.2M
↑ 18% vs last quarter
[subtle sparkline]
```
Number size: 32px bold. Label: 12px gray above. Delta: 13px with color coding.

**Donut chart, 5 segments:**
- Labels: Outside with leader lines
- Segments: 5 colors from palette
- Center text: Total value or dominant segment %
- Legend: Below chart, horizontal
