# Phase J Session Trigger — Closeout (P12 docs + changelog + GA announce)

> **Copy this entire file into the first message of a new Claude Code session.**

---

You are picking up the **Grounding Stack v6** build for AskDB. This is the final phase. Your job this session: author the **Phase J** plan. Phase J is documentation, changelog, release tag, and GA announcement.

## Pre-flight — verify state (FIRST, DO NOT skip)

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git log --oneline -30
ls docs/superpowers/plans/ | grep -E "phase-[a-i]"
```

Expected: plans A–I present. Recent commit `chore(phase-i): exit gate` — telemetry live, alerts firing, cache dashboard rendering.

Verify full Phase A-I surface imports:

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1/backend"
python -c "
import sys; sys.path.insert(0, '.')
# Phase A
from embeddings.embedder_registry import get_embedder
# Phase B
from data_coverage import DataCoverageCard
# Phase C
from scope_validator import ScopeValidator, RuleId; assert len(list(RuleId)) == 10
# Phase D
from intent_echo import build_echo, EchoMode
# Phase E
from provenance_chip import ProvenanceChip
from tenant_fortress import chroma_namespace
# Phase F
from correction_pipeline import promote_to_examples
# Phase G
from skill_bundles import resolve_bundle
# Phase H
from audit_integrity import verify_checksum
# Phase I
from alert_manager import dispatch
from residual_risk_telemetry import run_all_detectors
print('Phase A-I imports OK — stack v6 code complete')
"
```

Verify all trap baselines present (should be 9+):

```bash
ls "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1/.data/" | grep baseline | wc -l
```

If any fail → STOP.

## Required reads (do NOT skip)

1. `docs/superpowers/plans/2026-04-22-grounding-stack-v6-master.md` — read the entire file. Phase J's output will reference it as the north-star spec and summarize its 7 Rings + 27 Bands for end-user consumption.
2. All prior phase plans (A–I) — Phase J's changelog cross-references every phase's exit commit.
3. `docs/claude/overview.md` + `docs/claude/arch-backend.md` + `docs/claude/security-core.md` + `docs/claude/config-defaults.md` — Phase J UPDATES these to reflect v6.
4. `CLAUDE.md` (project root) + `QueryCopilot V1/CLAUDE.md` — Phase J adds a "Grounding Stack v6" section summarizing the rings for future Claude sessions.
5. `git log --oneline origin/main..HEAD` — build the changelog input. Every `feat(phase-*)` + `merge(phase-*)` + `chore(phase-*)` commit since the branch started is a changelog entry candidate.

## Phase J scope (from master plan)

**Goal:** Ship v6 — produce end-user documentation, admin documentation, a complete `CHANGELOG.md` entry, tag the release, and generate a GA announcement draft.

**Files the master plan expects Phase J to touch:**
- NEW: `docs/grounding-stack-v6/overview.md` — user-facing "what changed + why it matters" (no internals; outcomes only).
- NEW: `docs/grounding-stack-v6/admin-guide.md` — admin ceremony (Phase F), cache-stats dashboard (Phase I), residual-risk runbooks (Phase I), feature-flag matrix (all phases).
- NEW: `docs/grounding-stack-v6/migration-guide.md` — how existing tenants are auto-migrated (tenant_id mint, embedding upgrade, coverage cards populate on next connect).
- EDIT: `CHANGELOG.md` — a single `## [v6] — <date>` block listing every user-facing change bucketed by Ring.
- EDIT: `docs/claude/overview.md` — add Grounding Stack v6 to the 4-tier waterfall summary.
- EDIT: `docs/claude/arch-backend.md` — reference the new modules (Rings 1-6, all H-bands).
- EDIT: `docs/claude/security-core.md` — extend invariants list with H19/H20/H25/H27 items from Phase H.
- EDIT: `docs/claude/config-defaults.md` — confirm every Phase A-I config section is present + consistent.
- EDIT: `CLAUDE.md` (both root + QueryCopilot V1) — one new line per Ring.
- NEW: `docs/grounding-stack-v6/announce-draft.md` — marketing/blog GA draft (no jargon, outcomes framed).
- Git tag: `v6.0.0` on the final exit-gate commit.

**Exit criteria (from master):** Docs merged; stack v6 shipped. Tag `v6.0.0` present on the exit-gate commit. CHANGELOG block published. GA announce draft reviewed (by user, not in this session).

## Your task this session

1. Run pre-flight.
2. Read ALL required files. This is the last phase — incomplete reads here ship wrong docs.
3. Invoke the `superpowers:writing-plans` skill.
4. Author the plan.
5. Save to: `docs/superpowers/plans/2026-05-25-phase-j-closeout.md`.
6. Offer execution choice. Do not execute.

## Anti-drift rules

- No invented claims about features. Every sentence in the plan's proposed doc content must be grounded in a specific phase-plan exit criterion. When the plan proposes new doc sections, it must cite the phase that shipped the referenced feature.
- Changelog entries come from `git log`, not memory. The plan must include a step like: `git log origin/main..HEAD --oneline | grep "^[a-f0-9]\+ feat(phase-"` and then bucket by Ring.
- Do NOT include any unshipped feature. If you're unsure whether something shipped, ASK the user.
- User-facing doc (overview.md) must NOT mention Ring numbers, H-band numbers, or master-plan jargon. It describes USER OUTCOMES (e.g. "AskDB now queries your actual data coverage rather than inferring from table names"). Internal docs can use the jargon.
- Admin-guide references Phase F's 2-admin ceremony — do not invent alternate approval flows.
- Tagging: `git tag -a v6.0.0` with a multi-line annotation listing the 7 Rings + which phase shipped each. No signed tags unless user explicitly requested.
- Announce draft: no hyperbole, no emojis, no filler words like "revolutionary / seamless / game-changing". Outcomes + concrete examples.
- Every doc edit must re-verify the config table in `config-defaults.md` has no stale entries — grep for every `FEATURE_*` flag from Phase A-I config steps and confirm it's present.
- Follow TDD where applicable (mostly doc tasks, but changelog + tag + migration-guide examples are verifiable).
- Expected task count: ~10-14 (1-day phase).
- Provide DAG — most tasks are parallel (independent doc files).

If any pre-flight check fails, or if any Phase A-I import fails in the sanity check, STOP and report to user. Phase J cannot ship over a broken stack.
