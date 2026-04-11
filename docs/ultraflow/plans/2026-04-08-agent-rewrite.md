# Plan: Agent System Rewrite — Adaptive Loop + Server Memory + Planning
**Spec**: `docs/ultraflow/specs/UFSD-2026-04-08-agent-rewrite.md`
**UFSD**: Same file (summary + detail sections)
**Approach**: Adaptive Loop + Server Memory + Lightweight Planning (single agent loop, not hierarchical)
**Branch**: `feature/agent-rewrite`

## Assumption Registry
- ASSUMPTION: SQLite WAL mode works correctly on Windows 11 — validated by SQLite docs (WAL supported on all platforms since 3.7.0, bundled Python sqlite3 is 3.40+)
- ASSUMPTION: Python `sqlite3` stdlib module is sufficient (no need for `aiosqlite`) — validated: all DB access is in sync thread (agent runs in executor thread)
- ASSUMPTION: `connection_entry` has `db_type` attribute for dialect hints — UNVALIDATED — risk item (check `models.py` ConnectionEntry)
- ASSUMPTION: `AgentStepFeed.jsx` switch on `step.type` is the only renderer — validated by reading the component
- ASSUMPTION: Frontend `api.js` `request()` helper handles JSON responses with auth headers — validated by reading api.js
- ASSUMPTION: `audit_trail.py` `log_tier_decision()` accepts arbitrary extra fields — UNVALIDATED — risk item (check function signature)

## Invariant List
- Invariant-1: Every tile must have validated, test-executed SQL before creation
- Invariant-2: Progress log written BEFORE tool call, updated AFTER
- Invariant-3: Session memory never shared across users (email-scoped)
- Invariant-4: SQL validation + PII masking always runs (no bypass regardless of budget)
- Invariant-5: Server-side storage is source of truth (no localStorage for session data)
- Invariant-6: Agent cannot create more tiles than user selected
- Invariant-7: Budget extensions logged to audit trail

## Failure Mode Map
1. **FM-1: SQLite schema migration breaks existing data** — New `.data/agent_sessions.db` file is created fresh (no migration of old localStorage data per scope). Risk: zero (new file, no existing data to break). But if we accidentally write to a path that conflicts with existing `.data/` files, we corrupt user data.
2. **FM-2: Progress tracker diverges from actual state** — If a tool call succeeds but the post-call progress update fails (e.g., SQLite locked), the progress log shows the task as "in_progress" forever. On "continue", agent re-attempts an already-completed task (e.g., creates duplicate dashboard tile).
3. **FM-3: Dynamic budget extension creates runaway loops** — Agent auto-extends budget and enters an infinite retry cycle (e.g., SQL keeps failing, agent keeps retrying different variations). Safety cap of 100 exists but 100 calls is expensive.
4. **FM-4: Plan step adds latency to simple queries** — Every query pays the cost of complexity detection. If the heuristic misclassifies a simple query as "complex," user waits for an unnecessary planning LLM call.
5. **FM-5: Frontend session API race condition** — User clicks "load session" while an agent run is active. Two sources of truth compete: the live SSE stream and the loaded historical steps.

## Tasks

### Task 1: Create SQLite session store module (~5 minutes)
- **Files**: `backend/agent_session_store.py` (create)
- **Intent**: New module providing `AgentSessionStore` class. Singleton pattern (module-level instance). Creates `.data/agent_sessions.db` with WAL mode + busy_timeout=5000. Schema:
  ```sql
  CREATE TABLE IF NOT EXISTS sessions (
      chat_id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      title TEXT DEFAULT '',
      steps_json TEXT DEFAULT '[]',
      progress_json TEXT DEFAULT '{}',
      created_at REAL NOT NULL,
      updated_at REAL NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_email ON sessions(email);
  CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(email, updated_at);
  ```
  Methods: `save_session(chat_id, email, title, steps, progress)`, `load_session(chat_id, email) -> dict|None`, `list_sessions(email, limit=50) -> list[dict]`, `delete_session(chat_id, email) -> bool`, `purge_oldest(email, keep=50)`. All methods use `WHERE email = ?` (Invariant-3). Thread-safe via `threading.Lock` around all writes (reads use WAL concurrent reads). `purge_oldest` called inside `save_session` automatically.
- **Invariants**: Invariant-3 (email scoping), Invariant-5 (server-side truth)
- **Assumptions**: SQLite WAL on Windows (validated)
- **Test**: `python -c "from agent_session_store import session_store; session_store.save_session('test1', 'a@b.com', 'Test', [{'type':'user_query','content':'hi'}], {}); r = session_store.load_session('test1', 'a@b.com'); assert r and r['title'] == 'Test'; print('PASS')"` → expects `PASS`
- **Invariant-Check**: `python -c "from agent_session_store import session_store; r = session_store.load_session('test1', 'other@b.com'); assert r is None; print('INVARIANT-3 PASS')"` → confirms email scoping
- **Commit**: `feat(agent): add SQLite session store with WAL mode`

### Task 2: Add session REST API endpoints (~5 minutes)
- **Files**: `backend/routers/agent_routes.py` (modify)
- **Intent**: Add 3 new endpoints to the existing agent router:
  - `GET /api/v1/agent/sessions` — calls `session_store.list_sessions(email)`, returns `{sessions: [{chat_id, title, step_count, created_at, updated_at}]}`
  - `GET /api/v1/agent/sessions/{chat_id}` — calls `session_store.load_session(chat_id, email)`, returns full session with steps and progress. 404 if not found or wrong email.
  - `DELETE /api/v1/agent/sessions/{chat_id}` — calls `session_store.delete_session(chat_id, email)`, returns `{status: "ok"}`. 404 if not found.
  All endpoints use `Depends(get_current_user)` for auth. Email extracted from user dict.
- **Invariants**: Invariant-3 (email in all queries)
- **Assumptions**: None new
- **Test**: `curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8002/api/v1/agent/sessions | python -m json.tool` → expects `{"sessions": [...]}`
- **Invariant-Check**: Manual — request with user A's token should not return user B's sessions
- **Commit**: `feat(agent): add session list/load/delete REST endpoints`

### Task 3: Wire agent run to persist sessions in SQLite (~5 minutes)
- **Files**: `backend/routers/agent_routes.py` (modify)
- **Intent**: In the `agent_run` endpoint's `event_generator()`:
  1. After the agent loop completes (sentinel `None` from queue), call `session_store.save_session(chat_id, email, title, steps_data, progress_data)` where `title` = first 80 chars of the question, `steps_data` = all SSE step dicts collected, `progress_data` = engine progress tracker (Task 5).
  2. Also save on SSE disconnect/error (in the `except` blocks) so partial progress is preserved.
  3. Remove the in-memory `_sessions` dict LRU cap concern — SessionMemory stays in-memory for the live run, but the persistent record goes to SQLite.
- **Invariants**: Invariant-2 (progress saved), Invariant-5 (server-side truth)
- **Assumptions**: None new
- **Test**: Run an agent query via the UI, then check `python -c "from agent_session_store import session_store; ss = session_store.list_sessions('YOUR_EMAIL'); print(len(ss), 'sessions'); assert len(ss) > 0; print('PASS')"` → expects `N sessions\nPASS`
- **Commit**: `feat(agent): persist agent sessions to SQLite after each run`

### Task 4: Dynamic tool budget with auto-extension (~5 minutes)
- **Files**: `backend/agent_engine.py` (modify)
- **Intent**:
  1. Change class constants: `MAX_TOOL_CALLS = 100` (safety cap), `WALL_CLOCK_LIMIT = 120`, `ABSOLUTE_WALL_CLOCK_LIMIT = 900`.
  2. In `_run_inner`, replace the existing keyword-based budget logic (lines ~822-829) with expanded heuristics:
     ```python
     dashboard_keywords = {"dashboard", "tile", "remove", "delete", "add tile", "update tile", "create tile", "pin", "kpi", "build dashboard", "create dashboard"}
     complex_keywords = {"why", "compare", "trend", "correlat", "over time", "vs", "join", "across", "between", "analyze", "breakdown", "segment"}
     is_dashboard = any(kw in q_lower for kw in dashboard_keywords)
     is_complex = any(kw in q_lower for kw in complex_keywords)
     if is_dashboard:
         self._max_tool_calls = 20
     elif is_complex:
         self._max_tool_calls = 15
     else:
         self._max_tool_calls = 8
     ```
  3. In `_check_guardrails`, instead of raising immediately when tool calls exceed budget, auto-extend:
     ```python
     if self._tool_calls >= self._max_tool_calls:
         if self._max_tool_calls < self.MAX_TOOL_CALLS:  # MAX_TOOL_CALLS = 100 (safety cap)
             old = self._max_tool_calls
             self._max_tool_calls = min(self._max_tool_calls + 10, self.MAX_TOOL_CALLS)
             _logger.info("Budget extended: %d → %d for session %s", old, self._max_tool_calls, self.memory.chat_id)
             # Invariant-7: log extension to audit trail
         else:
             raise AgentGuardrailError(...)
     ```
- **Invariants**: Invariant-7 (log extensions)
- **Assumptions**: None new
- **Test**: `python -c "from agent_engine import AgentEngine; assert AgentEngine.MAX_TOOL_CALLS == 100; assert AgentEngine.WALL_CLOCK_LIMIT == 120; print('PASS')"` → expects `PASS`
- **Invariant-Check**: Verify audit trail log after extension — `python -c "from audit_trail import get_recent_decisions; print([d for d in get_recent_decisions(10) if d.get('event_type') == 'budget_extension'])"` → should show extension entries after a long run
- **Commit**: `feat(agent): dynamic tool budget with auto-extension up to 100`

### Task 5: Structured progress tracker in AgentEngine (~5 minutes)
- **Files**: `backend/agent_engine.py` (modify)
- **Intent**:
  1. Add a `_progress` dict to `AgentEngine.__init__`: `self._progress = {"goal": "", "completed": [], "pending": [], "total_tool_calls": 0}`
  2. At start of `_run_inner`, set `self._progress["goal"] = question`.
  3. Before each tool dispatch in the main loop, update `self._progress["total_tool_calls"]`.
  4. For dashboard tile creation specifically: after successful `create_dashboard_tile`, append to `completed` list: `{"task": f"Create tile: {title}", "tool_calls_used": N, "result_summary": "Created successfully"}`. Remove from `pending`.
  5. On guardrail error (budget/timeout), the progress dict is available for the SSE endpoint to save to SQLite (Task 3 reads `engine._progress`).
  6. Expose `self._progress` as a property so `agent_routes.py` can access it.
  7. For "continue" support: if `_run_inner` receives a non-empty progress dict in session memory, inject a `<progress>` block into the system prompt:
     ```
     <progress>
     Goal: {goal}
     Completed: {completed list}
     Remaining: {pending list}
     Tool calls used so far: {N}
     Resume from the next pending task. Do NOT repeat completed tasks.
     </progress>
     ```
- **Invariants**: Invariant-2 (progress written before tool call), Invariant-6 (tile count enforcement)
- **Assumptions**: None new
- **Test**: Manual — run a dashboard creation query, verify `engine._progress` is populated by adding a debug log
- **Commit**: `feat(agent): structured progress tracker for continue/resume`

### Task 6: Add "continue" endpoint and agent resume logic (~5 minutes)
- **Files**: `backend/routers/agent_routes.py` (modify)
- **Intent**:
  1. Add `POST /api/v1/agent/continue` endpoint. Request body: `{chat_id: str}`.
  2. Load session from SQLite (`session_store.load_session`). Extract `progress_json`.
  3. Create a new `SessionMemory` with the progress data pre-loaded.
  4. Inject progress into `SessionMemory._messages` as a synthetic "user" message: `"[Continue previous task] {progress summary}"`.
  5. Create `AgentEngine` and call `run()` with a synthetic question: `"Continue the previous task. Here is your progress: {progress JSON}"`. The system prompt `<progress>` block (from Task 5) provides structure.
  6. Stream SSE events same as `/run`. Save updated session to SQLite on completion.
- **Invariants**: Invariant-2 (progress continuity), Invariant-3 (email check on session load)
- **Assumptions**: Structured progress log is sufficient context for resume
- **Test**: Start a complex query, let it hit budget limit, then call `/api/v1/agent/continue` with the chat_id — verify agent resumes
- **Commit**: `feat(agent): add /continue endpoint for session resume`

### Task 7: Lightweight plan generation in agent loop (~5 minutes)
- **Files**: `backend/agent_engine.py` (modify)
- **Intent**:
  1. At the start of `_run_inner`, after the waterfall check and before the main Claude loop, add a planning step for complex/dashboard queries:
     ```python
     if is_dashboard or is_complex:
         plan = self._generate_plan(question, prefetch_context)
         if plan:
             plan_step = AgentStep(type="plan", content=plan["summary"], tool_input=plan["tasks"])
             self._steps.append(plan_step)
             yield plan_step
             self._progress["pending"] = plan["tasks"]
             # Inject plan into system prompt
             system_prompt += f"\n\n<plan>\n{plan['summary']}\nTasks: {json.dumps(plan['tasks'])}\n</plan>\n"
     ```
  2. Add `_generate_plan(self, question, schema_context)` method:
     - Single LLM call using `self.provider.complete()` with Sonnet model
     - System prompt asks for JSON output: `{"summary": "...", "tasks": [{"title": "...", "approach": "..."}]}`
     - For dashboard requests, tasks should be tile proposals with suggested chart types
     - Parse response JSON, validate against schema cache (check referenced tables exist)
     - Return `None` if parsing fails (graceful degradation — agent proceeds without plan)
  3. For dashboard tile selection: the plan output becomes the options for `ask_user`. The agent's system prompt instructs it to present the plan tasks via `ask_user` and wait for user selection.
- **Invariants**: Invariant-1 (plan validation against schema), Invariant-6 (user selection gates tile creation)
- **Assumptions**: Sonnet produces valid JSON plan (with fallback to no-plan)
- **Test**: Manual — send a "create a dashboard" request, verify a `plan` step appears in SSE stream before tool calls
- **Commit**: `feat(agent): lightweight plan generation for complex/dashboard queries`

### Task 8: Dialect-aware system prompt injection (~3 minutes)
- **Files**: `backend/agent_engine.py` (modify)
- **Intent**:
  1. Add a `DIALECT_HINTS` dict mapping `db_type` → list of SQL syntax warnings:
     ```python
     DIALECT_HINTS = {
         "bigquery": [
             "Use APPROX_QUANTILES instead of PERCENTILE_CONT WITHIN GROUP",
             "Use backticks for table/column names, not double quotes",
             "Use FORMAT_TIMESTAMP instead of TO_CHAR",
             "Use SAFE_DIVIDE instead of division (avoids zero-division errors)",
             "DATE functions: DATE_TRUNC, DATE_DIFF, CURRENT_DATE()",
         ],
         "snowflake": [
             "Use ILIKE for case-insensitive matching",
             "Use FLATTEN for semi-structured data",
             "Identifiers are case-insensitive unless double-quoted",
         ],
         "mysql": [
             "Use LIMIT instead of TOP",
             "Use backticks for identifiers",
             "No FULL OUTER JOIN — use UNION of LEFT and RIGHT",
         ],
     }
     ```
  2. In `_run_inner`, after building `system_prompt`, inject dialect hints:
     ```python
     db_type = getattr(self.connection_entry, 'db_type', '') or ''
     hints = DIALECT_HINTS.get(db_type.lower(), [])
     if hints:
         system_prompt += f"\n\nSQL DIALECT ({db_type.upper()}):\n" + "\n".join(f"- {h}" for h in hints) + "\n"
     ```
- **Invariants**: None directly
- **Assumptions**: `connection_entry` has `db_type` attribute — UNVALIDATED (will check `models.py`)
- **Test**: `python -c "from agent_engine import AgentEngine; assert 'bigquery' in AgentEngine.DIALECT_HINTS; print('PASS')"` → expects `PASS`
- **Commit**: `feat(agent): dialect-aware SQL hints for BigQuery, Snowflake, MySQL`

### Task 9: Frontend — Add session API methods (~3 minutes)
- **Files**: `frontend/src/api.js` (modify)
- **Intent**: Add 3 new methods to the `api` object:
  ```js
  agentSessions: () => request("/agent/sessions"),
  agentSessionLoad: (chatId) => request(`/agent/sessions/${chatId}`),
  agentSessionDelete: (chatId) => request(`/agent/sessions/${chatId}`, { method: "DELETE" }),
  agentContinue: (chatId, onStep, { persona, permissionMode } = {}) => {
    // Same SSE pattern as agentRun but POST to /agent/continue
  },
  ```
- **Invariants**: None (frontend API layer)
- **Assumptions**: None new
- **Test**: Browser console — `await api.agentSessions()` → returns `{sessions: [...]}`
- **Commit**: `feat(frontend): add agent session API methods`

### Task 10: Frontend — Replace localStorage history with server-side API (~5 minutes)
- **Files**: `frontend/src/store.js` (modify)
- **Intent**:
  1. Replace `saveAgentHistory` — instead of writing to localStorage, call `api.agentSessionSave()` (or piggyback on backend auto-save from Task 3). Actually, since backend auto-saves on SSE completion (Task 3), `saveAgentHistory` just needs to be a no-op or a sync trigger.
  2. Replace `loadAgentHistory` — call `api.agentSessionLoad(chatId)` and set `agentSteps` from response.
  3. Replace `getAgentHistoryList` — call `api.agentSessions()` and return session list.
  4. Replace `deleteAgentHistory` — call `api.agentSessionDelete(chatId)`.
  5. Make these async (they're now API calls). Update callers in `AgentPanel.jsx` to handle promises.
  6. Remove localStorage reads/writes for `qc_agent_history`.
  7. **Fix the agentChatId null bug**: In `handleSubmit`, don't hardcode `chatIdForRun = null`. Instead, let the backend generate the chat_id (it already does in `agent_routes.py` line 114) and capture it from the first SSE event's `chat_id` field (already done in `onStep` callback).
- **Invariants**: Invariant-5 (server-side source of truth)
- **Assumptions**: None new
- **Test**: Open agent panel → send a query → close browser → reopen → click history → see the conversation
- **Commit**: `feat(frontend): replace localStorage agent history with server-side API`

### Task 11: Frontend — Claude Code-style session list UI (~5 minutes)
- **Files**: `frontend/src/components/agent/AgentPanel.jsx` (modify)
- **Intent**:
  1. In the history view (currently lines 597-659), replace the simple list with a Claude Code-style session list:
     - Each session shows: title (first query text), step count, timestamp
     - Active session highlighted with accent border
     - Click to load full conversation (calls store's `loadAgentHistory` which now calls API)
     - Delete button per session
  2. Add a "Continue" button that appears when a loaded session's last step is an error or budget limit:
     ```jsx
     {loadedSession?.progress?.pending?.length > 0 && (
       <button onClick={() => handleContinue(loadedSession.chat_id)}>
         Continue ({loadedSession.progress.pending.length} tasks remaining)
       </button>
     )}
     ```
  3. `handleContinue` calls `api.agentContinue(chatId, onStep)` with same SSE handling as `handleSubmit`.
  4. Fetch session list from API on mount and when `showHistory` toggles to true (replace `getAgentHistoryList()` call).
- **Invariants**: None (UI only)
- **Assumptions**: None new
- **Test**: Open agent panel → click history icon → see list of past sessions from server → click one → scroll up to see full conversation
- **Commit**: `feat(frontend): Claude Code-style session list with continue button`

### Task 12: Frontend — Plan step and progress checklist rendering (~5 minutes)
- **Files**: `frontend/src/components/agent/AgentStepFeed.jsx` (modify)
- **Intent**:
  1. Add `StepIcon` case for `type === "plan"`:
     - Purple clipboard icon
  2. In the step rendering section of `AgentStepFeedInner`, add a case for plan steps:
     ```jsx
     if (step.type === "plan") {
       return (
         <div key={i} style={stepContainer}>
           <StepIcon type="plan" />
           <div>
             <div style={{ fontSize: "12px", color: TOKENS.text.primary, fontWeight: 600 }}>
               Plan
             </div>
             <div style={{ fontSize: "11px", color: TOKENS.text.secondary, marginTop: "4px" }}>
               {step.content}
             </div>
             {step.tool_input && Array.isArray(step.tool_input) && (
               <div style={{ marginTop: "6px" }}>
                 {step.tool_input.map((task, j) => {
                   const isCompleted = /* check against progress.completed */;
                   return (
                     <div key={j} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", padding: "2px 0" }}>
                       <span style={{ color: isCompleted ? TOKENS.success : TOKENS.text.muted }}>
                         {isCompleted ? "✓" : "○"}
                       </span>
                       <span style={{ color: isCompleted ? TOKENS.text.secondary : TOKENS.text.primary }}>
                         {task.title || task}
                       </span>
                     </div>
                   );
                 })}
               </div>
             )}
           </div>
         </div>
       );
     }
     ```
  3. Add `StepIcon` case for `type === "budget_extension"` (amber icon, small text showing new budget).
- **Invariants**: None (UI only)
- **Assumptions**: None new
- **Test**: Trigger a dashboard creation query → verify plan checklist appears in AgentStepFeed with items updating as tasks complete
- **Commit**: `feat(frontend): render plan checklist and progress in AgentStepFeed`

### Task 13: Sliding context compaction for long runs (~5 minutes)
- **Files**: `backend/agent_engine.py` (modify)
- **Intent**:
  1. In the main `while True` loop in `_run_inner`, after processing each tool result and before the next `_check_guardrails()`, check if context is getting large:
     ```python
     if self._tool_calls > 0 and self._tool_calls % 6 == 0:
         self._compact_tool_context(messages)
     ```
  2. Add `_compact_tool_context(self, messages)` method:
     - Scans messages for tool_result entries older than the last 2 tool calls
     - Replaces verbose tool_result content with 1-line summaries (e.g., `"[Tool result: found 5 tables]"`, `"[Tool result: query returned 47 rows]"`, `"[Tool result: tile 'Revenue' created]"`)
     - Preserves the message structure (role + content array) so Anthropic API format is maintained
     - Never compacts the progress log or schema context (only tool results)
  3. This directly mitigates R1 (token overflow on large dashboard builds).
- **Invariants**: Invariant-4 (compaction must not remove security-relevant context)
- **Assumptions**: Tool result summaries are sufficient for Claude to maintain coherence
- **Test**: Manual — run a 10+ tool call query, verify messages list doesn't grow unbounded (add debug log of message count)
- **Commit**: `feat(agent): sliding context compaction for long multi-tile runs`

### Task 14: Audit trail integration for budget extensions (~3 minutes)
- **Files**: `backend/agent_engine.py` (modify), `backend/audit_trail.py` (modify if needed)
- **Intent**:
  1. In `_check_guardrails`, when budget auto-extends, log to audit trail:
     ```python
     from audit_trail import log_tier_decision
     log_tier_decision(
         conn_id=getattr(self.connection_entry, 'conn_id', ''),
         question_hash=hashlib.sha256(self._progress.get("goal", "").encode()).hexdigest()[:16],
         event_type="budget_extension",
         old_budget=old,
         new_budget=self._max_tool_calls,
         tool_calls_so_far=self._tool_calls,
         session_id=self.memory.chat_id,
     )
     ```
  2. If `log_tier_decision` doesn't accept arbitrary kwargs, add a general `log_agent_event()` function to `audit_trail.py` that writes to the same JSONL file with `event_type` discrimination.
- **Invariants**: Invariant-7 (budget extensions logged)
- **Assumptions**: audit_trail.py log function accepts extra fields — UNVALIDATED
- **Test**: Trigger a budget extension (long query), then `python -c "from audit_trail import get_recent_decisions; evts = [d for d in get_recent_decisions(20) if 'budget' in str(d)]; print(len(evts), 'events'); assert len(evts) > 0"` → expects `N events`
- **Invariant-Check**: Verify each extension event has `old_budget`, `new_budget`, `session_id` fields
- **Commit**: `feat(agent): log budget extensions to audit trail`

### Task 15: Integration test — end-to-end dashboard build (~5 minutes)
- **Files**: No code changes — manual integration testing
- **Intent**:
  1. Start backend + frontend
  2. Open agent panel with a BigQuery connection
  3. Type "Create a dashboard showing my top data insights"
  4. Verify: plan step appears → tile menu presented via ask_user → select tiles → agent builds all selected tiles → session appears in history
  5. Close and reopen browser → verify session loads from history
  6. If agent hit budget limit on a long build, verify "Continue" button works
  7. Check SQLite DB: `sqlite3 backend/.data/agent_sessions.db "SELECT chat_id, title, length(steps_json) FROM sessions;"`
- **Invariants**: All (integration verification)
- **Test**: All success criteria from UFSD must pass
- **Commit**: No commit — this is verification

## Scope Validation
Tasks in scope: Task 1-14 (all directly mapped to UFSD scope items)
Task 15 is verification, not code change.
Tasks flagged: none — no scope deviations detected

## Counterfactual Gate
**Counterfactual**: "The strongest argument against this plan is FM-2 (progress tracker divergence) — if SQLite write fails after a tile is created, the 'continue' feature will re-create that tile, producing duplicates on the dashboard. This is a data integrity issue that could embarrass during a demo."
**Acceptance**: "We accept because: (1) SQLite with WAL + busy_timeout has extremely high write reliability on a single-user demo setup, (2) `create_dashboard_tile` is idempotent by title — if a tile with the same title already exists, the dashboard handler can detect and skip it (verify in implementation), and (3) even if a duplicate is created, it's a cosmetic issue (extra tile) not a data loss issue. The alternative (two-phase commit with rollback) would add 2+ days of complexity for a scenario that requires simultaneous SQLite failure + SSE disconnect, which is extraordinarily unlikely."
> Impact estimates are REASONED, not PROVEN — assumption chain: [SQLite WAL reliability on Windows] → [single concurrent writer] → [busy_timeout handles contention] → [failure probability < 0.01% per write].

## MVP-Proof
Claims about performance or scalability: "Agent can handle 15+ tile dashboard builds without context degradation" → Evidence: sliding compaction (Task 13) keeps context under ~15K tokens by summarizing old tool results. Claude Sonnet 4.5 has 200K context window. 15K is 7.5% of capacity. Assumption chain: [6 tool calls per compaction cycle] × [~2.5K tokens per tool result] = [~15K tokens before compaction] → [compacted to ~2K] → [net growth ~2K per 6 calls] → [at 60 calls: ~20K tokens total, well within limits].

## Fingerprint
Agent system supports unlimited-tile dashboard builds with SQLite-persisted sessions, structured progress tracking, auto-extending tool budgets, dialect-aware SQL, Claude Code-style session history, and continue/resume capability.
