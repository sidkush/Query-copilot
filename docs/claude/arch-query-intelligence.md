## Scope

4-tier waterfall internals: SchemaTier → MemoryTier → TurboTier → LiveTier, ValidationGate, audit trail, frontend SSE step types. **On-demand** — read before touching the waterfall.

### Query Intelligence System (`/backend` — 6 modules)

Four-tier waterfall makes agent/chat/dashboard feel instant on big datasets. Each query routes through tiers in order; first hit wins.

```
User question
  → Tier 0: SchemaTier (schema_intelligence.py) — ~7ms
  │   Answers structural questions ("what tables?", "how many rows?") from cached metadata.
  │   Profiles DB on connect: table names, columns, row counts, indexes, partitions.
  │   Cache: .data/schema_cache/{conn_id}.json (atomic writes, TTL-based staleness).
  │   Hash-based drift detection: validate_freshness() compares cached vs live schema hash.
  │
  → Tier 1: MemoryTier (query_memory.py) — ~19ms
  │   Answers from anonymized query insights stored in ChromaDB.
  │   Stores SQL *intents* (anonymize_sql strips all literals → "SELECT col FROM t WHERE x = ?").
  │   Shared across users on the same DB (network effect). Scoped by conn_id.
  │   Collection: {QUERY_MEMORY_COLLECTION_PREFIX}{conn_id}.
  │   Auto-stored after every successful query; confidence boosted on positive feedback.
  │
  → Tier 2a: TurboTier (duckdb_twin.py) — <100ms
  │   Queries a local DuckDB replica (opt-in "Turbo Mode" per connection).
  │   Twin: .data/turbo_twins/{conn_id}.duckdb (sampled rows, max 50K/table).
  │   User-triggered via POST /connections/{conn_id}/turbo/enable (background sync).
  │   Cleaned up on disconnect. Refresh via /turbo/refresh.
  │
  → Tier 2b: LiveTier (query_decomposer.py) — seconds, streamed
      Final fallback — always answers. Agent generates SQL as usual.
      Can decompose queries into parallel sub-queries (by GROUP BY partition).
      Uses sqlglot for SQL parsing. Max 10 sub-queries.
```

**Routing logic** (`waterfall_router.py`): Strategy pattern — `WaterfallRouter` holds ordered `BaseTier` subclasses. `route_sync()` is sync-safe entry point (avoid event loop conflicts with FastAPI). `ValidationGate` checks schema hash before serving cached results; rejects empty hashes for data-returning tiers (memory/turbo).

**Module-level singleton**: `_waterfall_router` in `agent_routes.py` — never create per-request. Prevents ChromaDB client proliferation.

**Audit trail** (`audit_trail.py`): Append-only JSONL at `.data/audit/query_decisions.jsonl`. Logs every routing decision with conn_id, question hash, tiers checked, tier hit, schema hash. Thread-safe with buffered writes (flush, no per-entry fsync), auto-rotates at 50MB.

**Config** (`config.py`): `SCHEMA_CACHE_MAX_AGE_MINUTES` (60), `QUERY_MEMORY_ENABLED` (True), `QUERY_MEMORY_TTL_HOURS` (168), `TURBO_MODE_ENABLED` (True), `TURBO_TWIN_MAX_SIZE_MB` (500), `TURBO_TWIN_SAMPLE_PERCENT` (1.0), `DECOMPOSITION_ENABLED` (True), `DECOMPOSITION_MIN_ROWS` (1M), `STREAMING_PROGRESS_INTERVAL_MS` (1000).

**Frontend** (`AgentStepFeed.jsx`): Three new SSE step types (additive, Invariant-7):
- `tier_routing` — amber badge: "Checking intelligence tiers..."
- `progress` — progress bar with elapsed/estimated time or sub-query count
- `tier_hit` — green badge: "Answered from team knowledge (3m ago)" / "Answered from Turbo Mode"

**Store** (`store.js`): `agentTierInfo`, `turboStatus`, `queryIntelligence`, `setTurboStatus()`, `setQueryIntelligence()`.

**API** (`api.js`): `enableTurbo()`, `disableTurbo()`, `getTurboStatus()`, `refreshTurbo()`, `getSchemaProfile()`, `refreshSchema()`.

## See also
- `arch-backend.md` — `agent_routes.py` hosts the `_waterfall_router` singleton.
- `config-defaults.md` — `SCHEMA_CACHE_MAX_AGE_MINUTES`, `QUERY_MEMORY_TTL_HOURS`, `TURBO_TWIN_MAX_SIZE_MB`, `DECOMPOSITION_MIN_ROWS`, budget values.
- `security-core.md` — `query_twin()` must validate SQL; query memory stores *anonymized* intents only.
