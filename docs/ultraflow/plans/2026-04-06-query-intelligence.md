# Plan: Self-Learning Query Intelligence System
**Spec**: `docs/ultraflow/specs/UFSD-2026-04-06-query-intelligence.md`
**UFSD**: Combined Theme 2+3 — Phased delivery of full hardened waterfall
**Approach**: 4-phase incremental build: Schema Intelligence → Query Memory → DuckDB Turbo → Decomposition
**Branch**: `feature/query-intelligence`

## Assumption Registry
- ASSUMPTION: Schema metadata (indexes, partitions, row counts) is available via SQLAlchemy Inspector for all 18 DB types — UNVALIDATED for SAP HANA, IBM DB2, Databricks (risk item)
- ASSUMPTION: ChromaDB semantic search on anonymized SQL intents achieves ≥85% hit rate for repeated patterns — UNVALIDATED (risk item, measure after Phase 2)
- ASSUMPTION: DuckDB in-process can handle 500MB-1GB twin files without blocking the FastAPI event loop — validated (DuckDB uses memory-mapped I/O, non-blocking reads)
- ASSUMPTION: Schema changes < 1/hour per DB connection — validated (typical analytics workload)
- ASSUMPTION: Existing SSE event format (`{type, content, tool_name, ...}`) can be extended with new types without breaking frontend — validated (frontend uses `type` switch, unknown types ignored)
- ASSUMPTION: 80/20 rule holds — 80% of queries hit 20% of tables — UNVALIDATED (risk item, measure with query_stats.json)

## Invariant List
- Invariant-1: Read-only DB enforcement (driver + validator + connector) must never be weakened
- Invariant-2: PII masking via `mask_dataframe()` must run before data reaches users or LLM
- Invariant-3: Two-step query flow (generate → execute) must not be collapsed
- Invariant-4: Agent guardrails preserved (code values: MAX_TOOL_CALLS=12, WALL_CLOCK_LIMIT=60s per segment, ABSOLUTE_WALL_CLOCK_LIMIT=600s, MAX_SQL_RETRIES=3; CLAUDE.md documents earlier limits of 6/30s — code is authoritative)
- Invariant-5: ChromaDB namespace isolation per connection maintained
- Invariant-6: Atomic file writes (write-then-rename) pattern preserved for all new file storage
- Invariant-7: Existing SSE event types backward-compatible (new types additive only)

## Failure Mode Map
1. FM-1: Waterfall routing becomes tangled if/else — mitigate with strategy pattern (each tier is a class with `can_answer()` + `answer()`)
2. FM-2: ChromaDB collection pollution — query memory intents stored in SEPARATE collection from schema/examples
3. FM-3: DuckDB twin sync fails silently on some DB types — explicit error logging + fallback to live query
4. FM-4: New SSE event types break existing frontend — only ADD new types, never modify existing ones
5. FM-5: New tiers add latency to happy path — each tier has <50ms overhead check; skip tier if overhead exceeds benefit

---

## Phase 1: Schema Intelligence + Enhanced Streaming (Week 1-2)

### Task 1.1: Create schema_intelligence.py (~5 min)
- **Files**: `backend/schema_intelligence.py` (create)
- **Intent**: New module `SchemaIntelligence` class that extracts and caches enriched metadata on connect:
  - `profile_connection(db_connector, conn_id)` → `SchemaProfile` dataclass
  - `SchemaProfile`: tables (name, row_count_estimate, columns, indexes, partitions, primary_keys, foreign_keys)
  - Uses `db_connector.get_schema_info()` + additional queries for row counts (`SELECT reltuples FROM pg_class` for PG, `SHOW TABLE EXTENDED` for MySQL, etc.)
  - Caches to `.data/user_data/{prefix}/schema_cache/{conn_id}.json` with atomic writes
  - `get_profile(conn_id)` → cached profile or None
  - `invalidate(conn_id)` → deletes cache file
  - `schema_hash(profile)` → MD5 of sorted table names + column names + types (for staleness detection)
  - `is_stale(conn_id, max_age_minutes=60)` → bool
- **Invariants**: Invariant-1 (read-only — only SELECT queries for metadata), Invariant-6 (atomic writes)
- **Assumptions**: Row count estimation queries exist for all supported DB types
- **Test**: `python -c "from schema_intelligence import SchemaIntelligence; si = SchemaIntelligence(); print('OK')"` → expects `OK`
- **Invariant-Check**: Verify all metadata queries are SELECT-only: `grep -c "INSERT\|UPDATE\|DELETE\|DROP\|ALTER" backend/schema_intelligence.py` → expects `0`
- **Commit**: `feat: add SchemaIntelligence module for metadata caching and staleness detection`

### Task 1.2: Add config settings for query intelligence (~3 min)
- **Files**: `backend/config.py` (modify)
- **Intent**: Add new settings to `Settings` class:
  ```python
  # Query Intelligence
  SCHEMA_CACHE_MAX_AGE_MINUTES: int = 60
  SCHEMA_CACHE_DIR: str = ".data/schema_cache"
  QUERY_MEMORY_ENABLED: bool = True
  QUERY_MEMORY_COLLECTION_PREFIX: str = "query_memory_"
  QUERY_MEMORY_TTL_HOURS: int = 168  # 7 days
  TURBO_MODE_ENABLED: bool = True
  TURBO_TWIN_DIR: str = ".data/turbo_twins"
  TURBO_TWIN_MAX_SIZE_MB: int = 500
  TURBO_TWIN_SAMPLE_PERCENT: float = 1.0  # 1% sample for TB-scale
  TURBO_TWIN_REFRESH_HOURS: int = 4
  DECOMPOSITION_ENABLED: bool = True
  DECOMPOSITION_MIN_ROWS: int = 1_000_000  # only decompose if estimated > 1M rows
  STREAMING_PROGRESS_INTERVAL_MS: int = 1000
  ```
- **Invariants**: none
- **Test**: `python -c "from config import settings; print(settings.SCHEMA_CACHE_MAX_AGE_MINUTES)"` → expects `60`
- **Commit**: `feat: add query intelligence configuration settings`

### Task 1.3: Integrate schema intelligence into connection flow (~5 min)
- **Files**: `backend/routers/connection_routes.py` (modify), `backend/models.py` (modify)
- **Intent**:
  - Add `schema_profile: Optional[SchemaProfile] = None` field to `ConnectionEntry`
  - In `connect()` endpoint, after `engine.train_schema()`, call `SchemaIntelligence.profile_connection()` and store result in `ConnectionEntry.schema_profile`
  - Add `GET /api/v1/connections/{conn_id}/schema-profile` endpoint returning cached profile
  - Add `POST /api/v1/connections/{conn_id}/refresh-schema` endpoint that re-profiles and updates hash
- **Invariants**: Invariant-5 (namespace isolation — profile is per conn_id)
- **Test**: Start backend, connect to test DB, call `GET /api/v1/connections/{conn_id}/schema-profile` → expects JSON with `tables`, `schema_hash`, `cached_at`
- **Invariant-Check**: Verify profile is scoped to conn_id: `grep "conn_id" backend/routers/connection_routes.py | grep -c "schema_profile"` → expects ≥2
- **Commit**: `feat: integrate schema intelligence into connection flow`

### Task 1.4: Create waterfall router framework (~5 min)
- **Files**: `backend/waterfall_router.py` (create)
- **Intent**: Strategy pattern for tier routing:
  ```python
  class TierResult:
      hit: bool
      tier_name: str  # "schema", "memory", "turbo", "live"
      data: Optional[dict]  # {answer, confidence, source, cache_age_seconds}
      metadata: dict  # {tier_checked: [], time_ms: int}

  class BaseTier(ABC):
      @abstractmethod
      async def can_answer(self, question, schema_profile, conn_id) -> bool
      @abstractmethod
      async def answer(self, question, schema_profile, conn_id) -> TierResult

  class WaterfallRouter:
      tiers: List[BaseTier]  # ordered by priority
      async def route(self, question, schema_profile, conn_id) -> TierResult
      # Tries each tier in order, returns first hit
      # Logs tier_checked list and total routing time
  ```
  - Phase 1 implements only `SchemaTier` (answers structural questions like "what tables exist?", "how many rows?")
  - Placeholder classes for `MemoryTier`, `TurboTier`, `LiveTier` (return `hit=False`)
- **Invariants**: Invariant-2 (PII masking — any tier returning data must call mask_dataframe)
- **Test**: `python -c "from waterfall_router import WaterfallRouter, SchemaTier; wr = WaterfallRouter([SchemaTier()]); print('OK')"` → expects `OK`
- **Invariant-Check**: `grep -c "mask_dataframe" backend/waterfall_router.py` → expects ≥1
- **Commit**: `feat: add waterfall router framework with strategy pattern`

### Task 1.5: Integrate waterfall into agent_engine.py (~5 min)
- **Files**: `backend/agent_engine.py` (modify)
- **Intent**:
  - Add `waterfall_router` parameter to `AgentEngine.__init__()` (optional, default None)
  - In `find_relevant_tables` tool: if waterfall router available, use schema_profile for instant table listing instead of ChromaDB search
  - In `inspect_schema` tool: if schema_profile has cached DDL + stats, return enriched info (row counts, indexes) alongside DDL
  - Add new SSE step type `"tier_routing"` emitted when waterfall checks tiers: `{"type": "tier_routing", "content": "Checking schema cache...", "tier": "schema", "hit": true}`
  - Preserve all existing tool behavior as fallback when waterfall is None
- **Invariants**: Invariant-4 (guardrails preserved), Invariant-7 (new SSE type is additive)
- **Test**: Start backend, run agent query "what tables do I have?" → SSE stream should include `tier_routing` event with `hit: true`
- **Invariant-Check**: `grep -c "MAX_TOOL_CALLS\|WALL_CLOCK_LIMIT" backend/agent_engine.py` → count unchanged from before edit
- **Commit**: `feat: integrate waterfall router into agent engine with tier_routing SSE events`

### Task 1.6: Enhanced SSE streaming with progress indicators (~5 min)
- **Files**: `backend/routers/agent_routes.py` (modify), `backend/routers/query_routes.py` (modify)
- **Intent**:
  - Add `"progress"` SSE event type: `{"type": "progress", "content": "Querying 200M rows...", "elapsed_ms": 3500, "estimated_total_ms": 15000}`
  - In `execute` endpoint: before running query, use `schema_profile.row_count_estimate` to calculate estimated time
  - Emit progress events every `STREAMING_PROGRESS_INTERVAL_MS` during long-running queries via background task
  - Add `"tier_hit"` SSE event: `{"type": "tier_hit", "tier": "schema|memory|turbo|live", "cache_age_seconds": 120}`
- **Invariants**: Invariant-7 (additive SSE types only), Invariant-3 (two-step flow preserved)
- **Test**: Execute a query on a table with >1000 rows → SSE stream should include `progress` events with `elapsed_ms` increasing
- **Invariant-Check**: `grep -c "def generate\|def execute" backend/routers/query_routes.py` → expects ≥2 (both endpoints still exist separately)
- **Commit**: `feat: add progress and tier_hit SSE events for streaming feedback`

### Task 1.7: Frontend — streaming progress UI (~5 min)
- **Files**: `frontend/src/components/agent/AgentStepFeed.jsx` (modify), `frontend/src/store.js` (modify)
- **Intent**:
  - Add `StepIcon` cases for `"tier_routing"`, `"progress"`, `"tier_hit"`
  - `tier_routing` → shows which tier is being checked with animated dots
  - `progress` → shows progress bar with elapsed/estimated time
  - `tier_hit` → shows badge: "Answered from schema cache (2 min ago)" or "Querying live database..."
  - Add `agentTierInfo` to store: `{tier: string, cacheAge: number, estimatedMs: number, elapsedMs: number}`
- **Invariants**: Invariant-7 (unknown step types still render gracefully via default case)
- **Test**: `npm run build` from frontend/ → expects 0 errors
- **Commit**: `feat: add streaming progress indicators and tier badges to agent UI`

### Task 1.8: Schema staleness validation (~3 min)
- **Files**: `backend/schema_intelligence.py` (modify)
- **Intent**:
  - Add `validate_freshness(conn_id, db_connector)` method:
    - Quick-check: compare cached schema_hash with live hash (runs 1-2 lightweight queries)
    - If hash mismatch → invalidate cache, re-profile, return `{stale: true, refreshed: true}`
    - If hash match → update `last_validated_at` timestamp, return `{stale: false}`
  - Call `validate_freshness()` at start of every waterfall route if cache age > `SCHEMA_CACHE_MAX_AGE_MINUTES / 2`
  - Log staleness events for monitoring
- **Invariants**: Invariant-1 (validation queries are SELECT-only)
- **Assumptions**: Schema hash comparison takes <200ms (single lightweight query)
- **Test**: Manually change a table, call refresh-schema → expects `stale: true, refreshed: true`
- **Invariant-Check**: `grep -c "SELECT\|SHOW\|DESCRIBE\|PRAGMA" backend/schema_intelligence.py` → ensures only read queries
- **Commit**: `feat: add schema staleness detection via hash comparison`

---

## Phase 2: Shared Query Memory + Validation Gates (Week 2-3)

### Task 2.1: Create query_memory.py (~5 min)
- **Files**: `backend/query_memory.py` (create)
- **Intent**: `QueryMemory` class for anonymized SQL intent storage:
  - `store_insight(conn_id, question, sql_intent, result_summary, columns, row_count)` → stores in ChromaDB collection `query_memory_{conn_id}`
  - `sql_intent` = parameterized SQL pattern (literals replaced with `?`, table/column names preserved)
  - Anonymization: strip all literal values, user identifiers, timestamps → keep only structure
  - `find_similar(conn_id, question, threshold=0.75)` → returns top match with `{intent, summary, confidence, stored_at}`
  - `is_fresh(insight, max_age_hours)` → checks TTL
  - `cleanup_stale(conn_id)` → removes insights older than `QUERY_MEMORY_TTL_HOURS`
  - Uses existing ChromaDB client from query_engine.py (shared `_chroma_client`)
- **Invariants**: Invariant-5 (separate collection per conn_id), Invariant-2 (no raw data stored — only intents and summaries)
- **Test**: `python -c "from query_memory import QueryMemory; qm = QueryMemory(); print('OK')"` → expects `OK`
- **Invariant-Check**: `grep -c "conn_id" backend/query_memory.py` → expects ≥5 (collection scoping)
- **Commit**: `feat: add QueryMemory module for anonymized SQL intent storage`

### Task 2.2: Implement MemoryTier in waterfall router (~5 min)
- **Files**: `backend/waterfall_router.py` (modify)
- **Intent**:
  - Implement `MemoryTier(BaseTier)` class:
    - `can_answer()`: calls `query_memory.find_similar()`, returns True if confidence ≥ threshold
    - `answer()`: returns stored insight with `tier_name="memory"`, `cache_age_seconds` from stored_at
  - Add to `WaterfallRouter.tiers` list (after SchemaTier, before TurboTier)
- **Invariants**: Invariant-2 (summaries already PII-masked when stored)
- **Test**: Store an insight, query with similar question → expects `tier_hit` with `tier="memory"`
- **Invariant-Check**: `grep -c "mask_dataframe" backend/waterfall_router.py` → expects ≥1 (PII masking in data-returning tiers)
- **Commit**: `feat: implement MemoryTier in waterfall router`

### Task 2.3: Auto-store insights after successful queries (~5 min)
- **Files**: `backend/agent_engine.py` (modify), `backend/routers/query_routes.py` (modify)
- **Intent**:
  - After `run_sql` tool succeeds in agent: extract SQL intent (parameterize literals), generate brief summary, store via `QueryMemory.store_insight()`
  - After `/api/v1/queries/execute` succeeds: same pattern — store intent + summary
  - After positive feedback (`/api/v1/queries/feedback` with `correct=True`): boost confidence of matching insight
  - Anonymization function `anonymize_sql(sql)`: replaces string/numeric literals with `?`, preserves structure
- **Invariants**: Invariant-2 (summary generated from PII-masked data), Invariant-5 (scoped to conn_id)
- **Test**: Run agent query, check ChromaDB collection `query_memory_{conn_id}` has new entry → expects count increased by 1
- **Invariant-Check**: `grep -c "anonymize_sql\|strip.*literal" backend/agent_engine.py` → expects ≥1 (SQL anonymization before storage)
- **Commit**: `feat: auto-store anonymized query insights after successful execution`

### Task 2.4: Validation gates between tiers (~3 min)
- **Files**: `backend/waterfall_router.py` (modify)
- **Intent**:
  - Before using any cached result, validate schema_hash matches current profile
  - `ValidationGate` class: `validate(tier_result, current_schema_hash)` → True if schema hasn't drifted
  - If validation fails: log warning, skip tier, fall through to next
  - Emit SSE event: `{"type": "tier_routing", "content": "Cache invalidated (schema changed), querying live...", "tier": "memory", "hit": false, "reason": "schema_drift"}`
- **Invariants**: none directly (this IS the safety mechanism)
- **Test**: Store insight, change schema hash, query → expects fallthrough to live tier with `reason: "schema_drift"`
- **Commit**: `feat: add validation gates for schema drift detection between tiers`

### Task 2.5: Frontend — memory hit indicator (~3 min)
- **Files**: `frontend/src/components/agent/AgentStepFeed.jsx` (modify)
- **Intent**:
  - When `tier_hit` event has `tier="memory"`: show "Answered from team knowledge (stored 3 days ago)" with a brain icon
  - Show confidence score as subtle badge
  - Add "Refresh with live data" button that re-runs query bypassing cache (sends `force_live=true` param)
- **Invariants**: Invariant-7 (additive UI, doesn't break existing rendering)
- **Test**: `npm run build` → expects 0 errors
- **Commit**: `feat: add memory hit indicator and refresh button to agent UI`

---

## Phase 3: DuckDB Turbo Mode + Audit Trail (Week 4-5)

### Task 3.1: Create duckdb_twin.py (~5 min)
- **Files**: `backend/duckdb_twin.py` (create)
- **Intent**: `DuckDBTwin` class for local replica management:
  - `create_twin(conn_id, db_connector, schema_profile, sample_percent=1.0)` → creates `.data/turbo_twins/{conn_id}.duckdb`
  - Sync strategy: for each table in profile, `INSERT INTO twin_table SELECT * FROM source_table TABLESAMPLE ({sample_percent} PERCENT)` (via source DB connector)
  - For aggregation tables: pre-compute common aggregates (SUM, COUNT, AVG per numeric column grouped by date/category columns)
  - `query_twin(conn_id, sql)` → execute on local DuckDB, return DataFrame
  - `get_twin_info(conn_id)` → `{size_mb, tables, last_sync, sample_percent, schema_hash}`
  - `refresh_twin(conn_id, db_connector)` → re-sync changed tables only (compare row counts)
  - `delete_twin(conn_id)` → remove .duckdb file
  - Max file size enforced via `TURBO_TWIN_MAX_SIZE_MB`
  - Background sync via `asyncio.to_thread()` to avoid blocking
- **Invariants**: Invariant-1 (source queries are SELECT-only), Invariant-6 (atomic writes — write to temp, rename), Invariant-2 (PII masking on twin query results)
- **Assumptions**: DuckDB handles 500MB-1GB files in-process without blocking
- **Test**: `python -c "from duckdb_twin import DuckDBTwin; dt = DuckDBTwin(); print('OK')"` → expects `OK`
- **Invariant-Check**: Verify no standalone mutations: `python -c "import re; code=open('backend/duckdb_twin.py').read(); dml=re.findall(r'(?i)\\b(UPDATE|DELETE\\s+FROM|DROP|ALTER|TRUNCATE)\\b', code); print(len(dml))"` → expects `0` (INSERT INTO...SELECT for twin creation is permitted as read-from-source)
- **Commit**: `feat: add DuckDBTwin module for local replica management`

### Task 3.2: Turbo Mode toggle endpoints (~5 min)
- **Files**: `backend/routers/connection_routes.py` (modify)
- **Intent**:
  - `POST /api/v1/connections/{conn_id}/turbo/enable` → starts background twin creation, returns immediately with `{status: "syncing", estimated_minutes: N}`
  - `POST /api/v1/connections/{conn_id}/turbo/disable` → deletes twin, returns `{status: "disabled"}`
  - `GET /api/v1/connections/{conn_id}/turbo/status` → `{enabled, syncing, size_mb, last_sync, tables_synced, schema_hash}`
  - `POST /api/v1/connections/{conn_id}/turbo/refresh` → triggers re-sync
  - Add `turbo_enabled: bool = False` and `turbo_twin: Optional[DuckDBTwin] = None` to `ConnectionEntry`
- **Invariants**: Invariant-5 (twin scoped to conn_id)
- **Test**: Enable turbo on test connection → `GET status` → expects `{enabled: true, syncing: true|false}`
- **Invariant-Check**: `grep -c "conn_id" backend/routers/connection_routes.py | head -1` → turbo endpoints scoped to conn_id (expects ≥3 new references)
- **Commit**: `feat: add Turbo Mode toggle endpoints for DuckDB twin management`

### Task 3.3: Implement TurboTier in waterfall router (~5 min)
- **Files**: `backend/waterfall_router.py` (modify)
- **Intent**:
  - Implement `TurboTier(BaseTier)`:
    - `can_answer()`: checks `connection_entry.turbo_enabled` and twin exists and is not stale
    - `answer()`: rewrites SQL for DuckDB dialect (via sqlglot), executes on twin, returns with `cache_age_seconds` from last_sync
    - Handles DuckDB-specific SQL differences (date functions, type casting)
  - Add validation gate: compare twin's schema_hash with live schema_hash before querying
  - Fallback: if twin query fails, log error and fall through to LiveTier
- **Invariants**: Invariant-2 (mask_dataframe on twin results), Invariant-1 (twin is read-only by design)
- **Test**: Enable turbo, run analytical query → expects result from twin with `tier="turbo"` in SSE
- **Invariant-Check**: `grep -c "mask_dataframe" backend/waterfall_router.py` → expects ≥2 (one per data-returning tier)
- **Commit**: `feat: implement TurboTier with DuckDB twin querying and dialect translation`

### Task 3.4: Create audit_trail.py (~3 min)
- **Files**: `backend/audit_trail.py` (create)
- **Intent**: Append-only audit log for all cache/routing decisions:
  - `log_tier_decision(conn_id, email_hash, question_hash, tier_checked, tier_hit, schema_hash, cache_age_s, reason)`
  - Stores to `.data/audit/query_decisions.jsonl` (one JSON object per line)
  - `log_turbo_event(conn_id, event_type, details)` — sync started/completed/failed/disabled
  - `log_memory_event(conn_id, event_type, intent_hash)` — stored/retrieved/expired
  - Email hashed (SHA256 prefix) for anonymization
  - Question hashed (SHA256) — not stored in plaintext
  - Auto-rotate log files at 50MB
  - `get_recent_decisions(conn_id, limit=100)` for ops visibility
- **Invariants**: Invariant-6 (atomic writes — append mode with flush)
- **Test**: `python -c "from audit_trail import log_tier_decision; log_tier_decision('c1','eh','qh',['schema','memory'],'memory','hash1',120,'hit'); print('OK')"` → expects `OK` and `.data/audit/query_decisions.jsonl` has 1 line
- **Commit**: `feat: add append-only audit trail for tier routing decisions`

### Task 3.5: Integrate audit trail into waterfall (~3 min)
- **Files**: `backend/waterfall_router.py` (modify)
- **Intent**:
  - After every `route()` call, log tier decision via `audit_trail.log_tier_decision()`
  - After turbo enable/disable/refresh, log via `audit_trail.log_turbo_event()`
  - After memory store/retrieve, log via `audit_trail.log_memory_event()`
- **Invariants**: none (audit is observability, not functional)
- **Test**: Run a query, check `.data/audit/query_decisions.jsonl` → expects new entry
- **Commit**: `feat: integrate audit trail logging into waterfall router and turbo mode`

### Task 3.6: Frontend — Turbo Mode UI (~5 min)
- **Files**: `frontend/src/components/ConnectionManager.jsx` or equivalent (modify), `frontend/src/api.js` (modify), `frontend/src/store.js` (modify)
- **Intent**:
  - Add Turbo Mode toggle switch in connection settings panel
  - Show sync status: "Syncing... 45% (3/7 tables)" → "Turbo Mode Active (synced 2h ago)"
  - Add `turboStatus` to connection store: `{enabled, syncing, progress, lastSync, sizeMb}`
  - API functions: `enableTurbo(connId)`, `disableTurbo(connId)`, `getTurboStatus(connId)`, `refreshTurbo(connId)`
  - When turbo active, show lightning bolt icon next to connection name in sidebar
  - When `tier_hit` event has `tier="turbo"`: show "Answered from Turbo Mode (synced 2h ago)" with lightning icon
- **Invariants**: Invariant-7 (additive UI)
- **Test**: `npm run build` → expects 0 errors
- **Commit**: `feat: add Turbo Mode toggle UI with sync status and lightning badge`

---

## Phase 4: Query Decomposition + Polish (Week 5-6)

### Task 4.1: Create query_decomposer.py (~5 min)
- **Files**: `backend/query_decomposer.py` (create)
- **Intent**: `QueryDecomposer` class for splitting queries into parallel sub-queries:
  - `can_decompose(sql, schema_profile)` → bool (True if query has GROUP BY on a partitioned/categorical column with known distinct values)
  - `decompose(sql, schema_profile)` → `List[SubQuery]` where each `SubQuery` has `{sql, partition_value, estimated_rows}`
  - Decomposition strategies:
    - By partition key (if schema_profile shows partitioning): add WHERE clause per partition
    - By categorical column (if cardinality < 20): add WHERE clause per distinct value
    - By date range (if date column detected): split into month/quarter chunks
  - Uses sqlglot for SQL parsing and rewriting (already a dependency)
  - `merge_results(sub_results: List[DataFrame])` → combined DataFrame
  - Max 10 sub-queries per decomposition (prevent explosion)
- **Invariants**: Invariant-1 (decomposed queries are still SELECT-only, validated individually)
- **Test**: `python -c "from query_decomposer import QueryDecomposer; qd = QueryDecomposer(); print('OK')"` → expects `OK`
- **Invariant-Check**: Each sub-query must pass through `sql_validator.validate()` before execution
- **Commit**: `feat: add QueryDecomposer for parallel sub-query splitting`

### Task 4.2: Implement LiveTier with decomposition + streaming (~5 min)
- **Files**: `backend/waterfall_router.py` (modify)
- **Intent**:
  - Implement `LiveTier(BaseTier)`:
    - `can_answer()` → always True (final fallback)
    - `answer()`:
      1. Check if decomposable via `QueryDecomposer.can_decompose()`
      2. If yes: decompose → execute sub-queries in parallel via `asyncio.gather()` → stream each result as it completes → merge
      3. If no: execute single query with progress events (elapsed + estimated time)
    - Yield `"progress"` SSE events as each sub-query completes: `{"type": "progress", "content": "Region NA: $12.3M ✓ (1/5)", "sub_query_index": 0, "total_sub_queries": 5}`
  - Time estimation: `estimated_seconds = (row_count_estimate / 1_000_000) * 3` (rough heuristic, refined over time)
- **Invariants**: Invariant-1 (each sub-query validated), Invariant-2 (mask_dataframe on each sub-result), Invariant-4 (total sub-queries count toward MAX_TOOL_CALLS)
- **Test**: Run query on table with known partitions → SSE stream shows individual sub-query progress events
- **Invariant-Check**: `grep -c "validate\|mask_dataframe" backend/waterfall_router.py` → count increased
- **Commit**: `feat: implement LiveTier with query decomposition and progressive streaming`

### Task 4.3: Frontend — decomposition progress UI (~5 min)
- **Files**: `frontend/src/components/agent/AgentStepFeed.jsx` (modify)
- **Intent**:
  - When `progress` events have `sub_query_index` field: render as decomposition progress
  - Show: "Decomposing query into 5 parts..." → "Part 1/5: North America ✓" → "Part 2/5: Europe ✓" → etc.
  - Animated progress bar showing completed/total sub-queries
  - When all complete: "All 5 parts complete. Merging results..."
  - For non-decomposed queries: show elapsed time counter + estimated total: "Querying... 15s / ~30s estimated"
- **Invariants**: Invariant-7 (additive rendering)
- **Test**: `npm run build` → expects 0 errors
- **Commit**: `feat: add decomposition progress visualization to agent UI`

### Task 4.4: Time estimation service (~3 min)
- **Files**: `backend/schema_intelligence.py` (modify)
- **Intent**:
  - Add `estimate_query_time(sql, schema_profile)` method:
    - Parse SQL to identify target tables
    - Look up row counts from schema_profile
    - Base estimate: `row_count / 1M * 3 seconds` (adjustable per DB type)
    - Adjust for: indexed columns in WHERE (-50%), JOINs (+100% per join), GROUP BY (-20% if indexed)
    - Return `{estimated_seconds, confidence: "low"|"medium"|"high", factors: [str]}`
  - Store actual execution times in schema_profile for calibration over time
- **Invariants**: none (estimation only, no data access)
- **Test**: `python -c "from schema_intelligence import SchemaIntelligence; si = SchemaIntelligence(); est = si.estimate_query_time('SELECT * FROM big_table', mock_profile); print(est['estimated_seconds'] > 0)"` → expects `True`
- **Commit**: `feat: add query time estimation based on schema statistics`

### Task 4.5: End-to-end waterfall integration test (~3 min)
- **Files**: `backend/test_waterfall.py` (create)
- **Intent**: Manual integration test script (not pytest) that:
  - Connects to a test database
  - Profiles schema (Tier 0)
  - Runs a query → stores insight (Tier 1 population)
  - Runs same query again → expects memory hit (Tier 1)
  - Enables Turbo → creates twin (Tier 2a)
  - Runs analytical query → expects turbo hit (Tier 2a)
  - Runs complex query → expects decomposition or live fallthrough (Tier 2b)
  - Checks audit trail has entries for all decisions
  - Prints timing for each tier
- **Invariants**: all (comprehensive check)
- **Test**: `python test_waterfall.py` → expects "All tiers validated successfully" with timing breakdown
- **Commit**: `feat: add end-to-end waterfall integration test script`

### Task 4.6: Polish — connection settings UI update (~3 min)
- **Files**: `frontend/src/store.js` (modify), `frontend/src/api.js` (modify)
- **Intent**:
  - Add `queryIntelligence` slice to store: `{schemaProfileLoaded, memoryInsightCount, turboStatus, lastTierHit}`
  - Update `agentRun` API to parse new SSE event types and update store
  - Add `forceRefresh` option to agent run: skips all caches, goes straight to live query
  - Ensure all new API endpoints are registered in api.js
- **Invariants**: Invariant-7 (backward compatible)
- **Test**: `npm run build` → expects 0 errors; `npm run lint` → expects 0 errors
- **Commit**: `feat: finalize query intelligence store integration and API endpoints`

---

## Scope Validation
Tasks in scope: All tasks map to UFSD scope items (schema cache, query memory, DuckDB twin, decomposition, streaming, audit trail, UI toggle)
Tasks flagged: none — no scope deviation detected

## Counterfactual Gate
**Strongest argument AGAINST this plan**: The plan adds 6 new backend modules (schema_intelligence, query_memory, duckdb_twin, waterfall_router, query_decomposer, audit_trail) to a codebase that currently has 0 automated tests. If any module has a bug, there's no test suite to catch regressions, and the waterfall routing logic (4 tiers × validation gates × fallback paths) creates a combinatorial explosion of code paths that manual testing cannot cover.

**We accept this plan because**: (1) Each tier is independent with a clear `can_answer()`/`answer()` interface — a bug in one tier causes fallthrough to the next, not a crash. (2) The audit trail (Task 3.4) provides production observability even without unit tests. (3) Task 4.5 is a comprehensive integration test script. (4) Phase 1 ships streaming + schema cache which delivers perceived speed improvement with minimal risk before the complex tiers are added.

> Impact estimates are REASONED, not PROVEN — assumption chain: [perceived speed improvement from streaming is based on UX research (Nielsen 1993), not measured in this codebase; DuckDB sub-100ms claim is based on DuckDB benchmarks on columnar data, not tested with this specific sync approach; 85% memory hit rate is industry average for semantic search, not validated on QueryCopilot query patterns].

## MVP-Proof
- "Sub-100ms DuckDB queries" → DuckDB TPC-H benchmarks show <50ms for aggregation queries on 1GB datasets (DuckDB Labs, 2024)
- "80% of queries answered from cache/memory" → UNVALIDATED until Phase 2 deployed and measured
- "Perceived speed improvement from streaming" → Nielsen's response time research (1993): users perceive systems as responsive when feedback appears within 1 second

## Fingerprint
Phase 1-4 complete: QueryCopilot V1 has a 4-tier waterfall router (schema → memory → turbo → live) with progressive SSE streaming, anonymized query memory, opt-in DuckDB Turbo Mode, query decomposition, audit trail, and schema staleness validation — all backward-compatible with existing agent/chat/dashboard flows.
