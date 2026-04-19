---
name: schema-linking-evidence
description: Schema linking rules + evidence-generation patterns that precede SQL drafting — FK graph, enum values, synonyms, cardinality tags
priority: 2
tokens_budget: 1600
applies_to: sql-generation
---

# Schema Linking & Evidence Generation — AskDB AgentEngine

## Why schema linking first

Top BIRD/Spider systems (2025–2026) run a dedicated schema-linking pass **before** drafting SQL. The schema linker returns a short list of candidate tables + columns + join keys; SQL generation restricts itself to that slate. This cuts hallucinated column names to near-zero.

## The evidence packet

Every SQL-generation turn receives an **evidence packet** assembled from cached schema profile + the question:

```
evidence = {
  "candidate_tables": [...],          # top 3 tables by embedding + FK proximity
  "candidate_columns": {tbl: [col]},  # 3–5 cols per candidate
  "join_keys": [(a.id, b.a_id), ...], # from FK graph
  "enum_values": {col: [v1, v2, ...]},# distinct values for low-cardinality cols
  "synonyms": {user_term: col_name},  # from schema_profile alias map
  "cardinality_tags": {col: "1:1" | "1:N" | "N:M"},
  "sample_rows": [{col: v, ...}],     # 3 masked rows per candidate table
}
```

Inject this packet between schema DDL and the final user question in the prompt. It is the single biggest lever on NL-to-SQL accuracy.

## Schema linker algorithm

1. Embed user question (existing ChromaDB pipeline).
2. Top-10 candidate columns by cosine over `schema_<conn_id>` collection.
3. Group by table → top-5 tables.
4. Expand each table: add all FK-connected neighbors (1-hop) as candidates.
5. Rank tables by `(col_match_score × 2 + fk_proximity + name_match)`.
6. Keep top-3 tables, top-5 columns per table.

## FK graph injection

Represent the FK graph as a compact edge list in the prompt, not a big diagram:

```
FK edges:
  orders.customer_id  →  customers.id       (N:1)
  order_items.order_id →  orders.id         (N:1)
  order_items.product_id → products.id      (N:1)
  customers.region_id →  regions.id         (N:1)
```

One line per edge. LLMs parse this faster than DDL.

## Cardinality tags

Every FK gets a tag: `1:1` | `1:N` | `N:M`. Tags come from schema profiling (`distinct_ratio` on both sides). **Never let the LLM draft a SUM/AVG across an N:M join without an explicit pre-aggregation directive** — see `sql/join-intelligence.md`. Bridge tables (two FKs, no measures) are auto-detected and tagged `bridge`.

## Enum hinting

Low-cardinality columns (distinct ≤ 20, e.g. `status`, `region`, `tier`) get their enum set pre-injected:

```
enum_hints:
  status: ["active", "churned", "trial", "paused"]
  region: ["NA", "EMEA", "APAC", "LATAM"]
```

This eliminates `WHERE status = 'Active'` (correct: `'active'`) and `WHERE region = 'North America'` (correct: `'NA'`) hallucinations.

## Synonym map

Business terms ≠ column names. Maintain a per-connection map:

```
synonym_hints:
  "revenue"  ->  orders.amount, invoices.total
  "customer" ->  customers, accounts
  "churn"    ->  customers.is_churned, subscriptions.cancelled_at IS NOT NULL
```

Generated during schema profiling from column-comment metadata + regex rules (`amount|total|revenue` → revenue). User can override via `/api/v1/schema/synonyms` (to be implemented).

## Sample rows

Inject 3 masked rows per candidate table. Rows pass through `mask_dataframe()`. Purpose: teach the LLM typical value formats (is `date` a string or timestamp? is `amount` in cents?).

Limit to 3 rows × 3 tables = 9 rows max to stay within budget.

## Cost awareness

- Schema linking pass: ~40 ms (embedding + kNN in Chroma).
- Evidence-packet assembly: ~10 ms (dict composition).
- Total pre-SQL overhead: < 60 ms p95.

If schema profile is stale (> `SCHEMA_CACHE_MAX_AGE_MINUTES = 60`), background refresh is triggered but the stale profile is still used for this turn.

## When to skip evidence generation

- Pure metadata queries (`SHOW TABLES`, `DESCRIBE`).
- User-provided raw SQL.
- Queries routed to Tier 1 Memory (already has a cached answer).

## Interaction with `sql/ambiguity-resolution.md`

If the evidence packet has **two candidate columns with equal score** for the same user term (e.g. "revenue" maps to both `orders.amount` and `invoices.total`):
- If ambiguity score > 0.6, `ask_user` before generating SQL.
- Otherwise, pick the more-recently-populated one and disclose the choice in the summary.

## Anti-patterns

- Do NOT inject the full 500-column schema "just in case" — this causes Context Rot and tanks accuracy.
- Do NOT skip evidence on "simple" queries — the overhead is uniform and cheap.
- Do NOT HyDE (hypothetical document embeddings) for schema retrieval — it hallucinates column names.

---

## Examples

**Input:** User: "total revenue by region last quarter".
**Output evidence:**
```
candidate_tables: [orders, customers, regions]
candidate_columns: {
  orders: [amount, created_at, customer_id],
  customers: [id, region_id],
  regions: [id, name]
}
join_keys: [(orders.customer_id, customers.id), (customers.region_id, regions.id)]
enum_hints: {region.name: ["NA", "EMEA", "APAC", "LATAM"]}
cardinality_tags: {orders.customer_id: "N:1", customers.region_id: "N:1"}
synonym_hints: {revenue: orders.amount}
```
SQL draft uses region names in lowercase (from enum hint), joins through customer, groups by region.

**Input:** User: "customers who bought product X".
**Output evidence:** `candidate_tables: [customers, orders, order_items, products]`, join keys including the bridge `order_items`, cardinality tag on `order_items.product_id` = `N:1`. SQL uses `WHERE EXISTS` over order_items (not INNER JOIN) to avoid duplicates.

**Input:** Schema has two "revenue" candidates — `orders.amount` (40% populated) and `invoices.total` (95% populated).
**Output:** `invoices.total` wins evidence rank due to populated ratio. Summary notes: "Using invoices.total as the revenue source — orders.amount was 60% null."

**Input:** Stale schema profile (> 60 min old) + user query arrives.
**Output:** Current turn uses stale profile (acknowledged in log); background thread triggers `profile_connection()`; next turn uses fresh.
