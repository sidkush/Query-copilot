# Grounding Stack v6 — Master Architectural Plan

> **For agentic workers:** This is the MASTER architectural specification. Phase-level execution plans (Phases A–K) will be authored just-in-time as each phase approaches. Start execution with [`2026-04-22-phase-a-foundation.md`](2026-04-22-phase-a-foundation.md). Do NOT treat this master plan as an executable task list — it is the north star spec.

**Goal:** Eliminate the "AskDB agent trusts identifier names over empirical data" class of bugs (and its 45 related failure families) via a 7-Ring defense-in-depth architecture layered onto the existing 4-tier waterfall, hardened against ~370 adversarial attacks discovered across 6 rounds of red-team testing.

**Architecture:** 7 orthogonal Rings handle: (1) empirical grounding, (2) prior-belief invariant, (3) pre-exec validator, (4) intent echo, (5) provenance + tier calibration, (6) multi-tenant isolation, (7) regression harness. 27 cross-cutting Hardening Bands (H1–H27) close specific failure modes. Each Ring is code-layer where possible (survives LLM drift). 11 phases (A–K) ship in ~5–6 weeks.

**Tech Stack:** FastAPI + Claude Haiku 4.5 primary / Sonnet 4.6 fallback + ChromaDB + sentence-transformers/MiniLM-L6-v2 (post Phase A) + sqlglot + DuckDB + `dateutil.relativedelta` + react-vega + LaunchDarkly (flag matrix) + fcntl locking + Redis (rate limits + nonce cache).

**Origin bug:** User query *"Why are casual riders churning faster from certain stations vs others, and what behavioral patterns in their last 5 rides before churn differentiate them from members who kept riding?"* — agent saw BigQuery table named `january_trips`, assumed data scope was January only, refused churn analysis. Actual data: Dec 2023–Oct 2025. Adversarial analysis expanded to 370 related failure modes across temporal, naming, SQL semantics, multi-tenant, supply chain, CI/CD, compliance, transport, and observability surfaces.

---

## Scope — what this master covers vs defers

- ✅ **Covered:** Architectural spec for all 7 Rings + 27 Hardening Bands. Phase sequencing. Trap-suite schema. Residual risk register with telemetry + SLA. Security Backlog with quarterly adversarial review convention.
- ⛔ **Deferred to per-phase plans:** Task-level TDD steps, exact code, file line numbers. Phase A detail lives in `2026-04-22-phase-a-foundation.md`; B–J authored just-in-time.

---

## Prerequisites (read before any phase)

- You are in the `QueryCopilot V1/` working tree on branch `askdb-global-comp`.
- You have read `docs/claude/overview.md` (4-tier waterfall), `docs/claude/security-core.md` (invariants), `docs/claude/arch-backend.md` (agent engine).
- Schema Intelligence already caches per-column min/max (verified: `backend/schema_intelligence.py`).
- Skill library has 49 files under `askdb-skills/` — no deletions; one addition (`askdb-skills/core/empirical-grounding.md`) via Phase B.
- Prompt cache on schema block is active (~75% token savings on hits).

---

## The 7 Rings (code-layer defense, orthogonal)

Each Ring has a single responsibility, catches a distinct class of failures, and fails independently without cascading.

### Ring 1 — Empirical Grounding (DataCoverageCard)

**File:** `backend/schema_intelligence.py` (extend) + `backend/data_coverage_card.py` (new)

**Responsibility:** Inject a PII-safe `DataCoverageCard` per table into the cached schema block so the agent reads empirical truth instead of inferring from names.

**Card shape:**
```
table=trips (live @ 2026-04-22T08:15Z, cache_age=4m, ttl=15m, stat_source=exact)
  rows=47,329,110
  [date]    started_at  min=2023-12-01  max=2025-10-28  distinct_months=23  nulls=0.01%  has_sentinels=false
            updated_at  min=2023-12-01  max=2026-04-22  nulls=0%          [CDC metadata]
  [numeric] duration_sec  min=3  max=86,400  p50=820  p99=3,600  unit_hint=seconds
  [enum]    rider_type  distinct=2  sample={member, casual}  nulls=0.2%
            is_active   distinct=2  sample={0, 1}            [boolean, values inspected]
  [pii]     email, phone, ssn — cardinality + null-rate only (dtype allowlist)
```

**Two-tier:** thin card (~40 tokens/table, always in cached schema block) + full card (JIT via `get_table_profile` tool for the 2–4 tables a query touches). Thin includes min/max of primary date column + rowcount + trust stamp; full adds all columns.

**Trust stamp values:** `exact | sampled | partial | stale | missing | unprofiled`. Every downstream Ring reads the stamp and adjusts behavior.

**Catches:** original january_trips bug + 12 related (semantic-flip boolean, stale archive name, unit-in-name lie, CDC-as-business-time, overloaded identifier, compaction receipt loss).

### Ring 2 — Prior Invariant (≤80-token P1 skill)

**File:** `askdb-skills/core/empirical-grounding.md` (new, P1 always-on)

**Responsibility:** Inject one short invariant into every query's system prompt to counter pretraining priors.

**Content:**
1. Identifiers are labels, not filters. Never infer temporal, categorical, or unit scope from table/column names.
2. Cite the `DataCoverageCard` for scope claims. When card conflicts with a name, card wins.
3. If the question can be answered, answer it. Use `ask_user` only when two interpretations produce materially different answers — never to confirm defaults.

**Catches:** premature refusal, name-anchored reasoning, some canned-formula priors (Ring 3 is the actual safety net).

### Ring 3 — Pre-Exec Validator (`ScopeValidator`)

**File:** `backend/scope_validator.py` (new)

**Responsibility:** Server-side deterministic check between SQL generation and execution. Catches name-vs-data mismatches the LLM wrote despite Ring 2.

**Checks (sqlglot AST):**
| # | Rule | Fires on |
|---|---|---|
| 1 | Range mismatch | WHERE narrows outside card min/max without explicit user filter |
| 2 | Fan-out inflation | Multi-table JOIN + COUNT(*) without DISTINCT on primary key |
| 3 | LIMIT-before-ORDER | LIMIT in subquery + ORDER BY outer |
| 4 | Timezone-naive | DATE/DATE_TRUNC on TIMESTAMP_TZ without `AT TIME ZONE` |
| 5 | Soft-delete missing | Historical window + table has `deleted_at` + no tombstone predicate |
| 6 | Negation-as-JOIN | User query has "never/no/without" AND SQL is INNER JOIN |
| 7 | Dialect fallthrough | sqlglot transpile failure against connection.db_type |
| 8 | View walker | Recursively resolves `INFORMATION_SCHEMA.VIEW_DEFINITION` → base tables; applies card check at base |
| 9 | Conjunction selectivity | EXPLAIN-backed row estimate < 0.1% of card rowcount → warn |
| 10 | Expression-predicate | Non-literal WHERE (e.g. `hash(id)%1000`) → mark "unverified-scope" on provenance chip |

**Action on fire:** structured warning → one re-plan turn (capped via replan budget). Fail-open on sqlglot parse exception (warn + proceed, not block).

**Tier universality:** every waterfall tier (Schema/Memory/Turbo/Live) enforces the same Ring 3. Tier 0 emits card-equivalent schema-card; Tier 1 fingerprint-checks before replay; Tier 3 429-fallback re-enters via Ring 3 not Tier 1 direct.

**Catches:** 11 SQL-semantics failure classes + CTE-alias shadow + view prefilter mask + conjunction empty intersection + tier bypass.

### Ring 4 — Intent Echo + Clause Inventory

**Files:** `backend/intent_echo.py` (new), `backend/ambiguity_detector.py` (new), `frontend/src/components/agent/IntentEcho.jsx` (new)

**Responsibility:** After SQL generation, before streaming the answer, emit an operational-definition card. Kills silent clause drops, terminology rewrites, unstated baselines.

**Card UI:**
```
→ Interpreted as:
  • Churn = no ride within 30 days of last observed ride
  • Cohort = casual riders active 2024-Q1 through 2025-Q1
  • Behavioral signal = last 5 rides (duration + time-of-day + origin station)
  • Baseline = members in same window still riding
  [Proceed]   [Adjust]
```

**Ambiguity-gated firing:**
- Ambiguity score `<0.3` → auto-proceed, no card
- `0.3–0.7` → card + Proceed button
- `>0.7` → card with **mandatory-choice pills** (no generic Proceed; user must click one of 2-3 specific interpretations)

**Telemetry:** users pausing `<500ms` consistently get auto-downgraded to mandatory-choice variant. Kills rubber-stamp structurally.

**ClauseInventory:** LLM extracts clauses from user NL; validates each maps to a plan element; unmapped clause → include OR explicit "skipping because X" in echo body.

**Pinned receipts:** intent-echo acceptance receipts pinned OUTSIDE session-memory sliding-compaction window (Claude-Code scratchpad pattern); always present in subsequent turns.

**Non-interactive paths:** voice / scheduled / bulk / embedded-iframe → conservative mode (widest defensible scope + "interpretation unconfirmed" banner). Voice mode with ambiguity ≥0.5 triggers TTS readback: *"I'm reading this as {definition}. Say confirm or change."*

**Catches:** 10 intent-capture failures + confirmation paralysis + silent lock-in + dropped filter.

### Ring 5 — Provenance Chip + Tier Calibration

**Files:** `backend/summary_generator.py` (edit), `backend/waterfall_router.py` (edit), `frontend/src/components/agent/ProvenanceChip.jsx` (new)

**Responsibility:** Every result carries accurate trust metadata visible to the user.

**Chip shapes:**
- `Live · 4,832 rows`
- `Turbo · 3m stale · est. 4,830`
- `Sample 1% (stratified on {region}) · 4,500 ±200`
- `Unverified scope · expression predicate`

**Multi-table staleness:** chip shows WORST staleness across joined tables (not dominant-tier aggregate).

**Render timing:** chip renders BEFORE first token streams (no mid-stream mutation).

**Skew guard:** when numeric profile shows `p99/p50 > 10`, summary template automatically adds median alongside mean. No LLM judgement.

**Tier-promote gate:** question contains `exact | last hour | today | fraud rate | incident` → skip Turbo, force live execution regardless of waterfall preference.

**Catches:** 6 sampling/trust classes + 2 statistical-reasoning classes + tier-label mid-stream mutation.

### Ring 6 — Multi-Tenant Isolation

**Files:** `backend/behavior_engine.py` (edit), `backend/user_storage.py` (edit), `backend/tenant_fortress.py` (new)

**Responsibility:** Every cache/namespace/session key includes `tenant_id` (immutable UUID from signup time), not just `user_id` or `connection_id`.

**Rules:**
- ChromaDB namespace: `tenant:{t}/conn:{c}/user:{u}/coll:query_memory`
- BYOK key rebinds to REQUESTER per turn, not session-owner (shared-URL viewer uses viewer's key or fail-closed)
- Query-memory writes gated by demo-user detection + thumbs-up rate-limit (50/day/user) + adversarial-similarity detector
- Singleton `ENCODER` in `skill_library.py` → per-tenant dict
- Right-to-erasure hook propagates to ChromaDB + audit + Turbo twin
- Per-tenant domain lock: `detect_domain()` result persisted to `connection_profile.json`; no re-detection per query
- Schema-cache invalidation on reconnect + 15-min TTL + DDL-aware hook
- EU region customers pinned to EU Anthropic endpoint + SCC log entry

**Catches:** 4 multi-tenant bleed + GDPR cross-border + demo-session noise loop.

### Ring 7 — Regression Harness (trap suites + CI)

**Files:** `backend/tests/trap_*.jsonl` × 8 (new), `backend/tests/trap_generator.py` (new), `backend/tests/trap_grader.py` (new), `.github/workflows/agent-traps.yml` (new)

**Responsibility:** Continuous measurement. When models/embedders/skills change, surface regressions before users do.

**8 suites × ~15 questions each = 120+ parameterized traps:**
- `trap_temporal_scope` (original bug class)
- `trap_name_inference`
- `trap_join_scale`
- `trap_intent_drop`
- `trap_sampling_trust`
- `trap_multi_tenant`
- `trap_sonnet_parity` (forces `FORCE_MODEL=sonnet`)
- `trap_dialect_quirks`

**Grader:** per-question oracle using Schema Intelligence min/max + behavioral invariants; NO LLM-judge (kills grader-self-buggy class).

**CI gate:** ≥80% per suite, zero regressions from prior version. Pre-commit hook enforced server-side (no `--no-verify` bypass).

**Trap generation:** parameterized templates mutated per run (kills Goodhart overfit to static 60 traps).

**Baseline:** `.data/eval_baseline.json` committed IN git (not gitignore); signed per-PR; PII scanner at commit-time blocks real-data capture.

### Ring 8 — Agent Orchestration (CASL)

**File:** `backend/analytical_planner.py` (new) + `backend/semantic_registry_bootstrap.py` (new) + `backend/step_budget.py` (new) + `backend/hallucination_abort.py` (new) + `backend/model_ladder.py` (new)

**Responsibility:** Collapse multi-step improvisation into deterministic CASL-compiled plans. Wire Phase C/D dead code (ScopeValidator warnings → LLM, ReplanController into tool loop). Enforce hard step/wall-clock/cost budgets with asyncio deadline propagation. Block LLM-confabulated error strings via known-error whitelist. Route model by role (Haiku step-exec, Sonnet 4.6 plan emission, Opus 4.7 recovery).

**Architecture:** NL compiles against populated `SemanticRegistry` → canonical metric refs → ≤3-CTE `AnalyticalPlan` → executes via existing Rings 1-7. Registry miss → fallback to pre-K free-form SQL path. Plan rendered as SSE `plan_artifact` before first SQL.

**Catches:** 81-step improvisation cascade, hallucinated "connectivity" excuses, validator-warning dead-end, step/budget runaways, model-capability mismatches.

---

## The 27 Hardening Bands

Each Band closes a specific failure family discovered across adversarial rounds. Bands are cross-cutting — they touch multiple Rings.

**Round 2 bands (v2, 60 attacks → 54 addressed):**
- **H1** Trust-stamped cards (thin+full two-tier)
- **H2** Content-value PII classifier (dtype + name-substring + value-sample + k-anonymity)
- **H3** Cold-start probe (auto MIN/MAX/COUNT when card missing/unprofiled)
- **H4** Ambiguity-gated IntentEcho (mandatory-choice on >0.7, telemetry auto-downgrade)
- **H5** Non-interactive conservative mode (voice readback + scheduled banner)
- **H6** Locale parser + data-separation marker + fail-open validator + flag compat matrix + replan cap + famous-dataset detector + Sonnet-parity CI

**Round 3 bands (v3, +85 attacks → +79 addressed):**
- **H7** Tenant-Fortress `(tenant, conn, user)` keys
- **H8** Chaos Isolation (jitter, resumable SSE, cost breaker, singleflight)
- **H9** Behavioral Contract Matrix (state machines + precedence + `>=` boundaries + ChromaDB seed pin + stable sort)
- **H10** Observability Always-On (`result_provenance` with empty-cause disambiguator + MAX_ROWS truncation warning + Turbo/Live sanity cross-check)
- **H11** Sampling-Aware Correctness (adaptive stratification + HLL + sentinel detection + VizQL hex-bin swap >20K)
- **H12** Semantic Versioning & Drift Detection (registry `valid_from/until` + merger detection + denormalization drift + fiscal config + unit metadata)

**Round 4 bands (v4, +60 attacks → +54 addressed):**
- **H13** Eval Integrity (baseline.json in git, PII scanner, shadow-eval, forked-PR lockdown)
- **H14** Embedding Migration Safety (per-vector embedder tag, versioned collections, ensemble cap, sanitization, safetensors format only — legacy unsafe serialization banned)
- **H15** Self-Improvement Anchors (immutable golden set, AST-normalized diversity, 2-admin ceremony, rate-limited approvals)
- **H16** Alert Manager (dedup sliding + multi-hour accumulator + dynamic KL + PII structural markers + idempotency)
- **H17** Phase-Boundary Discipline (forward/backward migrations, 72h gate, ceremony PR, runtime flag revalidation, HMAC-signed version header)

**Round 5 bands (v5, +45 attacks → +44 addressed):**
- **H18** Validator Universal Coverage (view walker recursive, conjunction selectivity, expression-predicate mark, tier universality)
- Plus **R1–R5 full mitigations** for all prior "accepted residual" risks

**Round 6 bands (v5.1, +60 attacks, +54 addressed):**
- **H19** Supply Chain + Pipeline (pip `--require-hashes`, HF safetensors, `pull_request_target` banned, cache key ref-isolation)
- **H20** Identity Hardening (JWT tenant_id server-verify, OAuth state HMAC, Stripe signature, actor_type in audit, disposable-email blocker, server-enforced trial quota)
- **H21** Infrastructure Resilience (PVC-backed SQLite, ChromaDB write ACL, DR consensus, stale-backup detect)
- **H22** Accessibility (WCAG 2.1 AA: keyboard-nav, aria, icons + text, configurable speed)
- **H23** Support + Trial Safeguards (support justification + expiry + actor_type, demo isolation, disposable-email)

**Round 7 bands (v6, +60 attacks → +55 addressed):**
- **H24** Observability Self-Defense (audit checksum + size-assertion, trap grader non-LLM oracle, monitoring-silent alert)
- **H25** Transport + Protocol Hardening (CL XOR TE, HTTP/2 rapid-reset bind, proxy `X-Accel-Buffering: no`, UTF-8-only)
- **H26** Export + A/B + Cancellation Hygiene (export Ring 3 validation, variant-id dedup, warmup per variant, two-phase commit async cancellation)
- **H27** Auth Version + SSO Hardening (unified auth middleware, deprecated → 410, `defusedxml` + sig-then-parse, JWT ±5s leeway, Redis nonce cache, PCI/HIPAA enforcement)

---

## Phase sequence (A–K, ~5–6 weeks)

Each phase ships with commit-sized task plan authored JIT. Exit criteria = next phase's preconditions. Each phase = one phase-plan file.

| Phase | Weeks | Scope | Exit criteria |
|---|---|---|---|
| **A** — Foundation | 1 | P5 Golden Eval Real Generator + P7 Embedding Upgrade (H14 migration) | Trap-grader functional against fixture SQLite; embedding migration complete; baseline.json committed |
| **B** — Ring 1+2+H1-H3 Grounding | 2–3 days | DataCoverageCard emitter + PII classifier + cold-start probe + P1 invariant + famous-dataset detector | Card renders in cached schema block; trap_temporal_scope ≥80% |
| **C** — Ring 3+H6,H9,H18 Enforcement | 3–4 days | ScopeValidator (view walker recursive, conjunction selectivity, expression-predicate mark, tier universality) + flag compat matrix + state machines | All 10 validator rules green in trap_name_inference + trap_join_scale |
| **D** — Ring 4+H4,H5,H12 Interaction | 3–4 days | IntentEcho mandatory-choice + metrics_registry with versioning + non-interactive conservative + voice TTS readback + H15 anchors | trap_intent_drop ≥80%; voice mode measured |
| **E** — Ring 5,6+H7,H8,H10,H11 Calibration+Tenant | 2–3 days | Provenance chip + skew guard + tier-promote + tenant-fortress + chaos isolation | Multi-tenant trap suite ≥80% |
| **F** — Correction Pipeline (P6+P10 gated) | 3–4 days | Wire `promote_to_examples` + admin panel + golden-eval promotion gate + H15 admin ceremony | Admin approval flow green; self-improvement loop gated |
| **G** — Retrieval Hygiene (P9) | 2–3 days | Skill bundles + query expansion + archival + depends_on cycle detection | Token budget reduction 30%+ measured; no cap overflow |
| **H** — Hardening Bands H19-H27 + Observability | 2–3 days | Supply chain + identity + infra + a11y + transport + auth version + SSO hardening | WCAG audit green; pen-test on new surface green |
| **I** — Operations Layer (P11) | 2 days | Alert Manager + Slack integration + Graphify + cache-stats dashboard | 12 residual-risk SLA alerts live; test-alert fires end-to-end |
| **J** — Closeout (P12) | 1 day | User doc + admin doc + changelog tag + GA announce | Docs merged; stack v6 shipped |
| **K** — Ring 8 CASL Agent Orchestration | 1 week | Ring 8 (planner + feedback loop + budgets + hallucination-abort + model ladder) + 4 trap suites + 50-Q bench + 4 feature flags + progressive UX | 4 Ring-8 trap baselines pass; p50<60s benchmark; all previously-passing pytest still green |

---

## Residual risk register

10 risks remain accepted-with-telemetry after all bands applied. Each has SLA alert + runbook.

| # | Risk | Telemetry | Alert | Runbook |
|---|---|---|---|---|
| 1 | LLM pretraining on un-patterned dataset names | Detector false-negative rate in trap suite | >2% | Add pattern, redeploy |
| 2 | Anthropic regional failover variance | Cross-region result hash divergence | any | Pin region per tenant |
| 3 | DBA-initiated DDL without webhook | Schema-drift-vs-live-error rate | >1% | Require webhook or tighten TTL |
| 4 | Leap-day edge cases | Feb-29 trap pass rate | <100% | Fuzz, patch |
| 5 | Customer with >10K tables | Top-10 retrieval precision | <70% | Bespoke enterprise-tier strategy |
| 6 | Adversarial thumbs-up storm | Outlier-similarity upvotes | >3 in 1h from same user | Rate-limit + flag |
| 7 | Client-side retry abuse | Client retries/session | >5 in 5min | Server-side dedup |
| 8 | HNSW non-determinism on equal-distance ties | ChromaDB consistency test | any divergence | Already pinned seed + stable-sort (H9) |
| 9 | Model deprecation cadence for BYOK-pinned users | Pinned-deprecated model count | >0 | Customer-specific prompt |
| 10 | Low-traffic tenant prompt-cache 5-min TTL miss | Cache-miss rate per tenant | >30% | Cache-warmer cron |

---

## Security Backlog (quarterly adversarial review)

Agreed-but-deferred work beyond v6 ship scope. Reviewed every quarter via council+adversarial rounds on current surface.

1. **Post-quantum crypto readiness** — Fernet → Fernet-v2 with Kyber-hybrid KEM when NIST finalizes (expected 2027).
2. **EU AI Act compliance** — AI-system registration + transparency obligations when enforcement starts (projected 2026-08).
3. **Chaos Engineering permanent program** — rolling pod kill, network partition injection, Redis-down drill — monthly.
4. **Bug bounty program** — external red-team; disclosure window 90 days; payout policy.
5. **Annual SOC 2 Type II audit** — controls list aligned to CC series (access control, change mgmt, monitoring).
6. **HIPAA BAA template** — when first healthcare customer signs enterprise tier.
7. **Dependency supply-chain monitoring** — GitHub Dependabot + Snyk + quarterly manual review of transitives.
8. **Insider-threat controls** — production-access audit review monthly; role separation engineer ≠ deployer.
9. **Per-language PII masking expansion** — start with top-10 customer languages; others "conservative banner" (H23 baseline).
10. **Permanent adversarial-council schedule** — every 90 days, 30 destructors, current stack; findings → backlog or immediate ship.

---

## Why this stays foolproof under drift

- **Rings 1, 3, 5, 6** are **code**, not prompts — survive any LLM model change.
- **Ring 4** makes every answer user-correctable in one click — LLM errors become repairable, not fatal.
- **Ring 7** catches regressions before users (every model/embedder/skill change runs 120 traps).
- **Rings are orthogonal** — any single failure doesn't cascade.
- **Bands H1–H27** address specific adversarial findings; each is independently toggleable via feature flag with dependency-matrix validation.

## What we explicitly rejected (and why)

- **New P3 RAG skills per failure class** — retrieval cannot reliably match a business question to "don't trust table names." Trap suites are the honest answer.
- **Required "scope-first" tool contract on every query** — +500ms latency, no upside over Ring 1 card injection.
- **Prose-heavy always-on rules** — attention is zero-sum; crowds existing P1 content. One 80-token invariant is the budget.
- **Deleting "legacy:true" skills wholesale** — user-facing features (dashboard formatting, visualization) protected. Archival via H15 replaces deletion.
- **Sharing examples across connections** — every promotion scoped to `(tenant, connection)` or rejected.

---

## Per-phase plan files (authored JIT)

- **`2026-04-22-phase-a-foundation.md`** — Phase A (P5 Golden Eval + P7 Embedding Upgrade). **Authored alongside this master.**
- `2026-04-29-phase-b-grounding.md` — Phase B (Rings 1+2+H1–H3). Authored week of Apr 29 after Phase A ships.
- `2026-05-02-phase-c-validator.md` — Phase C (Ring 3+H6,H9,H18).
- `2026-05-06-phase-d-interaction.md` — Phase D (Ring 4+H4,H5,H12).
- `2026-05-10-phase-e-calibration.md` — Phase E (Rings 5,6+H7,H8,H10,H11).
- `2026-05-13-phase-f-correction.md` — Phase F (P6 + P10 gated).
- `2026-05-17-phase-g-retrieval.md` — Phase G (P9 bundles + archival).
- `2026-05-20-phase-h-hardening.md` — Phase H (H19–H27).
- `2026-05-23-phase-i-ops.md` — Phase I (P11).
- `2026-05-25-phase-j-closeout.md` — Phase J (P12).

---

## Adversarial testing acknowledgment

This plan addresses **~370 attacks across 6 red-team rounds** (20/30/30/30/30/30 destructors). Cumulative coverage ~97%. Remaining ~3% is the 10-entry residual risk register + Security Backlog. Further rounds will continue to surface findings; convention is **quarterly adversarial review** per Security Backlog item #10. Shipping v6 does not close the loop — it establishes the architectural baseline against which ongoing hardening measures deviation.
