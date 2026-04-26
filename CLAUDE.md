<!-- @paths below are resolved relative to THIS file.
     Loaded into context at session start (Claude Code CLI v0.2.107+).
     Full pre-split reference at CLAUDE.pre-split.md. -->

# CLAUDE.md — QueryCopilot V1 / AskDB

AskDB is an NL-to-SQL analytics SaaS (FastAPI 8002 + React 5173).
Architecture is a 4-tier query waterfall (Schema → Memory → Turbo →
Live) with multi-step agent mode, BYOK Anthropic per-user, read-only
DB enforcement, and 6-layer SQL validation. Active branch:
`askdb-global-comp`.

## Always-loaded context

@docs/claude/overview.md
@docs/claude/setup.md
@docs/claude/security-core.md
@docs/claude/config-defaults.md
@docs/claude/arch-backend.md
@docs/claude/constraints-agent-auth.md

## On-demand deep-dives — `Read` when the task touches the area

| Task touches… | Read |
|---|---|
| React UI, Zustand, Vega-Lite, ChartEditor, SSE chat | `docs/claude/arch-frontend.md` |
| Waterfall internals, QueryMemory RAG, Turbo twin, LiveTier | `docs/claude/arch-query-intelligence.md` |
| ML AutoML, Celery training, ingest modes, Arrow bridge | `docs/claude/arch-ml-engine.md` |
| Voice Mode tiers, Progressive Dual-Response | `docs/claude/arch-voice-dual-response.md` |
| Plan workflow, journals, graphify, misc dev notes | `docs/claude/dev-notes.md` |

## Golden rules (always in context, non-negotiable)

- Read-only DB role; never weaken the 6-layer SQL validator.
- Only `backend/anthropic_provider.py` may `import anthropic`.
- Backend port 8002 local / 8000 Docker. Vite proxy 5173 → 8002.
- Two-step query flow: `/generate` then `/execute`. Never collapse.
- PII: `mask_dataframe()` before any row leaves the backend.
- Before architecture changes in an on-demand area above, `Read` that
  area's `.md` file first. Do not guess.
- Every numeric constant lives in `config-defaults.md`. If you touch
  a value in code, update that file in the same commit.

## Grounding Stack v6 (shipped)

7 Rings + 27 Hardening Bands layered on top of the waterfall. Key invariants:

- Ring 1 — `data_coverage.py` injects real row counts + date ranges; agents never infer scope from table names.
- Ring 3 — `scope_validator.py` runs 10 rules between SQL gen + execution; fail-open on parse exception.
- Ring 4 — `intent_echo.py` emits operational-definition card when ambiguity >= 0.3.
- Ring 5 — `provenance_chip.py` emits trust chip BEFORE first streamed token.
- Ring 6 — `tenant_fortress.py` composite-keys every cache/namespace/session. NEVER use user_id or conn_id alone as a cache key.
- Tier universality — `waterfall_router.validate_scope()` runs Ring 3 at every tier.
- Replan budget: 2 per query (raised from 1 — T13, 2026-04-26). Field(ge=1, le=5). Update `SCOPE_VALIDATOR_REPLAN_BUDGET` in config.py if changed.

See `docs/grounding-stack-v6/` for full docs + `docs/superpowers/plans/2026-04-22-grounding-stack-v6-master.md` for the architectural north star.

## VizQL codegen

- `make proto` regenerates Python (`backend/vizql/proto/`) + TS
  (`frontend/.../vizSpecGenerated.ts`) bindings from
  `backend/proto/askdb/vizdataservice/v1.proto`. Windows (no GNU
  make): `bash backend/scripts/regen_proto.sh` +
  `bash frontend/scripts/regen_proto.sh` (or `npm run proto` from
  `frontend/`). Edit the `.proto`, run the codegen, commit the diff
  together. See `backend/vizql/README.md`.
