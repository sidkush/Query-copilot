# Phase G Session Trigger — Retrieval Hygiene (P9 + H14 bundle extensions)

> **Copy this entire file into the first message of a new Claude Code session.**

---

You are picking up an in-progress architectural build called **Grounding Stack v6** for the AskDB (QueryCopilot V1) project. Your job in this session is to author the **Phase G** implementation plan — nothing else.

## Pre-flight — verify state (do this FIRST, do NOT skip)

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git log --oneline -20
ls docs/superpowers/plans/ | grep -E "phase-[a-f]"
```

Expected: plans for phases A through F present. Recent commit includes `chore(phase-f): exit gate`.

Verify Phase A-F code artifacts are importable:

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1/backend"
python -c "
import sys; sys.path.insert(0, '.')
from embeddings.embedder_registry import get_embedder
from data_coverage import DataCoverageCard
from scope_validator import ScopeValidator, RuleId
from intent_echo import build_echo
from semantic_registry import SemanticRegistry
from provenance_chip import ProvenanceChip
from tenant_fortress import chroma_namespace
from sampling_aware import approximate_distinct_count
# Phase F
from correction_pipeline import promote_to_examples
from golden_eval_gate import run_gate
from admin_ceremony import AdminCeremony
from adversarial_similarity import is_storm
print('Phase A-F imports OK')
"
```

If any fail, STOP and ask the user.

Verify at least 8 trap baselines present:

```bash
ls "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1/.data/" | grep baseline | wc -l
```

Expected: `8` or more. Sub-8 → STOP.

## Required reads (do NOT skip)

1. `docs/superpowers/plans/2026-04-22-grounding-stack-v6-master.md` — read the "Phase sequence" row for G + any P9 / "retrieval hygiene" / "skill bundles" / "query expansion" / "archival" / "depends_on" references + Round 4 H14 (embedding migration) risk notes about token budget.
2. Previously-authored phase plans (A-F) — match format, especially Phase E / Phase F for task-granularity.
3. `backend/skill_library.py` — current retrieval surface. `grep -n "def retrieve\|def search\|token_count\|MAX_TOKENS" backend/skill_library.py`.
4. `backend/tests/test_embedder_registry.py` + `backend/embeddings/*.py` — understand the embedder/ensemble surface that retrieval builds on.
5. `askdb-skills/` directory — inspect current 49 skill files. `ls askdb-skills/core/` + `ls askdb-skills/`. Phase G adds `depends_on` metadata to some of these.

## Phase G scope (from master plan)

**Goal:** Reduce retrieval token cost ≥30% without degrading quality, by: (a) bundling related skills into atomic groups, (b) rewriting user NL into expanded queries before embedding lookup, (c) archiving low-value skills behind a dormancy threshold (vs deleting them), (d) detecting cycles in a new `depends_on` skill DAG.

**Files the master plan expects Phase G to touch:**
- NEW: `backend/skill_bundles.py` — bundle resolver; a bundle = set of skill names that always ship together.
- NEW: `backend/query_expansion.py` — NL → synonyms/paraphrases → enriched embedding input (Haiku-backed, ≤200 tokens out).
- NEW: `backend/skill_archival.py` — detect never-retrieved skills; move to `askdb-skills/archive/` rather than deleting (H15 archival convention).
- NEW: `backend/depends_on_resolver.py` — topological sort + cycle detector over `depends_on` frontmatter field.
- EDIT: `backend/skill_library.py` — retrieval path consults bundles + expansion before ChromaDB query; respects `depends_on`.
- EDIT: some `askdb-skills/*.md` frontmatter — add `depends_on:` field to skills that require others.
- NEW: `backend/tests/test_skill_bundles.py`, `test_query_expansion.py`, `test_skill_archival.py`, `test_depends_on_resolver.py`.
- EDIT: `backend/config.py` — feature flags for each sub-system + token-budget target constant.
- Measurement infrastructure: before/after token count comparison harness (new `backend/tests/test_retrieval_budget.py`).

**Exit criteria (from master):** Token budget reduction 30%+ measured against a pinned corpus of ~50 representative queries. No cap overflow. `depends_on` cycle detector catches a synthetic cycle test case.

## Your task this session

1. Run pre-flight.
2. Read required files + inspect the 49 skill files in `askdb-skills/` to understand current retrieval surface.
3. Invoke the `superpowers:writing-plans` skill.
4. Author the plan.
5. Save to: `docs/superpowers/plans/2026-05-17-phase-g-retrieval-hygiene.md`.
6. Offer execution choice. Do not execute.

## Anti-drift rules

- Token-budget target (30%) is from master. Do NOT invent a different number.
- `depends_on` frontmatter field is authoritative — inspect at least 3 current skills via `head -20 askdb-skills/core/*.md` to confirm current frontmatter shape before designing the field's interaction.
- Query expansion uses Haiku (existing `anthropic_provider.py`). Do NOT spec a new LLM provider.
- Archival = MOVE to `askdb-skills/archive/`, NOT delete. Master plan explicitly rejects wholesale deletion (see "What we explicitly rejected").
- Every bundle must be scoped `(tenant, connection)` per Ring 6 / Phase E — reuse `tenant_fortress.chroma_namespace()` for any bundle-related storage.
- Include a measurement harness task. "30% reduction" must be VERIFIABLE by a test command, not an eyeball estimate.
- Follow TDD. Bite-sized tasks. No placeholders.
- Expected task count: ~15-18 (2-3 day phase).
- Provide DAG / parallel-track recommendation at end.

If any pre-flight check fails, STOP and report to user.
