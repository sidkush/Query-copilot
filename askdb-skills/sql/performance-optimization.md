# Performance Optimization — AskDB AgentEngine

## Tier Selection Logic (Before Writing SQL)

```
Row count estimate > 100M AND aggregation only → DataFusion pushdown to warehouse
Row count estimate > 1M AND < 100M → DuckDB TurboTier twin
Row count estimate < 1M → DuckDB TurboTier (instant)
Live query required (user explicitly asks) → LiveTier
```

## Anti-Patterns That Kill Performance

### SELECT * on Large Tables
```sql
-- NEVER:
SELECT * FROM orders WHERE date > '2024-01-01'

-- ALWAYS specify columns:
SELECT order_id, customer_id, amount, created_at
FROM orders WHERE created_at > '2024-01-01'
```
**Why:** SELECT * transfers unused columns across the network and fills memory.

### Implicit Type Casting in WHERE
```sql
-- SLOW: Forces cast on every row
WHERE CAST(order_id AS VARCHAR) = '12345'
WHERE DATE(created_at) = '2024-01-01'  -- Prevents index use

-- FAST: Cast the literal, not the column
WHERE order_id = 12345
WHERE created_at >= '2024-01-01' AND created_at < '2024-01-02'
```

### Correlated Subqueries (N+1 Problem)
```sql
-- SLOW: Runs subquery once per row
SELECT o.*, 
  (SELECT SUM(amount) FROM orders o2 WHERE o2.customer_id = o.customer_id) as customer_total
FROM orders o;

-- FAST: Pre-aggregate with CTE or window function
WITH customer_totals AS (
  SELECT customer_id, SUM(amount) as total FROM orders GROUP BY customer_id
)
SELECT o.*, ct.total
FROM orders o JOIN customer_totals ct ON o.customer_id = ct.customer_id;
```

### OR in JOIN Conditions
```sql
-- SLOW: Prevents index use
JOIN regions ON orders.region = regions.name OR orders.region_code = regions.code

-- FAST: Two LEFT JOINs with COALESCE
LEFT JOIN regions r1 ON orders.region = r1.name
LEFT JOIN regions r2 ON orders.region_code = r2.code
-- Use COALESCE(r1.id, r2.id)
```

## Query Structure for DuckDB TurboTier

DuckDB is column-oriented. Optimize for it:

```sql
-- Good: Column pruning, predicate pushdown
SELECT customer_id, SUM(amount)
FROM orders
WHERE created_at >= '2024-01-01'  -- Predicate early
GROUP BY customer_id
HAVING SUM(amount) > 1000;

-- Avoid: Reading unnecessary columns in DuckDB
SELECT * FROM orders WHERE ...  -- NEVER with DuckDB at scale
```

## LIMIT Placement

```sql
-- WRONG: LIMIT after expensive window functions
WITH all_data AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY category ORDER BY revenue DESC) as rn
  FROM million_row_table
)
SELECT * FROM all_data WHERE rn <= 10;  -- Processes all rows

-- BETTER for top-N queries: Push filter into CTE
-- Or use DuckDB's QUALIFY clause:
SELECT *, ROW_NUMBER() OVER (PARTITION BY category ORDER BY revenue DESC) as rn
FROM orders
QUALIFY rn <= 10;  -- DuckDB/Snowflake only
```

## CTEs vs Subqueries Performance

```sql
-- CTEs in PostgreSQL/DuckDB are materialized (computed once) — use for repeated access
WITH expensive_calc AS (
  SELECT customer_id, complex_calculation() as result
  FROM large_table
)
SELECT e.*, c.name FROM expensive_calc e JOIN customers c ON e.customer_id = c.id;

-- Subqueries in most engines are inlined (recomputed each time) — avoid for repeated use
SELECT *, (SELECT AVG(amount) FROM orders) as global_avg  -- Runs for each row
```

## Predicate Pushdown — Push Filters as Early as Possible

```sql
-- SLOW: Filter after join
SELECT c.name, o.amount
FROM customers c
JOIN orders o ON c.id = o.customer_id
WHERE o.created_at >= '2024-01-01'  -- Filter happens after join

-- FAST: Filter before join (pre-filter subquery/CTE)
SELECT c.name, recent.amount
FROM customers c
JOIN (
  SELECT customer_id, amount FROM orders WHERE created_at >= '2024-01-01'
) recent ON c.id = recent.customer_id
```

## Approximate Functions for Large Datasets

When exactness < speed (dashboards, trend charts):

```sql
-- Approximate COUNT DISTINCT (much faster at scale)
APPROX_COUNT_DISTINCT(user_id)          -- BigQuery
COUNT_DISTINCT_APPROX(user_id)          -- DuckDB  
APPROX_COUNT_DISTINCT(user_id)          -- Snowflake

-- Approximate percentiles
APPROX_QUANTILES(response_time, 100)[OFFSET(95)]  -- BigQuery
APPROX_PERCENTILE(response_time, 0.95)            -- Snowflake
```

**Note in summary when using approximate functions:** "Showing approximate distinct count (~1% error margin) for faster results."

---

## Examples

**Query optimization decision:**
- User asks for "monthly revenue by region for all time"
- Table has 500M rows
- **Decision:** DataFusion pushdown. Generate SQL with DATE_TRUNC and GROUP BY. Let warehouse compute.

**Anti-pattern caught:**
```sql
-- Agent detects: SELECT * FROM events WHERE user_id = 123
-- Rewrites to:
SELECT event_type, properties, created_at 
FROM events WHERE user_id = 123 LIMIT 1000
-- Adds LIMIT, removes *, adds note: "Showing first 1000 events. Use date filter to narrow."
```
