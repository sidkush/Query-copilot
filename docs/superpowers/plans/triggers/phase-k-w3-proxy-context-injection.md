# Phase K W3 — Proxy Context Injection + T2 Browser Verify

> **Paste this entire file into the first message of a new Claude Code session.**

---

## What you are doing

Two tasks, same session, in order:

1. **T2 browser verify** (~10 min) — confirm `message_delta` synthesis tokens render incrementally in the live feed. Visual check only, no code change expected.
2. **W3-P1: proxy context injection** (~30 min) — when Gate C fires and user picks `"station_proxy"`, the agent currently ignores the choice and re-runs the same rider-level SQL anyway. Fix: inject a framing note into the conversation context before the agent's next LLM call so it knows to use `member_casual` (or whatever proxy column exists) instead of a missing rider-id column.

---

## Pre-flight

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git log --oneline -5
git branch --show-current
```

Expected: top commit `c5c6271`, branch `phase-m-alt`.

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1/backend"
python -m pytest tests/ -q \
  --ignore=tests/test_bm25_adapter.py \
  --ignore=tests/test_cross_encoder_rerank.py \
  --ignore=tests/test_embedder_registry.py \
  --ignore=tests/test_ensemble_cap.py \
  --ignore=tests/test_migration_checkpoint.py \
  --ignore=tests/test_mock_anthropic_provider.py \
  --ignore=tests/test_trap_grader.py 2>&1 | tail -3
```

Expected: `2163 passed, 1 skipped`. Stop if different.

Dev servers should already be running:
- Backend: port 8002
- Frontend: port 5173 (Vite)

Check with `preview_list` tool before starting anything.

---

## Task 1 — T2 browser verify

The frontend preview server is at port 5173. Connect a BigQuery or SQLite connection (demo user works), ask any multi-step analytical question, and confirm:

- The `synthesizing` phase step appears (italic "Synthesizing analysis…" row)
- `message_delta` tokens stream in incrementally — the answer text appears word-by-word, not all at once after a blank pause
- No React console errors during streaming
- The cursor blink animation shows while streaming

Use `preview_console_logs` (level=error) after the run to confirm clean.

If streaming appears blank/silent until the full answer drops at once, that is the pre-W2 behavior — it means `W2_SYNTHESIS_STREAMING_ENFORCE` is `False` in the running `.env`. Check `backend/.env` and restart the backend if needed.

No code changes expected. If everything looks correct, note it and move to Task 2.

---

## Task 2 — W3-P1: proxy context injection

### The bug

Gate C (`backend/ambiguity_detector.py`) fires when the NL question references a rider-class entity (rider, user, customer, etc.) but the schema has no matching `*_id` column. It emits an `ask_user` SSE step with options `["station-proxy", "abort"]`.

When user picks `"station-proxy"`, the `/respond` endpoint resolves the park slot and the agent loop continues. But the agent's conversation history has no record of the user's choice — the next LLM call sees the original question with no context about the proxy decision. Result: the model re-attempts rider-level analysis, hits the same missing column, and either errors or halts.

### The fix

When `/respond` resolves a Gate C park slot with value `"station-proxy"`, inject a synthetic `tool_result`-style message into `memory` before the agent's next iteration. The message should tell the model:

- There is no per-rider identifier in this schema
- User approved using a station/region/group-level proxy instead
- The proxy column to use (derived from the schema — e.g. `member_casual`, `start_station_id`, `start_station_name`)

### Where to look

| File | What |
|------|------|
| `backend/routers/agent_routes.py` | `/respond` endpoint — resolves park slot, signals `_user_response_event`. Find where it writes the response back and the agent loop resumes. |
| `backend/agent_engine.py` | ~line 3040–3060 — where `_waiting_for_user` resolves and `tool_result` is built for the `ask_user` tool call. This is where the proxy framing note should be appended to the tool result text. |
| `backend/ambiguity_detector.py` | Gate C detector — check what metadata it attaches to the park slot (entity term, candidate proxy columns). |
| `backend/agent_park.py` | `ParkRegistry` + `ParkSlot` — check if `ParkSlot` carries metadata from the arming call. |

### Implementation approach

The cleanest injection point is in `agent_engine.py` where the `ask_user` tool result is constructed after the park resolves. When the resolved value is `"station_proxy"` AND the `kind` is `"schema_entity_mismatch"`, append to the tool result string:

```
User selected: use station/group proxy instead of per-rider identifier.
Replan instruction: this schema has no individual rider id column. Use available
proxy columns (e.g. member_casual, start_station_name, start_station_id) to
approximate rider-level analysis at station or membership-type granularity.
Do NOT attempt to join or filter on a non-existent rider_id / user_id column.
```

The proxy column list should be pulled from the Gate C detector's metadata if available, or defaulted to the generic framing above.

### TDD — write failing test first

New test file: `backend/tests/test_w3_proxy_context_injection.py`

Tests to write:
1. When `ask_user` resolves with `station_proxy` + `kind=schema_entity_mismatch`, the tool result string contains the replan instruction.
2. When `ask_user` resolves with `abort`, tool result is the abort message (no injection).
3. When `ask_user` resolves with `station_proxy` for a non-Gate-C `kind` (e.g. `ask_user` generic), no injection (injection is Gate-C-specific).
4. If proxy column metadata is available from the park slot, the column names appear in the injected text.

### Commit format

```
feat(phase-k-w3): inject proxy framing into context on station-proxy Gate C response
```

---

## Regression gate

After the proxy injection fix:

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1/backend"
python -m pytest tests/ -q \
  --ignore=tests/test_bm25_adapter.py \
  --ignore=tests/test_cross_encoder_rerank.py \
  --ignore=tests/test_embedder_registry.py \
  --ignore=tests/test_ensemble_cap.py \
  --ignore=tests/test_migration_checkpoint.py \
  --ignore=tests/test_mock_anthropic_provider.py \
  --ignore=tests/test_trap_grader.py 2>&1 | tail -3
```

Target: `2163+N passed, 1 skipped` (N = new proxy injection tests).

---

## Context: what shipped in W2 (do not redo)

- `backend/agent_park.py` — `ParkRegistry` + `ParkSlot` + `_park_for_user_response()`
- `backend/ambiguity_detector.py` — Gate C schema-entity-mismatch detector
- `backend/routers/agent_routes.py` — SSE allowlist + `/respond` endpoint wired to ParkRegistry
- `frontend/src/components/agent/SynthesisStreamingStep.jsx` — T2 streaming renderer
- `frontend/src/components/agent/ThinkingStreamStep.jsx` — T3 collapsible thinking
- `frontend/src/components/agent/AgentStepRenderer.jsx` — dispatches all W2 step types

**Test baseline:** 2163 passed, 1 skipped.  
**Branch:** `phase-m-alt`.

---

## What comes after W3-P1

- **Anchit demo prep** — connect FamApp's production BigQuery, run 5 representative fintech queries, capture step counts + latency. Separate session, after proxy fix is in.
- **W2 Day 4-5 cleanup** — flip `PARK_V2_*` flags default-on, delete legacy park shims. Trigger at `docs/superpowers/plans/triggers/phase-k-w2-day4-cleanup.md`.

---

## Key constants (do not change without updating config-defaults.md)

| Flag | Default | Purpose |
|------|---------|---------|
| `W2_SCHEMA_MISMATCH_GATE_ENFORCE` | `True` | Gate C master switch |
| `W2_GATE_C_PARK_TIMEOUT_S` | `300.0` | Gate C park wait budget; timeout → `abort` |
| `ECHO_AMBIGUITY_MANDATORY_CHOICE_MIN` | `0.7` | Gate C is mandatory (score always ≥ 0.7) |
