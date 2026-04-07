# Query Intelligence System Hardening — Post-Mortem

**Date**: 2026-04-07
**Files**: `waterfall_router.py`, `schema_intelligence.py`, `config.py`
**Sessions**: 5 (1 council + 2 debug + 2 adversarial)
**Final state**: 16 fixes applied, 65/65 verification checks pass, 0/32 test regressions

---

## Problem Statement

The Query Intelligence System — a 4-tier waterfall router (schema, memory, turbo, live) built on 2026-04-06 — had passed its initial build tests (26/26) and first adversarial round (6 P0/P1 fixes). On 2026-04-07, a systematic audit of the planning-phase assumptions, invariants, and failure modes revealed that several were not actually addressed in the implementation.

Four specific gaps:

1. **PII masking bypass (P0)**: Memory and turbo tier results returned through the waterfall bypassed `mask_dataframe()`. The original code commented `# INVARIANT-2: caller must run mask_dataframe() on any rows in result` — but no caller did. Every tier result with rows reached the user unmasked.

2. **No timing guards (P1a)**: A slow tier (e.g., ChromaDB on cold start, corrupted DuckDB file) blocked the entire waterfall with no timeout. There was no mechanism to skip a slow tier and fall through.

3. **SQL injection in schema profiling (P1)**: Row-count estimation functions used f-string interpolation with table names sourced from the connected database: `text(f'SELECT COUNT(*) FROM "{table_name}"')`. A database with a maliciously-named table could inject SQL.

4. **Cloud warehouse blocking (G1)**: `COUNT(*)` was the fallback for 13/18 database types. On TB-scale Snowflake, BigQuery, or Databricks tables, this blocks for 30-120 seconds during schema profiling at connect time.

Constraints: the waterfall router is a module-level singleton (shared across all requests), the system uses both sync and async code paths (FastAPI with sync generators), and PII masking must be structurally enforced for SOC 2/compliance readiness.

---

## Thought Process

### Verifying the blocking assumption first

Before designing any fix, we verified whether `mask_dataframe()` was idempotent — because the proposed solutions all involved calling it at new locations, potentially double-masking data. The verification traced through `pii_masking.py`:

- `_mask_value("john@test.com")` produces `"j**************m"` (first + asterisks + last)
- On second pass, the regex `[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}` does not match `"j**************m"` — the asterisks break the email pattern
- Same for SSN, credit card, phone patterns — masked values don't match PII regexes

Result: idempotent on DataFrames. Crashes on dicts (`AttributeError` on `.empty`). This meant any masking solution had to be type-aware.

### Council: 20 personas, 3 themes

We ran a 20-persona evaluation council on where to place masking:

| Theme | Mechanism | Votes | Key trade-off |
|-------|-----------|-------|---------------|
| Router Boundary | Mask once at `route_sync()` exit | 10/20 | One audit point, but bypass-able if anyone calls `tier.answer()` directly |
| Tier-Internal | Mask inside each tier's `answer()` | 9/20 | Defense-in-depth, but 4 call sites to maintain — new tiers must remember |
| Template Method ABC | Make `answer()` non-overridable; it calls `_answer()` then masks | 1/20 | Highest effort, but structurally un-bypassable |

The user chose Theme 3 (1 vote) for monetization/compliance readiness. The reasoning: convention-based security erodes as developers join and leave; structural enforcement (ABC contract) survives team changes.

We also initially planned to keep the router boundary as a "safety net" (belt-and-suspenders). This decision later proved wrong — it doubled memory and CPU without providing additional safety, since the template method already guarantees masking.

### Alternatives rejected

- **Mask at yield point in `agent_engine.py`**: Rejected because `agent_engine.py` is only one of several callers of the waterfall. Masking there would miss other paths.
- **Runtime decorator on `answer()`**: Rejected because Python decorators can be unwrapped or overridden. `__init_subclass__` is a harder enforcement than a decorator.
- **Pre-emptive timeout (true kill)**: Rejected for the sync path because `_route_sync_impl` uses `coro.send(None)` which completes in a single step — there is no suspension point to cancel. Post-hoc discard was the pragmatic choice.

---

## Implementation

### Session 1: Debug — Implementing council decisions (7 fixes)

1. **Template Method refactor**: `BaseTier.answer()` made concrete. Calls abstract `_answer()`, then calls `_apply_masking()`. All 4 tiers (`SchemaTier`, `MemoryTier`, `TurboTier`, `LiveTier`) renamed their `answer()` to `_answer()`. Logic unchanged in each tier.

2. **`__init_subclass__` enforcement**: Added to `BaseTier`. Checks `"answer" in cls.__dict__` at class-definition time. Raises `TypeError` if a subclass tries to override `answer()`.

3. **`_apply_masking` static method**: Type-aware masking. Checks if `result.data` contains a `"rows"` list with actual data. Converts to DataFrame, calls `mask_dataframe()`, converts back to dicts. Skips if rows are empty, data is None, or rows aren't dicts/lists.

4. **Per-tier timing guards**: Added `time.perf_counter_ns()` before and after each `can_answer()` and `answer()` call. If `can_answer()` exceeds 100ms or `answer()` exceeds 500ms, discard the result and fall through. Live tier exempt (final fallback).

5. **Error fallthrough**: All `except Exception` blocks in the waterfall loop now `continue` to the next tier instead of surfacing errors. DuckDB file corruption, ChromaDB timeouts, etc. cause a graceful miss.

6. **SQL injection fix**: Created `_safe_quote_ident(table_name)` that doubles embedded `"` characters and rejects null bytes. Applied to all 4 f-string interpolation points in `_count_star` and `_count_star_sampled`.

7. **Cloud warehouse fast paths**: Added `_estimate_row_count_snowflake` (uses `INFORMATION_SCHEMA.TABLES`), `_estimate_row_count_mssql` (uses `sys.partitions`), and `_count_star_sampled` (subquery with `LIMIT` or `TABLESAMPLE SYSTEM` fallback). Returns -1 (unknown) instead of blocking with full `COUNT(*)`.

8. **Router boundary safety net**: Added `BaseTier._apply_masking(result)` calls in both `route()` and `_route_sync_impl()` after the tier's `answer()` returned. This was the belt-and-suspenders decision from the council.

### Session 2: NEMESIS Round 1 — Adversarial testing of Session 1 fixes

Dispatched 20 operatives. Key findings and fixes:

- **P0**: `_apply_masking` exception handler returned unmasked data (Ops 8, 16). Fixed: return `TierResult(hit=False, data=None, metadata=result.metadata)`.
- **P1**: Double-masking at router boundary doubled memory and CPU (Ops 10, 11). Fixed: removed the `_apply_masking` calls from `route()` and `_route_sync_impl()`.
- **P1**: Timing budgets hardcoded and duplicated in two methods (Op 15). Fixed: moved to `config.py` as `WATERFALL_CAN_ANSWER_BUDGET_MS=200` and `WATERFALL_ANSWER_BUDGET_MS=1000`.
- **P2**: `_apply_masking` didn't forward `conn_id` to `mask_dataframe` (Op 19). Fixed: added `conn_id` parameter.
- **P2**: Snowflake `table_name.upper()` missed quoted mixed-case identifiers (Op 18). Fixed: `LOWER(TABLE_NAME) = LOWER(:tbl)` with `TABLE_SCHEMA = CURRENT_SCHEMA()`.

### Session 3: Post-NEMESIS Debug — Verifying Session 2 fixes

Discovered that the `replace_all` edit for timing budgets only updated `route()` (async), not `_route_sync_impl()` (sync). The sync path — which is the production path under FastAPI — still had hardcoded `CAN_ANSWER_BUDGET_MS = 100`. Verified by calling `_route_sync_impl` directly with a 150ms tier: it was skipped at 100ms when config said 200ms. Fixed the second copy.

### Session 4: NEMESIS Round 2 — Adversarial testing of Session 2/3 fixes

Dispatched 20 operatives. Found 3 bugs introduced by Session 2:

- `TierResult(data=None)` on masking failure crashed callers that called `data.get()`. Fixed: `data={}`.
- `metadata=result.metadata` shared the dict by reference. Fixed: `metadata=dict(result.metadata)`.
- `result.data["rows"] = []` in the no-columns path mutated the dict in place. Fixed: new `TierResult` with `{**result.data, "rows": []}`.

Also added `ge=10` / `ge=50` validators to the timing budget config fields to prevent accidental disable with `0`.

### Session 5: Final Verification

33 targeted fix-specific checks + 26 phase tests + 6 integration tests = 65/65 pass. Skeptic found that router miss paths still use `data=None` while `_apply_masking` failure uses `data={}`. Resolved as intentional: native misses always returned `None` and callers already guard for it; the `data={}` fix was specifically for the converted-miss path where callers expected a dict.

---

## Bugs & Failures

### Bug 1: Timing budgets not updated in sync production path

- **What happened**: After moving timing budgets from hardcoded constants to `config.py`, the async `route()` method read from `settings.WATERFALL_CAN_ANSWER_BUDGET_MS` (200ms) but the sync `_route_sync_impl()` still had `CAN_ANSWER_BUDGET_MS = 100`. FastAPI uses the sync path in production (there's already a running event loop, so `route_sync()` delegates to `_route_sync_impl()`). Every production request used the old 100ms budget. A MemoryTier responding in 150ms (normal for network-remote ChromaDB) was silently discarded, forcing a 30-second live query. The config setting had zero effect.
- **Introduced at**: Session 1, when we used `replace_all=true` to swap hardcoded values for config reads. The edit tool matched the pattern in `route()` but not `_route_sync_impl()` because the surrounding comment text differed.
- **Root cause**: Code duplication. `route()` and `_route_sync_impl()` independently defined the same constants. The two methods evolved from different starting points — `route()` was the original async implementation; `_route_sync_impl()` was added as a P0 sync compatibility fix during the initial build. Each had its own copy of the constants with different surrounding context.
- **Discovered by**: Session 3 debug. We called `_route_sync_impl` directly with a `SlowMemoryTier` that slept 150ms. Output: `"Tier 'memory' can_answer() took 150.1ms (budget=100ms); skipping."` — the log message itself revealed the hardcoded budget.

### Bug 2: Masking failure returned unmasked PII data

- **What happened**: `_apply_masking` had a `try/except Exception` block. On any exception (pandas not installed, malformed rows, column mismatch), the handler logged a warning labeled `"(non-fatal)"` and returned the original `result` object — with the unmasked `rows` still in `result.data["rows"]`. SSNs, emails, salaries in tier results passed straight through to the API response.
- **Introduced at**: Session 1, when we wrote `_apply_masking`. We copied the common Python pattern of `try: ... except: log warning; return input`. For a utility function this is fine. For a security-critical masking function, this is a data breach.
- **Root cause**: The exception handler was written from a reliability perspective ("don't crash the waterfall") instead of a security perspective ("don't leak PII"). The `"(non-fatal)"` label in the log message reflects this mindset. The correct framing: masking failure on non-empty rows is always fatal.
- **Discovered by**: NEMESIS Round 1, Operatives 8 and 16 (independent confirmation). Op 8 (Crash Recovery) specifically tested what happens when `pd.DataFrame()` raises on malformed input. Op 16 (Business Logic) tested the same path via `ImportError` on `pii_masking`.

### Bug 3: Failure-path TierResult had `data=None`, crashed downstream `.get()`

- **What happened**: When fixing Bug 2, we changed the exception handler to return `TierResult(hit=False, tier_name=result.tier_name, data=None, metadata=result.metadata)`. This stopped the PII leak. But downstream code like `result.data.get("cache_age_seconds", 0)` now raised `AttributeError: 'NoneType' object has no attribute 'get'`. Existing callers had guards (`if result.data else 0`) but the pattern was fragile — any new caller without the guard would crash.
- **Introduced at**: Session 2 (NEMESIS Round 1 fix). We modeled the failure return after the existing miss pattern (`TierResult(hit=False, data=None)`), where callers already expected `None`. But this was a different code path — the result originated as a `hit=True` with data, got downgraded to `hit=False` by masking failure, and traveled through callers that had already checked `hit` before accessing `data`.
- **Root cause**: Pattern copying without tracing the call chain. The existing miss pattern (`data=None`) was safe because callers check `hit` first and never access `data` on a miss. But this failure path was a HIT that got CONVERTED to a miss — and the conversion happened inside `_apply_masking`, which is called from `answer()`, which is called from the router loop. The router's audit logging on the HIT path (before the masking conversion) already expected `data` to be a dict.
- **Discovered by**: NEMESIS Round 2, Operative 10 (Memory Analyst). Tested `TierResult(data=None)` against `result.data.get("cache_age_seconds")` and confirmed the `AttributeError`.

### Bug 4: Failure-path TierResult shared metadata dict with original

- **What happened**: `TierResult(metadata=result.metadata)` in the exception handler passed the same dict object. The new `TierResult` and the original `result` shared one metadata dict. If any code mutated metadata on the failure result (e.g., adding `metadata["error"] = "masking_failed"`), the mutation was visible on the original result too. In the current codebase, the router adds `metadata["tiers_checked"]` and `metadata["time_ms"]` after the tier returns — these mutations would propagate back to the tier's original result if it was cached or logged.
- **Introduced at**: Session 2 (NEMESIS Round 1 fix), same exception handler as Bug 3. We focused on fixing the `data` field (the PII leak) and didn't consider that `metadata` was also a reference type being shared.
- **Root cause**: Python's dict-by-reference semantics. `metadata=result.metadata` does not copy. The dataclass default factory (`field(default_factory=lambda: {...})`) creates fresh dicts for NEW instances, but we explicitly passed an existing dict, overriding the factory.
- **Discovered by**: NEMESIS Round 2, Operative 8 (Crash Recovery). Constructed a TierResult, forced masking failure, then mutated `failed.metadata["error"] = "test"` and checked whether the original's metadata was affected. It was.

### Bug 5: In-place mutation of `result.data["rows"]` on no-columns path

- **What happened**: When `_apply_masking` encountered rows that weren't dicts and had no column names, it executed `result.data["rows"] = []` to strip the rows and prevent a PII leak. This mutated the `data` dict in place. If any other code held a reference to `result.data` (caching, audit logging, the caller that just constructed the TierResult), those references now saw `rows=[]` when they expected the original rows.
- **Introduced at**: Session 1, when we wrote the no-columns fallback path in `_apply_masking`. The code `result.data["rows"] = []` was the simplest way to strip the data, and we were focused on preventing the PII leak, not on reference semantics.
- **Root cause**: Mutating a dict that was passed as part of a function input. `_apply_masking` receives a `TierResult` whose `data` dict may be referenced elsewhere. The mutation `["rows"] = []` modifies the original dict, not a copy. The safe approach is to create a new dict: `{**result.data, "rows": []}`.
- **Discovered by**: NEMESIS Round 2, Operative 6 (Structure Analyst). Created a `TierResult`, saved a reference to `result.data`, called `_apply_masking`, then checked whether the external reference saw the mutation. It did.

---

## Prevention Rules

1. **After any `replace_all` edit, grep for the old pattern and verify zero remaining instances.** The timing budget bug existed because `replace_all` matched one of two copies. A 5-second grep would have caught it. Specific command: `grep -n "CAN_ANSWER_BUDGET_MS = " waterfall_router.py` after the edit.

2. **Never define the same constant in two methods. Extract to module-level, config, or a shared helper.** `route()` and `_route_sync_impl()` independently defined `CAN_ANSWER_BUDGET_MS` and `ANSWER_BUDGET_MS`. When one was updated, the other drifted silently. One definition, two consumers.

3. **Exception handlers on security-critical functions must return a SAFE DEFAULT, never the original input.** `except Exception: return result` on a masking function returns unmasked PII. The safe default is `TierResult(hit=False, data={})` — no data is always safer than unmasked data. Label the handler `SECURITY EVENT`, never `non-fatal`.

4. **When constructing a new object from an existing one's fields, copy all mutable fields explicitly.** `TierResult(metadata=result.metadata)` shares the dict. Use `metadata=dict(result.metadata)`. This applies to every dict and list field, not just the one you're focused on fixing.

5. **Never mutate a dict or list that was passed into a function as part of an input parameter.** `result.data["rows"] = []` modifies the caller's data. Create a new dict: `safe_data = {**result.data, "rows": []}` and return a new `TierResult(data=safe_data)`. Treat function inputs as read-only.

6. **When returning a new value on an exception path, trace every downstream consumer and verify it handles the new shape.** The `data=None` bug was caused by not checking what callers do with `result.data` after a hit-to-miss downgrade. Specifically: check for `.get()` calls, attribute access, truthiness checks, and iteration on the field.

7. **Do not add redundant safety nets that multiply resource consumption.** The double-masking "belt-and-suspenders" pattern (mask in template method + mask at router boundary) doubled DataFrame creation and regex scanning per request. If a structural guarantee (ABC template method) already enforces the invariant, a runtime duplicate is not defense-in-depth — it is waste.

8. **Test fixes in the PRODUCTION code path, not just the convenient code path.** The timing budget fix passed tests because the test script (no event loop) hit `route()` (async, correctly updated), not `_route_sync_impl()` (sync, still hardcoded). FastAPI always uses the sync path. Verify by calling the production entry point directly.

---

## Lessons Learned

1. **We assumed `replace_all` edits are complete. The reality was that slight differences in surrounding code caused partial matches.** Next time, always grep for the old pattern after a `replace_all` edit. Treat the edit as unverified until grep returns zero results.

2. **We assumed exception handlers on masking functions should prioritize availability ("don't crash"). The reality was that for security-critical functions, availability of unmasked data is worse than unavailability.** Next time, exception handlers on PII/security paths must return empty/error results, never the original unmasked input. The safe default for a masking failure is "no data," not "all data."

3. **We assumed that fixing the primary field (`data`) in a new return value was sufficient. The reality was that other mutable fields (`metadata`) on the same object also needed copying, and the dict we were modifying (`result.data["rows"]`) was a shared reference.** Next time, when constructing a new object from an existing one, audit every mutable field and explicitly copy each. Python's reference semantics mean any dict or list you don't copy is shared.

4. **We assumed that tests passing meant the production path was fixed. The reality was that the test path (async `route()`) and the production path (sync `_route_sync_impl()`) were different code, and only one was updated.** Next time, write tests that exercise the exact production code path. For FastAPI sync/async dual paths, test both — and better yet, extract shared logic so there's only one path to test.

5. **We assumed the majority council vote (10/20 for Router Boundary) was the pragmatic choice. The reality was that the 1/20 minority vote (Template Method) was architecturally correct for a commercial product.** Next time, for security-critical architectural decisions, evaluate minority opinions on structural merit, not vote count. Convention-based enforcement erodes with team changes; structural enforcement persists.
