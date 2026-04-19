---
name: self-repair-error-taxonomy
description: SQL error classification + targeted repair templates — fan-out, missing CAST, dialect mismatch, missing GROUP BY, null-unsafe agg, ambiguous column
priority: 2
tokens_budget: 1500
applies_to: sql-generation, error-recovery
---

# Self-Repair Error Taxonomy — AskDB AgentEngine

## When this loads

On any `run_sql` failure. Also retrieved proactively during the generation turn for complex queries (join depth ≥ 3) to pre-empt the most common classes.

## Error classes

Classify the failure into exactly one class before attempting repair. Classification drives repair template.

| Class | Detection signal | Example error text |
|---|---|---|
| `fan_out` | Post-exec row count > 10× source; aggregate shows inflated number | (runs; result wrong, detected by `data-quality-trust-scoring`) |
| `missing_cast` | Error contains `invalid input syntax for type`, `cannot cast` | "operator does not exist: text = integer" |
| `dialect_mismatch` | Error references a function/keyword not in active dialect | "function NVL does not exist" on PG |
| `missing_group_by` | Error contains `must appear in GROUP BY`, `not in aggregate` | "column 'c.name' must appear in GROUP BY" |
| `ambiguous_column` | Error contains `ambiguous reference` | "column reference 'id' is ambiguous" |
| `null_unsafe_aggregation` | Result contains `NaN` or division-by-zero error | "division by zero" |
| `nonexistent_column` | Error: `column does not exist` | "column 'rev' does not exist" |
| `nonexistent_table` | Error: `relation does not exist` | "relation 'Orders' does not exist" |
| `permission_denied` | Error: `permission denied`, `access denied` | "permission denied for table users" |
| `timeout` | Driver raises timeout before result | "canceling statement due to statement timeout" |
| `syntax_error` | `syntax error at or near`, sqlglot parse fail | "syntax error at or near ')'" |
| `unknown` | None of the above | anything |

## Repair templates

### `fan_out`
Rewrite with pre-aggregation CTE. If the draft was:
```sql
SELECT c.name, SUM(oi.qty)
FROM customers c JOIN orders o ON c.id=o.customer_id JOIN order_items oi ON o.id=oi.order_id
GROUP BY c.name
```
Repair to:
```sql
WITH order_totals AS (
  SELECT o.customer_id, SUM(oi.qty) AS total_qty
  FROM orders o JOIN order_items oi ON o.id=oi.order_id
  GROUP BY o.customer_id
)
SELECT c.name, ot.total_qty
FROM customers c JOIN order_totals ot ON c.id=ot.customer_id
```

### `missing_cast`
Wrap the mismatched operand in `CAST(x AS target_type)`. For PG-specific `::`, convert: `col::text` on PG, `CAST(col AS VARCHAR)` portable.

### `dialect_mismatch`
Look up the function in the active dialect skill (`dialects/dialect-<db>.md`). Common swaps:
- `NVL(x, y)` → `COALESCE(x, y)`
- `SUBSTR(x, start, len)` → `SUBSTRING(x FROM start FOR len)` on PG
- `NOW()` → `CURRENT_TIMESTAMP` (BigQuery doesn't support bare NOW())
- `DATE_SUB(d, INTERVAL 1 DAY)` → `d - INTERVAL '1 day'` on PG

### `missing_group_by`
Add every non-aggregated selected column to GROUP BY. On MySQL (ONLY_FULL_GROUP_BY=OFF) also add them defensively — code should be portable.

### `ambiguous_column`
Qualify the column with its table alias: `id` → `c.id` or `o.id`. Re-examine the draft for which side was intended.

### `null_unsafe_aggregation`
Wrap divisor in `NULLIF(denom, 0)`. Wrap numerator in `COALESCE(num, 0)` if SUM-based. Example:
```sql
SUM(revenue) / NULLIF(COUNT(*), 0)
```

### `nonexistent_column`
Consult the evidence packet's `candidate_columns`. Fuzzy-match the attempted name (Levenshtein ≤ 2) against actual columns. If unique match, swap. If no match, re-retrieve schema for this table and retry.

### `nonexistent_table`
Likely case sensitivity. For PG, wrap in double-quotes: `"Orders"`. For Snowflake unquoted identifier, ensure uppercase. Otherwise fuzzy-match and retry.

### `permission_denied`
Do NOT retry with escalated privileges. Surface to user: "I don't have access to `<table>`. Please ask your admin to grant SELECT."

### `timeout`
- First timeout: retry once with stricter LIMIT (halve it) + warn.
- Second timeout: offer sampled execution on Turbo Twin if available.
- Third timeout: give up, ask user to refine.

### `syntax_error`
Parse with sqlglot transpiler → emit canonical SQL in the current dialect. If transpiler also fails, surface error with line number to user and ask for clarification.

## Retry budget

`MAX_SQL_RETRIES = 3` (from `agent_engine.py`). After 3 failed repairs on the same turn, escalate to Sonnet fallback once. After that: surface error to user.

## Never-retry conditions

- `permission_denied`
- `content_filter`
- User cancelled
- Same error class + same repair already attempted (would loop)

## Telemetry

Every repair logs to `.data/audit/sql_repair.jsonl`:
```json
{"ts":"...","session_id":"...","question_hash":"...","error_class":"fan_out","repair_template":"pre_agg_cte","attempts":1,"final_outcome":"success"}
```
Aggregate by `error_class` weekly to identify which skills need strengthening.

## Self-consistency tie-in

If `skill-library-meta.md` triggered self-consistency (3 candidates), and 2 fail with `fan_out` while 1 passes: return the passing one and log that the fan-out skill needs reinforcement.

---

## Examples

**Input:** Draft SQL: `SELECT c.name, SUM(oi.quantity) FROM customers c JOIN orders o USING(customer_id) JOIN order_items oi USING(order_id) GROUP BY c.name`. Post-exec row-count check shows fan-out (4× expected).
**Output:** Class = `fan_out`. Rewrite with pre-aggregation CTE. Validated. Re-executed. Correct total returned. Log class = `fan_out`, repair = `pre_agg_cte`, outcome = `success`.

**Input:** Error: `function NVL does not exist` on PostgreSQL connection.
**Output:** Class = `dialect_mismatch`. Lookup: `NVL` → `COALESCE`. Swap globally in draft. Retry. Success.

**Input:** Error: `division by zero` in `conversion_rate = conversions / visits`.
**Output:** Class = `null_unsafe_aggregation`. Wrap denominator: `NULLIF(visits, 0)`. Retry. NULLs returned for zero-visit days — correct behavior. Summary notes: "Days with zero visits show null conversion rate."

**Input:** Error: `relation "Orders" does not exist` on PostgreSQL where table is `orders` (lowercase).
**Output:** Class = `nonexistent_table`. Schema cache shows `orders` exists. Case mismatch. Repair: lowercase + unquoted `orders`. Retry. Success.

**Input:** Timeout after 300 s on a 12-table join on BigQuery.
**Output:** Class = `timeout`. Halve LIMIT → 500, retry. Completes in 85 s with partial result. Summary notes sampled result.
