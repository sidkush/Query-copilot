---
applies_to: sql-generation
description: FLATTEN arrays SELECT f.value:product_id::STRING as product_id FROM orders,
  LATERAL FLATTEN(input => items) f; ```
legacy: true
name: dialect-snowflake-postgres-duckdb
priority: 3
tokens_budget: 2200
---

# Snowflake SQL Dialect — AskDB AgentEngine

## Syntax Specifics

### Date/Time Functions
```sql
DATE_TRUNC('MONTH', date_col)
DATE_TRUNC('QUARTER', date_col)
DATEADD(DAY, 30, date_col)
DATEDIFF(DAY, start_date, end_date)  -- Snowflake arg order: unit, start, end
CURRENT_DATE()
CONVERT_TIMEZONE('UTC', 'America/New_York', timestamp_col)
```

### Aggregation
```sql
APPROX_COUNT_DISTINCT(user_id)  -- HyperLogLog approximation
APPROX_PERCENTILE(value, 0.95)  -- Approximate P95
LISTAGG(column, ', ') WITHIN GROUP (ORDER BY column)  -- String aggregation
```

### Window Functions — QUALIFY
```sql
-- QUALIFY is Snowflake's killer feature for window filtering
SELECT user_id, event_type,
  ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) as rn
FROM events
QUALIFY rn = 1;  -- Latest per user, no subquery
```

### Semi-Structured Data (VARIANT)
```sql
-- Access JSON fields
SELECT data:user_id::STRING as user_id,
       data:revenue::FLOAT as revenue,
       data:metadata:source::STRING as source
FROM events_raw;

-- FLATTEN arrays
SELECT f.value:product_id::STRING as product_id
FROM orders, LATERAL FLATTEN(input => items) f;
```

### Schema Metadata
```sql
SHOW TABLES IN DATABASE my_db SCHEMA my_schema;
SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'MY_SCHEMA';
SELECT * FROM INFORMATION_SCHEMA.TABLE_STORAGE_METRICS;
```

### Snowflake-Specific Features
```sql
-- Time travel (query historical data)
SELECT * FROM orders AT (TIMESTAMP => '2024-01-15 12:00:00');
SELECT * FROM orders BEFORE (STATEMENT => 'query_id_here');

-- Result cache (free if same query, same data)
-- Snowflake caches results for 24h — fast repeated queries

-- SAMPLE for quick exploration
SELECT * FROM large_table SAMPLE (1000 ROWS);
SELECT * FROM large_table SAMPLE BLOCK (1);  -- 1% of blocks
```

### Common Gotchas
- String literals: Use single quotes only
- Column names: Case-insensitive by default (stored uppercase)
- Semicolons: Required to separate statements
- LIMIT: Use LIMIT not TOP
- Division: Returns FLOAT (no integer division issue)

### Cross-Dialect Gotchas — Snowflake (research-context §3.5)

| Gotcha | Snowflake rule |
|--------|---------------|
| §3.5 rule 4 | No `NVL` in BigQuery — use `COALESCE` for portability even though Snowflake has `NVL` |
| §3.5 rule 5 | `\|\|` concat works in Snowflake and PG; avoid in BigQuery |
| §3.5 rule 6 | Unquoted identifiers stored UPPERCASE (`orders` → `ORDERS` in INFORMATION_SCHEMA); quote with `"` to preserve case |
| §3.5 rule 8 | Non-aggregated SELECT columns must appear in GROUP BY (strict, same as PG/BigQuery) |
| §3.5 rule 9 | `IGNORE NULLS` / `RESPECT NULLS` on `LAG`, `LEAD`, `FIRST_VALUE` supported |
| §3.5 rule 10 | `DAYOFWEEK(d)` returns 0 = Sunday by default; configurable via `ALTER SESSION SET WEEK_START = 1` |
| §3.5 rule 7 | `QUALIFY` supported for window-filter shorthand (no subquery needed) |

---

# PostgreSQL SQL Dialect — AskDB AgentEngine

## Syntax Specifics

### Date/Time Functions
```sql
DATE_TRUNC('month', date_col)     -- returns timestamp
DATE_TRUNC('quarter', date_col)

-- Date arithmetic
date_col + INTERVAL '30 days'
date_col - INTERVAL '1 month'
AGE(end_date, start_date)         -- Returns interval

-- Extraction
EXTRACT(YEAR FROM date_col)
EXTRACT(DOW FROM date_col)        -- Day of week (0=Sunday)
TO_CHAR(date_col, 'YYYY-MM')      -- Format as string

CURRENT_DATE
NOW()                             -- Current timestamp with timezone
CURRENT_TIMESTAMP                 -- Same as NOW()
```

### String Functions (PostgreSQL Strengths)
```sql
ILIKE '%pattern%'                 -- Case-insensitive LIKE
SIMILAR TO 'pattern'              -- Regex-ish pattern matching
~ 'regex'                         -- Regex match (case-sensitive)
~* 'regex'                        -- Regex match (case-insensitive)

-- String operations
SPLIT_PART(string, delimiter, position)
REGEXP_REPLACE(string, pattern, replacement, flags)
TRIM(BOTH ' ' FROM string)
```

### JSON/JSONB (PostgreSQL Strengths)
```sql
-- JSONB (binary, indexed, preferred)
data->>'key'                      -- Extract text value
data->'key'                       -- Extract JSON value
data#>>'{nested,key}'             -- Nested path
data @> '{"status": "active"}'::jsonb  -- Contains

-- JSONB indexing (mention when querying JSONB)
-- GIN index on JSONB enables fast containment queries
```

### Generate Series (Date Spine)
```sql
-- Generate complete date range
SELECT generate_series(
  '2024-01-01'::date,
  '2024-12-31'::date,
  '1 day'::interval
)::date AS date;

-- Generate integer series
SELECT generate_series(1, 100) AS n;
```

### Window Functions — FILTER
```sql
-- Conditional aggregation in window (PostgreSQL extension)
COUNT(*) FILTER (WHERE status = 'completed') OVER (PARTITION BY region)
SUM(amount) FILTER (WHERE type = 'recurring') OVER (ORDER BY month)
```

### Common Gotchas
- NULL sorting: NULLS FIRST by default in ASC (add NULLS LAST explicitly)
- Integer division: 3/4 = 0. Cast: `3.0/4` or `CAST(3 AS FLOAT)/4`
- ILIKE: PostgreSQL only — not in MySQL or SQL Server
- Arrays: PostgreSQL supports array types natively
- CTEs: Materialized by default in older versions (use MATERIALIZED/NOT MATERIALIZED hint)

### Cross-Dialect Gotchas — PostgreSQL (research-context §3.5)

| Gotcha | PostgreSQL rule |
|--------|----------------|
| §3.5 rule 3 | Has both `TIMESTAMPTZ` (with timezone) and `TIMESTAMP` (no timezone); always prefer `TIMESTAMPTZ` for cross-TZ safety |
| §3.5 rule 4 | No `NVL`; use `COALESCE` (NVL is Oracle/Snowflake-only) |
| §3.5 rule 5 | `\|\|` concat works natively |
| §3.5 rule 6 | Unquoted identifiers lowercased (`Orders` → `orders`); quote with `"` to preserve |
| §3.5 rule 8 | All non-aggregated SELECT columns must appear in GROUP BY (strict) |
| §3.5 rule 9 | PG 16+ supports `IGNORE NULLS` on `LAG`/`LEAD`; older PG needs CTE workaround |
| §3.5 rule 10 | `EXTRACT(dow FROM d)` returns 0 = Sunday; `DATE_TRUNC('week', d)` is ISO Monday start |

---

# DuckDB SQL Dialect — AskDB AgentEngine

## DuckDB-Specific Features (TurboTier)

### LTTB Downsampling (Core to AskDB)
```sql
-- Largest Triangle Three Buckets downsampling
-- DuckDB has built-in LTTB via macro or approximation
SELECT lttb(time_col, value_col, 1000) FROM timeseries_data;

-- Manual LTTB approximation using NTILE
WITH bucketed AS (
  SELECT time_col, value_col,
    NTILE(1000) OVER (ORDER BY time_col) as bucket
  FROM large_timeseries
),
sampled AS (
  SELECT bucket,
    time_col[FLOOR(COUNT(*)/2)] as representative_time,  -- Middle of bucket
    AVG(value_col) as avg_value,
    MIN(value_col) as min_value,
    MAX(value_col) as max_value
  FROM bucketed GROUP BY bucket
)
SELECT * FROM sampled ORDER BY representative_time;
```

### DuckDB-Specific Syntax
```sql
-- PIVOT (native, no CASE WHEN needed)
PIVOT orders ON status USING SUM(amount) GROUP BY customer_id;

-- UNPIVOT
UNPIVOT monthly_sales ON jan, feb, mar INTO NAME month VALUE sales;

-- QUALIFY (like Snowflake/BigQuery)
SELECT *, ROW_NUMBER() OVER (PARTITION BY id ORDER BY date DESC) as rn
FROM events QUALIFY rn = 1;

-- ASOF JOIN (time-series nearest-match join)
SELECT e.user_id, e.event_time, p.price
FROM events e
ASOF JOIN prices p ON e.user_id = p.user_id AND e.event_time >= p.effective_date;

-- SAMPLE
SELECT * FROM large_table USING SAMPLE 1000 ROWS;
SELECT * FROM large_table USING SAMPLE 1%;

-- LIST aggregation
SELECT LIST(value ORDER BY date) FROM timeseries;

-- Compressed string aggregation
STRING_AGG(column, ', ' ORDER BY column)
```

### Arrow IPC Integration (AskDB Internal)
```sql
-- DuckDB reads Arrow directly (zero-copy)
-- AskDB uses this for the Arrow bridge
SELECT * FROM arrow_scan(arrow_table_ref);

-- Parquet (DuckDB reads natively)
SELECT * FROM 'path/to/file.parquet';
SELECT * FROM read_parquet(['file1.parquet', 'file2.parquet']);

-- CSV (DuckDB reads natively)  
SELECT * FROM read_csv_auto('path/to/file.csv');
```

### DuckDB Performance Tips
```sql
-- Column projection (critical for DuckDB columnar engine)
SELECT col1, col2 FROM table;  -- NOT SELECT *

-- Predicate pushdown (put WHERE early, DuckDB handles the rest)
WHERE date_col >= '2024-01-01'  -- DuckDB pushes to scan

-- PRAGMA for DuckDB settings
PRAGMA threads=8;               -- Use 8 threads (Helios has 24 cores)
PRAGMA memory_limit='8GB';      -- Memory cap

-- Parallel GROUP BY (automatic in DuckDB — no hints needed)
```

### Common Gotchas
- DuckDB is largely PostgreSQL-compatible
- Use `//` for integer division (not `/`)
- `STRUCT` access: `struct_col.field_name`
- List indexing: 1-based (like SQL, not 0-based like Python)
- `CURRENT_TIMESTAMP` returns microsecond precision

### Cross-Dialect Gotchas — DuckDB (research-context §3.5)

| Gotcha | DuckDB rule |
|--------|------------|
| §3.5 rule 7 | `QUALIFY` supported (same as Snowflake/BigQuery) |
| §3.5 rule 10 | `EXTRACT(dayofweek FROM d)` returns 0 = Sunday (same as PG) |
| §3.5 rule 11 | `/` between integers may return float depending on version; prefer `//` for explicit integer division |
| §3.5 rule 5 | `\|\|` concat works (PG-compatible) |
