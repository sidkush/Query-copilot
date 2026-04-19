---
name: batch-query-optimization
description: When to run queries in parallel vs serial, connection pool limits, dependency DAGs for multi-tile dashboard builds and multi-step analysis
priority: 3
tokens_budget: 900
applies_to: dashboard-build, multi-step-agent
---

# Batch Query Optimization — AskDB AgentEngine

## Serial vs parallel decision

Default to **serial**. Go parallel only when:
1. Queries are independent (no shared CTE, no output-of-A-feeds-B).
2. Connection pool has capacity (see limits below).
3. User-perceived latency is actually the bottleneck (e.g., dashboard build with > 3 tiles).

## Connection pool limits

Concrete from `config-defaults.md`:
- `THREAD_POOL_MAX_WORKERS` = 32 (bounded 4–256).
- Per-user active agent sessions = 2.
- Per-user connections = 10.

**Per-dashboard-build cap: 4 parallel queries.** Higher risks starving other users' sessions on the shared pool. Adjustable via feature flag `AGENT_DASHBOARD_PARALLELISM` (default 4).

## Dependency DAG

For each batch, build a DAG:
- Nodes = queries / tiles.
- Edges = "B requires A's result" (e.g., tile 2 filters by customer IDs from tile 1).

Execute **topological layers in parallel**; serialize across layers.

Algorithm (pseudo):
```
layers = toposort(dag)
for layer in layers:
    asyncio.gather(*[run_query(n) for n in layer], max_concurrency=4)
```

Most dashboards collapse to a single layer (all independent KPIs). Funnel dashboards often have 2 layers (stage-1 query feeds stage-2 filter).

## Backpressure

If pool at capacity:
- Queue new queries (in-memory `asyncio.Queue` scoped to session).
- Surface SSE `{"type":"queued","position":n}` to user.
- On timeout waiting for slot (> 10 s): fall back to serial for this batch.

## Per-DB-type tuning

| DB | Parallelism sweet spot | Notes |
|---|---|---|
| PostgreSQL | 4 per session | Connection-expensive; reuse from pool |
| BigQuery | 6 per session | Query-slot billing — cheap, go wider |
| Snowflake | 4 per session | Warehouse concurrency matters more than connection count |
| DuckDB (Turbo Twin) | 2 per session | Single-process — parallel mostly thread-level |
| MySQL / MSSQL | 3 per session | Pool more fragile under load |

## When to NOT batch

- If the first query errors, do not fire the rest — the DB may be degraded.
- If user cancelled.
- If the result of a pending query might change the plan (e.g., "if count > 100, build separate cohort tiles").
- If the queries touch a write-throttled warehouse (rare in read-only mode, but BigQuery slot exhaustion counts).

## Budget accounting

Each parallel query counts against the agent's tool-call budget individually — parallelism saves wall clock, not calls. A 5-tile dashboard still costs 5 `run_sql` calls in the budget.

## Interaction with Turbo Twin (Tier 2a)

If multiple queries in a batch could route to the DuckDB twin, prefer twin for 1–2 of them and live for the rest — twin is single-process and saturates fast. Route the simplest aggregates to twin; complex multi-join to live.

---

## Examples

**Input:** Dashboard build with 6 independent KPI tiles (revenue, customers, orders, AOV, refund rate, active users).
**Output:** DAG = single layer, 6 nodes. `asyncio.gather` with `max_concurrency=4`. First 4 fire; next 2 queue; first to complete triggers next queued. Total wall: ~2× slowest query instead of sum.

**Input:** Funnel dashboard: tile 1 "leads count", tile 2 "conversion rate of those leads", tile 3 "LTV of converted".
**Output:** DAG = 3 layers (2 depends on 1; 3 depends on 2). Serial execution — no parallelism gain.

**Input:** User has 3 agent sessions + 10 connections already. Starts a 5-tile dashboard build.
**Output:** Per-user session cap = 2. Reject the 3rd session with 429. In-session, tile builds proceed with `max_concurrency=4`.

**Input:** BigQuery dashboard with 10 tiles.
**Output:** `max_concurrency` bumped to 6 (BQ sweet spot). Still only 4 `asyncio` workers because global cap is 4 — per-DB tuning is aspirational, global cap wins.
