---
applies_to: sql-generation
description: Run these metadata queries immediately on connection. Cache results in
  TurboTier.
legacy: true
name: schema-profiling
priority: 3
tokens_budget: 1100
---

# Schema Profiling — AskDB AgentEngine

## What to Extract on First Connection

Run these metadata queries immediately on connection. Cache results in TurboTier.

### Table inventory
```sql
-- Standard (works on most engines)
SELECT table_name, table_type, table_rows
FROM information_schema.tables
WHERE table_schema = '{schema_name}'
ORDER BY table_rows DESC;
```

### Column inventory
```sql
SELECT table_name, column_name, data_type, 
       is_nullable, column_default, character_maximum_length
FROM information_schema.columns
WHERE table_schema = '{schema_name}'
ORDER BY table_name, ordinal_position;
```

### Explicit foreign keys
```sql
SELECT kcu.table_name, kcu.column_name,
       ccu.table_name AS foreign_table_name,
       ccu.column_name AS foreign_column_name
FROM information_schema.key_column_usage kcu
JOIN information_schema.referential_constraints rc
  ON kcu.constraint_name = rc.constraint_name
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = rc.unique_constraint_name;
```

## Inferring Implicit Foreign Keys (When Explicit FKs Missing)

Many real-world databases disable FK constraints for performance. Infer relationships by:

### Column name matching algorithm
```
For each column C in table A:
  If C ends in '_id' or '_key':
    candidate_table = C.replace('_id', '').replace('_key', '')
    If candidate_table exists in schema:
      If A.C.cardinality < candidate_table.primary_key.cardinality:
        Mark as PROBABLE FK (A.C → candidate_table.id)
      Else:
        Mark as POSSIBLE FK (needs value overlap check)
```

### Value overlap check (for ambiguous cases)
```sql
-- Check what % of values in A.customer_id exist in B.id
SELECT COUNT(DISTINCT a.customer_id) as in_a,
       COUNT(DISTINCT b.id) as in_b,
       COUNT(DISTINCT a.customer_id) * 100.0 / 
         NULLIF(COUNT(DISTINCT b.id), 0) as overlap_pct
FROM table_a a
LEFT JOIN table_b b ON a.customer_id = b.id
WHERE b.id IS NOT NULL;
-- > 90% overlap = CONFIDENT FK
-- 50-90% = PROBABLE FK (data quality issues)
-- < 50% = NOT a FK relationship
```

## Fact vs Dimension Table Detection

| Signal | Fact Table | Dimension Table |
|--------|-----------|-----------------|
| Row count | Very high (millions+) | Low-medium (thousands) |
| Numeric columns | Many (metrics, amounts) | Few |
| FK columns | Many (points to dims) | 1-2 (usually self-ref) |
| Date columns | Transactional dates | Effective/expiry dates |
| Name pattern | `orders`, `events`, `transactions`, `logs` | `customers`, `products`, `regions` |

## Cardinality Signals

- **Primary key candidate:** Column with 100% distinct values, non-null
- **Low cardinality (< 50 distinct):** Enum/category column — good for GROUP BY
- **High cardinality (> 10k distinct):** ID or free-text — don't GROUP BY directly
- **Binary/boolean columns:** Usually 2 distinct values — use for filters

## Naming Convention Patterns

| Pattern | Interpretation |
|---------|----------------|
| `created_at`, `created_date` | Timestamp of record creation |
| `updated_at` | Last modification timestamp |
| `deleted_at` | Soft delete timestamp — filter `IS NULL` for active records |
| `is_*`, `has_*` | Boolean flag |
| `*_id` | Foreign key or primary key |
| `*_count`, `*_total`, `*_sum` | Pre-aggregated — don't double-aggregate |
| `*_rate`, `*_pct`, `*_ratio` | Already a ratio — don't SUM |
| `amount`, `revenue`, `price` | Currency — use DECIMAL, never FLOAT |

## Pre-Aggregated Column Detection

**Critical:** Some columns are already aggregated. Double-aggregating produces wrong answers.

Signals a column may be pre-aggregated:
- Column name contains `_total`, `_sum`, `_count`, `_daily`, `_monthly`
- Table name contains `summary`, `aggregate`, `rollup`, `daily`, `monthly`
- Row count dramatically lower than transactional equivalent

**Action when detected:** Add note in query explanation: "Using pre-aggregated `daily_revenue` column — summing across days."

---

## Examples

**Schema has:** `orders` table with `customer_id` column, `customers` table with `id` column
**Inference:** `orders.customer_id → customers.id` (CONFIDENT FK — name match + cardinality check)

**Schema has:** `events` table with 50M rows, `sessions` table with 2M rows, `users` table with 100k rows
**Classification:** `events` = fact, `sessions` = fact, `users` = dimension

**Column:** `monthly_active_users` in `metrics_summary` table
**Detection:** Pre-aggregated. Do NOT `SUM(monthly_active_users)` across months unless intentional.
