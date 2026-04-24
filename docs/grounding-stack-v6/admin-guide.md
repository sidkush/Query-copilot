# Grounding Stack v6 — Admin Guide

## Sections

1. [Example-promotion ceremony (Phase F)](#example-promotion-ceremony)
2. [Cache-stats dashboard (Phase I)](#cache-stats-dashboard)
3. [Residual-risk runbooks (Phase I)](#residual-risk-runbooks)
4. [Feature-flag matrix](#feature-flag-matrix)

---

## Example-promotion ceremony

When an end-user gives a thumbs-up on a query answer, that query is a *candidate* for promotion into the few-shot example library. v6 gates promotion behind a two-admin ceremony:

- Step 1: First admin opens `/admin/promotions/pending`, reviews the candidate's original NL + SQL + tenant, clicks **Approve** or **Reject**.
- Step 2: A different admin (not the first) confirms.
- Step 3: On second approval, `golden_eval_gate.run_gate()` runs the 9 committed trap suites against the candidate. If any suite regresses, promotion is blocked automatically — no admin override.
- Step 4: The adversarial-similarity detector checks for thumbs-up storms (> 3 upvotes in 1 hour from the same user on similar queries). Storms are quarantined for review.

See `backend/correction_pipeline.py` + `backend/admin_ceremony.py`.

---

## Cache-stats dashboard

Route: `/api/v1/ops/cache-stats` (admin auth required). UI at `/admin/cache-stats`.

Shows per-tenant (never cross-tenant):

- Schema cache hit rate
- VizQL in-process cache hit rate
- ChromaDB query-memory hit rate
- Turbo twin hit rate
- Prompt cache hit rate (Anthropic)
- Top 5 slowest queries in the last hour
- Active alert count by severity

Scope is always the admin's `tenant_id`. An explicit `?tenant_id=<uuid>` query parameter is honored only for super-admins; regular admins receive 403 when they try to cross-scope.

---

## Residual-risk runbooks

Ten risks remain accepted-with-telemetry. Each has an alert-level SLA + a runbook. These are the operational playbook.

| # | Risk | Telemetry signal | Alert threshold | Runbook |
|---|-----|------------------|-----------------|---------|
| 1 | LLM pretraining false-negative on unseen dataset names | `trap_temporal_scope` pass rate | <98% | Add pattern, redeploy. See `docs/runbooks/rr-1-pretraining.md` |
| 2 | Anthropic regional failover variance | Cross-region result-hash divergence | any | Pin region per tenant. `docs/runbooks/rr-2-region.md` |
| 3 | DBA-initiated DDL without webhook | Schema-drift-vs-live-error rate | >1% | Require webhook or tighten TTL. `docs/runbooks/rr-3-ddl.md` |
| 4 | Leap-day edge cases | Feb-29 trap pass rate | <100% | Fuzz, patch. `docs/runbooks/rr-4-leap.md` |
| 5 | Customer with >10K tables | Top-10 retrieval precision | <70% | Bespoke enterprise-tier strategy. `docs/runbooks/rr-5-large-schema.md` |
| 6 | Adversarial thumbs-up storm | Outlier-similarity upvotes | >3/hour same user | Rate-limit + flag. `docs/runbooks/rr-6-storm.md` |
| 7 | Client-side retry abuse | Retries per session | >5 in 5 min | Server-side dedup. `docs/runbooks/rr-7-retry.md` |
| 8 | HNSW non-determinism on equal-distance ties | ChromaDB consistency test | any divergence | Already pinned seed + stable sort; investigate if fires. `docs/runbooks/rr-8-hnsw.md` |
| 9 | Model deprecation for BYOK-pinned users | Pinned-deprecated model count | >0 | Customer-specific prompt. `docs/runbooks/rr-9-deprecation.md` |
| 10 | Low-traffic tenant prompt-cache TTL miss | Cache-miss rate per tenant | >30% | Cache-warmer cron. `docs/runbooks/rr-10-coldcache.md` |

Plus two ops-layer alerts (telemetry-source-missing + alert-dispatch-failure); see `backend/alert_manager.py`.

---

## Feature-flag matrix

Every flag is toggleable at runtime via `.env`. Defaults are listed in `docs/claude/config-defaults.md`.

| Flag | Default | Disables |
|---|---|---|
| `FEATURE_DATA_COVERAGE` | True | Ring 1 — coverage cards + empirical grounding |
| `FEATURE_SCOPE_VALIDATOR` | True | Ring 3 — all 10 deterministic rules |
| `RULE_RANGE_MISMATCH` … `RULE_EXPRESSION_PREDICATE` | True (9) / False (1 selectivity) | Per-rule gates |
| `SCOPE_VALIDATOR_FAIL_OPEN` | True | Fail-closed on parse exception |
| `SCOPE_VALIDATOR_REPLAN_BUDGET` | 1 | Max re-plans per query |
| `FEATURE_INTENT_ECHO` | True | Ring 4 — card emission |
| `ECHO_AMBIGUITY_AUTO_PROCEED_MAX` | 0.3 | Below-threshold silence |
| `ECHO_AMBIGUITY_MANDATORY_CHOICE_MIN` | 0.7 | Above-threshold mandatory-choice |
| `FEATURE_SEMANTIC_REGISTRY` | True | H12 versioned definitions |
| `FEATURE_DRIFT_DETECTOR` | True | H12 merger/denorm/fiscal detection |
| `FEATURE_PROVENANCE_CHIP` | True | Ring 5 — chip emission |
| `FEATURE_TENANT_FORTRESS` | True | Ring 6 — composite keys |
| `FEATURE_CHAOS_ISOLATION` | True | H8 — jitter/singleflight/cost-breaker/cursor |
| `FEATURE_RESULT_PROVENANCE` | True | H10 — empty-cause + truncation + Turbo/Live |
| `FEATURE_SAMPLING_AWARE` | True | H11 — HLL + sentinel + stratify |
| `FEATURE_CORRECTION_PIPELINE` | True | Phase F — promotion loop |
| `FEATURE_SKILL_BUNDLES` | True | Phase G — retrieval bundling |
| `FEATURE_QUERY_EXPANSION` | True | Phase G — NL expansion |
| `FEATURE_PCI_MODE` / `FEATURE_HIPAA_MODE` | False | Phase H — compliance modes (one-way switches) |
| `FEATURE_AUDIT_CHECKSUM` | True | Phase H — audit-log integrity |
| `FEATURE_TRANSPORT_GUARDS` | True | Phase H — CL-XOR-TE + HTTP/2 rapid-reset caps |
