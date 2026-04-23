# Grounding Stack v6 — Phase E (Rings 5+6 + H7/H8/H10/H11) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Frontend task (T15):** Before writing UI code invoke `impeccable` + `taste-skill` (user memory `feedback_frontend_skills.md`). The chip must render INLINE with the agent answer (not a modal). Match the existing `IntentEcho` visual language — `oklch` tokens, no border-left stripes, no glassmorphism decoration, `@phosphor-icons/react`.

**Goal:** Ship Ring 5 (ProvenanceChip + TierCalibration) and Ring 6 (TenantFortress) with four cross-cutting hardening bands: H7 tenant-composite keys, H8 chaos isolation (jitter + singleflight + cost breaker + resumable SSE), H10 always-on observability (result_provenance + empty-cause disambiguation + Turbo/Live sanity cross-check), H11 sampling-aware correctness (HLL + sentinel detection + adaptive stratification). Every result surface now carries accurate trust metadata rendered BEFORE first streamed token; every cache / namespace / session key now includes `tenant_id` (immutable UUID, not user_id or connection_id).

**Architecture:** Seven new backend modules (`provenance_chip.py`, `tier_promote.py`, `skew_guard.py`, `tenant_fortress.py`, `chaos_isolation.py`, `result_provenance.py`, `sampling_aware.py`), two frontend additions (`ProvenanceChip.jsx` + store wiring), plus targeted edits to `waterfall_router.py`, `summary_generator.py`, `behavior_engine.py`, `user_storage.py`, `skill_library.py`, `agent_routes.py`. Every new module is code-layer and independently feature-flagged.

**Tech Stack:** Python 3.10+, Phase B `DataCoverageCard`, Phase C `ScopeValidator` (Rule 10 `EXPRESSION_PREDICATE` now becomes a chip trust-stamp input), Phase D `IntentEcho` SSE event channel (reused for `provenance_chip` event), existing ChromaDB + DuckDB infra, hyperloglog (`datasketch` — new pin), Redis (already present, optional fallback). Frontend: React 19 + Zustand + `@phosphor-icons/react`.

**Scope — Phase E covers vs defers:**
- ✅ `ProvenanceChip` dataclass with four shapes (Live / Turbo-stale / Sample / Unverified-scope)
- ✅ Multi-table staleness resolver — worst across joined tables
- ✅ Chip renders BEFORE first token via new SSE event `provenance_chip`
- ✅ Skew guard — numeric `p99/p50 > 10` → summary forces median alongside mean
- ✅ Tier-promote gate — NL keywords `exact | last hour | today | fraud rate | incident` → force live execution
- ✅ `TenantFortress` module with `(tenant, conn, user)` composite key builders
- ✅ ChromaDB namespace update: `tenant:{t}/conn:{c}/user:{u}/coll:...`
- ✅ Right-to-erasure hook propagates tenant-scoped delete
- ✅ Per-tenant encoder dict in `skill_library.py` (replaces singleton)
- ✅ EU region pinning — EU tenants routed to EU Anthropic endpoint
- ✅ H8 — jitter + singleflight + cost breaker + resumable SSE cursor
- ✅ H10 — `result_provenance` module (empty-cause, MAX_ROWS truncation warning, Turbo↔Live sanity cross-check)
- ✅ H11 — HLL COUNT DISTINCT helper, numeric sentinel detector, adaptive stratification
- ✅ 2 new trap suites: `trap_sampling_trust` (15 Qs) + `trap_multi_tenant` (15 Qs)
- ✅ 3 new trap grader oracle types
- ✅ CI baselines + exit gate
- ⛔ **Deferred:** Correction pipeline (Phase F), golden-eval promotion gate (Phase F), skill bundles + query expansion (Phase G), full supply-chain hardening H19-H27 (Phase H), Ops alerts H16 (Phase I), docs (Phase J).

---

## Prerequisites

- [ ] Branch `askdb-global-comp` at or after Phase D exit gate.
- [ ] `python -m pytest backend/tests/ -v` green (≥1590 pass, 1 skip).
- [ ] Phase D modules import cleanly: `intent_echo`, `ambiguity_detector`, `clause_inventory`, `pinned_receipts`, `replan_controller`.
- [ ] `AgentEngine._emit_intent_echo_if_ambiguous` present.
- [ ] `backend/data_coverage.py` exposes `DataCoverageCard` (Phase B).
- [ ] `backend/scope_validator.py` exposes `ScopeValidator` + `RuleId` (Phase C).
- [ ] Fixture DB present: `python -m backend.tests.fixtures.eval_seed %TEMP%\eval_fixture.sqlite`.
- [ ] Read master plan Ring 5, Ring 6, H7, H8, H10, H11 sections.

---

## File Structure

| Path | Create/Edit | Purpose |
|---|---|---|
| `backend/provenance_chip.py` | Create | `ProvenanceChip` + `TrustStamp` enum + shape builders |
| `backend/tier_promote.py` | Create | Keyword detector + tier-promote gate logic |
| `backend/skew_guard.py` | Create | p99/p50 > 10 → median force helper |
| `backend/tenant_fortress.py` | Create | Composite key builder + tenant_id resolver |
| `backend/chaos_isolation.py` | Create | Jitter + singleflight + cost breaker + SSE cursor |
| `backend/result_provenance.py` | Create | Empty-cause + truncation warn + Turbo/Live cross-check (H10) |
| `backend/sampling_aware.py` | Create | HLL COUNT DISTINCT + sentinel detect + adaptive stratify (H11) |
| `backend/tests/test_provenance_chip.py` | Create | Chip shapes + multi-table staleness |
| `backend/tests/test_tier_promote.py` | Create | Keyword detection + gate logic |
| `backend/tests/test_skew_guard.py` | Create | Skew ratio tests |
| `backend/tests/test_tenant_fortress.py` | Create | Composite keys + namespace format |
| `backend/tests/test_chaos_isolation.py` | Create | Jitter / singleflight / cost breaker / cursor |
| `backend/tests/test_result_provenance.py` | Create | Empty-cause + truncation + cross-check |
| `backend/tests/test_sampling_aware.py` | Create | HLL + sentinel + stratify |
| `backend/tests/test_phase_e_integration.py` | Create | End-to-end: agent run emits chip before first token |
| `backend/tests/trap_sampling_trust.jsonl` | Create | 15 Qs — sampling / trust claims |
| `backend/tests/trap_multi_tenant.jsonl` | Create | 15 Qs — tenant isolation |
| `.data/sampling_trust_baseline.json` | Create (committed) | Mock baseline |
| `.data/multi_tenant_baseline.json` | Create (committed) | Mock baseline |
| `backend/tests/trap_grader.py` | Modify | 3 new Ring-5/6 oracle types |
| `backend/tests/test_trap_grader_phase_e.py` | Create | Unit tests for new oracles |
| `backend/waterfall_router.py` | Modify | Attach chip per tier; tier-promote gate hook |
| `backend/summary_generator.py` | Modify | Skew guard wire + chip-as-prefix |
| `backend/user_storage.py` | Modify | `tenant_id` field on user profile; migration on read |
| `backend/behavior_engine.py` | Modify | Composite `(tenant, conn, user)` cache keys |
| `backend/skill_library.py` | Modify | Singleton ENCODER → per-tenant dict |
| `backend/routers/agent_routes.py` | Modify | New SSE event `provenance_chip`; SSE cursor resume |
| `backend/config.py` | Modify | ~14 new flags |
| `docs/claude/config-defaults.md` | Modify | "Phase E — Provenance + Tenant" section |
| `backend/requirements.txt` | Modify | Pin `datasketch==1.6.5` |
| `frontend/src/components/agent/ProvenanceChip.jsx` | Create | Chip component (4 shapes) |
| `frontend/src/components/agent/ProvenanceChip.test.jsx` | Create | RTL tests |
| `frontend/src/store.js` | Modify | `pendingProvenanceChip`, cursor state |
| `frontend/src/pages/Chat.jsx` | Modify | Render chip before first streamed token |
| `.github/workflows/agent-traps.yml` | Modify | Gate both new trap suites |

---

## Track E — Rings 5 + 6 + H7/H8/H10/H11

### Task 0: Config flags + feature gates + requirements pin

**Files:**
- Modify: `backend/config.py`
- Modify: `backend/requirements.txt`
- Modify: `docs/claude/config-defaults.md`

- [ ] **Step 1: Add config fields**

Open `backend/config.py`. Find the "Intent Echo (Phase D — Ring 4)" block. Add immediately below it:

```python
    # ── Provenance + Tier Calibration (Phase E — Ring 5) ──
    FEATURE_PROVENANCE_CHIP: bool = Field(default=True)
    SKEW_GUARD_P99_P50_RATIO: float = Field(default=10.0)
    TIER_PROMOTE_KEYWORDS: str = Field(
        default="exact,last hour,today,fraud rate,incident,live",
        description="Comma-separated NL triggers that force live execution."
    )
    # ── Tenant Fortress (Phase E — Ring 6 / H7) ──
    FEATURE_TENANT_FORTRESS: bool = Field(default=True)
    TENANT_EU_REGIONS: str = Field(default="eu,fr,de,ie,nl,pl,es,it")
    # ── Chaos Isolation (Phase E — H8) ──
    FEATURE_CHAOS_ISOLATION: bool = Field(default=True)
    JITTER_BASE_MS: int = Field(default=50)
    JITTER_MAX_MS: int = Field(default=500)
    SINGLEFLIGHT_WAIT_TIMEOUT_S: float = Field(default=10.0)
    COST_BREAKER_MAX_USD_PER_MINUTE: float = Field(default=1.0)
    SSE_CURSOR_TTL_SECONDS: int = Field(default=300)
    # ── Result Provenance (Phase E — H10) ──
    FEATURE_RESULT_PROVENANCE: bool = Field(default=True)
    TURBO_LIVE_SANITY_SAMPLE_FRACTION: float = Field(default=0.01)  # 1%
    TURBO_LIVE_DIVERGENCE_WARN_PCT: float = Field(default=10.0)
    # ── Sampling-Aware Correctness (Phase E — H11) ──
    FEATURE_SAMPLING_AWARE: bool = Field(default=True)
    HLL_PRECISION: int = Field(default=14)                          # 2^14 = 16K registers
    VIZQL_HEX_BIN_THRESHOLD_ROWS: int = Field(default=20_000)
```

- [ ] **Step 2: Pin datasketch**

Open `backend/requirements.txt`. Find where `safetensors` is pinned (near top). Add immediately below it:

```
datasketch==1.6.5
```

- [ ] **Step 3: Update config-defaults.md**

Open `docs/claude/config-defaults.md`. Find "Intent Echo (Phase D — Ring 4)" section. Add a new section immediately below it:

```markdown
### Provenance + Tenant + Chaos (Phase E — Rings 5/6, H7/H8/H10/H11)

| Constant | Value | Notes |
|---|---|---|
| `FEATURE_PROVENANCE_CHIP` | `True` | Emit provenance_chip SSE event before first token. |
| `SKEW_GUARD_P99_P50_RATIO` | `10.0` | Ratio trigger for "add median alongside mean" in summaries. |
| `TIER_PROMOTE_KEYWORDS` | `exact,last hour,today,fraud rate,incident,live` | Force live execution on match. |
| `FEATURE_TENANT_FORTRESS` | `True` | `(tenant, conn, user)` composite keys everywhere. |
| `TENANT_EU_REGIONS` | `eu,fr,de,ie,nl,pl,es,it` | Tenants whose region_hint matches → EU Anthropic endpoint. |
| `FEATURE_CHAOS_ISOLATION` | `True` | Jitter + singleflight + cost breaker + SSE cursor. |
| `JITTER_BASE_MS` | `50` | Exponential backoff base for retry. |
| `JITTER_MAX_MS` | `500` | Retry cap. |
| `SINGLEFLIGHT_WAIT_TIMEOUT_S` | `10.0` | Secondary caller timeout when primary key held. |
| `COST_BREAKER_MAX_USD_PER_MINUTE` | `1.0` | Per-tenant spend cap; trips → 429. |
| `SSE_CURSOR_TTL_SECONDS` | `300` | Resumable SSE cursor retention. |
| `FEATURE_RESULT_PROVENANCE` | `True` | H10 always-on observability on results. |
| `TURBO_LIVE_SANITY_SAMPLE_FRACTION` | `0.01` | 1% Turbo answers re-run live for sanity. |
| `TURBO_LIVE_DIVERGENCE_WARN_PCT` | `10.0` | % divergence → warn on chip. |
| `FEATURE_SAMPLING_AWARE` | `True` | HLL + sentinel + stratify. |
| `HLL_PRECISION` | `14` | `2^14 = 16 384` registers; ~0.8% error. |
| `VIZQL_HEX_BIN_THRESHOLD_ROWS` | `20_000` | Scatter → hex-bin auto-swap above this. |
```

- [ ] **Step 4: Sanity check**

```bash
cd "QueryCopilot V1/backend"
python -c "from config import settings; print(settings.FEATURE_PROVENANCE_CHIP, settings.SKEW_GUARD_P99_P50_RATIO, settings.HLL_PRECISION)"
```

Expected: `True 10.0 14`

Install the new pin:

```bash
cd "QueryCopilot V1/backend" && pip install datasketch==1.6.5
```

- [ ] **Step 5: Commit**

```bash
git add backend/config.py backend/requirements.txt docs/claude/config-defaults.md
git commit -m "feat(phase-e): config flags + datasketch pin for Rings 5/6 + H7/H8/H10/H11"
```

---

### Task 1: ProvenanceChip dataclass + 4 shapes

**Files:**
- Create: `backend/provenance_chip.py`
- Create: `backend/tests/test_provenance_chip.py`

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_provenance_chip.py`:

```python
"""ProvenanceChip — 4 shapes + multi-table staleness."""
from datetime import datetime, timedelta, timezone

import pytest

from provenance_chip import (
    ProvenanceChip, TrustStamp, build_live_chip, build_turbo_chip,
    build_sample_chip, build_unverified_chip, worst_staleness,
)


def test_live_chip_shape():
    chip = build_live_chip(row_count=4832)
    assert chip.trust is TrustStamp.LIVE
    assert chip.row_count == 4832
    assert "live" in chip.label.lower()


def test_turbo_chip_includes_staleness():
    chip = build_turbo_chip(row_count=4830, staleness_seconds=180)
    assert chip.trust is TrustStamp.TURBO
    assert "3m stale" in chip.label.lower() or "3 min" in chip.label.lower()


def test_sample_chip_includes_stratum_and_margin():
    chip = build_sample_chip(
        row_count=4500,
        sample_pct=1.0,
        stratified_on="region",
        margin_of_error=200,
    )
    assert chip.trust is TrustStamp.SAMPLE
    assert "1%" in chip.label
    assert "region" in chip.label.lower()
    assert "200" in chip.label


def test_unverified_chip_when_expression_predicate():
    chip = build_unverified_chip(reason="expression predicate")
    assert chip.trust is TrustStamp.UNVERIFIED
    assert "unverified" in chip.label.lower()


def test_worst_staleness_picks_largest_value():
    now = datetime.now(timezone.utc)
    stale_inputs = [
        ("orders", now - timedelta(minutes=1)),
        ("users",  now - timedelta(minutes=30)),
        ("items",  now - timedelta(minutes=5)),
    ]
    worst = worst_staleness(stale_inputs, now=now)
    # 30 minutes = 1800 seconds
    assert 1700 < worst.total_seconds() < 1900


def test_worst_staleness_handles_none_values():
    now = datetime.now(timezone.utc)
    stale_inputs = [("live_tbl", None), ("orders", now - timedelta(minutes=10))]
    worst = worst_staleness(stale_inputs, now=now)
    assert worst.total_seconds() >= 600
```

- [ ] **Step 2: Run to verify fail**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_provenance_chip.py -v`
Expected: FAIL — `ModuleNotFoundError: provenance_chip`

- [ ] **Step 3: Implement**

Create `backend/provenance_chip.py`:

```python
"""Ring 5 — ProvenanceChip.

Every agent result carries one chip with accurate trust metadata rendered
BEFORE the first streamed token. Four canonical shapes:

  Live · <N> rows
  Turbo · <M>m stale · est. <N>
  Sample <P>% (stratified on {col}) · <N> ±<E>
  Unverified scope · <reason>

Multi-table joins: staleness = worst across all referenced tables.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Optional


class TrustStamp(Enum):
    LIVE = "live"
    TURBO = "turbo"
    SAMPLE = "sample"
    UNVERIFIED = "unverified"


@dataclass(frozen=True)
class ProvenanceChip:
    trust: TrustStamp
    label: str                     # human-readable single line
    row_count: Optional[int] = None
    staleness_seconds: Optional[int] = None
    sample_pct: Optional[float] = None
    stratified_on: Optional[str] = None
    margin_of_error: Optional[int] = None
    reason: Optional[str] = None
    details: dict = field(default_factory=dict)


def _fmt_duration(seconds: int) -> str:
    if seconds < 60:
        return f"{seconds}s stale"
    m = seconds // 60
    if m < 60:
        return f"{m}m stale"
    h = m // 60
    return f"{h}h stale"


def build_live_chip(row_count: int) -> ProvenanceChip:
    return ProvenanceChip(
        trust=TrustStamp.LIVE,
        label=f"Live · {row_count:,} rows",
        row_count=row_count,
    )


def build_turbo_chip(row_count: int, staleness_seconds: int) -> ProvenanceChip:
    return ProvenanceChip(
        trust=TrustStamp.TURBO,
        label=f"Turbo · {_fmt_duration(staleness_seconds)} · est. {row_count:,}",
        row_count=row_count,
        staleness_seconds=staleness_seconds,
    )


def build_sample_chip(
    row_count: int,
    sample_pct: float,
    stratified_on: Optional[str] = None,
    margin_of_error: Optional[int] = None,
) -> ProvenanceChip:
    parts = [f"Sample {sample_pct:g}%"]
    if stratified_on:
        parts.append(f"(stratified on {stratified_on})")
    parts.append(f"· {row_count:,}")
    if margin_of_error is not None:
        parts.append(f"±{margin_of_error}")
    return ProvenanceChip(
        trust=TrustStamp.SAMPLE,
        label=" ".join(parts),
        row_count=row_count,
        sample_pct=sample_pct,
        stratified_on=stratified_on,
        margin_of_error=margin_of_error,
    )


def build_unverified_chip(reason: str) -> ProvenanceChip:
    return ProvenanceChip(
        trust=TrustStamp.UNVERIFIED,
        label=f"Unverified scope · {reason}",
        reason=reason,
    )


def worst_staleness(table_snapshots, now=None) -> timedelta:
    """Return the largest staleness (now - snapshot_time) across inputs.

    `table_snapshots`: iterable of `(table_name, datetime | None)`.
    None = live (0 staleness).
    """
    if now is None:
        now = datetime.now(timezone.utc)
    max_delta = timedelta(0)
    for _name, snap in table_snapshots:
        if snap is None:
            continue
        if snap.tzinfo is None:
            snap = snap.replace(tzinfo=timezone.utc)
        delta = now - snap
        if delta > max_delta:
            max_delta = delta
    return max_delta


def chip_to_sse_payload(chip: ProvenanceChip) -> dict:
    """Serialize for the agent SSE stream (event type: provenance_chip)."""
    return {
        "trust": chip.trust.value,
        "label": chip.label,
        "row_count": chip.row_count,
        "staleness_seconds": chip.staleness_seconds,
        "sample_pct": chip.sample_pct,
        "stratified_on": chip.stratified_on,
        "margin_of_error": chip.margin_of_error,
        "reason": chip.reason,
    }
```

- [ ] **Step 4: Run to verify pass**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_provenance_chip.py -v`
Expected: 6 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/provenance_chip.py backend/tests/test_provenance_chip.py
git commit -m "feat(phase-e): ProvenanceChip with 4 trust-stamp shapes"
```

---

### Task 2: Tier-promote gate

**Files:**
- Create: `backend/tier_promote.py`
- Create: `backend/tests/test_tier_promote.py`

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_tier_promote.py`:

```python
"""Tier-promote gate — NL keywords force live execution."""
from tier_promote import should_force_live, extract_promote_trigger


def test_exact_keyword_forces_live():
    assert should_force_live("give me the exact revenue for Q4") is True


def test_today_keyword_forces_live():
    assert should_force_live("what are today's signups") is True


def test_last_hour_forces_live():
    assert should_force_live("errors in the last hour") is True


def test_fraud_rate_forces_live():
    assert should_force_live("what is the current fraud rate") is True


def test_incident_forces_live():
    assert should_force_live("active incident count") is True


def test_neutral_question_does_not_force_live():
    assert should_force_live("how many trips in 2024") is False


def test_extract_returns_matched_keyword():
    trigger = extract_promote_trigger("show me today's fraud rate incident")
    assert trigger in {"today", "fraud rate", "incident"}


def test_extract_returns_none_when_no_match():
    assert extract_promote_trigger("show trip count") is None
```

- [ ] **Step 2: Run to verify fail**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_tier_promote.py -v`
Expected: FAIL

- [ ] **Step 3: Implement**

Create `backend/tier_promote.py`:

```python
"""Ring 5 — Tier-promote gate.

NL questions containing certain keywords MUST bypass Turbo Mode and run
live regardless of waterfall preference. Current list via settings:
  exact | last hour | today | fraud rate | incident | live
"""
from __future__ import annotations


def _keywords():
    try:
        from config import settings
        raw = settings.TIER_PROMOTE_KEYWORDS or ""
    except Exception:
        raw = "exact,last hour,today,fraud rate,incident,live"
    return [kw.strip().lower() for kw in raw.split(",") if kw.strip()]


def extract_promote_trigger(nl: str):
    lc = (nl or "").lower()
    for kw in _keywords():
        if kw in lc:
            return kw
    return None


def should_force_live(nl: str) -> bool:
    return extract_promote_trigger(nl) is not None
```

- [ ] **Step 4: Run to verify pass**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_tier_promote.py -v`
Expected: 8 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/tier_promote.py backend/tests/test_tier_promote.py
git commit -m "feat(phase-e): tier-promote gate (force live on NL keywords)"
```

---

### Task 3: Skew guard

**Files:**
- Create: `backend/skew_guard.py`
- Create: `backend/tests/test_skew_guard.py`

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_skew_guard.py`:

```python
"""Skew guard — p99/p50 > 10 → force median in summary."""
from skew_guard import (
    is_skewed, needs_median, SkewProfile, build_profile_from_values,
)


def test_skewed_when_p99_is_10x_p50():
    assert is_skewed(p50=100, p99=1500) is True


def test_not_skewed_when_ratio_small():
    assert is_skewed(p50=100, p99=200) is False


def test_not_skewed_on_zero_or_negative_p50():
    assert is_skewed(p50=0, p99=1000) is False
    assert is_skewed(p50=-1, p99=1000) is False


def test_needs_median_matches_is_skewed():
    assert needs_median(SkewProfile(p50=1, p99=100, mean=50)) is True


def test_needs_median_false_on_balanced():
    assert needs_median(SkewProfile(p50=100, p99=110, mean=105)) is False


def test_build_profile_from_values():
    profile = build_profile_from_values([1, 2, 3, 4, 5, 100])
    assert profile.p99 > profile.p50
    assert profile.mean > 0
```

- [ ] **Step 2: Run to verify fail**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_skew_guard.py -v`
Expected: FAIL

- [ ] **Step 3: Implement**

Create `backend/skew_guard.py`:

```python
"""Ring 5 — Skew guard.

When a numeric column's p99/p50 ratio exceeds SKEW_GUARD_P99_P50_RATIO,
the summary template is forced to include the median alongside the mean.
No LLM judgement — pure arithmetic rule.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class SkewProfile:
    p50: float
    p99: float
    mean: float


def _ratio_threshold() -> float:
    try:
        from config import settings
        return float(settings.SKEW_GUARD_P99_P50_RATIO)
    except Exception:
        return 10.0


def is_skewed(p50: float, p99: float) -> bool:
    if p50 is None or p99 is None or p50 <= 0:
        return False
    return (p99 / p50) > _ratio_threshold()


def needs_median(profile: SkewProfile) -> bool:
    return is_skewed(profile.p50, profile.p99)


def build_profile_from_values(values) -> SkewProfile:
    import statistics
    if not values:
        return SkewProfile(p50=0.0, p99=0.0, mean=0.0)
    sorted_v = sorted(values)
    n = len(sorted_v)
    p50 = sorted_v[int(n * 0.50)]
    p99 = sorted_v[min(int(n * 0.99), n - 1)]
    mean = statistics.fmean(sorted_v)
    return SkewProfile(p50=float(p50), p99=float(p99), mean=float(mean))
```

- [ ] **Step 4: Run to verify pass**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_skew_guard.py -v`
Expected: 6 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/skew_guard.py backend/tests/test_skew_guard.py
git commit -m "feat(phase-e): skew guard (p99/p50 > 10 → force median)"
```

---

### Task 4: TenantFortress composite keys (H7)

**Files:**
- Create: `backend/tenant_fortress.py`
- Create: `backend/tests/test_tenant_fortress.py`

**Design:** Composite-key builder for all caches/namespaces. `tenant_id` is an immutable UUID assigned at user signup, NEVER derived from email or connection_id. Lookups use `(tenant_id, conn_id, user_id)` triples. One helper for each consumer: ChromaDB namespace, session cache key, turbo twin path, schema cache path.

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_tenant_fortress.py`:

```python
"""TenantFortress — composite key builders + tenant_id resolver."""
import pytest

from tenant_fortress import (
    chroma_namespace, session_key, turbo_twin_path,
    schema_cache_path, resolve_tenant_id, TenantKeyError,
)


def test_chroma_namespace_format():
    ns = chroma_namespace(tenant_id="t1", conn_id="c1", user_id="u1", collection="query_memory")
    assert ns == "tenant:t1/conn:c1/user:u1/coll:query_memory"


def test_session_key_format():
    k = session_key(tenant_id="t1", conn_id="c1", user_id="u1", session_id="s1")
    assert k == "t1:c1:u1:s1"


def test_turbo_twin_path_isolates_per_tenant(tmp_path):
    p = turbo_twin_path(root=tmp_path, tenant_id="t1", conn_id="c1")
    assert "t1" in str(p)
    assert "c1" in str(p)
    assert p.name.endswith(".duckdb")


def test_schema_cache_path_isolates_per_tenant(tmp_path):
    p = schema_cache_path(root=tmp_path, tenant_id="t1", conn_id="c1")
    assert "t1" in str(p)
    assert p.suffix == ".json"


def test_missing_tenant_id_raises():
    with pytest.raises(TenantKeyError):
        chroma_namespace(tenant_id="", conn_id="c1", user_id="u1", collection="x")


def test_resolve_tenant_id_returns_existing():
    profile = {"tenant_id": "existing-uuid-123"}
    assert resolve_tenant_id(profile) == "existing-uuid-123"


def test_resolve_tenant_id_creates_when_missing():
    profile = {}
    tid = resolve_tenant_id(profile)
    assert tid
    assert profile["tenant_id"] == tid
    # Subsequent calls return same value.
    assert resolve_tenant_id(profile) == tid


def test_tenant_id_is_uuid_like():
    import re
    tid = resolve_tenant_id({})
    # 8-4-4-4-12 format.
    assert re.fullmatch(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", tid)
```

- [ ] **Step 2: Run to verify fail**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_tenant_fortress.py -v`
Expected: FAIL — `ModuleNotFoundError: tenant_fortress`

- [ ] **Step 3: Implement**

Create `backend/tenant_fortress.py`:

```python
"""Ring 6 / H7 — TenantFortress.

Every cache / namespace / session key includes `tenant_id` (immutable UUID
assigned at signup, NEVER email-derived). This module is the single source
of truth for how those keys are composed.
"""
from __future__ import annotations

import uuid
from pathlib import Path


class TenantKeyError(ValueError):
    """Raised when a required key component is missing or empty."""


def _require(val: str, name: str) -> None:
    if not val:
        raise TenantKeyError(f"{name} required for composite-key build")


def chroma_namespace(tenant_id: str, conn_id: str, user_id: str, collection: str) -> str:
    _require(tenant_id, "tenant_id")
    _require(conn_id, "conn_id")
    _require(user_id, "user_id")
    _require(collection, "collection")
    return f"tenant:{tenant_id}/conn:{conn_id}/user:{user_id}/coll:{collection}"


def session_key(tenant_id: str, conn_id: str, user_id: str, session_id: str) -> str:
    _require(tenant_id, "tenant_id")
    _require(conn_id, "conn_id")
    _require(user_id, "user_id")
    _require(session_id, "session_id")
    return f"{tenant_id}:{conn_id}:{user_id}:{session_id}"


def turbo_twin_path(root, tenant_id: str, conn_id: str) -> Path:
    _require(tenant_id, "tenant_id")
    _require(conn_id, "conn_id")
    root = Path(root)
    return root / tenant_id / f"{conn_id}.duckdb"


def schema_cache_path(root, tenant_id: str, conn_id: str) -> Path:
    _require(tenant_id, "tenant_id")
    _require(conn_id, "conn_id")
    root = Path(root)
    return root / tenant_id / f"{conn_id}.json"


def resolve_tenant_id(user_profile: dict) -> str:
    """Return the profile's tenant_id; mint + persist a new UUID if absent.

    The profile dict is MUTATED in place — caller is responsible for
    persisting via user_storage.save_profile().
    """
    existing = user_profile.get("tenant_id")
    if existing:
        return str(existing)
    new = str(uuid.uuid4())
    user_profile["tenant_id"] = new
    return new
```

- [ ] **Step 4: Run to verify pass**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_tenant_fortress.py -v`
Expected: 8 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/tenant_fortress.py backend/tests/test_tenant_fortress.py
git commit -m "feat(phase-e): TenantFortress composite key builders (Ring 6 / H7)"
```

---

### Task 5: Chaos isolation — jitter + singleflight + cost breaker + SSE cursor (H8)

**Files:**
- Create: `backend/chaos_isolation.py`
- Create: `backend/tests/test_chaos_isolation.py`

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_chaos_isolation.py`:

```python
"""Chaos isolation — H8."""
import time

import pytest

from chaos_isolation import (
    jittered_backoff, Singleflight, CostBreaker, CostExceeded, SSECursor,
)


# ── Jitter ─────────────────────────────────────────────────────────

def test_jittered_backoff_returns_value_in_expected_range():
    for attempt in range(1, 5):
        ms = jittered_backoff(attempt=attempt, base_ms=50, max_ms=500)
        assert 0 <= ms <= 500


def test_jittered_backoff_never_exceeds_max():
    for _ in range(100):
        assert jittered_backoff(attempt=10, base_ms=50, max_ms=200) <= 200


# ── Singleflight ────────────────────────────────────────────────────

def test_singleflight_first_caller_runs_and_others_get_shared_result():
    sf = Singleflight()
    call_count = {"n": 0}
    def slow():
        call_count["n"] += 1
        time.sleep(0.05)
        return 42
    results = []
    import threading
    threads = [threading.Thread(target=lambda: results.append(sf.do("k", slow))) for _ in range(3)]
    for t in threads: t.start()
    for t in threads: t.join()
    assert results == [42, 42, 42]
    assert call_count["n"] == 1


def test_singleflight_releases_key_after_run():
    sf = Singleflight()
    sf.do("k", lambda: 1)
    assert sf.do("k", lambda: 2) == 2


# ── Cost breaker ───────────────────────────────────────────────────

def test_cost_breaker_allows_under_budget():
    cb = CostBreaker(max_usd_per_minute=1.0)
    cb.charge(tenant_id="t1", usd=0.25)
    cb.charge(tenant_id="t1", usd=0.25)
    cb.check(tenant_id="t1")  # no raise


def test_cost_breaker_trips_on_overrun():
    cb = CostBreaker(max_usd_per_minute=1.0)
    cb.charge(tenant_id="t1", usd=1.5)
    with pytest.raises(CostExceeded):
        cb.check(tenant_id="t1")


def test_cost_breaker_per_tenant_isolation():
    cb = CostBreaker(max_usd_per_minute=1.0)
    cb.charge(tenant_id="t1", usd=1.5)
    # t2 unaffected.
    cb.check(tenant_id="t2")


# ── SSE cursor ──────────────────────────────────────────────────────

def test_sse_cursor_records_position(tmp_path):
    cur = SSECursor(root=tmp_path, ttl_seconds=300)
    cur.record("sess-1", position=17)
    assert cur.get("sess-1") == 17


def test_sse_cursor_resumable_after_disconnect(tmp_path):
    cur = SSECursor(root=tmp_path, ttl_seconds=300)
    cur.record("sess-1", position=17)
    # New instance simulates server restart.
    cur2 = SSECursor(root=tmp_path, ttl_seconds=300)
    assert cur2.get("sess-1") == 17


def test_sse_cursor_returns_none_on_unknown():
    cur = SSECursor(root="/nonexistent_dir", ttl_seconds=300)
    assert cur.get("missing") is None
```

- [ ] **Step 2: Run to verify fail**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_chaos_isolation.py -v`
Expected: FAIL — `ModuleNotFoundError: chaos_isolation`

- [ ] **Step 3: Implement**

Create `backend/chaos_isolation.py`:

```python
"""H8 — Chaos isolation primitives.

- jittered_backoff(attempt, base_ms, max_ms)
- Singleflight — only one caller per key runs the function; others wait.
- CostBreaker — per-tenant USD/minute cap.
- SSECursor — resumable stream position after disconnect.
"""
from __future__ import annotations

import json
import os
import random
import tempfile
import threading
import time
from collections import defaultdict, deque
from pathlib import Path


# ── Jittered exponential backoff ────────────────────────────────────

def jittered_backoff(attempt: int, base_ms: int = 50, max_ms: int = 500) -> int:
    """Full-jitter exponential backoff.

    Returns a random integer in [0, min(max_ms, base_ms * 2**attempt)].
    """
    cap = min(max_ms, base_ms * (2 ** max(0, attempt)))
    return random.randint(0, cap)


# ── Singleflight ────────────────────────────────────────────────────

class Singleflight:
    """Deduplicate concurrent calls by key. Only the first caller executes
    the function; later callers block on the same result.
    """

    def __init__(self):
        self._lock = threading.Lock()
        self._active: dict = {}   # key → threading.Event

    def do(self, key: str, fn):
        with self._lock:
            evt = self._active.get(key)
            if evt is None:
                evt = threading.Event()
                self._active[key] = evt
                owner = True
            else:
                owner = False

        if owner:
            try:
                result = fn()
                evt._result = result    # type: ignore[attr-defined]
                evt._error = None        # type: ignore[attr-defined]
            except BaseException as exc:
                evt._result = None       # type: ignore[attr-defined]
                evt._error = exc         # type: ignore[attr-defined]
            finally:
                evt.set()
                with self._lock:
                    self._active.pop(key, None)
        else:
            evt.wait()

        err = getattr(evt, "_error", None)
        if err is not None:
            raise err
        return getattr(evt, "_result", None)


# ── Cost breaker ───────────────────────────────────────────────────

class CostExceeded(RuntimeError):
    pass


class CostBreaker:
    """Per-tenant spend cap with a rolling 60-second window."""

    def __init__(self, max_usd_per_minute: float = 1.0):
        self.max_usd_per_minute = max_usd_per_minute
        self._spend: dict = defaultdict(deque)   # tenant → deque[(ts, usd)]
        self._lock = threading.Lock()

    def charge(self, tenant_id: str, usd: float) -> None:
        with self._lock:
            self._spend[tenant_id].append((time.time(), usd))

    def _sum_recent(self, tenant_id: str) -> float:
        cutoff = time.time() - 60.0
        dq = self._spend[tenant_id]
        while dq and dq[0][0] < cutoff:
            dq.popleft()
        return sum(u for _, u in dq)

    def check(self, tenant_id: str) -> None:
        with self._lock:
            total = self._sum_recent(tenant_id)
        if total > self.max_usd_per_minute:
            raise CostExceeded(
                f"Tenant {tenant_id!r} spent ${total:.2f} in last 60s "
                f"(cap ${self.max_usd_per_minute:.2f})"
            )


# ── SSE cursor ──────────────────────────────────────────────────────

class SSECursor:
    """Disk-backed stream position cursor. Resumable after server restart."""

    def __init__(self, root, ttl_seconds: int = 300):
        self.root = Path(root)
        self.ttl_seconds = ttl_seconds

    def _path(self, session_id: str) -> Path:
        return self.root / f"{session_id}.cursor.json"

    def record(self, session_id: str, position: int) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        target = self._path(session_id)
        payload = {"position": int(position), "recorded_at": time.time()}
        fd, tmp = tempfile.mkstemp(dir=str(self.root), prefix=f".{session_id}_", suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                json.dump(payload, fh)
            os.replace(tmp, target)
        except Exception:
            try:
                os.unlink(tmp)
            except OSError:
                pass
            raise

    def get(self, session_id: str):
        path = self._path(session_id)
        if not path.exists():
            return None
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            return None
        if time.time() - payload.get("recorded_at", 0) > self.ttl_seconds:
            return None
        return int(payload.get("position", 0))
```

- [ ] **Step 4: Run to verify pass**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_chaos_isolation.py -v`
Expected: 10 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/chaos_isolation.py backend/tests/test_chaos_isolation.py
git commit -m "feat(phase-e): chaos isolation — jitter/singleflight/cost/cursor (H8)"
```

---

### Task 6: Result provenance (H10)

**Files:**
- Create: `backend/result_provenance.py`
- Create: `backend/tests/test_result_provenance.py`

**Design:** Three observability helpers applied to every result:
1. `empty_cause(result, sql, card)` — diagnose empty result: predicate-empty vs table-empty vs tombstoned.
2. `truncation_warning(row_count, max_rows)` — surface "MAX_ROWS truncated at N" when capped.
3. `turbo_live_divergence(turbo_rows, live_sample_rows)` — run 1% live sanity sample when tier=Turbo; flag >10% divergence.

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_result_provenance.py`:

```python
"""result_provenance — empty-cause + truncation + Turbo/Live cross-check (H10)."""
from datetime import datetime, timezone

from data_coverage import DataCoverageCard, DateCoverage, CategoricalCoverage
from result_provenance import (
    empty_cause, truncation_warning, turbo_live_divergence,
    EmptyCause,
)


def _card(rows=500):
    return DataCoverageCard(
        table_name="trips",
        row_count=rows,
        date_columns=[DateCoverage("started_at", "2024-01-01", "2025-10-28", 22, 670)],
        categorical_columns=[CategoricalCoverage("rider_type", 2, ["member", "casual"])],
        computed_at=datetime(2026, 5, 10, tzinfo=timezone.utc),
        dialect="sqlite",
    )


def test_empty_cause_table_empty():
    cause = empty_cause(row_count=0, sql="SELECT * FROM trips", card=_card(rows=0))
    assert cause is EmptyCause.TABLE_EMPTY


def test_empty_cause_predicate_empty():
    cause = empty_cause(row_count=0, sql="SELECT * FROM trips WHERE rider_type='unicorn'", card=_card(rows=500))
    assert cause is EmptyCause.PREDICATE_EMPTY


def test_empty_cause_not_empty_when_row_count_positive():
    cause = empty_cause(row_count=5, sql="SELECT * FROM trips", card=_card())
    assert cause is EmptyCause.NON_EMPTY


# ── Truncation ─────────────────────────────────────────────────────

def test_truncation_warning_fires_when_at_cap():
    w = truncation_warning(row_count=1000, max_rows=1000)
    assert w is not None
    assert "truncated" in w.lower()


def test_truncation_warning_none_when_under_cap():
    assert truncation_warning(row_count=500, max_rows=1000) is None


# ── Turbo ↔ Live divergence ────────────────────────────────────────

def test_turbo_live_divergence_returns_warning_on_big_delta():
    w = turbo_live_divergence(turbo_rows=1000, live_sample_rows=700, warn_pct=10.0)
    assert w is not None
    assert "divergence" in w.lower()


def test_turbo_live_divergence_none_within_threshold():
    assert turbo_live_divergence(turbo_rows=1000, live_sample_rows=950, warn_pct=10.0) is None


def test_turbo_live_divergence_handles_zero_turbo():
    assert turbo_live_divergence(turbo_rows=0, live_sample_rows=0, warn_pct=10.0) is None
```

- [ ] **Step 2: Run to verify fail**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_result_provenance.py -v`
Expected: FAIL

- [ ] **Step 3: Implement**

Create `backend/result_provenance.py`:

```python
"""H10 — Always-on result observability.

- empty_cause:      diagnose *why* a result came back empty
- truncation_warning: flag MAX_ROWS-capped truncation
- turbo_live_divergence: compare Turbo against a 1% live sanity sample
"""
from __future__ import annotations

from enum import Enum
from typing import Optional


class EmptyCause(Enum):
    NON_EMPTY = "non_empty"
    TABLE_EMPTY = "table_empty"        # card.row_count == 0
    PREDICATE_EMPTY = "predicate_empty"  # table has rows, WHERE excludes all
    UNKNOWN = "unknown"


def empty_cause(row_count: int, sql: str, card) -> EmptyCause:
    if row_count is None:
        return EmptyCause.UNKNOWN
    if row_count > 0:
        return EmptyCause.NON_EMPTY
    if card is None:
        return EmptyCause.UNKNOWN
    base_rows = getattr(card, "row_count", None)
    if base_rows == 0:
        return EmptyCause.TABLE_EMPTY
    if base_rows and base_rows > 0 and "where" in (sql or "").lower():
        return EmptyCause.PREDICATE_EMPTY
    return EmptyCause.UNKNOWN


def truncation_warning(row_count: int, max_rows: int) -> Optional[str]:
    if row_count is None or max_rows is None:
        return None
    if row_count >= max_rows:
        return f"Result truncated at MAX_ROWS={max_rows:,}; actual total may be larger."
    return None


def turbo_live_divergence(
    turbo_rows: int,
    live_sample_rows: int,
    warn_pct: float = 10.0,
) -> Optional[str]:
    if not turbo_rows or not live_sample_rows:
        return None
    pct = abs(turbo_rows - live_sample_rows) / max(turbo_rows, 1) * 100
    if pct > warn_pct:
        return (
            f"Turbo↔Live divergence {pct:.1f}% exceeds warn threshold "
            f"{warn_pct:.1f}% — consider re-running live."
        )
    return None
```

- [ ] **Step 4: Run to verify pass**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_result_provenance.py -v`
Expected: 8 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/result_provenance.py backend/tests/test_result_provenance.py
git commit -m "feat(phase-e): result_provenance (empty-cause + truncation + Turbo/Live) — H10"
```

---

### Task 7: Sampling-aware correctness (H11)

**Files:**
- Create: `backend/sampling_aware.py`
- Create: `backend/tests/test_sampling_aware.py`

**Design:** Three helpers:
1. `approximate_distinct_count(values) -> int` — HLL via `datasketch`.
2. `detect_sentinel_values(numeric_col) -> list[float]` — spike-detector for `-1, 999999, 0, NULL-as-zero`.
3. `adaptive_stratify_plan(total_rows, strat_col_card) -> StratPlan` — auto-sample-rate + stratum proposal.

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_sampling_aware.py`:

```python
"""Sampling-aware helpers — H11."""
import pytest

from sampling_aware import (
    approximate_distinct_count, detect_sentinel_values,
    adaptive_stratify_plan, StratPlan, should_swap_to_hex_bin,
)


# ── HLL ─────────────────────────────────────────────────────────────

def test_hll_approximates_large_distinct():
    values = [f"user_{i}" for i in range(10_000)]
    estimate = approximate_distinct_count(values, precision=14)
    assert 9_000 <= estimate <= 11_000


def test_hll_on_empty_returns_zero():
    assert approximate_distinct_count([], precision=14) == 0


# ── Sentinel detection ─────────────────────────────────────────────

def test_detects_spike_at_minus_one():
    vals = [1.0, 2.0, 3.0] * 100 + [-1.0] * 50
    sentinels = detect_sentinel_values(vals)
    assert -1.0 in sentinels


def test_no_sentinels_on_smooth_distribution():
    vals = [float(i) for i in range(1000)]
    sentinels = detect_sentinel_values(vals)
    assert sentinels == []


def test_detects_999999_as_sentinel():
    vals = [float(i) for i in range(1000)] + [999999.0] * 30
    sentinels = detect_sentinel_values(vals)
    assert 999999.0 in sentinels


# ── Adaptive stratification ────────────────────────────────────────

def test_adaptive_stratify_low_cardinality_single_stratum():
    plan = adaptive_stratify_plan(total_rows=1_000_000, strat_col_card=3)
    assert plan.strata == 3
    assert 0.001 <= plan.sample_rate <= 1.0


def test_adaptive_stratify_high_cardinality_caps_strata():
    plan = adaptive_stratify_plan(total_rows=10_000_000, strat_col_card=100_000)
    assert plan.strata <= 1000   # bounded


def test_adaptive_plan_small_table_returns_full_scan():
    plan = adaptive_stratify_plan(total_rows=500, strat_col_card=10)
    assert plan.sample_rate == 1.0


# ── VizQL hex-bin swap ──────────────────────────────────────────────

def test_hex_bin_swap_fires_above_threshold():
    assert should_swap_to_hex_bin(row_count=25_000) is True


def test_hex_bin_swap_not_fired_below_threshold():
    assert should_swap_to_hex_bin(row_count=5_000) is False
```

- [ ] **Step 2: Run to verify fail**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_sampling_aware.py -v`
Expected: FAIL — `ModuleNotFoundError: sampling_aware`

- [ ] **Step 3: Implement**

Create `backend/sampling_aware.py`:

```python
"""H11 — Sampling-aware correctness.

- approximate_distinct_count: datasketch HLL
- detect_sentinel_values:     statistical spike-detection on numeric arrays
- adaptive_stratify_plan:     pick sample rate + stratum count
- should_swap_to_hex_bin:     row-count gate for VizQL scatter → hex-bin
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable


def approximate_distinct_count(values: Iterable, precision: int = 14) -> int:
    try:
        from datasketch import HyperLogLog
    except ImportError:
        # Fallback: exact set (not HLL) — may OOM on massive inputs.
        return len(set(values))
    hll = HyperLogLog(p=precision)
    empty = True
    for v in values:
        hll.update(str(v).encode("utf-8"))
        empty = False
    if empty:
        return 0
    return int(hll.count())


def detect_sentinel_values(values, spike_threshold: float = 0.02) -> list:
    """Return numeric values whose frequency exceeds `spike_threshold` of the total,
    and which are outliers relative to the main distribution (distance from mean > 3σ).
    """
    if not values:
        return []
    import statistics
    from collections import Counter
    total = len(values)
    counter = Counter(values)
    mean = statistics.fmean(values)
    try:
        stdev = statistics.pstdev(values)
    except statistics.StatisticsError:
        stdev = 0.0
    if stdev == 0:
        return []
    out = []
    for val, count in counter.items():
        if count / total < spike_threshold:
            continue
        try:
            if abs(val - mean) > 3 * stdev:
                out.append(float(val))
        except (TypeError, ValueError):
            continue
    return sorted(out)


@dataclass(frozen=True)
class StratPlan:
    sample_rate: float    # 0..1
    strata: int
    method: str           # "full_scan" | "stratified" | "simple_random"


def adaptive_stratify_plan(total_rows: int, strat_col_card: int) -> StratPlan:
    """Pick sample rate and stratum count from table size + stratifier cardinality."""
    if total_rows <= 1000:
        return StratPlan(sample_rate=1.0, strata=max(1, strat_col_card), method="full_scan")
    strata = min(max(1, strat_col_card), 1000)
    # Scale sample rate by table size (1M rows → 1%, 10M rows → 0.1%).
    if total_rows < 100_000:
        rate = 0.10
    elif total_rows < 1_000_000:
        rate = 0.02
    elif total_rows < 10_000_000:
        rate = 0.005
    else:
        rate = 0.001
    return StratPlan(sample_rate=rate, strata=strata, method="stratified")


def should_swap_to_hex_bin(row_count: int) -> bool:
    try:
        from config import settings
        threshold = int(settings.VIZQL_HEX_BIN_THRESHOLD_ROWS)
    except Exception:
        threshold = 20_000
    return row_count > threshold
```

- [ ] **Step 4: Run to verify pass**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_sampling_aware.py -v`
Expected: 10 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/sampling_aware.py backend/tests/test_sampling_aware.py
git commit -m "feat(phase-e): sampling-aware helpers — HLL + sentinel + stratify (H11)"
```

---

### Task 8: Integrate chip into waterfall_router + summary_generator

**Files:**
- Modify: `backend/waterfall_router.py`
- Modify: `backend/summary_generator.py`

**Design:** Every tier emits a `ProvenanceChip` alongside its result. Live tier → `build_live_chip()`. Turbo tier → `build_turbo_chip()` with staleness from twin age. Summary tier reads the chip's `sample_pct` / `stratified_on` metadata and adjusts prose accordingly. Skew guard wires into summary: when numeric profile has p99/p50 > 10, the prompt template forces "median = X, mean = Y" phrasing.

- [ ] **Step 1: Inspect current tier shapes**

```bash
grep -n "class .*Tier\|def try_answer\|def _run_tier\|_live_tier\|_turbo_tier" "QueryCopilot V1/backend/waterfall_router.py" | head -20
grep -n "build_summary\|def generate\|skew" "QueryCopilot V1/backend/summary_generator.py" | head -20
```

- [ ] **Step 2: Write a smoke integration test**

Create `backend/tests/test_phase_e_integration.py`:

```python
"""End-to-end smoke — chip attached to tier results + skew guard wires."""
import pytest


def test_waterfall_exposes_chip_builder():
    import waterfall_router
    assert hasattr(waterfall_router, "build_tier_chip")


def test_waterfall_build_tier_chip_live():
    from waterfall_router import build_tier_chip
    from provenance_chip import TrustStamp
    chip = build_tier_chip(tier="live", row_count=42)
    assert chip.trust is TrustStamp.LIVE
    assert chip.row_count == 42


def test_waterfall_build_tier_chip_turbo_with_staleness():
    from waterfall_router import build_tier_chip
    from provenance_chip import TrustStamp
    chip = build_tier_chip(tier="turbo", row_count=100, staleness_seconds=600)
    assert chip.trust is TrustStamp.TURBO
    assert chip.staleness_seconds == 600


def test_summary_generator_surfaces_median_when_skewed():
    from summary_generator import maybe_force_median
    prompt = "Report the average trip duration."
    out = maybe_force_median(prompt, p50=100, p99=1500)
    assert "median" in out.lower()


def test_summary_generator_unchanged_when_balanced():
    from summary_generator import maybe_force_median
    prompt = "Report the average trip duration."
    out = maybe_force_median(prompt, p50=100, p99=110)
    assert out == prompt
```

- [ ] **Step 3: Run to verify fail**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_phase_e_integration.py -v`
Expected: FAIL

- [ ] **Step 4: Add helper in `waterfall_router.py`**

Near the top of `backend/waterfall_router.py` (next to Phase C `validate_scope` helper):

```python
def build_tier_chip(tier: str, row_count: int, staleness_seconds: int = 0, **kwargs):
    """Phase E — produce the ProvenanceChip for a tier's result."""
    from provenance_chip import (
        build_live_chip, build_turbo_chip, build_sample_chip, build_unverified_chip,
    )
    t = (tier or "").lower()
    if t == "turbo":
        return build_turbo_chip(row_count=row_count, staleness_seconds=staleness_seconds)
    if t == "sample":
        return build_sample_chip(
            row_count=row_count,
            sample_pct=kwargs.get("sample_pct", 1.0),
            stratified_on=kwargs.get("stratified_on"),
            margin_of_error=kwargs.get("margin_of_error"),
        )
    if t == "unverified":
        return build_unverified_chip(reason=kwargs.get("reason", "scope"))
    return build_live_chip(row_count=row_count)
```

Then hook each tier method to call `build_tier_chip` with its own parameters and attach the result to whatever `Resolution`/`TierResult` structure the tier returns. Search for the existing `Resolution` / `TierResult` dataclass and extend it to carry an optional `chip` field; default `None` to stay backward-compatible.

- [ ] **Step 5: Add helper in `summary_generator.py`**

Near the top of `backend/summary_generator.py`:

```python
def maybe_force_median(prompt_text: str, p50: float = None, p99: float = None) -> str:
    """Phase E — when skew detected, inject 'report median and mean' directive."""
    try:
        from skew_guard import is_skewed
    except Exception:
        return prompt_text
    if p50 is None or p99 is None:
        return prompt_text
    if not is_skewed(p50=p50, p99=p99):
        return prompt_text
    injection = (
        "\n\nIMPORTANT: this column is heavily skewed (p99/p50 > 10). "
        "Report the MEDIAN alongside the mean to avoid misleading the user.\n"
    )
    return prompt_text + injection
```

Find wherever summary prompts are built. Call `maybe_force_median(prompt, p50, p99)` with the numeric-column profile pulled from the schema / cards.

- [ ] **Step 6: Run to verify pass**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_phase_e_integration.py -v`
Expected: 5 PASS

- [ ] **Step 7: Commit**

```bash
git add backend/waterfall_router.py backend/summary_generator.py backend/tests/test_phase_e_integration.py
git commit -m "feat(phase-e): chip attached per tier + skew-guard wired into summary"
```

---

### Task 9: Agent routes — `provenance_chip` SSE event (before first token)

**Files:**
- Modify: `backend/routers/agent_routes.py`

- [ ] **Step 1: Add SSE event helper**

Open `backend/routers/agent_routes.py`. Near other SSE builders (`_sse_intent_echo` from Phase D), add:

```python
def _sse_provenance_chip(payload: dict) -> str:
    import json
    return f"event: provenance_chip\ndata: {json.dumps(payload)}\n\n"
```

- [ ] **Step 2: Emit chip BEFORE first answer token**

In the main agent loop, after SQL execution completes and BEFORE the answer-streaming stage begins, emit the chip:

```python
        # Phase E — chip rendered BEFORE first token (never mid-stream).
        try:
            from provenance_chip import chip_to_sse_payload
            if tier_result is not None and getattr(tier_result, "chip", None) is not None:
                yield _sse_provenance_chip(chip_to_sse_payload(tier_result.chip))
        except Exception as _exc:
            logger.debug("provenance chip emit skipped: %s", _exc)
```

- [ ] **Step 3: Smoke check**

Run:

```bash
cd "QueryCopilot V1/backend"
python -c "from routers import agent_routes; assert hasattr(agent_routes, '_sse_provenance_chip'); print('OK')"
```

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add backend/routers/agent_routes.py
git commit -m "feat(phase-e): emit provenance_chip SSE event before first token"
```

---

### Task 10: `user_storage.py` — tenant_id assignment + migration

**Files:**
- Modify: `backend/user_storage.py`

**Design:** On profile read, if `tenant_id` missing, mint one and persist via atomic write. All downstream callers read `profile["tenant_id"]` via helper.

- [ ] **Step 1: Inspect current profile shape**

```bash
grep -n "def load_profile\|def save_profile\|tenant_id\|def get_user" "QueryCopilot V1/backend/user_storage.py" | head -15
```

- [ ] **Step 2: Write smoke test**

Append to `backend/tests/test_tenant_fortress.py`:

```python
def test_load_profile_mints_tenant_id_when_missing(tmp_path, monkeypatch):
    """Reading a legacy profile (no tenant_id) mints one and persists it."""
    import json
    from user_storage import load_profile_with_tenant
    user_dir = tmp_path / "abc1234"
    user_dir.mkdir()
    profile_path = user_dir / "profile.json"
    profile_path.write_text(json.dumps({"email": "u@t", "plan": "free"}))
    monkeypatch.setenv("USER_DATA_DIR", str(tmp_path))

    profile = load_profile_with_tenant(profile_path)
    assert "tenant_id" in profile
    # Re-read: same tenant_id.
    profile2 = load_profile_with_tenant(profile_path)
    assert profile2["tenant_id"] == profile["tenant_id"]
```

- [ ] **Step 3: Implement `load_profile_with_tenant`**

Inside `backend/user_storage.py`, add (near existing profile helpers):

```python
def load_profile_with_tenant(path):
    """Phase E — read a profile JSON, minting + persisting tenant_id if absent.

    Backward-compat: legacy profiles without tenant_id get one on first read.
    """
    import json
    from pathlib import Path
    from tenant_fortress import resolve_tenant_id

    p = Path(path)
    if not p.exists():
        return {}
    try:
        raw = json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return {}
    if "tenant_id" not in raw:
        resolve_tenant_id(raw)
        # Persist atomically.
        import os, tempfile
        fd, tmp = tempfile.mkstemp(dir=str(p.parent), prefix=f".{p.name}_", suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                json.dump(raw, fh, indent=2)
            os.replace(tmp, p)
        except Exception:
            try:
                os.unlink(tmp)
            except OSError:
                pass
    return raw
```

- [ ] **Step 4: Run to verify pass**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_tenant_fortress.py -v`
Expected: 9 PASS (8 prior + 1 new)

- [ ] **Step 5: Commit**

```bash
git add backend/user_storage.py backend/tests/test_tenant_fortress.py
git commit -m "feat(phase-e): user_storage.load_profile_with_tenant (mint + migrate)"
```

---

### Task 11: `skill_library.py` — per-tenant encoder dict

**Files:**
- Modify: `backend/skill_library.py`

**Design:** Current global `ENCODER` singleton must become `_ENCODERS: dict[tenant_id → encoder]`. Helper `get_encoder(tenant_id)` resolves; fresh tenant mints new encoder instance; cap total cached encoders to prevent memory leak (LRU, default 32).

- [ ] **Step 1: Inspect current pattern**

Run: `grep -n "ENCODER\|SentenceTransformer\|_encoder" "QueryCopilot V1/backend/skill_library.py" | head -15`

- [ ] **Step 2: Add smoke test**

Append to `backend/tests/test_tenant_fortress.py`:

```python
def test_skill_library_per_tenant_encoder_returns_distinct_instances():
    from skill_library import get_encoder
    e1 = get_encoder("tenant-1")
    e2 = get_encoder("tenant-2")
    assert e1 is not e2
    # Same tenant → same instance (cached).
    assert get_encoder("tenant-1") is e1
```

- [ ] **Step 3: Implement**

In `backend/skill_library.py`, replace the singleton `ENCODER = ...` with:

```python
from collections import OrderedDict
import threading

_ENCODERS: OrderedDict = OrderedDict()
_ENCODERS_LOCK = threading.Lock()
_ENCODERS_MAX = 32


def get_encoder(tenant_id: str):
    """Phase E — per-tenant encoder cache with LRU eviction."""
    with _ENCODERS_LOCK:
        if tenant_id in _ENCODERS:
            _ENCODERS.move_to_end(tenant_id)
            return _ENCODERS[tenant_id]
        # Mint a new encoder. Reuse whatever the module previously built
        # the singleton from (sentence-transformers / hash-v1 / etc.).
        enc = _build_new_encoder()  # ← existing helper; wire to the actual builder
        _ENCODERS[tenant_id] = enc
        if len(_ENCODERS) > _ENCODERS_MAX:
            _ENCODERS.popitem(last=False)
        return enc


def _build_new_encoder():
    """Existing singleton-construction logic goes here. Adjust to match current code."""
    # The subagent performing this task must find the actual model-loading line
    # (likely `SentenceTransformer("all-MiniLM-L6-v2")` or a HashV1Embedder
    # constructor from Phase A) and inline it here.
    ...
```

IMPORTANT: verify the existing encoder-build location and inline its logic into `_build_new_encoder()`. Grep for `SentenceTransformer(` and `HashV1Embedder(` in `backend/` to find it.

- [ ] **Step 4: Run to verify pass**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_tenant_fortress.py -v`
Expected: 10 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/skill_library.py backend/tests/test_tenant_fortress.py
git commit -m "feat(phase-e): per-tenant encoder dict in skill_library (Ring 6)"
```

---

### Task 12: `behavior_engine.py` — composite cache keys

**Files:**
- Modify: `backend/behavior_engine.py`

- [ ] **Step 1: Inspect current cache keys**

Run: `grep -n "cache_key\|_cache\[" "QueryCopilot V1/backend/behavior_engine.py" | head -15`

- [ ] **Step 2: Replace user-only keys with tenant composites**

For every cache dict keyed by `user_id` alone, update to `session_key(tenant_id, conn_id, user_id, session_id)` via `tenant_fortress`.

Example pattern to apply (exact line numbers depend on current code):

```python
# Before:
#   key = user_id
# After:
from tenant_fortress import session_key
key = session_key(
    tenant_id=profile.get("tenant_id", "unknown"),
    conn_id=conn_id or "none",
    user_id=user_id,
    session_id=session_id or "_",
)
```

When `tenant_id` is missing (pre-Phase-E profiles), fall back to `"unknown"` — `load_profile_with_tenant` from Task 10 ensures it's always populated on read, but defensive fallback is cheap.

- [ ] **Step 3: Sanity test**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/ -k behavior -v 2>&1 | tail -20`
Expected: no regressions.

- [ ] **Step 4: Commit**

```bash
git add backend/behavior_engine.py
git commit -m "feat(phase-e): behavior_engine uses tenant composite cache keys (Ring 6)"
```

---

### Task 13: Trap suite — `trap_sampling_trust.jsonl`

**Files:**
- Create: `backend/tests/trap_sampling_trust.jsonl`

- [ ] **Step 1: Write 15 trap questions**

Create `backend/tests/trap_sampling_trust.jsonl`:

```jsonl
{"id": "samp-001", "nl": "exact count of users", "expected_sql_contains": ["COUNT"], "oracle": {"type": "must_force_live_tier"}}
{"id": "samp-002", "nl": "today's signups", "expected_sql_contains": ["today", "signup"], "oracle": {"type": "must_force_live_tier"}}
{"id": "samp-003", "nl": "active incident count", "expected_sql_contains": ["incident"], "oracle": {"type": "must_force_live_tier"}}
{"id": "samp-004", "nl": "trips in 2024 by month", "expected_sql_contains": ["2024", "GROUP BY"], "oracle": {"type": "must_emit_chip", "trust": "live"}}
{"id": "samp-005", "nl": "rough trip count", "expected_sql_contains": [], "oracle": {"type": "must_emit_chip", "trust": "turbo"}}
{"id": "samp-006", "nl": "approximate distinct riders", "expected_sql_contains": [], "oracle": {"type": "must_emit_chip", "trust": "turbo"}}
{"id": "samp-007", "nl": "average trip duration", "expected_sql_contains": ["AVG"], "oracle": {"type": "must_include_median_when_skewed", "column": "duration_sec"}}
{"id": "samp-008", "nl": "p99 latency", "expected_sql_contains": [], "oracle": {"type": "must_emit_chip", "trust": "live"}}
{"id": "samp-009", "nl": "sample 1% of orders stratified by region", "expected_sql_contains": ["region"], "oracle": {"type": "must_emit_chip", "trust": "sample"}}
{"id": "samp-010", "nl": "fraud rate this hour", "expected_sql_contains": ["fraud"], "oracle": {"type": "must_force_live_tier"}}
{"id": "samp-011", "nl": "count events last hour", "expected_sql_contains": ["last hour"], "oracle": {"type": "must_force_live_tier"}}
{"id": "samp-012", "nl": "give me the total revenue exactly", "expected_sql_contains": ["SUM"], "oracle": {"type": "must_force_live_tier"}}
{"id": "samp-013", "nl": "typical session duration", "expected_sql_contains": [], "oracle": {"type": "must_include_median_when_skewed", "column": "session_seconds"}}
{"id": "samp-014", "nl": "fast estimate of trips", "expected_sql_contains": [], "oracle": {"type": "must_emit_chip", "trust": "turbo"}}
{"id": "samp-015", "nl": "how many orders in 2024", "expected_sql_contains": ["COUNT", "2024"], "oracle": {"type": "must_emit_chip", "trust": "live"}}
```

- [ ] **Step 2: Validate JSONL**

Run: `cd "QueryCopilot V1/backend" && python -c "import json; [json.loads(l) for l in open('tests/trap_sampling_trust.jsonl')]; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/tests/trap_sampling_trust.jsonl
git commit -m "feat(phase-e): trap_sampling_trust suite (15 Qs)"
```

---

### Task 14: Trap suite — `trap_multi_tenant.jsonl`

**Files:**
- Create: `backend/tests/trap_multi_tenant.jsonl`

- [ ] **Step 1: Write 15 trap questions**

Create `backend/tests/trap_multi_tenant.jsonl`:

```jsonl
{"id": "tenant-001", "nl": "show my last 10 queries", "expected_sql_contains": [], "oracle": {"type": "must_use_tenant_composite_key"}}
{"id": "tenant-002", "nl": "retrieve prior examples for this connection", "expected_sql_contains": [], "oracle": {"type": "must_use_tenant_composite_key"}}
{"id": "tenant-003", "nl": "show schema cache", "expected_sql_contains": [], "oracle": {"type": "must_use_tenant_composite_key"}}
{"id": "tenant-004", "nl": "list my saved dashboards", "expected_sql_contains": [], "oracle": {"type": "must_use_tenant_composite_key"}}
{"id": "tenant-005", "nl": "use my BYOK key", "expected_sql_contains": [], "oracle": {"type": "must_use_requester_byok_not_owner"}}
{"id": "tenant-006", "nl": "delete my account data", "expected_sql_contains": [], "oracle": {"type": "must_cascade_right_to_erasure"}}
{"id": "tenant-007", "nl": "count users in my tenant", "expected_sql_contains": ["COUNT"], "oracle": {"type": "must_use_tenant_composite_key"}}
{"id": "tenant-008", "nl": "cross-check my query memory", "expected_sql_contains": [], "oracle": {"type": "must_use_tenant_composite_key"}}
{"id": "tenant-009", "nl": "schema cache hit", "expected_sql_contains": [], "oracle": {"type": "must_use_tenant_composite_key"}}
{"id": "tenant-010", "nl": "turbo twin lookup", "expected_sql_contains": [], "oracle": {"type": "must_use_tenant_composite_key"}}
{"id": "tenant-011", "nl": "previously successful query", "expected_sql_contains": [], "oracle": {"type": "must_use_tenant_composite_key"}}
{"id": "tenant-012", "nl": "reuse feedback upvotes", "expected_sql_contains": [], "oracle": {"type": "must_use_tenant_composite_key"}}
{"id": "tenant-013", "nl": "EU tenant routing", "expected_sql_contains": [], "oracle": {"type": "must_route_eu_tenant_to_eu_endpoint"}}
{"id": "tenant-014", "nl": "run for shared viewer", "expected_sql_contains": [], "oracle": {"type": "must_use_requester_byok_not_owner"}}
{"id": "tenant-015", "nl": "tombstone chromadb collection", "expected_sql_contains": [], "oracle": {"type": "must_cascade_right_to_erasure"}}
```

- [ ] **Step 2: Validate JSONL**

Run: `cd "QueryCopilot V1/backend" && python -c "import json; [json.loads(l) for l in open('tests/trap_multi_tenant.jsonl')]; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/tests/trap_multi_tenant.jsonl
git commit -m "feat(phase-e): trap_multi_tenant suite (15 Qs)"
```

---

### Task 15: Extend grader with Phase E oracles

**Files:**
- Modify: `backend/tests/trap_grader.py`
- Create: `backend/tests/test_trap_grader_phase_e.py`

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_trap_grader_phase_e.py`:

```python
"""Phase E trap grader oracles."""
from pathlib import Path

from tests.trap_grader import grade_trap, _resolve_db_path


def _db():
    return _resolve_db_path(Path("/tmp/eval_fixture.sqlite"))


def test_must_force_live_tier_passes_on_marker():
    trap = {"id": "e-1", "nl": "", "expected_sql_contains": [],
            "oracle": {"type": "must_force_live_tier"}}
    sql = "-- tier: live\nSELECT 1"
    assert grade_trap(trap, sql, _db()).passed


def test_must_force_live_tier_fails_without_marker():
    trap = {"id": "e-2", "nl": "", "expected_sql_contains": [],
            "oracle": {"type": "must_force_live_tier"}}
    sql = "SELECT 1"
    assert grade_trap(trap, sql, _db()).passed is False


def test_must_emit_chip_passes_for_matching_trust():
    trap = {"id": "e-3", "nl": "", "expected_sql_contains": [],
            "oracle": {"type": "must_emit_chip", "trust": "turbo"}}
    sql = "-- chip: turbo\nSELECT 1"
    assert grade_trap(trap, sql, _db()).passed


def test_must_emit_chip_fails_for_wrong_trust():
    trap = {"id": "e-4", "nl": "", "expected_sql_contains": [],
            "oracle": {"type": "must_emit_chip", "trust": "turbo"}}
    sql = "-- chip: live\nSELECT 1"
    assert grade_trap(trap, sql, _db()).passed is False


def test_must_use_tenant_composite_key_passes_with_marker():
    trap = {"id": "e-5", "nl": "", "expected_sql_contains": [],
            "oracle": {"type": "must_use_tenant_composite_key"}}
    sql = "-- tenant_key: tenant:t1/conn:c1/user:u1\nSELECT 1"
    assert grade_trap(trap, sql, _db()).passed
```

- [ ] **Step 2: Run to verify fail**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_trap_grader_phase_e.py -v`
Expected: FAIL

- [ ] **Step 3: Implement handlers**

Open `backend/tests/trap_grader.py`. Add above `_HANDLERS`:

```python
def _check_must_force_live_tier(sql: str, oracle: dict) -> tuple:
    if "tier: live" in sql.lower():
        return True, "forced live tier"
    return False, "tier not forced to live"


def _check_must_emit_chip(sql: str, oracle: dict) -> tuple:
    want = (oracle.get("trust") or "").lower()
    if not want:
        return False, "must_emit_chip oracle missing 'trust' field"
    if f"chip: {want}" in sql.lower():
        return True, f"chip {want!r} emitted"
    return False, f"chip {want!r} not emitted"


def _check_must_use_tenant_composite_key(sql: str, oracle: dict) -> tuple:
    if "tenant_key:" in sql.lower() and "tenant:" in sql.lower() and "conn:" in sql.lower():
        return True, "tenant composite key present"
    return False, "tenant composite key marker missing"


def _check_must_include_median_when_skewed(sql: str, oracle: dict) -> tuple:
    if "median" in sql.lower():
        return True, "median phrase included"
    return False, "median phrase missing (skew guard expected)"


def _check_must_use_requester_byok(sql: str, oracle: dict) -> tuple:
    if "byok: requester" in sql.lower():
        return True, "BYOK bound to requester"
    return False, "BYOK binding marker missing"


def _check_must_cascade_right_to_erasure(sql: str, oracle: dict) -> tuple:
    markers = ("erasure: cascade", "deleted from chromadb", "deleted from audit")
    if any(m in sql.lower() for m in markers):
        return True, "erasure cascade marker present"
    return False, "erasure cascade marker missing"


def _check_must_route_eu_tenant_to_eu(sql: str, oracle: dict) -> tuple:
    if "endpoint: eu" in sql.lower():
        return True, "EU endpoint used"
    return False, "EU endpoint marker missing"
```

Extend `_HANDLERS`:

```python
    # Phase E oracles.
    "must_force_live_tier":                lambda sql, ora, _db: _check_must_force_live_tier(sql, ora),
    "must_emit_chip":                      lambda sql, ora, _db: _check_must_emit_chip(sql, ora),
    "must_use_tenant_composite_key":       lambda sql, ora, _db: _check_must_use_tenant_composite_key(sql, ora),
    "must_include_median_when_skewed":     lambda sql, ora, _db: _check_must_include_median_when_skewed(sql, ora),
    "must_use_requester_byok_not_owner":   lambda sql, ora, _db: _check_must_use_requester_byok(sql, ora),
    "must_cascade_right_to_erasure":       lambda sql, ora, _db: _check_must_cascade_right_to_erasure(sql, ora),
    "must_route_eu_tenant_to_eu_endpoint": lambda sql, ora, _db: _check_must_route_eu_tenant_to_eu(sql, ora),
```

- [ ] **Step 4: Run to verify pass**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_trap_grader_phase_e.py -v`
Expected: 5 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/tests/trap_grader.py backend/tests/test_trap_grader_phase_e.py
git commit -m "feat(phase-e): trap grader — Phase E oracle types (chip/tier/tenant)"
```

---

### Task 16: Frontend ProvenanceChip component

**Files:**
- Create: `frontend/src/components/agent/ProvenanceChip.jsx`
- Create: `frontend/src/components/agent/ProvenanceChip.test.jsx`

**Before coding**: invoke `impeccable` + `taste-skill`. The chip renders INLINE with the agent answer (not a modal, not a floating badge). Match the existing chat aesthetic — `oklch` tokens, subtle tinted shadow. No border-left stripe. No glassmorphism decoration. Use `@phosphor-icons/react` for the trust icon.

- [ ] **Step 1: Write failing component test**

Create `frontend/src/components/agent/ProvenanceChip.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react';
import ProvenanceChip from './ProvenanceChip';
import { describe, it, expect } from 'vitest';


describe('ProvenanceChip', () => {
  it('renders nothing when chip is null', () => {
    const { container } = render(<ProvenanceChip chip={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders Live shape with row count', () => {
    render(<ProvenanceChip chip={{
      trust: 'live',
      label: 'Live · 4,832 rows',
      row_count: 4832,
    }} />);
    expect(screen.getByText(/Live · 4,832 rows/)).toBeInTheDocument();
  });

  it('renders Turbo shape with staleness', () => {
    render(<ProvenanceChip chip={{
      trust: 'turbo',
      label: 'Turbo · 3m stale · est. 4,830',
      staleness_seconds: 180,
    }} />);
    expect(screen.getByText(/3m stale/)).toBeInTheDocument();
  });

  it('renders Sample shape with stratum', () => {
    render(<ProvenanceChip chip={{
      trust: 'sample',
      label: 'Sample 1% (stratified on region) · 4,500 ±200',
      sample_pct: 1,
      stratified_on: 'region',
      margin_of_error: 200,
    }} />);
    expect(screen.getByText(/stratified on region/)).toBeInTheDocument();
  });

  it('renders Unverified shape with reason', () => {
    render(<ProvenanceChip chip={{
      trust: 'unverified',
      label: 'Unverified scope · expression predicate',
      reason: 'expression predicate',
    }} />);
    expect(screen.getByText(/expression predicate/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `cd "QueryCopilot V1/frontend" && npx vitest run src/components/agent/ProvenanceChip.test.jsx`
Expected: FAIL

- [ ] **Step 3: Implement**

Create `frontend/src/components/agent/ProvenanceChip.jsx`:

```jsx
import { CircleWavyCheck, Clock, ChartPieSlice, Warning } from '@phosphor-icons/react';
import { motion } from 'framer-motion';

const ICONS = {
  live:       CircleWavyCheck,
  turbo:      Clock,
  sample:     ChartPieSlice,
  unverified: Warning,
};

export default function ProvenanceChip({ chip }) {
  if (!chip) return null;
  const Icon = ICONS[chip.trust] || CircleWavyCheck;
  return (
    <motion.span
      className={`provenance-chip provenance-chip-${chip.trust}`}
      role="status"
      aria-label={`Result trust: ${chip.label}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
    >
      <Icon size={12} weight="regular" />
      <span className="provenance-chip-label">{chip.label}</span>
    </motion.span>
  );
}
```

Add matching CSS in `frontend/src/index.css` (or an existing agent stylesheet). Use `oklch` tokens consistent with the `.intent-echo` classes from Phase D. No border-left stripes.

- [ ] **Step 4: Run to verify pass**

Run: `cd "QueryCopilot V1/frontend" && npx vitest run src/components/agent/ProvenanceChip.test.jsx`
Expected: 5 PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/agent/ProvenanceChip.jsx frontend/src/components/agent/ProvenanceChip.test.jsx frontend/src/index.css
git commit -m "feat(phase-e): ProvenanceChip React component (4 trust-stamp shapes)"
```

---

### Task 17: Frontend SSE wiring + store + Chat.jsx mount

**Files:**
- Modify: `frontend/src/store.js`
- Modify: `frontend/src/pages/Chat.jsx`

- [ ] **Step 1: Extend store**

Open `frontend/src/store.js`. Near the Phase D `pendingIntentEcho` block, add:

```js
  pendingProvenanceChip: null,      // current chip for in-progress answer
  setProvenanceChip: (chip) => set({ pendingProvenanceChip: chip }),
  clearProvenanceChip: () => set({ pendingProvenanceChip: null }),
```

- [ ] **Step 2: Handle SSE event**

In the SSE consumer (likely `useAgentSession.js` or where Phase D added `intent_echo` handling), add:

```js
    } else if (event.event === 'provenance_chip') {
      useStore.getState().setProvenanceChip(JSON.parse(event.data));
```

- [ ] **Step 3: Mount in Chat.jsx**

Where the answer bubble renders in `frontend/src/pages/Chat.jsx`, insert the chip at the top of the bubble (above streamed text):

```jsx
        {pendingProvenanceChip && (
          <ProvenanceChip chip={pendingProvenanceChip} />
        )}
```

Import `ProvenanceChip` at the top and pull `pendingProvenanceChip` from the store selector.

- [ ] **Step 4: Clear chip on message complete**

When the agent message completes (existing Phase D logic has a "done" event handler), also call `clearProvenanceChip()`.

- [ ] **Step 5: Lint + build**

```bash
cd "QueryCopilot V1/frontend"
npm run lint 2>&1 | tail -5
npm run build 2>&1 | tail -10
```

Expected: no new errors; build succeeds.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/store.js frontend/src/pages/Chat.jsx
git commit -m "feat(phase-e): wire provenance_chip SSE event + render before first token"
```

---

### Task 18: Generate baselines + regression check

**Files:**
- Create: `.data/sampling_trust_baseline.json`
- Create: `.data/multi_tenant_baseline.json`
- Modify: `.gitignore`

- [ ] **Step 1: Seed fixture + write baselines**

```bash
cd "QueryCopilot V1/backend"
python -m tests.fixtures.eval_seed %TEMP%\eval_fixture.sqlite
python -m tests.run_traps tests/trap_sampling_trust.jsonl ../.data/sampling_trust_baseline.json --write-baseline
python -m tests.run_traps tests/trap_multi_tenant.jsonl   ../.data/multi_tenant_baseline.json --write-baseline
```

Expected: both write lines.

- [ ] **Step 2: Re-run without --write-baseline**

```bash
cd "QueryCopilot V1/backend"
python -m tests.run_traps tests/trap_sampling_trust.jsonl ../.data/sampling_trust_baseline.json
python -m tests.run_traps tests/trap_multi_tenant.jsonl   ../.data/multi_tenant_baseline.json
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
```

Expected: all 5 green.

- [ ] **Step 4: .gitignore negations**

```bash
grep -n "sampling_trust_baseline\|multi_tenant_baseline" "QueryCopilot V1/.gitignore" || echo "NOT_IGNORED"
```

If `NOT_IGNORED`, append:

```
# Phase E trap baselines — committed per H13
!.data/sampling_trust_baseline.json
!.data/multi_tenant_baseline.json
```

- [ ] **Step 5: Commit**

```bash
git add .data/sampling_trust_baseline.json .data/multi_tenant_baseline.json .gitignore
git commit -m "feat(phase-e): Phase E trap baselines committed (sampling_trust + multi_tenant)"
```

---

### Task 19: CI gate — wire both new suites

**Files:**
- Modify: `.github/workflows/agent-traps.yml`

- [ ] **Step 1: Inspect workflow**

```bash
grep -n "run_traps" "QueryCopilot V1/.github/workflows/agent-traps.yml"
```

Expected: steps for temporal_scope, coverage_grounding, name_inference, join_scale, intent_drop.

- [ ] **Step 2: Add two steps**

Append two steps after `intent_drop`:

```yaml
      - name: Run Phase-E sampling-trust trap suite against mock
        run: |
          python -m backend.tests.run_traps \
            backend/tests/trap_sampling_trust.jsonl \
            .data/sampling_trust_baseline.json \
            --db /tmp/eval_fixture.sqlite

      - name: Run Phase-E multi-tenant trap suite against mock
        run: |
          python -m backend.tests.run_traps \
            backend/tests/trap_multi_tenant.jsonl \
            .data/multi_tenant_baseline.json \
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
git commit -m "feat(phase-e): CI gates Phase E trap baselines (sampling_trust + multi_tenant)"
```

---

### Task 20: Phase E exit gate

- [ ] **Step 1: Full backend test suite**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/ -v 2>&1 | tail -30`
Expected: ~1650+ pass (Phase D's 1590+ + ~60 Phase E tests), 1 skip.

- [ ] **Step 2: All seven trap suites**

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
```

Expected: all seven green.

- [ ] **Step 3: Import health**

```bash
cd "QueryCopilot V1/backend"
python -c "
import sys; sys.path.insert(0, '.')
from provenance_chip import ProvenanceChip, TrustStamp, build_live_chip, build_turbo_chip, build_sample_chip, build_unverified_chip, worst_staleness, chip_to_sse_payload
from tier_promote import should_force_live, extract_promote_trigger
from skew_guard import is_skewed, needs_median, SkewProfile, build_profile_from_values
from tenant_fortress import chroma_namespace, session_key, turbo_twin_path, schema_cache_path, resolve_tenant_id, TenantKeyError
from chaos_isolation import jittered_backoff, Singleflight, CostBreaker, CostExceeded, SSECursor
from result_provenance import empty_cause, truncation_warning, turbo_live_divergence, EmptyCause
from sampling_aware import approximate_distinct_count, detect_sentinel_values, adaptive_stratify_plan, StratPlan, should_swap_to_hex_bin
import waterfall_router, summary_generator, user_storage, skill_library
assert hasattr(waterfall_router, 'build_tier_chip')
assert hasattr(summary_generator, 'maybe_force_median')
assert hasattr(user_storage, 'load_profile_with_tenant')
assert hasattr(skill_library, 'get_encoder')
print('Phase E imports OK')
"
```

Expected: `Phase E imports OK`

- [ ] **Step 4: Frontend lint + build + component test**

```bash
cd "QueryCopilot V1/frontend"
npm run lint 2>&1 | tail -5
npm run build 2>&1 | tail -10
npx vitest run src/components/agent/ProvenanceChip.test.jsx
```

Expected: no new errors; build succeeds; chip tests PASS.

- [ ] **Step 5: CI YAML validation**

```bash
cd "QueryCopilot V1"
python -c "import yaml; yaml.safe_load(open('.github/workflows/agent-traps.yml')); yaml.safe_load(open('.github/workflows/pii-scan.yml')); print('CI OK')"
```

- [ ] **Step 6: Manual smoke — preview server**

Start the dev server + frontend. Ask four NL questions and visually confirm the chip renders BEFORE the streamed text:

1. `"today's signups"` → force-live chip: `Live · N rows`.
2. `"rough estimate of 2024 trips"` → Turbo chip: `Turbo · Xm stale · est. N`.
3. `"sample 1% orders by region"` → Sample chip: `Sample 1% (stratified on region) · N ±E`.
4. `"show users where hash(id) % 1000 = 0"` → Unverified chip: `Unverified scope · expression predicate`.

Document the observed chips in the exit commit message.

- [ ] **Step 7: Exit commit**

```bash
git commit --allow-empty -m "chore(phase-e): exit gate — T0-T19 shipped, 2 new trap baselines, CI wired, 4 chip shapes verified in preview"
```

---

## Phase E exit criteria

- [ ] Backend modules present and importable: `provenance_chip`, `tier_promote`, `skew_guard`, `tenant_fortress`, `chaos_isolation`, `result_provenance`, `sampling_aware`.
- [ ] `waterfall_router.build_tier_chip()` + per-tier chip attachment.
- [ ] `summary_generator.maybe_force_median()` injects median on skewed profiles.
- [ ] `user_storage.load_profile_with_tenant()` mints + migrates tenant_id.
- [ ] `skill_library.get_encoder(tenant_id)` per-tenant LRU cache.
- [ ] New SSE event `provenance_chip` emitted BEFORE first answer token.
- [ ] Frontend `ProvenanceChip.jsx` renders 4 shapes; Zustand wires `pendingProvenanceChip`; Chat.jsx mounts.
- [ ] `trap_sampling_trust.jsonl` (15 Qs) + `trap_multi_tenant.jsonl` (15 Qs) committed.
- [ ] `.data/sampling_trust_baseline.json` + `.data/multi_tenant_baseline.json` committed.
- [ ] All seven trap suites green with no regressions.
- [ ] Full pytest suite: ~1650+ pass, 1 skip.
- [ ] Frontend lint + build green; chip component tests pass.
- [ ] CI workflow gates all seven suites.
- [ ] Manual preview: all 4 chip shapes render correctly before first token.

---

## Risk notes & follow-ups

- **EU endpoint routing is marker-only in Phase E** — `TENANT_EU_REGIONS` config reads, but the actual Anthropic client swap to EU endpoint is a one-line change in `anthropic_provider.py` that was NOT part of this phase. Phase H (supply chain / infra hardening) adds the real HTTP client switch. Phase E's trap oracle is a sentinel marker only.
- **Right-to-erasure cascade partial** — Phase E tests for the marker but the actual cascade into ChromaDB + Turbo twin + audit logs is a follow-up in Phase F (correction pipeline touches same surfaces). The marker's presence in traps is a contract; the implementation ships in F.
- **Turbo↔Live cross-check helper ships but is not auto-scheduled** — `result_provenance.turbo_live_divergence()` is available; Phase F/I will schedule the 1% sanity re-run cron. Until then it's called on-demand only.
- **HLL cardinality estimates not wired into live SQL path** — `approximate_distinct_count` is available as a backend helper; the actual "transparently swap COUNT(DISTINCT x) for HLL" agent tool is deferred to Phase G (retrieval hygiene + query expansion).
- **Per-tenant encoder LRU cap at 32** — tenants beyond 32 active concurrently will see model reloads. Acceptable for current scale; bump to 64-128 + SIGHUP-reload when customer count grows.
- **Skew guard is prompt-injection only** — summary prompt gets a "IMPORTANT: report median" line. It's a strong hint, not a constraint; LLM may still report only mean. Phase H validator extension may enforce this structurally.
- **Tier-promote gate is keyword-match only** — will false-fire on queries like `"show me today's menu items"` (not a live-only semantic). Phase G query expansion adds an LLM-backed disambiguator to suppress false promotes.
- **Sentinel detection is frequency-threshold only** — misses contextual sentinels (e.g. "1900-01-01" in date cols). Phase G extends with domain-specific patterns.
- **Singleflight is in-process only** — across multiple workers, concurrent duplicates still possible. Phase H adds Redis-backed cross-worker singleflight.

---

## Execution note for agentic workers

Five independent tracks + sequential integration tail:

- **Track A (foundation + config, first):** T0 config flags + datasketch pin.
- **Track B (Ring 5, parallel with C/D/E):** T1 Provenance chip → T2 Tier promote → T3 Skew guard.
- **Track C (Ring 6, parallel with B/D/E):** T4 TenantFortress → T10 user_storage.load_profile_with_tenant → T11 per-tenant encoder → T12 behavior_engine keys.
- **Track D (H8/H10/H11 backend, parallel with B/C):** T5 Chaos isolation + T6 Result provenance + T7 Sampling-aware.
- **Track E (traps + grader, parallel once T0 committed):** T13 + T14 (trap JSONLs) → T15 (grader extensions).
- **Integration tail (serial after all tracks):**
  - T8 chip + skew integration in waterfall_router / summary_generator.
  - T9 SSE event emit.
  - T16 Frontend chip component.
  - T17 Frontend SSE wire + Chat.jsx mount.
  - T18 Baselines.
  - T19 CI wire.
  - T20 Exit gate.

Recommended parallel track split:

- **Track 1:** T0 → T1 → T2 → T3 (Ring 5 backend).
- **Track 2:** T4 → T10 → T11 → T12 (Ring 6 backend — serial within because all touch existing files).
- **Track 3:** T5 + T6 + T7 (H8/H10/H11 independent modules — can all run in parallel).
- **Track 4:** T13 → T14 → T15 (traps + grader).

After all four tracks merge: T8 → T9 → T16 → T17 → T18 → T19 → T20 serially.

Estimated serial time: ~14-18 hours (comparable to Phase D). Estimated parallel time: ~4-5 hours.
