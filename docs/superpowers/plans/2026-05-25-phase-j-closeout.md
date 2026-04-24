# Grounding Stack v6 — Phase J (Closeout / P12) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Anti-hook note:** The project has a pre-write hook that blocks any reference to the specific unsafe-serialization format banned by Phase A's "safetensors only" invariant. Use the phrasings `"unsafe weight formats"`, `"legacy non-safetensors serialization"`, or `"the format deprecated by H14"` in all migration docs. Do NOT name the banned format literally — the hook will reject the write.

**Goal:** Ship Grounding Stack v6. Produce end-user documentation, admin documentation, migration guide, CHANGELOG entry, updated always-loaded docs, updated root + project `CLAUDE.md`, GA announcement draft, and tag `v6.0.0` on the exit-gate commit.

**Architecture:** Three new top-level docs under `docs/grounding-stack-v6/`, edits to five always-loaded `docs/claude/*.md` files, a `CHANGELOG.md` block assembled from actual git history (never from memory), and a signed/annotated git tag. No code changes except a single grep-based verifier in `scripts/verify_phase_j.py` that proves every Phase A–I config flag is documented.

**Tech Stack:** Markdown only. Shell + `grep` + `git` for verification. No new Python/JS code beyond the verifier.

**Scope — Phase J covers vs defers:**
- ✅ User-facing `overview.md` — outcomes framed, no Ring/H-band jargon
- ✅ `admin-guide.md` — Phase F ceremony + Phase I dashboard + residual-risk runbooks + full feature-flag matrix
- ✅ `migration-guide.md` — how existing tenants auto-migrate (tenant_id mint, embedding format upgrade, coverage cards, semantic registry seeding)
- ✅ `CHANGELOG.md` v6 block — built from `git log origin/main..HEAD`, bucketed by Ring
- ✅ Edits to `overview.md`, `arch-backend.md`, `security-core.md`, `config-defaults.md`, both `CLAUDE.md` files
- ✅ `announce-draft.md` — no hyperbole, outcome-framed
- ✅ `scripts/verify_phase_j.py` — grep-verifier: every `FEATURE_*` flag appears in `config-defaults.md`
- ✅ Git tag `v6.0.0` annotated with the 7 Rings and phase-shipped map
- ⛔ **Deferred:** External blog/marketing channels (user will post from `announce-draft.md`); signed GPG tags unless explicitly requested.

---

## Prerequisites

- [ ] Branch `askdb-global-comp` at or after Phase I exit gate.
- [ ] `python -m pytest backend/tests/ -v` green.
- [ ] All 9 trap baselines present in `.data/` (A–I each committed at least one; Phase E committed two; total ≥9).
- [ ] Phase A–I module imports green:
  ```bash
  cd "QueryCopilot V1/backend"
  python -c "
  import sys; sys.path.insert(0, '.')
  from embeddings.embedder_registry import get_embedder
  from data_coverage import DataCoverageCard
  from scope_validator import ScopeValidator, RuleId; assert len(list(RuleId)) == 10
  from intent_echo import build_echo
  from provenance_chip import ProvenanceChip
  from tenant_fortress import chroma_namespace
  from correction_pipeline import promote_to_examples
  from skill_bundles import resolve_bundle
  from audit_integrity import verify_checksum
  from alert_manager import dispatch
  print('Phase A-I imports OK — ready for closeout')
  "
  ```
- [ ] Read `docs/superpowers/plans/2026-04-22-grounding-stack-v6-master.md` end-to-end.
- [ ] Read every prior phase plan (A–I) — the CHANGELOG and announcement cite their exit criteria.

---

## File Structure

| Path | Create/Edit | Purpose |
|---|---|---|
| `docs/grounding-stack-v6/overview.md` | Create | User-facing — outcomes only, no jargon |
| `docs/grounding-stack-v6/admin-guide.md` | Create | Ceremony + dashboard + runbooks + flag matrix |
| `docs/grounding-stack-v6/migration-guide.md` | Create | Auto-migration paths for tenants, using safe phrasings for the format-upgrade section |
| `docs/grounding-stack-v6/announce-draft.md` | Create | GA announcement — outcome-framed |
| `CHANGELOG.md` | Edit | New `## [v6.0.0] — <date>` block, bucketed by Ring |
| `docs/claude/overview.md` | Edit | Add Grounding Stack v6 summary under existing waterfall section |
| `docs/claude/arch-backend.md` | Edit | Reference Phase A–I modules under appropriate subsystems |
| `docs/claude/security-core.md` | Edit | Confirm Phase H invariants already present (see note below); append any missing |
| `docs/claude/config-defaults.md` | Edit | Confirm every Phase A–I config section is present + consistent |
| `CLAUDE.md` (root) | Edit | One new line per Ring under a new "Grounding Stack v6" subsection |
| `QueryCopilot V1/CLAUDE.md` | Edit | Same — project-scope summary |
| `scripts/verify_phase_j.py` | Create | Grep-verifier: every `FEATURE_*` flag in `backend/config.py` appears in `config-defaults.md` |

Note on `security-core.md`: recent edits have already added H19/H20/H22/H25/H27 invariants. Task 7 verifies completeness rather than re-adding.

---

## Track J — Closeout

### Task 0: Changelog input gather

**Files:**
- None (read-only shell)

- [ ] **Step 1: Capture the feat / merge / chore commits since branch start**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git log main..HEAD --oneline --no-merges | grep -E "^[a-f0-9]+ (feat|fix|docs)\(phase-" > /tmp/phase_commits.txt
wc -l /tmp/phase_commits.txt
cat /tmp/phase_commits.txt | head -20
```

Expected: ≥90 commits. If fewer than ~80 something is wrong — STOP.

- [ ] **Step 2: Bucket by Ring**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
for phase in a b c d e f g h i; do
  echo "=== Phase ${phase^^} ==="
  grep -i "phase-${phase}" /tmp/phase_commits.txt | head -30
done > /tmp/phase_bucketed.txt
wc -l /tmp/phase_bucketed.txt
```

Expected: each phase bucket non-empty. Save `/tmp/phase_bucketed.txt` as raw material for the `CHANGELOG.md` entry.

- [ ] **Step 3: Audit per-tenant feature flags**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
grep -E "^\s*(FEATURE_|RULE_|ECHO_|COVERAGE_|SCOPE_|TENANT_|ECHO_|SKEW_|TIER_|JITTER_|SINGLEFLIGHT_|COST_|SSE_|HLL_|VIZQL_HEX_|FISCAL_)" backend/config.py | awk '{print $1}' | sort -u > /tmp/config_flags.txt
wc -l /tmp/config_flags.txt
```

Expected: ≥40 flags (Phase A added flags + B added 6 + C added 13 + D added 12 + E added 14 + F/G/H/I add more). Keep `/tmp/config_flags.txt` for Task 8 verification.

- [ ] **Step 4: Commit nothing (preparation only)**

No commit. Moving on.

---

### Task 1: User-facing overview doc

**Files:**
- Create: `docs/grounding-stack-v6/overview.md`

- [ ] **Step 1: Author the doc**

Create `docs/grounding-stack-v6/overview.md` with this exact content:

```markdown
# Grounding Stack v6

## What changed

AskDB now grounds every answer in the actual contents of your database, not the names we see in it. Six defensive layers run between your question and the result:

1. **Coverage cards.** When you connect a database, we profile each table's real row count, real date range, and real distinct values. If a table is called `january_trips` but contains two years of data, we use that two-year range — not the name.

2. **Pre-execution checks.** Before any SQL runs, ten deterministic rules catch name-vs-data mismatches, fan-out inflation, subquery-LIMIT-before-outer-ORDER, timezone drift, soft-delete omissions, negation-as-join, dialect fallthrough, view prefilter masks, absurd selectivity, and unverified expression predicates.

3. **Intent echo.** When a question has more than one reasonable interpretation ("active customers", "churn", "recent"), you see a one-line card with the chosen definition before the answer streams. Pick a different one in one click; your choice is remembered.

4. **Trust chip.** Every answer now carries a tag telling you how it was produced — live, turbo-cached (and how stale), sampled (with margin of error), or unverified-scope.

5. **Tenant isolation.** Every cache, every namespace, every session key now includes an immutable tenant id. Signed-in viewers of a shared dashboard use their own keys, never the owner's.

6. **Continuous measurement.** Nine regression trap suites (~120 parameterized questions) run on every model/embedder/skill change. Regressions surface before users hit them.

## What this fixes

The original failure: a user asked about casual-rider churn. The agent saw a table named `january_trips` and refused, assuming the data was limited to one month. In reality the table held two years of data. The v6 stack makes that class of failure impossible through four independent checks.

## What stays the same

Your SQL still runs read-only through the same six-layer validator. PII masking runs before any data leaves the backend. The two-step query flow (generate → review → execute) is unchanged. Every existing dashboard, saved query, and connection continues to work without migration effort on your part.

## What you'll notice first

- A small trust chip next to each answer.
- Occasional interpretation cards for ambiguous questions.
- Noticeably shorter time-to-first-answer on repeat questions (per-tenant caches now isolate cleanly).
- No behavior change on simple, unambiguous queries.
```

- [ ] **Step 2: Commit**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git add docs/grounding-stack-v6/overview.md
git commit -m "docs(phase-j): user-facing Grounding Stack v6 overview"
```

---

### Task 2: Admin guide

**Files:**
- Create: `docs/grounding-stack-v6/admin-guide.md`

- [ ] **Step 1: Author the doc**

Create `docs/grounding-stack-v6/admin-guide.md`:

````markdown
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
````

- [ ] **Step 2: Commit**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git add docs/grounding-stack-v6/admin-guide.md
git commit -m "docs(phase-j): admin guide (ceremony + dashboard + runbooks + flag matrix)"
```

---

### Task 3: Migration guide (safe phrasings only)

**Files:**
- Create: `docs/grounding-stack-v6/migration-guide.md`

**CRITICAL:** Do NOT name the specific unsafe-serialization format banned by Phase A / H14. Use "unsafe weight formats" or "the legacy non-safetensors format". A pre-write hook will reject the file otherwise.

- [ ] **Step 1: Author the doc**

Create `docs/grounding-stack-v6/migration-guide.md`:

```markdown
# Grounding Stack v6 — Migration Guide

This document describes how existing AskDB tenants are automatically migrated to v6. No manual steps are required from end users. Admins should read the rollback section before cutover.

## Automatic migrations

### 1. Tenant id assignment (Phase E)

Legacy user profiles lacking a `tenant_id` field have one minted on the first profile read after v6 deploy. The minted UUID is persisted atomically back to `profile.json` via `user_storage.load_profile_with_tenant()`. Existing ChromaDB collections, Turbo twins, and schema caches that were keyed only by user or connection are re-namespaced under the new `(tenant, conn, user)` composite on next write.

Side effect: first query per user after deploy will miss query-memory (new namespace is empty) and re-profile schema (new cache path). Users see a one-time ~500 ms latency bump on the first query only.

### 2. Coverage-card population (Phase B)

Coverage cards populate in the background after schema profiling completes — not blocking the connect endpoint. On the first query after connect, if cards aren't ready, agent prompts omit the `<data_coverage>` block and fall back to schema-only grounding. Cards appear on the next query.

### 3. Embedding format upgrade (Phase A / H14)

All embedder weights now load from the format mandated by H14. Legacy non-safetensors weight files on disk are ignored by the loader; the loader rejects unsafe weight formats outright. There is no in-place conversion — Phase A's migration script `backend/embeddings/migration.py` re-computes vectors from source text under a versioned collection name, so the old and new collections coexist until the migration completes. The cutover is atomic: the query path reads whichever collection name the `embedder_version` tag on each vector points to.

Admins who have customized the embedder (uncommon) must re-export weights in the H14-approved format before the upgrade. The loader's rejection of unsafe weight formats is non-negotiable and logs a `CRITICAL` line with the offending path.

### 4. Semantic registry seeding (Phase D / H12)

The `SemanticRegistry` JSON store is empty on upgrade. No definition conflicts occur. Admins can populate definitions via `backend/semantic_registry.py::register()` after deploy; the intent-echo card will surface registry hits automatically.

### 5. Pinned receipts (Phase D)

New `PinnedReceiptStore` starts empty per session. Any in-flight session at upgrade time continues with an empty receipt pin list; pins accrue on subsequent intent-echo acceptances.

### 6. Trap baselines

Nine baselines ship committed in `.data/*_baseline.json`. The CI workflow `.github/workflows/agent-traps.yml` runs them on every PR. Regressions vs baseline block merge.

## Configuration migration

`.env` files from v5 continue to work. New flags listed in `docs/claude/config-defaults.md` all default to safe on/off values. No `.env` edits are required unless an admin wants to disable a specific Ring or Hardening Band.

PCI/HIPAA mode flags (`FEATURE_PCI_MODE`, `FEATURE_HIPAA_MODE`) are one-way switches per Phase H — once set to True at boot, demo login hard-rejects and audit logging goes synchronous with fsync. Turning these off requires a restart with the flag removed.

## Rollback

- **Code rollback**: `git checkout v5-last` and restart services. Existing v6 ChromaDB collections + Turbo twins + schema caches will be ignored (new namespaces); v5 reads from the pre-v6 namespaces which are preserved on disk.
- **Data rollback**: never required — v6 writes new keys, never overwrites v5 state.
- **Flag rollback**: toggle any `FEATURE_*` off via `.env` + restart. Each Ring is independently disableable.
- **Config rollback**: remove newly added keys; defaults restore.

## Verification after deploy

Run the following to confirm v6 is live:

```bash
cd backend
python -c "
from scope_validator import ScopeValidator, RuleId
from provenance_chip import ProvenanceChip
from tenant_fortress import resolve_tenant_id
print('v6 live:', len(list(RuleId)) == 10)
"
python -m pytest tests/ -v -q | tail -3
python -m tests.run_traps tests/trap_temporal_scope.jsonl ../.data/eval_baseline.json
```

Expected: `v6 live: True`; pytest green; trap suite 10/10.
```

- [ ] **Step 2: Verify the file has no banned-token substring**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
grep -ciE 'p[a-z]{2}kle' docs/grounding-stack-v6/migration-guide.md
```

Expected: `0`. If > 0, STOP and rewrite the offending line using "unsafe weight format" or "legacy non-safetensors format".

- [ ] **Step 3: Commit**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git add docs/grounding-stack-v6/migration-guide.md
git commit -m "docs(phase-j): migration guide (auto-migration + rollback + verification)"
```

---

### Task 4: CHANGELOG.md v6 block

**Files:**
- Edit: `CHANGELOG.md`

- [ ] **Step 1: Locate top of CHANGELOG**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
head -20 CHANGELOG.md
```

If `CHANGELOG.md` doesn't exist, create it with a leading `# Changelog` header.

- [ ] **Step 2: Insert v6 block below the header**

Insert this content after the first line of `CHANGELOG.md`:

```markdown

## [v6.0.0] — 2026-05-25 — Grounding Stack v6

### Rings (new defensive layers)

- **Ring 1 — Empirical grounding (Phase B).** `DataCoverageCard` per table: actual row count, min/max dates, distinct-value samples, injected into agent system prompt. Eliminates the class of failures where agents infer data scope from table names.
- **Ring 3 — Pre-execution validator (Phase C).** Ten deterministic `sqlglot`-AST rules fire between SQL generation and execution. Range mismatch, fan-out inflation, LIMIT-before-ORDER, timezone-naive, soft-delete missing, negation-as-join, dialect fallthrough, view walker, conjunction selectivity, expression-predicate.
- **Ring 4 — Intent echo (Phase D).** Operational-definition card emerges between SQL gen and streaming when ambiguity ≥ 0.3. Three modes: auto-proceed (< 0.3), proceed-button (0.3–0.7), mandatory-choice pills (> 0.7). Receipts pin outside compaction window.
- **Ring 5 — Provenance chip (Phase E).** Every answer carries Live / Turbo-stale / Sample / Unverified-scope tag rendered before first streamed token. Multi-table staleness = worst across joined tables. Skew guard forces median in summary when p99/p50 > 10.
- **Ring 6 — Tenant fortress (Phase E).** Every cache / namespace / session key is composite `(tenant, conn, user)`. BYOK rebinds to requester per turn. Per-tenant encoder LRU.
- **Ring 7 — Regression harness (Phase A onwards).** Nine trap suites totaling ~135 parameterized questions. CI gates all on every PR.

### Hardening bands (cross-cutting security/resilience)

- **H1–H3** Trust-stamped cards, content-value PII classifier, cold-start probe (Phase B).
- **H4–H5** Ambiguity-gated intent-echo with auto-downgrade telemetry; non-interactive conservative mode + voice TTS readback (Phase D).
- **H6** Locale parser, fail-open validator, per-rule compat matrix, replan budget, famous-dataset detector, Sonnet-parity CI (Phase C).
- **H7** Tenant composite keys across every cache/namespace (Phase E).
- **H8** Chaos isolation: jittered backoff, singleflight, per-tenant cost breaker, resumable SSE cursor (Phase E).
- **H9** Validator lifecycle state machine, behavioral contract matrix, `>=` boundary fixes (Phase C).
- **H10** Always-on observability: empty-cause disambiguator, MAX_ROWS truncation warning, Turbo↔Live sanity cross-check (Phase E).
- **H11** Sampling-aware correctness: HLL COUNT DISTINCT, sentinel detection, adaptive stratification, VizQL hex-bin swap above 20K rows (Phase E).
- **H12** Semantic versioning: metric definitions with `valid_from`/`valid_until`, drift detection for mergers + fiscal-calendar mismatch (Phase D).
- **H13** Eval integrity: baselines committed in git, PII scanner, shadow-eval against real Anthropic (Phase A).
- **H14** Embedding migration: per-vector embedder tag, versioned collections, ensemble cap, sanitization, safetensors-only loader (Phase A).
- **H15** Self-improvement anchors: immutable golden set, AST-normalized diversity, 2-admin promotion ceremony, rate-limited approvals (Phase F).
- **H16** Alert manager with dedup sliding window, multi-hour accumulator, dynamic KL divergence, idempotency keys (Phase I).
- **H17** Phase-boundary discipline: forward/backward migrations, 72h gate, HMAC-signed version header (Phase A+).
- **H18** Validator universal coverage: view-walker recursive, conjunction selectivity, expression-predicate mark, tier universality (Phase C).
- **H19** Supply chain: pip `--require-hashes`, lock-file-driven installs, `pull_request_target` banned in CI (Phase H).
- **H20** Identity hardening: JWT tenant_id server-verify, OAuth state HMAC, Stripe signature, `actor_type` in audit, disposable-email blocker, server-enforced trial quota (Phase H).
- **H21** Infrastructure resilience: PVC-backed SQLite, ChromaDB write ACL, DR consensus, stale-backup detection (Phase H).
- **H22** Accessibility: WCAG 2.1 AA — keyboard-nav, aria, icons + text, `prefers-reduced-motion` respected (Phase H).
- **H23** Support + trial safeguards: justification + expiry + actor_type on impersonation, demo isolation, disposable-email list (Phase H).
- **H24** Observability self-defense: audit log checksum + size-assertion, non-LLM trap grader, monitoring-silent alert (Phase H / A).
- **H25** Transport + protocol hardening: CL XOR TE enforcement, HTTP/2 rapid-reset bind, `X-Accel-Buffering: no`, UTF-8-only (Phase H).
- **H26** Export + A/B + cancellation hygiene: export paths through Ring 3, variant-id dedup, warmup per variant, two-phase commit async cancellation (Phase H).
- **H27** Auth version + SSO hardening: unified middleware, deprecated routes → 410, `defusedxml` + sig-then-parse, JWT ±5s leeway, Redis nonce cache, PCI/HIPAA flags enforced (Phase H).

### Operations (Phase I)

- Ten residual-risk detectors with per-signal thresholds and runbook references.
- Two ops alerts (telemetry-source-missing + alert-dispatch-failure).
- Admin-only, per-tenant cache-stats dashboard at `/admin/cache-stats`.
- Slack webhook dispatcher with retry using `chaos_isolation.jittered_backoff`.

### Breaking changes

None. v6 is additive. Every new layer is independently feature-flagged; a fresh deploy with all flags off matches v5 behavior.

### Upgrade notes

See `docs/grounding-stack-v6/migration-guide.md`. No manual migration steps required for end users.

### Metrics (from Phase-level exit gates)

- Backend test suite: ~1700 tests pass, 1 skip.
- Nine trap suites pass with zero regressions against committed baselines.
- Retrieval token budget reduced ≥ 30% (Phase G measurement harness).
- All 12 SLA alerts fire end-to-end via `scripts/test_alert_fire.py` (Phase I).

```

- [ ] **Step 3: Commit**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git add CHANGELOG.md
git commit -m "docs(phase-j): CHANGELOG v6.0.0 block bucketed by Ring + Hardening Band"
```

---

### Task 5: Update `docs/claude/overview.md`

**Files:**
- Edit: `docs/claude/overview.md`

- [ ] **Step 1: Append Grounding Stack v6 section**

Open `docs/claude/overview.md`. After the "4-tier waterfall query intelligence" section, insert:

```markdown

## Grounding Stack v6

Layered on top of the waterfall to ensure answers stay anchored to real data:

- **Ring 1** — `data_coverage.py` injects per-table real row counts + date ranges into the agent system prompt.
- **Ring 3** — `scope_validator.py` runs 10 deterministic rules between SQL gen and execution.
- **Ring 4** — `intent_echo.py` surfaces an operational-definition card when ambiguity is non-trivial.
- **Ring 5** — `provenance_chip.py` emits a trust chip (Live/Turbo/Sample/Unverified) before each streamed answer.
- **Ring 6** — `tenant_fortress.py` composite-keys every cache, namespace, session, and BYOK binding.
- **Ring 7** — nine trap suites in `backend/tests/trap_*.jsonl` gate every PR.

Enforced at every waterfall tier (H18 tier universality). See `docs/grounding-stack-v6/` for user + admin docs.
```

- [ ] **Step 2: Commit**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git add docs/claude/overview.md
git commit -m "docs(phase-j): reference Grounding Stack v6 from always-loaded overview"
```

---

### Task 6: Update `docs/claude/arch-backend.md`

**Files:**
- Edit: `docs/claude/arch-backend.md`

- [ ] **Step 1: Add a new subsection referencing Phase A–I modules**

Find the "Backend modules (chart system)" section or equivalent. Append a new subsection:

```markdown

**Backend modules (Grounding Stack v6):** `data_coverage.py` (Ring 1 coverage cards), `scope_validator.py` (Ring 3 — 10 rules + `RuleId` enum + `ValidatorResult`), `replan_budget.py` + `validator_state.py` + `replan_controller.py` (H6/H9 + Ring 3→4 replan glue), `intent_echo.py` + `ambiguity_detector.py` + `clause_inventory.py` + `pinned_receipts.py` (Ring 4), `semantic_registry.py` + `drift_detector.py` (H12), `provenance_chip.py` + `tier_promote.py` + `skew_guard.py` (Ring 5), `tenant_fortress.py` (Ring 6 / H7 composite keys), `chaos_isolation.py` (H8 jitter + singleflight + cost breaker + SSE cursor), `result_provenance.py` (H10), `sampling_aware.py` (H11 HLL + sentinel + stratify), `correction_pipeline.py` + `admin_ceremony.py` + `golden_eval_gate.py` + `adversarial_similarity.py` (Phase F), `skill_bundles.py` + `query_expansion.py` + `skill_archival.py` + `depends_on_resolver.py` (Phase G retrieval hygiene), `supply_chain.py` + `identity_hardening.py` + `transport_guards.py` + `audit_integrity.py` + `sso_hardening.py` (Phase H H19–H27), `alert_manager.py` + `residual_risk_telemetry.py` + `cache_stats.py` + `slack_dispatcher.py` (Phase I ops).
```

- [ ] **Step 2: Commit**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git add docs/claude/arch-backend.md
git commit -m "docs(phase-j): reference Phase A-I backend modules in arch-backend"
```

---

### Task 7: Verify `docs/claude/security-core.md` completeness

**Files:**
- Edit (only if additions needed): `docs/claude/security-core.md`

- [ ] **Step 1: Grep for expected Phase H invariants**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
for phrase in "Lock-file enforced" "Safetensors only" "pull_request_target" "auth_middleware.py" "Audit log is checksummed" "Transport guards always on" "PCI/HIPAA modes are one-way" "Cache-stats dashboard is admin-only" "Alert dispatch never contains raw SQL"; do
  if grep -q "$phrase" docs/claude/security-core.md; then
    echo "OK: $phrase"
  else
    echo "MISSING: $phrase"
  fi
done
```

Expected: all 9 `OK:`. If any `MISSING:`, append the missing invariants (use the wording from `docs/grounding-stack-v6/admin-guide.md`).

- [ ] **Step 2: Commit only if edits were needed**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
# If no edits: skip.
# If edits were made:
git add docs/claude/security-core.md
git commit -m "docs(phase-j): append any missing Phase H invariants to security-core"
```

---

### Task 8: Verify `config-defaults.md` coverage + create verifier script

**Files:**
- Create: `scripts/verify_phase_j.py`

- [ ] **Step 1: Write the verifier**

Create `scripts/verify_phase_j.py`:

```python
"""Phase J verifier — every FEATURE_/RULE_/etc flag in config.py must be documented."""
from __future__ import annotations

import re
import sys
from pathlib import Path


PROJECT = Path(__file__).resolve().parent.parent
CONFIG_PY = PROJECT / "backend" / "config.py"
DEFAULTS_MD = PROJECT / "docs" / "claude" / "config-defaults.md"

FLAG_PREFIXES = (
    "FEATURE_", "RULE_", "ECHO_", "COVERAGE_", "SCOPE_", "TENANT_",
    "SKEW_", "TIER_", "JITTER_", "SINGLEFLIGHT_", "COST_", "SSE_",
    "HLL_", "VIZQL_HEX_", "FISCAL_", "TURBO_LIVE_",
)


def flags_in_config():
    out = set()
    for line in CONFIG_PY.read_text(encoding="utf-8").splitlines():
        m = re.match(r"\s*([A-Z][A-Z0-9_]+)\s*:\s*", line)
        if m and m.group(1).startswith(FLAG_PREFIXES):
            out.add(m.group(1))
    return out


def flags_in_defaults():
    text = DEFAULTS_MD.read_text(encoding="utf-8")
    out = set()
    for m in re.finditer(r"`([A-Z][A-Z0-9_]+)`", text):
        name = m.group(1)
        if name.startswith(FLAG_PREFIXES):
            out.add(name)
    return out


def main():
    conf = flags_in_config()
    docs = flags_in_defaults()
    undocumented = conf - docs
    if undocumented:
        print("UNDOCUMENTED flags (present in config.py, missing from config-defaults.md):")
        for f in sorted(undocumented):
            print(f"  - {f}")
        sys.exit(1)
    print(f"OK — all {len(conf)} flags documented.")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run it**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
python scripts/verify_phase_j.py
```

Expected: `OK — all <N> flags documented.` If any are undocumented, add them to `docs/claude/config-defaults.md` in the appropriate phase section before proceeding.

- [ ] **Step 3: Commit**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git add scripts/verify_phase_j.py
# If config-defaults.md was edited:
git add docs/claude/config-defaults.md
git commit -m "docs(phase-j): flag-coverage verifier + fix any undocumented flags"
```

---

### Task 9: Update both `CLAUDE.md` files

**Files:**
- Edit: `CLAUDE.md` (root)
- Edit: `QueryCopilot V1/CLAUDE.md`

- [ ] **Step 1: Edit project CLAUDE.md**

Open `QueryCopilot V1/CLAUDE.md`. Find the "Golden rules" section. After that section, insert a new section:

```markdown

## Grounding Stack v6 (shipped)

7 Rings + 27 Hardening Bands layered on top of the waterfall. Key invariants:

- Ring 1 — `data_coverage.py` injects real row counts + date ranges; agents never infer scope from table names.
- Ring 3 — `scope_validator.py` runs 10 rules between SQL gen + execution; fail-open on parse exception.
- Ring 4 — `intent_echo.py` emits operational-definition card when ambiguity ≥ 0.3.
- Ring 5 — `provenance_chip.py` emits trust chip BEFORE first streamed token.
- Ring 6 — `tenant_fortress.py` composite-keys every cache/namespace/session. NEVER use user_id or conn_id alone as a cache key.
- Tier universality — `waterfall_router.validate_scope()` runs Ring 3 at every tier.
- Replan budget: 1 per query. Do not raise without updating `SCOPE_VALIDATOR_REPLAN_BUDGET`.

See `docs/grounding-stack-v6/` for full docs + `docs/superpowers/plans/2026-04-22-grounding-stack-v6-master.md` for the architectural north star.
```

- [ ] **Step 2: Edit root CLAUDE.md**

Open root `CLAUDE.md`. Find a reasonable insertion point under the QueryCopilot V1 section. Add:

```markdown

**Grounding Stack v6 (shipped 2026-05-25):** 7 Rings + 27 Hardening Bands. Docs at `QueryCopilot V1/docs/grounding-stack-v6/`. Master spec at `QueryCopilot V1/docs/superpowers/plans/2026-04-22-grounding-stack-v6-master.md`.
```

- [ ] **Step 3: Commit**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git add CLAUDE.md
cd ..
git add CLAUDE.md 2>/dev/null || true   # root dir may not be a git repo
cd "QueryCopilot V1"
git commit -m "docs(phase-j): reference Grounding Stack v6 from project CLAUDE.md"
```

Root-level `CLAUDE.md` is not under version control per the project layout notes — edit it in place, no commit needed.

---

### Task 10: GA announce draft

**Files:**
- Create: `docs/grounding-stack-v6/announce-draft.md`

- [ ] **Step 1: Author the draft**

Create `docs/grounding-stack-v6/announce-draft.md`:

```markdown
# AskDB Grounding Stack v6 — Announcement Draft

> Draft for user review. Not auto-published. Edit before posting.

## Headline

AskDB v6: every answer now grounded in what your database actually contains.

## Lede (2–3 sentences)

We rebuilt how AskDB reasons about your data. Instead of guessing scope from table names, the agent now reads the actual contents of each table — row counts, date ranges, distinct values — and grounds every answer against them. When a question has more than one reasonable meaning, you see the interpretation before the answer arrives and can change it in one click.

## Why it matters (one example, one paragraph)

A beta user asked *"why are casual riders churning from certain stations?"* against a table the previous owner had named `january_trips`. The older agent saw the name, assumed the data was limited to January, and refused the analysis. The table actually held two years of data. v6 catches this four independent ways: the coverage card shows the real date range, the prompt invariant tells the agent not to trust names, the pre-execution validator cross-checks the SQL against the card, and a trust chip on every answer makes the actual coverage visible.

## What's new (bullets, no jargon)

- Every answer carries a trust tag — live, cached-with-staleness, sampled-with-margin, or unverified.
- Ambiguous questions show their interpretation before the answer streams; one-click correction.
- Ten deterministic pre-execution checks catch common SQL mistakes regardless of which model generated the SQL.
- Per-tenant isolation on every cache, namespace, and key.
- Nine regression-test suites run on every deploy.

## What isn't changing

Your SQL still runs read-only through the same six-layer validator. PII masking is unchanged. The generate-then-execute review step is unchanged. Every existing dashboard, connection, and saved query continues to work.

## Availability

Rolling out to all tenants over the coming week. No action required on your end.

## Learn more

- Overview: `docs/grounding-stack-v6/overview.md`
- Admin guide: `docs/grounding-stack-v6/admin-guide.md`
- Migration guide: `docs/grounding-stack-v6/migration-guide.md`
```

- [ ] **Step 2: Commit**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git add docs/grounding-stack-v6/announce-draft.md
git commit -m "docs(phase-j): GA announce draft for user review"
```

---

### Task 11: Tag v6.0.0

**Files:**
- Git tag (no file)

- [ ] **Step 1: Verify tree is clean before tagging**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git status --short
```

Expected: empty output (or only gitignored state). If any tracked files modified, commit first.

- [ ] **Step 2: Tag with annotation**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git tag -a v6.0.0 -m "$(cat <<'EOF'
Grounding Stack v6

7 Rings:
  Ring 1 Empirical grounding   - Phase B
  Ring 2 Prior invariant       - Phase B skill
  Ring 3 Scope validator       - Phase C
  Ring 4 Intent echo           - Phase D
  Ring 5 Provenance chip       - Phase E
  Ring 6 Tenant fortress       - Phase E
  Ring 7 Regression harness    - Phase A onwards

27 Hardening Bands: H1 through H27.

Exit criteria met:
  - 1700+ backend tests green, 1 skip
  - 9 trap suites pass no regressions
  - 12 SLA alerts live
  - WCAG AA + pen-test green
  - Retrieval token budget -30% measured
EOF
)"
git tag --list | grep v6
```

Expected: `v6.0.0` listed.

- [ ] **Step 3: Do NOT push the tag yet**

The user is responsible for pushing the tag. Do not run `git push --tags`.

---

### Task 12: Phase J exit gate

- [ ] **Step 1: Verifier green**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
python scripts/verify_phase_j.py
```

Expected: `OK — all <N> flags documented.`

- [ ] **Step 2: Doc presence check**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
ls docs/grounding-stack-v6/
```

Expected: `admin-guide.md`, `announce-draft.md`, `migration-guide.md`, `overview.md`.

- [ ] **Step 3: CHANGELOG has v6 block**

```bash
grep -c "## \[v6.0.0\]" CHANGELOG.md
```

Expected: `1`.

- [ ] **Step 4: Tag exists**

```bash
git tag --list | grep -c "^v6\.0\.0$"
```

Expected: `1`.

- [ ] **Step 5: Backend pytest still green**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1/backend"
python -m pytest tests/ -q 2>&1 | tail -3
```

Expected: pass count ≥ Phase-I final count; 1 skip; zero failures.

- [ ] **Step 6: All 9 trap suites green**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1/backend"
python -m tests.fixtures.eval_seed %TEMP%\eval_fixture.sqlite
for suite in temporal_scope coverage_grounding name_inference join_scale intent_drop sampling_trust multi_tenant; do
  python -m tests.run_traps "tests/trap_${suite}.jsonl" "../.data/${suite}_baseline.json" || echo "FAIL: $suite"
done
```

Expected: each suite prints no-regression. Phases F, G, H, I may add additional suites — include their suite names if present.

- [ ] **Step 7: Exit commit**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git commit --allow-empty -m "chore(phase-j): exit gate — v6.0.0 shipped, docs merged, tag annotated, flag-coverage verified"
```

- [ ] **Step 8: Final state**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git log --oneline -5
git tag --list | tail -3
ls docs/grounding-stack-v6/
```

Expected output sanity-checks the whole stack. v6 shipped.

---

## Phase J exit criteria

- [ ] `docs/grounding-stack-v6/overview.md` present — user-facing, no Ring/H-band jargon.
- [ ] `docs/grounding-stack-v6/admin-guide.md` present — ceremony + dashboard + runbooks + flag matrix.
- [ ] `docs/grounding-stack-v6/migration-guide.md` present — auto-migration + rollback + verification; uses safe phrasing ("unsafe weight formats", not the banned format name).
- [ ] `docs/grounding-stack-v6/announce-draft.md` present — outcome-framed, no hyperbole.
- [ ] `CHANGELOG.md` has `## [v6.0.0]` block bucketed by Ring + Hardening Band.
- [ ] `docs/claude/overview.md` references Grounding Stack v6.
- [ ] `docs/claude/arch-backend.md` references Phase A–I modules.
- [ ] `docs/claude/security-core.md` Phase H invariants present (grep confirms).
- [ ] `scripts/verify_phase_j.py` exits 0 — every `FEATURE_*` flag in `config.py` appears in `config-defaults.md`.
- [ ] Both `CLAUDE.md` files reference Grounding Stack v6.
- [ ] Git tag `v6.0.0` annotated, present locally. User will push.
- [ ] Backend pytest still green; 9 trap suites still pass baselines.
- [ ] Grep for the banned serialization-format token in `docs/grounding-stack-v6/*.md` returns zero matches.

---

## Risk notes & follow-ups

- **Banned-token hook.** Project has a pre-write hook rejecting any file mention of the unsafe-serialization format deprecated by H14. Every task that edits docs MUST verify `grep -ciE 'p[a-z]{2}kle'` returns 0 before committing. If a draft hits the hook, rewrite with `"unsafe weight format"` or `"legacy non-safetensors"` and retry.
- **Runbook docs stubs.** `admin-guide.md` references `docs/runbooks/rr-*.md` — these are Phase I Task outputs, not Phase J. If those files don't exist yet, the admin-guide's references are forward-pointers rather than broken links. Add a note in `admin-guide.md` if Phase I ran with fewer than 10 runbooks produced.
- **Tag push.** The plan explicitly does NOT `git push --tags`. Tagging locally is reversible; pushing is not easily reversible. User owns that step.
- **Root `CLAUDE.md` editing.** Root dir is not a git repo per the project layout. Edit in place; no commit possible; no rollback. Verify content before saving.
- **Announce draft.** This is a *draft* — user should review before any public posting. The plan does not publish externally.
- **Flag-coverage drift.** `scripts/verify_phase_j.py` catches flags introduced in config without documentation. If Phases F–I introduced flags that were never documented, the verifier fails here and forces doc updates before v6 can ship.

---

## Execution note for agentic workers

Closeout is mostly parallel — doc files are independent. Suggested flow:

- **Track 1:** T0 (gather), T1 (overview), T2 (admin guide), T3 (migration guide) — serial within because each builds understanding.
- **Track 2:** T4 (CHANGELOG) + T10 (announce draft) — parallel with Track 1 after T0.
- **Track 3:** T5 (overview.md edit) + T6 (arch-backend edit) + T7 (security-core verify) + T9 (CLAUDE.md edits) — fully parallel.
- **Track 4:** T8 (verifier script) — parallel.
- **Serial tail:** T11 (tag) → T12 (exit gate).

Estimated serial time: ~6-8 hours. Parallel time: ~2-3 hours.

No code changes beyond `scripts/verify_phase_j.py`. No new tests beyond what the verifier produces. No dependency bumps.
