# Phase K W2 — Day 4 Flag Flip + Day 5 Cleanup (Next Session Trigger)

> **Paste this entire file into the first message of a new Claude Code session.**

---

## Context

This is a continuation of the Phase K Week-2 grounding + streaming UX work
for **AskDB (QueryCopilot V1)**. The previous session completed all four W2
feature tasks and a NaN hotfix. Two plan steps remain before W2 can be tagged
complete: flip the `PARK_V2_*` feature flags to default-on and delete the
legacy park shims.

**Branch:** `phase-m-alt`
**Working dir:** `C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1`
**Active model preference:** user switched to `claude-sonnet-4-6` mid-session
(`/model claude-sonnet-4-6`). Resume with that unless user changes it.

---

## What shipped (DO NOT redo)

| Commit | What |
|--------|------|
| `cfa182c` | Day 1 — `backend/agent_park.py` `ParkRegistry` + `ParkSlot` + `_park_for_user_response()` + race harness (shadow mode) |
| `0ab8ca8` | T1 — Ring 4 Gate C schema-entity-mismatch consent card (`ambiguity_detector.py`) |
| `a0a6566` | T1 fix — `W2_GATE_C_PARK_TIMEOUT_S=300` dedicated park timeout |
| `016b22d` | T1 fix — arm ParkRegistry slot BEFORE yielding SSE step (arm-before-yield invariant) |
| `87607d0` | T4 — DISTINCT-CTE fan-out rule extension (`scope_validator.py`) |
| `31e08a3` | T2 — synthesis token streaming via `message_delta` SSE + `SynthesisStreamingStep.jsx` |
| `adb1407` | T3 — `thinking_delta` SSE pass-through + collapsible `ThinkingStreamStep.jsx` |
| `00d9857` | Hotfix — `df.replace([np.nan, np.inf, -np.inf], None)` before JSON serialization in both SQL paths |

**Test baseline:** 2163 passed, 1 skipped (pre-existing collection errors in
7 test files are unrelated import issues, ignore them with `--ignore` flags —
see below).

---

## What remains (your job this session)

### Step 1 — Verify current state (pre-flight)

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git log --oneline -5
git branch --show-current
```

Expected: top commit `00d9857`, branch `phase-m-alt`.

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1/backend"
python -m pytest tests/ -q \
  --ignore=tests/test_bm25_adapter.py \
  --ignore=tests/test_cross_encoder_rerank.py \
  --ignore=tests/test_embedder_registry.py \
  --ignore=tests/test_ensemble_cap.py \
  --ignore=tests/test_migration_checkpoint.py \
  --ignore=tests/test_mock_anthropic_provider.py \
  --ignore=tests/test_trap_grader.py 2>&1 | tail -5
```

Expected: `2163 passed, 1 skipped`. If count differs, investigate before proceeding.

---

### Step 2 — Day 4: flip `PARK_V2_*` flags to default-on

The W2 plan (at `docs/superpowers/plans/2026-04-24-phase-k-w2-grounding-and-streaming-ux.md`
Day 4 section) requires flipping all `PARK_V2_*` feature flags so they default
to `True` in `backend/config.py`.

1. Open `backend/config.py` and search for any `PARK_V2_*` fields (likely
   `PARK_V2_ASK_USER`, maybe others added during Day 2 migration). Flip
   their `default=False` to `default=True`.
2. Update `backend/.env.example` and `docs/claude/config-defaults.md` to
   reflect the new defaults (both files must stay in sync — per golden rule
   "every numeric constant lives in config-defaults.md").
3. Run the full regression suite to confirm behavior is identical under the
   new defaults.
4. Commit: `feat(phase-k-w2): flip PARK_V2_* flags default-on (Day 4)`

> **Note:** If `PARK_V2_*` flags don't exist in `config.py` yet (they may
> still be TODO from Day 2 migration work), check `agent_engine.py` around
> lines 2538–2570 (ask_user site) and 2632–2660 (W1 cascade site) for whether
> the park primitive migration actually landed or if those sites still use the
> legacy `memory._user_response_event`. If NOT migrated, that's Day 2 work
> that was skipped — report to user before proceeding.

---

### Step 3 — Day 5: cleanup legacy park fields

Per the W2 plan Day 5:

1. Delete `memory._user_response_event` and `memory._user_response` instance
   attributes from `SessionMemory.__init__` in `agent_engine.py`.
2. Remove the `@property` shim that aliases them to the new slot (if it
   exists).
3. Remove `PARK_V2_ASK_USER` flag from `config.py` (make it permanent/
   unconditional) — also remove from `.env.example` and `config-defaults.md`.
4. Delete shadow-mode logging hooks added in Day 1 (`cfa182c`) — grep for
   `# SHADOW` or `# shadow-mode` comments in `agent_engine.py`.
5. Run full regression. Must stay at 2163 passed.
6. Commit: `feat(phase-k-w2): Day 5 cleanup — delete legacy park shims`

---

### Step 4 — Adversarial replay (Day 4 requirement)

Re-dispatch the 4 highest-confidence adversarial operatives from the W2
adversarial pass with `Delta:` notes. The UFSD spec is at:
`docs/ultraflow/specs/UFSD-2026-04-24-phase-k-w2-adversarial.md`

The 4 operatives to re-dispatch are: **Architect Void, Phantom Interval,
Vector Lace, Regression Phantom**. Their original findings targeted:
- Race between Gate C arm + W1 cascade arm (park_id collision)
- Replan loop when agent gets "station-proxy" response + replans + hits Gate C again
- Tenant isolation (wrong tenant's coverage card in Gate C lookup)
- Vocabulary collision between W1 vocab {retry, summarize, change_approach} and W2 vocab {abort, station_proxy}

Point them at the changed line ranges (Day 1-3 commits). Confirm CLEAN on
all 4. If any come back BROKEN, fix before tagging.

---

### Step 5 — Tag W2 shipped

Once Day 4 + Day 5 + adversarial replay are green:

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git tag phase-k-w2-shipped
```

Do NOT push unless user explicitly asks.

---

### Step 6 — Begin W3 (if user wants to continue)

If user says "W3 now", the W2 plan doc (`2026-04-24-phase-k-w2-…md`) does
NOT cover W3 — you'll need to read the Phase K master spec or ask the user
what W3 scope is. Do not assume.

---

## Known open issues (do NOT fix unless user asks)

1. **`query_memory` atomic write race on Windows** — `[WinError 183] Cannot
   create a file when that file already exists` on `.tmp` files for
   `conn=729f5e28`. Happens because Windows blocks `os.replace()` when the
   target is held open by another process. Pre-existing. Not blocking.

2. **Pre-existing test collection errors** — 7 test files fail to collect
   (`ModuleNotFoundError: No module named 'backend'`) because they import
   `from backend.tests.fixtures.*`. Skip them with `--ignore` flags; do not
   fix.

---

## Key file locations

| File | Purpose |
|------|---------|
| `backend/agent_engine.py` | Main agent loop — park sites at ~2538 (ask_user) + ~2632 (W1 cascade) |
| `backend/agent_park.py` | `ParkRegistry` + `ParkSlot` + `_park_for_user_response()` primitive |
| `backend/ambiguity_detector.py` | Gate C schema-entity-mismatch detector |
| `backend/config.py` | All feature flags including `PARK_V2_*` |
| `backend/routers/agent_routes.py` | SSE emit + `/respond` endpoint + `KNOWN_SSE_EVENT_TYPES` |
| `frontend/src/components/agent/AgentStepRenderer.jsx` | Step dispatch including thinking_delta + redacted |
| `frontend/src/components/agent/ThinkingStreamStep.jsx` | Collapsible thinking block (T3, new file) |
| `frontend/src/components/agent/SynthesisStreamingStep.jsx` | Streaming synthesis renderer (T2) |
| `docs/superpowers/plans/2026-04-24-phase-k-w2-grounding-and-streaming-ux.md` | Full W2 plan + 5-day cadence |
| `docs/ultraflow/specs/UFSD-2026-04-24-phase-k-w2-adversarial.md` | W2 adversarial UFSD with operative findings |
| `docs/claude/config-defaults.md` | Config constant reference — update whenever touching config.py |

---

## Run commands

```bash
# Full backend regression (exclude known-broken collectors)
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1/backend"
python -m pytest tests/ -q \
  --ignore=tests/test_bm25_adapter.py \
  --ignore=tests/test_cross_encoder_rerank.py \
  --ignore=tests/test_embedder_registry.py \
  --ignore=tests/test_ensemble_cap.py \
  --ignore=tests/test_migration_checkpoint.py \
  --ignore=tests/test_mock_anthropic_provider.py \
  --ignore=tests/test_trap_grader.py

# W2-specific tests
python -m pytest tests/test_w2_thinking_stream.py tests/test_w2_synthesis_streaming.py \
  tests/test_w2_park_day2_preflight.py -v

# Dev servers (already running — check with preview_list first)
# Backend: uvicorn main:app --reload --port 8002
# Frontend: npm run dev (from frontend/)
```

---

## Commit format

```
feat(phase-k-w2): <verb> <object>
```

For cleanup commits, use:
```
chore(phase-k-w2): remove legacy park shims (Day 5)
```
