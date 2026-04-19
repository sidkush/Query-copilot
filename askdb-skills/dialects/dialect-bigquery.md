# BigQuery SQL Dialect — AskDB AgentEngine

## Syntax Specifics

### Date/Time Functions
```sql
-- Date truncation
DATE_TRUNC(date_col, MONTH)      -- returns DATE
DATE_TRUNC(date_col, QUARTER)
DATE_TRUNC(date_col, YEAR)
DATE_TRUNC(date_col, WEEK)       -- Week starts Sunday by default
DATE_TRUNC(date_col, WEEK(MONDAY)) -- Explicit Monday start

-- Timestamp truncation
TIMESTAMP_TRUNC(ts_col, HOUR)
TIMESTAMP_TRUNC(ts_col, DAY)

-- Date arithmetic
DATE_ADD(date_col, INTERVAL 30 DAY)
DATE_SUB(date_col, INTERVAL 1 MONTH)
DATE_DIFF(end_date, start_date, DAY)  -- Note: BigQuery arg order

-- Current date/time
CURRENT_DATE()
CURRENT_TIMESTAMP()

-- Timezone conversion
TIMESTAMP(date_col, 'America/New_York')
DATETIME(ts_col, 'America/New_York')
```

### String Functions
```sql
-- Case-insensitive search (BigQuery has no ILIKE)
LOWER(column) LIKE LOWER('%pattern%')
-- OR use REGEXP_CONTAINS for regex:
REGEXP_CONTAINS(column, r'(?i)pattern')

-- String formatting
FORMAT('%s - %s', col1, col2)
CONCAT(col1, ' ', col2)

-- Substring
SUBSTR(string, start, length)  -- 1-indexed
```

### Aggregation
```sql
-- Approximate distinct count (much faster at scale)
APPROX_COUNT_DISTINCT(user_id)

-- Approximate percentiles
APPROX_QUANTILES(value, 100)[OFFSET(50)]  -- Median
APPROX_QUANTILES(value, 100)[OFFSET(95)]  -- P95

-- Array aggregation
ARRAY_AGG(column ORDER BY date DESC LIMIT 5)
STRING_AGG(column, ', ' ORDER BY column)
```

### Window Functions
```sql
-- QUALIFY replaces subquery for filtering window results (cleaner)
SELECT user_id, event_type, created_at,
  ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) as rn
FROM events
QUALIFY rn = 1;  -- Latest event per user — no subquery needed!

-- RANGE vs ROWS — BigQuery supports both
-- Always use ROWS for running totals (performance)
SUM(revenue) OVER (ORDER BY month ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
```

### BigQuery-Specific Features
```sql
-- Partitioned table query (mention partition filter for cost control)
WHERE _PARTITIONDATE >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
-- Note: Always filter on partition column — prevents full table scan

-- Nested/Repeated fields (STRUCT, ARRAY)
SELECT user_id, item.product_id, item.quantity
FROM orders, UNNEST(items) as item  -- UNNEST arrays

-- STRUCT access
SELECT user.name, user.address.city FROM users

-- JSON
JSON_EXTRACT(json_col, '$.key')
JSON_EXTRACT_SCALAR(json_col, '$.key')  -- Returns string, not JSON
```

### Schema Metadata (BigQuery)
```sql
-- Tables in dataset
SELECT table_name, row_count, size_bytes
FROM `project.dataset.INFORMATION_SCHEMA.TABLES`;

-- Columns
SELECT table_name, column_name, data_type, is_nullable
FROM `project.dataset.INFORMATION_SCHEMA.COLUMNS`
ORDER BY table_name, ordinal_position;

-- Column statistics (requires table scan — use sparingly)
SELECT APPROX_COUNT_DISTINCT(column_name) as distinct_count
FROM `project.dataset.table_name`;
```

## Cost Awareness

BigQuery charges per bytes scanned. Always:
```sql
-- SELECT only needed columns
SELECT id, name, created_at  -- Not SELECT *

-- Use partition filters when available
WHERE DATE(_PARTITIONTIME) >= '2024-01-01'

-- Use LIMIT for exploration
LIMIT 1000

-- Add note in summary when query will scan large amount:
-- "This query will scan approximately [X]GB. Cost: ~$[Y]."
```

## Common BigQuery Gotchas

| Issue | BigQuery behavior | Fix |
|-------|-----------------|-----|
| Integer division | Returns INT (3/4 = 0) | Cast: `SAFE_DIVIDE(3, 4)` |
| NULL comparison | Standard SQL | `IS NULL` not `= NULL` |
| LIMIT with ORDER BY | Required for deterministic results | Always add both |
| Timestamp vs DateTime | TIMESTAMP = UTC, DATETIME = no timezone | Use TIMESTAMP for cross-timezone |
| Case sensitivity | Table/column names case-sensitive | Use exact case |
| Comma join | Not supported | Use explicit JOIN syntax |

## SAFE Functions (BigQuery)

```sql
-- SAFE prefix prevents errors, returns NULL instead
SAFE_DIVIDE(numerator, denominator)   -- No division by zero error
SAFE_CAST(value AS INT64)             -- No cast error
SAFE.REGEXP_EXTRACT(string, pattern)  -- No regex error
```

---

## Examples

**Running total (BigQuery):**
```sql
SELECT month, revenue,
  SUM(revenue) OVER (ORDER BY month ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) as cumulative_revenue
FROM `project.dataset.monthly_revenue`
ORDER BY month;
```

**Latest record per user (BigQuery with QUALIFY):**
```sql
SELECT user_id, last_action, created_at
FROM `project.dataset.events`
QUALIFY ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) = 1;
```

**Approximate distinct users (BigQuery at scale):**
```sql
SELECT DATE_TRUNC(event_date, MONTH) as month,
  APPROX_COUNT_DISTINCT(user_id) as unique_users
FROM `project.dataset.events`
WHERE _PARTITIONDATE >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)
GROUP BY month
ORDER BY month;
```
