# UFSD Summary
Feature: Two-phase data acceleration — DuckDB turbo cache with Progressive Dual-Response UX, upgradeable to materialized slice caching for TB-scale enterprise data.
Scope Baseline:
  In — DuckDB turbo tier hardening, Progressive Dual-Response SSE streaming (cached_result + live_correction events), slice cache architecture design, cache freshness indicators in UI, user-controlled refresh, config settings for cache sizes/TTLs, query frequency measurement harness.
  Out — Real-time CDC sync, hosting user data, multi-model LLM support, sample/demo database, cloud warehouse billing integration, Slice Cache implementation (Phase 2), deployment strategy.
Assumptions:
  1. DuckDB in-process handles 500MB-1GB twin files without blocking FastAPI event loop — VALIDATED (memory-mapped I/O)
  2. Progressive Dual-Response reuses existing SSE infrastructure — VALIDATED (frontend ignores unknown types, backend has no type validation, additive-only)
  3. 80/20 rule (80% queries hit 20% tables) — UNVALIDATED (measure post-launch with query_stats; fallback: even sampling across all tables)
  4. Slice suggestion hit rates from ChromaDB query_memory — UNVALIDATED (Phase 2; fallback: admin-only slice configuration)
  5. Enterprise accepts hybrid auto-suggest + admin-approve for slice management — UNVALIDATABLE (fallback: feature flag FEATURE_SLICE_AUTOSUGGEST=False)
  6. Demo users have their own database to connect — user's design choice (fallback: add sample SQLite/DuckDB dataset later)
  7. Multi-model support is orthogonal to cache architecture — VALIDATED (cache stores SQL results, sits below LLM layer)
Confidence: 5/5
Coverage: 7 explored / 8 visible. Uncovered: deployment strategy (deferred — not in scope).

---

# UFSD Detail

## Architecture: Combined DuckDB Everything + Materialized Slice Cache

### Phase 1: DuckDB Turbo + Progressive Dual-Response (Demo Launch)
- **DuckDB turbo tier** (existing TurboTier in waterfall_router.py): sampled local twins of user-connected databases
- **Progressive Dual-Response**: novel UX differentiator — no existing BI tool does this
  - Step 1: Waterfall hits DuckDB cache → yield `AgentStep(type="cached_result")` within 300ms
  - Step 2: Live query runs in parallel → yield `AgentStep(type="live_correction")` with diff
  - Step 3: Frontend shows cached answer immediately, then updates/confirms with live data
- **Freshness UX**: cached results show age badge ("data as of 3 min ago"), live correction shows "confirmed" or "updated: +$8K"
- **User-controlled refresh**: button to force cache rebuild for a connection
- **Config caps**: `TURBO_TWIN_MAX_SIZE_MB=500` (existing), cache TTL via `TURBO_TWIN_REFRESH_HOURS=4` (existing)

### Phase 2: Materialized Slice Cache (Enterprise Premium — Future)
- **Hybrid strategy**: query memory auto-suggests slices, admin approves materialization
- **Slice types**: top-N aggregations, time-series rollups, dimension summaries
- **Storage**: DuckDB files per connection (<1GB per slice set, covers TB source data via summarization)
- **Measurement gate**: 70% hit rate threshold from query_memory patterns before enabling auto-suggest
- **Feature flag**: `FEATURE_SLICE_AUTOSUGGEST` (default False, admin-only mode always available)

### Demo Model
- **BYOD**: Users bring their own database connections + own LLM API keys (Claude, GPT, Gemini, Grok)
- **Zero hosting cost**: No data hosting, no LLM token cost for product owner
- **Multi-model**: Separate workstream, cache tier is model-agnostic

### Competitive Differentiation
| Tool | Approach | QueryCopilot Advantage |
|------|----------|----------------------|
| Tableau | Stale extracts OR slow live | Progressive dual: instant + accurate |
| Looker | Live queries only | Instant cached answer, live confirmation |
| PowerBI | Import mode or DirectQuery | Both simultaneously, transparently |
| Metabase | Cache or live (user picks) | Automatic, no user choice needed |

### SSE Event Types (new, additive)
- `"cached_result"` — fields: content, sql, cache_age_seconds, columns, rows
- `"live_correction"` — fields: content, sql, is_correction=true, diff_summary

### Success Criteria
1. Cached queries respond in <500ms (vs current live query latency)
2. Progressive Dual-Response: cached answer within 300ms, live correction within 5s
3. Demo launches with zero hosting cost (BYOD only)

### Key Decisions from Discovery
1. DuckDB sole turbo engine (no cloud warehouse dependency for cache)
2. Progressive Dual-Response over real-time CDC (innovation over complexity)
3. Hybrid slice management over fully automatic (admin trust + AI wow factor)
4. BYOD demo over sample database (zero cost, real-world validation)
5. Model-agnostic cache (multi-model is separate concern)

### Invariants (carried from prior UFSD)
- Invariant-1: Read-only DB enforcement must never be weakened
- Invariant-2: PII masking via mask_dataframe() before data reaches users/LLM (enforced by BaseTier template method)
- Invariant-7: Existing SSE event types backward-compatible (new types additive only)
- Invariant-8 (NEW): Cached results must be PII-masked before display (same masking as live results)
- Invariant-9 (NEW): Progressive Dual-Response must never show unmasked cached data even if live correction fails

---

## [COUNCIL SUMMARY — 2026-04-07]
Decision: All 4 Themes Combined — Lazy Always-Correct (T1) + Staleness-Gated (T2) + Write-Time Pre-Masking (T3) + Behavior-Driven Warming (T4). Progressive rollout: T1 first, then T2-T4 incrementally. Feature flags per layer.
Confidence: CONFIRMED (16/20 personas aligned on lazy cache-first base pattern)
Top risks: Cache staleness → wrong data trust collapse (18/20 flagged), DuckDB twin size/concurrency limits (15/20)
Unanimous concerns: (1) Visible staleness indicators mandatory, (2) Lazy pattern non-negotiable (no dual-stream on cache miss), (3) DuckDB limits must be monitored
Counterfactual accepted: Y — live query cost on cache hit = baseline cost regardless; TTL-based staleness is deterministic and testable

## [COUNCIL DETAIL — 2026-04-07]

### Theme Table
| # | Theme | Core Mechanism | Personas Aligned | Vote | Status | Lead Risk | Dissent |
|---|-------|---------------|-----------------|------|--------|-----------|---------|
| 1 | Lazy Always-Correct | Cache hit → emit cached → ALWAYS fire live → stream correction. Miss → live-only. | Archaeologist, Migrationist, CogLoad, Scope Prosecutor, Debt Collector, Operator, Build/Buy, Falsificationist, Velocity | 9/20 | CONFIRMED | 2x query cost per cache hit | Contrarian: parallel doubles cost |
| 2 | Staleness-Gated Conditional | Cache hit → validate freshness → if fresh: emit as FINAL. If stale: emit + fire live. | Contrarian, Actuarian, Economist, Chronologist, Measurement Skeptic, Analogist, Epidemiologist | 7/20 | CONFIRMED | Staleness miscalibration → wrong "confirmed" data | Scope Prosecutor: complexity for demo |
| 3 | Write-Time Pre-Masking | PII-mask at DuckDB write time, not read time. Cache always pre-masked. | Regulator, Privacy Engineer | 2/20 | PROVISIONAL | GDPR right-to-erasure — deleted PII persists in masked cache | — |
| 4 | Behavior-Driven Warming | Warm cache ONLY after observing repeated query patterns. | Anthropologist, Synthesizer | 2/20 | PROVISIONAL | Novel queries never cached | — |

### Assumption Registry (council-sourced, deduplicated)
1. Cache hit rate >40% on BYOD datasets — UNVALIDATED (measure post-launch)
2. DuckDB in-process read latency <200ms on demo hardware — VALIDATED (TPC-H benchmarks)
3. SSE connection held open >3s by median user — UNVALIDATED (measure)
4. DuckDB twin staleness <5 min acceptable for demo — UNVALIDATED (user feedback needed)
5. Schema changes detectable via PRAGMA schema_version — PARTIALLY VALIDATED
6. <500k rows per cached result set — UNVALIDATED (enforce via config cap)
7. <5 concurrent BYOD users per demo instance — UNVALIDATED (depends on deployment)
8. Frontend can diff/patch partial results without flicker — UNVALIDATED (needs UX testing)
9. Query fingerprint collision rate <2% — UNVALIDATED (measure)

### Coverage Score
Council coverage: 6 / 7 domains. Covered: implementation pattern, cache invalidation, security/privacy, UX/cognitive load, operational, migration readiness. Uncovered: frontend progressive rendering component architecture.

[2026-04-07] Planning complete. Branch: feature/dual-response. Fingerprint: Progressive Dual-Response active with cached_result + live_correction SSE events, staleness-gated, write-time PII masking on twins, behavior-driven warming — all behind independent feature flags.

### Planning Assumption Registry (updated 2026-04-07 with mitigations)
- ASSUMPTION-A: Agent engine run() can yield steps before tool loop — **VALIDATED** (code audit: run() is generator, first yield at line 702 _run_inner waterfall check; injection at line 645)
- ASSUMPTION-B: Cache hit rate >40% on BYOD — **UNMEASURED** (mitigated: Task M2 adds /intelligence/stats endpoint reading audit_trail JSONL)
- ASSUMPTION-C: Thread pool exhaustion — **DESIGN-SAFE** (route_dual runs in same thread, 0 extra threads; mitigated: Task M1 configures explicit 32-thread pool)
- ASSUMPTION-H: mask_dataframe only modifies values not schema — **VALIDATED** (code audit pii_masking.py: df.copy() then apply() on values; FM-3 eliminated)
- BaseTier.answer() coroutines trivially-awaitable — **VALIDATED** by existing route_sync pattern

### Risk Mitigation Summary
- All 8 assumptions: 6 VALIDATED, 1 UNMEASURED (with measurement endpoint), 1 DESIGN-SAFE (with explicit pool config)
- All 5 failure modes: 3 MITIGATED by tasks, 1 ELIMINATED by validation, 1 ACCEPTED (config bloat <6% growth)
- All 5 invariants: verified by Task M5 script; Invariant-9 enforced by Task M3 try/except guard

## Debug Session 2026-04-07 (post-NEMESIS verification)
approach=interaction-verification | confidence=9 | session=2026-04-07 | outcome=RESOLVED
Decisions: Tested all 6 NEMESIS fixes for interaction bugs rather than individual correctness. Hypothesized can_answer cascade (H1) and schema_profile.tables type mismatch (H2) — both DENIED by evidence.
Fix summary: No new fixes needed — all 6 NEMESIS fixes interact correctly.
Assumption outcomes:
  - ASSUMPTION: _step_coro on can_answer returns bool for all tiers | VALIDATED | all 4 tiers tested
  - ASSUMPTION: SchemaProfile.tables is List[TableProfile] with .name attribute | VALIDATED | schema_intelligence.py:34-36
  - ASSUMPTION: LiveTier.can_answer is trivially awaitable | VALIDATED | just returns True
Unvalidated assumptions: none
Cascade paths verified: route_dual -> agent_engine (9 interaction tests), _route_sync_impl (Skeptic test 3), _apply_masking write-time skip (Inv-5 test)

## UFSD adversarial-testing 2026-04-07
Verdict: PASS | Coverage: 3/7 clusters SOLID (Temporal solid, most FRAGILE after fixes)
Contradictions: None — _run_live dead code confirmed by 4 independent operatives (12, 17, 19, 20)
Detail:
  P0 FIXED: live_correction now fires even when final_answer="" (Op 11 Sisyphus — SYSTEMIC)
  P1a FIXED: can_answer() in route_dual now stepped via _step_coro (Op 6 Architect Void — LATERAL)
  P1b FIXED: record_query_pattern wired in _tool_run_sql (Op 17 Ouroboros — dead code eliminated)
  P1c FIXED: AgentResult.dual_response field added + set on cached_result emit (Op 13 Seraphex)
  P2a FIXED: asyncio.get_running_loop() replaces get_event_loop() in main.py (Op 14 Voltgrieve)
  P2b FIXED: THREAD_POOL_MAX_WORKERS bounded ge=4, le=256 (Op 15 Malvareth)
  P3 DOCUMENTED: conn_id path traversal (Op 1), cross-tenant stats (Op 2), last_sync corruption (Op 4), race in record_query_pattern (Op 7), is_stale shared mutation (Op 9)
  P4 DOCUMENTED: chat_id validation (Op 3), NaN SSE (Op 5), GeneratorExit memory loss (Op 10), interface inconsistency (Op 16), NaN frontend (Op 18), type check (Op 19), metadata loss (Op 20)
  KNOWN DEAD CODE: _run_live callable never invoked by agent_engine (Op 12) — functions as None/non-None sentinel only. Staleness gate unreachable with default DUAL_RESPONSE_ALWAYS_CORRECT=True.

### Locked Decisions Carried Forward
- DuckDB sole turbo engine (from discovery)
- Progressive Dual-Response UX (from discovery)
- BYOD model (from discovery)
- Model-agnostic cache (from discovery)
- BaseTier template method for PII masking (from UFSD 2026-04-06)
