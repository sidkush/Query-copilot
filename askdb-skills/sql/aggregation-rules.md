# Aggregation Rules — AskDB AgentEngine

## COUNT vs COUNT DISTINCT — The Most Common Error

| Question type | Correct function | Wrong function |
|---------------|-----------------|----------------|
| "How many customers bought X?" | `COUNT(DISTINCT customer_id)` | `COUNT(customer_id)` |
| "How many orders were placed?" | `COUNT(order_id)` or `COUNT(*)` | — |
| "How many unique products sold?" | `COUNT(DISTINCT product_id)` | `COUNT(product_id)` |
| "Total transactions" | `COUNT(*)` | — |

**Rule:** Any question using "unique", "distinct", "different", "how many [entities] did X" = COUNT DISTINCT on the entity ID.

## HAVING vs WHERE — Filter Timing

```sql
-- WRONG: Filtering on aggregated value in WHERE
SELECT customer_id, SUM(amount) as total
FROM orders
WHERE SUM(amount) > 10000  -- SQL ERROR: aggregate in WHERE
GROUP BY customer_id;

-- CORRECT: Use HAVING for post-aggregation filters
SELECT customer_id, SUM(amount) as total
FROM orders
GROUP BY customer_id
HAVING SUM(amount) > 10000;

-- WHERE is for row-level filters BEFORE aggregation
SELECT customer_id, SUM(amount) as total
FROM orders
WHERE status = 'completed'  -- Filter rows first
GROUP BY customer_id
HAVING SUM(amount) > 10000;  -- Then filter groups
```

## Pre-Aggregated Data — Don't Double-Aggregate

If a column is already aggregated (daily_revenue, monthly_users, etc.):
- `SUM(daily_revenue)` across dates = CORRECT (sum of pre-aggregated days)
- `AVG(daily_revenue)` across dates = CORRECT if user wants average daily revenue
- `SUM(SUM(daily_revenue))` = NEVER — double aggregation

**Detection trigger:** Column name contains `_total`, `_sum`, `_count`, `_daily`, `_monthly`, `_weekly`

## Cross-Granularity Aggregation — Join Before Aggregating

**Problem:** Revenue is at daily grain. Targets are at monthly grain. 

**WRONG:**
```sql
-- Revenue joined to monthly targets without grain alignment
SELECT r.month, SUM(r.daily_revenue), t.monthly_target
FROM daily_revenue r
JOIN monthly_targets t ON r.month = t.month
GROUP BY r.month, t.monthly_target;
-- BUG: monthly_target appears once per day, gets inflated if in same GROUP BY
```

**CORRECT:**
```sql
-- Aggregate daily revenue to monthly first, THEN join
WITH monthly_revenue AS (
  SELECT DATE_TRUNC('month', date) as month, SUM(daily_revenue) as revenue
  FROM daily_revenue
  GROUP BY DATE_TRUNC('month', date)
)
SELECT mr.month, mr.revenue, t.monthly_target,
       mr.revenue - t.monthly_target as variance
FROM monthly_revenue mr
LEFT JOIN monthly_targets t ON mr.month = t.month;
```

## NULL in Aggregations

| Function | NULL behavior | Implication |
|----------|--------------|-------------|
| SUM | Ignores NULL | SUM of [1, NULL, 2] = 3 |
| AVG | Ignores NULL | AVG of [1, NULL, 3] = 2 (not 1.33) |
| COUNT(*) | Counts NULLs | COUNT of [1, NULL, 3] = 3 |
| COUNT(col) | Ignores NULL | COUNT of [1, NULL, 3] = 2 |
| MIN/MAX | Ignores NULL | Works correctly |

**When NULLs are significant:** If >10% of values are NULL in a key metric, add note: "Result excludes [X]% null values in [column]."

**When NULLs should be zero:** Use `COALESCE(column, 0)` before aggregating when nulls represent "no activity" (e.g., 0 sales days).

## Division — Always Protect Against Zero

```sql
-- ALWAYS use NULLIF or CASE
-- Pattern 1: NULLIF (preferred — clean)
SELECT numerator / NULLIF(denominator, 0) as ratio

-- Pattern 2: CASE (more explicit)
SELECT CASE WHEN denominator = 0 THEN NULL 
            ELSE numerator / denominator END as ratio

-- Pattern 3: Float cast + NULLIF (for percentage)
SELECT ROUND(numerator * 100.0 / NULLIF(denominator, 0), 2) as pct
```

## Weighted Averages vs Simple Averages

When averaging rates or percentages across groups of different sizes:

```sql
-- WRONG: Simple average of conversion rates (ignores volume)
SELECT AVG(conversion_rate) FROM daily_metrics;

-- CORRECT: Weighted average
SELECT SUM(conversions) / NULLIF(SUM(sessions), 0) as true_conversion_rate
FROM daily_metrics;
```

**Rule:** When averaging a ratio/rate, always recalculate from underlying numerator and denominator.

## Integer Division Trap

```sql
-- WRONG in most SQL engines: integer / integer = integer
SELECT 3 / 4;  -- Returns 0, not 0.75

-- CORRECT: Cast to float first
SELECT 3.0 / 4;        -- 0.75
SELECT CAST(3 AS FLOAT) / 4;  -- 0.75
SELECT 3 * 1.0 / 4;   -- 0.75
```

**Rule:** Any division producing a ratio/percentage: always cast numerator to float/decimal.

---

## Examples

**Input:** "How many customers made a purchase this month?"
**Correct SQL:**
```sql
SELECT COUNT(DISTINCT customer_id) as unique_customers
FROM orders
WHERE DATE_TRUNC('month', order_date) = DATE_TRUNC('month', CURRENT_DATE);
```
**Common mistake avoided:** `COUNT(customer_id)` counts order rows, not unique customers.

**Input:** "What's our conversion rate?"
**Correct SQL:**
```sql
SELECT SUM(conversions) * 100.0 / NULLIF(SUM(sessions), 0) as conversion_rate_pct
FROM daily_metrics
WHERE date >= CURRENT_DATE - INTERVAL '30 days';
```

**Input:** "Show customers who spent more than $10,000"
**Correct SQL:**
```sql
SELECT customer_id, SUM(amount) as total_spent
FROM orders
WHERE status = 'completed'
GROUP BY customer_id
HAVING SUM(amount) > 10000
ORDER BY total_spent DESC;
```
