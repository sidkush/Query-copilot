---
applies_to: chart-selection, dashboard-build
description: Use these as starting points. Agent selects based on detected data domain.
legacy: true
name: dashboard-layout-patterns
priority: 3
tokens_budget: 1300
---

# Dashboard Layout Patterns — AskDB AgentEngine

## Standard Layout Templates

Use these as starting points. Agent selects based on detected data domain.

### Executive Overview (Default)
```
[KPI: Revenue] [KPI: Growth] [KPI: Churn] [KPI: NRR]     ← Row 1: 4 KPI tiles
[Primary trend — full width line chart]                    ← Row 2: Main story
[Breakdown A — 50%] [Breakdown B — 50%]                   ← Row 3: Supporting
[Detail table — full width]                               ← Row 4: Drill-down
```
Grid spec: 12 columns. KPIs = 3 cols each. Primary = 12 cols. Breakdowns = 6 cols each.

### Sales Pipeline
```
[Pipeline $] [Win Rate] [Cycle Days] [Avg Deal] [Q Forecast]   ← Row 1: 5 KPIs
[Funnel by Stage — 40%] [Pipeline Velocity — 60%]              ← Row 2
[Rep×Stage Heatmap — 40%] [Pipeline by Industry — 30%] [Loss — 30%] ← Row 3
[Stuck Deals Table] [Recent Activity]                          ← Row 4
```

### Marketing Analytics
```
[Sessions] [Leads] [MQLs] [SQLs] [CAC]                    ← Row 1: 5 KPIs
[Traffic trend — full width]                               ← Row 2
[Channel Attribution — 50%] [Campaign Performance — 50%]  ← Row 3
[Conversion funnel — 40%] [Content performance — 60%]     ← Row 4
```

### Product Analytics
```
[DAU] [MAU] [DAU/MAU ratio] [D1 Retention] [D30 Retention] ← Row 1
[Active users trend — full width]                           ← Row 2
[Feature adoption — 50%] [User journey funnel — 50%]       ← Row 3
[Cohort retention grid — full width]                        ← Row 4
```

### Financial / P&L
```
[Revenue] [COGS] [Gross Margin] [OpEx] [EBITDA]            ← Row 1
[Revenue vs target trend — full width]                     ← Row 2
[Revenue by segment — 50%] [Cost breakdown — 50%]         ← Row 3
[Top accounts by MRR] [Risk accounts by churn score]       ← Row 4
```

### Operations / LiveOps
```
CH.1: [Primary metric — large]  CH.2: [Secondary metric]   ← Row 1
CH.3: [Real-time trace — full width]                       ← Row 2
CH.4: [Distribution histogram — 50%] [Event log — 50%]    ← Row 3
[Status bar: system health indicators]                     ← Footer
```

## Grid System

AskDB uses a 12-column grid with responsive breakpoints:

| Tile size | Columns | % width | Use for |
|-----------|---------|---------|---------|
| Full width | 12 | 100% | Primary charts, header KPI rows |
| Three-quarters | 9 | 75% | Primary chart with sidebar |
| Two-thirds | 8 | 66% | Main content with companion |
| Half | 6 | 50% | Paired charts |
| Third | 4 | 33% | Three-column layouts |
| Quarter | 3 | 25% | KPI tiles (4 per row) |
| Fifth | 2-3 | 20-25% | KPI tiles (5 per row) |

## Row Height Standards

| Content type | Default height | Notes |
|-------------|---------------|-------|
| KPI / BAN tile | 120px | Can expand to 160px with sparkline |
| Small chart | 240px | Simple bar/line |
| Standard chart | 320px | Default for most charts |
| Large chart | 400px | Scatter, heatmap, complex viz |
| Data table | 360px | Virtualized, scrollable |
| Full dashboard section | 480px | When chart is the main story |

## Tile Spacing Rules

- Minimum gap between tiles: 12px
- Preferred gap: 16px (maintains breathing room)
- Section spacing: 24px between dashboard sections
- Tile internal padding: 16px all sides

## Auto-Layout Algorithm (For AI-Generated Dashboards)

When generating a dashboard from scratch:

```
1. Identify KPI metrics (scalar outputs) → Place in Row 1, equal width
   Max 5 KPIs per row. If 6+, use two KPI rows.

2. Identify primary time series → Full width, Row 2

3. Identify breakdown dimensions (category, region, segment) 
   → 2 charts = 50/50 split
   → 3 charts = 40/30/30 or 33/33/33
   → 4 charts = 25/25/25/25 or 50/25/25

4. Identify detail/tabular data → Full width, bottom row

5. Apply theme color system and formatting rules
```

---

## Examples

**Input:** "Build a sales dashboard for our Q3 board pack"
**Layout selected:** Sales Pipeline template → Board Pack theme
**Grid:**
- Row 1: Pipeline ($8.2M), Win Rate (38%), Cycle Days (42), Avg Deal ($57.8K), Q Forecast ($2.4M) — each 2.4 cols
- Row 2: Pipeline conversion funnel (5 cols) + Velocity chart (7 cols)
- Row 3: Rep×Stage heatmap (5 cols) + Industry breakdown (4 cols) + Loss reasons (3 cols)
- Row 4: Stuck deals table (6 cols) + Recent activity feed (6 cols)

**Input:** "Show me key product metrics"
**Layout selected:** Product Analytics template → Workbench theme
**Tiles generated:** DAU, MAU, DAU/MAU, D1 retention, D30 retention + trend + feature adoption + cohort grid
