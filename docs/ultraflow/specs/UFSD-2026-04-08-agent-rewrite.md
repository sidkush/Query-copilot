# UFSD Summary
[2026-04-08] Building complete. 14/14 tasks pass. Backend + frontend verified. Fingerprint: Agent supports unlimited-tile dashboard builds with SQLite-persisted sessions, structured progress tracking, auto-extending tool budgets (up to 100), dialect-aware SQL, Claude Code-style session history, plan checklist UI, and continue/resume via POST /api/v1/agent/continue.

Feature: Adaptive agent loop with server-side persistence, structured planning, dynamic tool budgets, continue/resume, and Claude Code-style session history.
Scope Baseline: In — SQLite session store, progress tracker, dynamic tool budget with auto-extension, plan generation + checklist UI, "continue" endpoint, session list/load/delete APIs, fix agentChatId null bug, replace localStorage with API, plan step + progress rendering in AgentStepFeed. Out — Hierarchical sub-agents, cross-session learning, real-time collaboration, localStorage history migration, waterfall/query intelligence changes, core tool changes.
Assumptions:
  1. Heuristic tool budget (dashboard=20, complex=15, simple=8) + auto-extension in increments of 10, safety cap at 100
  2. SQLite at .data/agent_sessions.db with WAL mode + busy_timeout=5000
  3. Structured progress log for "continue" — {goal, completed, pending}
  4. Plan step is informational, auto-executes immediately
  5. Claude Code-style session list — click to load, scroll full history
  6. Planning uses Sonnet for complex/dashboard tasks, Haiku for simple
  7. Sessions capped at 50 per user, oldest auto-purged
  8. Wall clock: 120s/segment, 900s absolute for dashboard builds
  9. No tile count limit — agent builds all user-selected tiles
  10. Quality first — every tile test-executed before creation
Confidence: 5/5
Coverage: 8 explored / 8 visible

---

# UFSD Detail

## Context
The current agent system has three critical limitations:
1. Tool call limit too low (12 max) — dashboard creation with 5+ tiles gets interrupted
2. Session memory is in-memory only (lost on restart) and frontend localStorage is buggy (agentChatId null)
3. Agent panel history is broken — no persistent scrollable conversation history

## Approach: Adaptive Loop + Server Memory + Lightweight Planning
Single agent loop (not hierarchical sub-agents) with these upgrades:

### 1. Dynamic Tool Budget
- Keyword heuristic sets initial budget: dashboard=20, complex=15, simple=8
- Agent can auto-extend in increments of 10 up to safety cap of 100
- Extension logged to audit trail
- No user confirmation needed for extension

### 2. SQLite Session Persistence
- Database: `.data/agent_sessions.db`
- WAL mode for concurrent read/write safety
- Tables: sessions (chat_id, email, title, steps_json, progress_json, created_at, updated_at), session_messages (id, chat_id, role, content, created_at)
- 50 sessions per user cap, oldest auto-purged
- Replaces both in-memory dict (backend) and localStorage (frontend)

### 3. Structured Progress Tracker
- Format: {goal, completed: [{task, tool_calls_used, result_summary}], pending: [{task}], total_tool_calls}
- Written to SQLite BEFORE each tool call, updated AFTER
- On "continue": injected as <progress> block in system prompt

### 4. Lightweight Planning
- For complex/dashboard tasks: one Sonnet call to generate plan
- Plan includes: list of proposed tiles with suggested SQL approach + chart type
- For dashboard: agent uses ask_user to present tile menu, user selects
- Plan emitted as AgentStep(type="plan") — rendered as checklist in UI
- Plan validated against schema cache before presentation

### 5. Claude Code-Style Session History
- Backend API: GET /api/v1/agent/sessions (list), GET /api/v1/agent/sessions/:id (load), DELETE /api/v1/agent/sessions/:id
- Frontend: session list in agent panel history view, click to load, full scrollback
- Title derived from first user query

### 6. Dashboard Build Workflow
1. User: "Create a dashboard from my BigQuery data"
2. Agent: find_relevant_tables → discover available data
3. Agent: plan step → propose 8-12 possible tiles based on schema
4. Agent: ask_user → present tile menu with checkboxes
5. User: selects 6 tiles
6. Agent: for each selected tile: write SQL → run_sql (validate) → create_dashboard_tile
7. Progress tracker updated after each tile
8. If interrupted: "Continue" loads progress, resumes from next pending tile

## Key Risks & Mitigations
- R1: Token overflow on large builds → Sliding compaction (keep last 2 tiles + progress log)
- R2: BigQuery dialect errors → Dialect-aware hints in system prompt
- R3: Broken SQL on tiles → Test-execute before create, retry 3x, skip if still failing
- R4: SSE drops mid-build → Progress in SQLite, "Continue" button
- R5: SQLite write conflicts → WAL mode + busy_timeout

## Invariants
- I1: Every tile must have validated, test-executed SQL before creation
- I2: Progress log written BEFORE tool call, updated AFTER
- I3: Session memory never shared across users
- I4: SQL validation + PII masking always runs
- I5: Server-side storage is source of truth (no localStorage for sessions)
- I6: Agent cannot create more tiles than user selected
- I7: Budget extensions logged to audit trail

## Success Criteria
1. Agent builds all user-selected dashboard tiles end-to-end — no artificial limits
2. Every tile has working, validated SQL with appropriate chart type
3. "Continue" resumes interrupted builds with correct progress
4. Session history persists across restarts — full conversation scrollback
