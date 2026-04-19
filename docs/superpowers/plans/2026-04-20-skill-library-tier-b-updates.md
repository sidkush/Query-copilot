# Skill Library Tier B Updates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update 15 existing `askdb-skills/` files with 2025-2026 research-derived rules from the 2026-04-19 audit — closing cross-dialect gotchas, join cardinality rules, time-intelligence edge cases, visualization standards, agent decomposition rules, and RAG architecture guidance.

**Architecture:** Pure content work — markdown edits only. Every file already has Plan 1 frontmatter. Each task uses Edit (old_string → new_string) operations; token budgets in frontmatter updated when actual count shifts > ±25% of current value. Plan 1's `backend/tests/test_skill_library_structure.py` suite re-runs after every task.

**Tech Stack:** Markdown, `python-frontmatter`, `tiktoken` (already installed from Plan 1 T0).

**Scope — what this plan covers vs defers:**
- ✅ **Tier B:** Updates to 15 existing skill files with research-derived rules (§3.1–§3.8 of research-context).
- ⛔ **Deferred to Plan 3:** Retrieval infra code (`skill_library.py`, `skill_router.py`), prompt injection in `agent_engine.py`, 4-breakpoint caching, correction queue, golden eval harness.

---

## Prerequisites

Before starting Task 1, confirm:

- [ ] You are in the `QueryCopilot V1/` working tree.
- [ ] `python -m pytest backend/tests/test_skill_library_structure.py -v` passes (Plan 1 complete).
- [ ] You have read `docs/superpowers/plans/2026-04-19-skill-library-research-context.md` §§3.1–3.8 and §6 (MUST NOT fabricate list).
- [ ] Skill library has **49 files** (37 original + 12 from Plan 1). MASTER_INDEX count may still lag — that is fixed in T16.

---

## File Structure

All modifications are to existing files. No new files created.

| Path | Change | Approx token delta |
|---|---|---|
| `askdb-skills/dialects/dialect-bigquery.md` | Add cross-dialect gotcha table; fix integer-division entry | +280 |
| `askdb-skills/dialects/dialect-snowflake-postgres-duckdb.md` | Add cross-dialect gotcha sections per dialect | +350 |
| `askdb-skills/dialects/dialect-mysql-sqlserver-redshift-databricks.md` | Add cross-dialect gotcha sections | +320 |
| `askdb-skills/sql/join-intelligence.md` | Add cardinality tagging, bridge-table detection, post-exec sanity | +320 |
| `askdb-skills/sql/time-intelligence.md` | Add DOW dialect table, leap-year clamp, week-start, date-dim | +380 |
| `askdb-skills/sql/aggregation-rules.md` | Add `COUNT(*) - COUNT(col)` NULL-count pattern | +60 |
| `askdb-skills/sql/null-handling.md` | Remove NULL-in-agg section; add cross-ref pointer | -160 |
| `askdb-skills/visualization/chart-selection.md` | 5-second rule, dual-axis ban, pie>5 correction, log-scale fix | +150 |
| `askdb-skills/visualization/dashboard-aesthetics.md` | 5-second correction, OkLCH, 12-col grid, F-pattern, 20-30% whitespace; receive theme palettes | +600 |
| `askdb-skills/visualization/color-system.md` | Add Viridis/Cividis CVD, OkLCH, 8% CVD; remove theme palette blocks | -600 |
| `askdb-skills/visualization/chart-formatting.md` | `Intl.NumberFormat` compact/en-IN, tabular-nums, annotation patterns | +280 |
| `askdb-skills/visualization/vizql-capabilities-progressive-disclosure.md` | Vega-Lite limitations table, server-side workarounds, canvas thresholds | +280 |
| `askdb-skills/agent/multi-step-planning.md` | Schema-link-first decomposition, self-consistency voting | +340 |
| `askdb-skills/agent/screenshot-interpretation.md` | No change (confirmed no §3.8 additions apply) | 0 |
| `askdb-skills/core/chromadb-retrieval-integration.md` | Fix embedding model name; add BM25+rerank, contextual retrieval, HyDE warning, parent-child chunking | +320, -150 |
| `askdb-skills/MASTER_INDEX.md` | Update version changelog entry + file count | +20 |

---

## Skill File Authoring Contract (Plan 1 — applies to all edits)

Every edited file must still conform to the contract from Plan 1:

1. Frontmatter: `name`, `description`, `priority`, `tokens_budget`, `applies_to` all present.
2. `name` matches filename stem.
3. `description` 20–160 chars.
4. `priority` ∈ {1, 2, 3}.
5. `tokens_budget` ∈ [300, 2500].
6. Actual tokens within `tokens_budget ± 25%`.
7. `## Examples` section with ≥ 3 examples.
8. No `TODO`, `TBD`, `FIXME`, `<fill`, `lorem ipsum`.

When an edit changes actual token count beyond the ±25% window of the current `tokens_budget`, update `tokens_budget` in frontmatter.

---

## Task 1: dialect-bigquery.md — Cross-Dialect Gotchas

**Files:**
- Modify: `askdb-skills/dialects/dialect-bigquery.md`

### Context

The file covers BigQuery-specific syntax well but is missing 6 of the 12 dialect gotchas from research-context §3.5. Additionally, the existing "Common BigQuery Gotchas" table has a factual error: it says integer division "Returns INT (3/4 = 0)" but §3.5 rule 11 states BigQuery returns FLOAT. (PG/Snowflake truncate; BigQuery does not.)

- [ ] **Step 1: Fix integer division error in existing gotchas table**

```
File: askdb-skills/dialects/dialect-bigquery.md

old_string:
| Integer division | Returns INT (3/4 = 0) | Cast: `SAFE_DIVIDE(3, 4)` |

new_string:
| Integer division | Returns **FLOAT** (3/4 = 0.75) — unlike PG/Snowflake | Use `SAFE_DIVIDE(n, d)` for zero safety; no cast needed for basic division (from research-context §3.5 rule 11) |
```

- [ ] **Step 2: Add Cross-Dialect Gotchas section before `## Examples`**

```
File: askdb-skills/dialects/dialect-bigquery.md

old_string:
---

## Examples

new_string:
## Cross-Dialect Gotchas — BigQuery (research-context §3.5)

| Gotcha # | Rule | BigQuery behaviour | Other dialects differ? |
|----------|------|--------------------|----------------------|
| §3.5 rule 1 | Date truncation arg order | `DATE_TRUNC(col, MONTH)` — col first, unit unquoted | PG/Snowflake: `DATE_TRUNC('month', col)` — unit first, quoted |
| §3.5 rule 5 | String concat | `CONCAT` only — `\|\|` raises syntax error | PG/Snowflake allow `\|\|`; MySQL `\|\|` is OR |
| §3.5 rule 6 | Quoted identifiers | Backtick `` ` `` | PG/Snowflake use `"double quotes"` |
| §3.5 rule 8 | GROUP BY strictness | Every non-aggregated SELECT column must appear in GROUP BY | MySQL with `ONLY_FULL_GROUP_BY` OFF is lenient (dangerous) |
| §3.5 rule 9 | Window NULL handling | `IGNORE NULLS` / `RESPECT NULLS` on `LAG`, `LEAD`, `FIRST_VALUE` supported | PG < 16 does not support; PG 16+ yes |
| §3.5 rule 10 | Day-of-week (DOW) | `EXTRACT(DAYOFWEEK FROM d)` returns **1 = Sunday** | PG `EXTRACT(dow)` 0 = Sunday; Snowflake `DAYOFWEEK` 0 = Sun by default |
| §3.5 rule 3 | Timezone | TIMESTAMP is always UTC; no TIMESTAMPTZ split | PG has both TIMESTAMP and TIMESTAMPTZ |
| §3.5 rule 4 | NULL coalesce | No `NVL` — always use `COALESCE` | `NVL` works in Oracle and Snowflake only |

---

## Examples

```

- [ ] **Step 3: Update `tokens_budget` in frontmatter from 1200 → 1500**

```
File: askdb-skills/dialects/dialect-bigquery.md

old_string:
tokens_budget: 1200

new_string:
tokens_budget: 1500
```

- [ ] **Step 4: Run structure validator**

```bash
cd "QueryCopilot V1/backend"
python -m pytest tests/test_skill_library_structure.py -k "dialect-bigquery" -v
```

Expected: PASS. Actual tokens ~1480 within window [1125, 1875].

- [ ] **Step 5: Commit**

```bash
cd "QueryCopilot V1"
git add askdb-skills/dialects/dialect-bigquery.md
git commit -m "feat(skills): add cross-dialect gotchas to dialect-bigquery (Plan 2 T1)"
```

---

## Task 2: dialect-snowflake-postgres-duckdb.md — Cross-Dialect Gotchas

**Files:**
- Modify: `askdb-skills/dialects/dialect-snowflake-postgres-duckdb.md`

### Context

Three dialects in one file. Add dialect-specific gotchas from §3.5 not yet covered: NVL portability, `||` concat semantics, case-sensitivity details, GROUP BY strictness, IGNORE NULLS, DOW differences. Each dialect gets its own subsection to keep them distinct (per research-context §2.2 — 40% overlap already exists between dialect files, so we deduplicate by scoping bullets to each dialect).

- [ ] **Step 1: Add Snowflake gotchas after existing "Common Gotchas" list in Snowflake section**

```
File: askdb-skills/dialects/dialect-snowflake-postgres-duckdb.md

old_string:
### Common Gotchas
- String literals: Use single quotes only
- Column names: Case-insensitive by default (stored uppercase)
- Semicolons: Required to separate statements
- LIMIT: Use LIMIT not TOP
- Division: Returns FLOAT (no integer division issue)

---

# PostgreSQL SQL Dialect

new_string:
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

# PostgreSQL SQL Dialect

```

- [ ] **Step 2: Add PostgreSQL gotchas after PG "Common Gotchas" list**

```
File: askdb-skills/dialects/dialect-snowflake-postgres-duckdb.md

old_string:
### Common Gotchas
- NULL sorting: NULLS FIRST by default in ASC (add NULLS LAST explicitly)
- Integer division: 3/4 = 0. Cast: `3.0/4` or `CAST(3 AS FLOAT)/4`
- ILIKE: PostgreSQL only — not in MySQL or SQL Server
- Arrays: PostgreSQL supports array types natively
- CTEs: Materialized by default in older versions (use MATERIALIZED/NOT MATERIALIZED hint)

---

# DuckDB SQL Dialect

new_string:
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

# DuckDB SQL Dialect

```

- [ ] **Step 3: Add DuckDB gotchas after existing "Common Gotchas" list**

```
File: askdb-skills/dialects/dialect-snowflake-postgres-duckdb.md

old_string:
### Common Gotchas
- DuckDB is largely PostgreSQL-compatible
- Use `//` for integer division (not `/`)
- `STRUCT` access: `struct_col.field_name`
- List indexing: 1-based (like SQL, not 0-based like Python)
- `CURRENT_TIMESTAMP` returns microsecond precision

new_string:
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
```

- [ ] **Step 4: Update `tokens_budget` from 1800 → 2200**

```
old_string:
tokens_budget: 1800

new_string:
tokens_budget: 2200
```

- [ ] **Step 5: Run structure validator**

```bash
python -m pytest tests/test_skill_library_structure.py -k "snowflake-postgres-duckdb" -v
```

Expected: PASS. Actual tokens ~2150 within window [1650, 2750] — note max cap is 2500; if actual > 2500, trim one gotcha table to one-liners.

- [ ] **Step 6: Commit**

```bash
git add askdb-skills/dialects/dialect-snowflake-postgres-duckdb.md
git commit -m "feat(skills): add cross-dialect gotchas to dialect-snowflake-postgres-duckdb (Plan 2 T2)"
```

---

## Task 3: dialect-mysql-sqlserver-redshift-databricks.md — Cross-Dialect Gotchas

**Files:**
- Modify: `askdb-skills/dialects/dialect-mysql-sqlserver-redshift-databricks.md`

### Context

Missing: MySQL `||`=OR trap, GROUP BY leniency hazard, DOW indexing, SQL Server `+` concat. These are the cross-dialect rules most likely to cause silent bugs when users move between dialects.

- [ ] **Step 1: Add MySQL cross-dialect gotchas after MySQL "Common Gotchas"**

```
File: askdb-skills/dialects/dialect-mysql-sqlserver-redshift-databricks.md

old_string:
### Common Gotchas
- Integer division: `3/4 = 0.75` (MySQL returns float — no problem)
- NULL in aggregations: Same as standard SQL
- Window functions: Available in MySQL 8.0+ only — check version
- ILIKE: Not supported — use LIKE (case-insensitive by default)
- Backtick identifiers: Use backticks for reserved words `` `order` ``, `` `date` ``
- Strict mode: May reject invalid dates, division by zero if enabled
- JSON: Supported in MySQL 5.7+

---

# SQL Server (T-SQL) Dialect

new_string:
### Common Gotchas
- Integer division: `3/4 = 0.75` (MySQL returns float — no problem)
- NULL in aggregations: Same as standard SQL
- Window functions: Available in MySQL 8.0+ only — check version
- ILIKE: Not supported — use LIKE (case-insensitive by default)
- Backtick identifiers: Use backticks for reserved words `` `order` ``, `` `date` ``
- Strict mode: May reject invalid dates, division by zero if enabled
- JSON: Supported in MySQL 5.7+

### Cross-Dialect Gotchas — MySQL (research-context §3.5)

| Gotcha | MySQL rule |
|--------|-----------|
| §3.5 rule 5 | `\|\|` is **logical OR**, not string concat — always use `CONCAT(a, b)` |
| §3.5 rule 8 | With `ONLY_FULL_GROUP_BY` OFF (non-default in MySQL 5.x), LLM-generated SQL may select non-grouped columns — result is non-deterministic and non-portable |
| §3.5 rule 9 | `IGNORE NULLS` on `LAG`/`LEAD` **not supported** — wrap in CASE/subquery |
| §3.5 rule 10 | `DAYOFWEEK(d)` returns 1 = Sunday, 2 = Monday … 7 = Saturday |
| §3.5 rule 12 | `LIMIT` supported (not `TOP`) |

---

# SQL Server (T-SQL) Dialect

```

- [ ] **Step 2: Add SQL Server cross-dialect gotchas after T-SQL "Common Gotchas"**

```
File: askdb-skills/dialects/dialect-mysql-sqlserver-redshift-databricks.md

old_string:
### Common Gotchas
- Integer division: `3/4 = 0` — cast: `CAST(3 AS FLOAT)/4` or `3.0/4`
- NULL sorting: NULLS sort FIRST in ASC — use `ORDER BY ISNULL(col, 1), col`
- Date literals: Use unambiguous format: `'2024-01-15'` (ISO 8601)
- NOLOCK hint: `WITH (NOLOCK)` — tempting for speed but can read dirty data. Avoid.

---

# Redshift SQL Dialect

new_string:
### Common Gotchas
- Integer division: `3/4 = 0` — cast: `CAST(3 AS FLOAT)/4` or `3.0/4`
- NULL sorting: NULLS sort FIRST in ASC — use `ORDER BY ISNULL(col, 1), col`
- Date literals: Use unambiguous format: `'2024-01-15'` (ISO 8601)
- NOLOCK hint: `WITH (NOLOCK)` — tempting for speed but can read dirty data. Avoid.

### Cross-Dialect Gotchas — SQL Server / T-SQL (research-context §3.5)

| Gotcha | T-SQL rule |
|--------|-----------|
| §3.5 rule 5 | `+` for string concat in older T-SQL; `CONCAT()` available SQL Server 2012+ and preferred |
| §3.5 rule 6 | Square brackets `[order]` for reserved-word identifiers (not backtick or `"`) |
| §3.5 rule 7 | No `QUALIFY` — wrap window function in CTE or subquery to filter on window result |
| §3.5 rule 12 | `TOP N` / `FETCH NEXT N ROWS ONLY` — no bare `LIMIT` |
| §3.5 rule 9 | `IGNORE NULLS` not supported on `LAG`/`LEAD` in T-SQL |

---

# Redshift SQL Dialect

```

- [ ] **Step 3: Update `tokens_budget` from 1700 → 2100**

```
old_string:
tokens_budget: 1700

new_string:
tokens_budget: 2100
```

- [ ] **Step 4: Run structure validator**

```bash
python -m pytest tests/test_skill_library_structure.py -k "mysql-sqlserver-redshift-databricks" -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add askdb-skills/dialects/dialect-mysql-sqlserver-redshift-databricks.md
git commit -m "feat(skills): add cross-dialect gotchas to dialect-mysql-sqlserver-redshift-databricks (Plan 2 T3)"
```

---

## Task 4: join-intelligence.md — Cardinality Tagging + Bridge Detection + Post-Exec Sanity

**Files:**
- Modify: `askdb-skills/sql/join-intelligence.md`

### Context

Research-context §3.6 rules 4, 5, 8 are entirely absent from the current file. Adding: cardinality tagging for FK relationships (1:1/1:N/N:M), bridge-table detection heuristic, and post-execution row-count fan-out check.

- [ ] **Step 1: Add three new sections before `## Examples`**

```
File: askdb-skills/sql/join-intelligence.md

old_string:
---

## Examples

new_string:
## Cardinality Tagging (research-context §3.6 rule 8)

Tag every FK relationship before generating JOIN SQL:

| Tag | Definition | Detection heuristic |
|-----|------------|-------------------|
| 1:1 | Each left row matches ≤ 1 right row | FK column has UNIQUE constraint on the FK side |
| 1:N | One left row maps to many right rows | Standard FK (most dimension → fact relationships) |
| N:M | Many-to-many | Junction table with 2+ FK columns and no standalone PK measures |

**Rule:** Never `SUM` across a N:M join without pre-aggregating one side first (§3.6 rule 1). Fact-to-fact direct joins are always N:M unless filtered to 1 row.

```sql
-- Cardinality check before aggregating:
SELECT COUNT(*) as rows, COUNT(DISTINCT a.id) as unique_ids
FROM table_a a JOIN table_b b ON a.id = b.a_id;
-- If rows >> unique_ids → N:M → pre-aggregate b before joining
```

## Bridge-Table Detection (research-context §3.6 rule 4)

A bridge table (junction table) has exactly 2 FK columns pointing to different parent tables and no aggregate-measure columns of its own.

Examples: `order_items(order_id, product_id, quantity)`, `user_roles(user_id, role_id)`, `course_enrollments(student_id, course_id, enrolled_at)`.

**Rule:** When a bridge table exists between two entities, **always route through it** — never join the two parent tables directly.

```sql
-- WRONG: direct join creates Cartesian fan-out
SELECT p.name, o.order_id
FROM products p JOIN orders o ON p.id = o.product_id;

-- CORRECT: through the bridge table
SELECT p.name, o.order_id, oi.quantity
FROM products p
JOIN order_items oi ON p.id = oi.product_id
JOIN orders o ON oi.order_id = o.id;
```

## Post-Execution Row-Count Sanity (research-context §3.6 rule 5)

After `run_sql` returns results, compare result rows to expected source grain:

```python
# Pseudo-logic in agent post-execution check
if result_row_count > expected_source_rows * 10:
    emit_warning(
        f"⚠ Fan-out detected: result has {result_row_count} rows "
        f"vs source grain ~{expected_source_rows}. "
        "Possible missing GROUP BY or N:M join without pre-aggregation. "
        "Verify aggregation logic before presenting this data."
    )
```

Surface to user as: `"⚠ Result ({N} rows) is {X}× larger than the source table ({M} rows) — possible fan-out from a many-to-many join. Check aggregation logic."`

---

## Examples

```

- [ ] **Step 2: Update `tokens_budget` from 1100 → 1500**

```
old_string:
tokens_budget: 1100

new_string:
tokens_budget: 1500
```

- [ ] **Step 3: Run structure validator**

```bash
python -m pytest tests/test_skill_library_structure.py -k "join-intelligence" -v
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add askdb-skills/sql/join-intelligence.md
git commit -m "feat(skills): add cardinality tagging bridge detection post-exec sanity to join-intelligence (Plan 2 T4)"
```

---

## Task 5: time-intelligence.md — DOW Dialects + Leap-Year Clamp + Week-Start + Date-Dim

**Files:**
- Modify: `askdb-skills/sql/time-intelligence.md`

### Context

Four additions from research-context §3.5 rule 10 and §3.7 rules 2, 8, 10:
- DOW values differ per dialect (silent bug source)
- PYTD Feb 29 clamp for leap years
- `DATE_TRUNC('week')` is ISO Monday-start — US-style needs explicit offset
- Date-dimension table preferred over inline math when available

- [ ] **Step 1: Add DOW Dialect Differences section before `## Examples`**

```
File: askdb-skills/sql/time-intelligence.md

old_string:
---

## Examples

new_string:
## Day-of-Week Dialect Differences (research-context §3.5 rule 10)

Never hardcode DOW integers — they differ across dialects:

| Dialect | Expression | Returns | Sunday = ? |
|---------|-----------|---------|-----------|
| PostgreSQL | `EXTRACT(dow FROM d)` | int | 0 |
| BigQuery | `EXTRACT(DAYOFWEEK FROM d)` | int | 1 |
| Snowflake | `DAYOFWEEK(d)` | int | 0 (default; configurable via `WEEK_START`) |
| MySQL | `DAYOFWEEK(d)` | int | 1 |
| DuckDB | `EXTRACT(dayofweek FROM d)` | int | 0 |

**Safe pattern:** Use dialect's `DAYNAME`/`FORMAT_DATE` to return a day string instead of an integer:

```sql
-- PG / DuckDB
TO_CHAR(d, 'Day')
-- BigQuery
FORMAT_DATE('%A', d)
-- MySQL / Snowflake
DAYNAME(d)
```

## Leap-Year Feb 29 Clamp (research-context §3.7 rule 2)

When computing PYTD (Prior Year to Date) from a date that falls in a leap year:

```sql
-- Safe PYTD that clamps Feb 29 → Feb 28 on non-leap prior years (PostgreSQL)
WHERE date_col
  BETWEEN DATE_TRUNC('year', CURRENT_DATE - INTERVAL '1 year')
      AND LEAST(
            CURRENT_DATE - INTERVAL '1 year',
            DATE_TRUNC('year', CURRENT_DATE) - INTERVAL '1 day'
          )
```

**Rule:** If the anchor date is Feb 29 and the prior year is not a leap year, the PYTD end date becomes Feb 28 of the prior year.

## Week-Start Convention (research-context §3.7 rule 10)

`DATE_TRUNC('week', d)` returns **Monday** in PostgreSQL, DuckDB, Snowflake, BigQuery — this is ISO 8601.

US convention uses **Sunday** as week start:

```sql
-- US Sunday-start week (PostgreSQL)
DATE_TRUNC('week', d + INTERVAL '1 day') - INTERVAL '1 day'

-- BigQuery Sunday-start
DATE_TRUNC(d, WEEK(SUNDAY))

-- Snowflake with session param
ALTER SESSION SET WEEK_START = 0;  -- 0 = Sunday
DATE_TRUNC('WEEK', d)
```

**Rule:** Always clarify week-start convention when user asks for "weekly" data without specifying.

## Date-Dimension Table Preference (research-context §3.7 rule 8)

When schema contains `dim_date`, `date_dim`, `calendar`, or `fiscal_calendar`, **join to it instead of computing inline**:

```sql
-- Preferred when dim_date exists:
SELECT dd.fiscal_year, dd.fiscal_quarter, SUM(o.amount)
FROM orders o
JOIN dim_date dd ON o.order_date = dd.date
GROUP BY dd.fiscal_year, dd.fiscal_quarter
ORDER BY dd.fiscal_year, dd.fiscal_quarter;
-- Avoids: hardcoding fiscal offsets in every query
```

**Detection heuristic:** Schema table named `dim_date`, `date_dim`, `calendar`, `fiscal_cal*`, or with columns `fiscal_year`, `fiscal_quarter`, `is_holiday`.

---

## Examples

```

- [ ] **Step 2: Update `tokens_budget` from 1500 → 2000**

```
old_string:
tokens_budget: 1500

new_string:
tokens_budget: 2000
```

- [ ] **Step 3: Run structure validator**

```bash
python -m pytest tests/test_skill_library_structure.py -k "time-intelligence" -v
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add askdb-skills/sql/time-intelligence.md
git commit -m "feat(skills): add DOW dialects leap-year clamp week-start date-dim to time-intelligence (Plan 2 T5)"
```

---

## Task 6: aggregation-rules.md — Absorb NULL Count Pattern

**Files:**
- Modify: `askdb-skills/sql/aggregation-rules.md`

### Context

The `null-handling.md` file has a "NULL in Aggregations" section (to be removed in T7). The one pattern that `null-handling.md` has and `aggregation-rules.md` does not is `COUNT(*) - COUNT(col)` for explicitly counting NULLs. Add this to make `aggregation-rules.md` the single canonical source.

- [ ] **Step 1: Add NULL-count pattern to existing NULL in Aggregations section**

```
File: askdb-skills/sql/aggregation-rules.md

old_string:
**When NULLs are significant:** If >10% of values are NULL in a key metric, add note: "Result excludes [X]% null values in [column]."

**When NULLs should be zero:** Use `COALESCE(column, 0)` before aggregating when nulls represent "no activity" (e.g., 0 sales days).

new_string:
**When NULLs are significant:** If >10% of values are NULL in a key metric, add note: "Result excludes [X]% null values in [column]."

**When NULLs should be zero:** Use `COALESCE(column, 0)` before aggregating when nulls represent "no activity" (e.g., 0 sales days).

**Counting NULLs explicitly** (data quality check; research-context §3.2 audit pattern):
```sql
SELECT
  COUNT(*)                         AS total_rows,
  COUNT(amount)                    AS rows_with_amount,
  COUNT(*) - COUNT(amount)         AS missing_amount_count,
  ROUND(
    (COUNT(*) - COUNT(amount)) * 100.0 / NULLIF(COUNT(*), 0), 1
  )                                AS missing_pct
FROM orders;
```
```

- [ ] **Step 2: Run structure validator (tokens_budget 1400 unchanged — delta is small)**

```bash
python -m pytest tests/test_skill_library_structure.py -k "aggregation-rules" -v
```

Expected: PASS. If actual tokens > 1750 (125% of 1400), update `tokens_budget` to 1600.

- [ ] **Step 3: Commit**

```bash
git add askdb-skills/sql/aggregation-rules.md
git commit -m "feat(skills): absorb NULL-count pattern into aggregation-rules (Plan 2 T6)"
```

---

## Task 7: null-handling.md — Remove Redundant Aggregation Section

**Files:**
- Modify: `askdb-skills/sql/null-handling.md`

### Context

After T6, `aggregation-rules.md` is the canonical source for NULL aggregation behavior. Remove the duplicate section from `null-handling.md` and replace with a cross-reference pointer. Update `tokens_budget` accordingly.

- [ ] **Step 1: Replace "## NULL in Aggregations" section with cross-reference**

```
File: askdb-skills/sql/null-handling.md

old_string:
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

new_string:
## NULL in Aggregations

See **`aggregation-rules.md` §NULL in Aggregations** for canonical rules (SUM/AVG/COUNT behavior, COALESCE patterns, NULL-count query). This section intentionally omits that content to avoid duplication (research-context §2.2 redundancy cleanup).

```

- [ ] **Step 2: Update `tokens_budget` from 1100 → 900**

```
old_string:
tokens_budget: 1100

new_string:
tokens_budget: 900
```

- [ ] **Step 3: Run structure validator**

```bash
python -m pytest tests/test_skill_library_structure.py -k "null-handling" -v
```

Expected: PASS (file still has 3 examples, frontmatter intact, ≥300 tokens).

- [ ] **Step 4: Commit**

```bash
git add askdb-skills/sql/null-handling.md
git commit -m "feat(skills): remove redundant NULL-agg section from null-handling trim to semantics-only (Plan 2 T7)"
```

---

## Task 8: chart-selection.md — 5-Second Rule, Dual-Axis Ban, Pie >5 Fix, Log-Scale Correction

**Files:**
- Modify: `askdb-skills/visualization/chart-selection.md`

### Context

Four changes from research-context §3.8:
1. **5-second rule** (not 10) — NN/g standard is 5 seconds, not 10. dashboard-aesthetics.md currently says "10 seconds" — that gets corrected in T9.
2. **Dual-axis banned** — NN/g says ban it outright; current file allows it "when units differ."
3. **Pie >5 slices banned** — current file says ">6"; research-context §3.8 rule 6 says ">5".
4. **Log scale at >2 orders** — current file says "3+"; §3.8 rule 8 says ">2".

- [ ] **Step 1: Add 5-Second Rule section before `## Hard Rules`**

```
File: askdb-skills/visualization/chart-selection.md

old_string:
## Hard Rules

### Never use these chart types for these data shapes:

new_string:
## 5-Second Rule (research-context §3.8 layout rule 3)

The primary insight of a chart must be graspable within **5 seconds** (NN/g standard). If a viewer needs > 5 seconds to extract the key message:
- Add a direct annotation on the chart (not a footnote)
- Simplify to fewer series
- Split into small multiples
- Change the title to state the insight explicitly

**Test:** Cover the chart title. Can you state the insight from the visual alone in under 5 seconds?

## Hard Rules

### Never use these chart types for these data shapes:

```

- [ ] **Step 2: Fix pie-slice threshold from >6 to >5**

```
File: askdb-skills/visualization/chart-selection.md

old_string:
- **Pie chart with > 6 slices** — segments become unreadable below ~5%

new_string:
- **Pie chart with > 5 slices** — segments become unreadable below ~5% (research-context §3.8 rule 6; EU Data Viz Guide; Practical Reporting)
```

- [ ] **Step 3: Ban dual-axis in Hard Rules**

```
File: askdb-skills/visualization/chart-selection.md

old_string:
- **Dual Y-axis** — use only when units genuinely differ (e.g., revenue in $ and volume in units)

new_string:
- **Dual Y-axis (any chart)** — **BANNED** (NN/g guideline; research-context §3.8 rule 12). Use small multiples (two stacked single-axis charts) instead. Dual-axis implies false correlation between unrelated scales.
```

- [ ] **Step 4: Update decision tree to remove dual-axis option**

```
File: askdb-skills/visualization/chart-selection.md

old_string:
│   ├── Correlation over time        → Dual-axis line chart

new_string:
│   ├── Correlation over time        → Small multiples (2 stacked single-axis charts; dual-axis banned per NN/g)
```

- [ ] **Step 5: Fix log-scale and remove "When to use dual Y-axis" section**

```
File: askdb-skills/visualization/chart-selection.md

old_string:
### When to use logarithmic scale:
- Data spans multiple orders of magnitude (1 to 1,000,000)
- Showing growth rates that compound (revenue doubling each year)
- Never for data that contains 0 or negative values

### When to use dual Y-axis:
- Two metrics with genuinely different units (revenue $ vs order count)
- Make the relationship explicit, not just coincidental
- Label both axes clearly

new_string:
### When to use logarithmic scale (research-context §3.8 rule 8):
- Data spans **> 2 orders of magnitude** (e.g., values from 100 to 100,000+)
- Showing compounding growth rates
- Never for data containing 0 or negative values

### Dual Y-axis: BANNED (research-context §3.8 rule 12)
NN/g guideline: dual-axis misleads readers by implying false correlation between the two scales. Use **small multiples** — two separate single-axis charts stacked — for mixed-scale comparisons.
```

- [ ] **Step 6: Update `tokens_budget` from 1400 → 1600**

```
old_string:
tokens_budget: 1400

new_string:
tokens_budget: 1600
```

- [ ] **Step 7: Run structure validator**

```bash
python -m pytest tests/test_skill_library_structure.py -k "chart-selection" -v
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add askdb-skills/visualization/chart-selection.md
git commit -m "feat(skills): add 5s rule ban dual-axis fix pie>5 log-scale to chart-selection (Plan 2 T8)"
```

---

## Task 9: dashboard-aesthetics.md — 5-Second Correction, OkLCH, 12-Col Grid, F-Pattern, Whitespace + Theme Palettes (received from T10)

**Files:**
- Modify: `askdb-skills/visualization/dashboard-aesthetics.md`

### Context

Five changes from research-context §3.8 layout rules 1-5 and color rule 4:
1. **5-second rule** — fix from "10-second" to "5-second" (NN/g).
2. **12-column grid + 16-24 px gutters** — §3.8 layout rule 2.
3. **F-pattern reading** — §3.8 layout rule 1.
4. **Whitespace 20-30%** — §3.8 layout rule 5.
5. **OkLCH 2024-2026 standard** — §3.8 color rule 4.

Plus: receive the four theme palette CSS blocks moved from `color-system.md` (T10). This raises tokens significantly; `tokens_budget` moves from 1400 → 2400.

- [ ] **Step 1: Fix 10-second → 5-second rule**

```
File: askdb-skills/visualization/dashboard-aesthetics.md

old_string:
## The 10-Second Rule

A well-designed dashboard communicates its most important insight to a non-technical user within 10 seconds of viewing. If a user needs to read axis labels or count bars to understand the key message, the dashboard has failed.

**Test before finalizing:** "If I showed this to a VP for 10 seconds, what would they remember?" That thing should be the largest, most prominent element.

new_string:
## The 5-Second Rule (research-context §3.8 layout rule 3)

A well-designed dashboard communicates its most important insight to a non-technical user within **5 seconds** of viewing (NN/g standard — not 10). If a user needs to read axis labels or count bars to understand the key message, the dashboard has failed.

**Test before finalizing:** "If I showed this to a VP for 5 seconds, what would they remember?" That thing should be the largest, most prominent element.
```

- [ ] **Step 2: Add grid + F-pattern + whitespace section after existing "## Layout Hierarchy" section**

```
File: askdb-skills/visualization/dashboard-aesthetics.md

old_string:
**Exception:** LiveOps theme uses channel-based layout instead of KPI → chart hierarchy.

## Color Rules

new_string:
**Exception:** LiveOps theme uses channel-based layout instead of KPI → chart hierarchy.

## Grid System and Spatial Rules (research-context §3.8 layout rules 1-2, 5)

**F-pattern reading (layout rule 1):** Users scan dashboards in an F-shape: first left-to-right on row 1, then left-to-right on row 2, then down the left edge. Place the most critical metric in the **top-left** tile.

**12-column grid (layout rule 2):** Tile widths snap to 3, 6, 9, or 12 columns. Gutters: 16–24 px between tiles. Never let tiles touch edge-to-edge.

| Tile type | Recommended width | Notes |
|-----------|------------------|-------|
| KPI / BAN | 3 columns (25%) | 4 per row = standard row 1 |
| Primary insight chart | 9–12 columns | Full or 3/4 width |
| Supporting breakdown | 6 columns | Side-by-side pairs |
| Detail table | 12 columns | Always full width |

**Whitespace ratio (layout rule 5):** 20-30% of canvas area should be empty space. Dashboards that use < 20% whitespace are perceptually cluttered; > 40% feel incomplete.

## Color Rules

```

- [ ] **Step 3: Add OkLCH note to Color Rules section**

```
File: askdb-skills/visualization/dashboard-aesthetics.md

old_string:
### Colorblind safety rules
- Never use red + green as the only distinction (affects 8% of men)
- Pair color with secondary encoding: shape, pattern, or label
- Red/green pair for performance: always add ↑↓ arrows too

new_string:
### Colorblind safety rules
- Never use red + green as the only distinction (affects ~8% of men with red-green CVD / deuteranopia)
- Pair color with secondary encoding: shape, pattern, or label
- Red/green pair for performance: always add ↑↓ arrows too

### OkLCH for custom color ramps (research-context §3.8 color rule 4)

When generating custom palettes (not the four built-in themes), use the **OkLCH** color space (2024-2026 CSS standard) for perceptually uniform steps:

```css
/* OkLCH: oklch(lightness chroma hue) — perceptually equal spacing */
/* Sequential ramp example (blue, 5 steps) */
--step-1: oklch(0.95 0.03 250)   /* light */
--step-2: oklch(0.80 0.08 250)
--step-3: oklch(0.65 0.14 250)
--step-4: oklch(0.50 0.18 250)
--step-5: oklch(0.35 0.20 250)   /* dark */
```

OkLCH guarantees equal perceptual brightness steps unlike HSL (which produces uneven brightness across hues). Prefer over HSL for accessibility.
```

- [ ] **Step 4: Append theme palette CSS blocks (moved from color-system.md in T10)**

Append this new section after the final `## Dashboard Theme Application` section and before `---\n\n## Examples`:

```
File: askdb-skills/visualization/dashboard-aesthetics.md

old_string:
### Briefing theme
- Warm paper-like aesthetic
- Editorial layout, chapter-based scrolling
- AI-generated narrative prominent
- Best for: Reports to stakeholders who don't use BI daily

---

## Examples

new_string:
### Briefing theme
- Warm paper-like aesthetic
- Editorial layout, chapter-based scrolling
- AI-generated narrative prominent
- Best for: Reports to stakeholders who don't use BI daily

## Theme CSS Palettes (moved from color-system.md — research-context §2.2 dedup)

Theme-specific design tokens. For semantic color rules (positive/negative/neutral encoding, CVD rules) see `color-system.md`.

### Workbench Theme
```css
--bg-primary: #0D1117; --bg-secondary: #161B22; --bg-card: #21262D;
--text-primary: #E6EDF3; --text-secondary: #8B949E;
--accent-primary: #388BFD; --accent-success: #3FB950;
--accent-danger: #F85149; --accent-warning: #D29922;
--series-1: #388BFD; --series-2: #3FB950; --series-3: #D29922;
--series-4: #A371F7; --series-5: #F78166; --series-other: #484F58;
```

### Board Pack Theme
```css
--bg-primary: #FAFAF8; --bg-card: #FFFFFF;
--text-primary: #1A1A18; --text-secondary: #5A5A56;
--accent-primary: #1A1A18; --accent-highlight: #C84B31;
--series-1: #264653; --series-2: #2A9D8F; --series-3: #E9C46A;
--series-4: #F4A261; --series-5: #C84B31; --series-other: #9A9A96;
```

### LiveOps Theme
```css
--bg-primary: #080A0F; --bg-card: #141820;
--text-primary: #E8E6E0; --text-secondary: #8892A0;
--signal-ok: #1D9E75; --signal-warn: #E9C46A; --signal-error: #E24B4A;
--trace-primary: #1D9E75; --trace-secondary: #4A9EFF;
```

### Briefing Theme
```css
--bg-primary: #FAF8F4; --bg-card: #FFFFFF;
--text-primary: #2C2A24; --text-secondary: #6B6660;
--accent-primary: #8B4513; --accent-highlight: #C17D3C;
--series-1: #8B4513; --series-2: #3A6B4A; --series-3: #2C5F8A;
--series-4: #8A5A2C; --series-5: #6B3A3A; --series-other: #A09B96;
```

---

## Examples

```

- [ ] **Step 5: Update `tokens_budget` from 1400 → 2400**

```
old_string:
tokens_budget: 1400

new_string:
tokens_budget: 2400
```

- [ ] **Step 6: Run structure validator**

```bash
python -m pytest tests/test_skill_library_structure.py -k "dashboard-aesthetics" -v
```

Expected: PASS. If actual tokens > 3000 (125% of 2400), trim theme palette CSS to single-line hex values (already done above as condensed form).

- [ ] **Step 7: Commit**

```bash
git add askdb-skills/visualization/dashboard-aesthetics.md
git commit -m "feat(skills): add 5s rule OkLCH grid F-pattern whitespace theme palettes to dashboard-aesthetics (Plan 2 T9)"
```

---

## Task 10: color-system.md — Viridis/Cividis CVD + OkLCH + Remove Theme Palettes

**Files:**
- Modify: `askdb-skills/visualization/color-system.md`

### Context

After T9 moves theme palettes to `dashboard-aesthetics.md`, `color-system.md` should contain only **semantic color rules**: positive/negative/neutral encoding, CVD rules, delta indicators, color assignment algorithm. Remove the four CSS palette blocks (they're now in dashboard-aesthetics.md). Add: Viridis/Cividis CVD-pass note (§3.8 color rule 2), OkLCH custom ramp guidance (§3.8 rule 4), 8% CVD fact (§3.8 CVD note).

- [ ] **Step 1: Remove the four theme CSS palette blocks, replace with reference pointer**

```
File: askdb-skills/visualization/color-system.md

old_string:
## Theme-Specific Palettes

### Workbench Theme (Dark Professional)

```css
/* Background */
--bg-primary: #0D1117
--bg-secondary: #161B22
--bg-tertiary: #1C2128
--bg-card: #21262D

/* Text */
--text-primary: #E6EDF3
--text-secondary: #8B949E
--text-muted: #484F58

/* Accent (primary brand) */
--accent-primary: #388BFD     /* Blue — primary metric */
--accent-success: #3FB950     /* Green — positive performance */
--accent-danger: #F85149      /* Red — negative / alert */
--accent-warning: #D29922     /* Amber — warning / neutral */
--accent-purple: #A371F7      /* Purple — secondary metric */

/* Chart series (in order) */
--series-1: #388BFD           /* Primary */
--series-2: #3FB950           /* Secondary */
--series-3: #D29922           /* Tertiary */
--series-4: #A371F7           /* Quaternary */
--series-5: #F78166           /* Quinary */
--series-other: #484F58       /* "Other" / de-emphasized */

/* Grid and borders */
--grid-line: rgba(56, 139, 253, 0.08)
--border-subtle: rgba(255, 255, 255, 0.08)
```

new_string:
## Theme-Specific Palettes

Theme CSS tokens (Workbench, Board Pack, LiveOps, Briefing) have been **moved to `dashboard-aesthetics.md` §Theme CSS Palettes** to eliminate duplication (research-context §2.2 dedup). See that file for hex values and CSS custom properties.

This file retains only semantic color rules applicable across all themes.

```

- [ ] **Step 2: Remove the remaining three theme blocks (Board Pack, LiveOps, Briefing)**

These are the three CSS blocks that follow the Workbench block. Remove from `### Board Pack Theme (Editorial Light)` through the end of the Briefing theme closing ` ``` `.

```
File: askdb-skills/visualization/color-system.md

old_string:
### Board Pack Theme (Editorial Light)

```css
/* Background */
--bg-primary: #FAFAF8
--bg-secondary: #F4F4F1
--bg-tertiary: #EBEBEB
--bg-card: #FFFFFF

/* Text */
--text-primary: #1A1A18
--text-secondary: #5A5A56
--text-muted: #9A9A96

/* Accent */
--accent-primary: #1A1A18     /* Near-black — editorial */
--accent-highlight: #C84B31   /* Warm red — callouts */
--accent-success: #2D6A4F     /* Forest green */
--accent-warning: #E9C46A     /* Golden — highlights */
--accent-link: #264653        /* Dark teal */

/* Chart series */
--series-1: #264653           /* Dark teal */
--series-2: #2A9D8F           /* Teal */
--series-3: #E9C46A           /* Gold */
--series-4: #F4A261           /* Warm orange */
--series-5: #C84B31           /* Red */
--series-other: #9A9A96       /* Gray */

/* Annotation colors */
--annotation-positive: #2D6A4F
--annotation-negative: #C84B31
--annotation-neutral: #5A5A56

/* Grid */
--grid-line: rgba(0, 0, 0, 0.06)
--border-subtle: rgba(0, 0, 0, 0.08)
```

### LiveOps Theme (Terminal / Monitoring)

```css
/* Background — terminal aesthetic */
--bg-primary: #080A0F
--bg-secondary: #0D1017
--bg-panel: #111519
--bg-card: #141820

/* Text */
--text-primary: #E8E6E0
--text-secondary: #8892A0
--text-muted: #3D4450

/* Signal colors (status-oriented) */
--signal-ok: #1D9E75          /* Green — nominal */
--signal-warn: #E9C46A        /* Amber — degraded */
--signal-error: #E24B4A       /* Red — critical */
--signal-info: #4A9EFF        /* Blue — informational */

/* Chart traces */
--trace-primary: #1D9E75      /* Main metric line */
--trace-secondary: #4A9EFF    /* Secondary metric */
--trace-anomaly: #E24B4A      /* Anomaly highlight */
--trace-forecast: #8892A0     /* Forecast (dimmer) */

/* Event markers */
--event-positive: #1D9E75
--event-negative: #E24B4A
--event-neutral: #4A9EFF

/* Terminal elements */
--terminal-green: #1D9E75
--terminal-cursor: #E8E6E0
--scanline: rgba(0, 255, 0, 0.02)  /* Optional scanline effect */

/* Grid */
--grid-line: rgba(74, 158, 255, 0.05)
```

### Briefing Theme (Warm Editorial)

```css
/* Background — warm paper */
--bg-primary: #FAF8F4
--bg-secondary: #F0EDE6
--bg-card: #FFFFFF
--bg-accent: #F5EDD8

/* Text — warm blacks */
--text-primary: #2C2A24
--text-secondary: #6B6660
--text-muted: #A09B96

/* Accent */
--accent-primary: #8B4513    /* Saddle brown — editorial anchor */
--accent-highlight: #C17D3C  /* Warm amber — callouts */
--accent-success: #3A6B4A    /* Forest green */
--accent-danger: #A33A2A     /* Warm red */

/* Chart series */
--series-1: #8B4513          /* Brown */
--series-2: #3A6B4A          /* Green */
--series-3: #2C5F8A          /* Navy blue */
--series-4: #8A5A2C          /* Tan */
--series-5: #6B3A3A          /* Burgundy */
--series-other: #A09B96      /* Warm gray */

/* Drop cap accent */
--drop-cap-color: #C17D3C

/* Grid */
--grid-line: rgba(139, 69, 19, 0.06)
```

## Semantic Color Rules (Apply Across All Themes)

new_string:
## Semantic Color Rules (Apply Across All Themes)

```

- [ ] **Step 3: Add Viridis/Cividis CVD and OkLCH section**

```
File: askdb-skills/visualization/color-system.md

old_string:
## Colorblind Accessibility

Default palettes are designed to be distinguishable for common color vision deficiencies:

**Deuteranopia (red-green) check:**
- Never rely on red vs green alone
- Always add: arrows (↑↓), labels, or patterns as secondary encoding
- KPI deltas: color + directional symbol

new_string:
## Colorblind Accessibility (research-context §3.8 color rules 2-4)

**CVD prevalence:** ~8% of men have red-green color vision deficiency (deuteranopia / protanopia). Color is **never** the sole encoding — always pair with shape, label, or direction arrow.

**Sequential palettes for continuous data:**
- **Viridis** and **Cividis** pass all CVD tests (deuteranopia, protanopia, tritanopia) and perceptual uniformity tests. Prefer over custom ramps.
- **Diverging:** RdBu, BrBG, PiYG — only when there is a meaningful midpoint (e.g., deviation from target).

**OkLCH for custom ramps (2024-2026 CSS standard; research-context §3.8 color rule 4):**
When Viridis/Cividis don't fit the brand, generate custom sequential ramps in OkLCH color space for perceptually equal brightness steps (HSL produces unequal steps across hues):
```css
/* OkLCH sequential ramp (blue, 5 steps, perceptually uniform) */
oklch(0.95 0.03 250) → oklch(0.80 0.08 250) → oklch(0.65 0.14 250)
→ oklch(0.50 0.18 250) → oklch(0.35 0.20 250)
```

**Dark mode:** Invert lightness only (L channel in OkLCH); cap saturation (chroma) at ~60% to prevent oversaturation.

**Deuteranopia (red-green) check:**
- Never rely on red vs green alone (~8% of men affected)
- Always add: arrows (↑↓), labels, or patterns as secondary encoding
- KPI deltas: color + directional symbol

```

- [ ] **Step 4: Update `tokens_budget` from 2100 → 1100**

After removing ~1000 tokens of CSS blocks, file is ~1100 tokens.

```
old_string:
tokens_budget: 2100

new_string:
tokens_budget: 1100
```

- [ ] **Step 5: Run structure validator**

```bash
python -m pytest tests/test_skill_library_structure.py -k "color-system" -v
```

Expected: PASS (3 examples still present, ≥300 tokens).

- [ ] **Step 6: Commit**

```bash
git add askdb-skills/visualization/color-system.md
git commit -m "feat(skills): add Viridis OkLCH CVD rules remove theme palettes from color-system (Plan 2 T10)"
```

---

## Task 11: chart-formatting.md — Intl.NumberFormat + Tabular-Nums + Annotation Patterns

**Files:**
- Modify: `askdb-skills/visualization/chart-formatting.md`

### Context

Research-context §3.8 typography rule 3: locale-aware number formatting via `Intl.NumberFormat` (compact notation, `en-IN` lakh/crore support). Plus tabular-nums CSS for aligned digit columns, and extended annotation patterns.

- [ ] **Step 1: Add locale-aware number formatting section after "## Axis Formatting"**

```
File: askdb-skills/visualization/chart-formatting.md

old_string:
## Legend Placement

new_string:
## Locale-Aware Number Formatting (research-context §3.8 typography rule 3)

Use `Intl.NumberFormat` for locale-aware compact notation rather than hardcoded K/M/B suffixes:

```javascript
// Compact notation (en-US): 8200000 → "8.2M"
new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(8_200_000)
// → "8.2M"

// en-IN (lakh/crore): 8200000 → "82L" (82 lakh), 10000000 → "1Cr"
new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(8_200_000)
// → "82L"

// Currency compact (en-US):
new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD',
  notation: 'compact', maximumFractionDigits: 1
}).format(8_200_000)
// → "$8.2M"

// Detect user locale from connection metadata or browser navigator.language
```

**Rule:** Detect user locale from connection profile or `navigator.language`. Default `en-US` if unknown. Do not hardcode suffix logic.

## Tabular Numbers for Aligned Columns (research-context §3.8 typography rule)

In data tables and tooltip columns where numbers need vertical alignment:

```css
.chart-value, .table-cell-numeric {
  font-variant-numeric: tabular-nums;  /* Fixed-width digits for alignment */
  font-feature-settings: "tnum";       /* Fallback for older browsers */
}
```

Without `tabular-nums`, variable-width digits cause misaligned decimal points in columns.

## Legend Placement

```

- [ ] **Step 2: Extend annotation patterns section**

```
File: askdb-skills/visualization/chart-formatting.md

old_string:
**Format:**
```
Target line:   Dashed line, amber color, labeled "$2M Target"
Average line:  Dashed line, gray, labeled "Avg: $847K"
Event marker:  Vertical dashed line, labeled with event name
Forecast:      Dashed continuation of trend line (different opacity)
```

new_string:
**Format:**
```
Target line:    Dashed line, amber color, labeled "$2M Target"
Average line:   Dashed line, gray, labeled "Avg: $847K"
Event marker:   Vertical dashed line, labeled with event name
Forecast:       Dashed continuation of trend line (different opacity)
Anomaly callout: Filled circle + arrow + inline label "Spike: +42% — investigate"
```

**Annotation placement rule (research-context §3.8 typography rule 4):** Annotate anomalies **directly on the chart**, not in a footnote. Footnotes are missed; inline annotations are seen.

**Annotation copy format:**
- Anomaly: `"[Event]: [magnitude] — [suggested action]"` (max 60 chars)
- Reference line: `"[Label]: [value]"` (max 30 chars)
- Forecast endpoint: `"[Period]: [value] (forecast)"` (max 40 chars)
```

- [ ] **Step 3: Update `tokens_budget` from 1300 → 1700**

```
old_string:
tokens_budget: 1300

new_string:
tokens_budget: 1700
```

- [ ] **Step 4: Run structure validator**

```bash
python -m pytest tests/test_skill_library_structure.py -k "chart-formatting" -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add askdb-skills/visualization/chart-formatting.md
git commit -m "feat(skills): add Intl.NumberFormat tabular-nums annotation patterns to chart-formatting (Plan 2 T11)"
```

---

## Task 12: vizql-capabilities-progressive-disclosure.md — Vega-Lite Limitations + Workarounds + Canvas Thresholds

**Files:**
- Modify: `askdb-skills/visualization/vizql-capabilities-progressive-disclosure.md`

### Context

The file documents VizQL/RSR capabilities but is missing the Vega-Lite limitation constraints from research-context §3.8. These are important because AskDB uses Vega-Lite as the underlying spec layer (via `react-vega`/`VegaRenderer.tsx` per CLAUDE.md). Agents need to know what Vega-Lite cannot do natively so they route to server-side workarounds.

- [ ] **Step 1: Add Vega-Lite Limitations section after the "## Chart Types Supported" table**

```
File: askdb-skills/visualization/vizql-capabilities-progressive-disclosure.md

old_string:
## Native Table Calculations (30)

new_string:
## Vega-Lite Limitations and Server-Side Workarounds (research-context §3.8)

AskDB renders charts via Vega-Lite specs (`react-vega` / `VegaRenderer.tsx`). Know these limitations before designing a chart pipeline:

| Limitation | Detail | Server-side workaround |
|------------|--------|----------------------|
| No LOD expressions | No FIXED / INCLUDE / EXCLUDE equivalent | Implement via SQL window function + CTE (see `join-intelligence.md`); return pre-aggregated result |
| `bin` + `agg` awkward | Using `timeUnit` + `aggregate` together requires careful spec ordering; pre-bucketed strings bypass transforms | Use `timeUnit: "yearmonth"` + `aggregate: "sum"` in the transform array rather than pre-formatted date strings |
| No native pivot | Only `fold` (unpivot); no `pivot` transform | Apply PIVOT SQL server-side; return already-pivoted data to Vega-Lite |
| Inline data > 50K rows | Browser memory pressure; sluggish renders | Pre-aggregate server-side; use `"url"`-based data source pointing to `/api/data/{query_id}` for > 1MB payloads |
| SVG renderer limit | SVG parsing slows above 2K marks | RSR auto-switches to Canvas above 5K marks; for < 2K marks SVG gives best accessibility |

**Renderer threshold summary (research-context §3.8 + RSR code above):**

| Mark count | Renderer | Notes |
|-----------|---------|-------|
| < 2K | SVG | Accessible, crisp, full ARIA |
| 2K – 5K | Canvas fast (auto) | RSR switches automatically |
| > 5K | Canvas fast (forced) | RSR selection above |
| > 100K | WebGL SDF | |
| > 1M | WebGL + Arrow streaming | |

**`url`-based data rule:** When the Vega-Lite spec's inline `"values"` array would exceed 1MB JSON, switch to `"url": "/api/data/{query_id}"` to stream data separately and avoid bloating the spec payload.

## Native Table Calculations (30)

```

- [ ] **Step 2: Update `tokens_budget` from 1600 → 2000**

```
old_string:
tokens_budget: 1600

new_string:
tokens_budget: 2000
```

- [ ] **Step 3: Run structure validator**

```bash
python -m pytest tests/test_skill_library_structure.py -k "vizql-capabilities" -v
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add askdb-skills/visualization/vizql-capabilities-progressive-disclosure.md
git commit -m "feat(skills): add Vega-Lite limitations workarounds canvas thresholds to vizql-capabilities (Plan 2 T12)"
```

---

## Task 13: multi-step-planning.md — Schema-Link-First Decomposition + Self-Consistency Voting

**Files:**
- Modify: `askdb-skills/agent/multi-step-planning.md`

### Context

Research-context §3.1 rules 1-4 add two major planning patterns not in the current file:
1. **Schema-link-first** — dedicated retrieval pass before drafting SQL (rule 1, 3).
2. **Self-consistency voting** — generate N≥3 SQL candidates, vote by result-set equivalence (rule 4).

- [ ] **Step 1: Add Schema-Link-First Decomposition section before `## Examples`**

```
File: askdb-skills/agent/multi-step-planning.md

old_string:
---

## Examples

new_string:
## Schema-Link-First Decomposition (research-context §3.1 rules 1, 3)

For any query involving > 2 tables or ambiguous column references, run a dedicated schema-linking pass **before drafting SQL**:

```
Step 1 — find_relevant_tables: retrieve candidate tables for the user's intent
Step 2 — inspect_schema: inject FK evidence, enum values, typical filters as hints
Step 3 — sub-problem ID: decompose into atomic SQL sub-problems
Step 4 — NL plan: write a plain-English plan for each sub-problem
Step 5 — SQL draft: generate SQL per sub-problem using only columns surfaced in step 1-2
Step 6 — self-repair if error (see self-repair-error-taxonomy.md)
```

**Rule:** Reject any column in the generated SQL that the schema-linker did not surface in step 1-2. If a column name is guessed, the join key may be wrong.

**Evidence hint injection (§3.1 rule 2):** After `inspect_schema`, prepend FK and enum evidence into the planning context:
```
Evidence: orders.customer_id = customers.id (FK, 1:N)
Evidence: orders.status IN ('pending','processing','shipped','delivered','cancelled')
Evidence: customers.tier IN ('free','pro','enterprise')
```

## Self-Consistency Voting for Hard Queries (research-context §3.1 rule 4)

**Hard query threshold:** touches > 3 tables, or involves a window function + GROUP BY combination, or has previously returned a validation error in this session.

For hard queries:
1. Generate **N ≥ 3 candidate SQL statements** internally (vary temperature or decomposition path).
2. Execute all candidates via `run_sql` (or EXPLAIN for row-count check without full execution).
3. Vote by result-set equivalence: select the candidate where ≥ 2 of 3 return the same row count + column structure.
4. If no majority after 3 candidates: surface two best options to user with `ask_user`.

```python
# Pseudo-logic
candidates = [generate_sql(query, temp=0.0),
              generate_sql(query, temp=0.3),
              generate_sql(query, temp=0.7)]
row_counts = [execute_explain(sql) for sql in candidates]
majority = most_common(row_counts)
if majority.count >= 2:
    use(candidates[row_counts.index(majority.value)])
else:
    ask_user(f"Two interpretations possible:\n1. {candidates[0]}\n2. {candidates[1]}\nWhich matches your intent?")
```

---

## Examples

```

- [ ] **Step 2: Update `tokens_budget` from 1200 → 1700**

```
old_string:
tokens_budget: 1200

new_string:
tokens_budget: 1700
```

- [ ] **Step 3: Run structure validator**

```bash
python -m pytest tests/test_skill_library_structure.py -k "multi-step-planning" -v
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add askdb-skills/agent/multi-step-planning.md
git commit -m "feat(skills): add schema-link-first decomposition self-consistency voting to multi-step-planning (Plan 2 T13)"
```

---

## Task 14: screenshot-interpretation.md — No Change (Confirmed)

**Files:**
- Read-only: `askdb-skills/agent/screenshot-interpretation.md`

### Context

Per the plan spec: "leave as-is unless §3.8 adds anything relevant; confirm no change needed."

Research-context §3.8 covers chart design rules (chart selection, layout, color, typography, Vega-Lite limits, accessibility). None of these add screenshot-interpretation-specific rules. The existing file covers: analysis pipeline (structure detection → chart type ID → metric extraction → dimension detection → filter detection → quality assessment), tile spec mapping, confidence levels, whiteboard interpretation, privacy protection, limitation disclosure.

No changes needed.

- [ ] **Step 1: Confirm read and log**

Read `askdb-skills/agent/screenshot-interpretation.md` (already done in pre-plan research). §3.8 adds no screenshot-specific rules. No edits.

- [ ] **Step 2: No commit** (no changes).

```
# No commit for T14 — file unchanged.
```

---

## Task 15: chromadb-retrieval-integration.md — BM25+Rerank + Contextual Retrieval + HyDE Warning + Parent-Child Chunking + Embedding Model Fix

**Files:**
- Modify: `askdb-skills/core/chromadb-retrieval-integration.md`

### Context

Three factual issues + four content gaps:

**Factual issues:**
1. Overview says "Query embedding (all-MiniLM-L6-v2 or similar)" — **wrong**. AskDB uses pure-Python 384-dim n-gram hash embeddings (no ML deps). Source: research-context §1.3.
2. Overview says "all 31+ markdown files" — stale; Plan 1 brought count to 49.
3. Inline `detect_domain()` function re-implements what already exists at `behavior_engine.py:193` — add note.

**Content gaps (research-context §3.2 rules 1-5):**
- Hybrid BM25 + dense retrieval (rule 1)
- Always rerank top-50 → top-5 (rule 2)
- Skip HyDE for schema retrieval (rule 3)
- Parent-child chunking for tables (rule 4)
- Contextual retrieval — prepend chunk summary (rule 5)

To stay within the 2500 token cap, we remove the verbose `detect_domain()` function (30 lines) — it duplicates `behavior_engine.py:193`. We keep the rest of the ingestion script and retrieval logic.

- [ ] **Step 1: Fix embedding model description and file count in overview**

```
File: askdb-skills/core/chromadb-retrieval-integration.md

old_string:
The skill library uses ChromaDB as a semantic retrieval layer. Instead of loading all 31+ markdown files into every system prompt (expensive, slow), the agent retrieves only the 2-4 most relevant skill files per query.

```
User query
    ↓
Query embedding (all-MiniLM-L6-v2 or similar)
    ↓
ChromaDB similarity search (6 collections)

new_string:
The skill library uses ChromaDB as a semantic retrieval layer. Instead of loading all 49 markdown files into every system prompt (expensive, slow), the agent retrieves only the 2-4 most relevant skill files per query.

```
User query
    ↓
Query embedding (pure-Python 384-dim n-gram hash; no ML deps; ~5-10ms — research-context §1.3)
    ↓
ChromaDB similarity search (6 collections)
```

- [ ] **Step 2: Remove inline `detect_domain()` function and replace with reference**

```
File: askdb-skills/core/chromadb-retrieval-integration.md

old_string:
def detect_domain(schema_context: dict) -> str:
    """Infer data domain from table/column names in schema."""
    table_names = " ".join(schema_context.get("tables", []))
    column_names = " ".join(schema_context.get("columns", []))
    all_names = f"{table_names} {column_names}".lower()
    
    DOMAIN_SIGNALS = {
        "sales": ["opportunity", "deal", "pipeline", "lead", "account", "win_rate", "close_date"],
        "product": ["event", "session", "retention", "dau", "mau", "feature", "experiment"],
        "finance": ["gl_entry", "invoice", "budget", "mrr", "arr", "revenue_recognition"],
        "marketing": ["campaign", "utm", "impression", "click", "lead", "mql", "sql"],
        "ecommerce": ["order", "sku", "cart", "inventory", "return", "fulfillment"],
        "hr": ["employee", "headcount", "tenure", "attrition", "compensation"],
        "operations": ["incident", "ticket", "uptime", "latency", "sla", "queue"],
        "iot": ["sensor", "device", "telemetry", "reading", "measurement"],
    }
    
    domain_scores = {}
    for domain, signals in DOMAIN_SIGNALS.items():
        score = sum(1 for signal in signals if signal in all_names)
        if score > 0:
            domain_scores[domain] = score
    
    return max(domain_scores, key=domain_scores.get) if domain_scores else None

new_string:
# detect_domain() is already implemented at backend/behavior_engine.py:193
# Returns: "sales"|"product"|"finance"|"marketing"|"ecommerce"|"hr"|"operations"|"iot"|"general"
# Do NOT re-implement — call behavior_engine.detect_domain(schema_info) directly.
```

- [ ] **Step 3: Add forward-looking RAG architecture section before `## Context Assembly`**

```
File: askdb-skills/core/chromadb-retrieval-integration.md

old_string:
## Context Assembly

new_string:
## Target Hybrid Retrieval Architecture (research-context §3.2 — Plan 3 implementation)

> **Status:** Not yet implemented. Current system uses pure semantic (n-gram hash) retrieval only. This section documents the Plan 3 target architecture for skill-library retrieval quality improvement.

### Why hybrid retrieval (§3.2 rule 1)

Pure semantic search loses on exact column names and enum literals (e.g., `order_status = 'shipped'`). BM25 keyword search finds exact tokens but misses paraphrases. Hybrid = both.

**Target pipeline:**
```
User query
  → BM25 index (exact token match, per-connection)  ─┐
  → Dense embedding (n-gram hash, current)            ├─ Fuse scores (RRF)
  → Fused top-50 results                              ┘
  → Reranker (cross-encoder: bge-reranker-v2 or Cohere Rerank 3.5)
  → Top-5 chunks injected into context
```

Recall@5 with reranking: ~0.816 vs 0.695 hybrid-only (research-context §3.2 source).

### HyDE warning — skip for schema retrieval (§3.2 rule 3)

HyDE (Hypothetical Document Embeddings) hallucinates column names when generating hypothetical schema documents. **Never use HyDE for schema retrieval.** HyDE is acceptable for NL insight queries but not for table/column name lookup.

### Contextual retrieval — prepend chunk summary (§3.2 rule 5)

Before embedding each skill-file chunk, prepend a one-sentence context summary:

```python
# During ingestion (Plan 3 implementation)
context_prefix = f"This chunk is from {category}/{filename}, section '{section_header}'. "
embedded_text = context_prefix + chunk_text
# Reduces retrieval failures by ~35% (Anthropic Contextual Retrieval Cookbook)
```

### Parent-child chunking for schema tables (§3.2 rule 4)

```
Child chunk  = column description (embed this for retrieval)
Parent chunk = full DDL + sample rows + FK context (return this to agent)
```

Retrieve by child similarity, but inject the parent into the context window. Prevents fragmenting FK context across separate chunks.

## Context Assembly

```

- [ ] **Step 4: Update `tokens_budget` from 2300 → 2300** (net neutral: removed ~170, added ~320; new actual ~2450)

```
old_string:
tokens_budget: 2300

new_string:
tokens_budget: 2400
```

- [ ] **Step 5: Run structure validator**

```bash
python -m pytest tests/test_skill_library_structure.py -k "chromadb-retrieval" -v
```

Expected: PASS. If actual tokens > 3000 (125% of 2400), trim the "Target Hybrid Retrieval" section prose — the table + code blocks are essential, trim narrative sentences.

- [ ] **Step 6: Commit**

```bash
git add askdb-skills/core/chromadb-retrieval-integration.md
git commit -m "feat(skills): add BM25 rerank contextual-retrieval HyDE warning parent-child to chromadb-retrieval (Plan 2 T15)"
```

---

## Task 16: MASTER_INDEX.md — Version Changelog

**Files:**
- Modify: `askdb-skills/MASTER_INDEX.md`

- [ ] **Step 1: Add Plan 2 changelog entry**

Find the version/changelog section in MASTER_INDEX.md and append:

```
File: askdb-skills/MASTER_INDEX.md

Locate the version or changelog section (search for "Plan 1" or "2026-04-19").
Append after the Plan 1 entry:

| 2026-04-20 | Plan 2 Tier B | Updated 15 existing files: 3 dialect (§3.5 gotchas), 4 SQL (join cardinality, time DOW/leap/week-start/date-dim, aggregation NULL-count, null-handling trim), 5 visualization (chart-selection 5s/dual-axis/pie/log, dashboard-aesthetics grid/F-pattern/whitespace/OkLCH, color-system Viridis/CVD/palette-move, chart-formatting Intl.NumberFormat/tabular-nums, vizql Vega-Lite limits), 2 agent (multi-step schema-link/voting, screenshot confirmed no-op), 1 core (chromadb hybrid-RAG/HyDE/parent-child). File count: 49 (unchanged). |
```

- [ ] **Step 2: Commit**

```bash
git add askdb-skills/MASTER_INDEX.md
git commit -m "feat(skills): update MASTER_INDEX with Plan 2 Tier B changelog (Plan 2 T16)"
```

---

## Self-Review Checklist

Reviewed against spec in `2026-04-19-skill-library-research-context.md` and the scheduled task brief.

### 1. Spec coverage

| Spec requirement | Task | Status |
|---|---|---|
| Dialect files: 12 SQL dialect gotchas from §3.5 | T1, T2, T3 | ✅ All 12 rules distributed across 3 files; deduplicated by dialect |
| join-intelligence: cardinality tagging 1:1/1:N/N:M | T4 | ✅ |
| join-intelligence: bridge-table detection | T4 | ✅ |
| join-intelligence: post-exec row-count >10× fan-out flag | T4 | ✅ |
| time-intelligence: DOW dialect differences | T5 | ✅ |
| time-intelligence: leap-year Feb 29 clamp | T5 | ✅ |
| time-intelligence: week-start ISO vs US | T5 | ✅ |
| time-intelligence: NULLIF denominator rule | Already in file (MoM example uses NULLIF) | ✅ No change needed |
| time-intelligence: date-dim preference | T5 | ✅ |
| aggregation-rules: absorb NULL-in-agg from null-handling | T6 | ✅ |
| null-handling: trim to ~semantics + safe ops | T7 | ✅ (removes agg section, adds cross-ref) |
| chart-selection: 5-second rule (not 10) | T8 | ✅ |
| chart-selection: dual-axis ban (NN/g) | T8 | ✅ Decision tree + Hard Rules + Axis Scale section all updated |
| chart-selection: pie >5 slices ban | T8 | ✅ Changed from >6 to >5 |
| chart-selection: log-scale rule >2 orders | T8 | ✅ Changed from "3+" to ">2" |
| dashboard-aesthetics: OkLCH 2024-2026 standard | T9 | ✅ |
| dashboard-aesthetics: 12-column grid + 16-24px gutters | T9 | ✅ |
| dashboard-aesthetics: F-pattern reading | T9 | ✅ |
| dashboard-aesthetics: whitespace 20-30% | T9 | ✅ |
| color-system: Viridis/Cividis CVD-pass note | T10 | ✅ |
| color-system: OkLCH for custom ramps | T10 | ✅ |
| color-system: 8% red-green CVD fact | T10 | ✅ |
| color-system: move theme palettes to dashboard-aesthetics | T9+T10 | ✅ |
| chart-formatting: Intl.NumberFormat compact + en-IN | T11 | ✅ |
| chart-formatting: tabular-nums for aligned digits | T11 | ✅ |
| chart-formatting: annotation patterns | T11 | ✅ |
| vizql: Vega-Lite LOD/bin+agg/pivot limitations | T12 | ✅ |
| vizql: server-side workarounds | T12 | ✅ |
| vizql: canvas-renderer thresholds | T12 | ✅ |
| multi-step-planning: self-consistency voting N≥3 | T13 | ✅ |
| multi-step-planning: schema-link-first decomposition | T13 | ✅ |
| screenshot-interpretation: confirm no change | T14 | ✅ |
| chromadb: hybrid BM25+dense+rerank target | T15 | ✅ (marked as Plan 3 implementation target) |
| chromadb: contextual retrieval chunk summary | T15 | ✅ |
| chromadb: HyDE warning for schema retrieval | T15 | ✅ |
| chromadb: parent-child chunking | T15 | ✅ |

### 2. Placeholder scan

No `TODO`, `TBD`, `FIXME`, `<fill`, or `lorem ipsum` present in any task's new_string blocks. Every code block is complete and runnable.

### 3. Facts verified against research-context §6 (MUST NOT fabricate)

- ✅ Skill library has **49** files after Plan 1 (not 33 or 37) — T15 fixes "31+" → "49"
- ✅ `detect_domain()` at `behavior_engine.py:193` — T15 removes duplicate and references production location
- ✅ Embedding model is pure-Python 384-dim n-gram hash (not all-MiniLM) — T15 corrects
- ✅ Hybrid BM25 + rerank is a **forward-looking goal** (Plan 3), not current state — T15 marks section "Status: Not yet implemented"
- ✅ Anthropic prompt caching TTLs not modified in this plan (Plan 3 scope)
- ✅ No model IDs modified (out of scope)
- ✅ No port numbers modified (out of scope)

### 4. Type / method consistency

- `detect_domain()` referenced as `behavior_engine.detect_domain(schema_info)` in T15 — consistent with research-context §1.5 signature `detect_domain(schema_info: dict) -> str`
- `run_sql` tool name consistent with research-context §1.7 tool definitions
- `find_relevant_tables` tool name consistent with §1.7
- `ask_user` tool name consistent with §1.7

### 5. Token budget concerns

| File | Before | After (est.) | Budget set | Within ±25%? |
|---|---|---|---|---|
| dialect-bigquery | 1200 | ~1480 | 1500 | ✅ [1125,1875] |
| dialect-snowflake-postgres-duckdb | 1800 | ~2150 | 2200 | ✅ [1650,2750]→cap 2500 |
| dialect-mysql-sqlserver-redshift-databricks | 1700 | ~2050 | 2100 | ✅ [1575,2625]→cap 2500 |
| join-intelligence | 1100 | ~1420 | 1500 | ✅ [1125,1875] |
| time-intelligence | 1500 | ~1900 | 2000 | ✅ [1500,2500] |
| aggregation-rules | 1400 | ~1470 | 1400 | ✅ (unchanged, delta small) |
| null-handling | 1100 | ~940 | 900 | ✅ [675,1125] |
| chart-selection | 1400 | ~1560 | 1600 | ✅ [1200,2000] |
| dashboard-aesthetics | 1400 | ~2350 | 2400 | ✅ [1800,3000]→cap 2500 |
| color-system | 2100 | ~1150 | 1100 | ✅ [825,1375] |
| chart-formatting | 1300 | ~1620 | 1700 | ✅ [1275,2125] |
| vizql-capabilities | 1600 | ~1900 | 2000 | ✅ [1500,2500] |
| multi-step-planning | 1200 | ~1680 | 1700 | ✅ [1275,2125] |
| chromadb-retrieval | 2300 | ~2450 | 2400 | ✅ [1800,3000]→cap 2500 |

> Note: Where estimate exceeds 2500, executor must trim prose sentences in the new sections while keeping all code blocks and tables intact. The test suite will catch over-budget files.

---

## Ambiguities Resolved During Authoring

1. **"absorb the NULL-in-agg section" (T6/T7):** `aggregation-rules.md` already had its own `## NULL in Aggregations` section. The unique content from `null-handling.md` was the `COUNT(*) - COUNT(col)` null-count pattern (not present in aggregation-rules). Added that pattern in T6; removed the duplicate section from null-handling in T7. Did not do a full file rewrite.

2. **"~400 tokens" target for null-handling trim:** Interpreted as "remove the aggregation overlap, not strip every non-core section." Removing just the agg section reduces file from ~940 to ~780 tokens — within [675, 1125] for budget 900. Retains filtering/soft-delete, string-null, ORDER BY nulls, surfacing prevalence (these are distinct from aggregation-rules content).

3. **"Move theme palettes to dashboard-aesthetics":** Color-system tokens_budget drops from 2100 → 1100; dashboard-aesthetics rises to 2400 (near the 2500 cap). CSS blocks were condensed to single-line hex-value format in dashboard-aesthetics to stay under cap, preserving semantic meaning without verbose comments.

4. **Hybrid BM25+rerank wording:** research-context §1.3 says current system has NO hybrid retrieval. research-context §3.2 says it's the target. Added the architecture section in chromadb-retrieval-integration.md with explicit "Status: Not yet implemented / Plan 3" marker to prevent confusion.

5. **screenshot-interpretation.md (T14):** Confirmed no change needed. §3.8 visualization rules all pertain to chart design, not screenshot analysis. File left untouched; T14 is a documentation-only confirmation task with no commit.

---

> **Plan saved. Do NOT execute in this session.** Plan 2 execution happens in a separate session.
> Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` for execution.
