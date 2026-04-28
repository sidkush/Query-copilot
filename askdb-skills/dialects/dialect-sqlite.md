---
applies_to: sql-generation
description: SQLite — STRFTIME (no YEAR/MONTH), || concat, INTEGER-div CAST, INSTR,
  IFNULL, RANK for ties, YYYYMM TEXT, case-collation, datetime arithmetic.
legacy: true
name: dialect-sqlite
priority: 3
tokens_budget: 1800
---

# SQLite SQL Dialect — AskDB AgentEngine

SQLite is the BIRD-MiniDev evaluation dialect. Production users rarely connect SQLite (most BYOK is Postgres/MySQL/Snowflake), so this skill exists primarily for benchmark accuracy — but it also covers genuine SQLite-on-disk users.

## Syntax Specifics

### Date/Time Functions

SQLite has **no `YEAR()`, `MONTH()`, `DAY()`, `DATE_TRUNC()`, `EXTRACT()`** — use `STRFTIME` for all date-part extraction.

```sql
-- Year/month/day extraction (use STRFTIME, NOT YEAR()/MONTH()/DAY())
STRFTIME('%Y', date_col)         -- 4-digit year (e.g. '2026')
STRFTIME('%m', date_col)         -- 2-digit month ('01' to '12')
STRFTIME('%d', date_col)         -- 2-digit day
STRFTIME('%Y-%m', date_col)      -- year-month for grouping

-- Date arithmetic (relative to NOW or a column)
datetime('now', '-30 days')      -- 30 days ago
datetime('now', '+1 month')
date(date_col, '-7 days')        -- 7 days before column
strftime('%Y-%m-%d', date_col, '+1 year')

-- Day-of-week (0=Sunday, 6=Saturday)
STRFTIME('%w', date_col)

-- Date difference in days
julianday(end_date) - julianday(start_date)

-- Current date/time
date('now')                      -- '2026-04-28'
datetime('now')                  -- '2026-04-28 12:34:56'
```

### YYYYMM TEXT pattern (BIRD-specific)

The BIRD `debit_card_specializing` schema stores `yearmonth.Date` as TEXT in `'YYYYMM'` form (e.g. `'201309'` for Sep 2013), NOT as DATE. **Do NOT call `strftime()` on it** — the column is already formatted text.

```sql
-- Correct: filter pre-formatted YYYYMM TEXT directly
WHERE yearmonth.Date = '201309'                  -- exact month
WHERE yearmonth.Date BETWEEN '201301' AND '201312'  -- year 2013

-- Wrong: strftime() on TEXT-formatted YYYYMM
WHERE strftime('%Y%m', yearmonth.Date) = '201309'  -- breaks
```

### String Functions

SQLite has **no `CONCAT()`** — use the `||` operator.

```sql
-- Concatenation (CONCAT() does NOT exist)
SELECT first_name || ' ' || last_name AS full_name FROM users
SELECT 'Total: ' || COUNT(*) FROM orders

-- Substring search: prefer INSTR over LIKE for exact substring
INSTR(column, 'needle') > 0                      -- found
INSTR(column, 'needle') = 0                      -- not found
SUBSTR(column, 1, 10)                            -- 1-indexed substring

-- Case-insensitive matching: LIKE is case-insensitive for ASCII by default,
-- but exact-comparison (=) is case-sensitive. Use LOWER() or COLLATE NOCASE
-- for explicit case-insensitive equality:
WHERE LOWER(name) = LOWER('Alice')
WHERE name = 'Alice' COLLATE NOCASE

-- Length
LENGTH(text_col)
```

### Integer Division Pitfall

SQLite truncates integer division: `5 / 3 = 1` (NOT `1.67`). For ratios or percentages, **CAST one side to REAL**:

```sql
-- Wrong: returns integer truncation
SELECT eur_count / czk_count AS ratio FROM customers   -- 1 instead of 1.67

-- Correct: CAST to REAL for floating-point result
SELECT CAST(eur_count AS REAL) / czk_count AS ratio FROM customers

-- Percent: cast and multiply by 100.0 (not 100)
SELECT CAST(passed AS REAL) * 100.0 / total AS pct_passed FROM exams
```

### Null Handling

```sql
-- IFNULL is the SQLite idiom (COALESCE works too, but IFNULL is shorter)
IFNULL(column, fallback_value)
COALESCE(col1, col2, col3)       -- multi-arg null coalesce

-- NULL semantics: NULL = NULL is NULL (not TRUE) — use IS NULL / IS NOT NULL
WHERE x IS NULL
WHERE x IS NOT NULL
```

### Identifiers with Special Characters

Identifiers containing spaces, hyphens, or reserved words MUST be quoted. Bare identifiers fail with syntax error.

```sql
-- Backticks (MySQL-compatible) OR double-quotes (SQL standard)
SELECT `Free Meal Count (K-12)` FROM california_schools
SELECT "Column Name" FROM table

-- Both work in SQLite; prefer backticks for AskDB consistency
```

### Tie Handling — RANK over LIMIT

`ORDER BY x DESC LIMIT N` silently drops ties. When the question asks for "top N" and ties exist, gold often expects ALL tied rows. Use `RANK() OVER (...)` instead.

```sql
-- Wrong: drops ties
SELECT name, score FROM students
ORDER BY score DESC LIMIT 5
-- Returns 5 rows even if score 5 and score 6 share the same value

-- Correct: retains tied rows
SELECT name, score FROM (
  SELECT name, score, RANK() OVER (ORDER BY score DESC) AS rnk
  FROM students
)
WHERE rnk <= 5

-- Or for tied-only-at-top (HAVING pattern):
SELECT name, score FROM students
WHERE score = (SELECT MAX(score) FROM students)

-- ROW_NUMBER assigns unique ranks even on ties — use ONLY when uniqueness
-- is the goal (e.g., "pick one row per group"), NOT for top-N ranking.
```

### Joins

```sql
-- INNER JOIN (default)
SELECT t1.col, t2.col FROM t1 JOIN t2 ON t1.id = t2.t1_id

-- LEFT JOIN (RIGHT JOIN works in SQLite 3.39+; otherwise flip the tables)

-- No FULL OUTER JOIN — emulate via UNION of LEFT JOIN and RIGHT JOIN
-- (or LEFT JOIN twice with reversed roles + UNION)

-- USING shorthand
SELECT * FROM orders JOIN customers USING (customer_id)
```

### Aggregation

```sql
-- Standard aggregates
COUNT(*), COUNT(col), COUNT(DISTINCT col)
SUM(col), AVG(col), MIN(col), MAX(col)

-- GROUP_CONCAT (no STRING_AGG in SQLite)
GROUP_CONCAT(name)                            -- comma-separated by default
GROUP_CONCAT(name, '; ')                      -- custom separator

-- HAVING for aggregate filtering
SELECT category, COUNT(*) AS n
FROM products GROUP BY category HAVING COUNT(*) > 10
```

### Window Functions

SQLite supports window functions since 3.25 (2018).

```sql
-- Basic window
ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY ts DESC)
RANK() OVER (ORDER BY score DESC)
DENSE_RANK() OVER (ORDER BY score DESC)

-- Running total
SUM(amount) OVER (PARTITION BY user_id ORDER BY ts
  ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)

-- Lag/Lead
LAG(value, 1) OVER (ORDER BY ts)
LEAD(value, 1) OVER (ORDER BY ts)
```

### Boolean / Type Affinity

SQLite has **dynamic typing** ("type affinity"). A column declared `INTEGER` can store text. Compare numbers as numbers, not strings, even if the column was loaded from CSV.

```sql
-- If a TEXT column holds numeric strings, CAST before numeric comparison
WHERE CAST(value AS INTEGER) > 100

-- Boolean: SQLite has no BOOLEAN type — use 0/1 INTEGER
WHERE is_active = 1
```

### Schema Inspection

```sql
-- List tables
SELECT name FROM sqlite_master WHERE type='table';

-- Column info for a table
PRAGMA table_info(table_name);

-- Index info
PRAGMA index_list(table_name);

-- Foreign keys
PRAGMA foreign_key_list(table_name);
```

## Common BIRD Failure Patterns

These are the failure modes most often seen on BIRD when SQLite-specific knowledge is missing:

1. **`no such function: YEAR`** — agent emits Postgres/MySQL `YEAR(col)` instead of `STRFTIME('%Y', col)`. Fix: use `STRFTIME` for all date-part extraction.
2. **Syntax error on column with spaces** — agent emits bare `Free Meal Count` instead of `` `Free Meal Count` ``. Fix: backtick all identifiers with special chars.
3. **Wrong ratio (integer truncation)** — agent emits `count_a / count_b` and gets `0` or `1` instead of fractional. Fix: `CAST(count_a AS REAL) / count_b`.
4. **Tie loss on top-N** — `ORDER BY score DESC LIMIT N` drops tied rows. Fix: `RANK() OVER (ORDER BY score DESC)` then `WHERE rnk <= N`.
5. **YYYYMM TEXT mishandled** — agent calls `strftime('%Y%m', yearmonth.Date)` on a column already in `'201309'` form. Fix: filter the TEXT directly.
6. **`CONCAT()` not supported** — agent emits Postgres-style `CONCAT(a, ' ', b)`. Fix: `a || ' ' || b`.

## Notes

- SQLite identifiers are **case-sensitive in schema lookups** but **case-insensitive in default LIKE**. Mixed-case table/column names from BIRD schemas are usually safe to address case-as-stored.
- No `ILIKE`, no `EXCEPT ALL` (just `EXCEPT`), no `INTERSECT ALL` (just `INTERSECT`).
- No native JSON functions in older SQLite; check `sqlite_version()` if JSON ops needed.
