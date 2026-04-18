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
