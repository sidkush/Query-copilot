# Phase H Session Trigger — Hardening Bands H19–H27 + Observability

> **Copy this entire file into the first message of a new Claude Code session.**

---

You are picking up the **Grounding Stack v6** build for AskDB. Your job this session: author the **Phase H** plan. Phase H is the largest security / hardening phase; nine hardening bands (H19 through H27) ship together.

## Pre-flight — verify state (FIRST, DO NOT skip)

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git log --oneline -20
ls docs/superpowers/plans/ | grep -E "phase-[a-g]"
```

Expected: plans A–G present. Recent commit `chore(phase-g): exit gate`.

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1/backend"
python -c "
import sys; sys.path.insert(0, '.')
# Phase F + G additions
from correction_pipeline import promote_to_examples
from skill_bundles import resolve_bundle
from query_expansion import expand
from depends_on_resolver import topo_sort
print('Phase A-G imports OK')
"
```

If fail → STOP.

## Required reads (do NOT skip)

1. `docs/superpowers/plans/2026-04-22-grounding-stack-v6-master.md` — read the full "Round 6 bands (v5.1)" + "Round 7 bands (v6)" sections. H19–H27 are enumerated there with precise scope.
2. Previously-authored phase plans (A–G) — format reference, especially Phase E.
3. Existing security surface:
   - `backend/sql_validator.py` — 6-layer validator (do not weaken)
   - `backend/pii_masking.py` — PII classifier
   - `backend/auth.py` — JWT + OAuth
   - `backend/otp.py` — OTP flow
   - `docs/claude/security-core.md` — invariants (NEVER weaken)
4. `requirements.txt` — for H19 pip hash-pinning you need the current pin shape. `head -20 backend/requirements.txt`.
5. `.github/workflows/` — H19 bans `pull_request_target`; inspect every workflow for violations. `grep -l "pull_request_target" .github/workflows/ || echo "none"`.
6. `frontend/src/**` — H22 accessibility audit target; spot-check `IntentEcho.jsx` and `ProvenanceChip.jsx` (Phase D/E) for aria / keyboard support baseline.

## Phase H scope (from master plan — 9 hardening bands)

From the Round 6 + Round 7 sections of the master plan:

- **H19 — Supply Chain + Pipeline**: pip `--require-hashes` (freeze hashes), HF safetensors format only, `pull_request_target` banned in CI, cache key ref-isolation.
- **H20 — Identity Hardening**: JWT `tenant_id` server-verify, OAuth state HMAC, Stripe signature verification, `actor_type` in audit log, disposable-email blocker, server-enforced trial quota.
- **H21 — Infrastructure Resilience**: PVC-backed SQLite (for agent session store), ChromaDB write ACL, DR consensus (two-writer conflict detector), stale-backup detection.
- **H22 — Accessibility (WCAG 2.1 AA)**: keyboard-nav audit + fix; aria-labels on all interactive surfaces; icons + text (never icon-only); configurable motion speed (respects `prefers-reduced-motion`).
- **H23 — Support + Trial Safeguards**: support-agent impersonation with justification + expiry + audit actor_type, demo-user isolation from real tenants, disposable-email list check.
- **H24 — Observability Self-Defense**: audit log checksum + size-assertion (detect tampering), trap grader non-LLM oracle (already Phase A), monitoring-silent alert (fires when telemetry stops arriving).
- **H25 — Transport + Protocol Hardening**: Content-Length XOR Transfer-Encoding (smuggling block), HTTP/2 rapid-reset bind, proxy `X-Accel-Buffering: no`, UTF-8-only enforcement on inputs.
- **H26 — Export + A/B + Cancellation Hygiene**: CSV/Parquet export paths go through Ring 3 ScopeValidator, A/B variant-id dedup (block double-bucketing), warmup per variant (cold-start bias), two-phase commit on async cancellation.
- **H27 — Auth Version + SSO Hardening**: unified auth middleware (single code path, no per-route drift), deprecated auth → 410, `defusedxml` + signature-before-parse for SAML, JWT ±5s leeway only, Redis nonce cache for replay protection, PCI/HIPAA environment flags enforced.

**Exit criteria (from master):** WCAG AA audit green on all agent-facing surfaces; pen-test pass on H19/H20/H25/H27 surfaces; `pull_request_target` reduced to zero; pip install uses `--require-hashes`.

## Files Phase H will touch (from master)

- NEW: `backend/supply_chain.py` (H19 audit helpers), `backend/identity_hardening.py` (H20), `backend/transport_guards.py` (H25), `backend/audit_integrity.py` (H24), `backend/sso_hardening.py` (H27).
- EDIT: `requirements.txt` (pip --require-hashes freeze), every `.github/workflows/*.yml` (H19 ban check), `backend/auth.py` (unified middleware), `backend/routers/*.py` (apply middleware), `backend/user_storage.py` (disposable-email + actor_type), `frontend/src/**` (H22 a11y pass).
- NEW tests: per-band test files.
- CI: H19 adds `pip-audit` + `pnpm audit` step (or equivalent).

## Your task this session

1. Run pre-flight.
2. Read required files + do the `pull_request_target` grep audit.
3. Invoke the `superpowers:writing-plans` skill.
4. Author the plan.
5. Save to: `docs/superpowers/plans/2026-05-20-phase-h-hardening.md`.
6. Offer execution choice. Do not execute.

## Anti-drift rules

- H19-H27 map EXACTLY to master plan text. Don't re-letter or merge. Each H gets its own task cluster.
- Do NOT relax any Phase A-G security invariant to simplify Phase H (e.g. never remove `tenant_fortress` composite keys, never loosen `ScopeValidator` rules).
- `defusedxml` is a pip pin; do NOT suggest replacing it with a homegrown parser.
- When specifying `--require-hashes`, don't write fake hashes. The plan must say "generate via `pip-compile --generate-hashes`" and commit the resulting file.
- Accessibility (H22): audit by running tests against current `IntentEcho.jsx` + `ProvenanceChip.jsx` — don't invent new components.
- Follow TDD; bite-sized steps; no placeholders.
- Expected task count: ~22-28 (9 bands × 2-3 tasks + integration + exit gate).
- Provide DAG / parallel-track recommendation; nine bands naturally parallelize into ~5 tracks.

If any pre-flight check fails, STOP and report to user.
