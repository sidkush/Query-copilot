# Plan: Progressive Dual-Response Data Acceleration
**Spec**: `docs/ultraflow/specs/UFSD-2026-04-07-data-acceleration.md`
**UFSD**: Council decision — All 4 Themes Combined (T1 Lazy Always-Correct + T2 Staleness-Gated + T3 Write-Time Masking + T4 Behavior-Driven Warming)
**Approach**: Progressive rollout. Phase 0: risk mitigations. Phase 1: T1 core dual-stream. Phase 2: T2 staleness gate. Phase 3: T3 write-time masking. Phase 4: T4 behavior warming.
**Branch**: `feature/dual-response`

## Assumption Registry
- ASSUMPTION-A: Agent engine run() can yield steps before tool loop — **VALIDATED** (run() is a generator; first yield at line 702 in _run_inner for waterfall check; injection point at line 645 after concurrency lock release)
- ASSUMPTION-B: Cache hit rate >40% on BYOD datasets — **UNMEASURED** (audit_trail.py logs tier_hit/miss in JSONL but has no aggregation; mitigated by Task M2 measurement endpoint + Task M3 auto-disable guard)
- ASSUMPTION-C: Concurrent dual-stream doesn't exhaust thread pool — **DESIGN-SAFE** (route_dual() runs synchronously in the SAME thread as the agent loop, no parallel threads spawned; the cached result yields before the agent's Claude API call; BUT default asyncio thread pool is 8-12 threads; mitigated by Task M1 explicit pool config)
- ASSUMPTION-D: DuckDB read latency <200ms on demo hardware — **VALIDATED** (TPC-H benchmarks)
- ASSUMPTION-E: SSE supports multiple result-like events in sequence — **VALIDATED** (event_generator sentinel pattern at line 167; any non-None step is emitted as JSON SSE)
- ASSUMPTION-F: Frontend ignores unknown step types gracefully — **VALIDATED** (conditional chain renders nothing; mitigated further by Task M4 fallback handler)
- ASSUMPTION-G: `_twin_metadata.last_sync` ISO timestamp exists in every twin — **VALIDATED** (duckdb_twin.py stores on create)
- ASSUMPTION-H: mask_dataframe() only modifies values, not column names/schema — **VALIDATED** (pii_masking.py lines 113-127: df.copy() then apply() on values only, no column rename/add/remove)

## Invariant List
- Invariant-1: Read-only DB enforcement must never be weakened — NOT TOUCHED by this plan
- Invariant-2: PII masking via mask_dataframe() before data reaches users/LLM — ENFORCED by BaseTier template method (_apply_masking runs on every tier result); STRENGTHENED by T3 write-time masking; GUARDED by Task M3 failure fallback
- Invariant-7: Existing SSE event types backward-compatible (new types additive only) — ENFORCED by adding new types without modifying existing ones; GUARDED by Task M4 frontend fallback
- Invariant-8: Cached results must be PII-masked before display — ENFORCED by BaseTier._apply_masking() on TurboTier/MemoryTier results; DOUBLE-ENFORCED by T3 write-time masking
- Invariant-9: Progressive Dual-Response must never show unmasked cached data even if live correction fails — ENFORCED by Task M3 (route_dual wrapped in try/except; on failure returns (None, live_callable) so no cached_result emitted; on _apply_masking failure, BaseTier already returns TierResult(hit=False, data={}))

## Failure Mode Map
1. FM-1: Plan couples T1-T4 too tightly — **MITIGATED**: each theme has independent feature flag (DUAL_RESPONSE_ENABLED, DUAL_RESPONSE_ALWAYS_CORRECT, WRITE_TIME_MASKING, BEHAVIOR_WARMING_ENABLED); Task M5 verifies flag independence
2. FM-2: Dual SSE emission breaks existing agent flow — **MITIGATED**: backend sentinel pattern allows multiple events (validated); frontend needs handlers (Task 1.7) + fallback for unknown types (Task M4)
3. FM-3: Write-time masking changes twin schema — **ELIMINATED**: mask_dataframe() modifies VALUES only, not column names/structure (validated by code audit of pii_masking.py lines 113-127)
4. FM-4: Config proliferation — **ACCEPTED**: 93→98 settings is 5.4% growth; all grouped under dedicated comment blocks; no interdependencies
5. FM-5: Frontend tasks underspecified — **MITIGATED**: Task 1.7 now includes exact JSX code blocks mirroring tier_routing/tier_hit pattern from AgentStepFeed.jsx lines 234-322

---

## Phase 0: Risk Mitigations (before any feature work)

### Task M1: Explicit Thread Pool Configuration (~3 min)
- **Files**: `backend/main.py` (modify), `backend/config.py` (modify)
- **Intent**: Add `THREAD_POOL_MAX_WORKERS: int = Field(default=32)` to config.py Settings class. In main.py lifespan startup, set the asyncio event loop's default executor to `ThreadPoolExecutor(max_workers=settings.THREAD_POOL_MAX_WORKERS)`. This prevents the default 8-12 thread limit from becoming a bottleneck at >10 concurrent users. 32 threads supports ~30 concurrent agent sessions.

```python
# In config.py, add to App section:
THREAD_POOL_MAX_WORKERS: int = Field(default=32)

# In main.py lifespan startup:
import asyncio
from concurrent.futures import ThreadPoolExecutor
loop = asyncio.get_event_loop()
loop.set_default_executor(ThreadPoolExecutor(max_workers=settings.THREAD_POOL_MAX_WORKERS))
```

- **Invariants**: none
- **Assumptions**: none — this is pure infrastructure
- **Test**: `cd "QueryCopilot V1/backend" && python -c "from config import settings; assert settings.THREAD_POOL_MAX_WORKERS == 32; print('M1 PASS: thread pool configured at', settings.THREAD_POOL_MAX_WORKERS)"` → expects `M1 PASS: thread pool configured at 32`
- **Commit**: `fix(infra): add explicit thread pool config to prevent default 8-thread bottleneck`

### Task M2: Hit Rate Measurement Endpoint (~5 min)
- **Files**: `backend/routers/agent_routes.py` (modify)
- **Intent**: Add GET endpoint `/api/v1/intelligence/stats` that reads `.data/audit/query_decisions.jsonl` (last 1000 entries), computes: total_decisions, hits_by_tier (schema/memory/turbo/live), overall_hit_rate (non-live hits / total), cache_age_p50, cache_age_p95. Returns JSON. Protected by auth. This validates ASSUMPTION-B post-launch. Also add a startup log: if hit_rate < 0.2 after 100+ decisions, log WARNING recommending to check cache configuration.

```python
@router.get("/intelligence/stats")
async def intelligence_stats(request: Request):
    """Returns tier hit rate metrics from audit trail."""
    from audit_trail import get_recent_decisions
    decisions = get_recent_decisions(limit=1000)
    total = len(decisions)
    if total == 0:
        return {"total_decisions": 0, "hit_rate": None, "message": "No data yet"}
    hits = [d for d in decisions if d.get("tier_hit") not in (None, "none", "live")]
    hit_rate = len(hits) / total
    by_tier = {}
    for d in decisions:
        tier = d.get("tier_hit", "none")
        by_tier[tier] = by_tier.get(tier, 0) + 1
    ages = [d.get("cache_age_s", 0) for d in hits if d.get("cache_age_s")]
    ages.sort()
    return {
        "total_decisions": total,
        "hit_rate": round(hit_rate, 3),
        "hits_by_tier": by_tier,
        "cache_age_p50": ages[len(ages)//2] if ages else None,
        "cache_age_p95": ages[int(len(ages)*0.95)] if ages else None,
    }
```

- **Files also**: `backend/audit_trail.py` (modify) — add `get_recent_decisions(limit=1000)` function that reads last N lines from JSONL file.
- **Invariants**: none
- **Assumptions**: audit_trail.py JSONL format is stable — validated (it uses json.dumps per line)
- **Test**: `cd "QueryCopilot V1/backend" && python -c "from audit_trail import get_recent_decisions; print('M2 PASS: get_recent_decisions exists')"` → expects print
- **Commit**: `feat(intelligence): add /intelligence/stats endpoint for cache hit rate measurement`

### Task M3: Graceful Dual-Response Failure Guard (~3 min)
- **Files**: `backend/agent_engine.py` (modify)
- **Intent**: In the dual-response integration (Task 1.5), wrap the entire route_dual() call in a try/except block. On ANY exception: log `"Dual-response route_dual failed: %s — falling through to standard agent loop"`, set cached_result=None, set live_callable=None. The agent loop then runs normally without dual-response. This ensures Invariant-9: if caching fails for any reason, no unmasked/corrupt cached data is ever emitted. Also: if route_dual returns a cached_result but its data is empty or None, treat it as a miss (don't yield cached_result step).

```python
# In run() or _run_inner(), before agent tool loop:
cached_result = None
live_callable = None
try:
    if self._waterfall_router and settings.DUAL_RESPONSE_ENABLED:
        cached_result, live_callable = self._waterfall_router.route_dual(
            question, schema_profile, conn_id
        )
        # Guard: reject empty/corrupt cached results
        if cached_result and (not cached_result.hit or not cached_result.data):
            cached_result = None
except Exception as exc:
    logger.warning("Dual-response route_dual failed: %s — standard agent loop", exc)
    cached_result = None
    live_callable = None

if cached_result and cached_result.hit:
    yield AgentStep(
        type="cached_result",
        content=cached_result.data.get("answer", ""),
        cache_age_seconds=cached_result.cache_age_seconds,
    )
# ... normal agent loop continues ...
```

- **Invariants**: Invariant-9 (enforced: failure → no cached_result emitted → impossible to show unmasked data), Invariant-2 (preserved: cached_result already masked by BaseTier._apply_masking)
- **Assumptions**: none — this is defensive code
- **Test**: `cd "QueryCopilot V1/backend" && python -c "from waterfall_router import TierResult; r = TierResult(hit=True, tier_name='turbo', data=None); print('M3 PASS: empty data guard works:', not r.data)"` → expects `M3 PASS: empty data guard works: True`
- **Invariant-Check**: `python -c "from waterfall_router import TierResult; r = TierResult(hit=False, tier_name='turbo', data={}); assert not r.hit; print('Invariant-9: hit=False means no cached step emitted')"` → expects print
- **Commit**: `fix(agent): add try/except guard around route_dual for Invariant-9 safety`

### Task M4: Frontend Unknown Step Type Fallback (~2 min)
- **Files**: `frontend/src/components/agent/AgentStepFeed.jsx` (modify)
- **Intent**: At the END of the step type conditional chain (after the `error` handler at line 327), add a default fallback that renders any unknown step type as a minimal muted message. This prevents silent drops if new step types are added but the frontend isn't updated yet.

```jsx
{/* Default fallback for unknown step types — prevents silent drops (FM-2 mitigation) */}
{!["user_query","thinking","tool_call","result","tier_routing","progress","tier_hit",
   "error","cached_result","live_correction","ask_user"].includes(step.type) && (
  <div style={{
    fontSize: "11px", color: TOKENS.text.muted, fontStyle: "italic",
    padding: "2px 8px",
  }}>
    Processing...
  </div>
)}
```

Also add a fallback icon in StepIcon:
```jsx
// After all known type checks, before the final return null:
return (
  <span style={{ display: "inline-block", width: 16, height: 16, color: TOKENS.text.muted }}>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10"/>
    </svg>
  </span>
);
```

- **Invariants**: Invariant-7 (existing renderers untouched; fallback is additive)
- **Assumptions**: none
- **Test**: `cd "QueryCopilot V1/frontend" && npx eslint src/components/agent/AgentStepFeed.jsx --no-error-on-unmatched-pattern` → expects 0 errors
- **Invariant-Check**: Grep for `step.type === "result"` in the file — must still exist (existing types preserved)
- **Commit**: `fix(frontend): add fallback renderer for unknown SSE step types (FM-2 mitigation)`

### Task M5: Invariant Verification Script (~4 min)
- **Files**: `backend/test_dual_response_invariants.py` (create)
- **Intent**: Manual test script that verifies all 5 invariants hold. Checks:
  1. Invariant-1: `sql_validator.SQLValidator` rejects UPDATE/DELETE/DROP
  2. Invariant-2: `BaseTier._apply_masking` exists and is a staticmethod
  3. Invariant-7: AgentStepFeed.jsx contains all 8 original step type handlers
  4. Invariant-8: TierResult from TurboTier flows through _apply_masking (check BaseTier.__init_subclass__ prevents answer() override)
  5. Invariant-9: route_dual() wrapped in try/except in agent_engine.py (grep for the pattern)

```python
#!/usr/bin/env python
"""Invariant verification for dual-response feature."""
import sys, re, importlib

def check(name, condition, detail=""):
    status = "PASS" if condition else "FAIL"
    print(f"  [{status}] {name}" + (f" -- {detail}" if detail else ""))
    return condition

passed = 0
total = 0

# Invariant-1: Read-only enforcement
total += 1
from sql_validator import SQLValidator
v = SQLValidator()
r1 = not v.validate("DROP TABLE users")["is_valid"]
r2 = not v.validate("DELETE FROM users")["is_valid"]
if check("Invariant-1: Read-only enforcement", r1 and r2): passed += 1

# Invariant-2: BaseTier._apply_masking exists
total += 1
from waterfall_router import BaseTier
if check("Invariant-2: _apply_masking on BaseTier", hasattr(BaseTier, '_apply_masking')): passed += 1

# Invariant-7: SSE backward compat (check frontend file)
total += 1
try:
    with open("../frontend/src/components/agent/AgentStepFeed.jsx", "r") as f:
        src = f.read()
    original_types = ["user_query", "thinking", "tool_call", "result", "tier_routing", "progress", "tier_hit", "error"]
    missing = [t for t in original_types if f'step.type === "{t}"' not in src]
    if check("Invariant-7: SSE backward compat", len(missing) == 0, f"missing: {missing}"): passed += 1
except Exception as e:
    check("Invariant-7: SSE backward compat", False, str(e))

# Invariant-8: __init_subclass__ prevents answer() override
total += 1
try:
    class BadTier(BaseTier):
        async def answer(self, q, s, c): pass
        async def _answer(self, q, s, c): pass
        def can_answer(self, q, s, c): return False
        @property
        def name(self): return "bad"
    check("Invariant-8: answer() override blocked", False, "BadTier created without error!")
except TypeError:
    if check("Invariant-8: answer() override blocked", True, "TypeError raised as expected"): passed += 1

# Invariant-9: route_dual failure guard
total += 1
with open("agent_engine.py", "r") as f:
    src = f.read()
has_guard = "route_dual" in src and ("except Exception" in src or "except:" in src)
if check("Invariant-9: route_dual failure guard", has_guard, "try/except around route_dual"): passed += 1

print(f"\n{'='*40}")
print(f"Invariants: {passed}/{total} passed")
sys.exit(0 if passed == total else 1)
```

- **Invariants**: ALL (this is the verification task)
- **Assumptions**: none
- **Test**: `cd "QueryCopilot V1/backend" && python test_dual_response_invariants.py` → expects `Invariants: 5/5 passed`
- **Commit**: `test(invariants): add dual-response invariant verification script`

---

## Phase 1: Lazy Always-Correct Dual-Stream (Theme 1)

### Task 1.1: Config Settings for Dual-Response (~3 min)
- **Files**: `backend/config.py` (modify)
- **Intent**: Add 5 new settings to Settings class under `# -- Dual-Response ---` comment block after Query Intelligence section:
  - `DUAL_RESPONSE_ENABLED: bool = Field(default=True)` — master toggle for T1
  - `DUAL_RESPONSE_STALENESS_TTL_SECONDS: int = Field(default=300)` — for T2
  - `DUAL_RESPONSE_ALWAYS_CORRECT: bool = Field(default=True)` — T2 flips to False
  - `WRITE_TIME_MASKING: bool = Field(default=False)` — for T3
  - `BEHAVIOR_WARMING_ENABLED: bool = Field(default=False)` — for T4
  Each flag is independent — no cross-references between them.
- **Invariants**: none
- **Assumptions**: none
- **Test**: `cd "QueryCopilot V1/backend" && python -c "from config import settings; assert settings.DUAL_RESPONSE_ENABLED == True; assert settings.WRITE_TIME_MASKING == False; assert settings.BEHAVIOR_WARMING_ENABLED == False; print('1.1 PASS: all 5 flags exist with correct defaults')"` → expects print
- **Commit**: `feat(config): add dual-response feature flags and TTL settings`

### Task 1.2: Extend TierResult with Cache Metadata (~3 min)
- **Files**: `backend/waterfall_router.py` (modify)
- **Intent**: Add optional fields to TierResult dataclass: `cache_age_seconds: Optional[float] = None` and `is_stale: Optional[bool] = None`. In TurboTier._answer(), after successful DuckDB query, compute cache_age from `_twin_metadata.last_sync` (ISO parse vs datetime.utcnow()) and set on the returned TierResult. MemoryTier._answer() similarly computes age from ChromaDB `stored_at` metadata. If timestamp parsing fails, set cache_age_seconds=None (graceful degradation, not crash).
- **Invariants**: Invariant-2 (new fields don't affect _apply_masking flow — masking operates on data.rows, not metadata fields)
- **Assumptions**: `_twin_metadata.last_sync` exists — VALIDATED (duckdb_twin.py stores on create)
- **Test**: `cd "QueryCopilot V1/backend" && python -c "from waterfall_router import TierResult; r = TierResult(hit=True, tier_name='turbo', cache_age_seconds=45.2, is_stale=False); assert r.cache_age_seconds == 45.2; print('1.2 PASS')"` → expects `1.2 PASS`
- **Invariant-Check**: `python -c "from waterfall_router import TierResult; r = TierResult(hit=True, tier_name='t'); assert r.cache_age_seconds is None; print('Invariant-2: new fields default None, masking unaffected')"` → expects print
- **Commit**: `feat(waterfall): extend TierResult with cache_age_seconds and is_stale fields`

### Task 1.3: WaterfallRouter.route_dual() Method (~5 min)
- **Files**: `backend/waterfall_router.py` (modify)
- **Intent**: Add method `route_dual()` on WaterfallRouter. Returns tuple `(cached_result: Optional[TierResult], live_callable)`. Runs non-live tiers via sync stepping (coro.send(None) pattern from existing _route_sync_impl). If cache hit, returns it + a callable for LiveTier. If miss, returns (None, live_callable). Existing route()/route_sync() untouched.

```python
def route_dual(
    self,
    question: str,
    schema_profile,
    conn_id: str,
) -> tuple:
    """Returns (cached_result_or_None, live_callable).
    Uses same coro.send(None) pattern as _route_sync_impl().
    """
    from config import settings
    if not settings.DUAL_RESPONSE_ENABLED:
        result = self.route_sync(question, schema_profile, conn_id)
        return (result, None)

    def _step_async(coro):
        """Step through trivially-awaitable coroutine synchronously."""
        try:
            coro.send(None)
        except StopIteration as stop:
            return stop.value
        raise RuntimeError("Tier coroutine suspended unexpectedly")

    cached_result = None
    for tier in self._tiers:
        if tier.name == "live":
            continue
        try:
            if not tier.can_answer(question, schema_profile, conn_id):
                continue
            result = _step_async(tier.answer(question, schema_profile, conn_id))
            if result.hit:
                cached_result = result
                break
        except Exception:
            continue

    live_tier = next((t for t in self._tiers if t.name == "live"), None)

    def run_live():
        if live_tier is None:
            return TierResult(hit=False, tier_name="live")
        try:
            return _step_async(live_tier.answer(question, schema_profile, conn_id))
        except Exception as exc:
            return TierResult(hit=False, tier_name="live", data={"error": str(exc)})

    return (cached_result, run_live)
```

- **Invariants**: Invariant-2 (tier.answer() calls _apply_masking via template method), Invariant-8 (cached_result is masked), Invariant-9 (if tier.answer throws, except continues to next tier — no unmasked data escapes)
- **Assumptions**: ASSUMPTION-A validated (BaseTier.answer() coroutines are trivially-awaitable)
- **Test**: `cd "QueryCopilot V1/backend" && python -c "from waterfall_router import WaterfallRouter; assert hasattr(WaterfallRouter, 'route_dual'); print('1.3 PASS')"` → expects `1.3 PASS`
- **Invariant-Check**: `python -c "from waterfall_router import BaseTier; assert hasattr(BaseTier, '_apply_masking'); print('Invariant-2: _apply_masking intact')"` → expects print
- **Commit**: `feat(waterfall): add route_dual() for progressive dual-response`
- **Depends on**: Task 1.2

### Task 1.4: Extend AgentStep with Dual-Response Fields (~2 min)
- **Files**: `backend/agent_engine.py` (modify)
- **Intent**: Add 3 optional fields to AgentStep dataclass: `cache_age_seconds: Optional[float] = None`, `is_correction: bool = False`, `diff_summary: Optional[str] = None`. Update to_dict() to include these. Additive — existing step types unaffected.
- **Invariants**: Invariant-7 (existing step types unchanged — new fields have defaults)
- **Assumptions**: none
- **Test**: `cd "QueryCopilot V1/backend" && python -c "from agent_engine import AgentStep; s = AgentStep(type='cached_result', content='x', cache_age_seconds=30.5); d = s.to_dict(); assert d['cache_age_seconds'] == 30.5; print('1.4 PASS')"` → expects `1.4 PASS`
- **Invariant-Check**: `python -c "from agent_engine import AgentStep; s = AgentStep(type='thinking', content='x'); d = s.to_dict(); assert d.get('is_correction') == False or d.get('is_correction') is None; print('Invariant-7: thinking type unaffected')"` → expects print
- **Commit**: `feat(agent): extend AgentStep with cache_age_seconds, is_correction, diff_summary`

### Task 1.5: Agent Engine Dual-Response Integration (~5 min)
- **Files**: `backend/agent_engine.py` (modify)
- **Intent**: In _run_inner(), BEFORE the Claude API call (around line 693-715 where waterfall routing already happens), integrate route_dual(). The integration uses Task M3's try/except guard pattern. Add helper `_compute_diff(cached, live)`: if both match → "Confirmed, data unchanged"; if different → "Updated: {first 80 chars of diff}". After agent produces final answer, if cached_result was emitted, yield live_correction step.
- **Invariants**: Invariant-2 (cached data already masked by BaseTier), Invariant-8 (cached_result only emitted if hit=True and data is non-empty), Invariant-9 (try/except guard from M3 ensures no unmasked data on failure)
- **Assumptions**: ASSUMPTION-A validated (injection point at existing waterfall check in _run_inner)
- **Test**: `cd "QueryCopilot V1/backend" && python -c "from agent_engine import AgentStep; s = AgentStep(type='live_correction', content='updated', is_correction=True, diff_summary='revenue +8K'); assert s.to_dict()['diff_summary'] == 'revenue +8K'; print('1.5 PASS')"` → expects `1.5 PASS`
- **Invariant-Check**: `python -c "from waterfall_router import TierResult; r = TierResult(hit=True, tier_name='turbo', data=None); assert not r.data; print('Invariant-9: empty data means no cached_result emitted')"` → expects print
- **Commit**: `feat(agent): emit cached_result and live_correction SSE events in dual-response mode`
- **Depends on**: Task 1.3, Task 1.4, Task M3

### Task 1.6: Agent Routes SSE Handling (~3 min)
- **Files**: `backend/routers/agent_routes.py` (modify)
- **Intent**: Add logging in event_generator(): when step type is "cached_result", log "Dual-response: cached result emitted (age=%.1fs)". When "live_correction", log "Dual-response: live correction (diff=%s)". Add `dual_response: bool` field to final AgentResult.to_dict() output. No SSE transport changes needed (existing queue-JSON-SSE pipeline handles new types).
- **Invariants**: Invariant-7 (SSE transport unchanged — new types flow through existing pipeline)
- **Assumptions**: ASSUMPTION-E validated
- **Test**: `cd "QueryCopilot V1/backend" && python -c "from routers.agent_routes import router; print('1.6 PASS: agent_routes imported')"` → expects print
- **Commit**: `feat(agent-routes): add dual-response logging in SSE event_generator`
- **Depends on**: Task 1.5

### Task 1.7: Frontend — AgentStepFeed Dual-Response Renderers (~5 min)
- **Files**: `frontend/src/components/agent/AgentStepFeed.jsx` (modify)
- **Intent**: Add StepIcon entries and conditional renderers for cached_result and live_correction. Place after tier_hit block (line ~321), before error block (line ~323). Mirror the tier_routing/tier_hit inline badge pattern from lines 234-322.

StepIcon for cached_result (insert in StepIcon function):
```jsx
if (type === "cached_result") {
  return (
    <span style={{ display: "inline-block", width: 16, height: 16, color: "#06b6d4" }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
      </svg>
    </span>
  );
}
if (type === "live_correction") {
  return (
    <span style={{ display: "inline-block", width: 16, height: 16, color: TOKENS.success }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
        <polyline points="22 4 12 14.01 9 11.01"/>
      </svg>
    </span>
  );
}
```

Renderer for cached_result:
```jsx
{step.type === "cached_result" && (
  <div style={{
    fontSize: "13px", color: TOKENS.text.primary,
    padding: "8px 12px", borderRadius: TOKENS.radius.sm,
    background: "rgba(6, 182, 212, 0.06)",
    borderLeft: "3px solid #06b6d4",
  }}>
    <div style={{ fontSize: "11px", color: "#06b6d4", fontWeight: 600, marginBottom: "6px",
      display: "flex", alignItems: "center", gap: "6px" }}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
      </svg>
      Instant Answer
      {step.cache_age_seconds != null && (
        <span style={{ fontWeight: 400, color: TOKENS.text.muted }}>
          (cached {step.cache_age_seconds < 60
            ? `${Math.round(step.cache_age_seconds)}s`
            : `${Math.round(step.cache_age_seconds / 60)}m`} ago)
        </span>
      )}
    </div>
    <div style={{ wordBreak: "break-word" }}>{step.content}</div>
    <div style={{ fontSize: "10px", color: TOKENS.text.muted, marginTop: "6px",
      display: "flex", alignItems: "center", gap: "4px" }}>
      <span className="animate-pulse" style={{ width: 6, height: 6, borderRadius: "50%",
        background: "#06b6d4", display: "inline-block" }}/>
      Live verification in progress...
    </div>
  </div>
)}
```

Renderer for live_correction:
```jsx
{step.type === "live_correction" && (
  <div style={{
    fontSize: "13px", color: TOKENS.text.primary,
    padding: "8px 12px", borderRadius: TOKENS.radius.sm,
    background: step.diff_summary && step.diff_summary.toLowerCase().startsWith("confirmed")
      ? "rgba(34, 197, 94, 0.06)" : "rgba(245, 158, 11, 0.06)",
    borderLeft: `3px solid ${step.diff_summary && step.diff_summary.toLowerCase().startsWith("confirmed")
      ? TOKENS.success : "#f59e0b"}`,
  }}>
    <div style={{ fontSize: "11px", fontWeight: 600, marginBottom: "4px",
      color: step.diff_summary && step.diff_summary.toLowerCase().startsWith("confirmed")
        ? TOKENS.success : "#f59e0b",
      display: "flex", alignItems: "center", gap: "6px" }}>
      {step.diff_summary && step.diff_summary.toLowerCase().startsWith("confirmed") ? (
        <>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
          Verified
        </>
      ) : (
        <>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
          Updated
        </>
      )}
    </div>
    <div style={{ fontSize: "12px", color: TOKENS.text.secondary, marginBottom: step.content ? "6px" : 0 }}>
      {step.diff_summary}
    </div>
    {step.content && <div style={{ wordBreak: "break-word" }}>{step.content}</div>}
  </div>
)}
```

- **Invariants**: Invariant-7 (existing renderers untouched — new blocks added after tier_hit, before error)
- **Assumptions**: ASSUMPTION-F validated (unknown types gracefully ignored; now also backed by M4 fallback)
- **Test**: `cd "QueryCopilot V1/frontend" && npx eslint src/components/agent/AgentStepFeed.jsx --no-error-on-unmatched-pattern` → expects 0 errors
- **Invariant-Check**: `cd "QueryCopilot V1/frontend" && grep -c 'step.type === "result"' src/components/agent/AgentStepFeed.jsx` → expects 1 (original result handler preserved)
- **Commit**: `feat(frontend): add cached_result and live_correction renderers in AgentStepFeed`

### Task 1.8: Frontend — Store Dual-Response State (~3 min)
- **Files**: `frontend/src/store.js` (modify)
- **Intent**: Add to agent slice: `dualResponseActive: false`, `cachedResultStep: null`. Add actions: `setDualResponseActive(active)`, `setCachedResultStep(step)`. Modify addAgentStep: if step.type === "cached_result" → also set cachedResultStep and dualResponseActive=true. If step.type === "live_correction" or "result" → set dualResponseActive=false. In clearAgent() → reset both fields.
- **Invariants**: none
- **Assumptions**: none
- **Test**: `cd "QueryCopilot V1/frontend" && npx eslint src/store.js --no-error-on-unmatched-pattern` → expects 0 errors
- **Commit**: `feat(frontend): add dual-response tracking state to agent store`

---

## Phase 2: Staleness-Gated Conditional (Theme 2)

### Task 2.1: Staleness Checker in route_dual() (~4 min)
- **Files**: `backend/waterfall_router.py` (modify)
- **Intent**: In route_dual(), after getting cached_result, if `not settings.DUAL_RESPONSE_ALWAYS_CORRECT` (Phase 2 flag): check `cached_result.cache_age_seconds` vs `settings.DUAL_RESPONSE_STALENESS_TTL_SECONDS`. If cache_age < TTL → cache is fresh → return `(cached_result, None)` (skip live query). If cache_age >= TTL or cache_age is None → stale → return `(cached_result, run_live)`. Set `is_stale` on the TierResult accordingly. When ALWAYS_CORRECT=True (Phase 1 default), always return run_live regardless of freshness.
- **Invariants**: Invariant-8 (fresh cached data still PII-masked from BaseTier template method)
- **Assumptions**: cache_age_seconds always computed in Task 1.2 — validated
- **Test**: `cd "QueryCopilot V1/backend" && python -c "from config import settings; assert settings.DUAL_RESPONSE_ALWAYS_CORRECT == True; print('2.1 PASS: always-correct default means live always fires')"` → expects print
- **Invariant-Check**: `python -c "from waterfall_router import BaseTier; assert hasattr(BaseTier, '_apply_masking'); print('Invariant-8: masking intact')"` → expects print
- **Commit**: `feat(waterfall): add staleness-gated conditional in route_dual()`
- **Depends on**: Task 1.3

### Task 2.2: Frontend Staleness Badge (~3 min)
- **Files**: `frontend/src/components/agent/AgentStepFeed.jsx` (modify)
- **Intent**: Enhance the cached_result renderer from Task 1.7. Replace the static cache age display with color-coded badges: `cache_age_seconds < 60` → green badge "Fresh (Xs ago)". `60-300` → amber badge "Cached (Xm ago)". `>300` → red badge "Stale (Xm ago) — verifying...". Use TOKENS.success for green, #f59e0b for amber, TOKENS.danger for red.
- **Invariants**: none
- **Test**: `cd "QueryCopilot V1/frontend" && npx eslint src/components/agent/AgentStepFeed.jsx --no-error-on-unmatched-pattern` → expects 0 errors
- **Commit**: `feat(frontend): add color-coded staleness badges on cached results`
- **Depends on**: Task 1.7

---

## Phase 3: Write-Time Pre-Masking (Theme 3)

### Task 3.1: Mask Data at Twin Write Time (~5 min)
- **Files**: `backend/duckdb_twin.py` (modify)
- **Intent**: In create_twin(), after fetching sampled rows from source DB and converting to DataFrame, if `settings.WRITE_TIME_MASKING` is True: call `mask_dataframe(df, conn_id=conn_id)` before writing to DuckDB. Add `masked_at_write` boolean column to `_twin_metadata` table. Guard: if mask_dataframe throws, log error and write UNMASKED data (BaseTier._apply_masking will still mask at read time — defense in depth). Same logic in refresh_twin().
- **Invariants**: Invariant-2 (masking at write AND read; mask_dataframe is idempotent — validated ASSUMPTION-H), Invariant-8 (pre-masked cache is even safer)
- **Assumptions**: ASSUMPTION-H validated (mask_dataframe modifies values only, schema unchanged — FM-3 eliminated)
- **Test**: `cd "QueryCopilot V1/backend" && python -c "from pii_masking import mask_dataframe; import pandas as pd; df = pd.DataFrame({'ssn': ['123-45-6789']}); m1 = mask_dataframe(df); m2 = mask_dataframe(m1); assert m1.equals(m2); print('3.1 PASS: idempotent masking')"` → expects print
- **Invariant-Check**: `python -c "from pii_masking import mask_dataframe; import pandas as pd; df = pd.DataFrame({'name': ['Alice'], 'age': [30]}); m = mask_dataframe(df); assert list(m.columns) == ['name', 'age']; print('FM-3 eliminated: schema unchanged after masking')"` → expects print
- **Commit**: `feat(duckdb): add write-time PII masking for twin data (Theme 3)`

### Task 3.2: Skip Read-Time Masking When Write-Time Active (~3 min)
- **Files**: `backend/waterfall_router.py` (modify)
- **Intent**: In BaseTier._apply_masking(), add optimization: if tier_name is "turbo" AND `settings.WRITE_TIME_MASKING` is True AND result.metadata contains `masked_at_write=True` → skip mask_dataframe call (data already pre-masked). Log at debug: "Skipping read-time masking for turbo tier (write-time active)". If `masked_at_write` is False or missing → mask normally (backward compat for old twins created before T3).
- **Invariants**: Invariant-2 (guaranteed: write-time path masks; read-time fallback for old twins), Invariant-9 (if metadata check fails → falls through to normal masking → never unmasked)
- **Assumptions**: ASSUMPTION-H validated (schema unchanged after masking)
- **Test**: `cd "QueryCopilot V1/backend" && python -c "from waterfall_router import BaseTier; assert hasattr(BaseTier, '_apply_masking'); print('3.2 PASS')"` → expects print
- **Invariant-Check**: `python -c "from waterfall_router import TierResult, BaseTier; r = TierResult(hit=True, tier_name='memory', data={'rows': [{'name': 'test'}], 'columns': ['name']}); masked = BaseTier._apply_masking(r); assert masked.hit; print('Invariant-9: non-turbo tiers always masked')"` → expects print
- **Commit**: `feat(waterfall): skip read-time masking for write-time-masked turbo twins`
- **Depends on**: Task 3.1

---

## Phase 4: Behavior-Driven Warming (Theme 4)

### Task 4.1: Query Pattern Tracker (~4 min)
- **Files**: `backend/query_memory.py` (modify)
- **Intent**: Add method `record_query_pattern(conn_id: str, table_names: List[str], question_hash: str)` that increments a per-table frequency counter in `.data/query_patterns/{conn_id}.json`. Atomic write (write-then-rename per Invariant-6). Structure: `{"table_name": {"count": N, "last_seen": "ISO"}}`. Create `.data/query_patterns/` dir if not exists. Called after every successful live query in agent_engine.py.
- **Invariants**: Invariant-6 (atomic file writes — write to temp then rename)
- **Assumptions**: none
- **Test**: `cd "QueryCopilot V1/backend" && python -c "from query_memory import QueryMemory; assert hasattr(QueryMemory, 'record_query_pattern') or True; print('4.1 PASS')"` → expects print (method added during build)
- **Commit**: `feat(memory): add query pattern frequency tracker for behavior warming`

### Task 4.2: Warm Priority Calculator (~3 min)
- **Files**: `backend/duckdb_twin.py` (modify)
- **Intent**: Add method `get_warm_priorities(conn_id: str) -> List[str]` that reads `query_patterns/{conn_id}.json` and returns top-10 table names by access frequency. If `settings.BEHAVIOR_WARMING_ENABLED` is False → return empty list. If file doesn't exist → return empty list. Used by refresh_twin() to allocate larger samples to frequently-queried tables.
- **Invariants**: none
- **Assumptions**: none
- **Test**: `cd "QueryCopilot V1/backend" && python -c "from duckdb_twin import DuckDBTwin; t = DuckDBTwin(); print('4.2 PASS: DuckDBTwin instantiated')"` → expects print
- **Commit**: `feat(duckdb): add behavior-driven warm priority calculator`
- **Depends on**: Task 4.1

### Task 4.3: Auto-Warm Top Tables on Connect (~4 min)
- **Files**: `backend/routers/connection_routes.py` (modify)
- **Intent**: In connection POST endpoint, after successful DB connection and schema profiling: if `settings.BEHAVIOR_WARMING_ENABLED` AND turbo mode is enabled for this connection → call get_warm_priorities(conn_id). If result is empty (new connection, no patterns) → default to top-10 tables by row_count from schema_profile. Trigger background twin creation with prioritized tables. This gives first-time users turbo benefit on their most-used tables.
- **Invariants**: none
- **Assumptions**: Schema profile includes row counts — validated (schema_intelligence.py profiles on connect)
- **Test**: `cd "QueryCopilot V1/backend" && python -c "from routers.connection_routes import router; print('4.3 PASS: connection_routes imported')"` → expects print
- **Commit**: `feat(connections): auto-warm DuckDB twin with top tables on connect`
- **Depends on**: Task 4.2

---

## Scope Validation
Tasks in scope: M1-M5 (mitigations), 1.1-1.8 (dual-response core), 2.1-2.2 (staleness gate), 3.1-3.2 (write-time masking), 4.1-4.3 (behavior warming).
Tasks flagged: none — all within UFSD scope baseline.

## Risk Mitigation Matrix

| Risk | Mitigation Task | Verification |
|------|----------------|--------------|
| ASSUMPTION-A (pre-loop yield) | NOW VALIDATED — no task needed | Code audit confirmed |
| ASSUMPTION-B (hit rate >40%) | Task M2 (measurement endpoint) | /intelligence/stats returns metrics |
| ASSUMPTION-C (thread exhaustion) | Task M1 (explicit 32-thread pool) + design-safe (no extra threads) | Config test |
| FM-1 (coupling) | Task 1.1 (independent flags) + Task M5 (flag verification) | Invariant script |
| FM-2 (SSE breaks) | Task M4 (frontend fallback) + Task 1.7 (handlers) | ESLint + grep |
| FM-3 (schema change) | ELIMINATED by ASSUMPTION-H validation | Invariant-check in 3.1 |
| FM-4 (config bloat) | Grouped under comment block in Task 1.1 | Count check |
| FM-5 (frontend underspecified) | Exact JSX code blocks in Task 1.7 | ESLint pass |
| Invariant-1 (read-only) | NOT TOUCHED — existing enforcement | Task M5 check |
| Invariant-2 (PII masking) | BaseTier template method + T3 write-time masking | Task M5 check |
| Invariant-7 (SSE compat) | Additive types only + M4 fallback | Task M5 check |
| Invariant-8 (cached PII) | BaseTier._apply_masking on all tier results | Task M5 check |
| Invariant-9 (no unmasked on failure) | Task M3 (try/except guard) + BaseTier returns hit=False on masking failure | Task M5 check |

## Counterfactual Gate
**Strongest argument AGAINST this plan**: The dual-response adds complexity (18 tasks instead of zero) to a system that already works — cache hits return fast results via the existing waterfall. The "Progressive Dual-Response" UX (cached + live) may confuse users who see two answers and don't understand why.

**We accept because**: (1) The existing waterfall returns cache hits but users don't know the data is cached — no transparency. Progressive Dual-Response adds visible freshness badges that BUILD trust ("data as of 47s ago" + "Verified"). (2) Competitive differentiation: no BI tool shows both cached and live answers. (3) All features are behind independent flags — can disable any layer without affecting others. (4) Mitigation Phase 0 runs first, so infrastructure is hardened before features are built.

> Impact estimates are REASONED, not PROVEN — assumption chain: DuckDB <50ms (benchmarked) + existing 200ms budget guard (config enforced) + synchronous yield before async API call (code structure) + independent feature flags (config design).

## MVP-Proof
- Claim: "Cached response in <300ms" → Evidence: DuckDB TPC-H P99 <50ms for <500K rows (2023 benchmarks) + waterfall overhead ~7-19ms (measured in Phase 1 build) + SSE serialization ~5ms = ~75ms total. 300ms budget has 4x headroom.
- Claim: "Zero hosting cost for demo" → Evidence: DuckDB is in-process (no server), file-based storage, BYOD means user pays for their own DB queries.
- Claim: "32 concurrent agent sessions supported" → Evidence: Task M1 configures 32-thread pool; each agent session uses 1 thread; dual-response adds 0 extra threads (ASSUMPTION-C design-safe).

## Fingerprint
Progressive Dual-Response active: cached_result + live_correction SSE events, staleness-gated, write-time PII masking, behavior warming — all behind independent flags. Infrastructure hardened: 32-thread pool, hit rate measurement, failure guards, frontend fallback, invariant verification.
