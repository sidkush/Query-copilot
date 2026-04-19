---
applies_to: multi-step-agent, dashboard-build
description: sql -- Session state schema CREATE TABLE sessions ( session_id TEXT PRIMARY
  KEY, user_id TEXT, dashboard_id TEXT, created_at TIMESTAMP,...
legacy: true
name: session-memory-protocol
priority: 3
tokens_budget: 1100
---

# Session Memory Protocol — AskDB AgentEngine

## What Gets Persisted (SQLite)

```sql
-- Session state schema
CREATE TABLE sessions (
  session_id TEXT PRIMARY KEY,
  user_id TEXT,
  dashboard_id TEXT,
  created_at TIMESTAMP,
  last_active TIMESTAMP,
  status TEXT  -- 'active', 'paused', 'completed'
);

CREATE TABLE session_context (
  session_id TEXT,
  key TEXT,
  value JSON,
  updated_at TIMESTAMP,
  PRIMARY KEY (session_id, key)
);

-- Persisted context keys:
-- 'tool_call_log'      — compressed log of all tool calls + results
-- 'tiles_created'      — array of {tile_id, tile_spec, query}
-- 'schema_cache'       — table/column metadata
-- 'join_paths'         — established FK relationships
-- 'color_assignments'  — dimension → color mapping
-- 'user_preferences'   — theme, date range defaults, metric preferences
-- 'compacted_summary'  — rolling summary of older context
-- 'error_log'          — non-blocking errors for post-session review
```

## Context Compaction Rules

When conversation exceeds token threshold (sliding window):

```
KEEP verbatim (never compact):
  - Last 10 tool call results
  - All tile_ids and their current specs
  - Active error states
  - User's explicit decisions and preferences
  - Security rules (always in full)

COMPACT (replace with summary):
  - Tool call results older than 10 turns
  - Intermediate SQL validation steps
  - Schema profiling raw output (keep only join map)
  - Duplicate or superseded queries

COMPACTION SUMMARY FORMAT:
"[Timestamp] Completed Phase [N]: Built [X] tiles covering [metrics].
Tables confirmed: [list]. Join paths: [list]. Colors assigned: [map].
User preferences: theme=[theme], date_range=[range].
Errors: [summary]. Status: [current state]."
```

## Session Resume Protocol

When user reopens a paused/interrupted session:

```
1. Load session_context from SQLite
2. Reconstruct agent state:
   - Restore tiles_created (know what's already on dashboard)
   - Restore color_assignments (maintain consistency)
   - Restore schema_cache (avoid re-profiling)
   - Restore user_preferences
3. Greet user with state summary:
   "Welcome back! Last session: [date/time]. 
    Dashboard has [N] tiles. [Last action completed].
    [Any pending items from last session]?
    Continue where we left off or start something new?"
4. If user says "continue" → resume from interrupted step
5. If user says "new" → preserve dashboard, start fresh query
```

## Version Conflict Resolution

If dashboard was modified externally (another session, direct UI edit) between sessions:

```
Detection: tile_specs in session != actual dashboard state

Resolution:
1. Detect delta (what changed externally)
2. Update session context to match current dashboard state
3. Note: "I see [N] changes were made since our last session:
   [list of changes]. I've updated my understanding."
4. Continue with reconciled state
```

## User Preference Learning

Accumulate user preferences across sessions:

```python
# Preferences to track
user_preferences = {
  'preferred_theme': 'workbench',           # Most used theme
  'default_date_range': 'last_30_days',     # Most common time window
  'preferred_kpis': ['revenue', 'churn'],   # Metrics added most often
  'preferred_chart_types': {                # Per data shape
    'trend': 'line',
    'breakdown': 'horizontal_bar',
  },
  'fiscal_year_start': 'april',             # If set by user
  'currency': 'USD',
  'number_format': 'short',                 # K/M/B suffixes
  'revenue_column': 'net_revenue',          # Preferred when ambiguous
}
```

Apply silently. Note only when applying a preference that may surprise: "Using net_revenue (your preferred metric). Switch to gross?"

## What Never Gets Persisted

For security and privacy:
- Raw query results (data stays in user's warehouse)
- PII values from query outputs
- Database credentials or connection strings
- API keys
- Actual cell values from data tables

---

## Examples

**Session resume:**
User returns after 3-day break.
Response: "Welcome back! Last Tuesday you built a Q3 Sales dashboard with 12 tiles. The pipeline funnel and rep heatmap were still in progress when we stopped. Want to continue building those, or is there something new you need?"

**Context compaction trigger:**
After 45 tool calls, older context compacted:
"[Compacted: Built 6 KPI tiles and 3 charts. Revenue=$8.2M, Churn=2.31%, NRR=117%. Tables: orders, customers, subscriptions. Colors: Enterprise=blue, SMB=green. Theme: Workbench.]"
New tool call window is now clear for remaining work.

**Preference application:**
User has 5 previous sessions, always uses last 90 days.
New session: "Show me revenue" → auto-applies last 90 days filter.
Summary: "Revenue for last 90 days (your usual range). Change date range?"
