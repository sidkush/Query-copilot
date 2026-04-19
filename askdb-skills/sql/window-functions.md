# Window Functions — AskDB AgentEngine

## When to Use Window Functions vs GROUP BY

| Use case | Window function | GROUP BY |
|----------|----------------|----------|
| Running total while keeping row detail | ✅ SUM() OVER | ❌ Collapses rows |
| Rank within groups while keeping all rows | ✅ RANK() OVER | ❌ Collapses rows |
| Compare each row to its group average | ✅ AVG() OVER | ❌ Requires self-join |
| Period-over-period comparison | ✅ LAG() / LEAD() | ❌ Requires self-join |
| Total aggregation (one number) | ❌ Overkill | ✅ GROUP BY |

## Core Window Function Reference

### Ranking Functions
```sql
-- ROW_NUMBER: Unique sequential number (no ties)
ROW_NUMBER() OVER (PARTITION BY dept ORDER BY salary DESC)

-- RANK: Tied rows get same rank, next rank skipped (1,1,3)
RANK() OVER (ORDER BY revenue DESC)

-- DENSE_RANK: Tied rows get same rank, no skipping (1,1,2)
DENSE_RANK() OVER (PARTITION BY region ORDER BY sales DESC)

-- NTILE: Divide into N equal buckets
NTILE(4) OVER (ORDER BY revenue DESC)  -- Quartiles (1=top 25%)
NTILE(10) OVER (ORDER BY revenue DESC) -- Deciles
```

**When to use which rank:**
- `ROW_NUMBER`: Need unique sequential IDs (pagination, deduplication)
- `RANK`: Standard ranking where ties matter (sports leaderboard)
- `DENSE_RANK`: When you want "position" without gaps
- `NTILE`: Segmentation, cohort bucketing

### Offset Functions (LAG/LEAD)
```sql
-- LAG: Previous row value
LAG(revenue) OVER (ORDER BY month)                -- Prior month
LAG(revenue, 12) OVER (ORDER BY month)            -- Prior year (12 months back)
LAG(revenue, 1, 0) OVER (ORDER BY month)          -- Prior month, default 0 if no prior row

-- LEAD: Next row value
LEAD(revenue) OVER (ORDER BY month)               -- Next month
LEAD(revenue, 3, NULL) OVER (ORDER BY month)      -- 3 months forward

-- Period-over-period growth
SELECT month, revenue,
  (revenue - LAG(revenue) OVER (ORDER BY month)) / 
    NULLIF(LAG(revenue) OVER (ORDER BY month), 0) as mom_growth
FROM monthly_revenue;
```

### Aggregate Window Functions
```sql
-- Running total
SUM(amount) OVER (
  PARTITION BY customer_id 
  ORDER BY order_date 
  ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
)

-- Moving 7-day average
AVG(daily_revenue) OVER (
  ORDER BY date 
  ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
)

-- Compare each row to its group average
SELECT employee, department, salary,
  AVG(salary) OVER (PARTITION BY department) as dept_avg,
  salary - AVG(salary) OVER (PARTITION BY department) as variance_from_avg
FROM employees;
```

## Frame Specification — Critical Rules

```
ROWS BETWEEN ... AND ...   -- Physical row position (FAST, deterministic)
RANGE BETWEEN ... AND ...  -- Logical value range (SLOW, handles ties)
```

**Always use ROWS for:**
- Running totals
- Moving averages
- Any calculation where you want exactly N physical rows

**Use RANGE only for:**
- When you want all rows with the SAME value in the ORDER BY to be treated identically

**Performance:** ROWS is always faster than RANGE. RANGE requires an on-disk spool in many engines.

```sql
-- ALWAYS specify ROWS explicitly for running totals:
SUM(amount) OVER (ORDER BY date ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)

-- NOT this (RANGE is default and slower):
SUM(amount) OVER (ORDER BY date)  -- Implicitly RANGE
```

## FIRST_VALUE / LAST_VALUE Trap

```sql
-- LAST_VALUE bug: Default frame stops at CURRENT ROW
-- Returns current row's value, not partition's last value
SELECT LAST_VALUE(salary) OVER (PARTITION BY dept ORDER BY salary)  -- WRONG

-- CORRECT: Extend frame to end of partition
SELECT LAST_VALUE(salary) OVER (
  PARTITION BY dept ORDER BY salary
  ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
)
```

## COUNT DISTINCT in Window Functions

`COUNT(DISTINCT ...)` is NOT supported as a window function in most databases.

**Workaround:**
```sql
-- Instead of COUNT(DISTINCT customer_id) OVER (PARTITION BY month):
WITH ranked AS (
  SELECT month, customer_id,
    ROW_NUMBER() OVER (PARTITION BY month, customer_id ORDER BY order_id) as rn
  FROM orders
)
SELECT month, COUNT(*) as unique_customers
FROM ranked WHERE rn = 1
GROUP BY month;
```

## Top-N Per Group Pattern

```sql
-- Top 3 products per category
WITH ranked AS (
  SELECT category, product, revenue,
    DENSE_RANK() OVER (PARTITION BY category ORDER BY revenue DESC) as rnk
  FROM product_revenue
)
SELECT category, product, revenue
FROM ranked
WHERE rnk <= 3
ORDER BY category, rnk;
```

---

## Examples

**Input:** "Show running total of revenue by month"
**Correct SQL:**
```sql
SELECT month, revenue,
  SUM(revenue) OVER (ORDER BY month ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) as cumulative_revenue
FROM monthly_revenue
ORDER BY month;
```

**Input:** "Show each salesperson's rank by revenue within their region"
**Correct SQL:**
```sql
SELECT region, salesperson, revenue,
  DENSE_RANK() OVER (PARTITION BY region ORDER BY revenue DESC) as regional_rank
FROM sales_performance
ORDER BY region, regional_rank;
```

**Input:** "Show MoM growth rate"
**Correct SQL:**
```sql
SELECT month, revenue,
  LAG(revenue, 1) OVER (ORDER BY month) as prior_month_revenue,
  ROUND((revenue - LAG(revenue, 1) OVER (ORDER BY month)) * 100.0 / 
    NULLIF(LAG(revenue, 1) OVER (ORDER BY month), 0), 1) as mom_growth_pct
FROM monthly_revenue
ORDER BY month;
```
