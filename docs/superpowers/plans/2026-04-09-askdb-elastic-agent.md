# AskDB Elastic Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 120s hard timeout with per-phase elastic budgets, add Claude Code-style progress UI, smart verification with confidence scoring, and first-class cancel support.

**Architecture:** The agent loop in `agent_engine.py` gets phase-aware timing (replacing the single wall-clock), emits new SSE step types (`checklist_update`, `phase_start`, `phase_complete`, `progress_estimate`) consumed by an enhanced `AgentStepFeed.jsx`. A post-answer verification pass on complex queries compares the agent's claims against actual data. Cancel is wired through existing primitives (`_cancelled` flag, `streamRef.close()`, new cancel endpoint).

**Tech Stack:** Python 3.10+ / FastAPI / Anthropic SDK / React 19 / Zustand / SSE

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `backend/config.py` | Add phase timeout settings, concurrency cap |
| Modify | `backend/agent_engine.py` | Phase-aware guardrails, progress emission, verification pass |
| Modify | `backend/routers/agent_routes.py` | Cancel endpoint, concurrency enforcement |
| Modify | `backend/db_connector.py` | (No changes needed — timeout param already wired) |
| Modify | `frontend/src/components/agent/AgentStepFeed.jsx` | Render checklist, phase badges, ETA, cancel |
| Modify | `frontend/src/components/agent/AgentPanel.jsx` | Cancel button UI |
| Modify | `frontend/src/store.js` | New agent state fields |

No new files needed — all changes fit within existing modules.

---

### Task 1: Add Phase Timeout Config

**Files:**
- Modify: `backend/config.py` (after line ~50, in Settings class)

- [ ] **Step 1: Add phase timeout settings to config.py**

In `backend/config.py`, add these fields to the `Settings` class after the existing `MAX_TOKENS` field:

```python
    # ── Agent Phase Timeouts ──────────────────────────────────────
    AGENT_PHASE_PLANNING: int = Field(default=30, description="Planning phase budget (seconds)")
    AGENT_PHASE_SCHEMA: int = Field(default=60, description="Schema discovery budget (seconds)")
    AGENT_PHASE_SQL_GEN: int = Field(default=30, description="SQL generation budget (seconds)")
    AGENT_PHASE_DB_EXEC: int = Field(default=300, description="DB execution budget (seconds)")
    AGENT_PHASE_VERIFY: int = Field(default=30, description="Verification pass budget (seconds)")
    AGENT_SESSION_HARD_CAP: int = Field(default=1800, description="Absolute session cap (seconds)")
    AGENT_MAX_CONCURRENT_PER_USER: int = Field(default=2, description="Max concurrent agent sessions per user")
```

- [ ] **Step 2: Verify config loads correctly**

Run: `cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1/backend" && python -c "from config import settings; print(settings.AGENT_PHASE_DB_EXEC, settings.AGENT_MAX_CONCURRENT_PER_USER)"`

Expected output: `300 2`

- [ ] **Step 3: Commit**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git add backend/config.py
git commit -m "feat: add agent phase timeout and concurrency config"
```

---

### Task 2: Replace Wall-Clock with Phase-Aware Guardrails

**Files:**
- Modify: `backend/agent_engine.py` (lines 310-327, 458-459, 753-797)

- [ ] **Step 1: Add phase tracking to AgentStep dataclass**

At line 327 of `agent_engine.py`, add these fields to the `AgentStep` dataclass:

```python
    # Phase tracking fields
    phase: Optional[str] = None              # "planning", "schema", "sql_gen", "db_exec", "verify", "thinking"
    step_number: Optional[int] = None        # Current step in checklist (1-based)
    total_steps: Optional[int] = None        # Total steps estimated
    elapsed_ms: Optional[int] = None         # Elapsed time in this phase
    estimated_total_ms: Optional[int] = None # Estimated total time
    checklist: Optional[list] = None         # [{"label": str, "status": "done"|"active"|"pending"}]
```

- [ ] **Step 2: Replace timeout constants**

Replace lines 458-459:

```python
WALL_CLOCK_LIMIT = 120
ABSOLUTE_WALL_CLOCK_LIMIT = 900
```

With:

```python
# Phase-aware timeouts (from config)
PHASE_LIMITS = {
    "planning": settings.AGENT_PHASE_PLANNING,     # 30s
    "schema": settings.AGENT_PHASE_SCHEMA,          # 60s
    "sql_gen": settings.AGENT_PHASE_SQL_GEN,        # 30s
    "db_exec": settings.AGENT_PHASE_DB_EXEC,        # 300s
    "verify": settings.AGENT_PHASE_VERIFY,          # 30s
    "thinking": 60,                                  # LLM call fallback
}
SESSION_HARD_CAP = settings.AGENT_SESSION_HARD_CAP  # 1800s (30 min)
# Legacy constants kept for compatibility
WALL_CLOCK_LIMIT = 600       # Raised from 120s — soft per-segment cap
ABSOLUTE_WALL_CLOCK_LIMIT = settings.AGENT_SESSION_HARD_CAP
```

- [ ] **Step 3: Add phase tracking state to AgentEngine.__init__**

After `self._progress` initialization (~line 571), add:

```python
        # Phase tracking
        self._current_phase: str = "thinking"
        self._phase_start_time: float = 0.0
        self._step_number: int = 0
        self._checklist: list = []
```

- [ ] **Step 4: Add phase management methods**

After `_check_guardrails()` method (~line 797), add:

```python
    def _start_phase(self, phase: str, label: str = "") -> AgentStep:
        """Start a new execution phase and emit a checklist update."""
        self._current_phase = phase
        self._phase_start_time = time.monotonic()
        self._step_number += 1

        # Update checklist
        for item in self._checklist:
            if item["status"] == "active":
                item["status"] = "done"
        self._checklist.append({"label": label or phase, "status": "active"})

        step = AgentStep(
            type="phase_start",
            phase=phase,
            content=label or f"Phase: {phase}",
            step_number=self._step_number,
            total_steps=len(self._checklist) + self._pending_phase_count(),
            elapsed_ms=int((time.monotonic() - self._absolute_start_time) * 1000),
        )
        self._steps.append(step)
        return step

    def _complete_phase(self) -> AgentStep:
        """Complete the current phase and emit phase_complete."""
        duration_ms = int((time.monotonic() - self._phase_start_time) * 1000)
        for item in self._checklist:
            if item["status"] == "active":
                item["status"] = "done"

        step = AgentStep(
            type="phase_complete",
            phase=self._current_phase,
            content=f"Completed: {self._current_phase}",
            elapsed_ms=duration_ms,
        )
        self._steps.append(step)
        return step

    def _emit_checklist(self) -> AgentStep:
        """Emit current checklist state for frontend rendering."""
        elapsed = int((time.monotonic() - self._absolute_start_time) * 1000)
        estimated = self._estimate_total_ms()
        step = AgentStep(
            type="checklist_update",
            content="Progress update",
            checklist=list(self._checklist),
            elapsed_ms=elapsed,
            estimated_total_ms=estimated,
            step_number=self._step_number,
            total_steps=len(self._checklist),
        )
        self._steps.append(step)
        return step

    def _estimate_total_ms(self) -> int:
        """Heuristic ETA based on question complexity and progress."""
        base = 5000
        q = self._progress.get("goal", "").lower()
        if any(kw in q for kw in ("join", "across", "between", "compare")):
            base += 10000
        if any(kw in q for kw in ("trend", "over time", "group by", "aggregate")):
            base += 5000
        if any(kw in q for kw in ("dashboard", "tile", "create")):
            base += 30000
        # Adjust based on actual progress
        if self._step_number > 0 and self._checklist:
            done = sum(1 for c in self._checklist if c["status"] == "done")
            total = len(self._checklist)
            if done > 0 and total > 0:
                elapsed = (time.monotonic() - self._absolute_start_time) * 1000
                base = int(elapsed * total / done)
        return base

    def _pending_phase_count(self) -> int:
        """Estimate remaining phases for total_steps."""
        pending = sum(1 for c in self._checklist if c["status"] == "pending")
        return max(pending, 2)  # At least 2 steps remaining
```

- [ ] **Step 5: Update _check_guardrails to be phase-aware**

Replace the existing `_check_guardrails()` method (lines 753-797) with:

```python
    def _check_guardrails(self):
        """Raise if any guardrail is exceeded. Phase-aware budgets."""
        if self.memory._cancelled:
            raise AgentGuardrailError("Session cancelled by user")

        # Tool budget (unchanged — auto-extend logic stays)
        if self._tool_calls >= self._max_tool_calls:
            if self._max_tool_calls < self.MAX_TOOL_CALLS:
                old_budget = self._max_tool_calls
                self._max_tool_calls = min(self._max_tool_calls + 10, self.MAX_TOOL_CALLS)
                logger.info(f"Tool budget auto-extended: {old_budget} → {self._max_tool_calls}")
                ext_step = AgentStep(type="budget_extension",
                                     content=f"Tool budget extended to {self._max_tool_calls}")
                self._steps.append(ext_step)
            else:
                raise AgentGuardrailError(
                    f"Maximum tool calls ({self.MAX_TOOL_CALLS}) exceeded"
                )

        # Per-phase timeout (soft — warns, doesn't kill for db_exec)
        if self._phase_start_time > 0:
            phase_elapsed = time.monotonic() - self._phase_start_time
            phase_limit = self.PHASE_LIMITS.get(self._current_phase, 60)
            if phase_elapsed > phase_limit and self._current_phase != "db_exec":
                raise AgentGuardrailError(
                    f"Phase '{self._current_phase}' exceeded {phase_limit}s budget"
                )

        # Per-segment wall-clock (raised to 600s)
        elapsed = time.monotonic() - self._start_time
        if elapsed > self.WALL_CLOCK_LIMIT:
            raise AgentGuardrailError(
                f"Wall-clock timeout ({self.WALL_CLOCK_LIMIT}s) exceeded"
            )

        # Absolute session cap (1800s = 30 min)
        absolute_elapsed = time.monotonic() - self._absolute_start_time
        if absolute_elapsed > self.ABSOLUTE_WALL_CLOCK_LIMIT:
            raise AgentGuardrailError(
                f"Session time limit ({self.ABSOLUTE_WALL_CLOCK_LIMIT}s) exceeded"
            )
```

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git add backend/agent_engine.py
git commit -m "feat: phase-aware timeout guardrails replacing 120s wall-clock"
```

---

### Task 3: Emit Progress Steps in Agent Loop

**Files:**
- Modify: `backend/agent_engine.py` (in `_run_inner()` method, lines ~1079-1396)

- [ ] **Step 1: Build initial checklist at start of _run_inner**

After the tool budget heuristic (~line 1096), add:

```python
        # Build initial checklist
        self._checklist = [
            {"label": "Understanding question", "status": "active"},
            {"label": "Finding relevant tables", "status": "pending"},
            {"label": "Generating SQL", "status": "pending"},
            {"label": "Executing query", "status": "pending"},
            {"label": "Analyzing results", "status": "pending"},
        ]
        if is_complex or is_dashboard_request:
            self._checklist.insert(1, {"label": "Planning approach", "status": "pending"})
            self._checklist.append({"label": "Verifying answer", "status": "pending"})

        self._step_number = 1
        yield self._emit_checklist()
```

- [ ] **Step 2: Emit phase transitions around tool calls**

In the tool execution section of the main loop (~line 1280), wrap tool calls with phase tracking. Before the tool dispatch:

```python
                # Emit phase based on tool name
                phase_map = {
                    "find_relevant_tables": ("schema", "Finding relevant tables..."),
                    "inspect_schema": ("schema", "Inspecting table schema..."),
                    "run_sql": ("db_exec", "Executing query..."),
                    "suggest_chart": ("thinking", "Choosing visualization..."),
                    "summarize_results": ("thinking", "Analyzing results..."),
                    "ask_user": ("thinking", "Waiting for your input..."),
                    "create_dashboard_tile": ("thinking", "Creating dashboard tile..."),
                    "update_dashboard_tile": ("thinking", "Updating dashboard tile..."),
                    "delete_dashboard_tile": ("thinking", "Removing dashboard tile..."),
                    "list_dashboards": ("thinking", "Checking dashboards..."),
                    "get_dashboard_tiles": ("thinking", "Loading dashboard tiles..."),
                }
                phase, label = phase_map.get(tool_name, ("thinking", f"Using {tool_name}..."))
                yield self._start_phase(phase, label)
```

After the tool result is obtained, add:

```python
                yield self._complete_phase()
                yield self._emit_checklist()
```

- [ ] **Step 3: Pass timeout to run_sql**

In `_tool_run_sql()` (~line 1605), change:

```python
df = self.engine.db.execute_query(exec_sql)
```

To:

```python
db_timeout = settings.AGENT_PHASE_DB_EXEC
df = self.engine.db.execute_query(exec_sql, timeout=db_timeout)
```

- [ ] **Step 4: Emit planning phase**

Before the planning call (~line 1175), wrap it:

```python
        if (is_dashboard_request or is_complex) and not self._progress.get("completed"):
            yield self._start_phase("planning", "Planning approach...")
            plan = self._generate_plan(question, prefetch_context)
            yield self._complete_phase()
            if plan:
                # ... existing plan step emission ...
```

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git add backend/agent_engine.py
git commit -m "feat: emit phase progress steps in agent loop"
```

---

### Task 4: Add Cancel Endpoint and Concurrency Cap

**Files:**
- Modify: `backend/routers/agent_routes.py`

- [ ] **Step 1: Add concurrency tracking dict**

After `_sessions_lock` (~line 39), add:

```python
_active_agents: dict[str, int] = {}  # email -> count of active sessions
_active_agents_lock = threading.Lock()
```

- [ ] **Step 2: Add cancel endpoint**

After the `/respond` endpoint (~line 282), add:

```python
@router.post("/cancel/{chat_id}")
async def agent_cancel(chat_id: str, request: Request):
    """Cancel a running agent session."""
    email = request.state.user_email
    with _sessions_lock:
        session = _sessions.get(chat_id)
    if not session:
        raise HTTPException(404, "Session not found")
    with session._lock:
        if session._owner != email:
            raise HTTPException(403, "Not your session")
        session._cancelled = True
    return {"status": "cancelled", "chat_id": chat_id}
```

- [ ] **Step 3: Add concurrency check to agent_run**

At the start of `agent_run()` (~line 110), after auth validation, add:

```python
    # Enforce per-user concurrency cap
    max_concurrent = settings.AGENT_MAX_CONCURRENT_PER_USER
    with _active_agents_lock:
        current = _active_agents.get(email, 0)
        if current >= max_concurrent:
            raise HTTPException(
                429,
                f"Maximum {max_concurrent} concurrent agent sessions. "
                "Please wait for a running query to complete or cancel it."
            )
        _active_agents[email] = current + 1
```

In the `event_generator()` finally block (~line 230), add cleanup:

```python
        finally:
            with _active_agents_lock:
                count = _active_agents.get(email, 1)
                if count <= 1:
                    _active_agents.pop(email, None)
                else:
                    _active_agents[email] = count - 1
```

- [ ] **Step 4: Commit**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git add backend/routers/agent_routes.py
git commit -m "feat: cancel endpoint + per-user concurrency cap (max 2)"
```

---

### Task 5: Smart Verification Pass

**Files:**
- Modify: `backend/agent_engine.py` (add verification method, call it before final result)

- [ ] **Step 1: Add complexity detection helper**

After `_pending_phase_count()` method, add:

```python
    def _needs_verification(self, question: str) -> bool:
        """Determine if the query result needs a verification pass."""
        q = question.lower()
        # Complex patterns that benefit from verification
        complex_signals = [
            "join", "left join", "right join", "inner join", "cross join",
            "subquery", "exists", "in (select",
            "group by", "having",
            "over (", "partition by", "row_number", "rank(",
            "compare", "difference", "vs", "versus",
        ]
        if any(sig in q for sig in complex_signals):
            return True
        # 3+ tool calls indicates multi-step reasoning
        if self._tool_calls >= 3:
            return True
        return False
```

- [ ] **Step 2: Add verification method**

```python
    def _verify_answer(self, question: str, answer: str, last_sql_result: str) -> AgentStep:
        """Verify the agent's answer against the actual query results.
        Returns a step with confidence badge info.
        """
        verify_prompt = f"""You are a data verification assistant. Compare the following answer against the actual query results.

QUESTION: {question}

ANSWER GIVEN:
{answer}

ACTUAL QUERY RESULTS (raw data):
{last_sql_result[:3000]}

Check each factual claim in the answer:
1. Are all numbers accurate (within rounding)?
2. Are comparisons correct (higher/lower, more/less)?
3. Are trend descriptions accurate?
4. Are any claims made that aren't supported by the data?

Respond with EXACTLY this JSON format:
{{"confidence": "HIGH" | "MEDIUM" | "LOW", "verified_claims": ["list of verified claims"], "issues": ["list of issues found, empty if none"], "summary": "one sentence verification summary"}}
"""
        try:
            response = self.provider.complete(
                model=self.primary_model,
                system="You are a precise data verification assistant. Return only valid JSON.",
                messages=[{"role": "user", "content": verify_prompt}],
                max_tokens=500,
            )
            # Parse response
            import json as json_mod
            text = response.content if hasattr(response, 'content') else str(response)
            # Extract JSON from response
            start = text.find('{')
            end = text.rfind('}') + 1
            if start >= 0 and end > start:
                result = json_mod.loads(text[start:end])
            else:
                result = {"confidence": "MEDIUM", "summary": "Could not parse verification result", "issues": [], "verified_claims": []}
        except Exception as e:
            logger.warning(f"Verification failed: {e}")
            result = {"confidence": "MEDIUM", "summary": "Verification unavailable", "issues": [], "verified_claims": []}

        confidence = result.get("confidence", "MEDIUM")
        return AgentStep(
            type="verification",
            content=result.get("summary", ""),
            tool_input=result,  # Full verification details for UI
            phase="verify",
        )
```

- [ ] **Step 3: Wire verification into the main loop**

Before the final result step is yielded (~line 1444), add:

```python
        # Verification pass for complex queries
        if self._needs_verification(question):
            yield self._start_phase("verify", "Verifying answer...")
            # Find the last run_sql result
            last_sql_result = ""
            for s in reversed(self._steps):
                if s.tool_name == "run_sql" and s.tool_result:
                    last_sql_result = str(s.tool_result)[:3000]
                    break
            if last_sql_result and final_answer:
                verify_step = self._verify_answer(question, final_answer, last_sql_result)
                yield verify_step
            yield self._complete_phase()
            yield self._emit_checklist()
```

- [ ] **Step 4: Commit**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git add backend/agent_engine.py
git commit -m "feat: smart verification pass with confidence scoring"
```

---

### Task 6: Frontend — Render Checklist and Progress

**Files:**
- Modify: `frontend/src/store.js` (add new state fields)
- Modify: `frontend/src/components/agent/AgentStepFeed.jsx` (render new step types)

- [ ] **Step 1: Add store state for checklist and verification**

In `store.js`, after `agentTierInfo` (~line 205), add:

```javascript
    agentChecklist: [],           // [{label, status}] — Claude Code-style task list
    agentPhase: null,             // Current phase name
    agentElapsedMs: 0,            // Total elapsed
    agentEstimatedMs: 0,          // ETA
    agentVerification: null,      // {confidence, summary, issues, verified_claims}
```

Add actions after `setAgentTierInfo` (~line 271):

```javascript
    setAgentChecklist: (checklist) => set({ agentChecklist: checklist }),
    setAgentPhase: (phase) => set({ agentPhase: phase }),
    setAgentElapsedMs: (ms) => set({ agentElapsedMs: ms }),
    setAgentEstimatedMs: (ms) => set({ agentEstimatedMs: ms }),
    setAgentVerification: (v) => set({ agentVerification: v }),
```

In `clearAgent()` (~line 250), add resets:

```javascript
        agentChecklist: [],
        agentPhase: null,
        agentElapsedMs: 0,
        agentEstimatedMs: 0,
        agentVerification: null,
```

- [ ] **Step 2: Handle new step types in addAgentStep**

In `addAgentStep` (~line 241), add handling for new types:

```javascript
    addAgentStep: (step) => set((state) => {
      const newSteps = [...state.agentSteps, step];
      const updates = { agentSteps: newSteps };

      if (step.type === "cached_result") {
        updates.dualResponseActive = true;
        updates.cachedResultStep = step;
      }
      if (step.type === "checklist_update" && step.checklist) {
        updates.agentChecklist = step.checklist;
        if (step.elapsed_ms != null) updates.agentElapsedMs = step.elapsed_ms;
        if (step.estimated_total_ms != null) updates.agentEstimatedMs = step.estimated_total_ms;
      }
      if (step.type === "phase_start") {
        updates.agentPhase = step.phase;
      }
      if (step.type === "phase_complete") {
        updates.agentPhase = null;
      }
      if (step.type === "verification") {
        updates.agentVerification = step.tool_input;
      }

      return updates;
    }),
```

- [ ] **Step 3: Add checklist renderer to AgentStepFeed.jsx**

At the top of the component, add a `ChecklistPanel` section that renders above the step feed:

```jsx
function ChecklistPanel({ checklist, elapsedMs, estimatedMs, phase }) {
  if (!checklist || checklist.length === 0) return null;
  const pct = estimatedMs > 0 ? Math.min(100, (elapsedMs / estimatedMs) * 100) : 0;
  const etaSeconds = estimatedMs > 0 ? Math.max(0, Math.round((estimatedMs - elapsedMs) / 1000)) : null;

  return (
    <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
      {/* Progress bar */}
      <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.08)', marginBottom: 10, overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: 2, background: '#22c55e', width: `${pct}%`, transition: 'width 0.5s ease' }} />
      </div>

      {/* Checklist items */}
      {checklist.map((item, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', fontSize: 13 }}>
          {item.status === 'done' && <span style={{ color: '#22c55e' }}>&#10003;</span>}
          {item.status === 'active' && <span className="animate-pulse" style={{ color: '#f59e0b' }}>&#9679;</span>}
          {item.status === 'pending' && <span style={{ color: 'rgba(255,255,255,0.25)' }}>&#9675;</span>}
          <span style={{ color: item.status === 'done' ? 'rgba(255,255,255,0.5)' : item.status === 'active' ? '#f59e0b' : 'rgba(255,255,255,0.35)' }}>
            {item.label}
          </span>
        </div>
      ))}

      {/* ETA */}
      {etaSeconds != null && etaSeconds > 0 && (
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 6 }}>
          ~{etaSeconds}s remaining
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Add verification badge renderer**

Add after the `ChecklistPanel`:

```jsx
function VerificationBadge({ verification }) {
  if (!verification) return null;
  const colors = { HIGH: '#22c55e', MEDIUM: '#f59e0b', LOW: '#ef4444' };
  const icons = { HIGH: '✓', MEDIUM: 'ℹ', LOW: '⚠' };
  const labels = {
    HIGH: 'Verified against data',
    MEDIUM: 'Partially verified',
    LOW: 'Discrepancy detected — review data',
  };
  const c = verification.confidence || 'MEDIUM';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', marginTop: 8,
      borderRadius: 8, border: `1px solid ${colors[c]}33`, background: `${colors[c]}0d`,
    }}>
      <span style={{ fontSize: 16, color: colors[c] }}>{icons[c]}</span>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: colors[c] }}>{c} Confidence</div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>{labels[c]}</div>
        {verification.summary && (
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>{verification.summary}</div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Wire ChecklistPanel into AgentStepFeed**

In the main `AgentStepFeed` component, add at the top of the return, before the steps map:

```jsx
  const { agentChecklist, agentElapsedMs, agentEstimatedMs, agentPhase, agentVerification, agentLoading } = useStore();

  return (
    <div>
      {agentLoading && (
        <ChecklistPanel
          checklist={agentChecklist}
          elapsedMs={agentElapsedMs}
          estimatedMs={agentEstimatedMs}
          phase={agentPhase}
        />
      )}
      {/* Existing steps.map(...) */}
```

After the final `result` step rendering, add:

```jsx
      {step.type === "result" && agentVerification && (
        <VerificationBadge verification={agentVerification} />
      )}
```

- [ ] **Step 6: Add rendering for new step types in the step map**

Add handlers for `phase_start`, `phase_complete`, `checklist_update`, and `verification` step types. These are consumed by the store (via `addAgentStep` updates) and don't need their own visual rendering in the feed — they drive the `ChecklistPanel` above. Add a filter to hide them from the feed:

```jsx
      // Skip steps that drive the checklist panel (rendered above)
      if (["phase_start", "phase_complete", "checklist_update"].includes(step.type)) return null;

      // Verification badge rendered inline after result
      if (step.type === "verification") return null;
```

- [ ] **Step 7: Commit**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git add frontend/src/store.js frontend/src/components/agent/AgentStepFeed.jsx
git commit -m "feat: Claude Code-style checklist + verification badge UI"
```

---

### Task 7: Cancel Button in Agent Panel

**Files:**
- Modify: `frontend/src/components/agent/AgentPanel.jsx`
- Modify: `frontend/src/api.js` (add cancel API call)

- [ ] **Step 1: Add cancel API function**

In `frontend/src/api.js`, add after the existing `agentRespond` function:

```javascript
export async function agentCancel(chatId) {
  const res = await apiFetch(`/api/v1/agent/cancel/${chatId}`, { method: 'POST' });
  if (!res.ok) throw new Error('Cancel failed');
  return res.json();
}
```

- [ ] **Step 2: Add cancel button to AgentPanel header**

In `AgentPanel.jsx`, find the header area (~line 179) where the close button is. Before the close button, add a cancel button that only shows during loading:

```jsx
{agentLoading && agentChatId && (
  <button
    onClick={async () => {
      try {
        await api.agentCancel(agentChatId);
      } catch (e) { /* ignore */ }
      if (streamRef.current?.close) streamRef.current.close();
      setAgentLoading(false);
      clearAgentWaiting();
    }}
    style={{
      background: '#ef4444', color: '#fff', border: 'none', borderRadius: 6,
      padding: '4px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
      marginRight: 8,
    }}
  >
    Cancel
  </button>
)}
```

- [ ] **Step 3: Commit**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git add frontend/src/api.js frontend/src/components/agent/AgentPanel.jsx
git commit -m "feat: first-class cancel button in agent panel"
```

---

### Task 8: Update CLAUDE.md with New Architecture

**Files:**
- Modify: `QueryCopilot V1/CLAUDE.md`

- [ ] **Step 1: Update timeout documentation in CLAUDE.md**

Replace the agent guardrails constraint in Key Constraints section:

Old:
```
- **Agent guardrails** — dynamic tool budget (heuristic 8/15/20, auto-extends to 100), 120s per-segment timeout, 900s absolute, max 3 SQL retries.
```

New:
```
- **Agent guardrails** — dynamic tool budget (heuristic 8/15/20, auto-extends to 100), phase-aware timeouts (planning 30s, schema 60s, SQL gen 30s, DB exec 300s, verify 30s), 600s per-segment soft cap, 1800s session hard cap, max 3 SQL retries, per-user concurrency cap (2 active sessions). Smart verification pass on complex queries (JOINs, aggregations, 3+ tool calls) with HIGH/MEDIUM/LOW confidence scoring.
```

- [ ] **Step 2: Commit**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with elastic agent architecture"
```

---

## Verification Checklist

After all tasks are complete, verify:

1. `python -c "from config import settings; print(settings.AGENT_PHASE_DB_EXEC)"` → `300`
2. Start backend (`uvicorn main:app --reload --port 8002`) — no import errors
3. Start frontend (`npm run dev`) — no build errors
4. Run a simple query in the agent — see checklist appear with steps checking off
5. Run a complex query (with JOIN) — see verification badge appear after result
6. Click Cancel during execution — agent stops, no error
7. Open 3 agent tabs simultaneously — third should get 429 error
8. Grep: `grep -r "DataLens" backend/ frontend/src/ --include="*.py" --include="*.jsx" --include="*.js"` → zero results
