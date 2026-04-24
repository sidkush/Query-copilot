# UFSD — Adversarial Testing Report, Phase A-L (2026-04-24)

## UFSD adversarial-testing 2026-04-24

**Verdict: RESTART REQUESTED on Phase L enable-gates**
**Coverage: 0/7 clusters SOLID** — every cluster surfaced at least one BROKEN structural weakness before flag flip.

Target: Phase A → Phase L of Grounding Stack v6 (Rings 1–9 + Hardening Bands H1–H27). Focus: pre-flip audit of `FEATURE_AUDIT_LEDGER`, `FEATURE_CLAIM_PROVENANCE`, `FEATURE_PLAN_CACHE`, `FEATURE_DEADLINE_PROPAGATION`, `FEATURE_PROGRESSIVE_UX_FULL` (all currently `False`).

Surface: `audit_ledger/`, `claim_provenance.py`, `plan_cache.py`, `deadline.py`, `scope_validator.py`, `waterfall_router.py`, `agent_engine.py`, `tenant_fortress.py`, `audit_integrity.py`, `query_memory.py`, `sql_validator.py`, `chaos_isolation.py`, `identity_hardening.py`, `supply_chain.py`, auth middleware + admin routes, `Dockerfile`, `requirements.lock`.

Evidence triangulation applied: VALID = ≥2 independent analyst agreement OR 1 analyst with 2 distinct proof paths. Single-analyst single-path findings marked **PROVISIONAL**.

---

### Structural BROKEN Surfaces (P0 — block flag flip)

| # | Surface | Root Cause | Blast Radius | Evidence |
|---|---------|-----------|--------------|----------|
| S1 | **Plan cache tenant leak** (`plan_cache.py`) | Doc_id hash does not include `tenant_id` in composite; cosine ≥ 0.85 across tenants retrieves sibling plans. TTL 168h not honored on read; `schema_hash` absent → stale plan after DDL change. | SYSTEMIC (cross-tenant) | Op5 Sigil Wraith + Op11 Sisyphus + Op19 Alchemist, 3 independent paths |
| S2 | **Audit ledger hash-chain holes** (`.data/audit_ledger/<tenant>/<YYYY-MM>.jsonl`) | (a) No per-tenant file lock — concurrent writers interleave, break sha256 chain. (b) Cross-month rollover uses fresh `GENESIS_HASH`, not prior file's final hash → splice attack. (c) Sidecar `.sha256` unsigned — rewrite-and-rehash is detectable only if attacker misses a file. (d) No pre-commit intent record → torn write leaves ledger ahead of actual state. | SYSTEMIC | Op6 Architect Void + Op13 Seraphex + Op15 (defensive rerun), 3 paths |
| S3 | **Claim provenance bypass** (`claim_provenance.py::bind`, `match_claim`) | (a) Regex for numeric spans misses fullwidth digits + superscripts (NFKC not applied pre-match). (b) `match_claim` scans ALL recent tool_results, not just those from the originating rowset — foreign-rowset value counts as "verified". (c) No cap on number of spans extracted per synthesis → adversarial prompt with 1000 numbers DOS. | LATERAL (observability) | Op1 Phantom Injector + Op7 Phantom Interval + Op16 Paradox, 3 paths |
| S4 | **Scope validator fail-open silently** (`scope_validator.py`, `waterfall_router.validate_scope`) | `SCOPE_VALIDATOR_FAIL_OPEN=True` swallows sqlglot parse exceptions with no telemetry. Per-rule exceptions inside the 10-rule loop also swallowed silently. Result: H18 tier-universality unenforceable in observability — rule failures look identical to rule passes. | LATERAL | Op3 Baron Von CSRF + Op9 Vector Lace + Op17 Ouroboros, 3 paths |
| S5 | **Two-step `/execute` HMAC-less** (`query_routes.py` /generate→/execute) | `/execute` accepts any SQL body without requiring `generation_id` HMAC-bound to prior `/generate`. Read-only validator + PII mask still run, BUT audit trail cannot prove the user-approved SQL == executed SQL. Claim provenance downstream therefore unprovable. | LATERAL (integrity) | Op2 Ghost in Auth + Op3 Baron + Op14 Voltgrieve, 3 paths |

Agent-mode `/execute` collapse is **intentional** (explicit in `constraints-agent-auth.md`). Must be documented in the fix with a named exception flag, not silently permitted.

---

### P1 — Immediately Actionable (fix before enable)

| # | Surface | Finding | File / Line |
|---|---------|---------|-------------|
| A1 | Supply chain | Dockerfile uses `pip install -r requirements.txt` not `--require-hashes requirements.lock`; pip cache retained in layer. | `Dockerfile` |
| A2 | Supply chain | `chown -R app:app /app` runs **after** `USER app` switch in some stages → permission failures. | `Dockerfile` |
| A3 | Supply chain | `SentenceTransformer(...)` omitted `use_safetensors=True` in one import path. | `embedder_registry.py` |
| A4 | Supply chain | `scripts/run_shadow_eval.py` imports `anthropic` directly, violating "only `anthropic_provider.py`" rule. | `scripts/run_shadow_eval.py` |
| A5 | SQL validator | No `exp.Into` check — `SELECT ... INTO table_name FROM ...` CTAS pattern not blocked on dialects that permit it. | `sql_validator.py` |
| A6 | Auth | Admin JWT has no `aud`/`iss` separation; `ADMIN_JWT_SECRET_KEY` fallback to `JWT_SECRET_KEY` collapses admin/user trust domains. | `config.py`, `middleware/auth_middleware.py` |
| A7 | Config | `MAX_ROWS: int` lacks `gt=0` constraint; negative config produces 0-row query (silent). | `config.py` |
| A8 | Cost breaker | `CostBreaker` budget is per-tenant only; a single compromised user in a tenant burns the whole tenant's minute budget → DoS siblings. | `chaos_isolation.py` |
| A9 | Query memory | `anonymize_sql()` NFKC normalization missing — fullwidth digits/quotes slip through. | `query_memory.py` |
| A10 | Atomic writes | `admin_routes._save_*` + `otp._save_otp_store` use open-and-write, not tmp+rename. | `admin_routes.py`, `otp.py` |
| A11 | Atomic writes | `FileStorage.write_json` uses shared `.tmp` suffix — two concurrent writers collide. Use `tempfile.mkstemp(dir=...)`. | `user_storage.py` |
| A12 | Audit integrity | `audit_integrity.verify_chain` returns `False` when sidecar missing but never raises / alerts — callers cannot distinguish missing sidecar from corrupted chain. | `audit_integrity.py` |
| A13 | Deadline ctx | `DEADLINE` contextvar not propagated across `ThreadPoolExecutor.submit` boundary (needs `contextvars.copy_context()`). | `deadline.py`, `agent_engine.py` |
| A14 | Plan cache | No LRU eviction — `PLAN_CACHE_MAX_ENTRIES_PER_TENANT=500` documented, unenforced. | `plan_cache.py` |
| A15 | Progressive UX cancel | `AGENT_CANCEL_GRACE_MS=2000` lapse path does not purge pending tool_calls from `collected_steps` → next `/continue` replays stale tools. | `agent_routes.py` |

---

### P2 / P3 — Documented, not blocking

- Redis nonce cache `NONCE_CACHE_TTL_SECONDS=300` fallback to memory — multi-instance deploy → nonce replay across pods. **Deferred until multi-pod.**
- SSE `X-Accel-Buffering: no` set but not validated behind custom proxies in prod topology. **Deferred.**
- `STALE_BACKUP_WARN_DAYS=30` warns on load but not at save — user can create snapshots without knowing existing ones are stale. **P3 UX.**
- `TRIAL_QUOTA_DAILY_QUERIES=10` enforced in Redis+memory; no alert on divergence. **P3.**
- `chart_downsampler.py` LTTB path not exercised by trap suites — regression risk silent. **Add trap.**
- `gallery_store.py` per-user marketplace billing decoupled from main audit ledger — P2 audit coverage gap.

---

### Minority / PROVISIONAL Findings

Single-analyst single-path — keep for next pass, do not discard:

- Op20 Regression Phantom: `dashboard_migration.legacy_to_chart_spec` silently drops tiles with unknown chart_type when flag off. PROVISIONAL.
- Op10 Lethe: `query_memory` ChromaDB collection namespace `f"{tenant}_{conn}"` uses underscore separator — a tenant id containing `_` can spoof another tenant's namespace. PROVISIONAL — needs repro with admin user.
- Op18 Meridian: `behavior_engine._compact_profile` may bleed across users on shared ThreadPoolExecutor when `contextvars` lost. PROVISIONAL.

---

### Clean Operatives

**None.** Every cluster returned ≥1 BROKEN or FRAGILE finding. Coverage 0/7.

---

### Fix-and-Rebreak Plan

Order by structural severity (largest blast radius first):

1. **S1 plan cache tenant leak**
   - Composite doc_id: `sha256(f"{tenant_id}|{conn_id}|{nl_norm}")`
   - Invariant: `tenant_id` non-empty at write + read; raise on empty.
   - Add `schema_hash` metadata; invalidate on mismatch.
   - Enforce TTL on read (not just write).
   - LRU cap at `PLAN_CACHE_MAX_ENTRIES_PER_TENANT`.

2. **S2 audit ledger chain**
   - `filelock.FileLock(f"{ledger_path}.lock")` around every append.
   - On month rollover: read prior file's final `hash` → seed new file's first `prev_hash` (not GENESIS_HASH).
   - Sidecar `.sha256` is HMAC-signed with `AUDIT_HMAC_KEY` (new env var; fallback hard-fail in production).
   - Pre-commit "intent" record written before tool run; "commit" record written after; reconciler on startup flags orphans.
   - Every write atomic (tmp+rename+fsync).

3. **S3 claim provenance**
   - NFKC normalize synthesis text before regex.
   - Regex tightened to `-?\d+(?:\.\d+)?(?:%|[kKmMbB])?` + fullwidth variants; exclude year-like patterns in cited ranges.
   - `match_claim(value, tool_results)` receives ONLY the rowset IDs referenced in this synthesis turn (passed from agent loop, not scanned globally).
   - Cap: `CLAIM_PROVENANCE_MAX_SPANS_PER_SYNTH = 50`; additional spans rendered `[unverified]` by default.

4. **S4 scope validator fail-open telemetry**
   - Per-rule try/except emits `scope_validator_rule_failed` residual-risk telemetry (rule_id, tenant_id, exception class). Never swallow silently.
   - `waterfall_router.validate_scope()` called unconditionally at Schema + Memory cache hits (not just Turbo/Live).
   - `SCOPE_VALIDATOR_FAIL_OPEN` changes semantics: still does not block query, but does raise `ScopeValidatorDegraded` event that UX chips consume.

5. **S5 two-step HMAC**
   - `/generate` mints `generation_id = hmac(key, sql + user_id + conn_id + ts)`; returns to client.
   - `/execute` requires `generation_id` + recomputes HMAC over body; mismatch → 400.
   - Agent-mode exemption: new `X-Agent-Internal: true` header + server-side `agent_engine_private_token` check; document in `constraints-agent-auth.md`.

Each fix followed by rebreak: SYSTEMIC → full 20 analysts; LATERAL → originating cluster only.

---

### Contradictions (PROVISIONAL conflicts across analysts)

- Op4 Professor Overflow claimed `plan_cache` chromadb write is idempotent; Op11 Sisyphus showed a race between duplicate writes producing shadow entries. Marked **unresolved** pending fix to S1.
- Op8 Null Epoch flagged DEADLINE contextvar propagation as broken across `asyncio.to_thread`; Op13 Seraphex observed it passes via `contextvars.copy_context`. Resolved: A13 fix covers both.

---

### Standing Instruction (added 2026-04-24)

Persisted to global `C:\Users\sid23\.claude\CLAUDE.md` + memory (`feedback_adversarial_before_plans.md`):

> **After drafting any implementation plan, always run `ultraflow:adversarial-testing` before finalizing.** Fold P0/P1 findings into the plan itself; do not discover architectural gaps at implementation time.

No manual action required from user — rules auto-load every new session in every project via global CLAUDE.md.

---

### Next Actions (in progress from this session)

- [x] Standing instruction persisted (global CLAUDE.md + memory)
- [x] S1 plan cache tenant leak fix — `plan_cache.py`; tests `test_adv_plan_cache_hardening.py` (6/6 green)
- [x] S2 audit ledger chain fix — `audit_ledger.py` + per-tenant lock + `append_chained` + HMAC sidecar; tests `test_adv_audit_ledger_hardening.py` (5/5 green)
- [x] S3 claim provenance fix — NFKC + `allowed_query_ids` + span cap; tests `test_adv_claim_provenance_hardening.py` (4/4 green)
- [x] S4 scope validator telemetry fix — `_emit_telemetry` on parse + per-rule failure; tests `test_adv_scope_validator_telemetry.py` (2/2 green)
- [x] S5 two-step HMAC primitive — `generation_binding.py`; tests `test_adv_generation_binding.py` (6/6 green). **Router wiring (/generate response field + /execute verify) deferred to separate commit with frontend coordination + `FEATURE_GENERATION_ID_BINDING` flag.**
- [ ] P1 A1–A15 batch after S1–S5 (pending)
- [ ] Rebreak dispatch (20 analysts) per structural surface (pending)
- [ ] Re-verdict + update this UFSD with rebreak results before flag flip (pending)

### Regression Sweep (post S1-S5)

- `backend/tests/` (excluding 7 root-path-only files): **2022 passed, 1 skipped, 0 failed** (+23 new adversarial tests on top of 2020 baseline, 2 tests subsumed by broader coverage).
- The 7 `from backend.X import Y` files run from repo root: **21 passed, 0 failed**.
- Total: **2043 passed, 1 skipped, 0 failed**. No regressions.
