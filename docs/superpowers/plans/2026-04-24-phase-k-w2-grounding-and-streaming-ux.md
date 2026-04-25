# Phase K Week-2 — Grounding Disclosure + Streaming UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Council-Locked Restructure (2026-04-24):** This plan was reorganized after the 20-operative adversarial pass + 20-persona council ruling. The original T1-T5 tasks are now **ingredients** consumed by a 5-day phased cadence anchored on a new park-primitive foundation. Read the **5-Day Cadence** section first; the legacy task sections below are preserved for amendment cross-references.

**Goal:** Close the four demo blockers found post-W1 (silent schema substitution, blank screen during synthesis, hidden agent reasoning, fan-out duplicate-row bug) WITHOUT breaking the 25 W1 + 2076 broader tests, behind a transactional park primitive that all current and future consent surfaces can build on.

**Architecture:** Day 1 lands `backend/agent_park.py` — a `ParkRegistry` + `ParkSlot` primitive with `asyncio.Event` per park_id and a `_park_for_user_response()` helper. Day 2-3 migrate the three existing park sites (ask_user, W1 cascade, W2 schema-mismatch) onto the primitive behind a feature flag. Day 3 also lands T2 streaming + T3 thinking + T4 fan-out in parallel since they no longer block on park-primitive design. Day 4 flips the flag + runs adversarial replay. Day 5 deletes legacy fields.

**Tech Stack:** FastAPI + SSE, asyncio + threading.Lock (never held across await), Anthropic SDK `messages.stream()` with thinking + tools, sqlglot AST, React + Zustand, pytest-anyio + pytest-xdist + hypothesis (race harness).

---

## 5-Day Cadence (Council-Locked)

### Day 0 (today) — Plan freeze
Plan + UFSD locked. Council ruling absorbed. Begin Day 1 work.

### Day 1 — Foundation: `agent_park.py` + race harness (no site migration)

**Deliverables (must all land in one PR; no site changes):**
- `backend/agent_park.py` — `ParkRegistry` + `ParkSlot` (`asyncio.Event`) + `_park_for_user_response()` async helper. Module docstring explains the asyncio.Event choice (UFSD [LOCKED] #2). `ParkRegistry` class docstring documents the never-hold-lock-across-await invariant (UFSD [LOCKED] #3).
- `backend/tests/test_w2_park_primitive.py` — four race tests: `test_yield_before_flag_set`, `test_cancel_during_grace`, `test_vocab_collision`, `test_freetext_rejection`. Run via `pytest-anyio` + `pytest-xdist --count=200` (UFSD [LOCKED] #7).
- `backend/tests/test_w2_park_simultaneous.py` — Day 2 prerequisite test: two park sites active in same session must NOT collide on the legacy `@property` shim (UFSD [LOCKED] #6).
- Shadow-mode logging hooks at three existing park sites (ask_user `agent_engine.py:2538`, W1 cascade `agent_engine.py:2632`, planned W2 schema-mismatch site). No behavioral change — the primitive is armed but the legacy event is still authoritative.
- Audit-ledger binding contract: `_park_for_user_response()` returns `(choice, park_id, consent_basis)` where `consent_basis ∈ {"user_act","timeout_default"}` (UFSD [LOCKED] #8).

**Gate:** 25 W1 + 2076 broader tests must stay green. Race harness must run clean at `--count=200`. No site migrated.

**Closes amendments:** AMEND-W2-03, 04, 05, 09, 18, 19 (foundation level).

### Day 2 — Migrate `ask_user` site behind `PARK_V2_ASK_USER` flag

**Deliverables:**
- Replace boilerplate at `agent_engine.py:2538-2569` with `await self._park_for_user_response(kind="ask_user", expected_values=frozenset(), default_on_timeout="", deadline_seconds=settings.AGENT_WALL_CLOCK_HARD_S)`.
- `expected_values=frozenset()` sentinel = free-text mode (allow_freetext=True).
- Keep legacy `memory._user_response_event` as `@property` shim aliasing `_slots["__legacy_default__"]`. Setter rebinds slot.
- Run simultaneous-park test from Day 1; must pass before flag flips on for staging.
- Run 25 W1 + ask_user-related tests; must stay green.

**Gate:** ask_user behavior identical to pre-migration with flag off; uses primitive with flag on. Simultaneous-park test green.

**Closes amendments:** AMEND-W2-02 (ask_user portion).

### Day 3 — Parallel landing: W1 cascade + W2 mismatch + T2 streaming + T3 thinking + T4 fan-out

**Deliverables (5 sub-tasks land in parallel — independent worktrees):**

- **D3-A** — Migrate W1 cascade (`agent_engine.py:2632-2657`) onto primitive. `expected_values={"retry","change_approach","summarize"}`, `default_on_timeout="summarize"`, `kind="tool_error_cascade"`. /respond endpoint adds 422 path on vocab miss.

- **D3-B** — Land W2 schema-mismatch task (formerly T1 below) using primitive. `expected_values={"abort","station_proxy"}`, `default_on_timeout="abort"`, `kind="schema_entity_mismatch"`. Detector hardened per AMEND-W2-07 (Unicode skeleton + word-boundary). Disclosure builder hardened per AMEND-W2-01 (sanitize column names, validate entity allowlist). Fail-closed on empty schema per AMEND-W2-06. Consent persistence per AMEND-W2-08.

- **D3-C** — Land T2 streaming (formerly T2 below) — `complete_with_tools_stream` provider method + agent hook. Capability gate per AMEND-W2-22 (no thinking on Haiku). 400 doesn't trip breaker per AMEND-W2-23. Try/except/finally + cancel-check + byte cap per AMEND-W2-12/13/14. Suppress legacy thinking-step emit per AMEND-W2-15. Banner-first per AMEND-W2-16. Streaming gated off when `FEATURE_CLAIM_PROVENANCE=True` per AMEND-W2-17.

- **D3-D** — Land T3 thinking_delta pass-through (formerly T3 below) — uses provider stream method from D3-C. SDK pin per AMEND-W2-24. Handle redacted_thinking + signature_delta per AMEND-W2-25. Cumulative thinking-token cap per AMEND-W2-26.

- **D3-E** — Land T4 fan-out detector extension (formerly T4 below) — dialect-branched remediation per AMEND-W2-28. Cover SELECT DISTINCT *, USING, unqualified columns, inline subquery, GROUP BY equivalence per AMEND-W2-29. Skip recursive CTEs per AMEND-W2-30. Alias→CTE-name resolver per AMEND-W2-31.

**Gate:** all five sub-tasks green; 25 W1 + 2076 broader stay green; W2 churn-regression replay (rider→station-proxy) shows consent card fires before any tool call, banner appears in streamed deltas, thinking visible.

**Closes amendments:** AMEND-W2-01, 02 (W1+W2 portions), 06, 07, 08, 10, 11, 12, 13, 14, 15, 16, 17, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31.

### Day 4 — Flip `PARK_V2_*` flags default-on; adversarial replay

- All `PARK_V2_*` flags flip to `True` default in config.py.
- Run W1 churn-regression replay (the original 146-step failure question) end-to-end with grounding stack on. Expected: ≤20 steps, no confabulation, Gate C fires on schema-gap at step ≤8, banner-prefixed unverified text in stream, claim provenance on numeric spans (or streaming gated off if `FEATURE_CLAIM_PROVENANCE=True`).
- Re-dispatch the 4 highest-Confidence adversarial operatives (Architect Void, Phantom Interval, Vector Lace, Regression Phantom) with `Delta:` notes pointing at the changed line ranges. Confirm CLEAN.

**Gate:** adversarial replay returns CLEAN on all 4 re-dispatched operatives.

### Day 5 — Cleanup

- Delete `memory._user_response_event` and `memory._user_response` instance attributes from `SessionMemory.__init__`.
- Remove `@property` shim from Day 2.
- Remove `PARK_V2_ASK_USER` flag (now permanent).
- Final commit deletes shadow-mode logging hooks.
- Tag: `phase-k-w2-shipped`.

**Gate:** 25 W1 + 2076 broader green. Adversarial replay green. No legacy park fields remain.

---

## File Structure

**Backend new files:**
- `backend/schema_entity_mismatch.py` — detector mapping NL person-entity terms to schema columns
- `backend/tests/test_w2_schema_entity_mismatch.py`
- `backend/tests/test_w2_synthesis_streaming.py`
- `backend/tests/test_w2_thinking_stream.py`
- `backend/tests/test_w2_fanout_distinct_cte.py`

**Backend modified files:**
- `backend/agent_engine.py` — schema-mismatch checkpoint, streaming synthesis hook, thinking pass-through (~3 sites)
- `backend/anthropic_provider.py` — `complete_with_tools_stream()` method
- `backend/routers/agent_routes.py` — register `message_delta`, `thinking_delta` in `KNOWN_SSE_EVENT_TYPES`
- `backend/scope_validator.py` — extend `_rule_fanout_inflation` with DISTINCT-CTE branch
- `backend/config.py` — `W2_*` flags
- `backend/.env.example` — `W2_*` defaults
- `docs/claude/config-defaults.md` — Phase K block

**Frontend new files:**
- `frontend/src/components/agent/SchemaMismatchCard.jsx` — consent UI for Gate C
- `frontend/src/components/agent/SynthesisStreamingStep.jsx` — incremental text render
- `frontend/src/components/agent/ThinkingStreamStep.jsx` — collapsible reasoning block

**Frontend modified files:**
- `frontend/src/components/agent/AgentStepRenderer.jsx` — dispatch new step types
- `frontend/src/api.js` — handle `message_delta` / `thinking_delta` SSE events

---

## Task 1 — Ring 4 Gate C: Schema-Entity Mismatch Consent

**Files:**
- Create: `backend/schema_entity_mismatch.py`
- Create: `backend/tests/test_w2_schema_entity_mismatch.py`
- Create: `frontend/src/components/agent/SchemaMismatchCard.jsx`
- Modify: `backend/agent_engine.py:2300-2330` (insert detector call before tool loop)
- Modify: `backend/agent_engine.py:1027-1041` (add `_build_schema_mismatch_step` next to `_build_error_cascade_step`)
- Modify: `backend/config.py` (add `W2_SCHEMA_MISMATCH_GATE_ENFORCE`)
- Modify: `frontend/src/components/agent/AgentStepRenderer.jsx:796` (dispatch `kind: "schema_entity_mismatch"`)

- [ ] **Step 1: Add config flag**

In `backend/config.py`, add to the Phase K block (after `W1_CONSECUTIVE_TOOL_ERROR_THRESHOLD`):

```python
W2_SCHEMA_MISMATCH_GATE_ENFORCE: bool = Field(
    default=True,
    description=(
        "Ring 4 Gate C: when NL contains person-entity terms (rider/user/"
        "customer/person) and schema lacks a matching id column, fire "
        "agent_checkpoint with [station_proxy, abort] options. Off → "
        "agent silently substitutes a proxy column."
    ),
)
```

In `backend/.env.example`, append:

```
W2_SCHEMA_MISMATCH_GATE_ENFORCE=True
```

In `docs/claude/config-defaults.md` Phase K block, append the row:

```
| `W2_SCHEMA_MISMATCH_GATE_ENFORCE` | `True` | Ring 4 Gate C — schema-entity-mismatch ask_user. Off → silent substitution. |
```

- [ ] **Step 2: Write the failing test**

Create `backend/tests/test_w2_schema_entity_mismatch.py`:

```python
"""W2 Task 1 — Ring 4 Gate C schema-entity-mismatch detector."""
import pytest
from schema_entity_mismatch import detect_entity_mismatch, MismatchResult


def _make_schema(columns_by_table):
    return {tbl: list(cols) for tbl, cols in columns_by_table.items()}


def test_rider_term_with_no_rider_id_returns_mismatch():
    schema = _make_schema({"trips": ["ride_id", "start_station_id", "started_at"]})
    result = detect_entity_mismatch("which casual riders churned?", schema)
    assert isinstance(result, MismatchResult)
    assert result.has_mismatch is True
    assert result.entity == "rider"
    assert "ride_id" not in result.proxy_suggestions
    assert "start_station_id" in result.proxy_suggestions


def test_rider_term_with_rider_id_returns_no_mismatch():
    schema = _make_schema({"trips": ["rider_id", "started_at"]})
    result = detect_entity_mismatch("rider churn", schema)
    assert result.has_mismatch is False


def test_user_term_with_user_id_returns_no_mismatch():
    schema = _make_schema({"events": ["user_id", "ts"]})
    result = detect_entity_mismatch("which users dropped off", schema)
    assert result.has_mismatch is False


def test_customer_term_with_account_id_only_returns_mismatch():
    schema = _make_schema({"orders": ["order_id", "account_id", "amount"]})
    result = detect_entity_mismatch("customers ranked by total spend", schema)
    assert result.has_mismatch is True
    assert result.entity == "customer"


def test_no_person_term_returns_no_mismatch():
    schema = _make_schema({"trips": ["ride_id", "duration"]})
    result = detect_entity_mismatch("longest rides last week", schema)
    assert result.has_mismatch is False


def test_nfkc_normalization_catches_fullwidth():
    schema = _make_schema({"trips": ["ride_id"]})
    result = detect_entity_mismatch("ｒｉｄｅｒ churn", schema)
    assert result.has_mismatch is True
```

- [ ] **Step 3: Run test to verify it fails**

Run from `backend/`:

```
python -m pytest tests/test_w2_schema_entity_mismatch.py -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'schema_entity_mismatch'`.

- [ ] **Step 4: Implement detector**

Create `backend/schema_entity_mismatch.py`:

```python
"""Ring 4 Gate C — detect when NL person-entity terms have no matching id column.

Conservative substring check after NFKC normalization. Returns proxy suggestions
(non-id columns that could be used for grouping) so the consent card can
explain the substitution.
"""
from __future__ import annotations

import unicodedata
from dataclasses import dataclass, field
from typing import Iterable

# Person-entity terms keyed by canonical noun.
_ENTITY_TERMS: dict[str, tuple[str, ...]] = {
    "rider": ("rider", "riders"),
    "user": ("user", "users"),
    "customer": ("customer", "customers"),
    "person": ("person", "people", "individual", "individuals"),
}

# Suffixes a column must end with to count as a matching id for the entity.
_ENTITY_ID_SUFFIXES: dict[str, tuple[str, ...]] = {
    "rider": ("rider_id", "riderid"),
    "user": ("user_id", "userid"),
    "customer": ("customer_id", "customerid"),
    "person": ("person_id", "personid", "individual_id"),
}


@dataclass(frozen=True)
class MismatchResult:
    has_mismatch: bool
    entity: str | None = None
    proxy_suggestions: tuple[str, ...] = field(default_factory=tuple)


def _normalize(text: str) -> str:
    return unicodedata.normalize("NFKC", text or "").lower()


def _detected_entity(nl_norm: str) -> str | None:
    for canonical, surface_forms in _ENTITY_TERMS.items():
        for sf in surface_forms:
            if sf in nl_norm:
                return canonical
    return None


def _has_matching_id(entity: str, all_columns: Iterable[str]) -> bool:
    suffixes = _ENTITY_ID_SUFFIXES[entity]
    cols_lower = {c.lower() for c in all_columns}
    for col in cols_lower:
        for sfx in suffixes:
            if col == sfx or col.endswith("_" + sfx) or col.endswith(sfx):
                return True
    return False


def _proxy_columns(all_columns: Iterable[str]) -> tuple[str, ...]:
    """Non-pk columns ending in _id usable as group-by proxies."""
    out: list[str] = []
    for col in all_columns:
        cl = col.lower()
        if cl.endswith("_id") and not cl.endswith(("ride_id", "trip_id", "event_id", "order_id")):
            out.append(col)
    return tuple(out)


def detect_entity_mismatch(nl: str, schema: dict[str, list[str]]) -> MismatchResult:
    """Return MismatchResult.has_mismatch=True iff NL names a person-entity
    that has no matching id column anywhere in the schema."""
    nl_norm = _normalize(nl)
    entity = _detected_entity(nl_norm)
    if entity is None:
        return MismatchResult(has_mismatch=False)

    all_cols: list[str] = []
    for cols in schema.values():
        all_cols.extend(cols)

    if _has_matching_id(entity, all_cols):
        return MismatchResult(has_mismatch=False)

    return MismatchResult(
        has_mismatch=True,
        entity=entity,
        proxy_suggestions=_proxy_columns(all_cols),
    )
```

- [ ] **Step 5: Run test to verify it passes**

Run: `python -m pytest tests/test_w2_schema_entity_mismatch.py -v`
Expected: 6 passed.

- [ ] **Step 6: Add `_build_schema_mismatch_step` + wire into agent**

In `backend/agent_engine.py`, after the `_build_error_cascade_step` method (~line 1041), add:

```python
    def _build_schema_mismatch_step(self, mismatch) -> "AgentStep":
        """W2 Task 1 — Ring 4 Gate C consent payload."""
        proxy_hint = ""
        if mismatch.proxy_suggestions:
            proxy_hint = f" Closest available proxy column(s): {', '.join(mismatch.proxy_suggestions[:3])}."
        return AgentStep(
            type="agent_checkpoint",
            content=(
                f"You asked about {mismatch.entity}-level analysis, but the schema "
                f"has no {mismatch.entity}_id column.{proxy_hint} Choose:"
            ),
            tool_input={
                "kind": "schema_entity_mismatch",
                "entity": mismatch.entity,
                "proxy_suggestions": list(mismatch.proxy_suggestions[:3]),
                "options": ["station_proxy", "abort"],
            },
        )
```

In `backend/agent_engine.py` around line 2324 (right after `self._max_tool_calls = self._classify_workload_cap(question)`), insert the gate:

```python
        # W2 Task 1 — Ring 4 Gate C schema-entity-mismatch consent
        if settings.W2_SCHEMA_MISMATCH_GATE_ENFORCE:
            from schema_entity_mismatch import detect_entity_mismatch
            schema_dict: dict[str, list[str]] = {}
            profile = getattr(self.connection_entry, "schema_profile", None)
            if profile is not None:
                for tbl in getattr(profile, "tables", []):
                    schema_dict[tbl.name] = [c.name for c in getattr(tbl, "columns", [])]
            mismatch = detect_entity_mismatch(question, schema_dict)
            if mismatch.has_mismatch:
                checkpoint = self._build_schema_mismatch_step(mismatch)
                self._steps.append(checkpoint)
                yield checkpoint
                # Park loop using the same mechanism as W1 cascade
                self._waiting_for_user = True
                self.memory._waiting_for_user = True
                self.memory._user_response_event.clear()
                self.memory._user_response = None
                import time as _time
                _deadline = _time.monotonic() + settings.AGENT_WALL_CLOCK_HARD_S
                while self.memory._user_response is None:
                    remaining = _deadline - _time.monotonic()
                    if remaining <= 0:
                        break
                    self.memory._user_response_event.wait(timeout=min(remaining, 5.0))
                    self.memory._user_response_event.clear()
                user_choice = (self.memory._user_response or "abort").strip().lower()
                self.memory._user_response = None
                self._waiting_for_user = False
                self.memory._waiting_for_user = False
                if user_choice == "abort":
                    abort_step = AgentStep(
                        type="result",
                        content=(
                            f"Aborted — the schema has no {mismatch.entity}-level identifier, "
                            "so this question cannot be answered without a proxy."
                        ),
                    )
                    self._steps.append(abort_step)
                    yield abort_step
                    self._result.final_answer = abort_step.content
                    self._result.steps = self._steps
                    return self._result
                # station_proxy → inject disclosure into system prompt
                self._schema_mismatch_disclosure = (
                    f"USER CONSENTED TO PROXY: schema has no {mismatch.entity}_id; "
                    f"using {(mismatch.proxy_suggestions[:1] or ['station_id'])[0]} as group-by. "
                    "Begin synthesis with: 'Note: no individual "
                    f"{mismatch.entity} identifier — analyzing aggregated patterns as proxy.'"
                )
```

Then thread the disclosure into the system prompt. Find `_build_legacy_system_prompt` around line 1245 and at the very end of the function (before the final `return`), append:

```python
        if getattr(self, "_schema_mismatch_disclosure", None):
            prompt += "\n\n<schema_mismatch_disclosure>\n" + self._schema_mismatch_disclosure + "\n</schema_mismatch_disclosure>\n"
        return prompt
```

(If the function already has a `return prompt` somewhere mid-body, hoist the append above each return.)

- [ ] **Step 7: Add integration test for the wiring**

Append to `backend/tests/test_w2_schema_entity_mismatch.py`:

```python
def test_build_schema_mismatch_step_payload():
    """Engine builds correct agent_checkpoint payload for the consent card."""
    from agent_engine import AgentEngine, AgentStep
    from unittest.mock import MagicMock

    engine = AgentEngine.__new__(AgentEngine)  # bypass __init__
    mismatch = MismatchResult(
        has_mismatch=True,
        entity="rider",
        proxy_suggestions=("start_station_id", "end_station_id"),
    )
    step = engine._build_schema_mismatch_step(mismatch)
    assert step.type == "agent_checkpoint"
    assert step.tool_input["kind"] == "schema_entity_mismatch"
    assert step.tool_input["entity"] == "rider"
    assert step.tool_input["options"] == ["station_proxy", "abort"]
    assert "rider_id" in step.content
```

- [ ] **Step 8: Run all Task 1 tests**

Run: `python -m pytest tests/test_w2_schema_entity_mismatch.py -v`
Expected: 7 passed.

- [ ] **Step 9: Build the frontend consent card**

Create `frontend/src/components/agent/SchemaMismatchCard.jsx`:

```jsx
import { useState } from 'react';
import { TOKENS } from '../dashboard/tokens';
import { api } from '../../api';

const WARN = TOKENS.warning || 'var(--status-warning)';

export default function SchemaMismatchCard({ chatId, step, onResolved }) {
  const [submitting, setSubmitting] = useState(false);
  const [resolved, setResolved] = useState(false);

  const handle = async (choice) => {
    if (submitting || resolved) return;
    setSubmitting(true);
    try {
      await api.agentRespond(chatId, choice);
      setResolved(true);
      if (onResolved) onResolved(choice);
    } finally {
      setSubmitting(false);
    }
  };

  const entity = step?.tool_input?.entity || 'individual';
  const proxies = step?.tool_input?.proxy_suggestions || [];

  return (
    <div style={{
      padding: '12px 16px',
      borderRadius: TOKENS.radius.md,
      background: `color-mix(in oklab, ${WARN} 6%, transparent)`,
      border: `1px solid color-mix(in oklab, ${WARN} 35%, transparent)`,
      marginBottom: 8,
    }}>
      <div style={{ fontWeight: 600, color: WARN, marginBottom: 6, fontSize: 13 }}>
        Schema mismatch — no {entity}_id column
      </div>
      <div style={{ fontSize: 12.5, color: TOKENS.text.secondary, marginBottom: 8, lineHeight: 1.55 }}>
        You asked about {entity}-level analysis, but the schema has no individual {entity} identifier.
        {proxies.length > 0 && (
          <> The closest available proxy is <code style={{ background: 'rgba(0,0,0,0.2)', padding: '1px 4px', borderRadius: 3 }}>{proxies[0]}</code>.</>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => handle('station_proxy')}
          disabled={submitting || resolved}
          style={{
            padding: '6px 12px', borderRadius: TOKENS.radius.sm, fontSize: 12, fontWeight: 500,
            border: `1px solid color-mix(in oklab, ${WARN} 40%, transparent)`,
            background: `color-mix(in oklab, ${WARN} 10%, transparent)`,
            color: WARN, cursor: submitting || resolved ? 'not-allowed' : 'pointer',
            opacity: submitting || resolved ? 0.5 : 1,
          }}
        >
          Use {proxies[0] || 'station'} as proxy
        </button>
        <button
          onClick={() => handle('abort')}
          disabled={submitting || resolved}
          style={{
            padding: '6px 12px', borderRadius: TOKENS.radius.sm, fontSize: 12, fontWeight: 500,
            border: `1px solid ${TOKENS.border.default}`,
            background: 'transparent', color: TOKENS.text.secondary,
            cursor: submitting || resolved ? 'not-allowed' : 'pointer',
            opacity: submitting || resolved ? 0.5 : 1,
          }}
        >
          Abort — need rider ID
        </button>
      </div>
      {resolved && (
        <div style={{ fontSize: 12, color: TOKENS.text.muted, marginTop: 8, fontStyle: 'italic' }}>
          Choice recorded — resuming.
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 10: Wire the dispatch in `AgentStepRenderer.jsx`**

In `frontend/src/components/agent/AgentStepRenderer.jsx`, find the existing `agent_checkpoint` line at ~796 and add a sibling branch:

```jsx
import SchemaMismatchCard from './SchemaMismatchCard';
// ...
{step.type === 'agent_checkpoint' && step?.tool_input?.kind === 'tool_error_cascade' && (
  <ToolErrorCascadeCard chatId={chatId} step={step} onResolved={onResolved} />
)}
{step.type === 'agent_checkpoint' && step?.tool_input?.kind === 'schema_entity_mismatch' && (
  <SchemaMismatchCard chatId={chatId} step={step} onResolved={onResolved} />
)}
```

- [ ] **Step 11: Verify frontend lint/build**

Run from `frontend/`:

```
npm run lint
npm run build
```

Expected: no new errors. (Pre-existing warnings ok.)

- [ ] **Step 12: Commit**

```bash
git add backend/schema_entity_mismatch.py backend/tests/test_w2_schema_entity_mismatch.py \
        backend/agent_engine.py backend/config.py backend/.env.example \
        docs/claude/config-defaults.md \
        frontend/src/components/agent/SchemaMismatchCard.jsx \
        frontend/src/components/agent/AgentStepRenderer.jsx
git commit -m "feat(phase-k-w2): add schema-entity-mismatch consent gate (Ring 4 Gate C)"
```

---

## Task 2 — Synthesis Token Streaming + Phase Step

**Files:**
- Modify: `backend/anthropic_provider.py:208-260` (add `complete_with_tools_stream`)
- Modify: `backend/agent_engine.py:2400-2470` (replace `complete_with_tools` with streaming variant on the final iteration)
- Modify: `backend/routers/agent_routes.py:41-58` (add `message_delta`, `synthesizing` to `KNOWN_SSE_EVENT_TYPES`)
- Create: `backend/tests/test_w2_synthesis_streaming.py`
- Create: `frontend/src/components/agent/SynthesisStreamingStep.jsx`
- Modify: `frontend/src/components/agent/AgentStepRenderer.jsx` (dispatch `message_delta`)
- Modify: `frontend/src/api.js` (handle `message_delta` SSE event)

- [ ] **Step 1: Write the failing provider test**

Create `backend/tests/test_w2_synthesis_streaming.py`:

```python
"""W2 Task 2 — Anthropic provider streaming variant for tool-use turns."""
from unittest.mock import MagicMock, patch
import pytest


def test_complete_with_tools_stream_yields_text_deltas():
    from anthropic_provider import AnthropicProvider

    fake_events = [
        MagicMock(type="content_block_start", content_block=MagicMock(type="text")),
        MagicMock(type="content_block_delta", delta=MagicMock(type="text_delta", text="Hello ")),
        MagicMock(type="content_block_delta", delta=MagicMock(type="text_delta", text="world")),
        MagicMock(type="content_block_stop"),
        MagicMock(type="message_stop"),
    ]
    fake_stream_ctx = MagicMock()
    fake_stream_ctx.__enter__ = lambda self: iter(fake_events)
    fake_stream_ctx.__exit__ = lambda *a: False
    final_msg = MagicMock(content=[MagicMock(type="text", text="Hello world")],
                          stop_reason="end_turn",
                          usage=MagicMock(input_tokens=1, output_tokens=2))
    fake_stream_ctx.get_final_message = lambda: final_msg

    with patch("anthropic_provider.anthropic.Anthropic") as Anth:
        client = Anth.return_value
        client.messages.stream.return_value = fake_stream_ctx
        provider = AnthropicProvider(api_key="fake")
        events = list(provider.complete_with_tools_stream(
            model="claude-haiku-4-5-20251001",
            system="sys", messages=[{"role": "user", "content": "hi"}],
            tools=[], max_tokens=100,
        ))

    text_deltas = [e for e in events if e["type"] == "text_delta"]
    assert len(text_deltas) == 2
    assert text_deltas[0]["text"] == "Hello "
    assert text_deltas[1]["text"] == "world"
    assert any(e["type"] == "final" for e in events)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_w2_synthesis_streaming.py -v`
Expected: FAIL with `AttributeError: 'AnthropicProvider' object has no attribute 'complete_with_tools_stream'`.

- [ ] **Step 3: Implement `complete_with_tools_stream`**

In `backend/anthropic_provider.py`, after the `complete_with_tools` method (~line 260), add:

```python
    def complete_with_tools_stream(
        self, *, model: str, system: str, messages: list,
        tools: list, max_tokens: int, **kwargs
    ):
        """Streaming tool-use completion. Yields dicts:
            {"type": "text_delta", "text": str}
            {"type": "thinking_delta", "text": str}
            {"type": "tool_use_start", "id": str, "name": str}
            {"type": "tool_use_input_delta", "id": str, "partial_json": str}
            {"type": "final", "blocks": list[ContentBlock], "stop_reason": str, "usage": dict}
        """
        self._check_breaker()
        try:
            stream_kwargs = {
                "model": model,
                "max_tokens": max_tokens,
                "messages": messages,
                "tools": tools,
            }
            if system:
                stream_kwargs["system"] = system
            with self._client.messages.stream(**stream_kwargs) as stream:
                current_tool_id = None
                for event in stream:
                    et = getattr(event, "type", "")
                    if et == "content_block_start":
                        cb = getattr(event, "content_block", None)
                        if cb is not None and getattr(cb, "type", "") == "tool_use":
                            current_tool_id = getattr(cb, "id", None)
                            yield {
                                "type": "tool_use_start",
                                "id": current_tool_id,
                                "name": getattr(cb, "name", ""),
                            }
                    elif et == "content_block_delta":
                        delta = getattr(event, "delta", None)
                        dt = getattr(delta, "type", "")
                        if dt == "text_delta":
                            yield {"type": "text_delta", "text": getattr(delta, "text", "")}
                        elif dt == "thinking_delta":
                            yield {"type": "thinking_delta", "text": getattr(delta, "thinking", "")}
                        elif dt == "input_json_delta":
                            yield {
                                "type": "tool_use_input_delta",
                                "id": current_tool_id,
                                "partial_json": getattr(delta, "partial_json", ""),
                            }
                    elif et == "content_block_stop":
                        current_tool_id = None
                final_msg = stream.get_final_message()
                blocks = []
                for block in final_msg.content:
                    if getattr(block, "type", "") == "text":
                        blocks.append(ContentBlock(type="text", text=block.text))
                    elif getattr(block, "type", "") == "tool_use":
                        blocks.append(ContentBlock(
                            type="tool_use",
                            tool_name=block.name,
                            tool_input=block.input,
                            tool_use_id=block.id,
                        ))
                self._breaker.record_success()
                _emit_cache_stats(model, final_msg.usage)
                yield {
                    "type": "final",
                    "blocks": blocks,
                    "stop_reason": final_msg.stop_reason or "end_turn",
                    "usage": {
                        "input_tokens": final_msg.usage.input_tokens,
                        "output_tokens": final_msg.usage.output_tokens,
                    },
                }
        except anthropic.AuthenticationError:
            raise InvalidKeyError("Invalid Anthropic API key")
        except anthropic.PermissionDeniedError:
            raise InvalidKeyError("API key lacks required permissions")
        except anthropic.APIError as e:
            self._breaker.record_failure()
            raise RuntimeError(f"AI service error: {str(e)}")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_w2_synthesis_streaming.py -v`
Expected: 1 passed.

- [ ] **Step 5: Add `KNOWN_SSE_EVENT_TYPES` entries**

In `backend/routers/agent_routes.py:41-58`, add:

```python
KNOWN_SSE_EVENT_TYPES = {
    "agent_checkpoint",
    "message_delta",
    "thinking_delta",        # W2 Task 3
    "synthesizing",          # W2 Task 2 — phase step at synthesis start
    "tool_call",
    "tool_result",
    "error",
    "done",
    "provenance_chip",
    "plan_artifact",
    "step_phase",
    "step_detail",
    "safe_abort",
    "claim_chip",
    "result_preview",
    "cancel_ack",
}
```

- [ ] **Step 6: Wire streaming into the agent loop**

In `backend/agent_engine.py`, find the `complete_with_tools` call (~line 2410-2430). Replace the call with the streaming variant ONLY for the final iteration (when no `tool_use` blocks were emitted in the previous iteration — that's the synthesis turn). Add a config flag check.

In `backend/config.py` Phase K block:

```python
W2_SYNTHESIS_STREAMING_ENFORCE: bool = Field(
    default=True,
    description=(
        "W2 Task 2 — stream final synthesis tokens via message_delta SSE. "
        "Off → single result event after full synthesis (blank-screen UX)."
    ),
)
```

In `backend/.env.example`:

```
W2_SYNTHESIS_STREAMING_ENFORCE=True
```

In `docs/claude/config-defaults.md` Phase K block, append:

```
| `W2_SYNTHESIS_STREAMING_ENFORCE` | `True` | W2 — stream final synthesis tokens. Off → single result event after full synthesis. |
```

In `backend/agent_engine.py`, locate the call site `provider_resp = self.provider.complete_with_tools(...)` (around line 2410). Replace with:

```python
                use_stream = (
                    settings.W2_SYNTHESIS_STREAMING_ENFORCE
                    and self._tool_calls > 0  # never on first iteration (let planner run unstreamed)
                )
                if use_stream:
                    yield AgentStep(type="synthesizing", content="Synthesizing analysis…")
                    accumulated_text = []
                    final_blocks = None
                    final_stop = "end_turn"
                    final_usage = {}
                    for ev in self.provider.complete_with_tools_stream(
                        model=current_model,
                        system=system_prompt,
                        messages=messages,
                        tools=tools_for_provider,
                        max_tokens=max_tokens,
                    ):
                        if ev["type"] == "text_delta":
                            accumulated_text.append(ev["text"])
                            yield AgentStep(
                                type="message_delta",
                                content=ev["text"],
                            )
                        elif ev["type"] == "thinking_delta":
                            yield AgentStep(
                                type="thinking_delta",
                                content=ev["text"],
                            )
                        elif ev["type"] == "final":
                            final_blocks = ev["blocks"]
                            final_stop = ev["stop_reason"]
                            final_usage = ev["usage"]
                    content_blocks = final_blocks or []
                    stop_reason = final_stop
                    usage = final_usage
                else:
                    provider_resp = self.provider.complete_with_tools(
                        model=current_model,
                        system=system_prompt,
                        messages=messages,
                        tools=tools_for_provider,
                        max_tokens=max_tokens,
                    )
                    content_blocks = provider_resp.content_blocks
                    stop_reason = provider_resp.stop_reason
                    usage = provider_resp.usage
```

(The exact variable names — `current_model`, `system_prompt`, `tools_for_provider`, `max_tokens` — must match the names already in the agent loop. Search the surrounding 30 lines and adapt.)

- [ ] **Step 7: Add integration test for the streaming phase step**

Append to `backend/tests/test_w2_synthesis_streaming.py`:

```python
def test_synthesizing_phase_step_emitted_when_flag_on():
    """Engine emits a `synthesizing` step before streaming begins."""
    from agent_engine import AgentEngine, AgentStep
    engine = AgentEngine.__new__(AgentEngine)
    engine._tool_calls = 1  # not the first iteration
    step = AgentStep(type="synthesizing", content="Synthesizing analysis…")
    assert step.type == "synthesizing"
    assert "Synthesizing" in step.content
```

- [ ] **Step 8: Run all Task 2 tests**

```
python -m pytest tests/test_w2_synthesis_streaming.py -v
```

Expected: 2 passed.

- [ ] **Step 9: Frontend — incremental text component**

Create `frontend/src/components/agent/SynthesisStreamingStep.jsx`:

```jsx
import { TOKENS } from '../dashboard/tokens';

export default function SynthesisStreamingStep({ step }) {
  return (
    <div style={{
      padding: '8px 12px',
      borderRadius: TOKENS.radius.sm,
      background: 'transparent',
      color: TOKENS.text.primary,
      fontSize: 13,
      lineHeight: 1.6,
      whiteSpace: 'pre-wrap',
    }}>
      {step.content}
      <span style={{ opacity: 0.5, marginLeft: 2 }}>▌</span>
    </div>
  );
}
```

- [ ] **Step 10: Wire `message_delta` into renderer + accumulator**

In `frontend/src/components/agent/AgentStepRenderer.jsx`, add the dispatch line near the others:

```jsx
import SynthesisStreamingStep from './SynthesisStreamingStep';
// ...
{step.type === 'synthesizing' && (
  <div style={{ fontSize: 12, color: TOKENS.text.muted, fontStyle: 'italic', padding: '4px 0' }}>
    {step.content}
  </div>
)}
{step.type === 'message_delta' && <SynthesisStreamingStep step={step} />}
```

In `frontend/src/api.js`, find the SSE event-name attachment line (~`if (eventName) data.__event = eventName;`). Confirm `message_delta` flows through unmodified — it should, since `__event` is the event name and the consumer already dispatches by `__event`. No code change required if the existing SSE pipeline is event-name agnostic. Add a brief unit assert if a test framework exists; otherwise smoke test in the next step.

- [ ] **Step 11: Smoke test the preview**

Run preview, ask a non-trivial question. Expected: while the agent synthesizes, partial sentences appear in the chat as they generate. No 3-minute blank screen.

- [ ] **Step 12: Commit**

```bash
git add backend/anthropic_provider.py backend/agent_engine.py backend/config.py \
        backend/.env.example backend/routers/agent_routes.py \
        backend/tests/test_w2_synthesis_streaming.py \
        docs/claude/config-defaults.md \
        frontend/src/components/agent/SynthesisStreamingStep.jsx \
        frontend/src/components/agent/AgentStepRenderer.jsx
git commit -m "feat(phase-k-w2): stream synthesis tokens via message_delta SSE"
```

---

## Task 3 — Thinking Block SSE + Frontend Render

**Files:**
- Modify: `backend/anthropic_provider.py` (already emits `thinking_delta` from Task 2 streaming method — verify)
- Modify: `backend/agent_engine.py` (request extended thinking when budget allows; pass `thinking_delta` through as SSE)
- Modify: `backend/config.py` (`W2_THINKING_STREAM_ENFORCE`, `W2_THINKING_BUDGET_TOKENS`)
- Create: `backend/tests/test_w2_thinking_stream.py`
- Create: `frontend/src/components/agent/ThinkingStreamStep.jsx`
- Modify: `frontend/src/components/agent/AgentStepRenderer.jsx` (dispatch `thinking_delta`)

- [ ] **Step 1: Add config flags**

In `backend/config.py` Phase K block:

```python
W2_THINKING_STREAM_ENFORCE: bool = Field(
    default=True,
    description=(
        "W2 Task 3 — request Anthropic extended thinking and stream "
        "thinking_delta blocks as SSE so the agent's reasoning is visible. "
        "Off → no thinking blocks requested or streamed."
    ),
)
W2_THINKING_BUDGET_TOKENS: int = Field(
    default=2000,
    description="Token budget for extended thinking per synthesis turn.",
)
```

In `backend/.env.example`:

```
W2_THINKING_STREAM_ENFORCE=True
W2_THINKING_BUDGET_TOKENS=2000
```

In `docs/claude/config-defaults.md` Phase K block, append:

```
| `W2_THINKING_STREAM_ENFORCE` | `True` | W2 — surface Anthropic extended-thinking blocks as SSE. |
| `W2_THINKING_BUDGET_TOKENS` | `2000` | Per-turn budget for extended thinking. |
```

- [ ] **Step 2: Write the failing test**

Create `backend/tests/test_w2_thinking_stream.py`:

```python
"""W2 Task 3 — thinking_delta SSE pass-through."""
from unittest.mock import MagicMock, patch


def test_thinking_delta_yielded_from_provider():
    from anthropic_provider import AnthropicProvider

    fake_events = [
        MagicMock(type="content_block_start", content_block=MagicMock(type="thinking")),
        MagicMock(type="content_block_delta", delta=MagicMock(type="thinking_delta", thinking="Step 1: parse...")),
        MagicMock(type="content_block_delta", delta=MagicMock(type="thinking_delta", thinking=" Step 2: query.")),
        MagicMock(type="content_block_stop"),
        MagicMock(type="message_stop"),
    ]
    fake_stream_ctx = MagicMock()
    fake_stream_ctx.__enter__ = lambda self: iter(fake_events)
    fake_stream_ctx.__exit__ = lambda *a: False
    final_msg = MagicMock(content=[],
                          stop_reason="end_turn",
                          usage=MagicMock(input_tokens=1, output_tokens=1))
    fake_stream_ctx.get_final_message = lambda: final_msg

    with patch("anthropic_provider.anthropic.Anthropic") as Anth:
        client = Anth.return_value
        client.messages.stream.return_value = fake_stream_ctx
        provider = AnthropicProvider(api_key="fake")
        events = list(provider.complete_with_tools_stream(
            model="claude-haiku-4-5-20251001",
            system="sys", messages=[{"role": "user", "content": "hi"}],
            tools=[], max_tokens=100,
        ))

    thinking = [e for e in events if e["type"] == "thinking_delta"]
    assert len(thinking) == 2
    assert thinking[0]["text"] == "Step 1: parse..."
    assert thinking[1]["text"] == " Step 2: query."


def test_thinking_disabled_when_flag_off():
    """When the flag is off, the agent does NOT pass `thinking` kwarg to the provider."""
    from config import settings
    assert hasattr(settings, "W2_THINKING_STREAM_ENFORCE")
    assert hasattr(settings, "W2_THINKING_BUDGET_TOKENS")
```

- [ ] **Step 3: Run test to verify it fails**

Run: `python -m pytest tests/test_w2_thinking_stream.py -v`
Expected: FAIL on the second test (config attrs missing) before the config edit, or the first test passes if Task 2 is complete.

- [ ] **Step 4: Wire `thinking` kwarg into provider call**

In `backend/anthropic_provider.py`, modify `complete_with_tools_stream` to accept a `thinking` kwarg:

```python
            stream_kwargs = {
                "model": model,
                "max_tokens": max_tokens,
                "messages": messages,
                "tools": tools,
            }
            if system:
                stream_kwargs["system"] = system
            thinking = kwargs.get("thinking")
            if thinking:
                stream_kwargs["thinking"] = thinking
```

In `backend/agent_engine.py`, in the streaming-call site from Task 2 Step 6, add:

```python
                    thinking_kwarg = None
                    if settings.W2_THINKING_STREAM_ENFORCE:
                        thinking_kwarg = {
                            "type": "enabled",
                            "budget_tokens": settings.W2_THINKING_BUDGET_TOKENS,
                        }
                    for ev in self.provider.complete_with_tools_stream(
                        model=current_model,
                        system=system_prompt,
                        messages=messages,
                        tools=tools_for_provider,
                        max_tokens=max_tokens,
                        thinking=thinking_kwarg,
                    ):
```

(Replace the existing `for ev in self.provider.complete_with_tools_stream(...)` block with this version; only the `thinking_kwarg` and the new `thinking=` kwarg are added.)

- [ ] **Step 5: Run test to verify it passes**

Run: `python -m pytest tests/test_w2_thinking_stream.py -v`
Expected: 2 passed.

- [ ] **Step 6: Frontend collapsible thinking block**

Create `frontend/src/components/agent/ThinkingStreamStep.jsx`:

```jsx
import { useState } from 'react';
import { TOKENS } from '../dashboard/tokens';

export default function ThinkingStreamStep({ step }) {
  const [open, setOpen] = useState(false);
  return (
    <details
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      style={{
        padding: '6px 10px',
        borderRadius: TOKENS.radius.sm,
        background: 'rgba(255,255,255,0.02)',
        border: `1px dashed ${TOKENS.border.muted || 'rgba(255,255,255,0.1)'}`,
        marginBottom: 6,
        fontSize: 12,
        color: TOKENS.text.muted,
      }}
    >
      <summary style={{ cursor: 'pointer', userSelect: 'none', fontStyle: 'italic' }}>
        {open ? '▼' : '▶'} Thinking
      </summary>
      <div style={{ marginTop: 6, whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, monospace' }}>
        {step.content}
      </div>
    </details>
  );
}
```

- [ ] **Step 7: Wire `thinking_delta` dispatch + accumulator**

In `frontend/src/components/agent/AgentStepRenderer.jsx`, add:

```jsx
import ThinkingStreamStep from './ThinkingStreamStep';
// ...
{step.type === 'thinking_delta' && <ThinkingStreamStep step={step} />}
```

The frontend should accumulate consecutive `thinking_delta` events into a single rendered block — the simplest version is to render each delta as a separate row; if the design feels too noisy, a follow-up task can merge consecutive deltas in the Zustand reducer. For Week 2 demo, per-delta rendering is acceptable.

- [ ] **Step 8: Smoke test**

Ask a non-trivial question, expect: collapsible "▶ Thinking" rows appear during synthesis. Click expands. Reasoning text visible.

- [ ] **Step 9: Commit**

```bash
git add backend/anthropic_provider.py backend/agent_engine.py backend/config.py \
        backend/.env.example backend/tests/test_w2_thinking_stream.py \
        docs/claude/config-defaults.md \
        frontend/src/components/agent/ThinkingStreamStep.jsx \
        frontend/src/components/agent/AgentStepRenderer.jsx
git commit -m "feat(phase-k-w2): stream thinking blocks via thinking_delta SSE"
```

---

## Task 4 — Ring 3 Fan-out: DISTINCT-CTE + Multi-Column Join

**Files:**
- Modify: `backend/scope_validator.py:189-210` (extend `_rule_fanout_inflation`)
- Modify: `backend/config.py` (add `W2_FANOUT_DISTINCT_CTE_ENFORCE`)
- Create: `backend/tests/test_w2_fanout_distinct_cte.py`

- [ ] **Step 1: Add config flag**

In `backend/config.py` Phase K block:

```python
W2_FANOUT_DISTINCT_CTE_ENFORCE: bool = Field(
    default=True,
    description=(
        "W2 Task 4 — extend RULE_FANOUT_INFLATION to flag SELECT DISTINCT "
        "CTEs joined on multiple columns (one of which can be many-to-one). "
        "Off → only the legacy COUNT(*) + JOIN check fires."
    ),
)
```

In `backend/.env.example`:

```
W2_FANOUT_DISTINCT_CTE_ENFORCE=True
```

In `docs/claude/config-defaults.md` Phase K block, append:

```
| `W2_FANOUT_DISTINCT_CTE_ENFORCE` | `True` | W2 — extend Rule 2 to detect DISTINCT-CTE multi-column-join blow-up. |
```

- [ ] **Step 2: Write the failing test**

Create `backend/tests/test_w2_fanout_distinct_cte.py`:

```python
"""W2 Task 4 — DISTINCT CTE multi-column-join fan-out detector."""
import pytest
import sqlglot
from scope_validator import _rule_fanout_inflation


def _parse(sql, dialect="bigquery"):
    return sqlglot.parse_one(sql, read=dialect)


def test_distinct_cte_with_two_col_join_is_flagged():
    sql = """
        WITH churned AS (
            SELECT DISTINCT start_station_id, start_station_name
            FROM trips GROUP BY start_station_id, start_station_name
            HAVING DATE_DIFF(CURRENT_DATE(), MAX(DATE(started_at)), DAY) > 30
        )
        SELECT t.*
        FROM trips t
        INNER JOIN churned c
          ON t.start_station_id = c.start_station_id
         AND t.start_station_name = c.start_station_name
    """
    ast = _parse(sql)
    v = _rule_fanout_inflation(ast, sql, ctx={}, dialect="bigquery")
    assert v is not None
    assert "QUALIFY" in v.message or "DISTINCT" in v.message


def test_distinct_cte_with_single_col_join_is_clean():
    sql = """
        WITH churned AS (
            SELECT DISTINCT start_station_id FROM trips GROUP BY start_station_id
        )
        SELECT t.*
        FROM trips t
        INNER JOIN churned c ON t.start_station_id = c.start_station_id
    """
    ast = _parse(sql)
    v = _rule_fanout_inflation(ast, sql, ctx={}, dialect="bigquery")
    assert v is None


def test_legacy_count_star_join_still_flagged():
    sql = """
        SELECT COUNT(*) FROM a INNER JOIN b ON a.id = b.aid
    """
    ast = _parse(sql)
    v = _rule_fanout_inflation(ast, sql, ctx={}, dialect="bigquery")
    assert v is not None
    assert "COUNT(*)" in v.message


def test_no_join_no_distinct_clean():
    sql = "SELECT id FROM trips WHERE casual = 'y' LIMIT 10"
    ast = _parse(sql)
    v = _rule_fanout_inflation(ast, sql, ctx={}, dialect="bigquery")
    assert v is None
```

- [ ] **Step 3: Run test to verify it fails**

Run: `python -m pytest tests/test_w2_fanout_distinct_cte.py -v`
Expected: FAIL on `test_distinct_cte_with_two_col_join_is_flagged` (and possibly the single-col one if the legacy rule false-positives).

- [ ] **Step 4: Extend the rule**

In `backend/scope_validator.py`, replace the body of `_rule_fanout_inflation` with:

```python
@_register("RULE_FANOUT_INFLATION")
def _rule_fanout_inflation(ast, sql: str, ctx: dict, dialect: str):
    import sqlglot.expressions as exp
    from config import settings

    joins = list(ast.find_all(exp.Join))

    # Legacy branch — COUNT(*) over a join.
    if joins:
        for count in ast.find_all(exp.Count):
            inner = count.args.get("this")
            is_star = isinstance(inner, exp.Star)
            is_distinct = bool(count.args.get("distinct"))
            if is_star and not is_distinct:
                return Violation(
                    rule_id=RuleId.FANOUT_INFLATION,
                    message="COUNT(*) across JOIN may inflate due to one-to-many row fan-out; use COUNT(DISTINCT <pk>).",
                    evidence={"join_count": len(joins)},
                )

    # W2 branch — DISTINCT CTE joined on multiple columns.
    if not getattr(settings, "W2_FANOUT_DISTINCT_CTE_ENFORCE", False):
        return None
    if not joins:
        return None

    # Map of CTE alias → set of selected columns when SELECT DISTINCT.
    distinct_cte_cols: dict[str, set[str]] = {}
    with_clause = ast.args.get("with")
    if with_clause is not None:
        for cte in with_clause.expressions:
            inner_select = cte.this if isinstance(cte.this, exp.Select) else None
            if inner_select is None:
                continue
            if not bool(inner_select.args.get("distinct")):
                continue
            cols: set[str] = set()
            for proj in inner_select.expressions:
                col = proj.alias_or_name
                if col:
                    cols.add(col.lower())
            if cols:
                distinct_cte_cols[cte.alias_or_name.lower()] = cols

    if not distinct_cte_cols:
        return None

    # For each join, check if rhs is a DISTINCT CTE with >1 columns AND the join
    # condition uses 2+ columns from that CTE.
    for join in joins:
        rhs = join.this
        rhs_alias = rhs.alias_or_name.lower() if hasattr(rhs, "alias_or_name") else ""
        if rhs_alias not in distinct_cte_cols:
            continue
        cte_cols = distinct_cte_cols[rhs_alias]
        if len(cte_cols) < 2:
            continue
        on = join.args.get("on")
        if on is None:
            continue
        # Count distinct columns from the CTE referenced in the ON expression.
        used_cte_cols: set[str] = set()
        for col in on.find_all(exp.Column):
            tbl = (col.table or "").lower()
            name = (col.name or "").lower()
            if tbl == rhs_alias and name in cte_cols:
                used_cte_cols.add(name)
        if len(used_cte_cols) >= 2:
            return Violation(
                rule_id=RuleId.FANOUT_INFLATION,
                message=(
                    f"INNER JOIN on DISTINCT CTE `{rhs_alias}` uses {len(used_cte_cols)} "
                    "columns; if any column is non-unique within the CTE, rows multiply. "
                    "Either join on the primary key only, or rewrite the CTE with "
                    "`QUALIFY ROW_NUMBER() OVER (...) = 1` to enforce uniqueness."
                ),
                evidence={
                    "cte_alias": rhs_alias,
                    "cte_columns": sorted(cte_cols),
                    "join_columns": sorted(used_cte_cols),
                },
            )
    return None
```

- [ ] **Step 5: Run test to verify it passes**

Run: `python -m pytest tests/test_w2_fanout_distinct_cte.py -v`
Expected: 4 passed.

- [ ] **Step 6: Run the full Ring 3 suite to check for regressions**

```
python -m pytest tests/ -k "scope_validator or fanout" -v
```

Expected: all green. If a prior test now fails because the new branch catches it, inspect the SQL — if it's a true positive, update the test; if a false positive, narrow the heuristic in `_rule_fanout_inflation`.

- [ ] **Step 7: Commit**

```bash
git add backend/scope_validator.py backend/config.py backend/.env.example \
        backend/tests/test_w2_fanout_distinct_cte.py \
        docs/claude/config-defaults.md
git commit -m "feat(phase-k-w2): extend RULE_FANOUT_INFLATION with DISTINCT-CTE branch"
```

---

## Task 5 — Integration & Regression Pass

**Files:**
- Run: full backend pytest suite
- Run: full frontend vitest suite
- Run: smoke test in browser preview

- [ ] **Step 1: Run full backend test suite**

```
cd backend
python -m pytest tests/ -v
```

Expected: same green delta as Week-1 baseline (2076 passed + 1 skipped + 1 pre-existing unrelated failure). New W2 tests (≥13) all pass. No new failures.

- [ ] **Step 2: Run frontend test suite**

```
cd frontend
npm run test:chart-ir
```

Expected: same as before (~22 pre-existing chart-ir failures, no new ones).

- [ ] **Step 3: Smoke test the four scenarios**

Start backend on `:8002` and frontend on `:5173`. With a connection that has no `rider_id` column:

1. Ask "which casual riders churned?" — expect SchemaMismatchCard with [Use station_id as proxy / Abort] buttons. Click "Use station_id as proxy". Expect synthesis prefixed with the disclosure note.
2. Same question, click "Abort" — expect a clean abort message with no further tool calls.
3. With a question that yields a long synthesis — expect partial sentences appearing during synthesis (no blank screen). Expect a "Synthesizing analysis…" italic line at the start.
4. Look for "▶ Thinking" collapsible rows — click to expand, reasoning visible.
5. Run a query with the duplicate-row pattern from the Week-1 post-mortem (DISTINCT CTE + 2-column INNER JOIN) — expect the agent to be told by Ring 3 to rewrite with QUALIFY (replan should happen on the same query before execution).

- [ ] **Step 4: No commit — smoke test only.**

If a smoke test fails, fix in the relevant Task 1-4 worktree and re-commit there.

---

## Self-Review Notes

**Spec coverage:**
- T1 maps to "schema substitution undisclosed" — Ring 4 Gate C. ✓
- T2 maps to "blank screen post-cap" + "Synthesizing… phase" — `message_delta` SSE. ✓
- T3 maps to "thinking process not visible" — `thinking_delta` SSE. ✓
- T4 maps to "duplicate row fan-out bug" — extended `RULE_FANOUT_INFLATION`. ✓

**Type consistency:**
- `MismatchResult` (T1 Step 4) used in T1 Step 7 ✓
- `complete_with_tools_stream` (T2 Step 3) used in T2 Step 6 + T3 Step 4 ✓
- `agent_checkpoint` step type with `kind` discriminator reused from W1 ✓
- `KNOWN_SSE_EVENT_TYPES` extended once with `message_delta`, `thinking_delta`, `synthesizing` ✓

**Placeholders:** none ("TBD" / "implement later" / "similar to Task N" search → 0 hits).

**Known limitation:**
- T3 thinking accumulator is per-delta, not coalesced. Acceptable for demo; coalescing tracked as W3 backlog.
- T4 heuristic is conservative — doesn't statistically prove fan-out, only flags the structural pattern. False-positive rate measured in Step 6.

---

## Adversarial Pass — Pre-Implementation (Run Date: 2026-04-24)

20-operative dispatch returned **0 SOLID, 20 BROKEN/FRAGILE**. Coverage: 7/7 clusters reported. Multiple Strong Attack Signals (≥10/20 on park-loop, streaming, entity detector, fan-out heuristic). The amendments below MUST be folded into each task BEFORE implementation. AMEND-IDs are referenced from the task sections.

### Verdict
**RESTART REQUESTED on T1 + T2 architecture.** T3 + T4 are fixable in-place with the amendments below. T1's park-loop and T2's streaming pipeline have systemic design flaws that require structural changes — not just patches.

### Strong Attack Signals (≥10 analysts converged)
- **S1 — Park-loop is not transactional with `/respond`** (A2, A6, A7, A8, A11, A15, A20). Single shared `_user_response_event` + free-text response field + flag-after-yield ordering. Vocabulary collision with W1 cascade. Cancel signal swallowed by in-loop `event.clear()`.
- **S2 — Streaming pipeline duplicates final synthesis 3× and bypasses W1 banner / claim-provenance / audit-ledger** (A4, A10, A11, A20). Streamed deltas leave the backend before any safety filter runs.
- **S3 — Entity detector substring match without word boundary + missing Unicode skeleton transform** (A5, A16, A20). Cyrillic homoglyphs bypass; "user-agent" / "personality" false-positive flood.
- **S4 — Extended-thinking on Haiku returns 400** (A13). Default `PRIMARY_MODEL=claude-haiku-4-5-20251001` + plan default `W2_THINKING_STREAM_ENFORCE=True` = 100% synthesis failure on demo tenant.

### Amendment Catalog

#### T1 — Schema-Mismatch Gate

**AMEND-W2-01 [P0]** — Sanitize `proxy_suggestions[0]` and `entity` before injection. (Sources: A1 P0-1, A1 P0-2, A15 P0-1.)
Validate column names against `^[A-Za-z_][A-Za-z0-9_]{0,63}$`; strip control chars + bidi overrides; cap length to 64; reject the literal substring `</schema_mismatch_disclosure>`. Assert `entity in {"rider","user","customer","person"}` inside `_build_schema_mismatch_step`. Move directive out of free-text into a structured user-message prefix that the model cannot mistake for system policy.

**AMEND-W2-02 [P0]** — Server-side allowlist on `/respond` consent values. (Sources: A2 F2, A8 N1+N2, A15 P1-6.)
At the endpoint, when the parked checkpoint is `agent_checkpoint` (kind in `tool_input`), validate `req.response.strip().lower() ∈ allowed_values_for_kind` else return 422. The agent-side `(... or "abort").strip().lower()` is defence-in-depth, not the primary gate. Add per-checkpoint `expected_values` field on the `agent_checkpoint` SSE payload.

**AMEND-W2-03 [P0]** — Set `_waiting_for_user = True` BEFORE yielding the checkpoint. (Sources: A6 V-01, A7 P0-1.)
Acquire `self._lock` around the arm phase; flip flags + clear event + null response under the lock; release; THEN yield. Closes the SSE-flush-vs-flag-flip race.

**AMEND-W2-04 [P0]** — Per-park `park_id` (uuid4) bound to checkpoint. (Sources: A6 V-02, A7 P0-3, A17 O-1, A2 F1.)
Server generates uuid4 per checkpoint; embeds in SSE payload; `/respond` requires `park_id` in body and rejects mismatched ids with 409. Eliminates W1/W2 vocabulary collision (cascade reply ≠ mismatch reply because they hold different park_ids), stale-replay attacks, and double-fire across parks.

**AMEND-W2-05 [P0]** — Wait-loop must check `session._cancelled` in predicate; remove inner `event.clear()`. (Sources: A7 P0-2, A11 P0-2.)
```python
while self.memory._user_response is None and not session._cancelled:
    remaining = _deadline - time.monotonic()
    if remaining <= 0: break
    self.memory._user_response_event.wait(timeout=min(remaining, 5.0))
# Single clear AFTER loop, atomically with response read, under lock.
```
Cancel signal is no longer eaten by the in-loop `clear()`. Agent honours `AGENT_CANCEL_GRACE_MS=2000` instead of dragging to wall-clock-hard.

**AMEND-W2-06 [P0]** — Fail-closed on empty schema. (Source: A8 N3.)
If `schema_dict == {}` (profile not loaded OR empty), DO NOT enter the consent loop. Yield an `error` step "Schema not loaded — reconnect or wait for profile" and abort. Prevents consent fatigue from training users to click through.

**AMEND-W2-07 [P0]** — Skeleton transform on entity detector. (Sources: A5 P0-1..P0-4, A16 P0-1, A16 P0-2.)
Replace `_normalize` with TR39 confusable-fold + NFKC + casefold + strip categories `Cf`/`Cc`/`Mn`. Replace substring `in` with word-boundary regex `re.search(rf"\b{sf}\b", nl_norm)`. Add `AMBIGUOUS` return when multiple canonical entities match. Expand synonym list: `patron, guest, client, subscriber, member, driver, passenger, patient, employee, contact`.

**AMEND-W2-08 [P0]** — Persist consent on session memory; gate skip-fire on /continue. (Sources: A17 O-1, A17 O-2.)
Store `memory._schema_mismatch_consent = {entity, proxy, schema_hash, conn_id, park_id}` on resolution. Engine `__init__` rehydrates `self._schema_mismatch_disclosure` from this. Persist into agent_session_store. Gate: `if memory._schema_mismatch_consent and matches((entity, schema_hash, conn_id)): skip_fire`.

**AMEND-W2-09 [P1]** — Audit-ledger consent decision write before disclosure injection. (Source: A6 V-05.)
Hash-chain `{chat_id, park_id, entity, choice, proxy_column, timestamp}` to `.data/audit_ledger`. Required for SOC2/GDPR consent provenance.

**AMEND-W2-10 [P1]** — Reset `_schema_mismatch_disclosure = None` at top of run() per query. (Sources: A6 V-06, A17 O-3, A20 line 2740.)
Stale disclosure must not leak into unrelated turns' system prompts and invalidate prompt cache. Belongs alongside the existing `memory._user_response = None` reset at run() entry.

**AMEND-W2-11 [P1]** — Tighten `_has_matching_id` matcher. (Sources: A16 P1-1.)
Drop the bare `endswith(sfx)` clause; keep only `col == sfx OR col.endswith("_" + sfx) OR col.startswith(sfx + "_")`. Closes `power_user_id`/`overrider_id`/`pauserid` false positives.

#### T2 — Synthesis Streaming

**AMEND-W2-12 [P0]** — Stream loop must have `try/except/finally` with disposition. (Sources: A10 L1, A10 L3, A11 P0-1.)
```python
try:
    for ev in self.provider.complete_with_tools_stream(...): ...
except (anthropic.APIError, httpx.HTTPError) as e:
    yield AgentStep(type="error", content=f"Stream interrupted: {e}")
    salvaged = "".join(accumulated_text)
    final_blocks = [{"type":"text","text": salvaged or "[Generation interrupted]"}]
finally:
    accumulated_text.clear()
```
Provider must yield `{"type":"error", "exception": e}` from inside its `try` and re-raise. Caller treats `final_blocks is None` after loop as `StreamIncompleteError`.

**AMEND-W2-13 [P0]** — Cancel-check inside stream loop. (Sources: A10 L2, A11 P1-5.)
```python
for ev in ...:
    if session._cancelled: return  # GeneratorExit propagates → provider __exit__ closes HTTP socket
```
Closes leaked SSE/HTTP connections after `/cancel`. Without this, the Anthropic billing meter ticks for the user's abandoned query for up to 10 minutes per cancel.

**AMEND-W2-14 [P0]** — Per-stream byte cap. (Sources: A4 BLOCK 1+3, A11 P1-4.)
`MAX_STREAM_BYTES=2_000_000`. On overflow, yield `stream_error` SSE event, abort, drain provider, terminate iteration. Prevents OOM from runaway model + double-accumulator (deltas + SDK final).

**AMEND-W2-15 [P0]** — Suppress legacy thinking-step emit when streaming active. (Source: A20 P0-2.)
Gate `agent_engine.py:2453-2465` with `if not use_stream:` so the existing `thinking_step = AgentStep(type="thinking", content=content)` does NOT fire on streamed turns. Eliminates triplicate display (stream + thinking-step + result-step).

**AMEND-W2-16 [P0]** — Empty-BoundSet banner emitted as the FIRST `message_delta` chunk. (Source: A20 P0-1.)
When `_detect_empty_boundset()` is True at synthesis-turn entry, yield the banner as the first `message_delta` BEFORE the streaming loop. Prevents bare unverified text from streaming to the UI ahead of the warning.

**AMEND-W2-17 [P0]** — Gate streaming OFF when `FEATURE_CLAIM_PROVENANCE=True`. (Source: A20 P0-3.)
Until per-token claim-binding ships in W3, streaming bypasses the per-claim provenance invariant (a `security-core.md` non-negotiable). Add a runtime guard: `use_stream = settings.W2_SYNTHESIS_STREAMING_ENFORCE and self._tool_calls > 0 and not settings.FEATURE_CLAIM_PROVENANCE`. Document explicit W3 follow-up.

**AMEND-W2-18 [P1]** — `KNOWN_SSE_EVENT_TYPES.update({...})` not `=`. (Source: A20 P1-4.)
Replace the wholesale `=` reassignment in T2 Step 5 with `.update({"thinking_delta", "synthesizing", "stream_error", "message_stop"})`. Verbatim copy of the plan's literal block would silently delete `step_phase`, `step_detail`, `safe_abort`, `claim_chip`, `result_preview`, `cancel_ack`.

**AMEND-W2-19 [P1]** — `turn_id` + `block_index` on every yielded delta. (Sources: A9 B1, B2, B4.)
Provider yields `{"type":"text_delta", "text":..., "turn_id":..., "block_index":..., "block_kind":...}`. Frontend dispatches by (turn_id, block_index). Emit `message_stop` SSE on `content_block_stop`. Closes cross-turn / cross-block thinking attribution leak.

**AMEND-W2-20 [P1]** — Fresh `AnthropicProvider` per agent run OR per-run breaker scope. (Source: A9 B3.)
Per-key breaker shared across concurrent runs causes Run B's failure to trip Run A's still-streaming synthesis. Scope breaker by `(api_key, agent_run_id)` OR instantiate fresh provider per run.

**AMEND-W2-21 [P1]** — Prefer streamed `accumulated_text` over `final_blocks` text on divergence. (Source: A10 L4.)
Reconcile at end of stream: if streamed text and `final_msg.content[0].text` differ, log drift to audit ledger and patch `final_blocks` with the streamed text. Prevents user-saw-X / history-records-Y provenance break.

#### T3 — Thinking Stream

**AMEND-W2-22 [P0]** — Capability gate; never pass `thinking` kwarg on non-capable models. (Source: A13 K1.)
Add `THINKING_CAPABLE = {"claude-sonnet-4-5-20250514","claude-sonnet-4-6","claude-opus-4-7-1m-20260115"}` to `anthropic_provider.py`. Expose `provider.supports_extended_thinking(model)`. In agent engine: `thinking_kwarg = thinking_kwarg if provider.supports_extended_thinking(current_model) else None`. Closes "every Haiku synthesis 400s" demo blocker.

**AMEND-W2-23 [P0]** — `BadRequestError` (400) MUST NOT trip the per-key breaker. (Source: A13 K2.)
Classify exceptions before `record_failure()`. 400 is deterministic client bug, not flaky upstream. Without this, K1 cascades into 30s full-account blackout.

**AMEND-W2-24 [P0]** — Pin `anthropic>=0.49,<0.60` in `requirements.txt` + lock regen. (Sources: A13 K3, A14 V-K2-07.)
Startup capability probe: `try: from anthropic.types... import ThinkingConfigEnabled` else log warning + force-disable thinking. Document SDK floor in `config-defaults.md` next to `W2_THINKING_BUDGET_TOKENS`.

**AMEND-W2-25 [P0]** — Handle `redacted_thinking` blocks + `signature_delta`. (Sources: A14 V-K2-01, V-K2-02, A13 K8.)
- `cb.type == "redacted_thinking"` → yield `{"type":"redacted","data": cb.data}`; preserve verbatim for replay.
- Capture `signature_delta`; attach to accumulated thinking block at `content_block_stop`.
- On next tool-loop turn, echo prior assistant turn's thinking blocks UNCHANGED (Anthropic API contract; otherwise 400).

**AMEND-W2-26 [P1]** — Cumulative thinking-token cap across iterations. (Sources: A11 P0-3, A12 P0-2.)
Track `self._thinking_tokens_used` across the tool loop. Per-call `budget_tokens = max(1024, W2_THINKING_TOTAL_BUDGET - used)`. New constant `W2_THINKING_TOTAL_BUDGET=8000` per query. Drop `thinking` kwarg when budget exhausted. Closes 20-iteration × 2000-token cost amplification.

**AMEND-W2-27 [P1]** — Validate `budget_tokens < max_tokens` before passing. (Source: A13 K7.)
If `thinking["budget_tokens"] >= max_tokens`, clamp to `max_tokens - 256`; if result `< 1024` (API min), drop thinking entirely with warning log. Prevents 400s on small-result paths.

#### T4 — Fan-Out Detector

**AMEND-W2-28 [P0]** — Dialect-branched remediation message. (Source: A19 P0-007.)
Branch on `dialect`:
- `{bigquery, snowflake, databricks, teradata}` → suggest `QUALIFY ROW_NUMBER() OVER (...) = 1`
- `{postgres, redshift, mysql>=8, sqlite>=3.25}` → suggest `ROW_NUMBER() OVER (...) inside subquery + outer WHERE rn = 1`
- `{mysql<8}` → suggest "rewrite using GROUP BY with aggregates over non-key columns"
- unknown → emit dialect-agnostic alternative ("drop redundant join column") only
Round-trip parse test per dialect. Closes the trust-damage of confidently-wrong remediation on >50% of supported dialects.

**AMEND-W2-29 [P0]** — Cover `SELECT DISTINCT *`, `USING (...)`, unqualified columns, inline subquery, GROUP BY equivalence. (Sources: A18 P0s, A19 P0-001+003.)
- `SELECT DISTINCT *` → mark CTE/subquery as "distinct-wide"; require ≥2 distinct ON-side columns from rhs alias.
- `USING (a, b)` → walk `join.args["using"]` identifiers; feed same `used_cte_cols` accumulator.
- Unqualified column on rhs side → if `tbl == "" and name in cte_cols`, count it.
- Inline `(SELECT DISTINCT a, b FROM t) sub` → walk `exp.Subquery` whose `.this` is `Select with distinct`; populate same registry.
- `GROUP BY a, b` (no DISTINCT) joined on (a, b) → treat GROUP BY keys as distinct-equivalent.

**AMEND-W2-30 [P1]** — Skip recursive CTEs (`exp.Union`) with explicit log. (Sources: A18, A19 P1-004.)
`if isinstance(cte.this, exp.Union): continue` plus a debug log. Recursive CTE distinctness is non-trivial and out of W2 scope; explicit skip prevents silent FN.

**AMEND-W2-31 [P1]** — Resolve alias→CTE-name before lookup; close self-join blind spot. (Source: A18 P1.)
Build alias-to-CTE-identity map from FROM/JOIN tree first; key `distinct_cte_cols` lookup by resolved CTE identity, not by raw `rhs.alias_or_name`.

### Adversarial Pass #2 — T1 Gate C Re-Run (2026-04-24)

Second 20-operative dispatch scoped **only** to Gate C after Day-2 park-registry ship. 20/20 returned valid. Coverage **7/7 clusters**. Verdict: **FRAGILE (not RESTART)** — existing AMEND-01..31 close the park-loop + detector; remaining holes below are schema-shape + replan-loop + tenant-boundary + cross-park collision. Fold before T1 implementation.

**Triage table (P0/P1 only, deduplicated across analysts):**

| ID | Priority | Blast | Surface | Finding (reproduce) |
|---|---|---|---|---|
| P2-01 | P0 | SYSTEMIC | schema shape | `subscriber_uuid`/`member_hash`/`driver_code`/`customer_ref` not matched by AMEND-11 suffix rules → Gate C silent on valid rider schemas under synonym naming. Repro: coverage card with cols `{id, subscriber_uuid, trip_count}`, NL `"top riders"` → `_has_matching_id("rider", cols)` returns False via AMEND-11 — correct fire — but NL `"top subscribers"` on same schema → entity `"subscriber"` → AMEND-11 checks `subscriber_id` only, misses `subscriber_uuid` → false-negative pass-through. |
| P2-02 | P0 | LATERAL | question-schema gap | NL `"revenue per user"` + `orders` table has `customer_id` (no `user_id`) → Gate C fires (correct), but response `"station-proxy"` → agent replans with `"revenue per customer"` → Gate C fires AGAIN next turn (entity churned rider→customer through synonym) → infinite replan. Replan budget exhausted → safe_abort; demo-breaking loop. |
| P2-03 | P0 | SYSTEMIC | tenant isolation | `coverage_cards_by_table` accessed by raw `table_name` key — cross-tenant cards in same process memory collide on shared table names (`users`, `orders`). H7 composite-key violation. Repro: tenant A has rider schema; tenant B does not. B's agent call hits A's card → Gate C silent on B. |
| P2-04 | P0 | LATERAL | view/alias | Legit rider schema exposed only as view `rider_v` over base `users` (with `user_id`). Coverage card profiled at view level → view cols `{name, trip_count}` → no id col → Gate C fires on legit schema → false-positive consent fatigue. |
| P2-05 | P0 | LATERAL | cross-park collision | Same tool-loop turn: W1 error-cascade park arms (vocab `{retry, summarize, change_approach}`), Gate C wants to arm (vocab `{station-proxy, abort}`). Both write legacy `_user_response` mirror. User clicks "retry" → W1 park resolves + Gate C park reads same string → 422 (not in allowlist) but legacy mirror already consumed. Ordering non-deterministic. |
| P2-06 | P1 | CONTAINED | flag matrix | `W2_SCHEMA_MISMATCH_GATE_ENFORCE=True` + `FEATURE_DATA_COVERAGE=False` → gate always fail-open (no cards), silent to user, trains away the grounding signal. No alert. |
| P2-07 | P1 | CONTAINED | echo serializer | Gate C emits raw `["station-proxy","abort"]` strings; `IntentEchoCard.interpretations: List[Interpretation]` — serializer breaks on bare strings (TypeError at `.dict()`), falls through to generic echo, options lost. |
| P2-08 | P1 | CONTAINED | audit gap | AMEND-09 writes consent on resolve but NOT on skip-fire (AMEND-08 cache hit). GDPR Art. 7(1) demonstrable-consent — reuse of prior consent still requires audit entry keyed to current `park_id=NULL, reused_from=<prior_park>`. |

**Strong Attack Signals (≥10/20 across both passes):** S1 park-loop transactionality (confirmed closed by AMEND-02..05+Day-2 ship). S3 entity detector (closed by AMEND-07). **New S5** — schema-shape blindness on synonym id columns (10/20 analysts converged; Pass #2). **New S6** — replan-loop via entity-churn consent-key mismatch (11/20).

**AMEND-W2-32 [P0]** — Synonymic id-column detection. (Source: P2-01, A6 structural-blindness follow-up.)
Extend `_has_matching_id` to accept suffix set `{"_id","_uuid","_hash","_code","_key","_ref","_sk","_pk"}` AND prefix `"id_"`. Additionally check equality with `entity_canonical` form. Add `CANONICAL_ENTITIES: dict[str,str]` mapping `{customer,client,patron,buyer} → "customer"`, `{user,account,login,username} → "user"`, `{rider,passenger} → "rider"`, `{subscriber,member} → "subscriber"`, `{driver} → "driver"`. Detector resolves NL entity to canonical BEFORE id-column lookup; lookup matches any canonical or synonym suffix form.
```python
def _has_matching_id(entity: str, cols: set[str]) -> bool:
    canon = CANONICAL_ENTITIES.get(entity.lower(), entity.lower())
    synonyms = {k for k,v in CANONICAL_ENTITIES.items() if v == canon} | {canon}
    SFX = ("_id","_uuid","_hash","_code","_key","_ref","_sk","_pk")
    for c in cols:
        cl = c.lower()
        for syn in synonyms:
            if cl == syn or cl == f"id_{syn}": return True
            if any(cl == f"{syn}{s}" or cl.endswith(f"_{syn}{s}") for s in SFX): return True
    return False
```
Round-trip unit tests: `{subscriber_uuid}` w/ `"rider"` (canon=rider, no match → fire), `{subscriber_uuid}` w/ `"member"` (canon=subscriber → match → skip), `{customer_ref}` w/ `"user"` (canon=user, no match → fire), `{user_id}` w/ `"customer"` (canon=customer, no match → fire). Closes P2-01 + false-positive AMEND-11 regression risk.

**AMEND-W2-33 [P0]** — Tenant-scoped coverage-card lookup. (Source: P2-03, H7 composite-key invariant.)
`DataCoverageRegistry.get(tenant_id, conn_id, table_name)` — composite-keyed by `tenant_fortress.composite_key(tenant, conn, user)`. Gate C MUST call the registry with the session's `(tenant_id, conn_id)`; raw dict lookup banned. Runtime assert: `assert card.tenant_id == session.tenant_id and card.conn_id == session.conn_id`. Cache-key collision on shared table names impossible after this amendment. Add test `test_tenant_fortress_isolation` in `backend/tests/test_w2_gate_c.py`.

**AMEND-W2-34 [P0]** — Consent cache keyed to canonical entity + schema hash; replan-loop guard. (Sources: P2-02, A17 O-1+O-2 follow-up.)
AMEND-08 cache key becomes `(tenant_id, conn_id, entity_canonical, schema_hash)` — NOT raw entity. Entity churn (rider→subscriber→customer via synonym expansion) resolves to SAME canonical → single consent covers the equivalence class. Additionally: Gate C fire decrements `ReplanBudget.consume(session)`; budget exhausted → emit `safe_abort` step with cause `"schema_mismatch_replan_exhausted"`, do NOT re-arm. Closes infinite-loop DOS + ensures one consent per query regardless of entity-churn replans.

**AMEND-W2-35 [P0]** — View/alias base-table resolution before id-column check. (Source: P2-04.)
Before concluding no id column, walk `schema_intelligence.resolve_base_tables(view_name)` to get underlying base tables; union their id-column sets. Gate C fires only if BOTH view AND all base tables lack canonical id column. Honors legit aliased schemas. Fail-open if resolver raises (log telemetry `coverage_view_resolve_failed`). Test: `rider_v → users(user_id)` with NL `"top riders"` → skip-fire (base table has id).

**AMEND-W2-36 [P0]** — Per-turn single-park serialization. (Source: P2-05, S1 reinforcement.)
`ParkRegistry.arm(park_id, ...)` refuses arm if session already has an unresolved park in current turn. W1 cascade arms first (priority: error > intent_echo); Gate C blocks until W1 resolves OR yields sibling `agent_checkpoint_deferred` step. Agent tool-loop honors single-park-per-turn invariant. Legacy `_user_response` mirror now gated on `park_id` presence (AMEND-W2-06 of Day-2 done) — no cross-park leak because only one park exists. Add integration test `test_w1_and_gate_c_same_turn` simulating both conditions true.

**AMEND-W2-37 [P1]** — Explicit flag matrix validation at startup. (Source: P2-06.)
`main.py` lifespan checks: `if W2_SCHEMA_MISMATCH_GATE_ENFORCE and not (FEATURE_INTENT_ECHO and FEATURE_DATA_COVERAGE): log.warning("Gate C flag set but prerequisites disabled — gate will fail-open")`. Emit `grounding_flag_mismatch` telemetry counter on every agent run when inconsistent. Surface in admin `/cache-stats` dashboard.

**AMEND-W2-38 [P1]** — Typed `Interpretation` wrapper for Gate C consent options. (Source: P2-07.)
`_build_schema_mismatch_step` wraps options as `[Interpretation(kind="consent_choice", canonical_value="station_proxy", display_label="Use station/region proxy"), Interpretation(kind="consent_choice", canonical_value="abort", display_label="Abort query")]`. `IntentEchoCard.interpretations` accepts typed list; `/respond` allowlist (AMEND-02) reads `canonical_value` set. Frontend renders `display_label`; server validates `canonical_value`. Serializer round-trip test required.

**AMEND-W2-39 [P1]** — Audit entry on consent-cache reuse. (Source: P2-08, GDPR Art. 7(1).)
AMEND-09 hash-chain extended: on AMEND-34 cache-hit skip-fire, write audit entry `{chat_id, park_id: null, reused_from: <prior_park_id>, entity_canonical, schema_hash, reused_at: ts}`. Required for demonstrable consent provenance across multi-turn sessions.

**Coverage Score:** Pass #2 — 7/7 clusters returned; 0 SOLID / 8 FRAGILE / 12 confirming prior SIGNALS. Combined Pass #1+#2 coverage: all known attack surfaces on T1 Gate C now have an amendment. **Proceed to implementation once AMEND-32..39 are folded into T1a/T1b/T1c/T1d subtasks.**

**UFSD Adversarial Pass #2 (2026-04-24 T1-rerun):**
Verdict: FRAGILE (no RESTART) | Coverage: 7/7 | New Strong Signals: S5 schema-synonym-blindness, S6 replan-loop entity-churn | Amendments added: AMEND-W2-32..39 | No systemic BROKEN persists after fold.

### Required Plan Restructuring

Per the Strong Attack Signal count (4) and the standing rule "Adversarial-before-plans", T1 and T2 should be split into sub-tasks reflecting the amend list:

- **T1a** — schema-mismatch detector (AMEND-07, 11, **32** synonym id + canonical entity map, **35** view/alias resolver)
- **T1b** — sanitised disclosure builder (AMEND-01, **38** typed Interpretation wrappers)
- **T1c** — **SHIPPED Day 2** (`backend/agent_park.py` + `ParkRegistry` on `SessionMemory.parks`). No additional implementation required. AMEND-02, 03, 04, 05, **36** all addressed by Day 2 primitive. AMEND-36 (single-park-per-turn) verified by Day-2 test `test_w1_cascade_and_gate_c_serialize` (deferred to T1d integration test).
- **T1d** — fail-closed schema gate + consent persistence (AMEND-06, 08, 09, 10, **33** tenant-scoped card registry, **34** canonical-consent cache + replan budget guard, **37** flag-matrix validation, **39** reuse-audit entry)

- **T2a** — `complete_with_tools_stream` provider with try/except/finally + cancel + byte-cap (AMEND-12, 13, 14, 21)
- **T2b** — agent-engine streaming hook with banner-first + thinking-step suppression + capability gate (AMEND-15, 16, 17, 22)
- **T2c** — SSE event allowlist + turn_id/block_index + provider scope (AMEND-18, 19, 20)

- **T3** — thinking pass-through with capability gate + breaker classifier + SDK pin + redacted+signature handling + cumulative budget (AMEND-22..27)

- **T4** — fan-out detector with dialect-branched remediation + DISTINCT-* + USING + GROUP BY + alias resolver (AMEND-28..31)

### UFSD Adversarial-Testing — 2026-04-24
Verdict: **RESTART REQUESTED** | Coverage: 7/7 clusters returned, 0 SOLID
Strong Attack Signals: S1 park-loop (≥7 analysts), S2 streaming (≥4), S3 entity detector (≥3), S4 Haiku capability (≥1, deterministic).
Required: fold AMEND-01..31 into the plan + restructure T1/T2 per the sub-task split BEFORE any task implementation begins.
Escalation: If sub-task split is rejected, escalate to `ultraflow:council` for architectural review of W1/W2 park-loop unification (recommended fix: introduce `_park_for_user_response(park_id, expected_values, default_on_timeout)` helper used by all three sites: ask_user, W1 cascade, W2 mismatch).
