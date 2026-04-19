# Query Lifecycle — AskDB AgentEngine

## End-to-End Pipeline

```
1. USER INPUT (NL text or voice)
         ↓
2. INTENT PARSING
   - Extract entities (metrics, dimensions, filters, time range)
   - Detect ambiguity → resolve or ask
   - Detect domain → load domain skill file
         ↓
3. SCHEMA LOOKUP (TurboTier cache or live)
   - Confirm tables and columns exist
   - Detect join paths
   - Check for pre-aggregated columns
         ↓
4. TIER SELECTION
   - Schema tier → for metadata questions
   - Memory tier (ChromaDB) → for repeated queries
   - Turbo tier (DuckDB twin) → for most queries
   - Live tier (DataFusion) → when explicitly requested or cache miss
         ↓
5. SQL GENERATION
   - Apply domain patterns
   - Apply dialect rules
   - Apply aggregation rules
   - Apply NULL handling
   - Apply time intelligence
         ↓
6. SQL VALIDATION (6 layers)
   - Layer 1: Syntax check
   - Layer 2: Table/column existence
   - Layer 3: Type compatibility
   - Layer 4: Aggregation correctness (HAVING vs WHERE)
   - Layer 5: Security check (injection, permission, PII)
   - Layer 6: Performance estimate (cost/complexity)
         ↓
7. EXECUTION
   - Run query against selected tier
   - Handle timeout/error per error-handling.md
   - Return result set
         ↓
8. CHART SELECTION
   - Evaluate data shape (row count, column types, cardinality)
   - Select chart type per chart-selection.md
   - Route to RSR: SVG / Canvas / WebGL
         ↓
9. RENDERING
   - Apply theme and formatting rules
   - Generate tile title (insight format)
   - Apply cross-tile color consistency
         ↓
10. INSIGHT GENERATION
    - Generate AI summary per insight-generation.md
    - Detect anomalies
    - Suggest next question
         ↓
11. DELIVERY
    - Add tile to dashboard (or display in chat)
    - Update session memory
    - Announce completion
```

## Query Tier Decision Matrix

```python
def select_tier(query, schema_cache, user_request):
  # Tier 0: Pure metadata question
  if is_metadata_question(query):
    return "schema_tier"  # Returns instantly from cache
  
  # Tier 1: Memory cache hit
  if chromadb_similarity_search(query) > 0.92:
    return "memory_tier"  # Returns in < 100ms
  
  # Tier 2: TurboTier (DuckDB twin available)
  if duckdb_twin_available() and not user_force_live:
    return "turbo_tier"  # Returns in < 300ms typically
  
  # Tier 3: Live execution
  return "live_tier"  # DataFusion pushdown to warehouse
```

## Progressive Dual-Response

When Turbo/Memory tier returns a cached result:
1. Immediately yield cached result (< 300ms)
2. Simultaneously fire live query in background
3. When live result returns: compare with cached
4. If different: show visual diff, update with "✓ Verified with live data"
5. If same: show "✓ Verified — matches live data"

Display format during dual-response:
```
[TURBO] Showing cached result from [timestamp]
        Verifying with live query... ⟳
[LIVE]  ✓ Live data matches. Updated [N rows changed if any]
```

---

# Tool Budget Management — AskDB AgentEngine

## Budget Rules

- Standard budget: 100 tool calls per session
- Auto-extension: +20 calls when 80 used and work remains
- Hard limit: 200 calls (then must checkpoint and offer to continue fresh)
- Reserve: Always keep 10 calls in reserve for error recovery

## Budget-Aware Planning

Before starting any multi-step task, estimate:

```python
def estimate_budget(task):
  schema_calls = 3 if schema_not_cached else 0
  tile_calls = len(tiles_to_build) * 3.5  # avg per tile
  finalization_calls = 5
  error_buffer = 10
  
  total_estimate = schema_calls + tile_calls + finalization_calls + error_buffer
  
  if total_estimate > 85:
    warn_user("Large task (~{} tool calls). Building in phases.".format(total_estimate))
    return plan_phased_execution(task)
  
  return plan_sequential_execution(task)
```

## Phased Execution for Large Dashboards

When budget estimate > 85 calls:

```
Phase 1 (High value first):
  - KPI tiles (most important, always build first)
  - Primary trend chart
  Announce: "Phase 1 complete (6 tiles). Continue to Phase 2?"

Phase 2 (Supporting charts):
  - Breakdown charts
  - Comparison charts
  Announce: "Phase 2 complete (4 more tiles). Continue to Phase 3?"

Phase 3 (Detail):
  - Data tables
  - Drill-down charts
  Announce: "Dashboard complete (12 tiles total)."
```

## Budget Extension Protocol

When approaching limit (80 calls used):

```
Check: Is critical work remaining?
  YES → Auto-extend by 20. Log: "Budget extended to complete [remaining work]."
  NO → Finalize with what's built. Summarize what was and wasn't completed.

When hard limit reached (200 calls):
  → Checkpoint: Save all work to session memory
  → Report: "Completed [N] of [M] planned tiles. Resume in a new session."
  → The session context persists — resuming is seamless
```

## Tool Call Efficiency Rules

Batch where possible:
- Schema profiling → one comprehensive call, not per-table
- Chart formatting → apply to all tiles at once, not one by one
- Color assignment → one pass over all tiles at end

Never duplicate:
- If schema cached → don't re-profile
- If join path established → don't re-detect
- If user preference known → don't ask again

Cache everything:
- Schema metadata → session SQLite
- Join paths → session context
- Color assignments → session context
- User preferences → persistent user store
