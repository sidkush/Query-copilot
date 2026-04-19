---
applies_to: sql-generation
description: NEVER use FLOAT for money.** Binary floating point cannot represent most
  decimal fractions exactly.
legacy: true
name: data-types-and-subqueries
priority: 3
tokens_budget: 1500
---

# Data Type Handling — AskDB AgentEngine

## Currency and Financial Values

**NEVER use FLOAT for money.** Binary floating point cannot represent most decimal fractions exactly.

```sql
-- WRONG:
amount FLOAT          -- 0.1 + 0.2 = 0.30000000000000004

-- CORRECT:
amount DECIMAL(18, 2)  -- Exact to 2 decimal places
amount NUMERIC(18, 4)  -- 4 decimals for exchange rates, unit prices

-- When casting for division:
CAST(amount AS DECIMAL(18,4)) / NULLIF(quantity, 0)
```

## String-to-Date Casting

```sql
-- PostgreSQL / DuckDB
'2024-01-15'::DATE
CAST('2024-01-15' AS DATE)
TO_DATE('15/01/2024', 'DD/MM/YYYY')

-- MySQL
STR_TO_DATE('15/01/2024', '%d/%m/%Y')
DATE('2024-01-15')

-- SQL Server
CAST('2024-01-15' AS DATE)
CONVERT(DATE, '2024-01-15', 23)  -- Style 23 = YYYY-MM-DD

-- BigQuery
DATE('2024-01-15')
PARSE_DATE('%Y-%m-%d', '2024-01-15')
```

## Numeric Type Traps

### Integer Division
```sql
-- Returns 0 in most databases:
SELECT 3 / 4;

-- Safe patterns:
SELECT 3.0 / 4;              -- Literal float
SELECT CAST(3 AS FLOAT) / 4; -- Explicit cast
SELECT 3 * 1.0 / 4;         -- Multiply trick
SELECT SAFE_DIVIDE(3, 4)     -- BigQuery
```

### String-as-Number Comparison
```sql
-- WRONG: String comparison (lexicographic)
WHERE speed = MAX(speed)  -- If speed is VARCHAR, '9' > '10'

-- CORRECT: Cast to numeric first
WHERE CAST(speed AS FLOAT) = MAX(CAST(speed AS FLOAT))
-- OR fix the schema type
```

### Boolean Handling Across Dialects
```sql
-- PostgreSQL: TRUE/FALSE literals
WHERE is_active = TRUE
WHERE is_active  -- Shorthand works

-- MySQL: 1/0 or TRUE/FALSE
WHERE is_active = 1
WHERE is_active = TRUE

-- SQL Server: 1/0 (no TRUE/FALSE)
WHERE is_active = 1

-- BigQuery: TRUE/FALSE
WHERE is_active = TRUE
```

## Encoding Edge Cases

```sql
-- Detect non-UTF8 characters
WHERE column ~ '[^\x00-\x7F]'  -- PostgreSQL: non-ASCII

-- Trim whitespace (including invisible chars)
TRIM(BOTH '\n\r\t ' FROM column)
LTRIM(RTRIM(column))

-- Handle BOM (byte order mark) in CSV imports
REPLACE(column, '\xEF\xBB\xBF', '')
```

## NULL vs Empty String Normalization

```sql
-- Convert empty strings to NULL (data cleansing)
NULLIF(TRIM(column), '')

-- Convert NULL to empty string
COALESCE(column, '')

-- Check for either (common in dirty data)
WHERE column IS NULL OR TRIM(column) = ''
```

## JSON Column Handling

```sql
-- PostgreSQL JSONB
data->>'key'                         -- Extract as text
(data->>'number')::FLOAT             -- Extract and cast
data->'nested'->>'key'               -- Nested access
jsonb_array_elements(data->'items')  -- Explode array

-- MySQL JSON
JSON_EXTRACT(data, '$.key')
JSON_UNQUOTE(JSON_EXTRACT(data, '$.key'))
JSON_VALUE(data, '$.key')  -- MySQL 8.0.21+

-- BigQuery
JSON_EXTRACT(data, '$.key')
JSON_EXTRACT_SCALAR(data, '$.key')   -- Returns string

-- Snowflake VARIANT
data:key::STRING
data:nested:key::FLOAT
```

---

# Subquery Patterns — AskDB AgentEngine

## CTE vs Subquery — When to Use Each

```sql
-- Use CTE when:
-- 1. Result is referenced multiple times
-- 2. Logic is complex and needs a name
-- 3. Recursive (hierarchies, graphs)

WITH customer_revenue AS (
  SELECT customer_id, SUM(amount) as total
  FROM orders GROUP BY customer_id
),
customer_tiers AS (
  SELECT customer_id, total,
    NTILE(4) OVER (ORDER BY total DESC) as quartile
  FROM customer_revenue
)
SELECT * FROM customer_tiers JOIN customers USING (customer_id);

-- Use subquery when:
-- 1. Single use, simple logic
-- 2. Filtering with IN/EXISTS
-- 3. Scalar (returns one value)

SELECT * FROM orders
WHERE customer_id IN (
  SELECT id FROM customers WHERE country = 'US'
);
```

## EXISTS vs IN — Performance

```sql
-- EXISTS: Better when subquery returns many rows (short-circuits)
SELECT * FROM orders o
WHERE EXISTS (
  SELECT 1 FROM customers c WHERE c.id = o.customer_id AND c.tier = 'enterprise'
);

-- IN: Better when subquery returns few rows
SELECT * FROM orders
WHERE customer_id IN (1, 2, 3, 45, 67);

-- NOT EXISTS: Use instead of NOT IN (NULL-safe)
SELECT * FROM orders o
WHERE NOT EXISTS (
  SELECT 1 FROM returns r WHERE r.order_id = o.id
);
-- NOT IN can return 0 rows if subquery has any NULLs — use NOT EXISTS instead
```

## Lateral / Cross Apply (Row-by-Row Subquery)

```sql
-- PostgreSQL LATERAL (for row-by-row calculations)
SELECT o.*, recent.last_5_orders
FROM orders o
CROSS JOIN LATERAL (
  SELECT ARRAY_AGG(amount ORDER BY date DESC) as last_5_orders
  FROM orders o2
  WHERE o2.customer_id = o.customer_id
  LIMIT 5
) recent;

-- SQL Server CROSS APPLY equivalent
SELECT o.*, recent.amount
FROM orders o
CROSS APPLY (
  SELECT TOP 1 amount FROM order_items oi WHERE oi.order_id = o.id
) recent;
```

## Recursive CTEs (Hierarchies)

```sql
-- Organization hierarchy traversal
WITH RECURSIVE org_tree AS (
  -- Base: top-level employees
  SELECT id, name, manager_id, 1 as level
  FROM employees WHERE manager_id IS NULL
  
  UNION ALL
  
  -- Recursive: each employee's direct reports
  SELECT e.id, e.name, e.manager_id, ot.level + 1
  FROM employees e
  JOIN org_tree ot ON e.manager_id = ot.id
)
SELECT * FROM org_tree ORDER BY level, name;

-- Note: Use MAXRECURSION / recursion limits to prevent infinite loops
-- PostgreSQL: Default limit 100 (override with SET LOCAL max_recursive_iterations)
-- SQL Server: OPTION (MAXRECURSION 500)
```
