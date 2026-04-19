---
applies_to: chart-selection, dashboard-build
description: 'The RSR dynamically selects the renderer based on data volume and GPU
  tier:'
legacy: true
name: vizql-capabilities-progressive-disclosure
priority: 3
tokens_budget: 1600
---

# VizQL v0.9 Capabilities — AskDB AgentEngine

## Renderer Selection (RSR — Render Strategy Router)

The RSR dynamically selects the renderer based on data volume and GPU tier:

```python
def select_renderer(row_count, chart_type, gpu_tier, frame_budget_ms=16):
  # T0: SVG — small, crisp, accessible
  if row_count < 1000 and chart_type in ['bar', 'line', 'pie', 'donut']:
    return "svg"
  
  # T1: Canvas 2D — 80% use case
  if row_count < 100_000 and chart_type not in ['scatter_dense']:
    return "canvas_fast"
  
  # T2: WebGL — large datasets
  if row_count < 1_000_000:
    return "webgl_sdf"  # SDF instanced rendering
  
  # T3: WebGL + Arrow Streaming — massive datasets
  return "webgl_arrow_streaming"  # Progressive IPC chunks
```

**Frame budget monitoring:** RSR tracks actual frame time. If rendering exceeds 13ms (leaving 3ms buffer in 16ms budget), it automatically steps down to a lower tier or reduces point density.

## Chart Types Supported

| Chart type | Max rows (performant) | Renderer | Notes |
|-----------|----------------------|---------|-------|
| Bar (vertical) | 500 bars | Canvas | > 500: top-N + Other |
| Bar (horizontal) | 200 bars | Canvas | > 200: top-N + Other |
| Line | 100K points | Canvas | > 100K: LTTB first |
| Area | 100K points | Canvas | Stacked supported |
| Scatter | 1M points | WebGL SDF | Single draw call |
| Scatter (dense) | 10M points | WebGL + Arrow | Streaming required |
| Heatmap | 1M cells | WebGL | Color-batched |
| Pie/Donut | 6 slices | SVG | Hard limit |
| Funnel | 8 stages | SVG/Canvas | — |
| Map (choropleth) | Per geography | SVG | — |
| Table (data grid) | Virtualized | DOM | Lazy rows |
| KPI/BAN tile | N/A | DOM | Always instant |
| Sparkline | 1K points | SVG | Inline in KPI tile |

## Native Table Calculations (30)

These run client-side in the browser without additional SQL:

**Running calculations:**
- Running Total, Running Average, Running Min, Running Max
- Running Count

**Percent calculations:**
- Percent of Total, Percent of Column, Percent of Row
- Percent Difference (from first, from previous)

**Ranking:**
- Rank, Dense Rank, Percentile, Quantile (N-tile)

**Moving calculations:**
- Moving Average (configurable window), Moving Sum, Moving Min, Moving Max

**Index calculations:**
- Index (row number within partition), First, Last

**Statistical:**
- Standard Deviation, Variance, Median, Correlation

**Lookup:**
- Previous Value (LAG), Next Value (LEAD)

## LOD Expressions (Browser-Side)

AskDB supports LOD expressions that run post-aggregation in the browser:

```
{FIXED [Region]: SUM([Sales])}
→ Aggregates sales by region, regardless of current view granularity

{INCLUDE [Customer]: SUM([Sales])}  
→ Adds customer dimension to current aggregation level

{EXCLUDE [Region]: AVG([Sales])}
→ Removes region from current aggregation level
```

**Performance note:** Browser-side LOD is appropriate for datasets already aggregated by the SQL layer. For billion-row LOD operations, compile to warehouse SQL instead (see join-intelligence.md for SQL LOD patterns).

## Forecasting (Built-in)

```
Linear trend: y = mx + b (least squares fit)
Exponential smoothing: weighted recent values
Seasonal decomposition: additive or multiplicative
Confidence intervals: 95% bands by default
Forecast horizon: up to 12 periods by default
```

**Trigger:** User says "forecast", "predict next", "trend forward", "what will X be next [period]"

**Display:** Dashed line continuation, shaded confidence interval band, labeled forecast endpoint.

## K-Means Clustering (Built-in)

Runs in browser on aggregated data:
- Default: 3 clusters (user-configurable)
- Features: Automatically selected from numeric columns in view
- Display: Color-coded scatter plot with centroids marked
- Label: Cluster 1, 2, 3 (or AI-named based on centroid characteristics)

**Trigger:** User says "cluster", "segment", "group these"

## WebGL SDF Renderer Details

For 1M+ row scatter plots:
- SDF circles: Single GPU draw call regardless of point count
- ~3ms render time for 1M marks
- Zero aliasing (smooth circles at any zoom)
- Spatial hash for O(1) hover/click interactivity
- InstancePool: Evicts off-screen WebGL contexts to prevent memory accumulation

**Memory management:** RSR monitors GPU memory. If available VRAM drops below threshold, automatically evicts least-recently-viewed WebGL contexts.

---

# Progressive Disclosure — AskDB AgentEngine

## When to Show Summary vs Detail

**Summary first (default):** Show the key insight. Make more detail available on demand.

**Progressive levels:**
```
Level 1: KPI tile (number + trend) — fits on phone screen
Level 2: Chart (visual shape of data) — standard dashboard view  
Level 3: Data table (exact values) — analyst review
Level 4: SQL query (what generated this) — technical audit
Level 5: Underlying data (export) — full data access
```

**User moves between levels by:**
- Clicking "Show data" → Level 3
- Clicking "Show SQL" → Level 4
- Clicking "Export" → Level 5
- Hovering → tooltip (intermediate detail)
- Clicking a bar/point → drill-down query

## Dashboard Hierarchy for Executives

Executive dashboard = 10-second rule applies:

```
Row 1: 4-5 KPI tiles (10-second read)
  → If something is wrong, it's RED here
  → If something is great, it's GREEN here

Row 2: Primary chart (30-second read)
  → The main story, without needing to look elsewhere

Row 3+: Supporting detail (analyst-level)
  → For people who want to understand WHY
  → Never required for the executive to understand Row 1 and 2
```

## When NOT to Add More Tiles

**Stop adding tiles when:**
- Dashboard answers its primary question completely
- User hasn't asked for more
- Adding another metric would require the user to actively switch between tiles to understand the relationship

**Offer instead of adding:**
- "Want me to add a breakdown by [dimension]?"
- "I can add a drill-down table if you need the exact numbers."

## Hover-State Progressive Disclosure

Every chart element should reveal more detail on hover:
- Bar: Exact value + % of total + delta vs comparison
- Line point: Date + value + trend context
- Scatter point: All dimension values + identifying label
- Heatmap cell: X label + Y label + exact value + percentile

**Tooltip max content:** 5 data points. Never a paragraph of text.
