---
applies_to: sql-generation
description: MySQL has no DATE_TRUNC — use DATE_FORMAT or FLOOR tricks DATE_FORMAT(date_col,
  '%Y-%m-01') -- Month start equivalent...
legacy: true
name: dialect-mysql-sqlserver-redshift-databricks
priority: 3
tokens_budget: 1700
---

# MySQL SQL Dialect — AskDB AgentEngine

## Syntax Specifics

### Date/Time Functions
```sql
DATE_FORMAT(date_col, '%Y-%m-01')    -- Month start
DATE_FORMAT(date_col, '%Y-%m-%d')    -- Date as string
DATE_ADD(date_col, INTERVAL 30 DAY)
DATE_SUB(date_col, INTERVAL 1 MONTH)
DATEDIFF(end_date, start_date)       -- Returns days (integers)
TIMESTAMPDIFF(MONTH, start, end)     -- Difference in months
CURDATE()                             -- Current date
NOW()                                 -- Current datetime

-- MySQL has no DATE_TRUNC — use DATE_FORMAT or FLOOR tricks
DATE_FORMAT(date_col, '%Y-%m-01')   -- Month start equivalent
STR_TO_DATE(CONCAT(YEAR(date_col), '-', QUARTER(date_col)*3-2, '-01'), '%Y-%c-%d')  -- Quarter start
```

### String Functions
```sql
-- Case-insensitive search (MySQL default collation is case-insensitive)
WHERE column LIKE '%pattern%'   -- Already case-insensitive with utf8mb4_unicode_ci

-- String operations
CONCAT(col1, ' ', col2)
SUBSTRING(string, start, length)  -- 1-indexed
GROUP_CONCAT(column ORDER BY col SEPARATOR ', ')  -- String aggregation
REPLACE(string, 'old', 'new')
REGEXP_LIKE(column, 'pattern')    -- MySQL 8.0+
```

### MySQL-Specific Features
```sql
-- LIMIT syntax (no FETCH FIRST)
SELECT * FROM table LIMIT 10;
SELECT * FROM table LIMIT 10 OFFSET 20;

-- ON DUPLICATE KEY UPDATE (upsert)
INSERT INTO table (id, value) VALUES (1, 'x')
ON DUPLICATE KEY UPDATE value = 'x';

-- Full-text search
SELECT * FROM articles WHERE MATCH(title, body) AGAINST('search term');
```

### Common Gotchas
- Integer division: `3/4 = 0.75` (MySQL returns float — no problem)
- NULL in aggregations: Same as standard SQL
- Window functions: Available in MySQL 8.0+ only — check version
- ILIKE: Not supported — use LIKE (case-insensitive by default)
- Backtick identifiers: Use backticks for reserved words `` `order` ``, `` `date` ``
- Strict mode: May reject invalid dates, division by zero if enabled
- JSON: Supported in MySQL 5.7+

---

# SQL Server (T-SQL) Dialect — AskDB AgentEngine

## Syntax Specifics

### Date/Time Functions
```sql
-- Date truncation (SQL Server has no DATE_TRUNC before 2022)
DATEADD(MONTH, DATEDIFF(MONTH, 0, date_col), 0)   -- Month start
DATEADD(QUARTER, DATEDIFF(QUARTER, 0, date_col), 0) -- Quarter start
DATEADD(YEAR, DATEDIFF(YEAR, 0, date_col), 0)      -- Year start

-- SQL Server 2022+ (clean version)
DATETRUNC(MONTH, date_col)

-- Date arithmetic
DATEADD(DAY, 30, date_col)
DATEDIFF(DAY, start_date, end_date)  -- Note: SQL Server arg order (unit, start, end)
GETDATE()        -- Current datetime
CAST(GETDATE() AS DATE)  -- Current date only

-- Format
FORMAT(date_col, 'yyyy-MM')
CONVERT(VARCHAR, date_col, 23)  -- 'YYYY-MM-DD'
```

### T-SQL Specific
```sql
-- TOP instead of LIMIT
SELECT TOP 10 * FROM orders ORDER BY amount DESC;
SELECT TOP 10 PERCENT * FROM orders;

-- ISNULL (T-SQL coalesce alternative)
ISNULL(column, 0)   -- Replaces NULL with 0

-- TRY_CAST / TRY_CONVERT (safe casting)
TRY_CAST(column AS INT)    -- Returns NULL if cast fails
TRY_CONVERT(INT, column)   -- Same

-- STRING_AGG (SQL Server 2017+)
STRING_AGG(column, ', ') WITHIN GROUP (ORDER BY column)

-- Identifier quoting
[order], [date], [table]   -- Square brackets for reserved words
```

### Window Functions
```sql
-- Standard window functions (SQL Server 2012+)
ROW_NUMBER() OVER (PARTITION BY dept ORDER BY salary DESC)
SUM(amount) OVER (ORDER BY date ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)

-- Note: ROWS BETWEEN is fully supported. RANGE has limitations.
-- COUNT(DISTINCT) as window function: NOT supported — use CTE workaround
```

### Common Gotchas
- Integer division: `3/4 = 0` — cast: `CAST(3 AS FLOAT)/4` or `3.0/4`
- NULL sorting: NULLS sort FIRST in ASC — use `ORDER BY ISNULL(col, 1), col`
- Date literals: Use unambiguous format: `'2024-01-15'` (ISO 8601)
- NOLOCK hint: `WITH (NOLOCK)` — tempting for speed but can read dirty data. Avoid.

---

# Redshift SQL Dialect — AskDB AgentEngine

## Syntax Specifics

### Date/Time Functions
```sql
DATE_TRUNC('month', date_col)
DATE_TRUNC('quarter', date_col)
DATEADD(DAY, 30, date_col)
DATEDIFF(DAY, start_date, end_date)
CONVERT_TIMEZONE('UTC', 'US/Eastern', timestamp_col)
GETDATE()
SYSDATE
```

### Redshift-Specific Features
```sql
-- Approximate COUNT DISTINCT (much faster)
APPROXIMATE COUNT(DISTINCT user_id)

-- LISTAGG (string aggregation)
LISTAGG(column, ', ') WITHIN GROUP (ORDER BY column)

-- Distribution style awareness (query hints)
-- When joining, note that mismatched distribution keys cause data movement
-- Mention in complex join summaries when Redshift is the engine
```

### Redshift Gotchas
- No LIMIT pushdown in subqueries — avoid `LIMIT` in subqueries
- SORTKEY columns: Dramatically faster range queries
- Distribution keys: Joins on distkey columns are faster
- VARCHAR max: 65535 bytes — JSON columns often truncated
- FLOAT precision: Use DECIMAL for currency

---

# Databricks (Spark SQL) Dialect — AskDB AgentEngine

## Syntax Specifics

### Date/Time Functions
```sql
DATE_TRUNC('MONTH', date_col)
TRUNC(date_col, 'MM')          -- Alternative Hive-style
ADD_MONTHS(date_col, 1)
MONTHS_BETWEEN(end_date, start_date)
DATEDIFF(end_date, start_date)
CURRENT_DATE()
CURRENT_TIMESTAMP()

-- Timezone
TO_UTC_TIMESTAMP(timestamp_col, 'America/New_York')
FROM_UTC_TIMESTAMP(utc_col, 'America/New_York')
```

### Databricks-Specific Features
```sql
-- Delta Lake time travel
SELECT * FROM orders TIMESTAMP AS OF '2024-01-15'
SELECT * FROM orders VERSION AS OF 5

-- OPTIMIZE (run after large writes)
OPTIMIZE orders ZORDER BY (customer_id, order_date);

-- VACUUM (clean old versions)
VACUUM orders RETAIN 168 HOURS;

-- Three-part naming (Unity Catalog)
SELECT * FROM catalog.schema.table_name;

-- Array/Map functions (Spark SQL)
EXPLODE(array_col)             -- Unnest array
MAP_KEYS(map_col)              -- Get map keys
TRANSFORM(array_col, x -> x*2) -- Apply function to array

-- Struct access
struct_col.field_name
```

### Spark SQL Gotchas
- `NULL` handling: Same as standard SQL
- String comparison: Case-sensitive by default
- Integer division: Returns integer — cast first
- Schema evolution: Delta tables support schema evolution (new columns ok)
- ANSI mode: `SET spark.sql.ansi.enabled=true` for strict SQL behavior
