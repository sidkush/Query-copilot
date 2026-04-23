# Phase I Session Trigger — Operations Layer (P11)

> **Copy this entire file into the first message of a new Claude Code session.**

---

You are picking up the **Grounding Stack v6** build for AskDB. Your job this session: author the **Phase I** plan. Phase I is the operations layer — 12 residual-risk SLA alerts + Slack + Graphify + cache-stats dashboard.

## Pre-flight — verify state (FIRST, DO NOT skip)

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git log --oneline -20
ls docs/superpowers/plans/ | grep -E "phase-[a-h]"
```

Expected: plans A–H present. Recent commit `chore(phase-h): exit gate`.

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1/backend"
python -c "
import sys; sys.path.insert(0, '.')
# Phase H additions
from audit_integrity import verify_checksum
from identity_hardening import require_tenant_in_jwt
from transport_guards import block_cl_te_conflict
from sso_hardening import safe_saml_parse
print('Phase A-H imports OK')
"
```

If fail → STOP.

## Required reads (do NOT skip)

1. `docs/superpowers/plans/2026-04-22-grounding-stack-v6-master.md` — read the "Residual risk register" (10 rows) + every row's "Telemetry" + "Alert" + "Runbook" column. Phase I ships the code that MEASURES each telemetry signal and FIRES each alert. Also read P11 scope in Phase sequence table + any H16 (Alert Manager) content.
2. Previously-authored plans (A–H) — format reference.
3. `backend/alerts_routes.py` — current alert system surface. `grep -n "def " backend/routers/alert_routes.py | head -20`.
4. `backend/redis_client.py` — Phase I adds per-tenant alert-dedup state here.
5. Skills file for graphify: `C:/Users/sid23/.claude/skills/graphify/SKILL.md` (per user global CLAUDE.md). Phase I integrates graphify into the ops pipeline.
6. The cache-related modules: `backend/waterfall_router.py` (for VizQL cache stats from Phase E) + `backend/query_memory.py` (ChromaDB cache stats).

## Phase I scope (from master plan)

**Goal:** Operationalize the 10-row residual-risk register. Every row gets: a telemetry source, an alert rule, a runbook reference. Plus a cache-stats dashboard for ops visibility, Slack integration for alert delivery, and Graphify integration so architectural changes flow into the knowledge graph automatically.

**Files the master plan expects Phase I to touch:**
- NEW: `backend/alert_manager.py` — central alert dispatch with dedup window + severity + actor_type.
- NEW: `backend/residual_risk_telemetry.py` — one detector per residual-risk row (10 detectors).
- NEW: `backend/cache_stats.py` — aggregator: schema cache hits, VizQL in-process hit, ChromaDB hit, Turbo twin hit, prompt cache hit.
- NEW: `backend/slack_dispatcher.py` — Slack webhook sender with rate limit + retry (uses Phase E `chaos_isolation.jittered_backoff`).
- NEW: `frontend/src/pages/CacheStatsDashboard.jsx` — ops dashboard (invoke `impeccable` + `taste-skill`). Read-only per-tenant aggregates.
- NEW: `backend/routers/ops_routes.py` — `GET /api/v1/ops/cache-stats`, `GET /api/v1/ops/alerts` (admin-auth).
- NEW tests per module + per detector.
- NEW: `scripts/test_alert_fire.py` — manual harness; fires one of each alert type end-to-end to Slack dev channel.
- Graphify hook: after each Phase closeout commit, Graphify ingest runs (either CI-triggered or a Makefile target).

**Exit criteria (from master):** All 12 SLA alerts (10 residual-risk + 2 ops alerts) live in `alert_manager`. Test-alert fires end-to-end via `scripts/test_alert_fire.py`. Cache-stats dashboard renders with live data. Graphify ingest of master + all phase plans succeeds.

## The 10 residual-risk detectors Phase I must ship

From master plan's table — each row is one detector. Do NOT paraphrase; read the master plan's exact wording for each:

1. LLM pretraining false-negative (trap-suite metric)
2. Anthropic regional failover variance (cross-region hash divergence)
3. DBA-initiated DDL without webhook (schema-drift-vs-live-error rate)
4. Leap-day edge cases (Feb-29 trap pass rate)
5. Customer with >10K tables (top-10 retrieval precision)
6. Adversarial thumbs-up storm (outlier-similarity upvotes; already H15 in Phase F — here we ship the ALERT for it)
7. Client-side retry abuse (retries/session)
8. HNSW non-determinism on ties (already pinned in H9 — here we ship the DRIFT DETECTOR)
9. Model deprecation cadence for BYOK-pinned users (pinned-deprecated count)
10. Low-traffic tenant prompt-cache 5-min TTL miss (cache-miss rate per tenant)

Plus 2 ops alerts (telemetry-source-missing + alert-dispatch-failure) — master plan's Task I text lists these.

## Your task this session

1. Run pre-flight.
2. Read required files (especially the residual-risk register — read every row before drafting).
3. Invoke the `superpowers:writing-plans` skill.
4. Author the plan.
5. Save to: `docs/superpowers/plans/2026-05-23-phase-i-operations.md`.
6. Offer execution choice. Do not execute.

## Anti-drift rules

- Every residual-risk detector must have EXACT name + threshold + runbook reference from master plan's table. Don't round numbers.
- Slack integration must be optional (some tenants don't use Slack) — plan must support email fallback via existing `backend/email.py` (confirm with `ls backend/ | grep -i email`).
- Cache-stats dashboard is admin-only. Use Phase H `admin_routes.py` auth pattern, NOT user auth.
- Follow Ring 6 / Phase E tenant isolation in all dashboards: every cache stat is per-tenant, never aggregate across tenants.
- Graphify integration: reference the skill path from user's global CLAUDE.md. Do not re-implement graphify — just add a Makefile target or CI hook.
- Alerts use Phase E `chaos_isolation.jittered_backoff` for retry, not ad-hoc sleep loops.
- Follow TDD; bite-sized steps; no placeholders.
- Expected task count: ~16-20 (2-day phase; most detectors are small).
- Provide DAG / parallel-track recommendation — detectors are naturally parallel (10 independent units).

If any pre-flight check fails, STOP and report to user.
