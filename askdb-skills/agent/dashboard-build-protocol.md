---
applies_to: multi-step-agent, dashboard-build
description: 'Phase 1: UNDERSTAND 1a. Parse user intent — what is the business question?
  1b. Identify data domain (sales, product, finance, marketing, ops) 1c....'
legacy: true
name: dashboard-build-protocol
priority: 3
tokens_budget: 1400
---

# Dashboard Build Protocol — AskDB AgentEngine

## The Sequence (Never Skip Steps)

```
Phase 1: UNDERSTAND
  1a. Parse user intent — what is the business question?
  1b. Identify data domain (sales, product, finance, marketing, ops)
  1c. Select layout template based on domain
  1d. Select dashboard theme based on context (who is the audience?)

Phase 2: PLAN
  2a. Identify KPI metrics → Row 1 tiles
  2b. Identify primary trend → Row 2 tile
  2c. Identify supporting dimensions → Row 3 tiles
  2d. Estimate tile count and tool budget
  2e. State plan to user: "I'll build X tiles covering [metrics]. Starting now."

Phase 3: SCHEMA
  3a. Run schema profiling (if not cached)
  3b. Identify relevant tables and columns
  3c. Detect join paths
  3d. Detect pre-aggregated columns
  3e. Note any data quality signals (high null %, mismatched types)

Phase 4: BUILD (execute tile by tile)
  For each tile:
    4a. Generate SQL query
    4b. Validate SQL (6-layer validator)
    4c. Execute query (select tier: Schema/Memory/Turbo/Live)
    4d. Select chart type (per chart-selection.md)
    4e. Apply formatting (per chart-formatting.md)
    4f. Generate tile title (insight, not metric name)
    4g. Generate AI summary (per insight-generation.md)
    4h. Confirm tile added to dashboard

Phase 5: FINALIZE
  5a. Apply cross-tile color consistency (same dimension = same color)
  5b. Verify layout (KPIs in row 1, primary chart in row 2)
  5c. Generate dashboard-level summary
  5d. Offer next steps
```

## Tool Budget Planning

Before starting, estimate tool calls:
```
Schema profiling:          3-5 tool calls
Per tile (simple):         2-3 tool calls (SQL + chart)
Per tile (complex join):   4-5 tool calls (schema + SQL + validate + chart)
Finalization:              2-3 tool calls

Estimate: (tile_count × 3.5) + 8 base calls

If estimate > 80 tool calls:
  → Warn user: "This is a large dashboard. Building in batches."
  → Build KPIs + primary chart first (highest value)
  → Offer to continue with remaining tiles
```

## Progress Communication

During build, communicate status as animated checklist:

```
✓ Analyzed your schema — found [N] relevant tables
✓ Selected [template] layout
⚡ Building Row 1: KPI tiles (4 tiles)...
  ✓ Total Revenue: $8.2M
  ✓ Win Rate: 38%
  ✓ Cycle Days: 42d
  ✓ Q Forecast: $2.4M
⚡ Building Row 2: Pipeline velocity chart...
  ✓ Generated SQL (joining 3 tables)
  ✓ Rendered line+bar combo chart
⚡ Building Row 3...
```

## Error Recovery During Build

If a tile fails mid-build:
1. Note which tile failed and why (in progress display)
2. Continue building remaining tiles
3. At end: "Built [N] of [M] tiles successfully. [Failed tile] couldn't complete because [reason]. [Suggestion to fix]."
4. Never abort entire dashboard build for one failed tile

## Cross-Tile Consistency Enforcement

After all tiles built:

```python
# Collect all dimension values used across tiles
dimension_color_map = {}
for tile in all_tiles:
    for series in tile.series:
        if series.dimension_value not in dimension_color_map:
            dimension_color_map[series.dimension_value] = next_available_color()
        tile.apply_color(series.dimension_value, dimension_color_map[series.dimension_value])
```

Same category (e.g., "Enterprise") must be the same color in ALL tiles.

## Auto-Generated vs User-Requested Dashboards

### Auto-generated (from vague request like "build a sales dashboard"):
- Use domain template
- Include standard KPIs for that domain
- Use last 30 days as default date range
- Disclose defaults: "Built with standard sales metrics. Customize date range, metrics, or layout."

### User-specified (explicit tile list):
- Follow user's spec precisely
- Fill gaps intelligently (user says "revenue chart" → ask or default to monthly line)
- Confirm interpretation before building if ambiguous

## Dashboard Quality Checklist (Run Before Finalizing)

```
☐ Row 1 is KPI tiles (not charts)
☐ All KPI tiles have delta vs prior period
☐ Primary chart is widest tile in its row
☐ No more than 5 distinct colors used
☐ All tile titles are insights (not metric names)
☐ No chart has Y-axis starting above 0 without disclosure
☐ All numbers formatted (K/M/B suffixes)
☐ Cross-tile color consistency applied
☐ Dashboard summary generated
```

---

## Examples

**Input:** "Build me a marketing dashboard"
**Phase 1:** Intent = marketing performance overview. Domain = marketing. Template = Marketing Analytics. Theme = Workbench.
**Phase 2:** KPIs = Sessions, Leads, MQLs, SQLs, CAC. Primary = Traffic trend 12mo. Supporting = Channel attribution, Campaign performance.
**Phase 3:** Find `sessions`, `events`, `campaigns` tables. Detect `campaign_id → campaigns.id` FK.
**Phase 4:** Build 9 tiles. Announce progress.
**Phase 5:** Check color consistency (same channel = same color in all charts). Generate: "Dashboard shows 47K sessions this month, down 8% MoM. CAC increased to $284 — email channel efficiency declined."

**Input:** "Add a tile showing top 10 stuck deals"
**Skip Phase 1-3** (context already exists)
**Phase 4 directly:** Generate SQL (deals stuck > 14 days), create table tile, add to bottom of dashboard.
**Announce:** "Added 'Top Stuck Deals (14+ days)' table tile — 7 deals totaling $1.23M."
