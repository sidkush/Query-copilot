## Scope

One-paragraph project summary + the 4-tier waterfall skeleton every
other doc assumes. Read this first if you don't already know what
AskDB is.

## Project

**AskDB** (formerly QueryCopilot) — NL-to-SQL analytics SaaS. User
connects their own DB, asks plain English, receives generated SQL
(shown for review before run), results, auto-charts, NL summary.
Includes agentic multi-step query mode, NL-defined alerts, scheduled
email digests, and a dashboard presentation engine.

## Services

Two independent services:

- **FastAPI backend** on `8002` local (Docker: `8000`).
- **React frontend** on `5173` with Vite proxying `/api` → backend.

See `setup.md` for run commands, `config-defaults.md` for ports + env
flags.

## Core query pipeline (`backend/query_engine.py`)

1. Embed question → ChromaDB RAG retrieval (per-connection namespaced
   collections for schema + few-shot).
2. Build prompt → Claude API (Haiku primary, Sonnet fallback on
   validation failure).
3. SQL cleaned → 6-layer validation (`sql_validator.py`) → optional
   execution → PII masking → NL summary.
4. Positive feedback stored back to ChromaDB for future queries.

**Two-step query flow by design:** `/api/queries/generate` (returns
SQL for user review) → `/api/queries/execute` (user-approved run).
**Never collapse.** See `security-core.md`.

## 4-tier waterfall query intelligence

Every question routes through tiers in order; first hit wins.

```
User question
  → Tier 0: SchemaTier    — ~7ms — cached metadata
  → Tier 1: MemoryTier    — ~19ms — ChromaDB anonymized query insights
  → Tier 2a: TurboTier    — <100ms — local DuckDB replica (opt-in)
  → Tier 2b: LiveTier     — seconds, streamed — fallback, always answers
```

Details in `arch-query-intelligence.md`.

## Everything else (navigate via the CLAUDE.md index)

- Backend modules, routers, agent engine, storage → `arch-backend.md` (always-loaded).
- Frontend, Zustand, Vega-Lite, ChartEditor → `arch-frontend.md` (on-demand).
- ML AutoML pipeline → `arch-ml-engine.md` (on-demand).
- Voice Mode tiered stack + Dual-Response → `arch-voice-dual-response.md` (on-demand).
- Security + 6-layer SQL validation + 11 coding rules → `security-core.md` (always-loaded).
- Agent system guardrails, auth, infra → `constraints-agent-auth.md` (always-loaded).
- Dev workflow, journals, graphify → `dev-notes.md` (on-demand).
- Numeric constants, ports, quotas, model IDs, flags → `config-defaults.md` (always-loaded).
