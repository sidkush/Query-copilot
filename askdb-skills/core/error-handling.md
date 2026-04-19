---
applies_to: always-on
description: Apply Error Handling — AskDB AgentEngine rules.
legacy: true
name: error-handling
priority: 2
tokens_budget: 800
---

# Error Handling — AskDB AgentEngine

## Recovery Path by Error Type

### Empty Result Set
- **Detect:** Query executes successfully, returns 0 rows
- **Action:** Render empty state tile (not an error). AI summary: "No data found for this query. This could mean [contextual reason — e.g., 'no sales in this date range' or 'filter is too narrow']."
- **Offer:** Suggest broadening filters, removing date range, or checking a related query
- **Never:** Show a broken chart or raw "0 rows" without explanation

### Query Timeout
- **Detect:** Execution exceeds tier-specific timeout (TurboTier: 5s, LiveTier: 30s)
- **Action:** Cancel query gracefully. Offer TurboTier cached alternative if available. Show: "This query is taking longer than expected. Showing cached results — [timestamp]. Want to run live?"
- **Never:** Let UI hang indefinitely. Always provide an escape

### Division by Zero
- **Detect:** SQL contains division operations where denominator could be 0
- **Prevention:** Always wrap: `NULLIF(denominator, 0)` or `CASE WHEN denominator = 0 THEN NULL ELSE numerator/denominator END`
- **If caught post-execution:** Show NULL/empty for affected cells, note in summary

### Permission Error
- **Detect:** Database returns permission denied
- **Action:** Clean message: "You don't have access to query this data." Do NOT expose table names or schema structure from error. Log internally.

### Malformed Data
- **Detect:** Type errors, encoding issues, mixed format columns
- **Action:** Note affected columns in summary. Attempt cast. If cast fails, exclude rows and report: "X rows excluded due to data format issues in [column]."

### NULL-Heavy Results
- **Detect:** > 30% of values in key metric columns are NULL
- **Action:** Surface in summary: "Note: [column] contains [X]% missing values. Averages exclude nulls." Let user decide next step.

### Query Too Expensive (estimated cost)
- **Detect:** DataFusion query cost estimate exceeds threshold
- **Action:** Offer to use TurboTier sample first. "This query will scan ~[X]GB. Use sampled preview or run full query?"

### Agent Budget Exhaustion
- **Detect:** Tool call count approaching 100-tool limit
- **Action:** Complete current tile/task, checkpoint progress. Summarize what was completed. Offer to continue. Never silently fail mid-dashboard.

### Schema Not Found
- **Detect:** Referenced table or column does not exist
- **Action:** "I couldn't find a table called [name]. Here are the available tables: [list]. Did you mean [closest match]?"

### Connection Lost
- **Detect:** Database connection dropped mid-query
- **Action:** Retry once automatically. If retry fails: "Connection to [DB name] was lost. Your dashboard is saved. Reconnect to continue."

---

## Error Message Principles

1. **Always explain what happened** in plain English
2. **Always suggest a next step** — never a dead end
3. **Never expose technical internals** (stack traces, server versions, internal paths)
4. **Log everything internally** — even "safe" errors need forensics

---

## Examples

**Situation:** User asks "show me sales in Antarctica" — 0 rows returned
**Good response:** "No sales data found for Antarctica in the selected time range. Try removing the region filter to see global sales."
**Bad response:** "Query returned 0 rows."

**Situation:** Division by zero in conversion rate calculation
**Good response:** Shows NULL for days with 0 sessions, note in summary: "Conversion rate unavailable on days with 0 sessions (shown as —)."
**Bad response:** Query errors out with SQL exception.
