---
applies_to: sql-generation
description: 'Understanding WHY a value is NULL changes how you handle it:'
legacy: true
name: null-handling
priority: 2
tokens_budget: 1100
---

# NULL Handling — AskDB AgentEngine

## The Three Meanings of NULL

Understanding WHY a value is NULL changes how you handle it:

| NULL meaning | Example | Correct handling |
|-------------|---------|-----------------|
| Missing / not collected | No phone number provided | Keep as NULL, note in summary |
| Not applicable | Discount on non-discounted item | Replace with 0 or exclude |
| Unknown / not yet | Ship date for pending order | Keep as NULL, filter carefully |

**Default assumption:** NULL = missing data. Never silently replace with 0 unless context is clear.

## NULL-Safe Operations

```sql
-- Comparison: NULL = NULL is always FALSE in SQL
-- WRONG:
WHERE column = NULL  -- Never matches anything

-- CORRECT:
WHERE column IS NULL
WHERE column IS NOT NULL

-- CORRECT for nullable equality:
WHERE column IS NOT DISTINCT FROM other_column  -- PostgreSQL
WHERE (column = other_column OR (column IS NULL AND other_column IS NULL))

-- COALESCE: Return first non-null value
COALESCE(column, 0)          -- Replace NULL with 0
COALESCE(col1, col2, 'N/A')  -- Fallback chain

-- NULLIF: Return NULL when values match (prevents division by zero)
NULLIF(denominator, 0)  -- Returns NULL if denominator = 0
```

## NULL in Aggregations

```sql
-- SUM, AVG, MIN, MAX all ignore NULL
-- COUNT(*) includes NULL rows
-- COUNT(column) ignores NULL

-- When NULLs represent "no activity" and you want 0:
SUM(COALESCE(amount, 0))

-- When NULLs are meaningful absences you want to count:
COUNT(*) - COUNT(amount) as null_count
```

## NULL-Safe Division (Always Use This)

```sql
-- Standard pattern:
numerator / NULLIF(denominator, 0)

-- With percentage:
ROUND(numerator * 100.0 / NULLIF(denominator, 0), 2) as pct

-- Result is NULL when denominator = 0
-- Handle in chart: show '—' or 'N/A' for NULL ratio cells
```

## Filtering — The Soft Delete Pattern

Many schemas use `deleted_at` timestamp for soft deletes:

```sql
-- ALWAYS add this filter when deleted_at column exists:
WHERE deleted_at IS NULL  -- Active records only

-- Unless user explicitly asks for deleted records:
WHERE deleted_at IS NOT NULL  -- Deleted records
-- Or all records (no filter on deleted_at)
```

**Detection:** If schema has `deleted_at`, `is_deleted`, `is_active`, `status` — always ask or apply appropriate filter.

## String NULL vs Empty String

Many databases treat NULL and '' differently:

```sql
-- Test for both null and empty:
WHERE column IS NULL OR column = ''
-- OR use COALESCE:
WHERE COALESCE(column, '') = ''

-- Normalize:
NULLIF(TRIM(column), '')  -- Convert empty/whitespace to NULL
```

## NULL in ORDER BY

```sql
-- NULLs sort FIRST by default in ASC (PostgreSQL)
-- NULLs sort LAST by default in ASC (MySQL, SQL Server)

-- Explicit control:
ORDER BY column ASC NULLS LAST   -- PostgreSQL
ORDER BY ISNULL(column, 1), column ASC  -- SQL Server

-- DuckDB / BigQuery:
ORDER BY column ASC NULLS LAST
```

## Surfacing NULL Prevalence to Users

When a query result has significant NULLs in key columns:

```
Threshold triggers:
> 5%: Add footnote in chart summary
> 20%: Surface as warning
> 50%: Surface as prominent warning, consider excluding column from primary chart
```

**Summary language:** "Note: [column] has [X]% missing values. [Aggregations / The chart] excludes these rows."

---

## Examples

**Input:** "What's the average order value?"
**Data:** Some orders have NULL amount (data entry errors)
**Correct SQL:**
```sql
SELECT ROUND(AVG(amount), 2) as avg_order_value,
       COUNT(*) as total_orders,
       COUNT(amount) as orders_with_amount,
       COUNT(*) - COUNT(amount) as orders_missing_amount
FROM orders;
```
**Summary note:** "Average excludes 47 orders with missing amounts (3.2% of total)."

**Input:** "Show active customers"
**Schema has:** `customers` table with `deleted_at` column
**Correct SQL:**
```sql
SELECT * FROM customers WHERE deleted_at IS NULL;
```

**Input:** "What's our refund rate?"
**Data:** `refund_amount` is NULL when no refund, 0 when explicitly $0 refund
**Correct SQL:**
```sql
SELECT 
  COUNT(CASE WHEN refund_amount IS NOT NULL THEN 1 END) as orders_refunded,
  COUNT(*) as total_orders,
  COUNT(CASE WHEN refund_amount IS NOT NULL THEN 1 END) * 100.0 / 
    NULLIF(COUNT(*), 0) as refund_rate_pct
FROM orders;
```
