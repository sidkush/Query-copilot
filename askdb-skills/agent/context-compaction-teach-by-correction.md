---
applies_to: multi-step-agent, dashboard-build
description: 'python # Trigger compaction when: # 1. Tool call log exceeds 40 entries
  in working memory # 2. Estimated token count of context > 60% of model...'
legacy: true
name: context-compaction-teach-by-correction
priority: 3
tokens_budget: 2000
---

# Context Compaction Rules — AskDB AgentEngine

## When Compaction Triggers

```python
# Trigger compaction when:
# 1. Tool call log exceeds 40 entries in working memory
# 2. Estimated token count of context > 60% of model limit
# 3. User explicitly asks to "start fresh" (preserve state, clear chat display)
# 4. Session pause detected (user inactive > 30 minutes)

def should_compact(tool_call_count, token_estimate, model_limit):
    if tool_call_count > 40:
        return True
    if token_estimate > model_limit * 0.6:
        return True
    return False
```

## What NEVER Gets Compacted

These items survive every compaction — always kept verbatim:

```
PERMANENT (never compact):
├── All security rules (from security-rules.md)
├── Current dashboard state:
│   ├── tile_ids: list of all created tiles with IDs
│   ├── tile_specs: current ChartSpec for each tile
│   └── tile_queries: SQL query used for each tile
├── Established user decisions:
│   ├── Metric preferences ("use net_revenue, not gross")
│   ├── Confirmed join paths ("orders.customer_id → customers.id")
│   ├── Date range defaults ("they prefer last 90 days")
│   └── Theme preference ("they like Workbench")
├── Active error states (unresolved issues)
├── Color assignments (dimension → color map)
└── Current phase of multi-step plan
```

## What Gets Compacted (Replaced with Summary)

```
COMPACTABLE (replace with 2-3 sentence summary):
├── Schema profiling raw output
│   → "Schema: orders(12 cols), customers(8 cols), products(15 cols).
│      Join: orders.customer_id → customers.id (confirmed, 99.2% overlap).
│      Key metrics: revenue, quantity. Pre-agg: daily_revenue column detected."
│
├── Intermediate SQL validation steps
│   → "Validation passed for 6 queries. One query corrected (HAVING not WHERE)."
│
├── Tool call results older than 10 turns
│   → "Tile 1-4 built: Revenue KPI ($8.2M), Win Rate (38%), Cycle Days (42d), Forecast ($2.4M)."
│
├── Superseded queries (user changed direction)
│   → "User changed from gross_revenue to net_revenue in turn 12."
│
└── Successful but routine operations
    → "Dashboard Row 1 (4 KPI tiles) and Row 2 (primary chart) complete."
```

## Compaction Summary Format

```
[COMPACTED CONTEXT — {timestamp}]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SESSION: {session_id}
DASHBOARD: {dashboard_name} — {tile_count} tiles
STATUS: {current_phase} — {completed_steps} of {total_steps}

SCHEMA:
{table_name}: {key_columns} | Joins: {join_summary}

COMPLETED TILES:
{tile_id}: {tile_name} — {key_metric} | Query: {sql_hash}
[... all tiles ...]

COLOR MAP:
{dimension}: {color} | {dimension}: {color}

USER PREFERENCES:
theme={theme} | date_range={range} | metric={metric_preference}

ERRORS ENCOUNTERED (non-blocking):
{error_summary if any, else "None"}

DECISIONS MADE:
Turn {N}: {decision} → {outcome}
[... all key decisions ...]

NEXT STEP: {what_to_do_next}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Mid-Task Compaction (Graceful)

When compaction happens during active dashboard build:

1. Complete the current tile before compacting (never compact mid-tile)
2. Write compaction summary to session SQLite
3. Load compaction summary into new context window
4. Continue from next tile without user seeing any interruption
5. If user asks "what happened?" → "I compacted older context to free memory. Your dashboard is fully intact."

---

# Teach-by-Correction Protocol — AskDB AgentEngine

## What "Correction" Means

A correction happens when a user manually changes something the agent generated:
- Changes a chart type (bar → line)
- Changes a color scheme
- Renames a tile with a different framing
- Changes which column is used for a metric
- Modifies a filter the agent set
- Adjusts a date range
- Changes grouping dimension

## Detection

```python
def detect_correction(before_state, after_state):
    changes = diff(before_state, after_state)
    
    for change in changes:
        if change.source == "user_manual_edit":  # Not agent action
            if change.field in LEARNABLE_FIELDS:
                queue_for_learning(change)

LEARNABLE_FIELDS = [
    'chart_type', 'color_scheme', 'primary_dimension',
    'metric_column', 'date_range', 'filter_value',
    'aggregation_function', 'sort_order', 'tile_title'
]
```

## What to Learn vs Not Learn

```
LEARN (generalize to future similar situations):
├── chart_type change: "User prefers line over bar for time series"
├── metric_column change: "User prefers net_revenue over revenue"
├── color_scheme change: "User prefers blue for positive, red for negative"
├── date_range change: "User default is 90 days, not 30"
└── grouping change: "User prefers weekly over monthly for operational data"

DO NOT LEARN (too specific, user preference is context-dependent):
├── Single tile title rename (editorial choice for that tile)
├── One-off filter for a specific analysis
├── Sort order change (depends on what they're looking for)
└── Any change the user explicitly says is "just for this one"
```

## Learning Storage

```python
# Stored in user_preferences (persistent across sessions)
user_preferences = {
    "chart_preferences": {
        "time_series_single_metric": "line",     # Was bar → changed to line
        "breakdown_many_categories": "horizontal_bar",
        "part_of_whole": "donut"
    },
    "metric_preferences": {
        "revenue": "net_revenue",               # When "revenue" is ambiguous
        "users": "active_users"                 # Not total_users
    },
    "default_date_range": "last_90_days",       # Was 30, changed to 90
    "color_semantic": {
        "positive_delta": "#1D9E75",            # Green for good
        "negative_delta": "#A32D2D"             # Red for bad
    }
}
```

## Applying Learned Preferences

```python
# Before generating any chart, check learned preferences
def apply_preferences(chart_spec, user_prefs):
    
    # Chart type override
    data_shape = classify_data_shape(chart_spec.data)
    if data_shape in user_prefs.chart_preferences:
        chart_spec.type = user_prefs.chart_preferences[data_shape]
    
    # Metric preference
    if chart_spec.metric in user_prefs.metric_preferences:
        chart_spec.metric = user_prefs.metric_preferences[chart_spec.metric]
        note = f"Using {chart_spec.metric} (your preferred metric)"
    
    return chart_spec
```

## Informing the User of Learned Preference

When applying a learned preference, briefly disclose:

```
"Using net_revenue (your preference from last session). Switch to gross?"
"Showing last 90 days (your usual range). Adjust in filter bar."
"Applied your color scheme — green for growth, red for decline."
```

**Never apply silently for anything that meaningfully changes the analysis.**

## Semantic Layer Updates from Corrections

When a correction reveals domain knowledge:

```
User renames tile "Revenue by Region" → "Revenue by Territory (EMEA/AMER/APAC)"
→ Learn: "Region dimension values: EMEA, AMER, APAC"
→ Update semantic layer: synonym map adds "territory" → "region"

User changes filter "status = 'active'" → "status IN ('active', 'trial')"  
→ Learn: "active users includes trial users in this schema"
→ Update semantic layer: "active user" definition

User changes chart from COUNT(*) to COUNT(DISTINCT customer_id)
→ Learn: "When user says 'customers', they mean unique customers"
→ Update: future COUNT queries on customers use DISTINCT
```

## When to Ask Before Learning

For significant semantic changes, confirm before generalizing:

```
"You changed 'active users' to include trial users. 
Should I apply this definition everywhere going forward, 
or just for this analysis?"

[Apply everywhere] [Just this time]
```

---

## Examples

**Correction detected:**
User changes time series chart from bar to line.
**Learning:** `chart_preferences["time_series_single_metric"] = "line"`
**Next time:** Agent automatically uses line for time series, notes: "Using line chart (your preference)."

**Correction detected:**
User changes revenue column from `gross_revenue` to `net_revenue`.
**Learning:** `metric_preferences["revenue"] = "net_revenue"`
**Next time:** All revenue queries use net_revenue. Disclosed in summary.

**Correction NOT learned:**
User changes title "Revenue by Region" to "Q3 Regional Performance" for a board presentation.
**Reason:** Tile title is editorial/context-specific. Don't generalize.
