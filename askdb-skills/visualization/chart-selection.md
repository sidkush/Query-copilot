# Chart Selection — AskDB AgentEngine

## Primary Decision Tree

```
What is the primary analytical question?
├── How much? (single value)         → KPI / BAN tile + sparkline
├── How has X changed over time?
│   ├── 1-2 metrics                  → Line chart
│   ├── 3-4 metrics                  → Multi-line chart
│   ├── 5+ metrics                   → Small multiples OR top-N + "Other"
│   └── Showing composition change   → Stacked area chart
├── How do categories compare?
│   ├── < 8 categories               → Vertical bar chart
│   ├── 8-20 categories              → Horizontal bar chart (labels fit)
│   ├── 20+ categories               → Top N bar + "Other" bucket
│   └── Ranking with scores          → Horizontal bar, sorted descending
├── What is the breakdown / share?
│   ├── 2-6 categories               → Donut chart
│   ├── 7+ categories                → Horizontal bar chart (pie is unreadable)
│   └── Changing share over time     → 100% stacked bar or stacked area
├── What is the relationship between two metrics?
│   ├── Correlation (continuous)     → Scatter plot
│   ├── Correlation over time        → Dual-axis line chart
│   └── Distribution + outliers      → Box plot or violin plot
├── How is data distributed?
│   ├── Continuous variable          → Histogram
│   └── Frequency of categories      → Bar chart (sorted by frequency)
├── Where? (geographic)              → Map tile (choropleth or point map)
├── How does flow work?              → Sankey / funnel chart
└── Tabular / drill-down needed      → Data table tile
```

## Hard Rules

### Never use these chart types for these data shapes:
- **Pie chart with > 6 slices** — segments become unreadable below ~5%
- **Pie chart with negative values** — mathematically invalid
- **Line chart for unordered categories** — implies trend that doesn't exist
- **Stacked bar with > 5 segments** — inner segments become impossible to compare
- **Dual Y-axis** — use only when units genuinely differ (e.g., revenue in $ and volume in units)

### Always use these for these shapes:
- **Single number** → BAN tile (Big Ass Number), NOT a one-bar bar chart
- **Time series with 100+ points** → Line chart with TurboTier LTTB downsampling, not dots
- **> 1M rows scatter** → WebGL SDF renderer via RSR, not SVG or Canvas
- **Table > 50 columns** → Virtualized data table, NOT a rendered grid

## Series Overflow Handling

When data has more series than a chart can display cleanly:

```
Line chart: > 6 series    → Keep top 5 by value, aggregate rest as "Other"
Bar chart: > 20 bars      → Keep top 15 + "Other" bar at end
Pie chart: > 6 slices     → Keep top 5 + "Other" slice
Scatter: > 100k points    → WebGL renderer (RSR auto-selects)
Scatter: > 1M points      → LTTB downsampling first, then WebGL
```

**Always note in summary:** "Showing top [N] [dimension]. [X] others grouped as 'Other'."

## Axis Scale Rules

### When to use logarithmic scale:
- Data spans multiple orders of magnitude (1 to 1,000,000)
- Showing growth rates that compound (revenue doubling each year)
- Never for data that contains 0 or negative values

### When to use dual Y-axis:
- Two metrics with genuinely different units (revenue $ vs order count)
- Make the relationship explicit, not just coincidental
- Label both axes clearly

### Zero-baseline rule:
- Bar charts: ALWAYS start Y-axis at 0. Starting at non-zero is misleading.
- Line charts: MAY start at non-zero when showing small variations in a high-baseline metric. Disclose.

## Chart Title Convention

**Format:** "[Insight], not [Label]"

```
BAD:  "Revenue by Month"
GOOD: "Revenue Growing 12% — Q4 Acceleration"

BAD:  "Orders by Region"  
GOOD: "EMEA Leads with 45% of Orders"

BAD:  "User Retention"
GOOD: "Day-30 Retention Declined 5pp — Investigate Onboarding"
```

**Rule:** Title = the most important thing the user should know from this chart.

## KPI Tile Format

When result is a single number:
- Large: The number itself (formatted: $1.2M not $1,200,000)
- Small above: Metric label
- Small below: Context (vs prior period, vs target)
- Micro chart: Sparkline showing trend

```
PIPELINE
$8.2M
↑ 18% vs last quarter
[sparkline]
```

## Number Formatting in Charts

| Magnitude | Format | Example |
|-----------|--------|---------|
| < 1,000 | Raw | 847 |
| 1,000 – 999,999 | K suffix | 8.2K |
| 1M – 999M | M suffix | 8.2M |
| 1B+ | B suffix | 1.2B |
| Currency < 1K | $XXX | $847 |
| Currency 1K+ | $X.XK | $8.2K |
| Percentage | XX.X% | 18.4% |
| Ratio | X.Xx | 4.7x |

---

## Examples

**Data shape:** Single number — Total Revenue = $8,200,000
**Chart:** KPI BAN tile. Shows "$8.2M" large. "Total Revenue" above. "+18% vs last quarter" below.

**Data shape:** Revenue by month, last 12 months, 1 metric
**Chart:** Line chart. Single line. No dots (too many). Grid lines light. Title = trend insight.

**Data shape:** Market share, 8 product categories
**Chart:** Horizontal bar chart sorted descending. NOT a pie chart (too many slices).

**Data shape:** Revenue ($M) and Order Count on same chart over time
**Chart:** Dual Y-axis line chart. Left axis = revenue, right axis = order count. Labeled clearly.

**Data shape:** User acquisition source breakdown — 5 channels
**Chart:** Donut chart. Maximum 5 slices. Percentage labeled on each.
