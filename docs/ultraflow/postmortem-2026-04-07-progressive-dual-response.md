# Progressive Dual-Response Data Acceleration — Post-Mortem

**Date**: 2026-04-07
**Files**: `config.py`, `main.py`, `waterfall_router.py`, `agent_engine.py`, `agent_routes.py`, `duckdb_twin.py`, `query_memory.py`, `connection_routes.py`, `AgentStepFeed.jsx`, `store.js`, `test_dual_response_invariants.py`
**Sessions**: 7 (1 discovery + 1 council + 1 planning + 1 build + 1 adversarial + 1 debug verification + 1 documentation)
**Final state**: 18 tasks built, 6 NEMESIS fixes applied, 15/15 invariants hold, 9/9 interaction tests pass, Skeptic VERIFIED

---

## Problem Statement

QueryCopilot is a SaaS NL-to-SQL analytics tool targeting monetization. The existing 4-tier waterfall router (schema, memory, turbo, live) answered queries from cache or live execution, but users had no visibility into whether their answer came from cache or fresh data. On TB-scale databases, live queries took 5-30 seconds — during which users saw nothing.

The goal: make QueryCopilot the first BI tool that shows **both** a cached answer instantly AND a live verification, transparently. No existing tool (Tableau, Looker, PowerBI, Metabase) does this.

Constraints:
- Zero hosting cost for demo launch (BYOD: users bring own DB + own LLM API keys)
- Must not break existing waterfall, PII masking, or SSE streaming
- Must be ready to scale for enterprise monetization
- All features behind independent feature flags for progressive rollout

---

## Thought Process

### Discovery: What data processing approach for TB-scale?

The first decision was architectural: DuckDB in-memory vs cloud warehouses (Snowflake/BQ) for the acceleration layer. We evaluated 3 options:

| Option | Trade-off | Rejected because |
|--------|-----------|-----------------|
| DuckDB Everything | Zero cost, single path, caps at ~100GB RAM | Can't handle 10TB+ enterprise data alone |
| DuckDB + Cloud Gateway | Smart SQL layer on user's warehouse | No caching benefit, "just a SQL layer" |
| DuckDB + Materialized Slice Cache | Summarized aggregation slices from TB source | Slice selection is a heuristic problem |

**Decision**: Combine 1+3 — DuckDB for demo, materialized slice cache as premium enterprise upgrade. The key insight: instead of real-time CDC sync (which every BI tool tries and fails at), do something novel — **Progressive Dual-Response**: show cached answer instantly, stream live correction behind it.

### Validating the SSE assumption

Before committing to the architecture, we validated that the existing SSE infrastructure could support dual-response. Code audit found:
- Backend `event_generator()` yields any `AgentStep` as JSON with no type filtering
- Frontend `AgentStepFeed.jsx` uses conditional rendering — unknown types silently render nothing
- Sentinel pattern (`None` = end of stream) allows multiple result-like events before closing

**Conclusion**: SSE supports Progressive Dual-Response with zero infrastructure changes. New event types (`cached_result`, `live_correction`) are purely additive.

### Council: 20 personas on implementation approach

Council evaluated how to implement the dual-response. 4 themes emerged:

| Theme | Core Mechanism | Votes | Status |
|-------|---------------|-------|--------|
| Lazy Always-Correct | Cache hit -> emit cached -> ALWAYS fire live -> stream correction | 9/20 | CONFIRMED |
| Staleness-Gated | Cache hit -> check freshness -> skip live when fresh | 7/20 | CONFIRMED |
| Write-Time Pre-Masking | PII mask at DuckDB write, not read | 2/20 | PROVISIONAL |
| Behavior-Driven Warming | Cache warm based on observed query patterns | 2/20 | PROVISIONAL |

**Decision**: All 4 themes combined, behind independent feature flags. The user chose this for maximum innovation and enterprise readiness.

### Risk mitigation before building

Before writing any feature code, we identified and mitigated all risks:
- 8 assumptions: 6 validated by code audit, 1 unmeasured (with measurement endpoint), 1 design-safe (with explicit thread pool config)
- 5 failure modes: 3 mitigated by tasks, 1 eliminated by validation, 1 accepted
- 5 invariants: all guarded by verification script

This added a "Phase 0" of 5 mitigation tasks before the 13 feature tasks.

---

## Implementation

### Architecture

```
User asks question
  |
  +-- agent_engine._run_inner() checks DUAL_RESPONSE_ENABLED
  |
  +-- IF enabled: calls route_dual()
  |     |
  |     +-- Pass 1: step through non-live tiers (schema/memory/turbo)
  |     |   via _step_coro(tier.can_answer(...)) then _step_coro(tier.answer(...))
  |     |
  |     +-- T2 staleness gate: if ALWAYS_CORRECT=False and cache is fresh, skip live
  |     |
  |     +-- Return (cached_result, _run_live_callable)
  |
  +-- IF cached_result.hit:
  |     +-- yield AgentStep(type="cached_result", cache_age_seconds=N)
  |     +-- set self._result.dual_response = True
  |
  +-- Normal agent loop runs (Claude API, tools, SQL execution)
  |     +-- After successful SQL: record_query_pattern() for T4 warming
  |
  +-- After agent completes:
  |     +-- yield AgentStep(type="live_correction", diff_summary=...)
  |     +-- yield AgentStep(type="result", content=final_answer)
  |
  +-- Frontend renders:
        +-- cached_result: cyan card with staleness badge (green/amber/red)
        +-- live_correction: green "Verified" or amber "Updated" with diff
```

### Files changed (18 tasks across 5 phases)

| Phase | Files | What changed |
|-------|-------|-------------|
| Phase 0 (Mitigations) | `config.py`, `main.py`, `agent_routes.py`, `audit_trail.py`, `AgentStepFeed.jsx`, `test_dual_response_invariants.py` | Thread pool config (32 workers, bounded 4-256), hit rate measurement endpoint, frontend fallback handler, invariant verification script |
| Phase 1 (Dual-Stream) | `config.py`, `waterfall_router.py`, `agent_engine.py`, `agent_routes.py`, `AgentStepFeed.jsx`, `store.js` | 5 feature flags, TierResult + AgentStep + AgentResult extended, route_dual() method, dual-response agent integration, cached_result/live_correction renderers, store tracking |
| Phase 2 (Staleness Gate) | `waterfall_router.py`, `AgentStepFeed.jsx` | Staleness TTL check in route_dual(), color-coded badges (green Fresh / amber Cached / red Stale) |
| Phase 3 (Write-Time Masking) | `duckdb_twin.py`, `waterfall_router.py` | mask_dataframe() at twin create time, read-time masking skip for pre-masked turbo twins |
| Phase 4 (Behavior Warming) | `query_memory.py`, `duckdb_twin.py`, `connection_routes.py` | Query pattern frequency tracker, warm priority calculator, auto-warm top tables on connect |

---

## Bugs & Failures

### Bug 1: live_correction never fires when agent fails (P0 — NEMESIS Op 11 Sisyphus)

**What happened**: When the agent hit max tool calls or an API error, `final_answer` was set to `""`. The live_correction guard was `if _dual_cached_content is not None and self._result.final_answer:` — empty string is falsy in Python. User saw the cached answer but never got any indication it wasn't verified.

**Introduced at**: Task 1.5 (agent engine dual-response integration). The guard was written to "skip correction when there's nothing to compare" but didn't account for the failure case where comparison is impossible AND the user must be warned.

**Root cause**: Python truthiness conflation — the guard treated "no final answer" (None) the same as "empty final answer" (agent failure). These are semantically different: no answer = no dual-response, empty answer = verification failed.

**Discovered by**: NEMESIS Operative 11 (Sisyphus), confirmed by Operatives 12 and 20.

**Fix**: Changed guard to `if _dual_cached_content is not None:` and added explicit failure message: `"Verification failed -- cached answer could not be confirmed"`.

### Bug 2: can_answer() not awaited in route_dual (P1 — NEMESIS Op 6 Architect Void)

**What happened**: `route_dual()` called `tier.can_answer(question, schema_profile, conn_id)` directly without stepping the coroutine. Since `can_answer` is async, this returned a coroutine object (always truthy). The guard `if not tier.can_answer(...)` was a no-op — every tier's `answer()` was called regardless of whether it could actually answer.

**Introduced at**: Task 1.3 (route_dual method). The existing `_route_sync_impl` correctly used `_run_coro()` for `can_answer`, but the new `route_dual` forgot to wrap the call.

**Root cause**: Copy-paste drift. `route_dual` was modeled after `_route_sync_impl` but the `_step_coro` wrapper was applied to `tier.answer()` but not to `tier.can_answer()`. The mental model was "can_answer is simple" — but simple or not, async functions always return coroutine objects.

**Discovered by**: NEMESIS Operative 6 (Architect Void).

**Fix**: Changed to `_step_coro(tier.can_answer(question, schema_profile, conn_id))`.

### Bug 3: record_query_pattern never called — T4 warming is dead code (P1 — NEMESIS Op 17 Ouroboros)

**What happened**: `record_query_pattern()` was defined in `query_memory.py` and `get_warm_priorities()` was defined in `duckdb_twin.py`, but no code in the system ever called `record_query_pattern()`. The entire behavior-warming pipeline was built but never wired.

**Introduced at**: Task 4.1/4.2/4.3 (behavior warming). The subagent built the functions correctly but the call site in `_tool_run_sql` was not included.

**Root cause**: Subagent scope boundary. The backend subagent implemented Tasks 4.1-4.3 (define functions, create routes) but the wiring step (calling `record_query_pattern` from `_tool_run_sql` after successful execution) crossed into `agent_engine.py` which was not part of its task scope.

**Discovered by**: NEMESIS Operative 17 (Ouroboros) — grep confirmed zero call sites.

**Fix**: Added `record_query_pattern()` call in `_tool_run_sql` after successful SQL execution, extracting table names from schema_profile.

### Bug 4: AgentResult missing dual_response field (P1 — NEMESIS Op 13 Seraphex)

**What happened**: The plan specified adding `dual_response: bool` to `AgentResult.to_dict()` so the client can distinguish dual-response runs from normal ones. The field was never added.

**Introduced at**: Task 1.6 (agent routes SSE handling). The plan said "ensure the final AgentResult.to_dict() includes a dual_response: bool field" but the task focused on logging, not the result payload.

**Root cause**: Plan ambiguity. Task 1.6's intent described two things (logging + result field) but the implementation only did one (logging). The result field should have been its own task or explicitly in Task 1.4.

**Discovered by**: NEMESIS Operative 13 (Seraphex).

**Fix**: Added `dual_response: bool = False` to AgentResult dataclass and `to_dict()`. Set `self._result.dual_response = True` when cached_result is emitted.

### Bug 5: asyncio.get_event_loop() deprecated in async context (P2 — NEMESIS Op 14 Voltgrieve)

**What happened**: `main.py` lifespan used `asyncio.get_event_loop()` inside an `async def` context manager. In Python 3.12+, this is deprecated and may raise `RuntimeError` in 3.14.

**Introduced at**: Task M1 (thread pool configuration).

**Root cause**: The asyncio API migration from `get_event_loop()` to `get_running_loop()` was not applied. `get_event_loop()` is the "old" way that works in sync code; inside an async context, `get_running_loop()` is correct.

**Discovered by**: NEMESIS Operative 14 (Voltgrieve).

**Fix**: Changed to `asyncio.get_running_loop()`.

### Bug 6: THREAD_POOL_MAX_WORKERS unbounded (P2 — NEMESIS Op 15 Malvareth)

**What happened**: `THREAD_POOL_MAX_WORKERS: int = Field(default=32)` had no upper bound. Setting env var to 999999 would create 999999 threads on startup, causing OOM.

**Introduced at**: Task M1 (thread pool configuration).

**Root cause**: Missing Pydantic validation constraint. The existing config pattern used `ge=` for minimum bounds (e.g., `WATERFALL_CAN_ANSWER_BUDGET_MS: int = Field(default=200, ge=10)`) but M1 didn't follow this pattern.

**Discovered by**: NEMESIS Operative 15 (Malvareth).

**Fix**: Added `ge=4, le=256` bounds.

---

## Prevention Rules

1. **Every async function call in sync-stepping code MUST go through _step_coro.** Not just `answer()` — also `can_answer()`, and any future async method. When writing `_step_coro(tier.X(...))`, grep for other calls to `tier.Y(...)` in the same block and verify they're also wrapped.

2. **Python truthiness is not None-checking.** When the guard condition is "was this value set?" use `is not None`. When the guard is "does this value have content?" use truthiness. `if x:` and `if x is not None:` are different statements with different semantics — choose deliberately.

3. **Subagent scope boundaries require explicit wiring tasks.** When a function is defined in one file and called in another, the call site must be an explicit task — not assumed to be part of the definition task. The plan should have a task "Wire X in Y" whenever X is defined in module A but called from module B.

4. **Plan tasks with two intents must be split.** If a task description says "do A and B", make it two tasks. Task 1.6 said "add logging AND add dual_response to AgentResult" — the second part was lost. One intent per task.

5. **asyncio.get_running_loop() in async contexts, get_event_loop() in sync contexts.** Inside `async def`, `@asynccontextmanager`, or any coroutine: use `get_running_loop()`. In sync code or module-level: use `get_event_loop()` or create a new loop.

6. **Every Pydantic Field with numeric type needs bounds.** Follow the existing pattern: `Field(default=N, ge=MIN, le=MAX)`. Thread counts, timeouts, TTLs, buffer sizes — all need upper bounds. An unbounded int in config is a DoS vector via environment variables.

7. **After subagent returns DONE, grep for expected call sites.** Subagent built `record_query_pattern()` and said DONE. A 5-second `grep -r "record_query_pattern" *.py` would have caught the missing call site before NEMESIS.

8. **Invariant verification must test failure paths, not just success paths.** The initial test suite checked "does masking work?" (success) but not "does correction fire when agent fails?" (failure). Every dual-response path needs a "what if the second response never arrives?" test.

---

## Lessons Learned

1. **We assumed** subagents building functions in isolation would wire them together.
   **Reality was** each subagent completed its scoped task perfectly — but cross-file wiring fell through the cracks.
   **Next time** every plan that defines a function in file A and expects it called from file B gets an explicit "Wire A.func in B.caller" task with a grep-based test.

2. **We assumed** the can_answer/answer pattern in route_dual would mirror _route_sync_impl.
   **Reality was** only answer() was wrapped in _step_coro; can_answer() was called raw, returning a coroutine object that's always truthy.
   **Next time** when replicating a pattern from one method to another, diff the two methods line-by-line. Every async call in the original must have a corresponding wrapper in the copy.

3. **We assumed** the P0 live_correction guard was correct because it checked both conditions.
   **Reality was** empty string is falsy in Python — the guard blocked correction on the exact failure case it needed to handle.
   **Next time** for every guard condition, enumerate: what are ALL the values this variable can take? (None, "", "some text", exception). Write a test for each.

4. **We assumed** NEMESIS was only for feature code, not infrastructure tasks.
   **Reality was** bugs 5 and 6 (asyncio deprecated API, unbounded config) were in infrastructure code (main.py, config.py) that felt "too simple to break."
   **Next time** infrastructure changes get the same adversarial review as feature code. The simpler the code, the more dangerous the assumption that it's correct.

5. **We assumed** 18 tasks completing individually meant the system was correct.
   **Reality was** 6 bugs were hiding in the interactions between tasks — not in any single task.
   **Next time** after build completes, run interaction tests that exercise cross-task paths before claiming done. The invariant script (M5) caught invariant-level issues but not behavioral interactions like "what happens when the agent fails during dual-response?"
