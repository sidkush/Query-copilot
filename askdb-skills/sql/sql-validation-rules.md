---
applies_to: sql-generation
description: Every generated SQL passes through all 6 layers before execution. Layers
  run in sequence — first failure stops execution and triggers correction.
legacy: true
name: sql-validation-rules
priority: 3
tokens_budget: 1500
---

# SQL Validation Rules — AskDB AgentEngine

## The 6-Layer Validator

Every generated SQL passes through all 6 layers before execution. Layers run in sequence — first failure stops execution and triggers correction.

---

## Layer 1: Syntax Validation

**What it checks:**
- Balanced parentheses
- Valid SQL keywords in valid positions
- Proper string literal quoting (no unclosed quotes)
- Semicolon handling (no multiple statements in single execution)
- Comment stripping (no `--` or `/* */` injection)

**Auto-fix when possible:**
- Missing closing parenthesis → add it + warn
- Trailing comma in column list → remove it + warn

**Block when:**
- Multiple statements detected (`; SELECT`, `; DROP`, etc.)
- Any DDL detected (`CREATE`, `DROP`, `ALTER`, `TRUNCATE`)
- Any DML detected (`INSERT`, `UPDATE`, `DELETE`, `MERGE`)

**Message:** "I only run SELECT queries. [Statement type] is not allowed."

---

## Layer 2: Schema Existence

**What it checks:**
- All referenced table names exist in connected schema
- All referenced column names exist in their respective tables
- Aliased columns are valid (alias not reused as filter in same query level)
- CTE names don't conflict with existing table names

**Auto-fix when possible:**
- Case mismatch (table_Name vs table_name) → correct case + warn
- Common typos (oreder vs order) → suggest correction

**Block when:**
- Table does not exist → "Table '[name]' not found. Available tables: [list]. Did you mean [closest match]?"
- Column does not exist → "Column '[name]' not found in [table]. Available columns: [list]."

---

## Layer 3: Type Compatibility

**What it checks:**
- Comparison of compatible types (no VARCHAR = INT without cast)
- Aggregation function matches column type (no SUM on VARCHAR)
- Date arithmetic uses date-compatible columns
- Division produces expected numeric type
- LIKE/ILIKE only on string columns

**Auto-fix when possible:**
- Comparing string column to number literal → cast the literal: `WHERE id = CAST('123' AS INT)`
- String stored as date → wrap with date cast function

**Block when:**
- Incompatible types with no safe cast path
- SUM/AVG/etc. on non-numeric column

**Message:** "[Column] is type [type], which can't be used with [function]. [Suggestion]."

---

## Layer 4: Aggregation Correctness

**What it checks:**
- Every non-aggregated column in SELECT is in GROUP BY
- HAVING is used (not WHERE) for aggregate conditions
- Window functions have required ORDER BY when needed
- No COUNT(DISTINCT) as window function (not supported)
- No aggregate inside WHERE clause
- AVG of pre-aggregated columns (warn, don't block)

**Auto-fix when possible:**
- WHERE on aggregate → move to HAVING
- Missing column in GROUP BY → add it (if semantically correct)

**Warn (don't block) when:**
- AVG on column named `daily_*` or `monthly_*` (may be double-aggregating)
- COUNT(*) with DISTINCT in same query (possibly redundant)

**Block when:**
- Aggregate in WHERE clause (SQL error)
- GROUP BY without any aggregate in SELECT (warn strongly)

---

## Layer 5: Security Validation

**What it checks:**
- No INFORMATION_SCHEMA access in output queries (only for internal schema profiling)
- No system table access (pg_catalog, sys.tables, etc.) in user-facing queries
- No DROP/CREATE/ALTER/TRUNCATE (DDL)
- No INSERT/UPDATE/DELETE/MERGE (DML)
- No EXEC/EXECUTE/CALL of stored procedures
- No dynamic SQL construction (EXECUTE(string))
- No GRANT/REVOKE privilege statements
- PII column list → if selected directly, apply masking
- Tenant isolation → WHERE tenant_id filter present if required

**Block all DDL/DML unconditionally.** No exceptions.

**PII masking:**
If query selects PII columns directly → rewrite to aggregate or mask:
```sql
-- Original: SELECT email, name, amount FROM orders
-- Rewritten: SELECT '[masked]' as email, '[masked]' as name, amount FROM orders
-- Note in summary: "Contact columns masked per data policy."
```

---

## Layer 6: Performance Estimation

**What it checks:**
- Estimated row count for table scans (from schema stats)
- Missing WHERE clause on large tables (> 10M rows)
- Cartesian products (missing JOIN condition)
- Repeated correlated subqueries
- Extremely wide UNION ALL (> 10 parts)

**Warn (don't block) when:**
- Query will scan > 100M rows without partition filter
- No LIMIT on exploratory query > 1M rows

**Block when:**
- Cartesian product detected on tables > 1000 rows each
  ("This query will create a Cartesian product. Add a JOIN condition.")
- SELECT * on table > 100M rows without WHERE

**Offer optimization when:**
- Query can be routed to TurboTier instead of LiveTier
- LIMIT can be added without changing the answer
- Index hint can dramatically speed up query

---

## Validation Result Format

```python
ValidationResult(
    passed=True/False,
    layer_failed=None/"syntax"/"schema"/"types"/"aggregation"/"security"/"performance",
    auto_fixed=["description of fix 1", "description of fix 2"],
    warnings=["warning 1", "warning 2"],
    corrected_sql="...",  # If auto-fixed
    error_message="...",  # If blocked
    user_message="..."    # Human-readable explanation
)
```

---

## Examples

**Input SQL:**
```sql
SELECT customer_id, SUM(amount)
FROM orders
WHERE SUM(amount) > 10000
GROUP BY customer_id
```
**Layer 4 failure:** WHERE on aggregate
**Auto-fix:**
```sql
SELECT customer_id, SUM(amount)
FROM orders
GROUP BY customer_id
HAVING SUM(amount) > 10000
```
**User message:** "Moved aggregate filter from WHERE to HAVING (SQL requires this)."

**Input SQL:**
```sql
SELECT * FROM orders; DROP TABLE customers; --
```
**Layer 1 failure:** Multiple statements + DDL detected
**Block:** "Invalid input detected. Only SELECT queries are supported."

**Input SQL:**
```sql
SELECT name, email, SUM(amount) as total FROM orders JOIN customers ON orders.customer_id = customers.id GROUP BY name, email
```
**Layer 5:** PII detected (email column)
**Auto-rewrite:**
```sql
SELECT name, '[masked]' as email, SUM(amount) as total FROM orders JOIN customers ON orders.customer_id = customers.id GROUP BY name, email
```
**User message:** "Email masked per data policy. Use aggregate views for contact data."
