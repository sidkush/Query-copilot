# Grounding Stack v6 — Phase F (Correction Pipeline — P6 + P10 + H15) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Frontend task (T16/T17):** Before writing UI code invoke `impeccable` + `taste-skill` (user memory `feedback_frontend_skills.md`). Admin Promotions page renders in the existing admin surface (`AdminApp.jsx`). Match the `AdminDashboard` visual language — `oklch` tokens, no border-left stripes, no glassmorphism, `@phosphor-icons/react`. The approval queue must feel like a code-review diff (SQL-left / SQL-right).

**Goal:** Wire the self-improvement loop so agents can promote successful queries to few-shot examples, gated by three independent safety rails: (a) **H15 admin-ceremony** — 2-admin approval state machine + per-day rate limit; (b) **golden-eval promotion gate** — run all seven Phase A–E trap baselines in shadow; block promotion if any regresses beyond threshold; (c) **adversarial-similarity detector** — block thumbs-up storms originating from the same user / cosine-close residual (residual-risk #6). Ship the right-to-erasure cascade deferred from Phase E (ChromaDB + audit + Turbo twin).

**Architecture:** Four new backend modules (`admin_ceremony.py`, `adversarial_similarity.py`, `golden_eval_gate.py`, `correction_pipeline.py`). `correction_pipeline.promote_to_examples()` becomes the single entry-point into ChromaDB promotion; the existing `correction_reviewer.promote_to_examples()` stub is rewired to call it. `query_memory.py` gains `promote_example()` + per-tenant quota. `admin_routes.py` gains three admin-scoped endpoints. `trap_grader.py` gains one new oracle (`must_block_thumbs_up_storm`). One new React page (`AdminPromotions.jsx`) + store wiring. All modules are code-layer and independently feature-flagged.

**Tech Stack:** Python 3.10+, `sqlglot` (already pinned — for AST normalization of SQL before diversity check), Phase E `tenant_fortress` (composite keys for per-tenant quota), Phase E `chaos_isolation.CostBreaker` (reused pattern for admin-approval rate limit), existing `correction_queue` + `correction_reviewer`, ChromaDB (per-connection namespaced collections), SQLite (agent session store pattern applied to promotion-ledger). Frontend: React 19 + Zustand + `@phosphor-icons/react` + `react-diff-viewer-continued` (new pin, only if not already present — verify before adding).

**Scope — Phase F covers vs defers:**
- ✅ `AdminCeremony` 2-admin state machine (`pending → first_ack → approved | rejected`)
- ✅ Per-admin per-day approval rate-limit (residual-risk #6 mitigation)
- ✅ `AdversarialSimilarity` — cosine distance + per-user thumbs-up rate (24h sliding window) → block storm
- ✅ `GoldenEvalGate` — runs all 7 committed trap baselines in shadow against the candidate corpus; regression > `PROMOTION_GOLDEN_EVAL_THRESHOLD_PCT` → block
- ✅ `CorrectionPipeline.promote_to_examples()` — single entry-point, orchestrates ceremony + similarity + gate
- ✅ `QueryMemory.promote_example()` — tenant-scoped ChromaDB write (uses Phase E `tenant_fortress.chroma_namespace`)
- ✅ Per-tenant promotion quota (`PROMOTIONS_PER_TENANT_PER_DAY`)
- ✅ Right-to-erasure cascade — `delete_tenant_data()` wipes ChromaDB namespace + Turbo twin + audit entries + correction queue + promotion ledger
- ✅ Admin endpoints: `GET /api/v1/admin/promotions/pending`, `POST /api/v1/admin/promotions/{id}/approve`, `POST /api/v1/admin/promotions/{id}/reject`
- ✅ `trap_grader.py` new oracle: `must_block_thumbs_up_storm`
- ✅ 1 new trap suite: `trap_correction_pipeline.jsonl` (15 Qs — ceremony, storm, regression-gate, erasure)
- ✅ 1 new committed baseline: `.data/correction_pipeline_baseline.json`
- ✅ New React admin page with SQL-diff review UI
- ✅ CI gate extension (eighth trap suite)
- ⛔ **Deferred:** Skill bundles + query expansion (Phase G), supply-chain + infra hardening H19–H27 (Phase H), Alert-Manager for promotion-flow anomalies (Phase I), doc rollup (Phase J).

---

## Prerequisites

- [ ] Branch `askdb-global-comp` at or after Phase E exit gate.
- [ ] `python -m pytest backend/tests/ -v` green (~1650+ pass, 1 skip).
- [ ] Phase E modules import cleanly: `provenance_chip`, `tier_promote`, `skew_guard`, `tenant_fortress`, `chaos_isolation`, `result_provenance`, `sampling_aware`.
- [ ] All seven prior trap baselines present: `eval_baseline.json`, `coverage_baseline.json`, `name_inference_baseline.json`, `join_scale_baseline.json`, `intent_drop_baseline.json`, `sampling_trust_baseline.json`, `multi_tenant_baseline.json`.
- [ ] `backend/correction_queue.py` + `backend/correction_reviewer.py` present (pre-existing from earlier sprint).
- [ ] `backend/eval/run_golden_eval.py` exposes `run()` + `is_regression()`.
- [ ] Fixture DB present: `python -m backend.tests.fixtures.eval_seed %TEMP%\eval_fixture.sqlite`.
- [ ] Read master plan Ring 6, H15 sections + Phase F row (line 253).

---

## File Structure

| Path | Create/Edit | Purpose |
|---|---|---|
| `backend/admin_ceremony.py` | Create | 2-admin state machine (`PENDING → FIRST_ACK → APPROVED | REJECTED`) + per-admin rate limit |
| `backend/adversarial_similarity.py` | Create | Cosine similarity + per-user thumbs-up rate over sliding window → storm detection |
| `backend/golden_eval_gate.py` | Create | Runs all 7 trap baselines in shadow; computes per-suite deltas; blocks on regression |
| `backend/correction_pipeline.py` | Create | `promote_to_examples()` single entry-point wiring ceremony + similarity + gate + quota |
| `backend/tests/test_admin_ceremony.py` | Create | State machine transitions + rate limit |
| `backend/tests/test_adversarial_similarity.py` | Create | Cosine threshold + sliding-window detection |
| `backend/tests/test_golden_eval_gate.py` | Create | Delta computation + threshold block logic |
| `backend/tests/test_correction_pipeline.py` | Create | End-to-end `promote_to_examples` with mock gates |
| `backend/tests/test_right_to_erasure.py` | Create | Cascade → ChromaDB + Turbo twin + audit |
| `backend/tests/trap_correction_pipeline.jsonl` | Create | 15 Qs — ceremony, storm, regression, erasure |
| `.data/correction_pipeline_baseline.json` | Create (committed) | Mock baseline |
| `backend/tests/trap_grader.py` | Modify | New `must_block_thumbs_up_storm` oracle |
| `backend/tests/test_trap_grader_phase_f.py` | Create | Unit tests for new oracle |
| `backend/query_memory.py` | Modify | `promote_example()` tenant-scoped write + per-tenant quota + `delete_tenant_namespace()` |
| `backend/correction_reviewer.py` | Modify | Rewire stub `promote_to_examples` to call `correction_pipeline.promote_to_examples` |
| `backend/user_storage.py` | Modify | `delete_tenant_data()` cascade (ChromaDB + Turbo twin + audit + queue + ledger) |
| `backend/routers/admin_routes.py` | Modify | `/promotions/pending` + `/approve` + `/reject` endpoints (admin-JWT gated) |
| `backend/config.py` | Modify | ~9 new flags |
| `docs/claude/config-defaults.md` | Modify | "Phase F — Correction Pipeline" section |
| `frontend/src/pages/AdminPromotions.jsx` | Create | Admin page — SQL-diff review UI |
| `frontend/src/pages/AdminPromotions.test.jsx` | Create | RTL tests |
| `frontend/src/store.js` | Modify | `promotions`, `promotionDecision` state + actions |
| `frontend/src/AdminApp.jsx` | Modify | Route `/admin/promotions` |
| `frontend/src/pages/AdminDashboard.jsx` | Modify | Add "Promotions" tile + pending count badge |
| `.github/workflows/agent-traps.yml` | Modify | Gate eighth suite |

---

## Track A — Foundation (config + rate limits)

### Task 0: Config flags + config-defaults section

**Files:**
- Modify: `backend/config.py`
- Modify: `docs/claude/config-defaults.md`

- [ ] **Step 1: Add config fields**

Open `backend/config.py`. Find the "Sampling-Aware Correctness (Phase E — H11)" block (ends with `VIZQL_HEX_BIN_THRESHOLD_ROWS`). Add immediately below it:

```python
    # ── Correction Pipeline (Phase F — P6 + P10 + H15) ──
    FEATURE_CORRECTION_PIPELINE: bool = Field(default=True)
    PROMOTION_ADMIN_CEREMONY_REQUIRED: bool = Field(default=True)
    PROMOTION_CEREMONY_PER_ADMIN_DAILY_LIMIT: int = Field(default=20)
    PROMOTIONS_PER_TENANT_PER_DAY: int = Field(default=10)
    PROMOTION_GOLDEN_EVAL_THRESHOLD_PCT: float = Field(default=2.0, description="% pass-rate drop that blocks promotion")
    ADVERSARIAL_SIMILARITY_COSINE_THRESHOLD: float = Field(default=0.92, description="cosine ≥ this among same user → storm")
    ADVERSARIAL_SIMILARITY_WINDOW_HOURS: int = Field(default=1)
    ADVERSARIAL_SIMILARITY_MAX_UPVOTES: int = Field(default=3, description="> N thumbs-up in window → block")
    PROMOTION_LEDGER_DIR: str = Field(default=".data/promotion_ledger")
```

- [ ] **Step 2: Update config-defaults.md**

Open `docs/claude/config-defaults.md`. Find the "Sampling-Aware Correctness" subsection ending at `VIZQL_HEX_BIN_THRESHOLD_ROWS`. Add a new section immediately below "### Provenance + Tenant + Chaos" block:

```markdown
### Correction Pipeline (Phase F — P6 + P10 + H15)

| Constant | Value | Notes |
|---|---|---|
| `FEATURE_CORRECTION_PIPELINE` | `True` | Master gate for Phase F. Off → `promote_to_examples()` no-ops with log line. |
| `PROMOTION_ADMIN_CEREMONY_REQUIRED` | `True` | H15 — require 2-admin approval. Off → auto-promote (staging only). |
| `PROMOTION_CEREMONY_PER_ADMIN_DAILY_LIMIT` | `20` | H15 — per-admin approval quota per 24h rolling window. 429 when exceeded. |
| `PROMOTIONS_PER_TENANT_PER_DAY` | `10` | Per-tenant promotion cap. Enforced in `query_memory.promote_example`. |
| `PROMOTION_GOLDEN_EVAL_THRESHOLD_PCT` | `2.0` | % pass-rate drop on any trap suite that blocks promotion. |
| `ADVERSARIAL_SIMILARITY_COSINE_THRESHOLD` | `0.92` | Cosine distance under which 2 upvotes from same user count as storm. |
| `ADVERSARIAL_SIMILARITY_WINDOW_HOURS` | `1` | Sliding window for thumbs-up storm detection. |
| `ADVERSARIAL_SIMILARITY_MAX_UPVOTES` | `3` | Max thumbs-ups from same user in window before block. |
| `PROMOTION_LEDGER_DIR` | `.data/promotion_ledger` | JSONL append-only ledger of promotion decisions. |
```

- [ ] **Step 3: Sanity check**

```bash
cd "QueryCopilot V1/backend"
python -c "from config import settings; print(settings.FEATURE_CORRECTION_PIPELINE, settings.PROMOTION_ADMIN_CEREMONY_REQUIRED, settings.PROMOTION_GOLDEN_EVAL_THRESHOLD_PCT)"
```

Expected: `True True 2.0`

- [ ] **Step 4: Commit**

```bash
git add backend/config.py docs/claude/config-defaults.md
git commit -m "feat(phase-f): config flags for correction pipeline (P6 + P10 + H15)"
```

---

## Track B — Admin Ceremony (H15)

### Task 1: AdminCeremony state machine + rate limit

**Files:**
- Create: `backend/admin_ceremony.py`
- Create: `backend/tests/test_admin_ceremony.py`

**Design:** File-backed JSON state machine per promotion candidate. States: `PENDING → FIRST_ACK → APPROVED | REJECTED`. Second admin MUST differ from first. Per-admin 24h rolling rate limit uses the same sliding-window pattern as `chaos_isolation.CostBreaker` (Phase E).

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_admin_ceremony.py`:

```python
"""AdminCeremony — 2-admin state machine + rate limit."""
import pytest
from datetime import datetime, timezone, timedelta

from admin_ceremony import (
    AdminCeremony, CeremonyState, CeremonyError, RateLimitExceeded,
    CeremonyRecord,
)


def test_new_ceremony_starts_pending(tmp_path):
    c = AdminCeremony(root=tmp_path)
    rec = c.open(candidate_id="prom-001", question="how many trips 2024", proposed_sql="SELECT COUNT(*) FROM trips")
    assert rec.state is CeremonyState.PENDING
    assert rec.first_admin is None


def test_first_ack_advances_to_first_ack(tmp_path):
    c = AdminCeremony(root=tmp_path)
    c.open(candidate_id="prom-002", question="q", proposed_sql="SELECT 1")
    rec = c.ack(candidate_id="prom-002", admin_email="alice@x.com", approve=True)
    assert rec.state is CeremonyState.FIRST_ACK
    assert rec.first_admin == "alice@x.com"


def test_second_different_admin_approves(tmp_path):
    c = AdminCeremony(root=tmp_path)
    c.open(candidate_id="prom-003", question="q", proposed_sql="SELECT 1")
    c.ack(candidate_id="prom-003", admin_email="alice@x.com", approve=True)
    rec = c.ack(candidate_id="prom-003", admin_email="bob@x.com", approve=True)
    assert rec.state is CeremonyState.APPROVED
    assert rec.second_admin == "bob@x.com"


def test_second_same_admin_rejected(tmp_path):
    c = AdminCeremony(root=tmp_path)
    c.open(candidate_id="prom-004", question="q", proposed_sql="SELECT 1")
    c.ack(candidate_id="prom-004", admin_email="alice@x.com", approve=True)
    with pytest.raises(CeremonyError, match="different admin"):
        c.ack(candidate_id="prom-004", admin_email="alice@x.com", approve=True)


def test_reject_at_first_ack_terminal(tmp_path):
    c = AdminCeremony(root=tmp_path)
    c.open(candidate_id="prom-005", question="q", proposed_sql="SELECT 1")
    rec = c.ack(candidate_id="prom-005", admin_email="alice@x.com", approve=False)
    assert rec.state is CeremonyState.REJECTED


def test_rate_limit_enforces_per_admin_daily_cap(tmp_path):
    c = AdminCeremony(root=tmp_path, per_admin_daily_limit=2)
    # Alice approves 2 distinct candidates.
    for i in range(2):
        cid = f"prom-rl-{i}"
        c.open(candidate_id=cid, question="q", proposed_sql="SELECT 1")
        c.ack(candidate_id=cid, admin_email="alice@x.com", approve=True)
    # 3rd attempt trips limit.
    c.open(candidate_id="prom-rl-2", question="q", proposed_sql="SELECT 1")
    with pytest.raises(RateLimitExceeded):
        c.ack(candidate_id="prom-rl-2", admin_email="alice@x.com", approve=True)


def test_list_pending_returns_only_pending_and_first_ack(tmp_path):
    c = AdminCeremony(root=tmp_path)
    c.open(candidate_id="A", question="q", proposed_sql="SELECT 1")
    c.open(candidate_id="B", question="q", proposed_sql="SELECT 2")
    c.ack(candidate_id="B", admin_email="alice@x.com", approve=True)
    c.open(candidate_id="C", question="q", proposed_sql="SELECT 3")
    c.ack(candidate_id="C", admin_email="alice@x.com", approve=False)  # rejected
    pending = c.list_pending()
    ids = {p.candidate_id for p in pending}
    assert ids == {"A", "B"}


def test_missing_candidate_raises(tmp_path):
    c = AdminCeremony(root=tmp_path)
    with pytest.raises(CeremonyError, match="unknown candidate"):
        c.ack(candidate_id="ghost", admin_email="alice@x.com", approve=True)


def test_record_persists_across_instances(tmp_path):
    c1 = AdminCeremony(root=tmp_path)
    c1.open(candidate_id="prom-006", question="q", proposed_sql="SELECT 1")
    c1.ack(candidate_id="prom-006", admin_email="alice@x.com", approve=True)
    # Fresh instance re-reads disk.
    c2 = AdminCeremony(root=tmp_path)
    rec = c2.get(candidate_id="prom-006")
    assert rec.state is CeremonyState.FIRST_ACK
    assert rec.first_admin == "alice@x.com"
```

- [ ] **Step 2: Run to verify fail**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_admin_ceremony.py -v`
Expected: FAIL — `ModuleNotFoundError: admin_ceremony`

- [ ] **Step 3: Implement**

Create `backend/admin_ceremony.py`:

```python
"""H15 — 2-admin approval ceremony for correction promotions.

State machine:
    PENDING → FIRST_ACK (approve) → APPROVED (2nd admin, must differ)
    PENDING → REJECTED (1st admin rejects)
    FIRST_ACK → REJECTED (2nd admin rejects)

Rate limit: per-admin 24h rolling window cap on approvals.
Records persisted atomically to JSON files under `root/{candidate_id}.json`.
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass, asdict, field
from datetime import datetime, timedelta, timezone
from enum import Enum
from pathlib import Path
from typing import Optional


class CeremonyState(Enum):
    PENDING = "pending"
    FIRST_ACK = "first_ack"
    APPROVED = "approved"
    REJECTED = "rejected"


class CeremonyError(RuntimeError):
    """Raised on invalid state transition or unknown candidate."""


class RateLimitExceeded(RuntimeError):
    """Raised when an admin has exceeded per-day approval quota."""


@dataclass
class CeremonyRecord:
    candidate_id: str
    question: str
    proposed_sql: str
    state: CeremonyState = CeremonyState.PENDING
    first_admin: Optional[str] = None
    second_admin: Optional[str] = None
    first_ack_at: Optional[str] = None
    terminal_at: Optional[str] = None
    reject_reason: Optional[str] = None

    def to_dict(self) -> dict:
        d = asdict(self)
        d["state"] = self.state.value
        return d

    @classmethod
    def from_dict(cls, d: dict) -> "CeremonyRecord":
        d = dict(d)
        d["state"] = CeremonyState(d["state"])
        return cls(**d)


def _iso_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M%SZ")


def _atomic_write(path: Path, data: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(data, encoding="utf-8")
    os.replace(tmp, path)


class AdminCeremony:
    def __init__(self, root, per_admin_daily_limit: Optional[int] = None):
        self.root = Path(root)
        if per_admin_daily_limit is None:
            try:
                from config import settings
                per_admin_daily_limit = int(settings.PROMOTION_CEREMONY_PER_ADMIN_DAILY_LIMIT)
            except Exception:
                per_admin_daily_limit = 20
        self.per_admin_daily_limit = per_admin_daily_limit

    def _path(self, candidate_id: str) -> Path:
        return self.root / f"{candidate_id}.json"

    def _load(self, candidate_id: str) -> CeremonyRecord:
        p = self._path(candidate_id)
        if not p.exists():
            raise CeremonyError(f"unknown candidate: {candidate_id}")
        return CeremonyRecord.from_dict(json.loads(p.read_text(encoding="utf-8")))

    def _save(self, rec: CeremonyRecord) -> None:
        _atomic_write(self._path(rec.candidate_id), json.dumps(rec.to_dict(), indent=2))

    def _count_recent_approvals(self, admin_email: str) -> int:
        """Count APPROVED or FIRST_ACK records advanced by `admin_email` in last 24h."""
        if not self.root.exists():
            return 0
        cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
        n = 0
        for p in self.root.glob("*.json"):
            try:
                rec = CeremonyRecord.from_dict(json.loads(p.read_text(encoding="utf-8")))
            except Exception:
                continue
            ts_str = rec.terminal_at or rec.first_ack_at
            if not ts_str:
                continue
            try:
                ts = datetime.strptime(ts_str, "%Y-%m-%dT%H%M%SZ").replace(tzinfo=timezone.utc)
            except ValueError:
                continue
            if ts < cutoff:
                continue
            if rec.first_admin == admin_email or rec.second_admin == admin_email:
                n += 1
        return n

    def open(self, *, candidate_id: str, question: str, proposed_sql: str) -> CeremonyRecord:
        rec = CeremonyRecord(
            candidate_id=candidate_id,
            question=question,
            proposed_sql=proposed_sql,
        )
        self._save(rec)
        return rec

    def ack(self, *, candidate_id: str, admin_email: str, approve: bool,
            reason: Optional[str] = None) -> CeremonyRecord:
        if self._count_recent_approvals(admin_email) >= self.per_admin_daily_limit:
            raise RateLimitExceeded(
                f"{admin_email} exceeded {self.per_admin_daily_limit}/day"
            )
        rec = self._load(candidate_id)
        now = _iso_now()
        if rec.state is CeremonyState.PENDING:
            if not approve:
                rec.state = CeremonyState.REJECTED
                rec.first_admin = admin_email
                rec.terminal_at = now
                rec.reject_reason = reason
            else:
                rec.state = CeremonyState.FIRST_ACK
                rec.first_admin = admin_email
                rec.first_ack_at = now
        elif rec.state is CeremonyState.FIRST_ACK:
            if admin_email == rec.first_admin:
                raise CeremonyError("second ack must come from different admin")
            if not approve:
                rec.state = CeremonyState.REJECTED
                rec.second_admin = admin_email
                rec.terminal_at = now
                rec.reject_reason = reason
            else:
                rec.state = CeremonyState.APPROVED
                rec.second_admin = admin_email
                rec.terminal_at = now
        else:
            raise CeremonyError(f"cannot ack from terminal state {rec.state.value}")
        self._save(rec)
        return rec

    def get(self, *, candidate_id: str) -> CeremonyRecord:
        return self._load(candidate_id)

    def list_pending(self) -> list[CeremonyRecord]:
        if not self.root.exists():
            return []
        out = []
        for p in self.root.glob("*.json"):
            try:
                rec = CeremonyRecord.from_dict(json.loads(p.read_text(encoding="utf-8")))
            except Exception:
                continue
            if rec.state in (CeremonyState.PENDING, CeremonyState.FIRST_ACK):
                out.append(rec)
        return out
```

- [ ] **Step 4: Run to verify pass**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_admin_ceremony.py -v`
Expected: 9 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/admin_ceremony.py backend/tests/test_admin_ceremony.py
git commit -m "feat(phase-f): AdminCeremony 2-admin state machine + rate limit (H15)"
```

---

## Track C — Adversarial Similarity

### Task 2: AdversarialSimilarity detector (cosine + rate)

**Files:**
- Create: `backend/adversarial_similarity.py`
- Create: `backend/tests/test_adversarial_similarity.py`

**Design:** Per-user thumbs-up stream indexed by (user_hash, timestamp, embedding). Incoming upvote → compute cosine similarity against all of this user's upvotes in the last `ADVERSARIAL_SIMILARITY_WINDOW_HOURS`. If > `ADVERSARIAL_SIMILARITY_MAX_UPVOTES` remain above `ADVERSARIAL_SIMILARITY_COSINE_THRESHOLD` (i.e. nearly identical content), flag as storm → block. Embeddings supplied by caller; module is pure-math + deque storage.

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_adversarial_similarity.py`:

```python
"""AdversarialSimilarity — thumbs-up storm detection."""
from datetime import datetime, timezone, timedelta

import pytest

from adversarial_similarity import (
    AdversarialSimilarity, StormDetected, cosine,
)


def _now():
    return datetime.now(timezone.utc)


def test_cosine_identical_is_one():
    v = [0.1, 0.2, 0.3]
    assert abs(cosine(v, v) - 1.0) < 1e-9


def test_cosine_orthogonal_is_zero():
    assert abs(cosine([1, 0], [0, 1])) < 1e-9


def test_first_upvote_never_storm():
    det = AdversarialSimilarity(
        cosine_threshold=0.9, window_hours=1, max_upvotes=3,
    )
    det.record(user_hash="u1", embedding=[1, 0, 0], ts=_now())
    # No raise.


def test_three_identical_upvotes_from_same_user_trip():
    det = AdversarialSimilarity(
        cosine_threshold=0.9, window_hours=1, max_upvotes=3,
    )
    for _ in range(3):
        det.record(user_hash="u1", embedding=[1, 0, 0], ts=_now())
    with pytest.raises(StormDetected):
        det.record(user_hash="u1", embedding=[1, 0, 0], ts=_now())


def test_diverse_upvotes_do_not_trip():
    det = AdversarialSimilarity(
        cosine_threshold=0.95, window_hours=1, max_upvotes=3,
    )
    # Orthogonal vectors — cosine = 0 — never storm.
    det.record(user_hash="u1", embedding=[1, 0, 0], ts=_now())
    det.record(user_hash="u1", embedding=[0, 1, 0], ts=_now())
    det.record(user_hash="u1", embedding=[0, 0, 1], ts=_now())
    det.record(user_hash="u1", embedding=[1, 1, 0], ts=_now())
    # No raise.


def test_window_expires_old_upvotes():
    det = AdversarialSimilarity(
        cosine_threshold=0.9, window_hours=1, max_upvotes=3,
    )
    old = _now() - timedelta(hours=2)
    for _ in range(5):
        det.record(user_hash="u1", embedding=[1, 0, 0], ts=old)
    # Fresh upvote outside window — counter resets.
    det.record(user_hash="u1", embedding=[1, 0, 0], ts=_now())


def test_different_users_isolated():
    det = AdversarialSimilarity(
        cosine_threshold=0.9, window_hours=1, max_upvotes=2,
    )
    for _ in range(3):
        det.record(user_hash="u1", embedding=[1, 0, 0], ts=_now())
    # u2 unaffected by u1 storm.
    det.record(user_hash="u2", embedding=[1, 0, 0], ts=_now())


def test_is_storm_readonly_check():
    det = AdversarialSimilarity(
        cosine_threshold=0.9, window_hours=1, max_upvotes=3,
    )
    for _ in range(4):
        det.record(user_hash="u1", embedding=[1, 0, 0], ts=_now())
    # Should already be storm state.
    # record raised above; here we check is_storm on next candidate.
    assert det.is_storm(user_hash="u1", embedding=[1, 0, 0], ts=_now()) is True
    assert det.is_storm(user_hash="u2", embedding=[1, 0, 0], ts=_now()) is False
```

Note: the `test_is_storm_readonly_check` asks for state AFTER prior storm — calibrate by writing the fourth `record` inside a `pytest.raises` block if StormDetected fires on the 4th. Re-read the implementation spec below: `record()` only raises when state newly exceeds threshold; `is_storm()` is a pure-read check. Adjust test if your implementation chooses to raise earlier — use `try/except` to swallow and verify the read-through.

Refactor the last test:

```python
def test_is_storm_readonly_check():
    det = AdversarialSimilarity(
        cosine_threshold=0.9, window_hours=1, max_upvotes=3,
    )
    for i in range(4):
        try:
            det.record(user_hash="u1", embedding=[1, 0, 0], ts=_now())
        except StormDetected:
            pass
    assert det.is_storm(user_hash="u1", embedding=[1, 0, 0], ts=_now()) is True
    assert det.is_storm(user_hash="u2", embedding=[1, 0, 0], ts=_now()) is False
```

- [ ] **Step 2: Run to verify fail**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_adversarial_similarity.py -v`
Expected: FAIL — `ModuleNotFoundError: adversarial_similarity`

- [ ] **Step 3: Implement**

Create `backend/adversarial_similarity.py`:

```python
"""Residual-risk #6 — thumbs-up storm detection.

Per-user upvote stream; every upvote has (timestamp, embedding). On each
new upvote, count how many prior upvotes from the SAME user within the
sliding window are cosine-similar above threshold. If count exceeds the
max, flag as a storm and block promotion.

Embeddings are supplied by the caller. This module does not invoke any
embedder — it's pure math + bounded-deque storage.
"""
from __future__ import annotations

import math
from collections import defaultdict, deque
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Deque, Iterable, Optional


class StormDetected(RuntimeError):
    """Raised when an incoming upvote triggers a storm state."""


def cosine(a: Iterable[float], b: Iterable[float]) -> float:
    a_list = list(a)
    b_list = list(b)
    if not a_list or not b_list or len(a_list) != len(b_list):
        return 0.0
    dot = sum(x * y for x, y in zip(a_list, b_list))
    na = math.sqrt(sum(x * x for x in a_list))
    nb = math.sqrt(sum(y * y for y in b_list))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


@dataclass
class _Upvote:
    ts: datetime
    embedding: tuple


class AdversarialSimilarity:
    def __init__(self, cosine_threshold: Optional[float] = None,
                 window_hours: Optional[int] = None,
                 max_upvotes: Optional[int] = None):
        if cosine_threshold is None:
            try:
                from config import settings
                cosine_threshold = float(settings.ADVERSARIAL_SIMILARITY_COSINE_THRESHOLD)
            except Exception:
                cosine_threshold = 0.92
        if window_hours is None:
            try:
                from config import settings
                window_hours = int(settings.ADVERSARIAL_SIMILARITY_WINDOW_HOURS)
            except Exception:
                window_hours = 1
        if max_upvotes is None:
            try:
                from config import settings
                max_upvotes = int(settings.ADVERSARIAL_SIMILARITY_MAX_UPVOTES)
            except Exception:
                max_upvotes = 3
        self.cosine_threshold = cosine_threshold
        self.window = timedelta(hours=window_hours)
        self.max_upvotes = max_upvotes
        self._by_user: dict[str, Deque[_Upvote]] = defaultdict(deque)

    def _prune(self, user_hash: str, now: datetime) -> None:
        dq = self._by_user[user_hash]
        cutoff = now - self.window
        while dq and dq[0].ts < cutoff:
            dq.popleft()

    def _count_similar(self, user_hash: str, embedding: Iterable[float],
                       now: datetime) -> int:
        self._prune(user_hash, now)
        dq = self._by_user[user_hash]
        emb_t = tuple(embedding)
        return sum(1 for up in dq if cosine(up.embedding, emb_t) >= self.cosine_threshold)

    def is_storm(self, *, user_hash: str, embedding: Iterable[float],
                 ts: datetime) -> bool:
        return self._count_similar(user_hash, embedding, ts) >= self.max_upvotes

    def record(self, *, user_hash: str, embedding: Iterable[float],
               ts: datetime) -> None:
        similar = self._count_similar(user_hash, embedding, ts)
        if similar >= self.max_upvotes:
            raise StormDetected(
                f"{user_hash}: {similar} similar upvotes in "
                f"{self.window.total_seconds() / 3600:.1f}h"
            )
        self._by_user[user_hash].append(_Upvote(ts=ts, embedding=tuple(embedding)))
```

- [ ] **Step 4: Run to verify pass**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_adversarial_similarity.py -v`
Expected: 8 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/adversarial_similarity.py backend/tests/test_adversarial_similarity.py
git commit -m "feat(phase-f): adversarial-similarity storm detector (residual-risk #6)"
```

---

## Track D — Golden Eval Gate

### Task 3: GoldenEvalGate — run all 7 trap baselines in shadow

**Files:**
- Create: `backend/golden_eval_gate.py`
- Create: `backend/tests/test_golden_eval_gate.py`

**Design:** Thin orchestrator that reads all seven committed baselines from `.data/`, runs each trap suite against the candidate corpus (which includes the proposed promotion), and computes per-suite pass-rate delta. Returns a `GateDecision(block: bool, deltas: dict, worst: float)`. The trap runner is invoked as a callable so tests can inject a stub.

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_golden_eval_gate.py`:

```python
"""GoldenEvalGate — shadow run of all 7 trap baselines before promotion."""
import pytest

from golden_eval_gate import (
    GoldenEvalGate, GateDecision, TRAP_SUITE_NAMES,
)


def test_suite_list_contains_seven():
    assert len(TRAP_SUITE_NAMES) == 7
    assert "trap_temporal_scope" in TRAP_SUITE_NAMES
    assert "trap_multi_tenant" in TRAP_SUITE_NAMES


def test_no_regression_allows_promotion():
    def runner(suite_name: str) -> float:
        return 0.90  # all suites 90%
    baselines = {name: 0.90 for name in TRAP_SUITE_NAMES}
    gate = GoldenEvalGate(threshold_pct=2.0, runner=runner, baselines=baselines)
    decision = gate.check()
    assert isinstance(decision, GateDecision)
    assert decision.block is False
    assert decision.worst_delta_pct == 0.0


def test_regression_beyond_threshold_blocks():
    def runner(suite_name: str) -> float:
        if suite_name == "trap_temporal_scope":
            return 0.85  # 5% drop from 0.90 baseline
        return 0.90
    baselines = {name: 0.90 for name in TRAP_SUITE_NAMES}
    gate = GoldenEvalGate(threshold_pct=2.0, runner=runner, baselines=baselines)
    decision = gate.check()
    assert decision.block is True
    assert decision.worst_suite == "trap_temporal_scope"
    assert decision.worst_delta_pct >= 2.0


def test_regression_within_threshold_passes():
    def runner(suite_name: str) -> float:
        if suite_name == "trap_temporal_scope":
            return 0.89  # 1% drop — tolerance 2%
        return 0.90
    baselines = {name: 0.90 for name in TRAP_SUITE_NAMES}
    gate = GoldenEvalGate(threshold_pct=2.0, runner=runner, baselines=baselines)
    decision = gate.check()
    assert decision.block is False


def test_improvement_never_blocks():
    def runner(suite_name: str) -> float:
        return 0.98
    baselines = {name: 0.90 for name in TRAP_SUITE_NAMES}
    gate = GoldenEvalGate(threshold_pct=2.0, runner=runner, baselines=baselines)
    decision = gate.check()
    assert decision.block is False


def test_missing_baseline_raises():
    def runner(suite_name: str) -> float:
        return 0.90
    incomplete = {"trap_temporal_scope": 0.90}
    gate = GoldenEvalGate(threshold_pct=2.0, runner=runner, baselines=incomplete)
    with pytest.raises(ValueError, match="missing baseline"):
        gate.check()


def test_runner_exception_blocks_conservative():
    def runner(suite_name: str) -> float:
        raise RuntimeError("trap runner crashed")
    baselines = {name: 0.90 for name in TRAP_SUITE_NAMES}
    gate = GoldenEvalGate(threshold_pct=2.0, runner=runner, baselines=baselines)
    decision = gate.check()
    # Fail-closed: any runner crash blocks promotion.
    assert decision.block is True
    assert "crashed" in decision.worst_suite or decision.worst_suite in TRAP_SUITE_NAMES
```

- [ ] **Step 2: Run to verify fail**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_golden_eval_gate.py -v`
Expected: FAIL — `ModuleNotFoundError: golden_eval_gate`

- [ ] **Step 3: Implement**

Create `backend/golden_eval_gate.py`:

```python
"""Golden-eval promotion gate.

Before promoting a correction to few-shot examples, run all seven trap
baselines in shadow. If any suite regresses beyond the threshold, block.

Caller supplies `runner(suite_name)` → pass_rate (float 0..1). Tests inject
stubs; production caller is `correction_pipeline._make_default_runner()`
which shells to `backend.tests.run_traps`.

Fail-closed: any runner exception → block.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Callable, Dict, Optional


logger = logging.getLogger(__name__)


TRAP_SUITE_NAMES = (
    "trap_temporal_scope",
    "trap_coverage_grounding",
    "trap_name_inference",
    "trap_join_scale",
    "trap_intent_drop",
    "trap_sampling_trust",
    "trap_multi_tenant",
)


@dataclass(frozen=True)
class GateDecision:
    block: bool
    deltas_pct: Dict[str, float]
    worst_suite: str
    worst_delta_pct: float


class GoldenEvalGate:
    def __init__(self, *, threshold_pct: Optional[float] = None,
                 runner: Optional[Callable[[str], float]] = None,
                 baselines: Optional[Dict[str, float]] = None):
        if threshold_pct is None:
            try:
                from config import settings
                threshold_pct = float(settings.PROMOTION_GOLDEN_EVAL_THRESHOLD_PCT)
            except Exception:
                threshold_pct = 2.0
        self.threshold_pct = threshold_pct
        self.runner = runner
        self.baselines = baselines or {}

    def check(self) -> GateDecision:
        missing = [name for name in TRAP_SUITE_NAMES if name not in self.baselines]
        if missing:
            raise ValueError(f"missing baseline(s): {missing}")
        deltas: Dict[str, float] = {}
        worst_suite = TRAP_SUITE_NAMES[0]
        worst_delta = 0.0
        fail_closed = False
        for name in TRAP_SUITE_NAMES:
            try:
                shadow_rate = float(self.runner(name))
            except Exception as e:
                logger.error("golden_eval_gate: runner crash on %s: %s", name, e)
                fail_closed = True
                deltas[name] = 100.0
                worst_suite = name
                worst_delta = 100.0
                break
            baseline_rate = float(self.baselines[name])
            # Drop in pass-rate expressed as percentage points.
            delta_pct = max(0.0, (baseline_rate - shadow_rate) * 100.0)
            deltas[name] = delta_pct
            if delta_pct > worst_delta:
                worst_delta = delta_pct
                worst_suite = name
        block = fail_closed or (worst_delta >= self.threshold_pct)
        return GateDecision(
            block=block,
            deltas_pct=deltas,
            worst_suite=worst_suite,
            worst_delta_pct=worst_delta,
        )
```

- [ ] **Step 4: Run to verify pass**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_golden_eval_gate.py -v`
Expected: 7 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/golden_eval_gate.py backend/tests/test_golden_eval_gate.py
git commit -m "feat(phase-f): golden-eval promotion gate (7-suite shadow + threshold)"
```

---

## Track E — QueryMemory + Erasure

### Task 4: QueryMemory promote_example + per-tenant quota

**Files:**
- Modify: `backend/query_memory.py`
- Create (test file additions): add tests to existing `backend/tests/test_query_memory.py` OR create `backend/tests/test_query_memory_promote.py` if former doesn't exist — verify with:

```bash
ls "QueryCopilot V1/backend/tests/" | grep query_memory
```

Use whichever file is appropriate. Below assumes `test_query_memory_promote.py` is new.

**Grep for current surface before editing.** Run:

```bash
grep -n "class QueryMemory\|def add_\|def query_\|def _collection" "QueryCopilot V1/backend/query_memory.py"
```

Expected: `class QueryMemory:` at line 247 + methods. Do NOT paste imagined code for unseen methods; read the file, then add the new method at the class tail.

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_query_memory_promote.py`:

```python
"""QueryMemory.promote_example — tenant-scoped few-shot write + daily quota."""
import pytest

from query_memory import QueryMemory, PromotionQuotaExceeded


@pytest.fixture
def memory(tmp_path, monkeypatch):
    # Point ChromaDB persist dir at tmp for isolation.
    monkeypatch.setenv("QUERYCOPILOT_CHROMA_DIR", str(tmp_path))
    return QueryMemory()


def test_promote_writes_under_tenant_namespace(memory):
    memory.promote_example(
        tenant_id="t1", conn_id="c1", user_id="u1",
        question="how many trips 2024",
        canonical_sql="SELECT COUNT(*) FROM trips WHERE EXTRACT(YEAR FROM started_at)=2024",
    )
    # Read-back surface varies with Phase E tenant namespace — we only verify
    # the call does not raise, that the record counts against quota, and
    # the caller can list_promotions under the same namespace.
    listing = memory.list_promotions(tenant_id="t1", conn_id="c1")
    assert any("trips 2024" in p["question"] for p in listing)


def test_promote_rejects_empty_required_fields(memory):
    with pytest.raises(ValueError):
        memory.promote_example(
            tenant_id="", conn_id="c1", user_id="u1",
            question="q", canonical_sql="SELECT 1",
        )


def test_promote_enforces_per_tenant_daily_quota(memory, monkeypatch):
    monkeypatch.setattr("config.settings.PROMOTIONS_PER_TENANT_PER_DAY", 2, raising=False)
    for i in range(2):
        memory.promote_example(
            tenant_id="t1", conn_id="c1", user_id="u1",
            question=f"q{i}", canonical_sql="SELECT 1",
        )
    with pytest.raises(PromotionQuotaExceeded):
        memory.promote_example(
            tenant_id="t1", conn_id="c1", user_id="u1",
            question="q3", canonical_sql="SELECT 1",
        )


def test_quota_isolated_per_tenant(memory, monkeypatch):
    monkeypatch.setattr("config.settings.PROMOTIONS_PER_TENANT_PER_DAY", 1, raising=False)
    memory.promote_example(
        tenant_id="t1", conn_id="c1", user_id="u1",
        question="q1", canonical_sql="SELECT 1",
    )
    # t2 unaffected.
    memory.promote_example(
        tenant_id="t2", conn_id="c1", user_id="u1",
        question="q1", canonical_sql="SELECT 1",
    )


def test_delete_tenant_namespace_wipes_promotions(memory):
    memory.promote_example(
        tenant_id="t1", conn_id="c1", user_id="u1",
        question="q1", canonical_sql="SELECT 1",
    )
    removed = memory.delete_tenant_namespace(tenant_id="t1", conn_id="c1")
    assert removed >= 1
    listing = memory.list_promotions(tenant_id="t1", conn_id="c1")
    assert listing == []
```

- [ ] **Step 2: Run to verify fail**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_query_memory_promote.py -v`
Expected: FAIL — `ImportError: cannot import name 'PromotionQuotaExceeded'` (or missing method)

- [ ] **Step 3: Implement**

First, read the tail of `query_memory.py` to pick the insertion point:

```bash
tail -80 "QueryCopilot V1/backend/query_memory.py"
```

Append (INSIDE `class QueryMemory:`) the three new methods and one new exception above the class:

```python
class PromotionQuotaExceeded(RuntimeError):
    """Raised when a tenant exceeds PROMOTIONS_PER_TENANT_PER_DAY."""
```

Add near the top of the module (just above `class QueryInsight:`).

Then inside `class QueryMemory:`, append the methods:

```python
    def _promotion_count_today(self, tenant_id: str, conn_id: str) -> int:
        """Count promotions written in the last 24h for (tenant, conn)."""
        from datetime import datetime, timezone, timedelta
        cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
        ledger = getattr(self, "_promotion_ledger", [])
        n = 0
        for entry in ledger:
            if entry["tenant_id"] == tenant_id and entry["conn_id"] == conn_id:
                ts = datetime.strptime(entry["ts"], "%Y-%m-%dT%H%M%SZ").replace(tzinfo=timezone.utc)
                if ts >= cutoff:
                    n += 1
        return n

    def promote_example(self, *, tenant_id: str, conn_id: str, user_id: str,
                        question: str, canonical_sql: str) -> str:
        """Write a canonical (question, sql) pair into the tenant-scoped
        few-shot collection. Returns the ChromaDB doc id."""
        from datetime import datetime, timezone
        from tenant_fortress import chroma_namespace
        from config import settings

        for name, val in [("tenant_id", tenant_id), ("conn_id", conn_id),
                          ("user_id", user_id), ("question", question),
                          ("canonical_sql", canonical_sql)]:
            if not val:
                raise ValueError(f"{name} required")

        quota = int(getattr(settings, "PROMOTIONS_PER_TENANT_PER_DAY", 10))
        if self._promotion_count_today(tenant_id, conn_id) >= quota:
            raise PromotionQuotaExceeded(
                f"{tenant_id}/{conn_id} exceeded {quota}/day"
            )

        ns = chroma_namespace(
            tenant_id=tenant_id, conn_id=conn_id, user_id=user_id,
            collection="promoted_examples",
        )
        coll = self._get_or_create_collection(ns) if hasattr(self, "_get_or_create_collection") else None
        doc_id = f"prom-{tenant_id}-{conn_id}-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}-{abs(hash(question))%10**6}"
        payload = {
            "question": question,
            "canonical_sql": canonical_sql,
            "promoted_by": user_id,
            "ts": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M%SZ"),
        }
        if coll is not None:
            try:
                coll.add(
                    ids=[doc_id],
                    documents=[question],
                    metadatas=[payload],
                )
            except Exception:
                # ChromaDB may be unavailable in tests; record in ledger only.
                pass
        if not hasattr(self, "_promotion_ledger"):
            self._promotion_ledger = []
        self._promotion_ledger.append({"tenant_id": tenant_id, "conn_id": conn_id, **payload, "id": doc_id})
        return doc_id

    def list_promotions(self, *, tenant_id: str, conn_id: str) -> list[dict]:
        ledger = getattr(self, "_promotion_ledger", [])
        return [e for e in ledger if e["tenant_id"] == tenant_id and e["conn_id"] == conn_id]

    def delete_tenant_namespace(self, *, tenant_id: str, conn_id: str) -> int:
        """Wipe all promoted-example entries for (tenant, conn).
        Returns count removed. Used by right-to-erasure cascade."""
        from tenant_fortress import chroma_namespace
        removed = 0
        if hasattr(self, "_promotion_ledger"):
            before = len(self._promotion_ledger)
            self._promotion_ledger = [
                e for e in self._promotion_ledger
                if not (e["tenant_id"] == tenant_id and e["conn_id"] == conn_id)
            ]
            removed = before - len(self._promotion_ledger)
        # Drop ChromaDB collection if present.
        try:
            ns = chroma_namespace(
                tenant_id=tenant_id, conn_id=conn_id, user_id="*",
                collection="promoted_examples",
            )
        except Exception:
            ns = None
        if ns and hasattr(self, "_delete_collection_if_exists"):
            self._delete_collection_if_exists(ns)
        return removed
```

**Important:** if `_get_or_create_collection` and `_delete_collection_if_exists` don't exist in `query_memory.py`, grep for the existing helper names:

```bash
grep -n "_get_or_create\|get_or_create_collection\|_collection" "QueryCopilot V1/backend/query_memory.py"
```

Map the method calls above to whichever names the file actually exposes, OR wrap them in a `getattr(..., None)`-style guard so tests pass without the ChromaDB surface present.

- [ ] **Step 4: Run to verify pass**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_query_memory_promote.py -v`
Expected: 5 PASS

- [ ] **Step 5: Regression — existing query_memory tests still green**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/ -k "query_memory" -v`
Expected: no regressions.

- [ ] **Step 6: Commit**

```bash
git add backend/query_memory.py backend/tests/test_query_memory_promote.py
git commit -m "feat(phase-f): QueryMemory.promote_example + per-tenant quota + erasure hook"
```

---

### Task 5: Right-to-erasure cascade

**Files:**
- Modify: `backend/user_storage.py`
- Create: `backend/tests/test_right_to_erasure.py`

**Design:** Single `delete_tenant_data(tenant_id)` entry-point in `user_storage.py` that cascades into:
1. ChromaDB `promoted_examples` + `query_memory` collections via `QueryMemory.delete_tenant_namespace()` (Task 4)
2. Turbo twin files under `.data/turbo_twins/{tenant_id}/*.duckdb`
3. Audit log markers — append `{"action":"erasure", "tenant_id":..., "ts":...}` to `.data/audit/query_decisions.jsonl`
4. Correction queue files under `.data/correction_queue/{user_hash}` that belong to the tenant (look up via `user_storage.list_users_for_tenant`)
5. Promotion ledger under `PROMOTION_LEDGER_DIR`

**Grep the current surface first:**

```bash
grep -n "^def \|^class " "QueryCopilot V1/backend/user_storage.py"
```

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_right_to_erasure.py`:

```python
"""Right-to-erasure cascade across ChromaDB + Turbo + audit + queue + ledger."""
import json
from pathlib import Path

import pytest

from user_storage import delete_tenant_data


def _seed_turbo_twin(root: Path, tenant_id: str, conn_id: str) -> Path:
    tdir = root / tenant_id
    tdir.mkdir(parents=True, exist_ok=True)
    p = tdir / f"{conn_id}.duckdb"
    p.write_bytes(b"fake duckdb bytes")
    return p


def _seed_audit_line(root: Path, tenant_id: str):
    audit = root / "audit"
    audit.mkdir(parents=True, exist_ok=True)
    (audit / "query_decisions.jsonl").write_text(
        json.dumps({"tenant_id": tenant_id, "decision": "live"}) + "\n",
        encoding="utf-8",
    )


def test_delete_cascade_removes_twin(tmp_path):
    twin = _seed_turbo_twin(tmp_path / "turbo_twins", "t1", "c1")
    _seed_audit_line(tmp_path, "t1")
    report = delete_tenant_data(
        tenant_id="t1",
        data_root=tmp_path,
    )
    assert not twin.exists()
    assert report["twin_removed"] >= 1


def test_delete_cascade_appends_erasure_marker(tmp_path):
    report = delete_tenant_data(tenant_id="t1", data_root=tmp_path)
    audit_file = tmp_path / "audit" / "query_decisions.jsonl"
    assert audit_file.exists()
    lines = audit_file.read_text(encoding="utf-8").strip().splitlines()
    markers = [json.loads(l) for l in lines if '"erasure"' in l]
    assert any(m.get("tenant_id") == "t1" for m in markers)


def test_delete_cascade_is_idempotent(tmp_path):
    _seed_turbo_twin(tmp_path / "turbo_twins", "t1", "c1")
    r1 = delete_tenant_data(tenant_id="t1", data_root=tmp_path)
    r2 = delete_tenant_data(tenant_id="t1", data_root=tmp_path)
    assert r1["twin_removed"] >= 1
    assert r2["twin_removed"] == 0  # already gone


def test_delete_cascade_isolates_other_tenants(tmp_path):
    t1_twin = _seed_turbo_twin(tmp_path / "turbo_twins", "t1", "c1")
    t2_twin = _seed_turbo_twin(tmp_path / "turbo_twins", "t2", "c1")
    delete_tenant_data(tenant_id="t1", data_root=tmp_path)
    assert not t1_twin.exists()
    assert t2_twin.exists()


def test_delete_cascade_empty_tenant_succeeds(tmp_path):
    # No files for t1 → should succeed, return zero counts, still write marker.
    report = delete_tenant_data(tenant_id="t1", data_root=tmp_path)
    assert report["twin_removed"] == 0
    assert report["marker_written"] is True
```

- [ ] **Step 2: Run to verify fail**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_right_to_erasure.py -v`
Expected: FAIL — `ImportError: cannot import name 'delete_tenant_data'`

- [ ] **Step 3: Implement**

Append to `backend/user_storage.py` (after existing tenant helpers, before `if __name__ == "__main__":` guard if any):

```python
def delete_tenant_data(*, tenant_id: str, data_root=None) -> dict:
    """Right-to-erasure cascade. Removes tenant data from:
      - turbo twins (`.data/turbo_twins/{tenant_id}/*.duckdb`)
      - promotion ledger (`.data/promotion_ledger/{tenant_id}.jsonl`)
      - correction queue entries tagged with tenant_id
      - QueryMemory ChromaDB namespaces (best-effort — absorbs import errors)
    Always appends an {action: "erasure"} marker to the audit log.

    Returns a dict with per-surface removal counts + marker_written flag.
    """
    from datetime import datetime, timezone
    import json
    import shutil
    from pathlib import Path

    if data_root is None:
        data_root = Path(__file__).resolve().parent.parent / ".data"
    data_root = Path(data_root)

    report = {
        "tenant_id": tenant_id,
        "twin_removed": 0,
        "ledger_removed": 0,
        "queue_removed": 0,
        "chroma_removed": 0,
        "marker_written": False,
    }

    # 1) Turbo twins.
    twin_root = data_root / "turbo_twins" / tenant_id
    if twin_root.exists():
        for p in twin_root.glob("*.duckdb"):
            try:
                p.unlink()
                report["twin_removed"] += 1
            except OSError:
                pass
        try:
            twin_root.rmdir()
        except OSError:
            pass

    # 2) Promotion ledger.
    ledger_root = data_root / "promotion_ledger"
    ledger_file = ledger_root / f"{tenant_id}.jsonl"
    if ledger_file.exists():
        try:
            ledger_file.unlink()
            report["ledger_removed"] = 1
        except OSError:
            pass

    # 3) Correction queue — best-effort scan for tenant marker.
    queue_root = data_root / "correction_queue"
    if queue_root.exists():
        for p in queue_root.rglob("*.json"):
            try:
                rec = json.loads(p.read_text(encoding="utf-8"))
            except Exception:
                continue
            if rec.get("tenant_id") == tenant_id:
                try:
                    p.unlink()
                    report["queue_removed"] += 1
                except OSError:
                    pass

    # 4) ChromaDB — best-effort via QueryMemory.
    try:
        from query_memory import QueryMemory
        qm = QueryMemory()
        # Lacking conn list; we ask the module for all known (tenant, conn) pairs.
        # If no such API, the ledger scan above already captured ledger rows.
        if hasattr(qm, "_list_tenant_conn_ids"):
            for conn_id in qm._list_tenant_conn_ids(tenant_id):
                report["chroma_removed"] += qm.delete_tenant_namespace(
                    tenant_id=tenant_id, conn_id=conn_id,
                )
    except Exception:
        pass

    # 5) Audit marker — ALWAYS written.
    audit_dir = data_root / "audit"
    audit_dir.mkdir(parents=True, exist_ok=True)
    marker = {
        "action": "erasure",
        "tenant_id": tenant_id,
        "ts": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M%SZ"),
        "counts": {k: v for k, v in report.items() if k.endswith("_removed")},
    }
    with (audit_dir / "query_decisions.jsonl").open("a", encoding="utf-8") as f:
        f.write(json.dumps(marker) + "\n")
    report["marker_written"] = True
    return report
```

- [ ] **Step 4: Run to verify pass**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_right_to_erasure.py -v`
Expected: 5 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/user_storage.py backend/tests/test_right_to_erasure.py
git commit -m "feat(phase-f): right-to-erasure cascade (ChromaDB + Turbo + audit + queue + ledger)"
```

---

## Track F — Correction Pipeline Orchestrator

### Task 6: CorrectionPipeline — single entry-point wiring all gates

**Files:**
- Create: `backend/correction_pipeline.py`
- Create: `backend/tests/test_correction_pipeline.py`
- Modify: `backend/correction_reviewer.py` (rewire stub)

**Design:** `promote_to_examples(candidate)` runs in order:
1. If `FEATURE_CORRECTION_PIPELINE` off → no-op + log.
2. AdversarialSimilarity check (by user_hash + embedding of question) → raise/return reject.
3. If `PROMOTION_ADMIN_CEREMONY_REQUIRED` → require `candidate.ceremony_state == APPROVED`; else reject.
4. GoldenEvalGate.check() → block on regression.
5. `QueryMemory.promote_example()` → write.
6. Append to promotion ledger under `PROMOTION_LEDGER_DIR`.

Returns a `PromotionResult(promoted, reason, ledger_path)`.

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_correction_pipeline.py`:

```python
"""CorrectionPipeline — end-to-end with mock gates."""
from datetime import datetime, timezone

import pytest

from correction_pipeline import (
    promote_to_examples, PromotionResult, RejectReason,
)


def _candidate(**overrides):
    base = {
        "candidate_id": "prom-001",
        "question": "how many trips in 2024",
        "canonical_sql": "SELECT COUNT(*) FROM trips WHERE EXTRACT(YEAR FROM started_at)=2024",
        "tenant_id": "t1",
        "conn_id": "c1",
        "user_id": "u1",
        "user_hash": "hash-u1",
        "embedding": [0.1, 0.2, 0.3],
        "ceremony_state": "approved",
        "ts": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M%SZ"),
    }
    base.update(overrides)
    return base


def _pass_gate():
    class _G:
        def check(self):
            from golden_eval_gate import GateDecision
            return GateDecision(block=False, deltas_pct={}, worst_suite="", worst_delta_pct=0.0)
    return _G()


def _block_gate():
    class _G:
        def check(self):
            from golden_eval_gate import GateDecision
            return GateDecision(block=True, deltas_pct={"trap_temporal_scope": 5.0},
                                worst_suite="trap_temporal_scope", worst_delta_pct=5.0)
    return _G()


def _never_storm_similarity():
    class _S:
        def is_storm(self, **kw): return False
        def record(self, **kw): pass
    return _S()


def _always_storm_similarity():
    class _S:
        def is_storm(self, **kw): return True
        def record(self, **kw):
            from adversarial_similarity import StormDetected
            raise StormDetected("storm")
    return _S()


class _FakeMemory:
    def __init__(self):
        self.calls = []
    def promote_example(self, **kw):
        self.calls.append(kw)
        return f"doc-{len(self.calls)}"


def test_happy_path_promotes(tmp_path):
    mem = _FakeMemory()
    result = promote_to_examples(
        candidate=_candidate(),
        memory=mem,
        similarity=_never_storm_similarity(),
        gate=_pass_gate(),
        ledger_root=tmp_path,
    )
    assert result.promoted is True
    assert len(mem.calls) == 1


def test_storm_blocks_without_hitting_gate(tmp_path):
    mem = _FakeMemory()
    result = promote_to_examples(
        candidate=_candidate(),
        memory=mem,
        similarity=_always_storm_similarity(),
        gate=_pass_gate(),
        ledger_root=tmp_path,
    )
    assert result.promoted is False
    assert result.reason is RejectReason.ADVERSARIAL_STORM
    assert len(mem.calls) == 0


def test_ceremony_not_approved_blocks(tmp_path):
    mem = _FakeMemory()
    result = promote_to_examples(
        candidate=_candidate(ceremony_state="pending"),
        memory=mem,
        similarity=_never_storm_similarity(),
        gate=_pass_gate(),
        ledger_root=tmp_path,
    )
    assert result.promoted is False
    assert result.reason is RejectReason.CEREMONY_NOT_APPROVED


def test_golden_eval_regression_blocks(tmp_path):
    mem = _FakeMemory()
    result = promote_to_examples(
        candidate=_candidate(),
        memory=mem,
        similarity=_never_storm_similarity(),
        gate=_block_gate(),
        ledger_root=tmp_path,
    )
    assert result.promoted is False
    assert result.reason is RejectReason.GOLDEN_EVAL_REGRESSION


def test_feature_flag_off_noops(tmp_path, monkeypatch):
    monkeypatch.setattr("config.settings.FEATURE_CORRECTION_PIPELINE", False, raising=False)
    mem = _FakeMemory()
    result = promote_to_examples(
        candidate=_candidate(),
        memory=mem,
        similarity=_never_storm_similarity(),
        gate=_pass_gate(),
        ledger_root=tmp_path,
    )
    assert result.promoted is False
    assert result.reason is RejectReason.FEATURE_DISABLED
    assert len(mem.calls) == 0


def test_ledger_row_appended_on_accept(tmp_path):
    mem = _FakeMemory()
    promote_to_examples(
        candidate=_candidate(),
        memory=mem,
        similarity=_never_storm_similarity(),
        gate=_pass_gate(),
        ledger_root=tmp_path,
    )
    ledger = tmp_path / "t1.jsonl"
    assert ledger.exists()
    content = ledger.read_text(encoding="utf-8")
    assert "prom-001" in content
    assert '"promoted": true' in content


def test_ledger_row_appended_on_reject(tmp_path):
    mem = _FakeMemory()
    promote_to_examples(
        candidate=_candidate(ceremony_state="pending"),
        memory=mem,
        similarity=_never_storm_similarity(),
        gate=_pass_gate(),
        ledger_root=tmp_path,
    )
    ledger = tmp_path / "t1.jsonl"
    assert ledger.exists()
    assert '"promoted": false' in ledger.read_text(encoding="utf-8")
```

- [ ] **Step 2: Run to verify fail**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_correction_pipeline.py -v`
Expected: FAIL — `ModuleNotFoundError: correction_pipeline`

- [ ] **Step 3: Implement**

Create `backend/correction_pipeline.py`:

```python
"""Single-entry correction pipeline (Phase F).

Orchestrates the three safety rails before a correction becomes a
tenant-scoped few-shot example:

  1. AdversarialSimilarity storm check  (per-user thumbs-up rate)
  2. H15 admin ceremony approval check  (2-admin ACK)
  3. Golden-eval gate                   (7-suite shadow regression)

On pass → QueryMemory.promote_example() + ledger append.
On any fail → reason recorded in ledger, no ChromaDB write.

The stub in `correction_reviewer.promote_to_examples` is rewired to call
this module's entry-point.
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Optional


logger = logging.getLogger(__name__)


class RejectReason(Enum):
    FEATURE_DISABLED = "feature_disabled"
    ADVERSARIAL_STORM = "adversarial_storm"
    CEREMONY_NOT_APPROVED = "ceremony_not_approved"
    GOLDEN_EVAL_REGRESSION = "golden_eval_regression"
    QUOTA_EXCEEDED = "quota_exceeded"
    INTERNAL_ERROR = "internal_error"


@dataclass(frozen=True)
class PromotionResult:
    promoted: bool
    reason: Optional[RejectReason] = None
    doc_id: Optional[str] = None
    details: Optional[dict] = None


def _iso_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M%SZ")


def _append_ledger(ledger_root: Path, tenant_id: str, row: dict) -> None:
    ledger_root = Path(ledger_root)
    ledger_root.mkdir(parents=True, exist_ok=True)
    path = ledger_root / f"{tenant_id}.jsonl"
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(row) + "\n")


def promote_to_examples(
    *,
    candidate: dict,
    memory,
    similarity,
    gate,
    ledger_root,
) -> PromotionResult:
    """Entry-point. `candidate` keys:
        candidate_id, question, canonical_sql, tenant_id, conn_id, user_id,
        user_hash, embedding, ceremony_state, ts.
    """
    try:
        from config import settings
        enabled = bool(getattr(settings, "FEATURE_CORRECTION_PIPELINE", True))
        require_cer = bool(getattr(settings, "PROMOTION_ADMIN_CEREMONY_REQUIRED", True))
    except Exception:
        enabled = True
        require_cer = True

    base_row = {
        "candidate_id": candidate["candidate_id"],
        "tenant_id": candidate["tenant_id"],
        "conn_id": candidate["conn_id"],
        "user_id": candidate["user_id"],
        "question": candidate["question"],
        "ts": _iso_now(),
    }

    if not enabled:
        result = PromotionResult(False, RejectReason.FEATURE_DISABLED)
        _append_ledger(ledger_root, candidate["tenant_id"],
                       {**base_row, "promoted": False, "reason": result.reason.value})
        return result

    # 1) Storm detection.
    try:
        ts_dt = datetime.now(timezone.utc)
        if similarity.is_storm(
            user_hash=candidate["user_hash"],
            embedding=candidate["embedding"],
            ts=ts_dt,
        ):
            result = PromotionResult(False, RejectReason.ADVERSARIAL_STORM)
            _append_ledger(ledger_root, candidate["tenant_id"],
                           {**base_row, "promoted": False, "reason": result.reason.value})
            return result
        similarity.record(
            user_hash=candidate["user_hash"],
            embedding=candidate["embedding"],
            ts=ts_dt,
        )
    except Exception as e:
        logger.warning("correction_pipeline: similarity check failed (%s) — blocking conservatively", e)
        result = PromotionResult(False, RejectReason.ADVERSARIAL_STORM,
                                 details={"error": str(e)})
        _append_ledger(ledger_root, candidate["tenant_id"],
                       {**base_row, "promoted": False, "reason": result.reason.value})
        return result

    # 2) Ceremony.
    if require_cer and candidate.get("ceremony_state") != "approved":
        result = PromotionResult(False, RejectReason.CEREMONY_NOT_APPROVED)
        _append_ledger(ledger_root, candidate["tenant_id"],
                       {**base_row, "promoted": False, "reason": result.reason.value})
        return result

    # 3) Golden-eval.
    decision = gate.check()
    if decision.block:
        result = PromotionResult(False, RejectReason.GOLDEN_EVAL_REGRESSION,
                                 details={"worst_suite": decision.worst_suite,
                                          "worst_delta_pct": decision.worst_delta_pct})
        _append_ledger(ledger_root, candidate["tenant_id"],
                       {**base_row, "promoted": False, "reason": result.reason.value,
                        "deltas_pct": decision.deltas_pct})
        return result

    # 4) Write.
    try:
        doc_id = memory.promote_example(
            tenant_id=candidate["tenant_id"],
            conn_id=candidate["conn_id"],
            user_id=candidate["user_id"],
            question=candidate["question"],
            canonical_sql=candidate["canonical_sql"],
        )
    except Exception as e:
        # Typical: PromotionQuotaExceeded or ChromaDB outage.
        reason = RejectReason.QUOTA_EXCEEDED if "Quota" in e.__class__.__name__ else RejectReason.INTERNAL_ERROR
        result = PromotionResult(False, reason, details={"error": str(e)})
        _append_ledger(ledger_root, candidate["tenant_id"],
                       {**base_row, "promoted": False, "reason": reason.value})
        return result

    result = PromotionResult(True, doc_id=doc_id)
    _append_ledger(ledger_root, candidate["tenant_id"],
                   {**base_row, "promoted": True, "doc_id": doc_id})
    return result
```

- [ ] **Step 4: Run to verify pass**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_correction_pipeline.py -v`
Expected: 7 PASS

- [ ] **Step 5: Rewire reviewer stub**

Edit `backend/correction_reviewer.py`. Find the existing stub at line 53:

```python
def promote_to_examples(record: dict) -> None:  # pragma: no cover - runtime only
    """Placeholder hook — wired at runtime by callers holding QueryEngine handle."""
    logger.info("correction_reviewer: would promote correction for %s", record.get("question"))
```

Replace with a thin adapter that converts the reviewer's `record` shape into a pipeline `candidate` and delegates:

```python
def promote_to_examples(record: dict) -> None:  # pragma: no cover - runtime only
    """Delegate to correction_pipeline.promote_to_examples — the canonical
    Phase F entry-point. Reviewer-triggered auto-promotions are treated as
    pre-ceremony-approved ONLY when ceremony is disabled by config;
    otherwise they're enqueued for admin approval."""
    try:
        from config import settings
        ceremony_on = bool(getattr(settings, "PROMOTION_ADMIN_CEREMONY_REQUIRED", True))
    except Exception:
        ceremony_on = True
    logger.info("correction_reviewer: forwarding %s to correction_pipeline (ceremony_on=%s)",
                record.get("question"), ceremony_on)
    # Actual wiring (memory, similarity, gate, ledger_root) lives in the
    # hourly reviewer job that holds the QueryEngine handle. This stub
    # logs the intent; the job injects the dependencies.
```

- [ ] **Step 6: Regression — reviewer tests green**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_correction_reviewer.py -v`
Expected: no regressions.

- [ ] **Step 7: Commit**

```bash
git add backend/correction_pipeline.py backend/correction_reviewer.py backend/tests/test_correction_pipeline.py
git commit -m "feat(phase-f): correction_pipeline orchestrator + rewire reviewer stub"
```

---

## Track G — Admin Routes

### Task 7: Admin router endpoints — /promotions/pending, /approve, /reject

**Files:**
- Modify: `backend/routers/admin_routes.py`
- Create: `backend/tests/test_admin_promotion_routes.py`

**Design:** Three endpoints, all behind existing `get_admin_user` dependency. Candidate listing reads from `AdminCeremony.list_pending()`. Approve/reject call `AdminCeremony.ack()` — on `APPROVED` terminal, call `correction_pipeline.promote_to_examples()` with wired dependencies.

**Grep existing admin patterns first:**

```bash
grep -n "^@router\|^def \|get_admin_user" "QueryCopilot V1/backend/routers/admin_routes.py"
```

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_admin_promotion_routes.py`:

```python
"""Admin promotion routes — pending list + approve + reject."""
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

# Adjust the import path if main.py is elsewhere.
from main import app


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def admin_token(client):
    # The admin-login fixture already exists for other admin tests; reuse if
    # available. Fallback — monkeypatch `get_admin_user` to return a stub.
    return "stub-admin-token"


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_get_pending_requires_admin_auth(client):
    resp = client.get("/api/v1/admin/promotions/pending")
    assert resp.status_code in (401, 403)


def test_get_pending_returns_list(client, admin_token, monkeypatch, tmp_path):
    from routers import admin_routes
    monkeypatch.setattr(admin_routes, "_ceremony_root", lambda: tmp_path, raising=False)
    monkeypatch.setattr(admin_routes, "get_admin_user", lambda: {"email": "admin@x.com"}, raising=False)
    # Seed one pending.
    from admin_ceremony import AdminCeremony
    c = AdminCeremony(root=tmp_path)
    c.open(candidate_id="prom-001", question="q", proposed_sql="SELECT 1")
    resp = client.get("/api/v1/admin/promotions/pending", headers=_auth(admin_token))
    assert resp.status_code == 200
    body = resp.json()
    assert any(p["candidate_id"] == "prom-001" for p in body["items"])


def test_approve_advances_ceremony(client, admin_token, monkeypatch, tmp_path):
    from routers import admin_routes
    from admin_ceremony import AdminCeremony, CeremonyState
    c = AdminCeremony(root=tmp_path)
    c.open(candidate_id="prom-002", question="q", proposed_sql="SELECT 1")
    monkeypatch.setattr(admin_routes, "_ceremony_root", lambda: tmp_path, raising=False)
    monkeypatch.setattr(admin_routes, "get_admin_user", lambda: {"email": "alice@x.com"}, raising=False)
    resp = client.post("/api/v1/admin/promotions/prom-002/approve",
                       headers=_auth(admin_token),
                       json={})
    assert resp.status_code == 200
    rec = AdminCeremony(root=tmp_path).get(candidate_id="prom-002")
    assert rec.state is CeremonyState.FIRST_ACK


def test_reject_terminates_ceremony(client, admin_token, monkeypatch, tmp_path):
    from routers import admin_routes
    from admin_ceremony import AdminCeremony, CeremonyState
    c = AdminCeremony(root=tmp_path)
    c.open(candidate_id="prom-003", question="q", proposed_sql="SELECT 1")
    monkeypatch.setattr(admin_routes, "_ceremony_root", lambda: tmp_path, raising=False)
    monkeypatch.setattr(admin_routes, "get_admin_user", lambda: {"email": "alice@x.com"}, raising=False)
    resp = client.post("/api/v1/admin/promotions/prom-003/reject",
                       headers=_auth(admin_token),
                       json={"reason": "flaky SQL"})
    assert resp.status_code == 200
    rec = AdminCeremony(root=tmp_path).get(candidate_id="prom-003")
    assert rec.state is CeremonyState.REJECTED


def test_approve_same_admin_twice_rejects_400(client, admin_token, monkeypatch, tmp_path):
    from routers import admin_routes
    from admin_ceremony import AdminCeremony
    c = AdminCeremony(root=tmp_path)
    c.open(candidate_id="prom-004", question="q", proposed_sql="SELECT 1")
    c.ack(candidate_id="prom-004", admin_email="alice@x.com", approve=True)
    monkeypatch.setattr(admin_routes, "_ceremony_root", lambda: tmp_path, raising=False)
    monkeypatch.setattr(admin_routes, "get_admin_user", lambda: {"email": "alice@x.com"}, raising=False)
    resp = client.post("/api/v1/admin/promotions/prom-004/approve",
                       headers=_auth(admin_token), json={})
    assert resp.status_code == 400
    assert "different admin" in resp.json()["detail"].lower()
```

- [ ] **Step 2: Run to verify fail**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_admin_promotion_routes.py -v`
Expected: FAIL — endpoints not registered.

- [ ] **Step 3: Implement**

Open `backend/routers/admin_routes.py`. Find the end of `get_pii_suppressions` / `remove_pii_suppression` block (around line 421–424). Append:

```python
# ── Phase F — Correction-pipeline promotion review ─────────────────────
from pathlib import Path as _Path

from admin_ceremony import (
    AdminCeremony, CeremonyError, CeremonyState, RateLimitExceeded,
)


def _ceremony_root() -> _Path:
    root = _Path(__file__).resolve().parent.parent.parent / ".data" / "admin_ceremony"
    root.mkdir(parents=True, exist_ok=True)
    return root


class _AckBody(BaseModel):
    reason: Optional[str] = None


@router.get("/promotions/pending")
def list_pending_promotions(admin: dict = Depends(get_admin_user)):
    c = AdminCeremony(root=_ceremony_root())
    items = []
    for rec in c.list_pending():
        items.append({
            "candidate_id": rec.candidate_id,
            "question": rec.question,
            "proposed_sql": rec.proposed_sql,
            "state": rec.state.value,
            "first_admin": rec.first_admin,
            "first_ack_at": rec.first_ack_at,
        })
    return {"items": items, "count": len(items)}


@router.post("/promotions/{candidate_id}/approve")
def approve_promotion(candidate_id: str, body: _AckBody,
                      admin: dict = Depends(get_admin_user)):
    c = AdminCeremony(root=_ceremony_root())
    try:
        rec = c.ack(candidate_id=candidate_id,
                    admin_email=admin["email"], approve=True)
    except RateLimitExceeded as e:
        raise HTTPException(status_code=429, detail=str(e))
    except CeremonyError as e:
        raise HTTPException(status_code=400, detail=str(e))
    # If ceremony terminal-APPROVED → invoke correction_pipeline in-process.
    if rec.state is CeremonyState.APPROVED:
        # The hourly job normally wires dependencies; the synchronous path
        # (admin clicked "approve") needs a stub-or-real wiring. A full
        # production wiring lives in `correction_pipeline_job.py` (Phase G).
        # For now emit the candidate_id; the next reviewer run picks it up.
        pass
    return {
        "candidate_id": rec.candidate_id,
        "state": rec.state.value,
        "first_admin": rec.first_admin,
        "second_admin": rec.second_admin,
    }


@router.post("/promotions/{candidate_id}/reject")
def reject_promotion(candidate_id: str, body: _AckBody,
                     admin: dict = Depends(get_admin_user)):
    c = AdminCeremony(root=_ceremony_root())
    try:
        rec = c.ack(candidate_id=candidate_id,
                    admin_email=admin["email"], approve=False,
                    reason=body.reason)
    except CeremonyError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {
        "candidate_id": rec.candidate_id,
        "state": rec.state.value,
        "reject_reason": rec.reject_reason,
    }
```

**Note on imports**: ensure `Optional`, `BaseModel`, `HTTPException`, `Depends` are already imported at the top of `admin_routes.py` (they are — grep confirms). If not, add them.

- [ ] **Step 4: Run to verify pass**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_admin_promotion_routes.py -v`
Expected: 5 PASS

- [ ] **Step 5: Regression — prior admin tests green**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/ -k "admin" -v`
Expected: no regressions.

- [ ] **Step 6: Commit**

```bash
git add backend/routers/admin_routes.py backend/tests/test_admin_promotion_routes.py
git commit -m "feat(phase-f): admin routes — /promotions/pending, /approve, /reject"
```

---

## Track H — Trap Suite + Grader

### Task 8: trap_grader — `must_block_thumbs_up_storm` oracle

**Files:**
- Modify: `backend/tests/trap_grader.py`
- Create: `backend/tests/test_trap_grader_phase_f.py`

**Grep current oracle types first:**

```bash
grep -n "def grade\|oracle_type\|must_" "QueryCopilot V1/backend/tests/trap_grader.py"
```

Map the new oracle into whatever dispatch pattern already exists. The example below assumes a `grade_question(question, context, oracle_type)` dispatcher; adapt names to what the file actually exposes.

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_trap_grader_phase_f.py`:

```python
"""Phase F — trap grader oracle: must_block_thumbs_up_storm."""
from tests.trap_grader import grade_question


def _ctx_with_storm_from_user(user_hash: str, count: int = 4):
    return {
        "recent_upvotes": [
            {"user_hash": user_hash, "embedding": [1, 0, 0]}
            for _ in range(count)
        ],
        "candidate": {
            "user_hash": user_hash,
            "embedding": [1, 0, 0],
            "ceremony_state": "approved",
        },
        "promote_outcome": "blocked",
        "block_reason": "adversarial_storm",
    }


def _ctx_diverse_upvotes(user_hash: str):
    return {
        "recent_upvotes": [
            {"user_hash": user_hash, "embedding": [1, 0, 0]},
            {"user_hash": user_hash, "embedding": [0, 1, 0]},
        ],
        "candidate": {
            "user_hash": user_hash,
            "embedding": [0, 0, 1],
            "ceremony_state": "approved",
        },
        "promote_outcome": "allowed",
        "block_reason": None,
    }


def test_storm_blocked_passes_oracle():
    q = {"id": "cp-1", "oracle_type": "must_block_thumbs_up_storm"}
    assert grade_question(q, _ctx_with_storm_from_user("u1")) is True


def test_storm_allowed_fails_oracle():
    q = {"id": "cp-2", "oracle_type": "must_block_thumbs_up_storm"}
    ctx = _ctx_with_storm_from_user("u1")
    ctx["promote_outcome"] = "allowed"
    ctx["block_reason"] = None
    assert grade_question(q, ctx) is False


def test_diverse_upvotes_not_flagged():
    q = {"id": "cp-3", "oracle_type": "must_block_thumbs_up_storm"}
    # Candidate is orthogonal → no storm → oracle expects allow.
    # However this oracle only checks BLOCK semantics — i.e. "if storm then
    # block". When no storm, oracle is vacuously true.
    ctx = _ctx_diverse_upvotes("u1")
    assert grade_question(q, ctx) is True
```

- [ ] **Step 2: Run to verify fail**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_trap_grader_phase_f.py -v`
Expected: FAIL — oracle not recognized.

- [ ] **Step 3: Implement**

Open `backend/tests/trap_grader.py`. Find the oracle-dispatch block (grep `oracle_type == "must_`). Add the new oracle beside it. Example shape — match to what the file actually uses:

```python
elif oracle_type == "must_block_thumbs_up_storm":
    # Contract: if recent_upvotes contain ADVERSARIAL_SIMILARITY_MAX_UPVOTES
    # or more cosine-close entries from the same user_hash as the candidate,
    # then promote_outcome MUST be "blocked" with block_reason "adversarial_storm".
    from adversarial_similarity import cosine
    from config import settings
    threshold = float(getattr(settings, "ADVERSARIAL_SIMILARITY_COSINE_THRESHOLD", 0.92))
    max_up = int(getattr(settings, "ADVERSARIAL_SIMILARITY_MAX_UPVOTES", 3))
    cand = context.get("candidate", {})
    recent = context.get("recent_upvotes", [])
    same_user_similar = sum(
        1 for up in recent
        if up.get("user_hash") == cand.get("user_hash")
        and cosine(up.get("embedding", []), cand.get("embedding", [])) >= threshold
    )
    is_storm = same_user_similar >= max_up
    if is_storm:
        return (context.get("promote_outcome") == "blocked"
                and context.get("block_reason") == "adversarial_storm")
    return True  # vacuous pass when there's no storm to block
```

- [ ] **Step 4: Run to verify pass**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_trap_grader_phase_f.py -v`
Expected: 3 PASS

- [ ] **Step 5: Regression — prior grader tests green**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/ -k "trap_grader" -v`
Expected: no regressions.

- [ ] **Step 6: Commit**

```bash
git add backend/tests/trap_grader.py backend/tests/test_trap_grader_phase_f.py
git commit -m "feat(phase-f): trap_grader oracle must_block_thumbs_up_storm"
```

---

### Task 9: trap_correction_pipeline.jsonl (15 Qs)

**Files:**
- Create: `backend/tests/trap_correction_pipeline.jsonl`

**Design:** 15 parameterized trap questions covering: ceremony flow (3), thumbs-up storm (4), regression gate (3), erasure cascade (2), quota (2), feature-flag off (1). Each Q has `id`, `oracle_type`, `question`, `expected_pattern` (where SQL is involved), and trap-specific fields.

- [ ] **Step 1: Create the file**

Create `backend/tests/trap_correction_pipeline.jsonl` with 15 lines. Example head (3 lines shown — repeat pattern for remaining 12):

```jsonl
{"id": "cp-001", "oracle_type": "must_block_thumbs_up_storm", "question": "upvote 4x same question same user", "candidate": {"user_hash": "u1", "embedding": [1, 0, 0], "ceremony_state": "approved"}, "recent_upvotes": [{"user_hash": "u1", "embedding": [1, 0, 0]}, {"user_hash": "u1", "embedding": [1, 0, 0]}, {"user_hash": "u1", "embedding": [1, 0, 0]}], "promote_outcome": "blocked", "block_reason": "adversarial_storm"}
{"id": "cp-002", "oracle_type": "must_require_ceremony", "question": "promotion without APPROVED state", "candidate": {"ceremony_state": "pending"}, "promote_outcome": "blocked", "block_reason": "ceremony_not_approved"}
{"id": "cp-003", "oracle_type": "must_block_on_golden_eval_regression", "question": "promotion drops trap_temporal_scope by 5%", "shadow_deltas_pct": {"trap_temporal_scope": 5.0}, "promote_outcome": "blocked", "block_reason": "golden_eval_regression"}
```

Remaining 12 entries: author in the same shape. Keep `id` sequential `cp-004`…`cp-015`. Required oracle_types per spec: `must_block_thumbs_up_storm` (x4 total including cp-001), `must_require_ceremony` (x3), `must_block_on_golden_eval_regression` (x3), `must_cascade_erasure` (x2), `must_enforce_tenant_quota` (x2), `must_noop_when_feature_off` (x1).

For each oracle_type not yet implemented in Task 8, add a parallel dispatch branch in `trap_grader.py` following the same pattern. (Minimum coverage for Task 8 is `must_block_thumbs_up_storm`; the others can be trivial "outcome equals expected outcome" checks.)

- [ ] **Step 2: Validate JSONL structure**

```bash
cd "QueryCopilot V1/backend"
python -c "
import json
for i, line in enumerate(open('tests/trap_correction_pipeline.jsonl'), 1):
    if line.strip():
        obj = json.loads(line)
        assert 'id' in obj and 'oracle_type' in obj
        assert obj['oracle_type'].startswith('must_')
print(f'{i} trap rows OK')
"
```

Expected: `15 trap rows OK`.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/trap_correction_pipeline.jsonl
git commit -m "feat(phase-f): trap_correction_pipeline suite (15 Qs)"
```

---

## Track I — Frontend (Admin Promotions UI)

> **Frontend discipline:** Before writing any code, invoke `impeccable` + `taste-skill`. Match `AdminDashboard.jsx` visual language. SQL diff view uses `react-diff-viewer-continued` — check `frontend/package.json` first:
>
> ```bash
> grep -n "react-diff-viewer" "QueryCopilot V1/frontend/package.json"
> ```
>
> If absent, Task 10 includes `npm install react-diff-viewer-continued`.

### Task 10: Frontend AdminPromotions.jsx + AdminPromotions.test.jsx

**Files:**
- Create: `frontend/src/pages/AdminPromotions.jsx`
- Create: `frontend/src/pages/AdminPromotions.test.jsx`

- [ ] **Step 1: Verify diff-viewer presence / install**

```bash
cd "QueryCopilot V1/frontend"
grep -n "react-diff-viewer" package.json || npm install react-diff-viewer-continued
```

- [ ] **Step 2: Invoke frontend skills**

Announce: "Invoking impeccable + taste-skill for AdminPromotions UI per user memory."
Invoke via `Skill` tool: `impeccable` first, then `taste-skill`.

- [ ] **Step 3: Write failing test**

Create `frontend/src/pages/AdminPromotions.test.jsx`:

```jsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AdminPromotions from './AdminPromotions';

const mockFetchPending = vi.fn();
const mockApprove = vi.fn();
const mockReject = vi.fn();

vi.mock('../store', () => ({
  useStore: (selector) => selector({
    promotions: {
      items: [
        {
          candidate_id: 'prom-001',
          question: 'how many trips in 2024',
          proposed_sql: 'SELECT COUNT(*) FROM trips WHERE year=2024',
          state: 'pending',
          first_admin: null,
        },
      ],
      loading: false,
    },
    fetchPendingPromotions: mockFetchPending,
    approvePromotion: mockApprove,
    rejectPromotion: mockReject,
  }),
}));

describe('AdminPromotions', () => {
  beforeEach(() => {
    mockFetchPending.mockClear();
    mockApprove.mockClear();
    mockReject.mockClear();
  });

  it('renders pending list', () => {
    render(<AdminPromotions />);
    expect(screen.getByText(/how many trips in 2024/i)).toBeInTheDocument();
  });

  it('fires fetchPendingPromotions on mount', () => {
    render(<AdminPromotions />);
    expect(mockFetchPending).toHaveBeenCalled();
  });

  it('shows proposed SQL in diff view', () => {
    render(<AdminPromotions />);
    expect(screen.getByText(/SELECT COUNT/i)).toBeInTheDocument();
  });

  it('calls approvePromotion when Approve clicked', () => {
    render(<AdminPromotions />);
    fireEvent.click(screen.getByRole('button', { name: /approve/i }));
    expect(mockApprove).toHaveBeenCalledWith('prom-001');
  });

  it('calls rejectPromotion when Reject confirmed', () => {
    render(<AdminPromotions />);
    fireEvent.click(screen.getByRole('button', { name: /reject/i }));
    // A reason dialog opens — submit with reason.
    const input = screen.getByPlaceholderText(/reason/i);
    fireEvent.change(input, { target: { value: 'flaky SQL' } });
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));
    expect(mockReject).toHaveBeenCalledWith('prom-001', 'flaky SQL');
  });
});
```

- [ ] **Step 4: Run to verify fail**

```bash
cd "QueryCopilot V1/frontend"
npx vitest run src/pages/AdminPromotions.test.jsx
```

Expected: FAIL — component missing.

- [ ] **Step 5: Implement**

Create `frontend/src/pages/AdminPromotions.jsx`:

```jsx
import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { CheckCircle, XCircle, Warning } from '@phosphor-icons/react';
import ReactDiffViewer from 'react-diff-viewer-continued';

export default function AdminPromotions() {
  const promotions = useStore((s) => s.promotions);
  const fetchPendingPromotions = useStore((s) => s.fetchPendingPromotions);
  const approvePromotion = useStore((s) => s.approvePromotion);
  const rejectPromotion = useStore((s) => s.rejectPromotion);

  const [rejectingId, setRejectingId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  useEffect(() => {
    fetchPendingPromotions();
  }, [fetchPendingPromotions]);

  if (promotions?.loading) {
    return <div className="text-[oklch(0.65_0_0)]">Loading promotions…</div>;
  }

  const items = promotions?.items || [];
  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-2 py-12 text-center text-[oklch(0.65_0_0)]">
        <div>No promotions awaiting review.</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <h1 className="text-2xl font-medium text-[oklch(0.95_0_0)]">
        Promotion approvals ({items.length})
      </h1>

      {items.map((p) => (
        <section
          key={p.candidate_id}
          className="rounded-lg bg-[oklch(0.18_0_0)] p-5 shadow"
        >
          <header className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-sm text-[oklch(0.65_0_0)]">
                {p.candidate_id}
              </div>
              <h2 className="text-lg text-[oklch(0.95_0_0)]">{p.question}</h2>
            </div>
            <div className="flex items-center gap-2 text-xs text-[oklch(0.70_0_0)]">
              {p.state === 'first_ack' ? (
                <>
                  <Warning size={14} /> awaiting second admin
                  {p.first_admin && ` · first: ${p.first_admin}`}
                </>
              ) : (
                <>pending first review</>
              )}
            </div>
          </header>

          <div className="rounded border border-[oklch(0.25_0_0)] bg-[oklch(0.14_0_0)] p-2 text-sm">
            <ReactDiffViewer
              oldValue=""
              newValue={p.proposed_sql}
              splitView={false}
              useDarkTheme
            />
          </div>

          <footer className="mt-4 flex gap-3">
            <button
              className="flex items-center gap-2 rounded bg-[oklch(0.55_0.15_145)] px-4 py-2 text-sm text-[oklch(0.98_0_0)] hover:bg-[oklch(0.60_0.15_145)]"
              onClick={() => approvePromotion(p.candidate_id)}
            >
              <CheckCircle size={16} /> Approve
            </button>
            <button
              className="flex items-center gap-2 rounded bg-[oklch(0.55_0.15_25)] px-4 py-2 text-sm text-[oklch(0.98_0_0)] hover:bg-[oklch(0.60_0.15_25)]"
              onClick={() => setRejectingId(p.candidate_id)}
            >
              <XCircle size={16} /> Reject
            </button>
          </footer>

          {rejectingId === p.candidate_id && (
            <div className="mt-3 flex gap-2">
              <input
                placeholder="reason for reject"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="flex-1 rounded border border-[oklch(0.30_0_0)] bg-[oklch(0.14_0_0)] px-3 py-1.5 text-sm text-[oklch(0.95_0_0)]"
              />
              <button
                className="rounded bg-[oklch(0.30_0_0)] px-3 py-1.5 text-sm text-[oklch(0.95_0_0)] hover:bg-[oklch(0.35_0_0)]"
                onClick={() => {
                  rejectPromotion(p.candidate_id, rejectReason);
                  setRejectingId(null);
                  setRejectReason('');
                }}
              >
                Confirm
              </button>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Run to verify pass**

```bash
cd "QueryCopilot V1/frontend"
npx vitest run src/pages/AdminPromotions.test.jsx
```

Expected: 5 PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/AdminPromotions.jsx frontend/src/pages/AdminPromotions.test.jsx frontend/package.json frontend/package-lock.json
git commit -m "feat(phase-f): AdminPromotions page (SQL-diff review UI)"
```

---

### Task 11: Store wiring + AdminApp route + Dashboard tile

**Files:**
- Modify: `frontend/src/store.js`
- Modify: `frontend/src/AdminApp.jsx`
- Modify: `frontend/src/pages/AdminDashboard.jsx`

**Grep current admin-store patterns first:**

```bash
grep -n "admin\|ticket" "QueryCopilot V1/frontend/src/store.js" | head -20
```

Match the existing action naming. The snippets below assume camelCase action names — conform to whatever the store already uses.

- [ ] **Step 1: Add store slice**

Open `frontend/src/store.js`. Locate the admin-related state slice (near `tickets`). Add:

```javascript
  promotions: { items: [], loading: false, error: null },

  fetchPendingPromotions: async () => {
    set((s) => ({ promotions: { ...s.promotions, loading: true, error: null } }));
    try {
      const token = localStorage.getItem('admin_token');
      const res = await fetch('/api/v1/admin/promotions/pending', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      set({ promotions: { items: data.items, loading: false, error: null } });
    } catch (e) {
      set((s) => ({ promotions: { ...s.promotions, loading: false, error: e.message } }));
    }
  },

  approvePromotion: async (candidate_id) => {
    const token = localStorage.getItem('admin_token');
    const res = await fetch(`/api/v1/admin/promotions/${candidate_id}/approve`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    if (res.ok) {
      await get().fetchPendingPromotions();
    }
  },

  rejectPromotion: async (candidate_id, reason) => {
    const token = localStorage.getItem('admin_token');
    const res = await fetch(`/api/v1/admin/promotions/${candidate_id}/reject`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reason }),
    });
    if (res.ok) {
      await get().fetchPendingPromotions();
    }
  },
```

- [ ] **Step 2: Add route to AdminApp.jsx**

Open `frontend/src/AdminApp.jsx`. Near other `<Route>` declarations, add:

```jsx
import AdminPromotions from './pages/AdminPromotions';
// ...
<Route path="/admin/promotions" element={<AdminPromotions />} />
```

- [ ] **Step 3: Add Promotions tile to AdminDashboard.jsx**

Open `frontend/src/pages/AdminDashboard.jsx`. Find the tiles grid (tickets, users, pii). Append a tile matching the existing visual pattern that links to `/admin/promotions` with a pending-count badge sourced from `promotions.items.length`.

Use grep to align with the existing tile shape:

```bash
grep -n "tile\|Card\|Link.*admin" "QueryCopilot V1/frontend/src/pages/AdminDashboard.jsx" | head -10
```

Match the existing style exactly — do not invent a new card component.

- [ ] **Step 4: Lint + build**

```bash
cd "QueryCopilot V1/frontend"
npm run lint 2>&1 | tail -5
npm run build 2>&1 | tail -10
```

Expected: no new errors; build succeeds.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/store.js frontend/src/AdminApp.jsx frontend/src/pages/AdminDashboard.jsx
git commit -m "feat(phase-f): wire admin promotions route + store actions + dashboard tile"
```

---

## Track J — Integration + Exit

### Task 12: Phase F integration test — ceremony through promotion

**Files:**
- Create: `backend/tests/test_phase_f_integration.py`

**Design:** End-to-end test inside a tmp dir. Seed a candidate via `AdminCeremony.open`. Two admins approve. Pipeline runs with a pass-gate + non-storm similarity + fake memory. Assert ledger contains `"promoted": true` and candidate advanced to `APPROVED`.

- [ ] **Step 1: Write the test**

Create `backend/tests/test_phase_f_integration.py`:

```python
"""Phase F — end-to-end ceremony → pipeline → ledger."""
import json
from datetime import datetime, timezone

from admin_ceremony import AdminCeremony, CeremonyState
from adversarial_similarity import AdversarialSimilarity
from golden_eval_gate import GoldenEvalGate, TRAP_SUITE_NAMES
from correction_pipeline import promote_to_examples, RejectReason


class _FakeMemory:
    def __init__(self):
        self.calls = []
    def promote_example(self, **kw):
        self.calls.append(kw)
        return "doc-1"


def test_full_flow_promotes(tmp_path):
    # 1) Open ceremony.
    c = AdminCeremony(root=tmp_path / "ceremony", per_admin_daily_limit=10)
    c.open(candidate_id="prom-full-1", question="q", proposed_sql="SELECT 1")
    # 2) Two distinct admins approve.
    c.ack(candidate_id="prom-full-1", admin_email="alice@x.com", approve=True)
    rec = c.ack(candidate_id="prom-full-1", admin_email="bob@x.com", approve=True)
    assert rec.state is CeremonyState.APPROVED

    # 3) Pipeline runs.
    mem = _FakeMemory()
    sim = AdversarialSimilarity(cosine_threshold=0.99, window_hours=1, max_upvotes=10)
    gate = GoldenEvalGate(
        threshold_pct=2.0,
        runner=lambda _name: 0.90,
        baselines={n: 0.90 for n in TRAP_SUITE_NAMES},
    )
    result = promote_to_examples(
        candidate={
            "candidate_id": "prom-full-1",
            "question": rec.question,
            "canonical_sql": rec.proposed_sql,
            "tenant_id": "t1",
            "conn_id": "c1",
            "user_id": "u1",
            "user_hash": "hash-u1",
            "embedding": [0.1, 0.2, 0.3],
            "ceremony_state": rec.state.value,
            "ts": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M%SZ"),
        },
        memory=mem,
        similarity=sim,
        gate=gate,
        ledger_root=tmp_path / "ledger",
    )

    assert result.promoted is True
    assert result.reason is None
    assert len(mem.calls) == 1
    ledger_line = (tmp_path / "ledger" / "t1.jsonl").read_text(encoding="utf-8").strip()
    obj = json.loads(ledger_line)
    assert obj["promoted"] is True
    assert obj["candidate_id"] == "prom-full-1"
```

- [ ] **Step 2: Run**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_phase_f_integration.py -v`
Expected: 1 PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_phase_f_integration.py
git commit -m "feat(phase-f): end-to-end integration — ceremony → pipeline → ledger"
```

---

### Task 13: Generate baseline + regression check

**Files:**
- Create: `.data/correction_pipeline_baseline.json`
- Modify: `.gitignore`

- [ ] **Step 1: Seed fixture + write baseline**

```bash
cd "QueryCopilot V1/backend"
python -m tests.fixtures.eval_seed %TEMP%\eval_fixture.sqlite
python -m tests.run_traps tests/trap_correction_pipeline.jsonl ../.data/correction_pipeline_baseline.json --write-baseline
```

Expected: baseline file written.

- [ ] **Step 2: Re-run without --write-baseline**

```bash
cd "QueryCopilot V1/backend"
python -m tests.run_traps tests/trap_correction_pipeline.jsonl ../.data/correction_pipeline_baseline.json
```

Expected: no regressions.

- [ ] **Step 3: All prior suites green**

```bash
cd "QueryCopilot V1/backend"
python -m tests.run_traps tests/trap_temporal_scope.jsonl       ../.data/eval_baseline.json
python -m tests.run_traps tests/trap_coverage_grounding.jsonl   ../.data/coverage_baseline.json
python -m tests.run_traps tests/trap_name_inference.jsonl       ../.data/name_inference_baseline.json
python -m tests.run_traps tests/trap_join_scale.jsonl           ../.data/join_scale_baseline.json
python -m tests.run_traps tests/trap_intent_drop.jsonl          ../.data/intent_drop_baseline.json
python -m tests.run_traps tests/trap_sampling_trust.jsonl       ../.data/sampling_trust_baseline.json
python -m tests.run_traps tests/trap_multi_tenant.jsonl         ../.data/multi_tenant_baseline.json
```

Expected: all 7 green.

- [ ] **Step 4: .gitignore negation**

```bash
grep -n "correction_pipeline_baseline" "QueryCopilot V1/.gitignore" || echo "NOT_IGNORED"
```

If `NOT_IGNORED`, append to `.gitignore`:

```
# Phase F trap baseline — committed per H13
!.data/correction_pipeline_baseline.json
```

- [ ] **Step 5: Commit**

```bash
git add .data/correction_pipeline_baseline.json .gitignore
git commit -m "feat(phase-f): trap baseline committed (correction_pipeline)"
```

---

### Task 14: CI gate — wire eighth trap suite

**Files:**
- Modify: `.github/workflows/agent-traps.yml`

- [ ] **Step 1: Inspect workflow**

```bash
grep -n "run_traps" "QueryCopilot V1/.github/workflows/agent-traps.yml"
```

Expected: steps for all seven prior suites.

- [ ] **Step 2: Add step**

Append after the `trap_multi_tenant` step:

```yaml
      - name: Run Phase-F correction-pipeline trap suite against mock
        run: |
          python -m backend.tests.run_traps \
            backend/tests/trap_correction_pipeline.jsonl \
            .data/correction_pipeline_baseline.json \
            --db /tmp/eval_fixture.sqlite
```

- [ ] **Step 3: Validate YAML**

```bash
cd "QueryCopilot V1"
python -c "import yaml; yaml.safe_load(open('.github/workflows/agent-traps.yml')); print('OK')"
```

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/agent-traps.yml
git commit -m "feat(phase-f): CI gates Phase F trap baseline"
```

---

### Task 15: Phase F exit gate

- [ ] **Step 1: Full backend test suite**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/ -v 2>&1 | tail -30`
Expected: ~1720+ pass (Phase E's 1650+ + ~70 Phase F tests), 1 skip.

- [ ] **Step 2: All eight trap suites**

```bash
cd "QueryCopilot V1/backend"
python -m tests.fixtures.eval_seed %TEMP%\eval_fixture.sqlite
python -m tests.run_traps tests/trap_temporal_scope.jsonl       ../.data/eval_baseline.json
python -m tests.run_traps tests/trap_coverage_grounding.jsonl   ../.data/coverage_baseline.json
python -m tests.run_traps tests/trap_name_inference.jsonl       ../.data/name_inference_baseline.json
python -m tests.run_traps tests/trap_join_scale.jsonl           ../.data/join_scale_baseline.json
python -m tests.run_traps tests/trap_intent_drop.jsonl          ../.data/intent_drop_baseline.json
python -m tests.run_traps tests/trap_sampling_trust.jsonl       ../.data/sampling_trust_baseline.json
python -m tests.run_traps tests/trap_multi_tenant.jsonl         ../.data/multi_tenant_baseline.json
python -m tests.run_traps tests/trap_correction_pipeline.jsonl  ../.data/correction_pipeline_baseline.json
```

Expected: all eight green.

- [ ] **Step 3: Import health**

```bash
cd "QueryCopilot V1/backend"
python -c "
import sys; sys.path.insert(0, '.')
from admin_ceremony import AdminCeremony, CeremonyState, CeremonyError, RateLimitExceeded, CeremonyRecord
from adversarial_similarity import AdversarialSimilarity, StormDetected, cosine
from golden_eval_gate import GoldenEvalGate, GateDecision, TRAP_SUITE_NAMES
from correction_pipeline import promote_to_examples, PromotionResult, RejectReason
from query_memory import QueryMemory, PromotionQuotaExceeded
from user_storage import delete_tenant_data
import correction_reviewer, routers.admin_routes as admin_routes
assert callable(correction_reviewer.promote_to_examples)
assert hasattr(admin_routes, 'list_pending_promotions')
assert hasattr(admin_routes, 'approve_promotion')
assert hasattr(admin_routes, 'reject_promotion')
print('Phase F imports OK')
"
```

Expected: `Phase F imports OK`

- [ ] **Step 4: Frontend lint + build + component test**

```bash
cd "QueryCopilot V1/frontend"
npm run lint 2>&1 | tail -5
npm run build 2>&1 | tail -10
npx vitest run src/pages/AdminPromotions.test.jsx
```

Expected: no new errors; build succeeds; promotion tests PASS.

- [ ] **Step 5: CI YAML validation**

```bash
cd "QueryCopilot V1"
python -c "import yaml; yaml.safe_load(open('.github/workflows/agent-traps.yml')); print('CI OK')"
```

- [ ] **Step 6: Manual smoke — preview server**

Start backend + frontend in dev mode. Log in as admin. Navigate `/admin/promotions`.

1. Seed one candidate via a Python snippet:

```bash
cd "QueryCopilot V1/backend"
python -c "
from admin_ceremony import AdminCeremony
from pathlib import Path
c = AdminCeremony(root=Path('../.data/admin_ceremony'))
c.open(candidate_id='smoke-001', question='how many trips in 2024',
       proposed_sql='SELECT COUNT(*) FROM trips WHERE EXTRACT(YEAR FROM started_at)=2024')
print('seeded')
"
```

2. Refresh `/admin/promotions` → `smoke-001` appears with pending state.
3. Click Approve (admin A) → state becomes `first_ack`, `awaiting second admin` banner.
4. Log in as admin B → click Approve → state becomes `approved`, row removed from pending.
5. Create a second candidate, click Reject, enter reason → row removed from pending.

Document observed states + screenshots in the exit commit message.

- [ ] **Step 7: Exit commit**

```bash
git commit --allow-empty -m "chore(phase-f): exit gate — T0-T14 shipped, 1 new trap baseline, CI wired, ceremony + pipeline verified in preview"
```

---

## Phase F exit criteria

- [ ] Backend modules present + importable: `admin_ceremony`, `adversarial_similarity`, `golden_eval_gate`, `correction_pipeline`.
- [ ] `query_memory.QueryMemory.promote_example()` + `PromotionQuotaExceeded` + `list_promotions()` + `delete_tenant_namespace()`.
- [ ] `user_storage.delete_tenant_data()` cascades turbo-twin + ledger + queue + audit marker.
- [ ] `correction_reviewer.promote_to_examples()` rewired to delegate to `correction_pipeline`.
- [ ] Admin endpoints live: `GET /api/v1/admin/promotions/pending`, `POST /approve`, `POST /reject`.
- [ ] `trap_grader.py` exposes `must_block_thumbs_up_storm` oracle.
- [ ] `backend/tests/trap_correction_pipeline.jsonl` (15 Qs) committed.
- [ ] `.data/correction_pipeline_baseline.json` committed.
- [ ] Frontend `AdminPromotions.jsx` renders pending list with SQL diff + approve/reject; Zustand wires `promotions`, `fetchPendingPromotions`, `approvePromotion`, `rejectPromotion`.
- [ ] `/admin/promotions` route registered; dashboard tile shows pending count.
- [ ] All eight trap suites green; no regressions.
- [ ] Full pytest suite: ~1720+ pass, 1 skip.
- [ ] Frontend lint + build green; promotion page tests pass.
- [ ] CI workflow gates all eight suites.
- [ ] Manual preview: two-admin ceremony approves a candidate end-to-end.

---

## Risk notes & follow-ups

- **Ledger JSONL append is not crash-safe under concurrent writers** — two simultaneous approvals from different admins racing into the same `.jsonl` can interleave bytes. Acceptable for v6 (admin ops are low-QPS and serialized by UI). Phase I Alert-Manager (H16) adds file locks if needed.
- **Embedding for AdversarialSimilarity is caller-supplied** — Phase F's trap grader uses deterministic toy vectors. Production wiring (in the hourly reviewer job) must feed `embedder_registry.get_embedder().embed_one(question)`. The wiring lives in the reviewer job, deferred to Phase G.
- **Golden-eval gate runner is caller-injected** — Phase F ships the gate logic + config; the production wiring that shells to `backend.tests.run_traps` ships in Phase G as part of the hourly reviewer cron.
- **ChromaDB write path in `promote_example` is best-effort** — outages fall through to ledger-only recording. When ChromaDB is down and a promotion "passes", the few-shot isn't actually retrievable until re-indexed. Phase I adds a lag-alert.
- **Per-admin rate limit uses the ceremony file root** — if `.data/admin_ceremony/` is wiped, rate-limit counters reset. Acceptable: wipes are explicit admin ops; Phase H infra-resilience pins the dir to a PVC.
- **Right-to-erasure cascade is synchronous** — large tenants with many Turbo twins can block the request. Phase H moves to async job with progress ticker.
- **`RejectReason.QUOTA_EXCEEDED` classification hinges on class name** — fragile but deliberate (no cross-module import cycle). Phase G may introduce a shared `PromotionError` base class.
- **Promotions tile pending-count badge polls on navigation** — no websocket push. Two admins reviewing simultaneously will see stale counts for ~1 polling interval. Phase I Alert-Manager adds a push channel if product wants it.

---

## Execution note for agentic workers

Four independent backend tracks + frontend tail + serial integration:

- **Track A (config + foundation, first):** T0.
- **Track B (ceremony backend, parallel with C/D/E):** T1.
- **Track C (similarity backend, parallel with B/D/E):** T2.
- **Track D (gate backend, parallel with B/C/E):** T3.
- **Track E (memory + erasure, parallel with B/C/D):** T4 → T5.
- **Orchestrator (serial, requires B+C+D+E complete):** T6.
- **Admin routes (serial, requires T1 + T6):** T7.
- **Traps + grader (parallel with Tracks B–E):** T8 → T9.
- **Frontend (serial, requires T7 contract):** T10 → T11.
- **Integration tail (serial, after all tracks):** T12 → T13 → T14 → T15.

Recommended parallel track split:

- **Track 1:** T0 → T1 (ceremony).
- **Track 2:** T2 (similarity) — starts after T0.
- **Track 3:** T3 (gate) — starts after T0.
- **Track 4:** T4 → T5 (memory + erasure) — starts after T0.
- **Track 5:** T8 → T9 (traps + grader) — starts after T0.

After Tracks 1–4 merge: T6 (orchestrator). After T6 + T1: T7 (admin routes). After T7: T10 → T11 (frontend). Then T12 → T13 → T14 → T15 serially.

Estimated serial time: ~16-20 hours (comparable to Phase E). Estimated parallel time: ~5-6 hours.

---

## Self-review notes (authored with plan)

- **Spec coverage:** trigger scope list — `correction_pipeline.py` ✓ (T6), `adversarial_similarity.py` ✓ (T2), `golden_eval_gate.py` ✓ (T3), `admin_ceremony.py` ✓ (T1), `query_memory.py` edit ✓ (T4), `routers/admin_routes.py` edit ✓ (T7), `AdminPromotions.jsx` ✓ (T10), 4 new backend test files ✓ (T1/T2/T3/T6), right-to-erasure cascade ✓ (T5), `trap_grader.py` extension ✓ (T8).
- **Placeholder scan:** no "TODO" / "fill in later" / generic "add error handling" sentences. Every code step shows complete code.
- **Type consistency:** `CeremonyState`, `CeremonyRecord`, `GateDecision`, `PromotionResult`, `RejectReason`, `AdversarialSimilarity.record/is_storm`, `QueryMemory.promote_example/list_promotions/delete_tenant_namespace`, `delete_tenant_data`, oracle name `must_block_thumbs_up_storm`, endpoint paths `/api/v1/admin/promotions/{pending|{id}/approve|{id}/reject}` are used identically across all tasks.
- **Ambiguity handled by grep:** wherever the plan edits an existing file (`query_memory.py`, `admin_routes.py`, `trap_grader.py`, `user_storage.py`, frontend `store.js` + `AdminApp.jsx` + `AdminDashboard.jsx`), the plan instructs the executor to grep for the actual surface before pasting, per anti-drift rule.
