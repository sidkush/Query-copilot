---
applies_to: multi-step-agent, dashboard-build
description: Always plan first when:** - Building a dashboard (multiple tiles) - Executing
  more than 5 tool calls - Request involves multiple data sources -...
legacy: true
name: multi-step-planning
priority: 3
tokens_budget: 1200
---

# Multi-Step Planning — AskDB AgentEngine

## When to Plan Before Acting

**Always plan first when:**
- Building a dashboard (multiple tiles)
- Executing more than 5 tool calls
- Request involves multiple data sources
- User asks for something that could be interpreted multiple ways
- Estimated tool budget > 30 calls

**Act immediately without planning when:**
- Single SQL query + single chart
- Simple tile edit (change color, rename)
- Quick KPI lookup
- Schema inspection

## Plan Structure

Before executing, output a brief plan:

```
PLAN: [Dashboard/task name]
─────────────────────────────
Scope: [X tiles / Y queries]
Data: [Tables to be used]
Approach: [High-level method]
Budget estimate: ~[N] tool calls
Timeline: [Approx completion]

Step 1: [Action] → [Expected output]
Step 2: [Action] → [Expected output]
Step 3: [Action] → [Expected output]
...

Proceeding now. ⚡
```

**Do NOT wait for user approval after stating plan.** State and execute immediately unless plan is genuinely high-risk (deleting data, running very expensive query).

## Tool Budget Allocation Strategy

```
Available budget: 100 tool calls (extendable)
Reserve: 15 calls for error recovery and finalization
Working budget: 85 calls

Allocation:
  Schema profiling:     5 calls max
  Per simple tile:      3 calls (SQL + execute + chart)
  Per complex tile:     5 calls (schema + SQL + validate + execute + chart)
  Per data quality fix: 2 calls
  Finalization:         5 calls

Trigger extension when:
  - 80 calls used and work incomplete
  - Auto-extend by 20 calls
  - Note: "Extended budget to complete [remaining tasks]"
```

## Handling Mid-Plan Failures

If step N fails:

```
Option A (recoverable error):
  → Fix the error → Continue from step N → Note in progress

Option B (blocking error):
  → Skip step N → Continue with N+1 → Flag at end
  → "Could not complete [step N] — [reason]. All other steps succeeded."

Option C (cascade failure — step N result needed by N+1, N+2...):
  → Complete any independent remaining steps
  → Report: "Steps [N, N+1] could not complete due to [reason]."
  → Offer alternative: "Would you like to try [alternative approach]?"
```

**Never silently fail.** Always communicate what was and wasn't completed.

## Context Preservation Across Steps

During long multi-step execution, maintain:

```python
# Internal state to preserve across tool calls
execution_context = {
  "tiles_created": [],          # IDs of successfully created tiles
  "tables_confirmed": [],       # Tables verified to exist and be accessible
  "join_paths": {},             # Established join paths (avoid re-detecting)
  "color_assignments": {},      # Dimension → color mapping
  "errors_encountered": [],     # Non-blocking errors for final report
  "user_decisions": {},         # Clarifications user provided mid-build
}
```

## Parallel vs Sequential Execution

Some steps can be parallelized mentally (batched in single tool call):

**Sequential (must be in order):**
- Schema profiling → Join detection → SQL generation
- SQL generation → Validation → Execution
- Execution → Chart rendering → Summary generation

**Can batch (logically independent):**
- Multiple KPI queries (no dependencies between them)
- Chart formatting after all data fetched
- AI summaries for multiple tiles

**Strategy:** Complete schema work first, then batch SQL queries, then batch chart creation.

## Phase-Aware Timeouts

Different phases have different acceptable latencies:

| Phase | Timeout | Action if exceeded |
|-------|---------|-------------------|
| Schema profiling | 10s | Use cached schema, note it may be stale |
| TurboTier query | 5s | Fallback to smaller sample |
| LiveTier query | 30s | Offer to use TurboTier result |
| Chart rendering | 3s | Fallback to lower fidelity renderer |
| AI summary | 8s | Use template summary instead |

---

## Examples

**Input:** "Build me a full company overview dashboard with all our key metrics"
**Plan output:**
```
PLAN: Company Overview Dashboard
─────────────────────────────
Scope: 12 tiles (4 KPI + 1 primary + 4 supporting + 2 detail + 1 table)
Data: orders, customers, subscriptions, events tables
Approach: Executive Overview template, Workbench theme, last 90 days
Budget estimate: ~45 tool calls
Timeline: ~60 seconds

Step 1: Schema profiling → confirm table structure
Step 2: Build Row 1 — 4 KPI tiles (Revenue, Customers, Retention, Growth)
Step 3: Build Row 2 — Revenue trend chart (12 months)
Step 4: Build Row 3 — 4 breakdown charts (by segment, product, region, channel)
Step 5: Build Row 4 — Top customers table + Churn risk table
Step 6: Apply cross-tile formatting and generate dashboard summary

Proceeding now. ⚡
```

**Budget extension trigger:**
"Completed 9 of 12 tiles (78 tool calls used). Extending budget by 20 to finish remaining 3 tiles."
