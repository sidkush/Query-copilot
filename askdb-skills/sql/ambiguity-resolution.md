---
applies_to: sql-generation
description: Is there a single clearly correct interpretation? YES → Proceed. Disclose
  assumption in summary. NO, 2 viable options → Ask ONE targeted question...
legacy: true
name: ambiguity-resolution
priority: 3
tokens_budget: 1300
---

# Ambiguity Resolution — AskDB AgentEngine

## Ambiguity Decision Framework

```
Is there a single clearly correct interpretation?
  YES → Proceed. Disclose assumption in summary.
  NO, 2 viable options → Ask ONE targeted question with specific choices.
  NO, many options → Pick the most common business interpretation. Disclose.
```

**Anti-pattern:** Asking multiple clarifying questions before generating anything. Ask at most ONE question. If uncertain, generate with the best guess and offer to adjust.

## Metric Name Conflicts

**Scenario:** Multiple columns match the user's metric term.

**Resolution order:**
1. Check semantic layer for canonical definition
2. Pick the column used most frequently in recent query history
3. If no history: prefer `net_` over `gross_` (more meaningful), `revenue` over `amount`
4. Disclose choice always: "Using `net_revenue`. Switch to `gross_revenue`?"

**Ask when:** 3+ equally plausible columns exist with meaningfully different values.

## Implicit Filters

| Vague term | Best default interpretation | When to ask |
|-----------|---------------------------|-------------|
| "best customers" | Highest total revenue, all time | If "best" could mean loyalty, frequency, or recency |
| "recent orders" | Last 30 days | Always specify the period used |
| "active users" | Logged in within last 30 days | If schema has `last_active` or session data |
| "top products" | Top 10 by revenue | Clarify metric and N if context suggests otherwise |
| "our team" | All records (no filter) | If org hierarchy exists in schema |
| "big orders" | Above median order value | Clarify threshold |

## Temporal Ambiguity

When time period is unspecified:
- **Trend questions** ("show me revenue over time"): Last 12 months, monthly
- **Current state** ("what's our MRR"): Current month or most recent complete period
- **Comparison** ("how are we doing"): Current period vs prior period (same length)

Always disclose: "Showing last 12 months. Change the date range in the filter bar."

## Pronoun Reference Resolution

Resolve "it", "this", "that", "those", "them" to the most recent concrete entity:

```
Turn 1: "Show me revenue by region"  → generates regional revenue chart
Turn 2: "Filter it by Q1"            → "it" = the regional revenue chart
Turn 3: "Now break it down weekly"   → "it" = the Q1 regional revenue chart

Resolution rule: Walk back through conversation turns to find the most recent 
chart, dataset, or entity that matches the pronoun context.
```

When ambiguous across 2 entities: "Did you mean [Option A] or [Option B]?"

## Superlatives and Ties

| Input | Correct behavior |
|-------|-----------------|
| "the top customer" | If tied: return both, note tie |
| "the top 10 customers" | Standard — no tie issue unless rank 10 is tied |
| "the most popular product" | If tied: return all tied products |
| "the latest order" | If same timestamp: return all, note |

```sql
-- Tie-safe "top 1" pattern using DENSE_RANK:
WITH ranked AS (
  SELECT customer_id, SUM(revenue) as total,
    DENSE_RANK() OVER (ORDER BY SUM(revenue) DESC) as rnk
  FROM orders GROUP BY customer_id
)
SELECT customer_id, total FROM ranked WHERE rnk = 1;
-- Returns ALL tied top customers
```

## Negation Handling

```sql
-- "Orders that did NOT ship in January"
-- WRONG (misses NULL shipped dates):
WHERE ship_date NOT BETWEEN '2024-01-01' AND '2024-01-31'

-- CORRECT (includes never-shipped orders too):
WHERE ship_date IS NULL 
   OR ship_date NOT BETWEEN '2024-01-01' AND '2024-01-31'
```

**Rule:** When negating a time filter, always include `IS NULL` unless "not shipped" explicitly means "shipped at another time."

## Contradictory Instructions

**Scenario:** "Show me monthly revenue for Q1 broken down by week"

Monthly AND weekly in same request is contradictory. Resolution:
1. Note the contradiction in summary
2. Pick the more granular interpretation (weekly within Q1)
3. Offer the other: "Showing weekly breakdown within Q1. Want monthly totals instead?"

```sql
-- Weekly breakdown within Q1:
SELECT DATE_TRUNC('week', order_date) as week_start, SUM(amount) as revenue
FROM orders
WHERE order_date BETWEEN '2024-01-01' AND '2024-03-31'
GROUP BY DATE_TRUNC('week', order_date)
ORDER BY week_start;
```

## Multiple Interpretation Disclosure

When proceeding with best guess, ALWAYS include in summary:

Format: "Showing [what was generated]. This assumes [assumption]. [Alternative interpretation]? Click to adjust."

---

## Examples

**Input:** "Show me our best customers"
**Action:** Proceed. Generate top 10 by total revenue (all time).
**Summary:** "Top 10 customers by lifetime revenue. 'Best' interpreted as highest total spend. Filter by date range or change metric to orders/frequency?"

**Input:** "Filter it by region" (after showing MoM revenue chart)
**Resolution:** "it" = the MoM revenue chart. Add region filter to that query.

**Input:** "Show me sales" (schema has `sales_amount`, `net_sales`, `gross_sales`)
**Action:** Ask: "I found 3 sales metrics. Which should I use? [Gross Sales / Net Sales / Sales Amount]"

**Input:** "Show me orders that didn't arrive on time"
**Correct:** 
```sql
WHERE actual_delivery_date > promised_delivery_date 
   OR actual_delivery_date IS NULL  -- Never delivered
```
