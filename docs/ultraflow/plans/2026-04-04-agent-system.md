# Plan: QueryCopilot Agent System (Medium Agent — Claude Tool Use)

**Spec**: `docs/ultraflow/specs/2026-04-04-agent-system.md`
**Approach**: Combined council recommendation — new `agent_engine.py` wrapping `query_engine.py`, parallel first call, strict isolation, rolling memory compaction, SSE streaming + paired POST for ask_user, dockable agent panel.
**Branch**: `master`

## Tasks

### Task 1: Create Agent Engine Core + Session Memory (~5 min)
- **Files**: `backend/agent_engine.py` (create)
- **Intent**: Create `AgentEngine` class and `SessionMemory` class. `AgentEngine` takes a `QueryEngine` instance, user email, connection entry, and `SessionMemory` as constructor args (per-request isolation). Defines 6 tools as Anthropic tool schemas in module-level `TOOL_DEFINITIONS` list: `find_relevant_tables`, `inspect_schema`, `run_sql`, `suggest_chart`, `ask_user`, `summarize_results`. Main method `run(question)` calls `self.memory.compact()` first, then loops `client.messages.create()` with `tools=TOOL_DEFINITIONS` parameter, dispatching each `tool_use` block. Guardrails: `_tool_calls` counter (max 6), `time.monotonic()` wall-clock (30s), `_sql_retries` (max 3). Haiku primary; escalates to Sonnet on single-call failure. Returns `AgentResult` dataclass with `steps: list[AgentStep]`, `final_answer`, `sql`, `columns`, `rows`, `chart_suggestion`. `SessionMemory` class stores messages list, scoped to a `chat_id`. `add_turn(role, content)` appends. `get_messages()` returns list. `compact()` — when `len(json.dumps(messages)) / 4 > 8000`, summarizes all but last 2 messages via Haiku call, replaces with single summary message. Tool dispatch stubs return `NotImplementedError` (implemented in Task 2).
- **Test**: `cd backend && python -c "from agent_engine import AgentEngine, TOOL_DEFINITIONS, SessionMemory; print(len(TOOL_DEFINITIONS), 'tools'); m = SessionMemory('test'); m.add_turn('user','hi'); print(len(m.get_messages()), 'msgs'); print('OK')"` → `6 tools`, `1 msgs`, `OK`
- **Commit**: `feat(agent): create AgentEngine core with 6-tool loop and SessionMemory`

### Task 2a: Implement Schema Tools (~4 min)
- **Files**: `backend/agent_engine.py` (modify)
- **Intent**: Implement 2 tool methods:
  1. `_tool_find_relevant_tables(question)` — queries `self.engine.schema_collection.query(query_texts=[question], n_results=8)`, extracts table names and DDL from returned documents. Returns JSON string with table summaries. ChromaDB-only, no DB round-trip.
  2. `_tool_inspect_schema(table_name)` — checks `self._schema_cache` first. If miss: gets DDL from `self.engine.db.get_schema_info()[table_name]`, fetches 5 sample rows via validated `SELECT * FROM {quoted_table} LIMIT 5`. Caches result. Returns DDL + sample rows as formatted string.
- **Test**: `cd backend && python -c "from agent_engine import AgentEngine; print('schema tools OK')"` → `schema tools OK`
- **Commit**: `feat(agent): implement find_relevant_tables and inspect_schema tools`
- **Depends on**: Task 1

### Task 2b: Implement Execution + Analysis Tools (~4 min)
- **Files**: `backend/agent_engine.py` (modify)
- **Intent**: Implement 4 tool methods:
  1. `_tool_run_sql(sql)` — validates via `self.engine.validator.validate(sql)`, executes via `self.engine.db.execute_query()`, applies `mask_dataframe()`, returns `{columns, rows[:100], row_count, error}`. Increments `self._sql_retries`; raises if > 3. If `self.auto_execute` is False, sets `self._waiting_for_user = True` and returns a pause signal.
  2. `_tool_suggest_chart(columns, sample_rows)` — single Haiku call (max 300 tokens) asking for chart type + config JSON.
  3. `_tool_ask_user(question, options)` — sets `self._waiting_for_user = True`, stores question in `self._pending_question`. Returns pause signal to the loop.
  4. `_tool_summarize_results(question, data_preview)` — single Haiku call (max 200 tokens) for NL summary.
- **Test**: `cd backend && python -c "from agent_engine import AgentEngine; print('exec tools OK')"` → `exec tools OK`
- **Commit**: `feat(agent): implement run_sql, suggest_chart, ask_user, summarize tools`
- **Depends on**: Task 1

### Task 3: Agent SSE Streaming Endpoint (~5 min)
- **Files**: `backend/routers/agent_routes.py` (create), `backend/main.py` (modify)
- **Intent**: Create new router with prefix `/api/v1/agent`. Module-level `_sessions: dict[str, SessionMemory]` with max 100 entries (LRU eviction via oldest `last_used` timestamp). Two endpoints:
  1. `POST /run` — body: `{"question": str, "conn_id": str, "chat_id": str | null}`. Resolves connection from `app.state.connections[email][conn_id]`. Creates or retrieves `SessionMemory` for chat_id. Instantiates `AgentEngine(engine, email, entry, memory)`. Returns `StreamingResponse(media_type="text/event-stream")` yielding JSON `AgentStep` objects. Step types: `thinking`, `tool_call`, `ask_user`, `result`. On `ask_user`, stream stays open waiting for `/respond`.
  2. `POST /respond` — body: `{"chat_id": str, "response": str}`. Sets `_sessions[chat_id]._user_response` and signals agent to continue.
  Register in `main.py`: add `from routers import agent_routes` to imports, add `app.include_router(agent_routes.router)`.
- **Test**: `cd backend && python -c "from routers.agent_routes import router; print(len(router.routes), 'routes'); print('OK')"` → `2 routes`, `OK`
- **Commit**: `feat(agent): add SSE streaming endpoint with ask_user paired POST`
- **Depends on**: Task 1, Task 2a, Task 2b

### Task 4: Parallel Schema Prefetch Optimization (~3 min)
- **Files**: `backend/agent_engine.py` (modify)
- **Intent**: In `AgentEngine.run()`, before entering the main tool-use loop, call `_tool_find_relevant_tables(question)` immediately. Inject the result into the system prompt as pre-loaded schema context. This eliminates 1 tool-call round-trip. Also detect simple queries (no "why", "compare", "trend" keywords) and set `self._max_tool_calls = 3` for fast path.
- **Test**: `cd backend && python -c "from agent_engine import AgentEngine; print('prefetch OK')"` → `prefetch OK`
- **Commit**: `perf(agent): parallel schema prefetch eliminates 1 round-trip per query`
- **Depends on**: Task 2a

### Task 5: Frontend Agent API + Store Slice (~4 min)
- **Files**: `frontend/src/api.js` (modify), `frontend/src/store.js` (modify)
- **Intent**:
  **api.js** — Add `agentRun(question, connId, chatId, onStep)` using fetch-based SSE to `POST /api/v1/agent/run` with auth header. Parses each SSE `data:` line as JSON, calls `onStep(step)`. Returns `{close: () => controller.abort()}`. Add `agentRespond(chatId, response)` — POST to `/api/v1/agent/respond` with JSON body.
  **store.js** — Add agent slice: `agentSteps: []`, `agentLoading: false`, `agentError: null`, `agentWaiting: null`, `addAgentStep: (step) => set(s => ({agentSteps: [...s.agentSteps, step]}))`, `clearAgent: () => set({agentSteps: [], agentLoading: false, agentError: null, agentWaiting: null})`, `setAgentWaiting: (q) => set({agentWaiting: q})`, `clearAgentWaiting: () => set({agentWaiting: null})`, `agentAutoExecute: true`, `setAgentAutoExecute: (v) => set({agentAutoExecute: v})`.
- **Test**: `cd frontend && node -e "const fs=require('fs'); const s=fs.readFileSync('src/store.js','utf8'); const a=fs.readFileSync('src/api.js','utf8'); const checks=['agentSteps','agentLoading','agentWaiting','agentAutoExecute','addAgentStep','clearAgent'].every(k=>s.includes(k)); const apiChecks=['agentRun','agentRespond','/agent/run','/agent/respond'].every(k=>a.includes(k)); console.log(checks&&apiChecks?'OK':'FAIL: missing exports')"` → `OK`
- **Commit**: `feat(agent): add agent API client and Zustand store slice`
- **Depends on**: Task 3

### Task 6: Chat Page Agent Integration (~5 min)
- **Files**: `frontend/src/pages/Chat.jsx` (modify)
- **Intent**: When user submits a question, call `api.agentRun(question, connId, chatId, onStep)` instead of `/queries/generate`. Each `AgentStep` renders in chat: `thinking` → italic dim line, `tool_call` → collapsible card (tool name + result preview), `ask_user` → inline card with buttons (calls `api.agentRespond`), `result` → final SQL + chart + summary in existing message format. Fallback: if agent endpoint returns 503/network error, fall back to existing `/queries/generate` + `/queries/execute` flow. Show streaming steps in real-time.
- **Test**: `cd frontend && npx vite build 2>&1 | tail -3` → contains `built in` with no errors
- **Commit**: `feat(agent): integrate agent streaming into chat page`
- **Depends on**: Task 5

### Task 7: Dockable Agent Panel Components (~5 min)
- **Files**: `frontend/src/components/agent/AgentPanel.jsx` (create), `frontend/src/components/agent/AgentStepFeed.jsx` (create), `frontend/src/components/agent/AgentQuestion.jsx` (create)
- **Intent**:
  **AgentPanel.jsx** — Draggable, resizable panel using mouse events (`onMouseDown` + `transform: translate`). 4 dock positions: `float`, `right`, `bottom`, `left` via header buttons. Header: title "Agent", minimize, dock buttons, close. Body: `<AgentStepFeed />`. Footer: text input + send button. Position/dock saved to `localStorage('qc_agent_panel')`. Styled with `TOKENS` from `tokens.js`. Default 380×500px, min 300×300px.
  **AgentStepFeed.jsx** — Reads `agentSteps` from `useStore()`. Renders scrollable list: `thinking` = dim italic + animated dots, `tool_call` = icon + name + expandable result, `ask_user` = highlighted `<AgentQuestion />`, `result` = answer + SQL block.
  **AgentQuestion.jsx** — Renders question text + option buttons or text input. On click/submit, calls `api.agentRespond(chatId, response)` and `store.clearAgentWaiting()`.
- **Test**: `cd frontend && npx vite build 2>&1 | tail -3` → contains `built in` with no errors
- **Commit**: `feat(agent): create dockable agent panel with step feed and question UI`
- **Depends on**: Task 5

### Task 8: Dashboard Agent Panel Integration + Progress Overlay (~5 min)
- **Files**: `frontend/src/pages/DashboardBuilder.jsx` (modify)
- **Intent**: Remove `CommandBar` import and usage. Add `import AgentPanel from "../components/agent/AgentPanel"`. Render `<AgentPanel />` as floating overlay (default dock: `right`). Wire panel submit → `api.agentRun()` with `activeConnId` and dashboard context. On agent `result` step with SQL/columns/rows: auto-create tile in active section via existing `api.addTileToSection()`. Apply `chart_suggestion` to new tile's `chartType`. **Floating progress overlay**: when `agentLoading` from store is true, render a fixed-position pill at top-center of dashboard showing current step text (e.g., "Exploring schema..."). Pill uses `TOKENS.bg.elevated` background, `TOKENS.accent` text, `position: fixed`, `top: 16px`, `z-index: 9999`.
- **Test**: `cd frontend && npx vite build 2>&1 | tail -3` → contains `built in` with no errors
- **Commit**: `feat(agent): integrate dockable agent panel + progress overlay into dashboard`
- **Depends on**: Task 6, Task 7

### Task 9: Auto-Execute Toggle in Settings (~3 min)
- **Files**: `frontend/src/components/dashboard/SettingsModal.jsx` (modify), `backend/routers/user_routes.py` (modify)
- **Intent**: **Frontend**: Add "Auto-execute SQL queries" toggle in SettingsModal. Reads `agentAutoExecute` from `useStore()`, calls `setAgentAutoExecute()` on change. Sends preference to backend via `api.updateProfile({agent_auto_execute: value})`. **Backend**: In `user_routes.py` PATCH `/profile` handler, accept `agent_auto_execute: bool` field, persist in profile JSON. Load on startup and return in GET `/profile` response. Default: `true`.
- **Test**: `cd backend && python -c "import py_compile; py_compile.compile('routers/user_routes.py', doraise=True); print('OK')"` → `OK`
- **Commit**: `feat(agent): add auto-execute SQL toggle in user settings`
- **Depends on**: Task 5

## Task Dependency Graph
```
Task 1 (core + memory) ──┬──→ Task 2a (schema tools) ──→ Task 4 (parallel opt)
                          ├──→ Task 2b (exec tools)
                          └──→ Task 3 (SSE endpoint) [depends on 2a, 2b]
                                   └──→ Task 5 (frontend API + store)
                                            ├──→ Task 6 (chat integration)
                                            ├──→ Task 7 (panel components)
                                            ├──→ Task 9 (settings)
                                            └──→ Task 8 (dashboard) [depends on 6 + 7]
```

**Parallel groups:**
- Group A: Tasks 2a + 2b (different tool sets, same file but non-overlapping sections)
- Group B: Tasks 6, 7, 9 (independent frontend files after Task 5)
- Task 4 can run after 2a, parallel with 2b and 3

## Fingerprint
Backend has `agent_engine.py` with `AgentEngine` (6-tool Claude tool-use loop, 30s timeout, 6 call max, Haiku/Sonnet) + `SessionMemory` (8K auto-compaction, scoped to chat_id) + parallel schema prefetch. New `routers/agent_routes.py` with `/api/v1/agent/run` SSE + `/api/v1/agent/respond` POST registered in `main.py`. Frontend has dockable `AgentPanel` in `components/agent/` replacing dashboard `CommandBar`, agent streaming in `Chat.jsx`, floating progress overlay in `DashboardBuilder.jsx`, auto-execute toggle in `SettingsModal.jsx`, agent slice in `store.js`. All tools wrap existing pipeline — no new DB access paths, read-only enforcement unchanged.
