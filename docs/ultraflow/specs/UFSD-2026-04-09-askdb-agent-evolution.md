# UFSD Summary
Feature: AskDB — rebrand + unkillable agent with progress UI, verification, and confidence scoring
Scope Baseline:
  In — Full DataLens→AskDB rename, elastic per-phase timeouts, Claude Code-style progress checklist, smart verification on complex queries, confidence badges, first-class cancel button, per-user concurrency cap, DB timeout per-call, Railway deployment
  Out — Time-series prediction, financial analysis engine, market analysis reports, ML-based forecasting, semantic database model, advanced report generation (all Phase 2)
Assumptions:
  1. Full rebrand: DataLens → AskDB in all .py, .jsx, .js, .css, .md, .json, Dockerfile, docker-compose, .env.example
  2. Verification triggers on JOINs, subqueries, aggregations, window functions, or 3+ tool calls
  3. Progress shows numbered checklist + phase badges + elapsed + ETA (heuristic)
  4. ETA heuristic: simple 5-10s, complex 30-60s, dashboard 2-5min, adjusts dynamically
  5. Demo deployment: frontend Vercel (free), backend Railway ($0-5/month)
  6. Concurrent agent cap: 2 per user
  7. Complex queries needing >300s DB time get warning, not kill
  8. Railway for demo + early production; AWS migration only at >100 concurrent users
Confidence: 4/5
Coverage: 7 explored / 7 visible

---

# UFSD Detail — AskDB Agent Evolution

## 1. Full Rebrand: DataLens → AskDB

Replace every instance of "DataLens" (and "datalens", "data-lens", "DATALENS", "data_lens") with "AskDB" (and corresponding case variants) across:
- All Python files (backend/)
- All JSX/JS files (frontend/src/)
- CSS/index.css
- package.json, vite.config.js
- Dockerfile, docker-compose.yml
- .env.example
- CLAUDE.md (both root and V1)
- All docs/ markdown files
- Logo component (DataLensLogo.jsx → AskDBLogo.jsx)
- Config variables (DATALENS_ENV → ASKDB_ENV, etc.)
- Email templates (digest.py)
- Window titles, page titles, meta tags

Keep git history clean: single commit for the rename.

## 2. Elastic Per-Phase Timeout Architecture

### Current State (broken)
- `agent_engine.py`: single 120s `WALL_CLOCK_LIMIT` kills all queries
- `db_connector.py`: independent 30s `QUERY_TIMEOUT_SECONDS` (never overridden per-call)
- `anthropic_provider.py`: 60s client timeout
- `agent_routes.py`: 30s SSE heartbeat poll
- Four independent clocks, none aware of the others

### Target State
Replace single wall-clock with per-phase budgets:

| Phase | Budget | Rationale |
|-------|--------|-----------|
| Planning (Sonnet call) | 30s | Planning shouldn't be slow |
| Schema discovery (find_tables + inspect_schema) | 60s | Cloud warehouses can be slow |
| SQL generation (Haiku/Sonnet) | 30s | LLM call |
| DB execution (run_sql) | 300s (configurable per-connection) | Complex queries on big datasets |
| Verification pass | 30s | Re-check call |
| Total session soft cap | None (BYOK) | User controls spend |
| Total session hard cap | 1800s (30 min) | Safety — prevent forgotten sessions |

### Implementation
- `config.py`: Add `AGENT_PHASE_LIMITS` dict with per-phase defaults
- `agent_engine.py`: Replace `_check_guardrails()` with phase-aware budget tracking
- `db_connector.py`: `execute_query()` already accepts `timeout` param — agent must pass it
- Per-user concurrency: middleware enforcing max 2 active agent sessions (in-memory dict, keyed by email)

### Cancel Mechanism
Three existing primitives, currently unwired:
1. `memory._cancelled` flag in `agent_engine.py` (only set on SSE disconnect)
2. `streamRef.current.close()` in `AgentPanel.jsx` (only called on panel unmount)
3. `execute_query` timeout param in `db_connector.py` (never passed by agent)

Wire them:
- Frontend: Add visible "Cancel" button during `agentLoading`. onClick → `streamRef.current.close()` + POST `/api/v1/agent/cancel/{chat_id}`
- Backend: New cancel endpoint sets `memory._cancelled = True`. Agent loop checks this every iteration.
- DB: On cancel, call `connection.cancel()` if driver supports it (Postgres: `connection.cancel()`, MySQL: `KILL QUERY`)

## 3. Claude Code-Style Progress UI

### Backend SSE Events (new step types)
```json
{"type": "phase_start", "phase": "schema_discovery", "step_number": 2, "total_steps": 6, "label": "Finding relevant tables...", "elapsed_ms": 1200}
{"type": "phase_complete", "phase": "schema_discovery", "step_number": 2, "duration_ms": 3400}
{"type": "progress_estimate", "elapsed_ms": 5000, "estimated_total_ms": 25000, "completed_steps": 2, "total_steps": 6}
{"type": "checklist_update", "items": [{"label": "Understanding question", "status": "done"}, {"label": "Finding tables", "status": "done"}, {"label": "Generating SQL", "status": "active"}, {"label": "Executing query", "status": "pending"}, {"label": "Analyzing results", "status": "pending"}, {"label": "Verifying answer", "status": "pending"}]}
```

### Frontend Rendering (AgentStepFeed.jsx additions)
- `phase_start`: Animated step appearing with label text + spinner
- `phase_complete`: Step gets green checkmark, spinner stops
- `checklist_update`: Full task list with done/active/pending states (like Claude Code's TodoWrite)
- `progress_estimate`: Thin progress bar at top of agent panel + "~20s remaining" text
- Active phase pulses gently (not distracting, just alive)
- Cancel button always visible during loading, red, prominent

### ETA Heuristic
```python
def estimate_total_ms(question: str, schema_profile: dict, tool_count: int) -> int:
    base = 5000  # 5s minimum
    if has_joins(question): base += 10000
    if has_aggregation(question): base += 5000
    if schema_profile.get("total_rows", 0) > 1_000_000: base += 15000
    if tool_count > 5: base += tool_count * 2000
    return base
```
Adjusts dynamically: after each phase completes, recalculate based on actual elapsed vs estimated.

## 4. Smart Verification + Confidence Scoring

### When to Verify
Verification triggers when ANY of:
- Query has JOINs
- Query has subqueries
- Query has GROUP BY + HAVING
- Query has window functions
- Agent used 3+ tool calls
- Agent self-reports low confidence

### Verification Process
1. Agent generates final answer (natural language summary)
2. System extracts factual claims from the summary (numbers, comparisons, trends)
3. Verification prompt sends claims + raw query results to Claude
4. Claude checks each claim against the data
5. Returns confidence: HIGH (all claims verified) / MEDIUM (some unverifiable) / LOW (discrepancies found)

### Confidence Badge UI
- HIGH: Green badge with checkmark — "Verified against data"
- MEDIUM: Amber badge with info icon — "Partially verified — some claims could not be checked"
- LOW: Red badge with warning — "Discrepancy detected — please review the data"
- Badge is clickable: shows the verification details (which claims checked, which passed/failed)

### Anti-Hallucination Chain
1. Agent generates SQL from grounded schema context (existing RAG)
2. SQL validated by 6-layer validator (existing)
3. Results PII-masked (existing)
4. Agent summary generated from actual result rows (existing, but reinforce in prompt)
5. NEW: Verification pass compares summary claims against result data
6. NEW: Confidence badge shown to user

## 5. Deployment

### Demo Setup
- Frontend: Vercel free tier (static React build, `npm run build` → deploy)
- Backend: Railway free tier ($5 credit, persistent connections, no cold start)
- Database: User's own (BYOK model — they connect their DB)
- LLM: User's own Anthropic API key (BYOK)

### Railway Config
- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
- Env vars: Copy from .env.example, add `FRONTEND_URL` = Vercel domain
- CORS: Update to include Vercel domain

### Vercel Config
- Framework: Vite
- Build: `npm run build`
- Output: `dist/`
- Environment: `VITE_API_URL` = Railway backend URL

## 6. Phase 2 Roadmap (Post-Demo)

After demo lands and feedback is collected:
1. Time-series prediction (statsmodels/Prophet integration)
2. Financial analysis engine (domain-specific prompts + ratio calculations)
3. Report generation (PDF/HTML export with charts + narrative)
4. Market analysis templates
5. Semantic database model (entity relationship inference)
6. Multi-user collaborative queries

## 7. Success Criteria

1. No query ever shows "Wall-clock timeout exceeded" — every query completes or is user-cancelled
2. User sees step-by-step progress checklist within 2s of agent starting
3. Complex query verification catches >90% of factual discrepancies
4. Full rebrand: zero instances of "DataLens" remain in codebase
5. Demo deployment works end-to-end on Railway + Vercel
