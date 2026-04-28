# Migration Notes — AskDB Flag Flip Events

Operator-visible side effects of latent-capability flag flips. Append-only.
Each entry: trigger, what changes for users, mitigation.

---

## Phase 1 — Bundled retrieval flip (FEATURE_HYBRID_RETRIEVAL + FEATURE_MINILM_SCHEMA_COLLECTION)

**Status:** Pending Step C smoke 10 + Step D decision (2026-04-27).

**Trigger:** Both flags flip from `False` → `True` in `backend/config.py`. Companion change: `BENCHMARK_MODE` no longer auto-coerces these flags (OR-coerce removed in `query_engine.py:187-188`).

### What changes for production users

1. **Schema retrieval embedder swap.**
   - Before: `_HashEmbeddingFunction` (lexical n-gram hash, 384-dim).
   - After: `_MiniLMEmbeddingFunction` (sentence-transformers `all-MiniLM-L6-v2`, 384-dim semantic) + BM25 index alongside Chroma, RRF fusion (K=60) in `find_relevant_tables`.

2. **Chroma collection orphan event.**
   - Existing collection: `schema_context_<conn_id>` (legacy hash-v1).
   - New collection: `schema_context_<conn_id>_minilm-v1_hybrid-v1` (post-flip).
   - Vector spaces are NOT mixable — hash-v1 collections orphan on disk; new collection rebuilt on first query per active connection.

3. **First-query cost per active connection (one-time).**
   - MiniLM warmup: ~13s on warm OS cache (singleton preload in `main.py` lifespan amortizes most of this).
   - BM25 index build: sub-millisecond on typical schema; bounded by table count.
   - Subsequent queries: 11ms hot-encode path, no additional cost.

4. **Disk usage.**
   - Orphan `schema_context_<conn_id>` collections persist on disk until manual cleanup. New `_minilm-v1_hybrid-v1` collections build alongside.
   - No automatic deletion (per D1 / Wave 3 spec — never auto-delete user-affecting data).

### Mitigation

- **Recommended:** announce maintenance window OR ship pre-warm script that rebuilds all active connection collections on backend startup post-flip. Eliminates user-facing 13s warmup on first query.
- **Optional follow-up ticket:** `scripts/prewarm_hybrid_collections.py` — walks `app.state.connections`, calls `train_schema()` per connection on startup behind `FEATURE_HYBRID_RETRIEVAL=True`. Status: not implemented at flip time.
- **Rollback:** flip both defaults back to `False`. Production reverts to hash-v1 retrieval against legacy collections (still on disk). Zero data loss in either direction.

### Companion changes (same commit as flag flip)

- `backend/query_engine.py:187-188` — `_use_hybrid` and `_use_minilm` no longer OR-coerced by `BENCHMARK_MODE`. Doc-enrichment OR-coerce (line 252) intentionally retained pending Capability 3 audit.
- BIRD harness scripts (4) updated to set both flags explicitly via `os.environ`:
  - `backend/scripts/run_bird_smoke10.py`
  - `backend/scripts/smoke_bench_wave2.py`
  - `backend/scripts/preflight_hybrid_dry_run.py`
  - `backend/scripts/opus_id_preflight.py`
- Tests: `test_benchmark_mode_coerces_hybrid_on` and `test_benchmark_mode_coerces_upgraded_path` replaced with new contract tests covering the 4 flag-state cases (both False / both True × BM False / BM True).

### Differential evidence (pre-flip)

- Phase A pilot 50 baseline (hash-v1, hybrid OFF): 36% EX
- Phase C v1 pilot 50 (hybrid + doc-enrich ON): 38% EX (+2pts on retrieval foundation)
- Phase C v3 pilot 50 (full stack, hybrid coerced via BM): 60% (sampling-inflated)
- Main 150 v3 (hybrid coerced via BM): 48.7%
- Main 150 Routing V2 (hybrid + Sonnet primary): 64.7%

Hybrid-only contribution to production EX cannot be isolated from BIRD harness data because BENCHMARK_MODE (which previously coerced hybrid ON) also enables column-discipline directive and ask_user/gate_c bypasses. Production-faithful measurement is constrained by lack of human-in-the-loop responses for clarification gates.

---

## main.py `import os` fix — pre-existing bug from D1 preload block

**Discovered:** during Phase 1 Step B test sweep on 2026-04-28.

**Root cause:** The D1 (Wave 2, 2026-04-26) embedder preload block in `backend/main.py` lifespan (lines 113-143) calls `os.environ.get("EMBEDDER_PRELOAD_DISABLE", ...)` but `import os` was never added to the file's top imports. NameError fires on every backend startup that exercises the lifespan path (every TestClient instantiation in the test suite).

**Why it didn't surface yesterday:** D1 block + missing import were both left uncommitted during the BIRD optimization wave. `git show c88fef2 -- backend/main.py` is empty (yesterday's commit didn't touch main.py). Production on `origin/phase-m-alt` was NOT broken — only the local working tree.

**Fix:** add `import os` to main.py top imports (alphabetical with `import logging`). One line.

**Scope:** technically outside Phase 1 retrieval-flag-flip work, but bundled into the same commit because it surfaced during Phase 1 Step B sweep and blocks all lifespan-exercising tests. Sid authorized inclusion 2026-04-28.

**Lesson:** uncommitted working-tree state can drift far enough from `HEAD` that "tests pass on the last commit" stops being a reliable signal for "tests pass on what we're about to commit." Future BIRD waves should land smaller, fully-tested commits rather than bundle uncommitted scaffolding into the next wave.

---

## Stale tests post BIRD config bumps — Phase 1 Step B sweep

**Discovered:** during Phase 1 Step B test sweep on 2026-04-28. Same uncommitted-debt pattern as the `import os` fix above.

### Stale test 1 — `test_w1_hardcap.py::test_analytical_cap_is_20_when_flag_on`

`W1_ANALYTICAL_CAP` was raised `20 → 22` on 2026-04-26 (Wave 1, BIRD lift; documented in `docs/claude/config-defaults.md`). The test still asserted `cap == 20` and was renamed `..._22_...` with assertion bumped to `22`. Same code path; no behavior change.

### Stale test 2 — `test_w2_thinking_stream.py::test_compute_thinking_kwarg_decrements_with_used`

AMEND-W2-17 (in `agent_engine._compute_thinking_kwarg`) returns `None` early when `FEATURE_CLAIM_PROVENANCE=True` to keep thinking-stream output deterministic for downstream claim binders. `FEATURE_CLAIM_PROVENANCE` default is `True` per `config.py:548`. The test never toggled it off, so the helper short-circuited to `None` before exercising the budget-decrement contract under test. Fix: add `monkeypatch.setattr(settings, "FEATURE_CLAIM_PROVENANCE", False)` at the top of the test body.

**Lesson (reinforces):** when a config value is bumped or a new gate is added to a function, the companion-test update needs to land in the same commit. The Wave 1 BIRD optimization commit hygiene let three of these slip (D1 preload `import os`, W1 analytical cap test, W2 thinking-stream provenance gate test).

---

## Phase 1 final — FEATURE_HYBRID_RETRIEVAL + FEATURE_MINILM_SCHEMA_COLLECTION default flip (2026-04-28)

**Status:** Defaults flipped `False → True` in `backend/config.py`.

### Validation collected

1. **Code-path clean** — OR-coerce removed at `query_engine.py:193-194`. BENCHMARK_MODE no longer auto-coerces these flags. BIRD harness (4 scripts) sets both flags explicitly via `os.environ`.
2. **Retrieval-active logs confirmed** — Step C smoke 10 emitted `QueryEngine: hybrid retrieval active (BM25+MiniLM+RRF, suffix=_minilm-v1_hybrid-v1)` per question.
3. **qid 1471 RRF win materialized** — debit_card_specializing simple, predicted hybrid+BM25 anchor on `customers` table → PASS confirmed in smoke.
4. **Full test sweep green** — 2370 passed / 0 failed / 2 skipped post-flip (was 2367 pre-flip; +3 Phase 1 regression tests).
5. **agent_engine.py byte-identical** to pre-Phase-1 commit — column-discipline, gate logic, BENCHMARK_MODE bypasses all unchanged.

### Production user impact

One-time per active connection on first query post-deploy:
- Schema collection rebuild from `schema_context_<ns>` (legacy hash) → `schema_context_<ns>_minilm-v1_hybrid-v1` (hybrid).
- ~13s MiniLM warmup amortized by `main.py` lifespan preload (cold-load + warmup encode happens at backend startup, not first user request).
- BM25 index build: sub-millisecond on typical schema.
- Subsequent queries: 11ms hot-encode path.

Legacy `schema_context_<ns>` collections persist on disk as orphans — never read, never written, never deleted. Manual cleanup optional (no auto-delete per D1 spec).

### Rollback paths (both available)

1. **Per-deployment**: set `FEATURE_HYBRID_RETRIEVAL=false` + `FEATURE_MINILM_SCHEMA_COLLECTION=false` in `.env`. QueryEngine reverts to hash-v1 against the orphan collections (still on disk, no data loss).
2. **Code-level**: flip both defaults back to `False` in `config.py`. Same effect, repo-wide.

Either path is safe — no schema migration, no DB writes, no destructive operation involved.

### Regression tests added (3, all in `tests/test_query_engine_hybrid_retrieval.py`)

- `test_phase1_default_flip_both_flags_True` — asserts Pydantic field defaults True (decoupled from .env state).
- `test_phase1_explicit_False_override_falls_back_to_hash_v1` — validates rollback path.
- `test_phase1_orphan_legacy_collection_no_crash` — confirms QueryEngine never touches orphan collection name.

### Spawned ticket

Mid-run EX guard threshold over-fires on small smoke samples (`run_bird_smoke10.py`). Discovered Phase 1 Step C — single-question variance trips the 35% floor at n=3. Either disable guard for n<10, OR scale floor by sample size. Tracked separately.

---

## Phase 1 Capability 3 — FEATURE_RETRIEVAL_DOC_ENRICHMENT PII hardening + default flip (2026-04-28)

**Status:** Default flipped `False → True` in `backend/config.py`. Two-layer PII defense active.

### What changes for production users

1. **Chroma collection orphan event (_docv2 → _docv3).**
   - Existing collection (if any): `schema_context_<conn_id>_docv3` suffix was not yet in use pre-Cap-3; collections built while `FEATURE_RETRIEVAL_DOC_ENRICHMENT` was coerced ON by `BENCHMARK_MODE` carried `_docv2` suffix (pre-PII-hardening, may contain unmasked sample values).
   - New collection: `_docv3` suffix — all sample values pass through 2-layer PII defense before storage.
   - `_docv2` collections orphan on disk; never read, never written post-deploy. Manual cleanup optional.

2. **One-time collection rebuild per active connection (on first query post-deploy).**
   - Applies only to connections that had `FEATURE_RETRIEVAL_DOC_ENRICHMENT` active under the old OR-coerce path (`BENCHMARK_MODE=True`). Production user connections with the flag explicitly `False` (default pre-Cap-3) have no `_docv2` collections — no rebuild needed.
   - Rebuild triggers `train_schema()` which re-embeds all tables into new `_docv3` collection with PII-hardened docs.
   - Cost: proportional to schema size; typically sub-second for schemas under 50 tables.

3. **PII masking applies to all future enriched docs.**
   - Layer 1: column-name filter. `SENSITIVE_COLUMN_PATTERNS` (email, ssn, phone, password, secret, token, etc.) + admin-flagged columns (`get_suppressed_set(conn_id)`) dropped BEFORE SELECT runs. No sensitive column data ever extracted.
   - Layer 2: value-level redact. Each extracted value passes through `pii_masking.redact_pii_value()` — full-value `[REDACTED]` replacement on email/phone(US)/SSN/credit-card/IP regex match. Full replacement (not partial mask) prevents domain-leak from e.g. `s***k@gmail.com`.

### OR-coerce removal

`BENCHMARK_MODE=True` previously auto-coerced `FEATURE_RETRIEVAL_DOC_ENRICHMENT` ON. Removed in Capability 3 — completes the OR-coerce cleanup started by Cap 1+2 for hybrid/minilm flags. BIRD harness scripts (4) now set all three retrieval flags explicitly via `os.environ`. `BENCHMARK_MODE` is now a pure eval gate with no hidden feature activations.

### Rollback paths (both available)

1. **Per-deployment**: set `FEATURE_RETRIEVAL_DOC_ENRICHMENT=false` in `.env`. QueryEngine falls back to bare schema docs (no sample values, no FK hints) in the legacy collection. Zero data loss.
2. **Code-level**: flip default back to `False` in `config.py`. Same effect, repo-wide.

### Regression tests added (10, in `tests/test_pii_enrichment_masking.py`)

- `test_sensitive_column_email_dropped` — Layer 1: email column dropped before SELECT.
- `test_sensitive_column_ssn_dropped` — Layer 1: ssn column dropped.
- `test_sensitive_column_phone_dropped` — Layer 1: phone_number column dropped.
- `test_customer_name_passes_known_gap` — documents deferred decision: `name`/`customer_name` NOT in patterns (false-positive risk against `table_name`, `display_name`). Guards against silent expansion.
- `test_admin_suppressed_column_dropped` — Layer 1: admin-flagged column dropped via `get_suppressed_set`.
- `test_pii_value_in_nonsensitive_column_redacted` — Layer 2: email address in `notes` column → `[REDACTED]`; clean value passes unchanged.
- `test_non_pii_column_passes_through` — no false positives on benign column values.
- `test_fk_hints_unaffected` — FK hint extraction reads schema metadata only; PII layers cannot reach it.
- `test_phase1_doc_enrichment_default_True` — Pydantic field default is `True` post-flip (decoupled from .env).
- `test_collection_suffix_is_docv3_when_enriched` — `_docv3` suffix present, `_docv2` absent.

### Deferred tickets spawned

1. **NFKC parity gap** — `is_sensitive_column_name()` normalizes with NFKC before pattern match; `SENSITIVE_COLUMN_PATTERNS` set itself not NFKC-normalized at definition time. Risk: fullwidth lookalike column names could bypass substring match if patterns were crafted with non-normalized chars. Low risk in practice (patterns are ASCII), but parity incomplete. Track separately.
2. **International phone pattern** — `PII_PATTERNS["phone_us"]` covers US/CA NANP format only. E.164 international numbers (e.g. `+44 7911 123456`) pass through Layer 2 unredacted. Expansion deferred pending false-positive review of numeric strings that match broad E.164 patterns. Track separately.

### Validation collected

1. **Full test sweep green** — 2380 passed / 0 failed / 2 skipped post-Cap-3 (was 2370 pre-Cap-3; +10 new Cap-3 tests).
2. **Smoke 10 `_docv3` suffix confirmed** — logs emitted `schema_context_<ns>_docv3` per question; no `_docv2` references.
3. **qid 1471 PASS confirmed** — debit_card_specializing test case passed; no masking-related failures.
4. **AttributeError guard verified** — `getattr(self, "_namespace", None)` in `_extract_sample_values_for_table` tolerates pre-existing tests that construct `QueryEngine` via `__new__()` bypassing `__init__`. All 7 such tests passed without modification.

---

## Phase 1 Capability 4 — SKILL_LIBRARY_ENABLED default flip + dialect-sqlite + router must-keep + smoke harness lifespan (2026-04-28)

**Status:** Default flipped `False → True` in `backend/config.py`. Skill injection active on all agent turns. Two structural bugs fixed before flip.

### What changes for production users

1. **Skill injection into agent system prompt.**
   - Before: `SkillRouter.resolve()` was gated behind `SKILL_LIBRARY_ENABLED=False` — no skill content ever reached the LLM.
   - After: 3 skill blocks injected as Anthropic prompt-cache breakpoints in every agent turn: (a) P1 always-on core (security-rules, agent-identity-response-format, confirmation-thresholds, caching-breakpoint-policy, skill-library-meta — ~5K tokens), (b) deterministic dialect skill selected by `connection.db_type`, (c) deterministic domain skill selected by `behavior_engine.detect_domain()` on the live schema.
   - Skills ARE sent to the LLM and influence output. The "shadow" in `SKILL_SHADOW_MODE_ENABLED` refers to the diff-log side-channel (`.data/audit/shadow_diff.jsonl`), not to observation-only behavior.

2. **Shadow mode docstring corrected.**
   - `backend/shadow_mode.py` module docstring previously stated skills run "without affecting user-facing answer." This was wrong. Corrected 2026-04-28.
   - Prior benchmark runs while `SKILL_LIBRARY_ENABLED=False` (all runs before this commit) had zero skill influence on generated SQL — correct baseline.

3. **ChromaDB `skills_v1` collection bootstrapped on first agent turn post-deploy.**
   - `maybe_ingest()` stamps `.data/.skill_ingest_stamp` on first load; subsequent starts skip re-ingest unless skill files are newer than the stamp. One-time cost: sub-second for 48 skill files.
   - No user-visible latency: ingest runs during backend lifespan startup, same as MiniLM warmup.

4. **Dialect routing now covers SQLite.**
   - `dialect-sqlite.md` created (P3, ~1800 tokens): STRFTIME patterns, YYYYMM TEXT special case, `||` concat, INTEGER-div CAST, INSTR, IFNULL, backtick quoting, RANK for ties, 6 BIRD failure patterns.
   - Added `"sqlite": "dialect-sqlite"` to `_DIALECT_MAP`. SQLite connections now get deterministic dialect injection (Stage 2), not random RAG.

### Structural bugs fixed before flip

**Bug 1 — Cross-dialect RAG leak.**
Before fix: `dialect-snowflake-postgres-duckdb` could surface via semantic similarity in Stage 3 (RAG) on SQLite questions. Cross-dialect content actively misleads SQL generation (Postgres syntax in SQLite queries = wrong answers).
Fix: filter in Stage 3 — when a canonical dialect is known from `_DIALECT_MAP`, all other `dialect-*` skills from RAG are dropped. When `db_type` is unknown, ALL `dialect-*` from RAG are dropped (better none than wrong).

**Bug 2 — `_enforce_caps` dropped deterministic dialect under bundle cap pressure.**
Before fix: 5 P1 always-on + 4 P2 bundle-promoted hits = 9 = `max_skills` cap hit BEFORE the P3 deterministic dialect skill made it into `kept`. `dialect-sqlite` was silently dropped when `sql-calculation` bundle fired.
Fix: must-keep semantics in `_enforce_caps` — `priority=1 OR source="deterministic"` skills are exempt from the count cap (`max_skills`). Must-keep also evicts flexible hits (P3 first, then P2) when token cap is tight. Flexible set (RAG, bundles, depends_on) fills remaining slots up to `max_skills`.

**Bug 3 — Smoke harness bypassed lifespan → skills always None.**
Before fix: `run_bird_smoke10.py` calls `AgentEngine` directly without going through FastAPI lifespan. `main.app.state.skill_library` was never set → `AgentEngine._skill_library` stayed None → `_build_system_payload` returned early → zero skill injection on all prior BIRD runs.
Fix: `setup_skill_library_state()` added to harness — mirrors `main.py` lifespan: loads `SkillLibrary`, calls `maybe_ingest()`, sets `app.state.skill_collection`. Runs once at top of `main()`.

### Rollback paths (both available)

1. **Per-deployment**: set `SKILL_LIBRARY_ENABLED=false` in `.env`. `SkillRouter.resolve()` is never called; agent system prompt reverts to pre-Cap-4 format (no skill blocks). Zero data loss.
2. **Code-level**: flip default back to `False` in `config.py`. Same effect, repo-wide.

### Regression tests added (6, across 2 files)

**`tests/test_skill_router.py`** (3 new, 1 updated):
- `test_deterministic_dialect_survives_bundle_cap_pressure` — P3 deterministic dialect-sqlite survives when `sql-calculation` bundle fires and fills `max_skills` slots.
- `test_p1_always_on_all_present_under_cap_pressure` — all 5 P1 always-on present under cap pressure (join + sum query triggers bundle promotions).
- `test_max_skills_cap_applies_to_flexible_only` — count cap (`max_skills`) applies to flexible hits only; must-keep set (P1 + deterministic) can exceed it.
- `test_router_enforces_token_cap` — updated assertion: `flexible_total <= max_total_tokens` (was `total <= max_total_tokens`; new contract permits must-keep to exceed token cap when no flexible hits remain to evict).

**`tests/test_skill_library_phase1.py`** (3 new):
- `test_skill_library_default_True` — `SKILL_LIBRARY_ENABLED` Pydantic field default is `True` post-flip (decoupled from `.env` state).
- `test_skill_library_loads_from_askdb_skills` — `SkillLibrary(root=askdb-skills/)` loads non-zero skills; guards against directory deletion.
- `test_shadow_mode_default_True` — `SKILL_SHADOW_MODE_ENABLED` Pydantic field default is `True`.

### Spawned tickets (not yet started)

1. **Smoke harness lifespan coverage** — `setup_skill_library_state()` fix applied to `run_bird_smoke10.py` only. `run_bird_main.py` + 3 other entry points have the same harness gap. Fix separately.
2. **Echo cap wire** — `SkillRouter.add_memory_hits()` implements 30% weight cap per Plan 4 T7, but is never called from the active routing path. Wire it in.
3. **Golden eval gate replacement** — `correction_reviewer` uses `golden_eval_gate` threshold check; known brittle on small sample sizes. Replace with trap-suite-backed gate.
4. **BIRD attribution tracking** — no mechanism to attribute EX-rate changes to `SKILL_LIBRARY_ENABLED`. Add per-question skill-injection flag to smoke output for ablation.

### Validation collected

1. **Full test sweep green** — 2386 passed / 0 failed / 2 skipped post-Cap-4 (was 2380 pre-Cap-4; +6 new Cap-4 tests).
2. **Smoke 10 with skills active** — 5/10 = 50% EX. Dialect-sqlite 24/24 entries in `shadow_diff.jsonl` used `dialect-sqlite`; `dialect-snowflake-postgres-duckdb` 0/24 (cross-dialect leak confirmed fixed).
3. **must-keep regression confirmed** — router unit tests: dialect-sqlite present in all 3 new regression scenarios.
4. **`shadow_diff.jsonl` populated** — `setup_skill_library_state()` fix confirmed by non-empty diff log during smoke (was empty on all prior BIRD runs).
