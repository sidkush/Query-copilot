---
name: data-quality-trust-scoring
description: Rules for scoring result trust based on NULL rate, cardinality, outliers, coverage; when to flag or downgrade an answer
priority: 2
tokens_budget: 1300
applies_to: sql-generation, summary-generation, dashboard-build
---

# Data Quality & Trust Scoring — AskDB AgentEngine

## The trust score

Every result returned to the user carries an implicit trust score in `[0.0, 1.0]`. 1.0 = "as sure as the source data allows"; below 0.7 triggers a user-visible `⚠ data quality warning` in the NL summary.

## Signals that reduce trust

Deduct from 1.0 in this order; clip at 0.0.

| Signal | Threshold | Deduction |
|---|---|---|
| NULL rate in a measured column | > 10% | −0.10 |
| NULL rate in a measured column | > 30% | −0.25 |
| NULL rate in a filter/join column | > 1% | −0.15 |
| Row count < 30 (statistical thinness) | — | −0.10 |
| Row count < 5 | — | −0.40 |
| Outlier share (|z| > 4) | > 2% | −0.10 |
| Cardinality mismatch on join (fan-out detected post-exec, rows > 10× source) | — | −0.30 |
| Sample mode active (Turbo twin or `LIMIT X` applied implicitly) | — | −0.10 |
| Aggregation spans a known soft-delete (`deleted_at IS NOT NULL` rows not excluded) | — | −0.20 |
| Currency / unit mix detected (multiple currencies in SUM) | — | −0.30 |
| Timezone ambiguity (mix of UTC + local in filter) | — | −0.15 |

Multiple signals stack.

## User-visible warning thresholds

| Score | Surface |
|---|---|
| ≥ 0.85 | No warning |
| 0.70 – 0.84 | Footnote: "Note: <reason>" (single sentence) |
| 0.40 – 0.69 | Inline banner above chart: "⚠ Data quality reduced trust — <reasons>" |
| < 0.40 | **Refuse to chart.** Return only the table with a header explaining why. Ask user to confirm or adjust. |

## Detection patterns (agent-side)

### NULL-rate pre-check
Before generating SQL for an aggregation, inspect the target column's `null_ratio` in the cached schema profile (`.data/schema_cache/{conn_id}.json`). If > 30%, rewrite to wrap in `COALESCE` or add `WHERE col IS NOT NULL` and note it.

### Fan-out detection (post-exec)
After executing a join + aggregate, compare `result_rows` vs `MAX(source_table_rows)` from the schema profile. Ratio > 10 ⇒ fan-out. Re-run with pre-aggregation CTE.

### Cardinality check
Any join on a column where `distinct_ratio < 0.1` on either side AND neither is an FK is suspect. Warn in summary.

### Outlier flag
For SUM/AVG over > 100 rows, compute `STDDEV_POP` + flag rows with |z| > 4. Report count in summary if > 2%.

### Currency mix
If aggregating an `amount`-like column and the table has a sibling `currency` column, require `GROUP BY currency` or a single-currency `WHERE`.

## What NOT to trust-score

- Schema metadata queries (`SHOW TABLES`, `DESCRIBE`) — always 1.0.
- User-provided raw SQL (runs through validator but trust is user's responsibility — label `user_provided: true` in audit).
- Empty result on a filter query — not a quality problem, it's a valid answer; score 1.0.

## Interaction with PII masking

PII masking does not affect trust score. Masked rows are still counted — the numbers are truthful, only the labels are hidden.

## Cross-skill references

- `sql/null-handling.md` — rules for NULL-safe aggregation.
- `sql/join-intelligence.md` — fan-out detection algorithm.
- `visualization/insight-generation.md` — how warnings phrase in AI summaries.

---

## Examples

**Input:** User asks "What's our average order value?" on `orders` table where `amount` is 38% NULL.
**Output:** Trust score = 1.0 − 0.25 = 0.75. SQL uses `AVG(amount) FILTER (WHERE amount IS NOT NULL)`. Summary ends: "Note: 38% of orders have no amount recorded — this average covers the 62% with known values."

**Input:** Query joins `orders` (1M rows) to `order_items` (4M rows) and returns 14M rows when grouping by customer.
**Output:** Fan-out detected (14M > 10 × 4M false; but grouping collapsed to 8K customers which is fine). Rerun without fan-out check — actual issue was double-sum. Trust 0.70 = 1.0 − 0.30 (fan-out). Rewrite with pre-aggregation CTE: `SELECT c, SUM(amt) FROM (SELECT customer_id, SUM(item_amt) amt FROM order_items GROUP BY 1,2) ...`

**Input:** Query returns 3 rows (small store, early in quarter).
**Output:** Trust = 1.0 − 0.40 = 0.60. Banner shown: "⚠ Only 3 matching rows — trend is not statistically meaningful."

**Input:** SUM over `orders.amount` where orders contain USD, EUR, and GBP rows.
**Output:** Trust 0.70. Agent rewrites query with `GROUP BY currency` and returns three totals instead of a mixed sum. Summary names each currency total separately.
