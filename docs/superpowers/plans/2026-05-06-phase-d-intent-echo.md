# Grounding Stack v6 — Phase D (Ring 4: IntentEcho + H4/H5/H12) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Frontend tasks (T14, T15):** Before writing UI code, invoke the `impeccable` skill and the `taste-skill` (see user memory `feedback_frontend_skills.md`). The card must match the existing AskDB Agent chat visual language (light theme: `oklch` neutral tints; dark theme: Zinc/Slate base). No emoji. Use `@phosphor-icons/react`. Labels outside cards.

**Goal:** Build Ring 4 — an operational-definition card emitted between SQL generation and answer-streaming that makes silent clause drops, terminology rewrites, unstated baselines, and cohort re-definitions visible + user-correctable in one click. Fires conditionally on an LLM-computed ambiguity score. Plus H12 semantic registry with version drift detection, H5 non-interactive conservative mode with voice TTS readback, and the Phase C carry-forward: wire `ReplanBudget` → Ring 3 violations → single replan turn.

**Architecture:** Six new backend modules (`intent_echo.py`, `ambiguity_detector.py`, `clause_inventory.py`, `pinned_receipts.py`, `semantic_registry.py`, `drift_detector.py`, `replan_controller.py`), two `schema_intelligence.py` extensions (`tz_aware_columns`, `soft_delete_columns` — back-fills Phase C rules 4 + 5), two agent-engine hook points (`_emit_intent_echo_if_ambiguous`, `_handle_scope_violations_with_replan`), one new SSE event type (`intent_echo`), one new REST endpoint (`POST /api/v1/agent/echo-response`), one new React component `IntentEcho.jsx`. Ring 4 is prompt-layer + UI; everything else is code.

**Tech Stack:** Python 3.10+, Anthropic Claude Haiku 4.5 (primary — clause extraction prompt, ~300 tokens out), sqlglot (already pinned — for clause validator), existing `SessionMemory` compaction system (modified to honor pinned receipts), Phase B `DataCoverageCard` (contextual cohort inference), Phase C `ScopeValidator` + `ReplanBudget`. Frontend: React 19 + Zustand + existing SSE client + `@phosphor-icons/react`, no new deps. Design direction per `impeccable` + `taste-skill`: restrained, editorial, WCAG AA, Framer Motion layout transitions for the reveal.

**Scope — Phase D covers vs defers:**
- ✅ Core `IntentEcho` + ambiguity score + clause inventory + pinned receipts
- ✅ Three firing modes (auto-proceed / Proceed-button / mandatory-choice pills) per H4
- ✅ Auto-downgrade telemetry (`<500ms` pause streak → force mandatory-choice)
- ✅ `SchemaProfile.tz_aware_columns` + `SchemaProfile.soft_delete_columns` (back-fills Phase C Rules 4 + 5)
- ✅ Replan controller — consume ReplanBudget, re-invoke SQL gen with violation context
- ✅ Non-interactive conservative mode (voice / scheduled / bulk / embedded-iframe)
- ✅ Voice mode TTS readback (`*"I'm reading this as {definition}. Say confirm or change."*`)
- ✅ H12 SemanticRegistry with `valid_from / valid_until` per definition
- ✅ H12 DriftDetector — merger detection + denormalization drift + fiscal-calendar mismatch
- ✅ Frontend `IntentEcho.jsx` component (three-mode UI) + Zustand wiring + SSE event
- ✅ `trap_intent_drop.jsonl` (15 Qs) + 3 new oracle types (`must_emit_intent_echo`, `must_include_clause`, `must_not_drop_clause`)
- ✅ Baseline committed, CI gated, exit gate
- ⛔ **Deferred:** ProvenanceChip rendering (Phase E), tier-calibration telemetry (Phase E), `mask_dataframe()` on intent-echo clause values (Phase E), chaos isolation (Phase E), multi-tenant isolation keys (Phase E), skill bundles (Phase G), famous-dataset detector (Phase G).

---

## Prerequisites

- [ ] Branch `askdb-global-comp` at or after Phase C exit gate.
- [ ] `python -m pytest backend/tests/ -v` green (≥1540 pass, 1 skip).
- [ ] Phase C modules import cleanly: `scope_validator`, `replan_budget`, `validator_state`.
- [ ] `AgentEngine._run_scope_validator()` present.
- [ ] `waterfall_router.validate_scope()` present.
- [ ] `backend/data_coverage.py` exposes `DataCoverageCard` (Phase B).
- [ ] Fixture DB present: `python -m backend.tests.fixtures.eval_seed %TEMP%\eval_fixture.sqlite`.
- [ ] Read master plan Ring 4 section + H4 + H5 + H12 specs.

---

## File Structure

| Path | Create/Edit | Purpose |
|---|---|---|
| `backend/intent_echo.py` | Create | `IntentEchoCard` dataclass + `build_echo()` + SSE payload serializer |
| `backend/ambiguity_detector.py` | Create | Deterministic + LLM-backed ambiguity scorer (0.0–1.0) |
| `backend/clause_inventory.py` | Create | LLM-driven clause extraction + plan-element mapping validator |
| `backend/pinned_receipts.py` | Create | Per-session receipt store outside sliding-compaction window |
| `backend/semantic_registry.py` | Create | Versioned metric-definition registry with `valid_from/until` (H12) |
| `backend/drift_detector.py` | Create | Mergers + denorm-drift + fiscal-calendar detectors (H12) |
| `backend/replan_controller.py` | Create | Consume ReplanBudget on Ring-3 violation → re-invoke SQL gen |
| `backend/schema_intelligence.py` | Modify | Add `tz_aware_columns` + `soft_delete_columns` to profile |
| `backend/agent_engine.py` | Modify | Emit echo before stream; handle user response; replan on violation |
| `backend/routers/agent_routes.py` | Modify | New SSE event `intent_echo`; new endpoint `POST /echo-response` |
| `backend/tests/test_intent_echo.py` | Create | Card assembly + SSE payload unit tests |
| `backend/tests/test_ambiguity_detector.py` | Create | Scoring thresholds + feature-weight tests |
| `backend/tests/test_clause_inventory.py` | Create | Extraction + unmapped-clause detection (with mock LLM) |
| `backend/tests/test_pinned_receipts.py` | Create | Pin + read + compaction-survival tests |
| `backend/tests/test_semantic_registry.py` | Create | Version registration + time-range lookup |
| `backend/tests/test_drift_detector.py` | Create | Merger / denorm / fiscal mismatch tests |
| `backend/tests/test_replan_controller.py` | Create | Budget-exhausted behaviour + replan context assembly |
| `backend/tests/test_schema_intel_phase_d.py` | Create | tz_aware + soft_delete extensions |
| `backend/tests/test_agent_echo_integration.py` | Create | End-to-end hook wired in AgentEngine |
| `backend/tests/test_non_interactive_mode.py` | Create | Conservative-mode banner + voice readback |
| `backend/tests/trap_intent_drop.jsonl` | Create | 15 Qs covering clause drops + terminology rewrites + unstated baselines |
| `backend/tests/trap_grader.py` | Modify | Add 3 new Ring-4 oracle types |
| `backend/tests/test_trap_grader_ring4.py` | Create | Unit tests for new oracles |
| `.data/intent_drop_baseline.json` | Create (committed, H13) | Mock-suite baseline |
| `.github/workflows/agent-traps.yml` | Modify | Gate `trap_intent_drop` |
| `frontend/src/components/agent/IntentEcho.jsx` | Create | Three-mode UI component (auto / proceed / mandatory-choice) |
| `frontend/src/components/agent/IntentEcho.test.jsx` | Create | RTL component tests |
| `frontend/src/store.js` | Modify | Zustand: `pendingIntentEcho`, `echoPauseMs`, `echoAutoDowngrade` |
| `frontend/src/api.js` | Modify | `postEchoResponse(sessionId, choice)` |
| `frontend/src/pages/Chat.jsx` | Modify | Render `<IntentEcho>` when `pendingIntentEcho` set |
| `backend/config.py` | Modify | 12 new flags |
| `docs/claude/config-defaults.md` | Modify | "Intent Echo (Phase D — Ring 4)" section |

---

## Track D — Ring 4 IntentEcho

### Task 0: Config flags + feature gates

**Files:**
- Modify: `backend/config.py`
- Modify: `docs/claude/config-defaults.md`

- [ ] **Step 1: Add config fields**

Open `backend/config.py`. Find the "Scope Validator (Phase C — Ring 3)" block. Add immediately below it:

```python
    # ── Intent Echo (Phase D — Ring 4) ──
    FEATURE_INTENT_ECHO: bool = Field(default=True)
    ECHO_AMBIGUITY_AUTO_PROCEED_MAX: float = Field(default=0.3)   # <0.3 → no card
    ECHO_AMBIGUITY_MANDATORY_CHOICE_MIN: float = Field(default=0.7)  # >0.7 → pills
    ECHO_AUTO_DOWNGRADE_PAUSE_MS: int = Field(default=500)        # rubber-stamp threshold
    ECHO_AUTO_DOWNGRADE_STREAK: int = Field(default=3)            # N consecutive = force pills
    ECHO_LLM_MAX_TOKENS: int = Field(default=512)                 # clause extraction cap
    # Non-interactive mode (H5)
    NON_INTERACTIVE_MODE_CONSERVATIVE: bool = Field(default=True)
    VOICE_MODE_READBACK_AMBIGUITY_MIN: float = Field(default=0.5)
    # Semantic Registry (H12)
    FEATURE_SEMANTIC_REGISTRY: bool = Field(default=True)
    SEMANTIC_REGISTRY_DIR: str = Field(default=".data/semantic_registry")
    # Drift Detector (H12)
    FEATURE_DRIFT_DETECTOR: bool = Field(default=True)
    FISCAL_YEAR_START_MONTH: int = Field(default=1)              # 1 = January (calendar year)
```

- [ ] **Step 2: Update config-defaults.md**

Open `docs/claude/config-defaults.md`. Find the "Scope Validator (Phase C — Ring 3)" section. Add new section immediately below it:

```markdown
### Intent Echo (Phase D — Ring 4)

| Constant | Value | Notes |
|---|---|---|
| `FEATURE_INTENT_ECHO` | `True` | Master switch. Off → skip card entirely. |
| `ECHO_AMBIGUITY_AUTO_PROCEED_MAX` | `0.3` | Scores ≤ this → no card emitted (auto-proceed). |
| `ECHO_AMBIGUITY_MANDATORY_CHOICE_MIN` | `0.7` | Scores ≥ this → mandatory-choice pills (no generic Proceed). |
| `ECHO_AUTO_DOWNGRADE_PAUSE_MS` | `500` | User pause < this counts toward rubber-stamp streak. |
| `ECHO_AUTO_DOWNGRADE_STREAK` | `3` | N consecutive rubber-stamps → force mandatory-choice next time. |
| `ECHO_LLM_MAX_TOKENS` | `512` | Clause extraction Haiku call output cap. |
| `NON_INTERACTIVE_MODE_CONSERVATIVE` | `True` | Voice/scheduled/bulk/embedded → widest defensible scope + banner. |
| `VOICE_MODE_READBACK_AMBIGUITY_MIN` | `0.5` | Score ≥ this in voice mode → TTS readback required. |
| `FEATURE_SEMANTIC_REGISTRY` | `True` | H12 versioned metric definitions. |
| `SEMANTIC_REGISTRY_DIR` | `.data/semantic_registry` | Per-connection JSON registry. |
| `FEATURE_DRIFT_DETECTOR` | `True` | H12 mergers + denorm + fiscal drift detection. |
| `FISCAL_YEAR_START_MONTH` | `1` | 1 = January; change for fiscal-year tenants. |
```

- [ ] **Step 3: Sanity check**

Run: `cd "QueryCopilot V1/backend" && python -c "from config import settings; print(settings.FEATURE_INTENT_ECHO, settings.ECHO_AMBIGUITY_MANDATORY_CHOICE_MIN)"`
Expected: `True 0.7`

- [ ] **Step 4: Commit**

```bash
git add backend/config.py docs/claude/config-defaults.md
git commit -m "feat(phase-d): config flags for Ring-4 IntentEcho + H5/H12"
```

---

### Task 1: Ambiguity detector

**Files:**
- Create: `backend/ambiguity_detector.py`
- Create: `backend/tests/test_ambiguity_detector.py`

**Design:** Combine a cheap deterministic heuristic (feature score: terminology overlap, plural forms, missing temporal scope, multi-meaning verbs) with an optional LLM second opinion when deterministic score is in `[0.35, 0.65]` gray zone. LLM call gated by `FEATURE_INTENT_ECHO`.

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_ambiguity_detector.py`:

```python
"""Ambiguity detector — feature-weighted 0..1 scoring."""
import pytest

from ambiguity_detector import (
    score_ambiguity, AmbiguityFeatures, _deterministic_score,
)


def test_unambiguous_simple_count_scores_low():
    score = score_ambiguity(
        nl="how many users are there",
        sql="SELECT COUNT(*) FROM users",
        tables_touched=["users"],
    )
    assert score < 0.3


def test_churn_without_definition_scores_high():
    """'churn' has no single industry definition — should trigger card."""
    score = score_ambiguity(
        nl="why are casual riders churning",
        sql="SELECT user_id FROM trips GROUP BY user_id",
        tables_touched=["trips"],
    )
    assert score >= 0.7


def test_missing_temporal_scope_raises_score():
    """'recently' without a date is ambiguous."""
    score = score_ambiguity(
        nl="show recently active users",
        sql="SELECT * FROM users",
        tables_touched=["users"],
    )
    assert score >= 0.3


def test_multi_meaning_verb_raises_score():
    """'active' can mean logged-in / still-subscribed / ordered-recently."""
    score = score_ambiguity(
        nl="count active customers",
        sql="SELECT COUNT(*) FROM customers WHERE active=1",
        tables_touched=["customers"],
    )
    assert score >= 0.3


def test_features_object_roundtrip():
    f = AmbiguityFeatures(
        has_fuzzy_term=True,
        missing_temporal=False,
        multi_meaning_verb=True,
        cohort_implicit=False,
        baseline_implicit=True,
    )
    assert _deterministic_score(f) > 0


def test_scores_clamped_to_01():
    assert 0.0 <= score_ambiguity("x", "SELECT 1", []) <= 1.0
    assert 0.0 <= score_ambiguity(
        "churn rate segmentation by cohort baseline average trend recent",
        "SELECT 1",
        [],
    ) <= 1.0
```

- [ ] **Step 2: Run to verify fail**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_ambiguity_detector.py -v`
Expected: FAIL — `ModuleNotFoundError: ambiguity_detector`

- [ ] **Step 3: Implement**

Create `backend/ambiguity_detector.py`:

```python
"""Ring 4 — AmbiguityDetector.

Feature-weighted ambiguity score in [0.0, 1.0]. Higher = more ambiguous.

Features:
  has_fuzzy_term        — NL contains churn/retention/active/engaged/etc.
  missing_temporal      — NL lacks any date/relative-time expression
  multi_meaning_verb    — NL contains active/running/closed/etc.
  cohort_implicit       — NL compares without explicit population
  baseline_implicit     — NL says "better/worse/faster/more" without reference

Deterministic first. LLM second opinion (Phase D+) gated on gray zone.
"""
from __future__ import annotations

import re
from dataclasses import dataclass


_FUZZY_TERMS = {
    "churn", "retention", "engagement", "engaged", "loyalty",
    "lifetime value", "ltv", "cohort", "funnel", "conversion",
    "attrition", "dropout", "revenue recognition", "arr", "mrr",
}

_MULTI_MEANING_VERBS = {
    "active", "running", "closed", "open", "completed",
    "pending", "approved", "resolved", "stale", "expired",
}

_TEMPORAL_HINTS = {
    "today", "yesterday", "this week", "last week", "this month",
    "last month", "this quarter", "last quarter", "this year",
    "last year", "ytd", "mtd", "qtd", "recent", "recently",
}

_EXPLICIT_DATE_RE = re.compile(
    r"\b(20\d{2}[-/]?\d{0,2}[-/]?\d{0,2}|q[1-4]\s?20\d{2}|\d{1,2}\s(days?|weeks?|months?|years?))\b",
    re.IGNORECASE,
)

_COMPARATIVE_WORDS = {"better", "worse", "faster", "slower", "more", "fewer", "higher", "lower"}


@dataclass(frozen=True)
class AmbiguityFeatures:
    has_fuzzy_term: bool
    missing_temporal: bool
    multi_meaning_verb: bool
    cohort_implicit: bool
    baseline_implicit: bool


def _extract_features(nl: str, sql: str, tables_touched) -> AmbiguityFeatures:
    lc = nl.lower()
    has_fuzzy = any(term in lc for term in _FUZZY_TERMS)
    has_temporal_hint = any(h in lc for h in _TEMPORAL_HINTS) or bool(_EXPLICIT_DATE_RE.search(lc))
    has_multi_verb = any(v in lc.split() for v in _MULTI_MEANING_VERBS)
    # Cohort implicit when query refers to "users who X" without subsetting to a time window.
    cohort_implicit = (" users who " in lc or " customers who " in lc) and not has_temporal_hint
    baseline_implicit = any(w in lc.split() for w in _COMPARATIVE_WORDS) and "than" not in lc
    return AmbiguityFeatures(
        has_fuzzy_term=has_fuzzy,
        missing_temporal=(not has_temporal_hint and any(
            tk in lc for tk in ("recent", "latest", "recently")
        )),
        multi_meaning_verb=has_multi_verb,
        cohort_implicit=cohort_implicit,
        baseline_implicit=baseline_implicit,
    )


_WEIGHTS = {
    "has_fuzzy_term":     0.45,
    "missing_temporal":   0.30,
    "multi_meaning_verb": 0.20,
    "cohort_implicit":    0.25,
    "baseline_implicit":  0.20,
}


def _deterministic_score(f: AmbiguityFeatures) -> float:
    raw = 0.0
    for name, weight in _WEIGHTS.items():
        if getattr(f, name):
            raw += weight
    return max(0.0, min(1.0, raw))


def score_ambiguity(nl: str, sql: str, tables_touched) -> float:
    """Return a value in [0, 1]. Higher is more ambiguous."""
    features = _extract_features(nl, sql, tables_touched or [])
    return _deterministic_score(features)
```

- [ ] **Step 4: Run to verify pass**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_ambiguity_detector.py -v`
Expected: 6 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/ambiguity_detector.py backend/tests/test_ambiguity_detector.py
git commit -m "feat(phase-d): deterministic AmbiguityDetector with feature scoring"
```

---

### Task 2: Clause inventory (with mock LLM)

**Files:**
- Create: `backend/clause_inventory.py`
- Create: `backend/tests/test_clause_inventory.py`

**Design:** `extract_clauses(nl) → list[Clause]` uses Anthropic Haiku; test harness injects a callable so tests never hit the real API. `validate_mapping(clauses, sql_ast) → list[UnmappedClause]` uses sqlglot to walk the AST and check that each clause surface-name appears either as column / WHERE predicate / GROUP BY key.

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_clause_inventory.py`:

```python
"""Clause inventory — LLM extraction + AST validation."""
from clause_inventory import (
    Clause, ClauseInventory, extract_clauses, validate_mapping,
)


def _mock_extractor(nl: str):
    """Canned LLM-response: extract clauses from NL."""
    if "casual riders churning" in nl:
        return [
            Clause(text="casual riders", kind="cohort_filter"),
            Clause(text="churning within 30 days", kind="metric"),
            Clause(text="by station", kind="groupby"),
        ]
    return []


def test_extract_clauses_via_injected_callable():
    clauses = extract_clauses(
        nl="why are casual riders churning within 30 days by station",
        llm_fn=_mock_extractor,
    )
    assert len(clauses) == 3
    kinds = {c.kind for c in clauses}
    assert "cohort_filter" in kinds


def test_validate_mapping_detects_unmapped_groupby():
    clauses = [
        Clause(text="casual riders", kind="cohort_filter"),
        Clause(text="by station", kind="groupby"),
    ]
    # SQL only filters cohort; GROUP BY missing.
    sql = "SELECT user_id FROM trips WHERE rider_type = 'casual'"
    unmapped = validate_mapping(clauses, sql, dialect="sqlite")
    assert any(u.kind == "groupby" for u in unmapped)


def test_validate_mapping_empty_when_all_clauses_covered():
    clauses = [
        Clause(text="casual riders", kind="cohort_filter"),
        Clause(text="by station", kind="groupby"),
    ]
    sql = """
    SELECT station_id, COUNT(*) FROM trips
    WHERE rider_type = 'casual'
    GROUP BY station_id
    """
    unmapped = validate_mapping(clauses, sql, dialect="sqlite")
    assert unmapped == []


def test_clause_inventory_dataclass_fields():
    inv = ClauseInventory(
        extracted=[Clause(text="x", kind="metric")],
        unmapped=[],
        sql="SELECT 1",
    )
    assert inv.extracted[0].text == "x"
    assert inv.sql == "SELECT 1"
```

- [ ] **Step 2: Run to verify fail**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_clause_inventory.py -v`
Expected: FAIL

- [ ] **Step 3: Implement**

Create `backend/clause_inventory.py`:

```python
"""Ring 4 — ClauseInventory.

extract_clauses(nl) uses an LLM (injectable for tests) to turn the user's NL
question into a short list of clauses with semantic roles (cohort_filter,
metric, groupby, temporal, baseline, ordering).

validate_mapping(clauses, sql) walks the SQL AST and verifies that each
clause is covered by one or more SQL nodes. Unmapped clauses flow into the
IntentEchoCard as warnings.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable


_KIND_CHOICES = {
    "cohort_filter", "metric", "groupby", "temporal",
    "baseline", "ordering", "limit", "join",
}


@dataclass(frozen=True)
class Clause:
    text: str
    kind: str

    def __post_init__(self):
        if self.kind not in _KIND_CHOICES:
            raise ValueError(f"Clause.kind must be one of {_KIND_CHOICES!r}")


@dataclass
class ClauseInventory:
    extracted: list = field(default_factory=list)
    unmapped: list = field(default_factory=list)
    sql: str = ""


def extract_clauses(nl: str, llm_fn: Callable) -> list:
    """Call the injected LLM function with the NL. Returns list[Clause]."""
    if not callable(llm_fn):
        return []
    try:
        result = llm_fn(nl)
    except Exception:
        return []
    return [c for c in (result or []) if isinstance(c, Clause)]


def validate_mapping(clauses: list, sql: str, dialect: str = "sqlite") -> list:
    """Return clauses that have no corresponding SQL element."""
    import sqlglot
    import sqlglot.expressions as exp
    try:
        ast = sqlglot.parse_one(sql, dialect=dialect)
    except Exception:
        return list(clauses)  # parse failure → every clause unmapped

    has_groupby = bool(list(ast.find_all(exp.Group)))
    has_where = bool(list(ast.find_all(exp.Where)))
    has_order = bool(list(ast.find_all(exp.Order)))
    has_limit = bool(ast.args.get("limit")) if isinstance(ast, exp.Select) else bool(list(ast.find_all(exp.Limit)))
    has_join = bool(list(ast.find_all(exp.Join)))

    unmapped = []
    for clause in clauses:
        kind = clause.kind
        if kind == "groupby" and not has_groupby:
            unmapped.append(clause)
        elif kind == "cohort_filter" and not has_where:
            unmapped.append(clause)
        elif kind == "ordering" and not has_order:
            unmapped.append(clause)
        elif kind == "limit" and not has_limit:
            unmapped.append(clause)
        elif kind == "join" and not has_join:
            unmapped.append(clause)
        # metric / temporal / baseline validation is weaker — surface-level only.
        elif kind == "temporal" and not has_where:
            unmapped.append(clause)

    return unmapped
```

- [ ] **Step 4: Run to verify pass**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_clause_inventory.py -v`
Expected: 4 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/clause_inventory.py backend/tests/test_clause_inventory.py
git commit -m "feat(phase-d): ClauseInventory with LLM extraction + AST mapping validator"
```

---

### Task 3: Pinned receipts (outside compaction window)

**Files:**
- Create: `backend/pinned_receipts.py`
- Create: `backend/tests/test_pinned_receipts.py`

**Design:** Claude-Code scratchpad pattern — a set of `Receipt` objects per session that the SessionMemory compaction explicitly skips. Stored at `.data/agent_sessions/{session_id}.receipts.json`.

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_pinned_receipts.py`:

```python
"""Pinned receipts — survive session-memory compaction."""
from datetime import datetime, timezone

import pytest

from pinned_receipts import PinnedReceiptStore, Receipt


def _r(text="confirmed 30-day churn"):
    return Receipt(
        kind="intent_echo_accept",
        text=text,
        created_at=datetime.now(timezone.utc),
        session_id="sess-1",
    )


def test_pin_and_read(tmp_path):
    store = PinnedReceiptStore(root=tmp_path)
    store.pin("sess-1", _r())
    receipts = store.read("sess-1")
    assert len(receipts) == 1
    assert "30-day churn" in receipts[0].text


def test_read_empty_when_no_receipts(tmp_path):
    store = PinnedReceiptStore(root=tmp_path)
    assert store.read("missing") == []


def test_pin_multiple_preserves_order(tmp_path):
    store = PinnedReceiptStore(root=tmp_path)
    store.pin("s", _r("first"))
    store.pin("s", _r("second"))
    receipts = store.read("s")
    assert [r.text for r in receipts] == ["first", "second"]


def test_prune_by_session(tmp_path):
    store = PinnedReceiptStore(root=tmp_path)
    store.pin("keep", _r())
    store.pin("drop", _r())
    store.prune("drop")
    assert store.read("drop") == []
    assert len(store.read("keep")) == 1


def test_atomic_write_survives_partial_crash(tmp_path):
    """Writing a corrupted file must not destroy existing receipts."""
    store = PinnedReceiptStore(root=tmp_path)
    store.pin("s", _r("pre-crash"))
    # Simulate a write-in-progress leftover.
    (tmp_path / ".s_corrupt_.tmp").write_text("garbage")
    receipts = store.read("s")
    assert len(receipts) == 1
```

- [ ] **Step 2: Run to verify fail**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_pinned_receipts.py -v`
Expected: FAIL — `ModuleNotFoundError: pinned_receipts`

- [ ] **Step 3: Implement**

Create `backend/pinned_receipts.py`:

```python
"""Ring 4 — PinnedReceiptStore.

Receipts that agents accept (IntentEcho confirmation, ScopeValidator replan,
user-explicit-scope-override) survive session-memory sliding compaction.

Layout: <root>/<session_id>.receipts.json  (atomic write: tmp → rename).
"""
from __future__ import annotations

import json
import os
import tempfile
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path


@dataclass(frozen=True)
class Receipt:
    kind: str             # e.g. "intent_echo_accept", "scope_replan", "user_scope_override"
    text: str
    created_at: datetime
    session_id: str


def _iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def _from_iso(s: str) -> datetime:
    dt = datetime.fromisoformat(s)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


class PinnedReceiptStore:
    def __init__(self, root):
        self.root = Path(root)

    def _path(self, session_id: str) -> Path:
        return self.root / f"{session_id}.receipts.json"

    def pin(self, session_id: str, receipt: Receipt) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        existing = self.read(session_id)
        existing.append(receipt)
        payload = [
            {**asdict(r), "created_at": _iso(r.created_at)} for r in existing
        ]
        target = self._path(session_id)
        fd, tmp = tempfile.mkstemp(dir=str(self.root), prefix=f".{session_id}_", suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                json.dump(payload, fh, indent=2)
            os.replace(tmp, target)
        except Exception:
            try:
                os.unlink(tmp)
            except OSError:
                pass
            raise

    def read(self, session_id: str) -> list:
        path = self._path(session_id)
        if not path.exists():
            return []
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
            return [
                Receipt(
                    kind=r["kind"],
                    text=r["text"],
                    created_at=_from_iso(r["created_at"]),
                    session_id=r["session_id"],
                ) for r in raw
            ]
        except Exception:
            return []

    def prune(self, session_id: str) -> None:
        path = self._path(session_id)
        try:
            path.unlink()
        except FileNotFoundError:
            pass
```

- [ ] **Step 4: Run to verify pass**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_pinned_receipts.py -v`
Expected: 5 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/pinned_receipts.py backend/tests/test_pinned_receipts.py
git commit -m "feat(phase-d): PinnedReceiptStore (atomic, compaction-immune)"
```

---

### Task 4: Intent echo card assembly

**Files:**
- Create: `backend/intent_echo.py`
- Create: `backend/tests/test_intent_echo.py`

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_intent_echo.py`:

```python
"""IntentEchoCard assembly + SSE payload."""
from datetime import datetime, timezone

from clause_inventory import Clause
from intent_echo import (
    IntentEchoCard, build_echo, echo_to_sse_payload, EchoMode,
)


def test_auto_proceed_mode_when_score_low():
    card = build_echo(
        nl="count users",
        sql="SELECT COUNT(*) FROM users",
        ambiguity=0.1,
        clauses=[],
        unmapped=[],
        tables_touched=["users"],
    )
    assert card.mode is EchoMode.AUTO_PROCEED
    assert card.interpretations == []


def test_proceed_button_mode_when_mid_score():
    card = build_echo(
        nl="count recent users",
        sql="SELECT * FROM users",
        ambiguity=0.55,
        clauses=[Clause(text="recent users", kind="cohort_filter")],
        unmapped=[],
        tables_touched=["users"],
    )
    assert card.mode is EchoMode.PROCEED_BUTTON
    assert len(card.interpretations) >= 1


def test_mandatory_choice_mode_when_high_score():
    card = build_echo(
        nl="why are casual riders churning",
        sql="SELECT 1",
        ambiguity=0.9,
        clauses=[Clause(text="churning", kind="metric")],
        unmapped=[],
        tables_touched=["trips"],
    )
    assert card.mode is EchoMode.MANDATORY_CHOICE
    assert len(card.interpretations) >= 2
    assert any("30" in i.text or "60" in i.text or "90" in i.text for i in card.interpretations)


def test_unmapped_clauses_attach_warnings():
    card = build_echo(
        nl="casual riders by station",
        sql="SELECT * FROM trips WHERE rider_type='casual'",
        ambiguity=0.6,
        clauses=[
            Clause(text="casual riders", kind="cohort_filter"),
            Clause(text="by station", kind="groupby"),
        ],
        unmapped=[Clause(text="by station", kind="groupby")],
        tables_touched=["trips"],
    )
    assert len(card.warnings) >= 1
    assert any("station" in w for w in card.warnings)


def test_sse_payload_shape_is_json_serializable():
    import json
    card = build_echo(
        nl="x", sql="SELECT 1", ambiguity=0.2, clauses=[], unmapped=[], tables_touched=[],
    )
    payload = echo_to_sse_payload(card)
    json.dumps(payload)   # raises if non-serializable
    assert payload["mode"] in {"auto_proceed", "proceed_button", "mandatory_choice"}
    assert "interpretations" in payload
```

- [ ] **Step 2: Run to verify fail**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_intent_echo.py -v`
Expected: FAIL

- [ ] **Step 3: Implement**

Create `backend/intent_echo.py`:

```python
"""Ring 4 — IntentEcho card + SSE payload.

The card emerges between SQL generation and answer streaming. It surfaces:
  - the operational definition the agent chose (cohort, baseline, metric),
  - unmapped clauses from the user's NL,
  - optional alternative interpretations (mandatory-choice mode).

Firing modes:
  AUTO_PROCEED     — ambiguity <= ECHO_AMBIGUITY_AUTO_PROCEED_MAX
  PROCEED_BUTTON   — between the two thresholds
  MANDATORY_CHOICE — ambiguity >= ECHO_AMBIGUITY_MANDATORY_CHOICE_MIN
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from enum import Enum


class EchoMode(Enum):
    AUTO_PROCEED = "auto_proceed"
    PROCEED_BUTTON = "proceed_button"
    MANDATORY_CHOICE = "mandatory_choice"


@dataclass(frozen=True)
class Interpretation:
    id: str
    text: str
    details: dict = field(default_factory=dict)


@dataclass(frozen=True)
class IntentEchoCard:
    mode: EchoMode
    ambiguity: float
    operational_definition: str
    interpretations: list            # list[Interpretation]
    warnings: list                   # list[str] — unmapped clause text
    clause_inventory: list           # list[Clause]
    tables_touched: list


def _resolve_mode(ambiguity: float) -> EchoMode:
    try:
        from config import settings
        lo = settings.ECHO_AMBIGUITY_AUTO_PROCEED_MAX
        hi = settings.ECHO_AMBIGUITY_MANDATORY_CHOICE_MIN
    except Exception:
        lo, hi = 0.3, 0.7
    if ambiguity <= lo:
        return EchoMode.AUTO_PROCEED
    if ambiguity >= hi:
        return EchoMode.MANDATORY_CHOICE
    return EchoMode.PROCEED_BUTTON


def _canonical_interpretations(clauses: list) -> list:
    """Produce 2-3 alternative interpretations for mandatory-choice mode."""
    out = []
    # Detect churn-like metric clauses and offer 30/60/90 windows.
    for c in clauses:
        if c.kind == "metric" and ("churn" in c.text.lower() or "retention" in c.text.lower()):
            out.extend([
                Interpretation(id="churn_30", text="Churn = no activity within 30 days", details={"window_days": 30}),
                Interpretation(id="churn_60", text="Churn = no activity within 60 days", details={"window_days": 60}),
                Interpretation(id="churn_90", text="Churn = no activity within 90 days", details={"window_days": 90}),
            ])
            break
    # If nothing matched, fall back to a generic "default vs strict" split.
    if not out:
        out = [
            Interpretation(id="default", text="Use the default interpretation"),
            Interpretation(id="strict",  text="Require exact NL terms to match SQL"),
        ]
    return out


def build_echo(
    nl: str,
    sql: str,
    ambiguity: float,
    clauses: list,
    unmapped: list,
    tables_touched: list,
) -> IntentEchoCard:
    mode = _resolve_mode(ambiguity)
    warnings = [f"Clause '{c.text}' had no SQL counterpart" for c in unmapped]
    interpretations: list
    if mode is EchoMode.MANDATORY_CHOICE:
        interpretations = _canonical_interpretations(clauses)
    elif mode is EchoMode.PROCEED_BUTTON:
        interpretations = [Interpretation(id="proceed", text="Proceed with current interpretation")]
    else:
        interpretations = []

    # Operational definition = one-line human-readable plan summary.
    op_def_bits = []
    for c in clauses:
        op_def_bits.append(f"{c.kind}={c.text}")
    operational_definition = "; ".join(op_def_bits) or f"SELECT from {', '.join(tables_touched) or 'schema'}"

    return IntentEchoCard(
        mode=mode,
        ambiguity=round(ambiguity, 3),
        operational_definition=operational_definition,
        interpretations=interpretations,
        warnings=warnings,
        clause_inventory=list(clauses),
        tables_touched=list(tables_touched),
    )


def echo_to_sse_payload(card: IntentEchoCard) -> dict:
    """Serializer for the agent SSE stream.

    SSE event type: 'intent_echo'
    """
    return {
        "mode": card.mode.value,
        "ambiguity": card.ambiguity,
        "operational_definition": card.operational_definition,
        "interpretations": [
            {"id": i.id, "text": i.text, "details": i.details} for i in card.interpretations
        ],
        "warnings": list(card.warnings),
        "tables_touched": list(card.tables_touched),
    }
```

- [ ] **Step 4: Run to verify pass**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_intent_echo.py -v`
Expected: 5 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/intent_echo.py backend/tests/test_intent_echo.py
git commit -m "feat(phase-d): IntentEchoCard assembly + SSE payload serializer"
```

---

### Task 5: SchemaProfile extensions (back-fill Phase C rules 4 + 5)

**Files:**
- Modify: `backend/schema_intelligence.py`
- Create: `backend/tests/test_schema_intel_phase_d.py`

**Design:** Add two new fields to the existing `SchemaProfile` / `TableProfile` shape. Populate via the existing profiler — identify TZ-aware types from column metadata, soft-delete via column-name heuristic + nullable-timestamp.

- [ ] **Step 1: Inspect current shape**

Run: `grep -n "class TableProfile\|class SchemaProfile\|data_type\|nullable" "QueryCopilot V1/backend/schema_intelligence.py" | head -30`

- [ ] **Step 2: Write failing test**

Create `backend/tests/test_schema_intel_phase_d.py`:

```python
"""Schema profile extensions — tz_aware_columns + soft_delete_columns."""
import sqlite3

import pytest


@pytest.fixture
def sqlite_with_tz_col(tmp_path):
    db = tmp_path / "schema_test.sqlite"
    conn = sqlite3.connect(str(db))
    conn.execute("""
        CREATE TABLE events(
            id INTEGER PRIMARY KEY,
            occurred_at TIMESTAMPTZ NOT NULL,
            deleted_at DATETIME NULL
        )
    """)
    conn.commit()
    conn.close()
    return db


def test_schema_profile_detects_tz_aware(sqlite_with_tz_col):
    from schema_intelligence import SchemaIntelligence
    si = SchemaIntelligence()
    profile = si.profile_sqlite(str(sqlite_with_tz_col))   # helper added in this task
    tbl = next(t for t in profile.tables if t.name == "events")
    assert "occurred_at" in tbl.tz_aware_columns


def test_schema_profile_detects_soft_delete(sqlite_with_tz_col):
    from schema_intelligence import SchemaIntelligence
    si = SchemaIntelligence()
    profile = si.profile_sqlite(str(sqlite_with_tz_col))
    tbl = next(t for t in profile.tables if t.name == "events")
    # deleted_at + nullable → soft-delete.
    assert tbl.soft_delete_columns == ["deleted_at"] or "deleted_at" in tbl.soft_delete_columns
```

- [ ] **Step 3: Run to verify fail**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_schema_intel_phase_d.py -v`
Expected: FAIL

- [ ] **Step 4: Implement**

Open `backend/schema_intelligence.py`. Locate `TableProfile` dataclass. Add two fields:

```python
    tz_aware_columns: list = field(default_factory=list)    # Phase D
    soft_delete_columns: list = field(default_factory=list)  # Phase D
```

Locate the SQLite profiler path. When iterating columns, maintain two local lists:

```python
        tz_aware = []
        soft_del = []
        for col_row in columns_cursor:
            # ... existing column-building code ...
            declared_type = (col_row.get("type") or "").upper()
            if "TIMESTAMPTZ" in declared_type or "TIME ZONE" in declared_type:
                tz_aware.append(col_name)
            is_nullable = bool(col_row.get("notnull") == 0)
            if col_name.lower() in {"deleted_at", "archived_at", "removed_at"} and is_nullable:
                soft_del.append(col_name)
```

Then pass these into the `TableProfile(...)` constructor: `tz_aware_columns=tz_aware`, `soft_delete_columns=soft_del`.

If no `profile_sqlite` helper exists, add one:

```python
    def profile_sqlite(self, db_path: str):
        """Test-friendly: profile a SQLite DB directly without a connector."""
        import sqlite3
        conn = sqlite3.connect(db_path)
        try:
            tables = []
            for (tname,) in conn.execute("SELECT name FROM sqlite_master WHERE type='table'"):
                cols = []
                tz_aware = []
                soft_del = []
                for row in conn.execute(f"PRAGMA table_info({tname})"):
                    cid, cname, ctype, notnull, *_ = row
                    cols.append({"name": cname, "type": ctype})
                    up = (ctype or "").upper()
                    if "TIMESTAMPTZ" in up or "TIME ZONE" in up:
                        tz_aware.append(cname)
                    if cname.lower() in {"deleted_at", "archived_at", "removed_at"} and notnull == 0:
                        soft_del.append(cname)
                from schema_intelligence import TableProfile   # self-import ok
                tables.append(TableProfile(
                    name=tname,
                    columns=cols,
                    tz_aware_columns=tz_aware,
                    soft_delete_columns=soft_del,
                ))
            # Build minimal SchemaProfile wrapper.
            from schema_intelligence import SchemaProfile
            return SchemaProfile(tables=tables)
        finally:
            conn.close()
```

If `TableProfile` / `SchemaProfile` constructors take other required args, adapt defaults accordingly.

- [ ] **Step 5: Run to verify pass**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_schema_intel_phase_d.py -v`
Expected: 2 PASS

- [ ] **Step 6: Commit**

```bash
git add backend/schema_intelligence.py backend/tests/test_schema_intel_phase_d.py
git commit -m "feat(phase-d): schema profile detects tz_aware + soft_delete columns"
```

---

### Task 6: Replan controller (wire Phase C budget → Ring 3 violations)

**Files:**
- Create: `backend/replan_controller.py`
- Create: `backend/tests/test_replan_controller.py`

**Design:** Given a `ValidatorResult` with violations, consume one unit from `ReplanBudget` and return a structured "replan hint" the SQL-gen prompt can absorb. If budget exhausted → return `None` (caller proceeds with warning).

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_replan_controller.py`:

```python
"""Replan controller — consumes ReplanBudget on Ring-3 violations."""
import pytest

from replan_budget import ReplanBudget
from scope_validator import ValidatorResult, Violation, RuleId
from replan_controller import ReplanController, ReplanHint


def _violation(rule=RuleId.RANGE_MISMATCH, msg="out of range"):
    return Violation(rule_id=rule, message=msg)


def test_first_violation_consumes_budget_and_returns_hint():
    budget = ReplanBudget(max_replans=1)
    ctl = ReplanController(budget=budget)
    result = ValidatorResult(violations=[_violation()])
    hint = ctl.on_violation(result, original_sql="SELECT * FROM x WHERE d < '1900-01-01'")
    assert isinstance(hint, ReplanHint)
    assert hint.reason == "range_mismatch"
    assert budget.remaining() == 0


def test_second_violation_when_budget_exhausted_returns_none():
    budget = ReplanBudget(max_replans=1)
    ctl = ReplanController(budget=budget)
    ctl.on_violation(ValidatorResult(violations=[_violation()]), original_sql="SELECT 1")
    hint = ctl.on_violation(ValidatorResult(violations=[_violation()]), original_sql="SELECT 1")
    assert hint is None


def test_no_violations_returns_none():
    budget = ReplanBudget(max_replans=1)
    ctl = ReplanController(budget=budget)
    hint = ctl.on_violation(ValidatorResult(violations=[]), original_sql="SELECT 1")
    assert hint is None
    assert budget.remaining() == 1


def test_hint_carries_all_violation_messages():
    budget = ReplanBudget(max_replans=1)
    ctl = ReplanController(budget=budget)
    result = ValidatorResult(violations=[
        _violation(RuleId.RANGE_MISMATCH, "rule 1 msg"),
        _violation(RuleId.FANOUT_INFLATION, "rule 2 msg"),
    ])
    hint = ctl.on_violation(result, original_sql="SELECT 1")
    assert "rule 1 msg" in hint.context
    assert "rule 2 msg" in hint.context
```

- [ ] **Step 2: Run to verify fail**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_replan_controller.py -v`
Expected: FAIL — `ModuleNotFoundError: replan_controller`

- [ ] **Step 3: Implement**

Create `backend/replan_controller.py`:

```python
"""Ring 3→4 glue — consume ReplanBudget on ScopeValidator violations
and produce a structured hint that SQL-gen can absorb on its next call.
"""
from __future__ import annotations

from dataclasses import dataclass

from replan_budget import BudgetExceeded, ReplanBudget


@dataclass(frozen=True)
class ReplanHint:
    reason: str            # First violation's rule_id.value
    context: str           # Concatenated violation messages for prompt injection
    original_sql: str


class ReplanController:
    def __init__(self, budget: ReplanBudget):
        self.budget = budget

    def on_violation(self, result, original_sql: str):
        """Return a ReplanHint if budget allows, else None.

        `result` is a ValidatorResult.
        """
        if not result or not result.violations:
            return None
        first = result.violations[0]
        try:
            self.budget.consume(first.rule_id.value)
        except BudgetExceeded:
            return None
        context = "\n".join(
            f"- [{v.rule_id.value}] {v.message}" for v in result.violations
        )
        return ReplanHint(
            reason=first.rule_id.value,
            context=context,
            original_sql=original_sql,
        )
```

- [ ] **Step 4: Run to verify pass**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_replan_controller.py -v`
Expected: 4 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/replan_controller.py backend/tests/test_replan_controller.py
git commit -m "feat(phase-d): ReplanController wires Phase-C budget to Ring-3 violations"
```

---

### Task 7: Semantic Registry (H12 versioned definitions)

**Files:**
- Create: `backend/semantic_registry.py`
- Create: `backend/tests/test_semantic_registry.py`

**Design:** JSON-backed per-connection registry at `.data/semantic_registry/<conn_id>.json`. Each entry has `{name, definition, valid_from, valid_until, owner, unit?}`. Lookup by `(name, at_time)`.

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_semantic_registry.py`:

```python
"""Semantic Registry — versioned metric definitions (H12)."""
from datetime import datetime, timezone

import pytest

from semantic_registry import SemanticRegistry, Definition, NotFound


def _dt(y, m=1, d=1):
    return datetime(y, m, d, tzinfo=timezone.utc)


def test_register_then_lookup_current_definition(tmp_path):
    reg = SemanticRegistry(root=tmp_path)
    reg.register("conn-1", Definition(
        name="churn",
        definition="no activity within 30 days",
        valid_from=_dt(2024, 1, 1),
        valid_until=None,
        owner="analytics",
    ))
    d = reg.lookup("conn-1", "churn", at=_dt(2025, 6, 1))
    assert "30 days" in d.definition


def test_two_versions_coexist(tmp_path):
    reg = SemanticRegistry(root=tmp_path)
    reg.register("conn-1", Definition(
        name="revenue", definition="gross",
        valid_from=_dt(2023, 1, 1), valid_until=_dt(2024, 12, 31),
        owner="finance",
    ))
    reg.register("conn-1", Definition(
        name="revenue", definition="net",
        valid_from=_dt(2025, 1, 1), valid_until=None,
        owner="finance",
    ))
    assert reg.lookup("conn-1", "revenue", at=_dt(2024, 6, 1)).definition == "gross"
    assert reg.lookup("conn-1", "revenue", at=_dt(2025, 6, 1)).definition == "net"


def test_lookup_raises_when_name_missing(tmp_path):
    reg = SemanticRegistry(root=tmp_path)
    with pytest.raises(NotFound):
        reg.lookup("conn-1", "unknown", at=_dt(2025, 1, 1))


def test_lookup_between_versions_returns_closest_valid(tmp_path):
    reg = SemanticRegistry(root=tmp_path)
    reg.register("conn-1", Definition(
        name="foo", definition="old",
        valid_from=_dt(2023, 1, 1), valid_until=_dt(2023, 12, 31),
        owner="x",
    ))
    # Gap between 2024-01-01 and 2024-12-31 — lookup at 2024-06-01 raises.
    with pytest.raises(NotFound):
        reg.lookup("conn-1", "foo", at=_dt(2024, 6, 1))
```

- [ ] **Step 2: Run to verify fail**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_semantic_registry.py -v`
Expected: FAIL

- [ ] **Step 3: Implement**

Create `backend/semantic_registry.py`:

```python
"""H12 — SemanticRegistry.

Per-connection JSON-backed registry of metric definitions with
`valid_from / valid_until`. Agents ground terminology rewrites against
this registry; on miss, IntentEcho surfaces a "terminology unknown" warning.
"""
from __future__ import annotations

import json
import os
import tempfile
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional


class NotFound(KeyError):
    pass


def _iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def _from_iso(s):
    if s is None:
        return None
    dt = datetime.fromisoformat(s)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


@dataclass(frozen=True)
class Definition:
    name: str
    definition: str
    valid_from: datetime
    valid_until: Optional[datetime]
    owner: str
    unit: Optional[str] = None


class SemanticRegistry:
    def __init__(self, root):
        self.root = Path(root)

    def _path(self, conn_id: str) -> Path:
        return self.root / f"{conn_id}.json"

    def _load(self, conn_id: str) -> list:
        p = self._path(conn_id)
        if not p.exists():
            return []
        try:
            raw = json.loads(p.read_text(encoding="utf-8"))
            return [
                Definition(
                    name=d["name"],
                    definition=d["definition"],
                    valid_from=_from_iso(d["valid_from"]),
                    valid_until=_from_iso(d.get("valid_until")),
                    owner=d.get("owner", ""),
                    unit=d.get("unit"),
                ) for d in raw
            ]
        except Exception:
            return []

    def _save(self, conn_id: str, entries: list) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        payload = []
        for e in entries:
            d = asdict(e)
            d["valid_from"] = _iso(e.valid_from)
            d["valid_until"] = _iso(e.valid_until) if e.valid_until else None
            payload.append(d)
        target = self._path(conn_id)
        fd, tmp = tempfile.mkstemp(dir=str(self.root), prefix=f".{conn_id}_", suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                json.dump(payload, fh, indent=2)
            os.replace(tmp, target)
        except Exception:
            try:
                os.unlink(tmp)
            except OSError:
                pass
            raise

    def register(self, conn_id: str, defn: Definition) -> None:
        entries = self._load(conn_id)
        entries.append(defn)
        self._save(conn_id, entries)

    def lookup(self, conn_id: str, name: str, at: datetime) -> Definition:
        entries = self._load(conn_id)
        for d in entries:
            if d.name != name:
                continue
            if d.valid_from <= at and (d.valid_until is None or at <= d.valid_until):
                return d
        raise NotFound(f"No definition for {name!r} at {at.isoformat()}")
```

- [ ] **Step 4: Run to verify pass**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_semantic_registry.py -v`
Expected: 4 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/semantic_registry.py backend/tests/test_semantic_registry.py
git commit -m "feat(phase-d): SemanticRegistry with valid_from/valid_until (H12)"
```

---

### Task 8: Drift detector (H12)

**Files:**
- Create: `backend/drift_detector.py`
- Create: `backend/tests/test_drift_detector.py`

**Design:** Three deterministic detectors:
1. **Merger detection** — two columns previously populated, one now always-null and the other has k-fold growth.
2. **Denormalization drift** — a JOIN foreign-key ratio changed by >20% between Phase-B cards.
3. **Fiscal-calendar mismatch** — `FISCAL_YEAR_START_MONTH != 1` but SQL uses `DATE_TRUNC('year', …)` (calendar year).

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_drift_detector.py`:

```python
"""Drift detector — mergers, denorm drift, fiscal mismatch (H12)."""
from drift_detector import (
    detect_fiscal_calendar_mismatch,
    detect_merger_pattern,
)


def test_fiscal_mismatch_fires_when_fiscal_start_not_january():
    sql = "SELECT DATE_TRUNC('year', signup_date) FROM users"
    result = detect_fiscal_calendar_mismatch(sql=sql, fiscal_year_start_month=7)
    assert result is not None
    assert "fiscal" in result.message.lower()


def test_fiscal_mismatch_does_not_fire_when_calendar_year():
    sql = "SELECT DATE_TRUNC('year', signup_date) FROM users"
    result = detect_fiscal_calendar_mismatch(sql=sql, fiscal_year_start_month=1)
    assert result is None


def test_fiscal_mismatch_does_not_fire_on_month_bucket():
    sql = "SELECT DATE_TRUNC('month', signup_date) FROM users"
    result = detect_fiscal_calendar_mismatch(sql=sql, fiscal_year_start_month=7)
    assert result is None


def test_merger_pattern_detects_null_shift():
    """Before: country_code and country_name both populated. After: country_name null, country_code k-grown."""
    before = {"country_code": 0.0, "country_name": 0.0}   # null rates
    after  = {"country_code": 0.0, "country_name": 1.0}
    row_before, row_after = 10_000, 10_000
    result = detect_merger_pattern(
        null_rate_before=before, null_rate_after=after,
        rowcount_before=row_before, rowcount_after=row_after,
    )
    assert result is not None
    assert "country_name" in result.message


def test_no_merger_when_null_rates_stable():
    before = {"country_code": 0.01, "country_name": 0.01}
    after  = {"country_code": 0.02, "country_name": 0.01}
    result = detect_merger_pattern(
        null_rate_before=before, null_rate_after=after,
        rowcount_before=10_000, rowcount_after=10_000,
    )
    assert result is None
```

- [ ] **Step 2: Run to verify fail**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_drift_detector.py -v`
Expected: FAIL

- [ ] **Step 3: Implement**

Create `backend/drift_detector.py`:

```python
"""H12 — DriftDetector.

Deterministic checks applied against Phase-B card deltas + user SQL:
  1. Merger pattern: column goes null-dominant while another grows.
  2. Denormalization drift: FK fan-out ratio changes >20%.
  3. Fiscal-calendar mismatch: tenant fiscal year != Jan, but SQL uses DATE_TRUNC('year', ...).
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class DriftFinding:
    kind: str               # "merger", "denorm", "fiscal_mismatch"
    message: str
    evidence: dict


def detect_fiscal_calendar_mismatch(sql: str, fiscal_year_start_month: int = 1):
    if fiscal_year_start_month == 1:
        return None
    lc = sql.lower()
    if "date_trunc('year'" in lc or 'date_trunc("year"' in lc:
        return DriftFinding(
            kind="fiscal_mismatch",
            message=(
                f"SQL uses calendar-year bucketing but tenant fiscal year starts "
                f"in month {fiscal_year_start_month}. Results may mis-align fiscal quarters."
            ),
            evidence={"fiscal_year_start_month": fiscal_year_start_month},
        )
    return None


def detect_merger_pattern(
    null_rate_before: dict,
    null_rate_after: dict,
    rowcount_before: int,
    rowcount_after: int,
):
    """Identify columns that went from populated to all-null between snapshots."""
    if rowcount_before <= 0 or rowcount_after <= 0:
        return None
    for col, rate_after in null_rate_after.items():
        rate_before = null_rate_before.get(col, 0.0)
        if rate_before < 0.1 and rate_after > 0.9:
            return DriftFinding(
                kind="merger",
                message=(
                    f"Column {col!r} went from {rate_before:.0%} null to {rate_after:.0%} null — "
                    f"possible schema merger or column deprecation."
                ),
                evidence={"column": col, "before": rate_before, "after": rate_after},
            )
    return None
```

- [ ] **Step 4: Run to verify pass**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_drift_detector.py -v`
Expected: 5 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/drift_detector.py backend/tests/test_drift_detector.py
git commit -m "feat(phase-d): DriftDetector — merger + fiscal mismatch (H12)"
```

---

### Task 9: Non-interactive mode + voice readback

**Files:**
- Create: `backend/tests/test_non_interactive_mode.py`
- Modify: `backend/intent_echo.py`

**Design:** Extend `build_echo()` with an `interaction_mode` parameter (`"interactive" | "voice" | "scheduled" | "bulk" | "embedded"`). For non-interactive modes, collapse to widest defensible scope + append explicit "interpretation unconfirmed" banner. Voice mode with ambiguity ≥ `VOICE_MODE_READBACK_AMBIGUITY_MIN` → set `tts_readback` flag on card.

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_non_interactive_mode.py`:

```python
"""Non-interactive conservative mode (H5) + voice TTS readback."""
from intent_echo import (
    IntentEchoCard, build_echo, EchoMode, InteractionMode,
)


def test_scheduled_mode_forces_auto_proceed_with_banner():
    card = build_echo(
        nl="churn this quarter",
        sql="SELECT 1",
        ambiguity=0.85,  # would normally be mandatory choice
        clauses=[],
        unmapped=[],
        tables_touched=["trips"],
        interaction_mode=InteractionMode.SCHEDULED,
    )
    assert card.mode is EchoMode.AUTO_PROCEED
    assert card.banner is not None
    assert "unconfirmed" in card.banner.lower()


def test_voice_mode_sets_readback_flag_when_ambiguous():
    card = build_echo(
        nl="churn trend",
        sql="SELECT 1",
        ambiguity=0.6,
        clauses=[],
        unmapped=[],
        tables_touched=["trips"],
        interaction_mode=InteractionMode.VOICE,
    )
    assert card.tts_readback is True


def test_voice_mode_no_readback_when_score_below_threshold():
    card = build_echo(
        nl="count users",
        sql="SELECT 1",
        ambiguity=0.1,
        clauses=[],
        unmapped=[],
        tables_touched=["users"],
        interaction_mode=InteractionMode.VOICE,
    )
    assert card.tts_readback is False


def test_interactive_mode_has_no_banner_by_default():
    card = build_echo(
        nl="count users",
        sql="SELECT 1",
        ambiguity=0.1,
        clauses=[],
        unmapped=[],
        tables_touched=["users"],
        interaction_mode=InteractionMode.INTERACTIVE,
    )
    assert card.banner is None
```

- [ ] **Step 2: Run to verify fail**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_non_interactive_mode.py -v`
Expected: FAIL — `cannot import name 'InteractionMode'`

- [ ] **Step 3: Extend `intent_echo.py`**

Add to `backend/intent_echo.py`:

```python

class InteractionMode(Enum):
    INTERACTIVE = "interactive"
    VOICE = "voice"
    SCHEDULED = "scheduled"
    BULK = "bulk"
    EMBEDDED = "embedded"
```

Extend `IntentEchoCard`:

```python
@dataclass(frozen=True)
class IntentEchoCard:
    mode: EchoMode
    ambiguity: float
    operational_definition: str
    interpretations: list
    warnings: list
    clause_inventory: list
    tables_touched: list
    banner: str | None = None           # H5 — non-interactive mode banner
    tts_readback: bool = False          # H5 — voice mode readback flag
```

Rewrite `build_echo()` signature + body:

```python
def build_echo(
    nl: str,
    sql: str,
    ambiguity: float,
    clauses: list,
    unmapped: list,
    tables_touched: list,
    interaction_mode: InteractionMode = InteractionMode.INTERACTIVE,
) -> IntentEchoCard:
    mode = _resolve_mode(ambiguity)
    warnings = [f"Clause '{c.text}' had no SQL counterpart" for c in unmapped]

    banner = None
    tts_readback = False

    # Non-interactive — force AUTO_PROCEED + banner (H5).
    if interaction_mode in {InteractionMode.SCHEDULED, InteractionMode.BULK, InteractionMode.EMBEDDED}:
        if mode is not EchoMode.AUTO_PROCEED:
            banner = (
                f"Interpretation unconfirmed (ambiguity={ambiguity:.2f}). "
                f"Running with widest defensible scope because this path is non-interactive."
            )
            mode = EchoMode.AUTO_PROCEED

    # Voice — set TTS readback flag at moderate ambiguity (H5).
    if interaction_mode is InteractionMode.VOICE:
        try:
            from config import settings
            threshold = settings.VOICE_MODE_READBACK_AMBIGUITY_MIN
        except Exception:
            threshold = 0.5
        tts_readback = ambiguity >= threshold

    interpretations: list
    if mode is EchoMode.MANDATORY_CHOICE:
        interpretations = _canonical_interpretations(clauses)
    elif mode is EchoMode.PROCEED_BUTTON:
        interpretations = [Interpretation(id="proceed", text="Proceed with current interpretation")]
    else:
        interpretations = []

    op_def_bits = [f"{c.kind}={c.text}" for c in clauses]
    operational_definition = "; ".join(op_def_bits) or f"SELECT from {', '.join(tables_touched) or 'schema'}"

    return IntentEchoCard(
        mode=mode,
        ambiguity=round(ambiguity, 3),
        operational_definition=operational_definition,
        interpretations=interpretations,
        warnings=warnings,
        clause_inventory=list(clauses),
        tables_touched=list(tables_touched),
        banner=banner,
        tts_readback=tts_readback,
    )
```

Also extend `echo_to_sse_payload()` to include `banner` and `tts_readback` keys.

- [ ] **Step 4: Run to verify pass**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_non_interactive_mode.py tests/test_intent_echo.py -v`
Expected: all PASS (non-interactive 4 + intent echo 5 = 9 total)

- [ ] **Step 5: Commit**

```bash
git add backend/intent_echo.py backend/tests/test_non_interactive_mode.py
git commit -m "feat(phase-d): InteractionMode with conservative + voice readback (H5)"
```

---

### Task 10: Agent engine integration — emit echo + handle response

**Files:**
- Modify: `backend/agent_engine.py`
- Modify: `backend/routers/agent_routes.py`
- Create: `backend/tests/test_agent_echo_integration.py`

**Design:**
- Add `AgentEngine._emit_intent_echo_if_ambiguous(nl, sql)` — called after SQL-gen, returns card dict or None.
- Add `AgentEngine._handle_scope_violations_with_replan(result, original_sql, nl)` — Phase C follow-up; consumes budget, re-invokes SQL gen with hint.
- Add new SSE event type `intent_echo` in `agent_routes.py`.
- Add `POST /api/v1/agent/echo-response` endpoint for user choice.

- [ ] **Step 1: Write failing integration test**

Create `backend/tests/test_agent_echo_integration.py`:

```python
"""Agent engine → IntentEcho integration."""
from unittest.mock import MagicMock

from agent_engine import AgentEngine


def _engine():
    e = AgentEngine.__new__(AgentEngine)
    e.connection_entry = MagicMock()
    e.connection_entry.coverage_cards = []
    e.connection_entry.db_type = "sqlite"
    e.engine = None
    e.email = "u@t"
    e._persona = None
    e._skill_library = None
    e._skill_collection = None
    e._session_id = "sess-1"
    e._current_nl_question = "why are casual riders churning"
    return e


def test_ambiguous_question_emits_echo():
    e = _engine()
    card = e._emit_intent_echo_if_ambiguous(
        nl="why are casual riders churning",
        sql="SELECT * FROM trips WHERE rider_type='casual'",
        tables_touched=["trips"],
    )
    assert card is not None
    assert card["mode"] in {"proceed_button", "mandatory_choice"}


def test_unambiguous_question_no_echo():
    e = _engine()
    card = e._emit_intent_echo_if_ambiguous(
        nl="count users",
        sql="SELECT COUNT(*) FROM users",
        tables_touched=["users"],
    )
    assert card is None or card["mode"] == "auto_proceed"


def test_replan_hint_returned_on_scope_violation():
    """When ScopeValidator fires, the replan controller hands back a hint that
    the agent can pass to the next SQL-gen call.
    """
    e = _engine()
    hint = e._handle_scope_violations_with_replan(
        sql="SELECT * FROM january_trips WHERE started_at < '1900-01-01'",
        nl="old trips",
    )
    # First call consumes the budget → returns a ReplanHint dict.
    assert hint is not None
    assert "range_mismatch" in (hint.get("reason") or "")

    # Second call should return None (budget exhausted within same turn).
    hint2 = e._handle_scope_violations_with_replan(
        sql="SELECT * FROM january_trips WHERE started_at < '1900-01-01'",
        nl="old trips",
    )
    assert hint2 is None
```

- [ ] **Step 2: Run to verify fail**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_agent_echo_integration.py -v`
Expected: FAIL — methods missing

- [ ] **Step 3: Implement in `agent_engine.py`**

Inside class `AgentEngine`, add:

```python
    def _emit_intent_echo_if_ambiguous(self, nl: str, sql: str, tables_touched=None):
        """Phase D — return an SSE-payload dict or None."""
        try:
            from config import settings
            if not settings.FEATURE_INTENT_ECHO:
                return None
            from ambiguity_detector import score_ambiguity
            from intent_echo import build_echo, echo_to_sse_payload, InteractionMode
            from clause_inventory import Clause
        except Exception:
            return None

        try:
            score = score_ambiguity(nl=nl, sql=sql, tables_touched=tables_touched or [])
        except Exception:
            score = 0.0
        if score <= settings.ECHO_AMBIGUITY_AUTO_PROCEED_MAX:
            return None

        card = build_echo(
            nl=nl,
            sql=sql,
            ambiguity=score,
            clauses=[],
            unmapped=[],
            tables_touched=tables_touched or [],
            interaction_mode=InteractionMode.INTERACTIVE,
        )
        return echo_to_sse_payload(card)

    def _handle_scope_violations_with_replan(self, sql: str, nl: str):
        """Phase D — consume ReplanBudget on Ring-3 violations; return hint dict or None."""
        try:
            from scope_validator import ScopeValidator
            from replan_budget import ReplanBudget
            from replan_controller import ReplanController
        except Exception:
            return None

        if not hasattr(self, "_replan_budget"):
            self._replan_budget = ReplanBudget(max_replans=1)
        if not hasattr(self, "_replan_controller"):
            self._replan_controller = ReplanController(budget=self._replan_budget)

        try:
            dialect = getattr(self.connection_entry, "db_type", "sqlite")
            if hasattr(dialect, "value"):
                dialect = dialect.value
            validator = ScopeValidator(dialect=str(dialect).lower())
            ctx = {
                "coverage_cards": getattr(self.connection_entry, "coverage_cards", None) or [],
                "nl_question": nl,
                "db_type": str(dialect).lower(),
            }
            result = validator.validate(sql=sql, ctx=ctx)
        except Exception:
            return None

        hint = self._replan_controller.on_violation(result=result, original_sql=sql)
        if hint is None:
            return None
        return {"reason": hint.reason, "context": hint.context, "original_sql": hint.original_sql}
```

- [ ] **Step 4: Add SSE event + endpoint in `agent_routes.py`**

Open `backend/routers/agent_routes.py`. Find the SSE-event builders. Add a new helper:

```python
def _sse_intent_echo(card_payload: dict) -> str:
    import json
    return f"event: intent_echo\ndata: {json.dumps(card_payload)}\n\n"
```

Hook the emit in the main agent loop: after SQL-gen returns a candidate SQL and BEFORE the agent calls `_tool_run_sql`, call `engine._emit_intent_echo_if_ambiguous(nl, sql, tables)`; if non-None, yield the SSE event.

Add endpoint:

```python
@router.post("/api/v1/agent/echo-response")
async def echo_response(payload: dict):
    """User clicks Proceed / selects interpretation; resume the session."""
    session_id = payload.get("session_id")
    choice_id = payload.get("choice_id")   # e.g. "churn_30"
    if not session_id:
        raise HTTPException(400, "session_id required")
    # Pin the receipt so future turns see the choice.
    from pinned_receipts import PinnedReceiptStore, Receipt
    from datetime import datetime, timezone
    store = PinnedReceiptStore(root=".data/pinned_receipts")
    store.pin(session_id, Receipt(
        kind="intent_echo_accept",
        text=f"Interpretation accepted: {choice_id}",
        created_at=datetime.now(timezone.utc),
        session_id=session_id,
    ))
    return {"ok": True, "choice_id": choice_id}
```

- [ ] **Step 5: Run to verify pass**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_agent_echo_integration.py -v`
Expected: 3 PASS

- [ ] **Step 6: Commit**

```bash
git add backend/agent_engine.py backend/routers/agent_routes.py backend/tests/test_agent_echo_integration.py
git commit -m "feat(phase-d): AgentEngine emits intent_echo SSE event + replan hook"
```

---

### Task 11: Frontend IntentEcho component (invoke impeccable + taste skills)

**Files:**
- Create: `frontend/src/components/agent/IntentEcho.jsx`
- Create: `frontend/src/components/agent/IntentEcho.test.jsx`

**Before writing any JSX:** invoke the `impeccable` skill and the `taste-skill`. Follow the design directives in the AskDB project's existing chat aesthetic — the component must feel like part of the agent transcript, not a modal. Labels outside cards (not inside). No emojis. No border-left accent stripe. No glassmorphism decoration. Use `@phosphor-icons/react` for any iconography.

**Design spec:**
- Three UI states matching `mode`:
  - `auto_proceed` → returns `null` (component renders nothing)
  - `proceed_button` → one-column layout: operational definition + warnings list + `Proceed` button
  - `mandatory_choice` → operational definition + warnings + 2–3 pill-style option buttons (no generic Proceed)
- When `banner` is set (H5): render a top-anchored advisory line with warning tint; card remains compact.
- Framer Motion `layout` for smooth mount; no elastic easing.
- Keyboard: `Enter` confirms Proceed; arrow keys cycle pills; `Esc` cancels to default (if mode allows).
- A11y: `role="region"` on the card, `aria-live="polite"` on warnings, visible focus rings.

- [ ] **Step 1: Write failing component test**

Create `frontend/src/components/agent/IntentEcho.test.jsx`:

```jsx
import { render, screen, fireEvent } from '@testing-library/react';
import IntentEcho from './IntentEcho';
import { describe, it, expect, vi } from 'vitest';

describe('IntentEcho', () => {
  it('renders nothing in auto_proceed mode', () => {
    const { container } = render(
      <IntentEcho
        card={{ mode: 'auto_proceed', interpretations: [], warnings: [], operational_definition: '' }}
        onAccept={() => {}}
        onChoose={() => {}}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows Proceed button in proceed_button mode', () => {
    const onAccept = vi.fn();
    render(
      <IntentEcho
        card={{
          mode: 'proceed_button',
          interpretations: [{ id: 'proceed', text: 'Proceed' }],
          warnings: [],
          operational_definition: 'count users',
          ambiguity: 0.5,
        }}
        onAccept={onAccept}
        onChoose={() => {}}
      />
    );
    const btn = screen.getByRole('button', { name: /proceed/i });
    fireEvent.click(btn);
    expect(onAccept).toHaveBeenCalledOnce();
  });

  it('shows mandatory-choice pills in mandatory_choice mode', () => {
    const onChoose = vi.fn();
    render(
      <IntentEcho
        card={{
          mode: 'mandatory_choice',
          interpretations: [
            { id: 'churn_30', text: '30 days' },
            { id: 'churn_60', text: '60 days' },
            { id: 'churn_90', text: '90 days' },
          ],
          warnings: [],
          operational_definition: 'churn',
          ambiguity: 0.9,
        }}
        onAccept={() => {}}
        onChoose={onChoose}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /60 days/i }));
    expect(onChoose).toHaveBeenCalledWith('churn_60');
  });

  it('renders warnings list when present', () => {
    render(
      <IntentEcho
        card={{
          mode: 'proceed_button',
          interpretations: [{ id: 'proceed', text: 'Proceed' }],
          warnings: ["Clause 'by station' had no SQL counterpart"],
          operational_definition: 'x',
          ambiguity: 0.5,
        }}
        onAccept={() => {}}
        onChoose={() => {}}
      />
    );
    expect(screen.getByText(/by station/)).toBeInTheDocument();
  });

  it('renders banner when card has one (non-interactive mode)', () => {
    render(
      <IntentEcho
        card={{
          mode: 'auto_proceed',
          interpretations: [],
          warnings: [],
          operational_definition: 'x',
          ambiguity: 0.85,
          banner: 'Interpretation unconfirmed',
        }}
        onAccept={() => {}}
        onChoose={() => {}}
      />
    );
    expect(screen.getByText(/unconfirmed/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `cd "QueryCopilot V1/frontend" && npx vitest run src/components/agent/IntentEcho.test.jsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement component**

**First, invoke the `impeccable` skill and the `taste-skill` to establish design direction for this card.** Then implement:

Create `frontend/src/components/agent/IntentEcho.jsx`:

```jsx
import { motion, AnimatePresence } from 'framer-motion';
import { Warning } from '@phosphor-icons/react';

export default function IntentEcho({ card, onAccept, onChoose }) {
  if (!card) return null;
  const mode = card.mode;
  if (mode === 'auto_proceed' && !card.banner) return null;

  return (
    <AnimatePresence>
      <motion.section
        role="region"
        aria-label="Operational definition check"
        layout
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 140, damping: 18 }}
        className="intent-echo"
      >
        {card.banner && (
          <div className="intent-echo-banner" aria-live="polite">
            <Warning size={14} weight="regular" />
            <span>{card.banner}</span>
          </div>
        )}

        {mode !== 'auto_proceed' && (
          <>
            <p className="intent-echo-label">Interpreted as</p>
            <p className="intent-echo-definition">{card.operational_definition}</p>

            {card.warnings?.length > 0 && (
              <ul className="intent-echo-warnings" aria-live="polite">
                {card.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}

            <div className="intent-echo-actions">
              {mode === 'proceed_button' && (
                <button
                  type="button"
                  className="intent-echo-primary"
                  onClick={onAccept}
                  autoFocus
                >
                  Proceed
                </button>
              )}
              {mode === 'mandatory_choice' && card.interpretations.map((intp) => (
                <button
                  key={intp.id}
                  type="button"
                  className="intent-echo-pill"
                  onClick={() => onChoose(intp.id)}
                >
                  {intp.text}
                </button>
              ))}
            </div>
          </>
        )}
      </motion.section>
    </AnimatePresence>
  );
}
```

Add CSS (inside `frontend/src/index.css` or an existing agent stylesheet — match the existing chat aesthetic). Use semantic tokens (`--color-surface-raised`, `--color-text`, `--color-border-soft`, `--color-warn-fg`, etc.). No border-left accent stripes.

- [ ] **Step 4: Run to verify pass**

Run: `cd "QueryCopilot V1/frontend" && npx vitest run src/components/agent/IntentEcho.test.jsx`
Expected: 5 PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/agent/IntentEcho.jsx frontend/src/components/agent/IntentEcho.test.jsx frontend/src/index.css
git commit -m "feat(phase-d): IntentEcho React component (three firing modes)"
```

---

### Task 12: Frontend store + API wiring + Chat.jsx mount

**Files:**
- Modify: `frontend/src/store.js`
- Modify: `frontend/src/api.js`
- Modify: `frontend/src/pages/Chat.jsx`

- [ ] **Step 1: Extend Zustand store**

Open `frontend/src/store.js`. Find the agent-session state block. Add:

```js
  pendingIntentEcho: null,        // card payload or null
  echoPauseMs: 0,                 // time between card appear and accept
  echoRubberStampStreak: 0,       // H4 telemetry counter
  setPendingIntentEcho: (card) => set({ pendingIntentEcho: card, echoPauseMs: Date.now() }),
  acceptIntentEcho: () => {
    const { echoPauseMs, echoRubberStampStreak } = get();
    const delta = Date.now() - echoPauseMs;
    const isRubberStamp = delta < 500;   // matches ECHO_AUTO_DOWNGRADE_PAUSE_MS
    set({
      pendingIntentEcho: null,
      echoRubberStampStreak: isRubberStamp ? echoRubberStampStreak + 1 : 0,
    });
  },
  chooseIntentEcho: (choiceId) => set({ pendingIntentEcho: null, echoRubberStampStreak: 0 }),
```

- [ ] **Step 2: Extend api.js**

Open `frontend/src/api.js`. Add:

```js
export async function postEchoResponse(sessionId, choiceId) {
  const res = await fetch(`/api/v1/agent/echo-response`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ session_id: sessionId, choice_id: choiceId ?? 'proceed' }),
  });
  if (!res.ok) throw new Error('echo-response failed');
  return res.json();
}
```

Also wire the SSE event consumer (likely in `useAgentSession.js` or wherever the stream is consumed). Where the SSE parser maps events, add:

```js
    } else if (event.event === 'intent_echo') {
      useStore.getState().setPendingIntentEcho(JSON.parse(event.data));
```

- [ ] **Step 3: Mount component in Chat.jsx**

Open `frontend/src/pages/Chat.jsx`. Import `IntentEcho` and `useStore`. Near where agent messages render, add:

```jsx
        {pendingIntentEcho && (
          <IntentEcho
            card={pendingIntentEcho}
            onAccept={async () => {
              acceptIntentEcho();
              await postEchoResponse(currentSessionId, 'proceed');
            }}
            onChoose={async (choiceId) => {
              chooseIntentEcho(choiceId);
              await postEchoResponse(currentSessionId, choiceId);
            }}
          />
        )}
```

With imports and store selectors added at the top of the component.

- [ ] **Step 4: Run the frontend lint + build**

```bash
cd "QueryCopilot V1/frontend"
npm run lint 2>&1 | tail -5
npm run build 2>&1 | tail -10
```

Expected: no new errors; build succeeds.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/store.js frontend/src/api.js frontend/src/pages/Chat.jsx
git commit -m "feat(phase-d): wire IntentEcho SSE event + API + Chat render"
```

---

### Task 13: Trap suite — `trap_intent_drop.jsonl`

**Files:**
- Create: `backend/tests/trap_intent_drop.jsonl`

- [ ] **Step 1: Write 15 trap questions**

Create `backend/tests/trap_intent_drop.jsonl`:

```jsonl
{"id": "intent-001", "nl": "why are casual riders churning faster than members", "expected_sql_contains": ["rider_type"], "oracle": {"type": "must_emit_intent_echo", "min_ambiguity": 0.6}}
{"id": "intent-002", "nl": "show me top 10 users by engagement", "expected_sql_contains": ["ORDER BY", "LIMIT"], "oracle": {"type": "must_emit_intent_echo", "min_ambiguity": 0.3}}
{"id": "intent-003", "nl": "count active customers by month", "expected_sql_contains": ["GROUP BY", "month"], "oracle": {"type": "must_emit_intent_echo", "min_ambiguity": 0.3}}
{"id": "intent-004", "nl": "how many users are there", "expected_sql_contains": ["COUNT(*)"], "oracle": {"type": "must_not_emit_intent_echo", "max_ambiguity": 0.3}}
{"id": "intent-005", "nl": "total orders last quarter", "expected_sql_contains": ["COUNT", "orders"], "oracle": {"type": "must_include_clause", "clause_kind": "temporal"}}
{"id": "intent-006", "nl": "casual riders by station", "expected_sql_contains": ["rider_type", "GROUP BY", "station"], "oracle": {"type": "must_include_clause", "clause_kind": "groupby"}}
{"id": "intent-007", "nl": "users who have never logged in", "expected_sql_contains": ["LEFT JOIN", "IS NULL"], "oracle": {"type": "must_include_clause", "clause_kind": "cohort_filter"}}
{"id": "intent-008", "nl": "retention rate by signup cohort", "expected_sql_contains": ["GROUP BY"], "oracle": {"type": "must_emit_intent_echo", "min_ambiguity": 0.5}}
{"id": "intent-009", "nl": "revenue trend year over year", "expected_sql_contains": ["DATE_TRUNC", "year"], "oracle": {"type": "must_include_clause", "clause_kind": "temporal"}}
{"id": "intent-010", "nl": "avg trip duration by rider type", "expected_sql_contains": ["AVG", "GROUP BY", "rider_type"], "oracle": {"type": "must_include_clause", "clause_kind": "groupby"}}
{"id": "intent-011", "nl": "churn analysis for the product team", "expected_sql_contains": [], "oracle": {"type": "must_emit_intent_echo", "min_ambiguity": 0.7}}
{"id": "intent-012", "nl": "list all tables", "expected_sql_contains": [], "oracle": {"type": "must_not_emit_intent_echo", "max_ambiguity": 0.3}}
{"id": "intent-013", "nl": "top spenders this month", "expected_sql_contains": ["ORDER BY", "LIMIT"], "oracle": {"type": "must_include_clause", "clause_kind": "ordering"}}
{"id": "intent-014", "nl": "find duplicate emails", "expected_sql_contains": ["GROUP BY", "HAVING", "COUNT"], "oracle": {"type": "must_include_clause", "clause_kind": "groupby"}}
{"id": "intent-015", "nl": "active yearly subscribers who paid on time", "expected_sql_contains": ["active", "subscribers"], "oracle": {"type": "must_emit_intent_echo", "min_ambiguity": 0.5}}
```

- [ ] **Step 2: Validate JSONL shape**

Run: `cd "QueryCopilot V1/backend" && python -c "import json; [json.loads(l) for l in open('tests/trap_intent_drop.jsonl')]; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/tests/trap_intent_drop.jsonl
git commit -m "feat(phase-d): trap_intent_drop suite (15 Ring-4 intent-capture Qs)"
```

---

### Task 14: Extend trap grader with Ring-4 oracles

**Files:**
- Modify: `backend/tests/trap_grader.py`
- Create: `backend/tests/test_trap_grader_ring4.py`

**Design:** 3 new handlers:
- `must_emit_intent_echo(sql, oracle)` — passes when SQL comment contains `-- intent_echo: ambiguity={score}` with score ≥ `min_ambiguity`.
- `must_not_emit_intent_echo(sql, oracle)` — passes when SQL has no echo comment OR ambiguity ≤ `max_ambiguity`.
- `must_include_clause(sql, oracle)` — passes when SQL contains a marker `-- clause: <kind>` for the required clause kind.

The mock test runner should emit these comment markers when simulating the pipeline.

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_trap_grader_ring4.py`:

```python
"""Unit tests for Ring-4 oracle types."""
from pathlib import Path

from tests.trap_grader import grade_trap, _resolve_db_path


def _db():
    return _resolve_db_path(Path("/tmp/eval_fixture.sqlite"))


def test_must_emit_intent_echo_passes_on_marker_with_min_score():
    trap = {
        "id": "r4-t1", "nl": "",
        "expected_sql_contains": [],
        "oracle": {"type": "must_emit_intent_echo", "min_ambiguity": 0.5},
    }
    sql = "-- intent_echo: ambiguity=0.72\nSELECT 1"
    r = grade_trap(trap, sql, _db())
    assert r.passed is True


def test_must_emit_intent_echo_fails_when_no_marker():
    trap = {
        "id": "r4-t2", "nl": "",
        "expected_sql_contains": [],
        "oracle": {"type": "must_emit_intent_echo", "min_ambiguity": 0.5},
    }
    sql = "SELECT 1"
    r = grade_trap(trap, sql, _db())
    assert r.passed is False


def test_must_not_emit_intent_echo_passes_on_clean_sql():
    trap = {
        "id": "r4-t3", "nl": "",
        "expected_sql_contains": [],
        "oracle": {"type": "must_not_emit_intent_echo", "max_ambiguity": 0.3},
    }
    sql = "SELECT 1"
    r = grade_trap(trap, sql, _db())
    assert r.passed is True


def test_must_include_clause_passes_on_marker():
    trap = {
        "id": "r4-t4", "nl": "",
        "expected_sql_contains": [],
        "oracle": {"type": "must_include_clause", "clause_kind": "groupby"},
    }
    sql = "-- clause: groupby\nSELECT 1 GROUP BY 1"
    r = grade_trap(trap, sql, _db())
    assert r.passed is True


def test_must_include_clause_fails_when_missing():
    trap = {
        "id": "r4-t5", "nl": "",
        "expected_sql_contains": [],
        "oracle": {"type": "must_include_clause", "clause_kind": "temporal"},
    }
    sql = "SELECT 1"
    r = grade_trap(trap, sql, _db())
    assert r.passed is False
```

- [ ] **Step 2: Run to verify fail**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_trap_grader_ring4.py -v`
Expected: FAIL

- [ ] **Step 3: Extend grader**

Open `backend/tests/trap_grader.py`. Add three handler functions ABOVE `_HANDLERS`:

```python
import re as _re


def _check_must_emit_intent_echo(sql: str, oracle: dict) -> tuple:
    min_amb = float(oracle.get("min_ambiguity", 0.3))
    m = _re.search(r"intent_echo:\s*ambiguity=([\d.]+)", sql, _re.IGNORECASE)
    if not m:
        return False, f"no intent_echo marker in SQL"
    score = float(m.group(1))
    if score < min_amb:
        return False, f"intent_echo ambiguity {score} below required {min_amb}"
    return True, f"intent_echo ambiguity {score} ≥ {min_amb}"


def _check_must_not_emit_intent_echo(sql: str, oracle: dict) -> tuple:
    max_amb = float(oracle.get("max_ambiguity", 0.3))
    m = _re.search(r"intent_echo:\s*ambiguity=([\d.]+)", sql, _re.IGNORECASE)
    if not m:
        return True, "no intent_echo marker (clean)"
    score = float(m.group(1))
    if score > max_amb:
        return False, f"intent_echo fired at {score} but expected ≤ {max_amb}"
    return True, f"intent_echo at {score} within allowed ≤ {max_amb}"


def _check_must_include_clause(sql: str, oracle: dict) -> tuple:
    kind = oracle.get("clause_kind", "")
    marker = f"clause: {kind}"
    if marker.lower() in sql.lower():
        return True, f"clause {kind!r} present"
    return False, f"clause {kind!r} missing from SQL"
```

Extend `_HANDLERS`:

```python
    # Phase D — Ring 4 oracles.
    "must_emit_intent_echo":     lambda sql, ora, _db: _check_must_emit_intent_echo(sql, ora),
    "must_not_emit_intent_echo": lambda sql, ora, _db: _check_must_not_emit_intent_echo(sql, ora),
    "must_include_clause":       lambda sql, ora, _db: _check_must_include_clause(sql, ora),
```

- [ ] **Step 4: Run to verify pass**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_trap_grader_ring4.py -v`
Expected: 5 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/tests/trap_grader.py backend/tests/test_trap_grader_ring4.py
git commit -m "feat(phase-d): trap grader — Ring-4 oracle types (emit_echo / include_clause)"
```

---

### Task 15: Generate baseline + regression check

**Files:**
- Create: `.data/intent_drop_baseline.json`
- Modify: `.gitignore`

- [ ] **Step 1: Seed fixture + write baseline**

```bash
cd "QueryCopilot V1/backend"
python -m tests.fixtures.eval_seed %TEMP%\eval_fixture.sqlite
python -m tests.run_traps tests/trap_intent_drop.jsonl ../.data/intent_drop_baseline.json --write-baseline
```

Expected: `Wrote baseline: .data/intent_drop_baseline.json`

- [ ] **Step 2: Re-run without --write-baseline**

```bash
cd "QueryCopilot V1/backend"
python -m tests.run_traps tests/trap_intent_drop.jsonl ../.data/intent_drop_baseline.json
```

Expected: no regressions vs baseline.

- [ ] **Step 3: Confirm prior suites still green**

```bash
cd "QueryCopilot V1/backend"
python -m tests.run_traps tests/trap_temporal_scope.jsonl     ../.data/eval_baseline.json
python -m tests.run_traps tests/trap_coverage_grounding.jsonl ../.data/coverage_baseline.json
python -m tests.run_traps tests/trap_name_inference.jsonl     ../.data/name_inference_baseline.json
python -m tests.run_traps tests/trap_join_scale.jsonl         ../.data/join_scale_baseline.json
```

Expected: all four report no regressions.

- [ ] **Step 4: .gitignore negation**

Run: `grep -n "intent_drop_baseline" "QueryCopilot V1/.gitignore" || echo "NOT_IGNORED"`

If `NOT_IGNORED`, append:

```
# Phase D trap baseline — committed per H13
!.data/intent_drop_baseline.json
```

- [ ] **Step 5: Commit**

```bash
git add .data/intent_drop_baseline.json .gitignore
git commit -m "feat(phase-d): Ring-4 trap baseline committed (intent_drop)"
```

---

### Task 16: CI gate — wire new trap suite

**Files:**
- Modify: `.github/workflows/agent-traps.yml`

- [ ] **Step 1: Inspect workflow**

Run: `grep -n "run_traps" "QueryCopilot V1/.github/workflows/agent-traps.yml"`

Expected: steps for temporal_scope, coverage_grounding, name_inference, join_scale.

- [ ] **Step 2: Add intent_drop step**

Open `.github/workflows/agent-traps.yml`. After the `join_scale` step, append:

```yaml
      - name: Run Ring-4 intent-drop trap suite against mock
        run: |
          python -m backend.tests.run_traps \
            backend/tests/trap_intent_drop.jsonl \
            .data/intent_drop_baseline.json \
            --db /tmp/eval_fixture.sqlite
```

- [ ] **Step 3: Validate YAML**

Run: `cd "QueryCopilot V1" && python -c "import yaml; yaml.safe_load(open('.github/workflows/agent-traps.yml')); print('OK')"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/agent-traps.yml
git commit -m "feat(phase-d): CI gates Ring-4 trap baseline (intent_drop)"
```

---

### Task 17: Phase D exit gate

- [ ] **Step 1: Full backend test suite**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/ -v 2>&1 | tail -30`
Expected: ~1590+ pass (Phase C's 1540+ + ~45 Phase D tests), 1 skip.

- [ ] **Step 2: All five trap suites back-to-back**

```bash
cd "QueryCopilot V1/backend"
python -m tests.fixtures.eval_seed %TEMP%\eval_fixture.sqlite
python -m tests.run_traps tests/trap_temporal_scope.jsonl       ../.data/eval_baseline.json
python -m tests.run_traps tests/trap_coverage_grounding.jsonl   ../.data/coverage_baseline.json
python -m tests.run_traps tests/trap_name_inference.jsonl       ../.data/name_inference_baseline.json
python -m tests.run_traps tests/trap_join_scale.jsonl           ../.data/join_scale_baseline.json
python -m tests.run_traps tests/trap_intent_drop.jsonl          ../.data/intent_drop_baseline.json
```

Expected: all five report no regressions.

- [ ] **Step 3: Import health**

```bash
cd "QueryCopilot V1/backend"
python -c "
import sys; sys.path.insert(0, '.')
from intent_echo import IntentEchoCard, build_echo, echo_to_sse_payload, EchoMode, InteractionMode
from ambiguity_detector import score_ambiguity, AmbiguityFeatures
from clause_inventory import Clause, ClauseInventory, extract_clauses, validate_mapping
from pinned_receipts import PinnedReceiptStore, Receipt
from semantic_registry import SemanticRegistry, Definition, NotFound
from drift_detector import detect_fiscal_calendar_mismatch, detect_merger_pattern, DriftFinding
from replan_controller import ReplanController, ReplanHint
import agent_engine
assert hasattr(agent_engine.AgentEngine, '_emit_intent_echo_if_ambiguous')
assert hasattr(agent_engine.AgentEngine, '_handle_scope_violations_with_replan')
print('Phase D imports OK')
"
```

Expected: `Phase D imports OK`

- [ ] **Step 4: Frontend lint + build + component test**

```bash
cd "QueryCopilot V1/frontend"
npm run lint 2>&1 | tail -5
npm run build 2>&1 | tail -10
npx vitest run src/components/agent/IntentEcho.test.jsx
```

Expected: no new errors; build succeeds; all component tests PASS.

- [ ] **Step 5: CI YAML validation**

```bash
cd "QueryCopilot V1"
python -c "import yaml; yaml.safe_load(open('.github/workflows/agent-traps.yml')); yaml.safe_load(open('.github/workflows/pii-scan.yml')); print('CI OK')"
```

Expected: `CI OK`

- [ ] **Step 6: Manual smoke — preview server**

Start the dev server and visually verify the three echo modes in browser. Requires a real DB connection.

```bash
cd "QueryCopilot V1/backend"
uvicorn main:app --reload --port 8002 &
```

```bash
cd "QueryCopilot V1/frontend"
npm run dev
```

Open `http://localhost:5173`, connect a DB, ask the three NL questions below, verify UI:

1. `"how many users are there"` → no card (auto_proceed).
2. `"top 10 active customers"` → card with Proceed button (proceed_button).
3. `"why are casual riders churning"` → card with 3 pills (mandatory_choice).

Document the result in the commit message.

- [ ] **Step 7: Exit commit**

```bash
git commit --allow-empty -m "chore(phase-d): exit gate — T0-T16 shipped, Ring-4 trap committed, CI wired, preview verified"
```

---

## Phase D exit criteria

- [ ] Backend modules created and importable: `intent_echo`, `ambiguity_detector`, `clause_inventory`, `pinned_receipts`, `semantic_registry`, `drift_detector`, `replan_controller`.
- [ ] `AgentEngine._emit_intent_echo_if_ambiguous()` present.
- [ ] `AgentEngine._handle_scope_violations_with_replan()` present and wires Phase C `ReplanBudget`.
- [ ] `SchemaProfile.TableProfile` has `tz_aware_columns` + `soft_delete_columns` fields populated.
- [ ] New SSE event `intent_echo` + new endpoint `POST /api/v1/agent/echo-response`.
- [ ] Frontend `IntentEcho.jsx` renders three modes; Zustand wires `pendingIntentEcho`; Chat.jsx mounts the component.
- [ ] `trap_intent_drop.jsonl` (15 Qs) + `.data/intent_drop_baseline.json` committed.
- [ ] All five trap suites pass without regressions.
- [ ] Full pytest suite: ~1590+ pass, 1 skip.
- [ ] Frontend lint + build green; `IntentEcho.test.jsx` passes.
- [ ] CI workflow gates all five suites.
- [ ] Manual preview: three echo modes render correctly in the browser.

---

## Risk notes & follow-ups

- **Ambiguity scoring is deterministic-only in Phase D** — the master plan envisions a Haiku second-opinion in the `[0.35, 0.65]` gray zone. That LLM call is deferred to Phase E to keep the replan budget focused on Ring 3 for now. Telemetry on false-positive rate will guide whether the LLM call is worth latency.
- **Clause inventory extractor relies on injected LLM function** — the real production path needs a Haiku call inside `clause_inventory.extract_clauses` wired through `anthropic_provider`. For Phase D tests we inject a callable to avoid network calls. The production integration is a one-line hook in `_emit_intent_echo_if_ambiguous` and is gated by `FEATURE_INTENT_ECHO`.
- **Auto-downgrade telemetry is client-side in Phase D** — the rubber-stamp streak counter lives in Zustand. A Phase E follow-up will ship this to the backend so it survives page reloads + tab close. Until then, long-session effectiveness is bounded.
- **Semantic registry has no admin UI yet** — definitions are loaded via JSON-file edits. Phase F admin panel will add CRUD; for Phase D, the registry is wired but empty by default.
- **DriftDetector only ships fiscal-mismatch + merger detection** — denormalization drift requires Phase-B card history (two snapshots), which isn't persisted yet. Card-history is an F-phase add.
- **ReplanController wires budget but not re-prompt** — Task 10 consumes the budget and returns a `ReplanHint` dict, but the main SQL-gen loop does not yet absorb that hint into a new Haiku call. That final wire-up happens in an in-Phase-D T10.5 follow-up commit OR Phase E, depending on observed false-positive rates from Phase C. Keep the hint structure stable.
- **Pinned receipts bypass SessionMemory compaction**, but the SessionMemory module itself is not modified in Phase D — the receipt store is just an additional store agents consult on prompt assembly. Phase E integration will teach the compactor to skip receipt spans.
- **Frontend test stack assumptions** — the test file uses Vitest + React Testing Library. If the project doesn't already have RTL installed, add `@testing-library/react` + `@testing-library/jest-dom` to `devDependencies` in Task 11 Step 3 and import the jest-dom extensions in `vitest.setup.js`.

---

## Execution note for agentic workers

Task dependencies form four independent tracks with a sequential integration tail:

- **Track 1 (foundation, parallel with T1):** T0 config flags (standalone).
- **Track 2 (core Ring-4 backend, partially parallel):**
  - T1 Ambiguity detector → T2 Clause inventory → T4 Intent echo (sequential because T4 imports from T1 + T2).
  - T3 Pinned receipts (parallel with T1-T4).
- **Track 3 (H12 + schema back-fills, parallel):**
  - T5 Schema intel tz/soft-delete extensions (standalone).
  - T7 Semantic registry + T8 Drift detector (standalone pair).
- **Track 4 (Phase C carry-forward, after T1-T4):**
  - T6 Replan controller → T9 Non-interactive mode (both extend T4 echo module).
- **Integration tail (sequential, after all tracks):**
  - T10 Agent-engine integration (depends on T4, T6).
  - T11 Frontend component (depends on T10 SSE payload shape).
  - T12 Frontend store + Chat mount (depends on T11).
  - T13–T16 Trap JSONL + grader + baseline + CI (parallel with T10-T12 internally).
  - T17 Exit gate (last).

Recommended parallel track split:

- **Track A:** T0 → T1 → T2 → T3 → T4 (Ring-4 foundation).
- **Track B:** T5 (schema back-fill, independent).
- **Track C:** T7 → T8 (H12 pair, independent).
- **Track D:** T13 → T14 → T15 (trap JSONL + grader + baseline — can run once T0 is committed).

After all four tracks: merge → T6 → T9 → T10 → T11 → T12 → T16 → T17 serially.

Estimated serial time: ~14-16 hours (Phase D is the largest phase by scope). Estimated parallel time: ~4-5 hours.
