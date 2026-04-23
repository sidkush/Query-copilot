# Phase F Session Trigger — Correction Pipeline (P6 + P10 + H15)

> **Copy this entire file into the first message of a new Claude Code session.**

---

You are picking up an in-progress architectural build called **Grounding Stack v6** for the AskDB (QueryCopilot V1) project. Your job in this session is to author the **Phase F** implementation plan — nothing else. Do NOT implement Phase F itself in this session; only author the plan document.

## Pre-flight — verify state (do this FIRST, do NOT skip)

Run each command. If any output does not match the expected shape, STOP and ask the user — do not guess.

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git log --oneline -20
git branch --show-current
ls docs/superpowers/plans/
```

Expected state:
- Active branch: `askdb-global-comp`
- Phase A, B, C, D, E plan files present in `docs/superpowers/plans/`:
  - `2026-04-22-grounding-stack-v6-master.md`
  - `2026-04-22-phase-a-foundation.md`
  - `2026-04-29-phase-b-data-coverage.md`
  - `2026-05-02-phase-c-scope-validator.md`
  - `2026-05-06-phase-d-intent-echo.md`
  - `2026-05-10-phase-e-provenance-tenant.md`
- Recent commits include `chore(phase-e): exit gate` (Phase E shipped).

Then verify Phase A–E code artifacts are importable:

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1/backend"
python -c "
import sys; sys.path.insert(0, '.')
# Phase A — embedding
from embeddings.embedder_registry import get_embedder
# Phase B — data coverage
from data_coverage import DataCoverageCard
# Phase C — scope validator
from scope_validator import ScopeValidator, RuleId; assert len(list(RuleId)) == 10
from replan_budget import ReplanBudget
# Phase D — intent echo
from intent_echo import build_echo, EchoMode, InteractionMode
from clause_inventory import Clause
from pinned_receipts import PinnedReceiptStore
from semantic_registry import SemanticRegistry
# Phase E — provenance + tenant
from provenance_chip import ProvenanceChip, TrustStamp
from tenant_fortress import chroma_namespace, session_key, resolve_tenant_id
from chaos_isolation import Singleflight, CostBreaker, SSECursor
from result_provenance import empty_cause, turbo_live_divergence
from sampling_aware import approximate_distinct_count, detect_sentinel_values
print('Phase A-E imports OK')
"
```

Expected output: `Phase A-E imports OK`. If it fails, STOP.

Verify all seven trap baselines exist:

```bash
ls "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1/.data/" | grep -E "baseline.json"
```

Expected: `eval_baseline.json`, `coverage_baseline.json`, `name_inference_baseline.json`, `join_scale_baseline.json`, `intent_drop_baseline.json`, `sampling_trust_baseline.json`, `multi_tenant_baseline.json`.

## Required reads (do NOT skip — read before drafting)

1. `docs/superpowers/plans/2026-04-22-grounding-stack-v6-master.md` — north star spec. Read the "Phase sequence" table + any section mentioning P6, P10, H15, or "correction pipeline" / "self-improvement".
2. `docs/superpowers/plans/2026-05-10-phase-e-provenance-tenant.md` — match this file's TDD format, task-granularity, and header style.
3. `docs/superpowers/plans/2026-04-29-phase-b-data-coverage.md` — shorter example of the format.
4. `docs/claude/config-defaults.md` — add Phase F config section following existing conventions.
5. `backend/query_memory.py` and `backend/chromadb_seed.py` (if present) — Phase F wires `promote_to_examples` here. `grep -rn "promote\|thumbs_up\|upvote\|golden" backend/` to map the surface.
6. `backend/routers/admin_routes.py` — Phase F adds admin-approval endpoints here.

## Phase F scope (from master plan)

**Goal:** Wire the self-improvement loop — agents can promote successful queries to few-shot examples, gated by: (a) admin approval ceremony (H15 — 2-admin ceremony + rate limit), (b) golden-eval promotion gate (deltas measured against committed trap baselines), (c) adversarial-similarity detector to block thumbs-up storms (residual-risk #6).

**Files the master plan expects Phase F to touch:**
- NEW: `backend/correction_pipeline.py` — `promote_to_examples()` entrypoint, gated by admin + golden-eval delta.
- NEW: `backend/adversarial_similarity.py` — detect thumbs-up storms from same user (residual #6).
- NEW: `backend/golden_eval_gate.py` — before promoting, run the 7 trap suites; block if any regresses.
- NEW: `backend/admin_ceremony.py` — 2-admin approval state machine.
- EDIT: `backend/query_memory.py` — add promotion API + per-tenant quota.
- EDIT: `backend/routers/admin_routes.py` — add `/api/v1/admin/promotions/pending`, `/approve`, `/reject` endpoints.
- NEW: `frontend/src/pages/AdminPromotions.jsx` — admin UI (invoke `impeccable` + `taste-skill` per user memory).
- NEW: `backend/tests/test_correction_pipeline.py`, `test_adversarial_similarity.py`, `test_golden_eval_gate.py`, `test_admin_ceremony.py`.
- Right-to-erasure cascade into ChromaDB + audit + Turbo twin (deferred from Phase E risk notes — ship in F).
- Extend `trap_grader.py` with new oracle: `must_block_thumbs_up_storm`.

**Exit criteria (from master):** Admin approval flow green; self-improvement loop gated. Any promotion that causes any trap-suite regression is rejected automatically.

## Your task this session

1. Run pre-flight.
2. Read required files.
3. Invoke the `superpowers:writing-plans` skill (announce: "I'm using the writing-plans skill to create the Phase F implementation plan.").
4. Author a complete TDD-grade plan following the Phase E structure.
5. Save to: `docs/superpowers/plans/2026-05-13-phase-f-correction-pipeline.md`.
6. After saving, offer execution choice (Subagent-Driven vs Inline). Do not execute.

## Anti-drift rules (non-negotiable)

- Do NOT hallucinate module contents. When the plan needs to modify an existing file, say "grep for <exact symbol> in <exact path>" rather than pasting imagined code.
- Do NOT invent new Ring numbers, H-band numbers, or config flag names. Only those in the master plan are authoritative.
- If the master plan's scope for Phase F is ambiguous about a specific file or API, ASK the user rather than inventing a shape.
- Do NOT re-implement Phase A-E modules. Read their source to learn their exposed surface; if a needed surface isn't there, raise it with the user.
- The plan MUST follow TDD: each task has failing-test → implement → passing-test → commit steps.
- Tasks must be bite-sized (2-5 minutes each step). No placeholders. No "fill in later."
- Include a DAG / parallel-track recommendation at the end like Phase E did.
- Keep the task count proportional to master's estimate (3-4 days → ~18-22 tasks).

If any pre-flight check fails, STOP and report to user. Do not draft the plan until state is verified.
