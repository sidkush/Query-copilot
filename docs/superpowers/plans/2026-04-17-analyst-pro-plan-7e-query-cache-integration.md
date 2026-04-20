# Analyst Pro — Plan 7e: Query Cache 2-Tier + Waterfall Integration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a 2-tier LRU query cache (`InProcessLogicalQueryCache` + Redis-backed `ExternalLogicalQueryCache`) keyed on logical plan structure, wrap both with `HistoryTrackingCache` for invalidation reasoning, add a `QueryBatch` orchestrator for dashboard fan-in, and wire a new `VizQLTier` into `WaterfallRouter` between `MemoryTier` and `TurboTier` so cache hits short-circuit DuckDB twin execution.

**Architecture:** Content-addressable keys (`AbstractQueryCacheKey` — blake2b hash of relation tree + predicates + projection + groupBys + orderBy + aggTypes + dialect + parameter snapshot) let two logically-equivalent queries hit the same cache entry regardless of call site. Byte-budget LRU policy (`LRUQueryCachePolicy`) evicts on memory pressure not entry count. External tier uses the existing `redis_client.get_redis()` singleton with graceful degradation — Redis down falls back to in-process only. `HistoryTrackingCache` records an invalidation ring-buffer per data source (param change / extract refresh / TTL / manual) for the perf-debugging UI. `VizQLTier` sits between Memory and Turbo so a cache hit never pays the DuckDB round-trip.

**Tech Stack:** Python 3.10+, FastAPI, Redis (optional, via existing `backend/redis_client.py`), Python's stdlib `pickle` module at protocol 5 for serialisation (Python-only consumer guarantee — explicitly specified by the Plan 7e task brief), `blake2b` for hashing, `threading.RLock` for in-process concurrency, pytest + pytest-asyncio.

**Spec references (Build_Tableau.md):**
- §IV.10 — Query cache (two-tier, LRU) — `AbstractQueryCacheKey` composition, `LRUQueryCachePolicy`, `InProcessLogicalQueryCache` / `ExternalLogicalQueryCache`, `HistoryTrackingCache`, `ExternalQueryCacheFileBasedConnectionTTLSec`, `tabquerybatchproc` orchestrating `QueryBatch`.
- §IV.11 — `QueryCategory` enum (`MDX_SETUP`, `MDX_VALIDATION`, `NOW`, `FILTER`, `IMPERSONATE`, `HYPER_STREAM`).
- §XIX.1 #4 — Custom SQL with parameter substitution changing the relation tree defeats cache ⇒ `parameter_snapshot` is part of the cache key.
- Appendix E.5 — "Dashboard dedupes equivalent queries; cache key = `{DS, relation, predicate, projection, groupBys, order, aggTypes}`."

**Prerequisite verification** (run before Task 1):
```
ls backend/vizql/
```
Expected: at minimum `spec.py`, `logical.py`, `compiler.py`, `sql_ast.py`, `logical_to_sql.py`, `optimizer.py`, `filter_ordering.py`, `dialect_base.py`, `dialects/`, `__init__.py`. Any missing ⇒ STOP; Plan 7a–7d incomplete.

```
git log --oneline -60 | grep "Plan 7"
```
Expected: commits tagged `(Plan 7a TN)` … `(Plan 7d TN)` present; no `(Plan 7e …)` yet.

---

## File Structure

**New files:**
- `backend/vizql/cache.py` — `AbstractQueryCacheKey`, `LRUQueryCachePolicy`, `InProcessLogicalQueryCache`, `ExternalLogicalQueryCache`, `HistoryTrackingCache`, `InvalidationRecord`.
- `backend/vizql/batch.py` — `QueryBatch`, `BatchResult` for dashboard fan-in dedup.
- `backend/vizql/telemetry.py` — `QueryCategory` enum (§IV.11).
- `backend/tests/test_vizql_cache_key.py` — key stability + parameter-change invalidation.
- `backend/tests/test_vizql_cache_inprocess.py` — LRU byte-budget eviction + thread safety.
- `backend/tests/test_vizql_cache_external.py` — Redis put/get + graceful degradation.
- `backend/tests/test_vizql_cache_history.py` — invalidation record ring buffer.
- `backend/tests/test_vizql_batch.py` — dashboard dedup 10→3 unique.
- `backend/tests/test_waterfall_vizql_tier.py` — tier ordering + short-circuit.
- `backend/tests/test_vizql_cache_integration.py` — end-to-end.

**Modified files:**
- `backend/config.py` — 5 new `VIZQL_*` settings.
- `backend/audit_trail.py` — add `log_vizql_cache_event` + `log_vizql_batch_event`.
- `backend/waterfall_router.py` — add `VizQLTier` class, insert between `MemoryTier` and `TurboTier` in default construction.
- `backend/vizql/__init__.py` — re-export new cache/batch/telemetry symbols.
- `backend/docs/claude/config-defaults.md` — document the five new settings.
- `docs/analyst_pro_tableau_parity_roadmap.md` — mark Plan 7e shipped.

**Responsibility boundaries:**
- `cache.py` knows nothing about waterfall, connections, or FastAPI — pure cache primitives.
- `batch.py` depends only on `cache.py` + `sql_ast.SQLQueryFunction` — no router coupling.
- `telemetry.py` is a pure enum module — zero imports from the rest of the codebase.
- `waterfall_router.py` is the only place that wires cache → SQL emission → execution.

---

## Conventions (hard rules)

- **Key stability:** `AbstractQueryCacheKey.__hash__` canonicalises field order, predicate order, literal quoting. Two plans that differ only in ordering hash identically. TDD (Task 1 Step 1).
- **Immutable return:** Every `get()` returns values callers must not mutate; DataFrame-typed entries are copied on publish into the cache, never on every `get()`. Violating this corrupts other callers.
- **Graceful Redis degradation:** Follow `redis_client.py` pattern — `ExternalLogicalQueryCache` wraps all Redis ops in try/except, logs a warning at most once per 30 s, returns `None` on get / no-ops on put.
- **Audit every tier hit/miss:** `VizQLTier._answer()` calls `log_vizql_cache_event(...)` on every decision with `event_type ∈ {"hit_inprocess","hit_external","miss","compiled_stored"}` and a stable `key_hash`.
- **Serialisation:** Python `pickle` protocol 5 only (explicitly requested by the Plan 7e task brief). Python-only consumer guarantee — callers that need cross-language persistence use a separate serde.
- **Type hints strict:** `mypy --strict` must pass on `backend/vizql/cache.py`, `batch.py`, `telemetry.py` (new Plan 7e surface). Pre-existing baseline errors in `vizql/spec.py` + `vizql/proto/*` remain out of scope.
- **TDD per cache op:** Every `get`/`put`/`invalidate` has its own failing test before implementation.
- **Commit per task:** Format `feat(analyst-pro): <verb> <object> (Plan 7e T<N>)`.

---

## Task 1 — `AbstractQueryCacheKey` dataclass + stable hashing

**Files:**
- Create: `backend/vizql/cache.py`
- Create: `backend/tests/test_vizql_cache_key.py`

**Why first.** Every other task depends on a stable cache key. If the hash is not deterministic across runs (Python string hash randomisation, dict ordering) or ignores a semantically-relevant field, every downstream cache is broken.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_vizql_cache_key.py`:

```python
"""Plan 7e T1 — AbstractQueryCacheKey stability + collision resistance."""
from __future__ import annotations

import pytest

from vizql.cache import AbstractQueryCacheKey, OrderByKey


def _base_key(**overrides) -> AbstractQueryCacheKey:
    defaults = dict(
        ds_id="conn_abc",
        relation_tree_hash="rel_hash_1",
        predicate_hash="pred_hash_1",
        projection=("col_a", "col_b"),
        group_bys=("col_a",),
        order_by=(OrderByKey(column="col_a", descending=False),),
        agg_types=("SUM",),
        dialect="duckdb",
        parameter_snapshot=(),
    )
    defaults.update(overrides)
    return AbstractQueryCacheKey(**defaults)


def test_key_is_hashable_and_equal():
    k1 = _base_key()
    k2 = _base_key()
    assert hash(k1) == hash(k2)
    assert k1 == k2


def test_key_differs_on_projection():
    k1 = _base_key(projection=("col_a", "col_b"))
    k2 = _base_key(projection=("col_a", "col_c"))
    assert k1 != k2
    assert hash(k1) != hash(k2)


def test_key_differs_on_parameter_snapshot():
    """§XIX.1 anti-pattern #4 — parameter change MUST invalidate."""
    k1 = _base_key(parameter_snapshot=(("region", '"EMEA"'),))
    k2 = _base_key(parameter_snapshot=(("region", '"AMER"'),))
    assert k1 != k2


def test_key_canonicalises_projection_order():
    """Caller passes columns in display order; key must normalise to sorted tuple."""
    k1 = _base_key(projection=("col_a", "col_b"))
    k2 = _base_key(projection=("col_b", "col_a"))
    assert k1 == k2


def test_key_stable_across_processes():
    """blake2b hex digest must not depend on PYTHONHASHSEED."""
    k = _base_key()
    assert k.to_canonical_str().startswith("vizql:")
    assert len(k.content_hash()) == 32


def test_order_by_key_equality():
    a = OrderByKey(column="x", descending=True)
    b = OrderByKey(column="x", descending=True)
    c = OrderByKey(column="x", descending=False)
    assert a == b
    assert a != c
    assert hash(a) == hash(b)
```

- [ ] **Step 2: Run test to verify it fails**

```
cd backend && python -m pytest tests/test_vizql_cache_key.py -v
```
Expected: `ImportError: cannot import name 'AbstractQueryCacheKey' from 'vizql.cache'`.

- [ ] **Step 3: Write minimal implementation**

Create `backend/vizql/cache.py`:

```python
"""Plan 7e — VizQL query cache primitives.

§IV.10 of Build_Tableau.md defines a two-tier LRU cache keyed on logical
plan structure. This module provides:

- ``AbstractQueryCacheKey`` — content-addressable key (§IV.10, Appendix E.5).
- ``LRUQueryCachePolicy`` — byte-budget eviction (Task 2).
- ``InProcessLogicalQueryCache`` — local LRU (Task 2).
- ``ExternalLogicalQueryCache`` — Redis-backed (Task 3).
- ``HistoryTrackingCache`` — invalidation reasoning wrapper (Task 4).
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from typing import Tuple


@dataclass(frozen=True)
class OrderByKey:
    """Single ORDER BY entry. Frozen so it can live inside a hashable key."""
    column: str
    descending: bool = False


@dataclass(frozen=True)
class AbstractQueryCacheKey:
    """Content-addressable key for a logical-plan query result.

    Fields mirror Build_Tableau.md §IV.10 + Appendix E.5 exactly.
    """

    ds_id: str
    relation_tree_hash: str
    predicate_hash: str
    projection: Tuple[str, ...]
    group_bys: Tuple[str, ...]
    order_by: Tuple[OrderByKey, ...]
    agg_types: Tuple[str, ...]
    dialect: str
    parameter_snapshot: Tuple[Tuple[str, str], ...] = field(default_factory=tuple)

    def __post_init__(self) -> None:
        object.__setattr__(self, "projection", tuple(sorted(self.projection)))
        object.__setattr__(self, "group_bys", tuple(sorted(self.group_bys)))
        object.__setattr__(self, "agg_types", tuple(sorted(self.agg_types)))
        object.__setattr__(
            self,
            "parameter_snapshot",
            tuple(sorted(self.parameter_snapshot, key=lambda kv: kv[0])),
        )

    def content_hash(self) -> str:
        """Deterministic blake2b(16) hex digest of the canonical form."""
        canonical = json.dumps(
            {
                "ds_id": self.ds_id,
                "relation_tree_hash": self.relation_tree_hash,
                "predicate_hash": self.predicate_hash,
                "projection": list(self.projection),
                "group_bys": list(self.group_bys),
                "order_by": [(o.column, o.descending) for o in self.order_by],
                "agg_types": list(self.agg_types),
                "dialect": self.dialect,
                "parameter_snapshot": list(self.parameter_snapshot),
            },
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
        return hashlib.blake2b(canonical, digest_size=16).hexdigest()

    def to_canonical_str(self) -> str:
        """Human-readable namespaced key — used in audit log and Redis keyspace."""
        return f"vizql:{self.dialect}:{self.ds_id}:{self.content_hash()}"
```

- [ ] **Step 4: Run test to verify it passes**

```
cd backend && python -m pytest tests/test_vizql_cache_key.py -v
```
Expected: 6 passed.

- [ ] **Step 5: mypy strict**

```
cd backend && python -m mypy --strict vizql/cache.py
```
Expected: `Success: no issues found in 1 source file`.

- [ ] **Step 6: Commit**

```
git add backend/vizql/cache.py backend/tests/test_vizql_cache_key.py
git commit -m "feat(analyst-pro): AbstractQueryCacheKey + canonical hashing (Plan 7e T1)"
```

---

## Task 2 — `LRUQueryCachePolicy` + `InProcessLogicalQueryCache`

**Files:**
- Modify: `backend/vizql/cache.py`
- Create: `backend/tests/test_vizql_cache_inprocess.py`

**Why second.** In-process cache is the hot path — every query consults it before hitting Redis. Needs byte-budget LRU (not entry-count LRU; dashboards mix 500-byte filter DFs and 40 MB aggregate DFs). Thread-safety is mandatory — multiple request workers share one cache.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_vizql_cache_inprocess.py`:

```python
"""Plan 7e T2 — LRUQueryCachePolicy + InProcessLogicalQueryCache."""
from __future__ import annotations

import threading

import pytest

from vizql.cache import (
    AbstractQueryCacheKey,
    InProcessLogicalQueryCache,
    LRUQueryCachePolicy,
    OrderByKey,
)


def _key(ds: str, i: int) -> AbstractQueryCacheKey:
    return AbstractQueryCacheKey(
        ds_id=ds,
        relation_tree_hash=f"rel_{i}",
        predicate_hash=f"pred_{i}",
        projection=("a",),
        group_bys=(),
        order_by=(OrderByKey(column="a", descending=False),),
        agg_types=("SUM",),
        dialect="duckdb",
    )


def test_put_then_get_roundtrip():
    c = InProcessLogicalQueryCache(LRUQueryCachePolicy(max_bytes=1024))
    k = _key("ds1", 1)
    c.put(k, value=b"x" * 100, size_bytes=100)
    assert c.get(k) == b"x" * 100


def test_miss_returns_none():
    c = InProcessLogicalQueryCache(LRUQueryCachePolicy(max_bytes=1024))
    assert c.get(_key("ds1", 99)) is None


def test_eviction_by_byte_budget():
    c = InProcessLogicalQueryCache(LRUQueryCachePolicy(max_bytes=300))
    k1, k2, k3 = _key("ds", 1), _key("ds", 2), _key("ds", 3)
    c.put(k1, b"a" * 100, size_bytes=100)
    c.put(k2, b"b" * 100, size_bytes=100)
    c.put(k3, b"c" * 100, size_bytes=100)
    assert c.get(k1) is not None
    k4 = _key("ds", 4)
    c.put(k4, b"d" * 100, size_bytes=100)
    assert c.get(k1) is None, "LRU victim should be k1"
    assert c.get(k4) is not None


def test_lru_touch_on_get():
    c = InProcessLogicalQueryCache(LRUQueryCachePolicy(max_bytes=300))
    k1, k2, k3 = _key("ds", 1), _key("ds", 2), _key("ds", 3)
    c.put(k1, b"a" * 100, size_bytes=100)
    c.put(k2, b"b" * 100, size_bytes=100)
    c.put(k3, b"c" * 100, size_bytes=100)
    c.get(k1)  # promote k1 — k2 is now LRU
    k4 = _key("ds", 4)
    c.put(k4, b"d" * 100, size_bytes=100)
    assert c.get(k2) is None
    assert c.get(k1) is not None


def test_invalidate_removes_entry_and_frees_bytes():
    c = InProcessLogicalQueryCache(LRUQueryCachePolicy(max_bytes=300))
    k = _key("ds", 1)
    c.put(k, b"x" * 100, size_bytes=100)
    assert c.current_bytes() == 100
    c.invalidate(k)
    assert c.get(k) is None
    assert c.current_bytes() == 0


def test_invalidate_by_predicate():
    c = InProcessLogicalQueryCache(LRUQueryCachePolicy(max_bytes=1024))
    c.put(_key("ds1", 1), b"a" * 50, size_bytes=50)
    c.put(_key("ds2", 2), b"b" * 50, size_bytes=50)
    removed = c.invalidate_by_predicate(lambda k: k.ds_id == "ds1")
    assert removed == 1
    assert c.get(_key("ds1", 1)) is None
    assert c.get(_key("ds2", 2)) is not None


def test_stats_counters():
    c = InProcessLogicalQueryCache(LRUQueryCachePolicy(max_bytes=1024))
    k = _key("ds", 1)
    c.get(k)  # miss
    c.put(k, b"x", size_bytes=1)
    c.get(k)  # hit
    c.get(k)  # hit
    stats = c.stats()
    assert stats["hits"] == 2
    assert stats["misses"] == 1
    assert stats["per_ds"]["ds"]["hits"] == 2


def test_thread_safety_concurrent_puts():
    c = InProcessLogicalQueryCache(LRUQueryCachePolicy(max_bytes=1_000_000))
    errors: list[Exception] = []

    def worker(start: int) -> None:
        try:
            for i in range(start, start + 100):
                c.put(_key("ds", i), b"x" * 10, size_bytes=10)
        except Exception as exc:
            errors.append(exc)

    threads = [threading.Thread(target=worker, args=(i * 100,)) for i in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert not errors
    assert c.current_bytes() == 400 * 10
```

- [ ] **Step 2: Run test to verify it fails**

```
cd backend && python -m pytest tests/test_vizql_cache_inprocess.py -v
```
Expected: `ImportError: cannot import name 'InProcessLogicalQueryCache' …`.

- [ ] **Step 3: Write minimal implementation**

Append to `backend/vizql/cache.py`:

```python
# ---------------------------------------------------------------------------
# Plan 7e T2 — LRUQueryCachePolicy + InProcessLogicalQueryCache
# ---------------------------------------------------------------------------

import logging
import threading
from collections import OrderedDict
from typing import Any, Callable, Dict, Optional

logger = logging.getLogger(__name__)

_DEFAULT_INPROCESS_BYTES = 64 * 1024 * 1024   # 64 MiB
_DEFAULT_EXTERNAL_BYTES = 512 * 1024 * 1024   # 512 MiB


class LRUQueryCachePolicy:
    """Byte-budget LRU policy.

    Tableau's ``LRUQueryCachePolicy(maxSize)`` evicts by bytes, not entries,
    because query results vary by 4+ orders of magnitude in size.
    """

    def __init__(self, max_bytes: int) -> None:
        if max_bytes <= 0:
            raise ValueError("max_bytes must be positive")
        self.max_bytes = int(max_bytes)

    @staticmethod
    def size_estimator(value: Any) -> int:
        """Conservative size estimate. Caller should prefer the true byte
        length when available.
        """
        import pickle as _pk
        if isinstance(value, (bytes, bytearray)):
            return len(value)
        try:
            return len(_pk.dumps(value, protocol=5))
        except Exception:
            return 1024


class InProcessLogicalQueryCache:
    """Thread-safe byte-budget LRU cache.

    OrderedDict preserves insertion order; ``move_to_end`` on ``get`` implements
    LRU promotion. All state is guarded by a single ``RLock``.
    """

    def __init__(self, policy: LRUQueryCachePolicy) -> None:
        self._policy = policy
        self._store: "OrderedDict[AbstractQueryCacheKey, tuple[Any, int]]" = OrderedDict()
        self._lock = threading.RLock()
        self._bytes = 0
        self._hits = 0
        self._misses = 0
        self._per_ds: Dict[str, Dict[str, int]] = {}

    def get(self, key: AbstractQueryCacheKey) -> Optional[Any]:
        with self._lock:
            hit = self._store.get(key)
            if hit is None:
                self._misses += 1
                self._bump(key.ds_id, "misses")
                return None
            self._store.move_to_end(key)
            self._hits += 1
            self._bump(key.ds_id, "hits")
            return hit[0]

    def put(self, key: AbstractQueryCacheKey, value: Any, size_bytes: Optional[int] = None) -> None:
        if size_bytes is None:
            size_bytes = LRUQueryCachePolicy.size_estimator(value)
        with self._lock:
            existing = self._store.pop(key, None)
            if existing is not None:
                self._bytes -= existing[1]
            self._store[key] = (value, size_bytes)
            self._bytes += size_bytes
            self._evict_until_fits()

    def invalidate(self, key: AbstractQueryCacheKey) -> bool:
        with self._lock:
            existing = self._store.pop(key, None)
            if existing is None:
                return False
            self._bytes -= existing[1]
            return True

    def invalidate_by_predicate(self, predicate: Callable[[AbstractQueryCacheKey], bool]) -> int:
        with self._lock:
            victims = [k for k in self._store if predicate(k)]
            for k in victims:
                self._bytes -= self._store.pop(k)[1]
            return len(victims)

    def clear(self) -> None:
        with self._lock:
            self._store.clear()
            self._bytes = 0

    def current_bytes(self) -> int:
        with self._lock:
            return self._bytes

    def stats(self) -> Dict[str, Any]:
        with self._lock:
            return {
                "hits": self._hits,
                "misses": self._misses,
                "bytes": self._bytes,
                "entries": len(self._store),
                "per_ds": {ds: dict(counts) for ds, counts in self._per_ds.items()},
            }

    def _evict_until_fits(self) -> None:
        while self._bytes > self._policy.max_bytes and self._store:
            _, (_, size) = self._store.popitem(last=False)
            self._bytes -= size

    def _bump(self, ds_id: str, bucket: str) -> None:
        d = self._per_ds.setdefault(ds_id, {"hits": 0, "misses": 0})
        d[bucket] = d.get(bucket, 0) + 1
```

- [ ] **Step 4: Run tests to verify they pass**

```
cd backend && python -m pytest tests/test_vizql_cache_inprocess.py -v
```
Expected: 8 passed.

- [ ] **Step 5: mypy strict**

```
cd backend && python -m mypy --strict vizql/cache.py
```
Expected: `Success`.

- [ ] **Step 6: Commit**

```
git add backend/vizql/cache.py backend/tests/test_vizql_cache_inprocess.py
git commit -m "feat(analyst-pro): LRU policy + InProcessLogicalQueryCache (Plan 7e T2)"
```

---

## Task 3 — `ExternalLogicalQueryCache` (Redis) with graceful degradation

**Files:**
- Modify: `backend/vizql/cache.py`
- Create: `backend/tests/test_vizql_cache_external.py`

**Why this design.** The in-process cache vanishes on worker restart; the external tier keeps results across deploys and across workers. `redis_client.get_redis()` already returns `None` when Redis is unreachable, with a 30 s TTL-based retry backoff — reuse that. Do **not** add a second retry loop in this module. Serialisation uses Python `pickle` protocol 5 exactly as specified by the Plan 7e task brief (Python-only consumer guarantee).

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_vizql_cache_external.py`:

```python
"""Plan 7e T3 — ExternalLogicalQueryCache (Redis + degradation)."""
from __future__ import annotations

import pickle
from unittest.mock import MagicMock, patch

import pytest

from vizql.cache import (
    AbstractQueryCacheKey,
    ExternalLogicalQueryCache,
    LRUQueryCachePolicy,
    OrderByKey,
)


def _key() -> AbstractQueryCacheKey:
    return AbstractQueryCacheKey(
        ds_id="ds1",
        relation_tree_hash="rel_1",
        predicate_hash="pred_1",
        projection=("a",),
        group_bys=(),
        order_by=(OrderByKey(column="a"),),
        agg_types=("SUM",),
        dialect="duckdb",
    )


def test_put_serialises_with_protocol5_and_sets_ttl():
    fake_redis = MagicMock()
    with patch("vizql.cache.get_redis", return_value=fake_redis):
        cache = ExternalLogicalQueryCache(
            policy=LRUQueryCachePolicy(max_bytes=1024 * 1024),
            ttl_seconds=3600,
        )
        cache.put(_key(), {"rows": [1, 2, 3]})

    assert fake_redis.setex.called
    redis_key, ttl, value = fake_redis.setex.call_args[0]
    assert redis_key.startswith("askdb:vizql:cache:")
    assert ttl == 3600
    assert pickle.loads(value) == {"rows": [1, 2, 3]}


def test_get_returns_deserialised_value():
    fake_redis = MagicMock()
    fake_redis.get.return_value = pickle.dumps({"rows": [1, 2]}, protocol=5)
    with patch("vizql.cache.get_redis", return_value=fake_redis):
        cache = ExternalLogicalQueryCache(
            policy=LRUQueryCachePolicy(max_bytes=1024 * 1024),
            ttl_seconds=3600,
        )
        assert cache.get(_key()) == {"rows": [1, 2]}


def test_get_returns_none_when_redis_down():
    with patch("vizql.cache.get_redis", return_value=None):
        cache = ExternalLogicalQueryCache(
            policy=LRUQueryCachePolicy(max_bytes=1024 * 1024),
            ttl_seconds=3600,
        )
        assert cache.get(_key()) is None


def test_put_is_noop_when_redis_down():
    with patch("vizql.cache.get_redis", return_value=None):
        cache = ExternalLogicalQueryCache(
            policy=LRUQueryCachePolicy(max_bytes=1024 * 1024),
            ttl_seconds=3600,
        )
        cache.put(_key(), {"rows": []})  # must not raise


def test_put_swallows_redis_errors():
    fake_redis = MagicMock()
    fake_redis.setex.side_effect = ConnectionError("redis down mid-flight")
    with patch("vizql.cache.get_redis", return_value=fake_redis):
        cache = ExternalLogicalQueryCache(
            policy=LRUQueryCachePolicy(max_bytes=1024 * 1024),
            ttl_seconds=3600,
        )
        cache.put(_key(), {"rows": []})  # must not raise


def test_invalidate_deletes_redis_key():
    fake_redis = MagicMock()
    with patch("vizql.cache.get_redis", return_value=fake_redis):
        cache = ExternalLogicalQueryCache(
            policy=LRUQueryCachePolicy(max_bytes=1024 * 1024),
            ttl_seconds=3600,
        )
        cache.invalidate(_key())
    assert fake_redis.delete.called


def test_redis_key_namespace_stable():
    k = _key()
    cache = ExternalLogicalQueryCache(
        policy=LRUQueryCachePolicy(max_bytes=1024 * 1024),
        ttl_seconds=3600,
    )
    rk = cache._redis_key(k)
    assert rk == f"askdb:vizql:cache:{k.ds_id}:{k.content_hash()}"
```

- [ ] **Step 2: Run test to verify it fails**

```
cd backend && python -m pytest tests/test_vizql_cache_external.py -v
```
Expected: `ImportError: cannot import name 'ExternalLogicalQueryCache' …`.

- [ ] **Step 3: Write minimal implementation**

Append to `backend/vizql/cache.py`:

```python
# ---------------------------------------------------------------------------
# Plan 7e T3 — ExternalLogicalQueryCache (Redis)
# ---------------------------------------------------------------------------

import pickle
import time

from redis_client import get_redis  # noqa: E402

_REDIS_WARN_INTERVAL_S = 30.0


class ExternalLogicalQueryCache:
    """Redis-backed logical-query cache.

    Graceful degradation rules
    --------------------------
    - If ``get_redis()`` returns ``None``, every op is a no-op / miss.
    - Any runtime Redis error is swallowed after logging. The upstream
      request path keeps running.
    - Warning log rate-limited to one per ``_REDIS_WARN_INTERVAL_S`` per
      instance to avoid log-spam storms during Redis outages.

    Serialisation is ``pickle.dumps(..., protocol=5)`` — Python-only consumer,
    as specified by the Plan 7e task brief. TTL enforced by ``SETEX``.
    """

    def __init__(
        self,
        policy: LRUQueryCachePolicy,
        ttl_seconds: int,
    ) -> None:
        self._policy = policy
        self._ttl = int(ttl_seconds)
        self._last_warn_ts = 0.0

    def _redis_key(self, key: AbstractQueryCacheKey) -> str:
        return f"askdb:vizql:cache:{key.ds_id}:{key.content_hash()}"

    def get(self, key: AbstractQueryCacheKey) -> Optional[Any]:
        client = get_redis()
        if client is None:
            self._warn_once("Redis unavailable — vizql external cache skipping GET")
            return None
        try:
            raw = client.get(self._redis_key(key))
            if raw is None:
                return None
            return pickle.loads(raw)
        except Exception as exc:
            self._warn_once(f"Redis GET failed: {exc}")
            return None

    def put(self, key: AbstractQueryCacheKey, value: Any, size_bytes: Optional[int] = None) -> None:
        client = get_redis()
        if client is None:
            self._warn_once("Redis unavailable — vizql external cache skipping PUT")
            return
        try:
            blob = pickle.dumps(value, protocol=5)
            if size_bytes is None:
                size_bytes = len(blob)
            if size_bytes > self._policy.max_bytes:
                logger.info(
                    "vizql external cache: skipping %d-byte value > budget %d",
                    size_bytes, self._policy.max_bytes,
                )
                return
            client.setex(self._redis_key(key), self._ttl, blob)
        except Exception as exc:
            self._warn_once(f"Redis PUT failed: {exc}")

    def invalidate(self, key: AbstractQueryCacheKey) -> bool:
        client = get_redis()
        if client is None:
            return False
        try:
            return bool(client.delete(self._redis_key(key)))
        except Exception as exc:
            self._warn_once(f"Redis DEL failed: {exc}")
            return False

    def _warn_once(self, msg: str) -> None:
        now = time.monotonic()
        if now - self._last_warn_ts < _REDIS_WARN_INTERVAL_S:
            return
        self._last_warn_ts = now
        logger.warning(msg)
```

- [ ] **Step 4: Run tests to verify they pass**

```
cd backend && python -m pytest tests/test_vizql_cache_external.py -v
```
Expected: 7 passed.

- [ ] **Step 5: Run Task 1 + Task 2 tests — regression guard**

```
cd backend && python -m pytest tests/test_vizql_cache_key.py tests/test_vizql_cache_inprocess.py -v
```
Expected: all still green.

- [ ] **Step 6: mypy strict**

```
cd backend && python -m mypy --strict vizql/cache.py
```
Expected: `Success`.

- [ ] **Step 7: Commit**

```
git add backend/vizql/cache.py backend/tests/test_vizql_cache_external.py
git commit -m "feat(analyst-pro): Redis-backed ExternalLogicalQueryCache with graceful degradation (Plan 7e T3)"
```

---

## Task 4 — `HistoryTrackingCache` wrapper + `QueryCategory` telemetry enum

**Files:**
- Modify: `backend/vizql/cache.py`
- Create: `backend/vizql/telemetry.py`
- Create: `backend/tests/test_vizql_cache_history.py`

**Why both in one task.** Both are pure additive wrappers with no waterfall coupling. Splitting would inflate task count without discipline benefit.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_vizql_cache_history.py`:

```python
"""Plan 7e T4 — HistoryTrackingCache + QueryCategory enum."""
from __future__ import annotations

import pytest

from vizql.cache import (
    AbstractQueryCacheKey,
    HistoryTrackingCache,
    InProcessLogicalQueryCache,
    InvalidationRecord,
    LRUQueryCachePolicy,
    OrderByKey,
)
from vizql.telemetry import QueryCategory


def _key(ds: str, i: int) -> AbstractQueryCacheKey:
    return AbstractQueryCacheKey(
        ds_id=ds, relation_tree_hash=f"rel_{i}", predicate_hash=f"pred_{i}",
        projection=("a",), group_bys=(), order_by=(OrderByKey(column="a"),),
        agg_types=("SUM",), dialect="duckdb",
    )


def test_get_and_put_pass_through():
    inner = InProcessLogicalQueryCache(LRUQueryCachePolicy(max_bytes=1024))
    c = HistoryTrackingCache(inner)
    k = _key("ds", 1)
    c.put(k, b"xxx", size_bytes=3)
    assert c.get(k) == b"xxx"


def test_invalidate_records_reason():
    inner = InProcessLogicalQueryCache(LRUQueryCachePolicy(max_bytes=1024))
    c = HistoryTrackingCache(inner)
    k = _key("ds_alpha", 1)
    c.put(k, b"x", size_bytes=1)
    c.invalidate(k, reason="param_change")
    history = c.get_invalidation_history("ds_alpha")
    assert len(history) == 1
    assert isinstance(history[0], InvalidationRecord)
    assert history[0].reason == "param_change"
    assert history[0].key_hash == k.content_hash()


def test_history_ring_buffer_caps_at_10k():
    inner = InProcessLogicalQueryCache(LRUQueryCachePolicy(max_bytes=10 * 1024 * 1024))
    c = HistoryTrackingCache(inner, history_max_per_ds=10_000)
    for i in range(10_500):
        k = _key("ds", i)
        c.put(k, b"x", size_bytes=1)
        c.invalidate(k, reason="ttl")
    history = c.get_invalidation_history("ds")
    assert len(history) == 10_000
    assert history[0].key_hash == _key("ds", 500).content_hash()


def test_rejects_unknown_reason():
    inner = InProcessLogicalQueryCache(LRUQueryCachePolicy(max_bytes=1024))
    c = HistoryTrackingCache(inner)
    with pytest.raises(ValueError):
        c.invalidate(_key("ds", 1), reason="nonsense_reason")


def test_query_category_enum_mirrors_tableau():
    """§IV.11 — QueryCategory telemetry enum parity."""
    names = {c.name for c in QueryCategory}
    assert {"MDX_SETUP", "MDX_VALIDATION", "NOW", "FILTER", "IMPERSONATE",
            "HYPER_STREAM"}.issubset(names)
```

- [ ] **Step 2: Run test to verify it fails**

```
cd backend && python -m pytest tests/test_vizql_cache_history.py -v
```
Expected: `ImportError: cannot import name 'HistoryTrackingCache' …`.

- [ ] **Step 3: Create `backend/vizql/telemetry.py`**

```python
"""Plan 7e — QueryCategory telemetry enum (Build_Tableau.md §IV.11)."""
from __future__ import annotations

from enum import Enum


class QueryCategory(str, Enum):
    """Tableau-parity query category (§IV.11)."""
    MDX_SETUP = "MDX_SETUP"
    MDX_VALIDATION = "MDX_VALIDATION"
    NOW = "NOW"
    FILTER = "FILTER"
    IMPERSONATE = "IMPERSONATE"
    HYPER_STREAM = "HYPER_STREAM"
```

- [ ] **Step 4: Append `HistoryTrackingCache` + `InvalidationRecord` to `backend/vizql/cache.py`**

```python
# ---------------------------------------------------------------------------
# Plan 7e T4 — HistoryTrackingCache
# ---------------------------------------------------------------------------

from collections import deque
from dataclasses import dataclass as _dataclass
from datetime import datetime, timezone

_VALID_INVALIDATION_REASONS = frozenset(
    {"param_change", "extract_refresh", "manual", "ttl", "schema_drift"}
)


@_dataclass(frozen=True)
class InvalidationRecord:
    """Why a cache entry was invalidated — for perf-debug UI."""
    timestamp: str
    ds_id: str
    key_hash: str
    reason: str


class HistoryTrackingCache:
    """Wraps an in-process or external cache, recording invalidation reasons.

    Ring-buffer per ds_id (FIFO eviction at ``history_max_per_ds``).
    """

    def __init__(
        self,
        inner: Any,
        history_max_per_ds: int = 10_000,
    ) -> None:
        self._inner = inner
        self._history_max = int(history_max_per_ds)
        self._history: Dict[str, "deque[InvalidationRecord]"] = {}
        self._lock = threading.RLock()

    def get(self, key: AbstractQueryCacheKey) -> Optional[Any]:
        return self._inner.get(key)

    def put(self, key: AbstractQueryCacheKey, value: Any, size_bytes: Optional[int] = None) -> None:
        self._inner.put(key, value, size_bytes)

    def invalidate(self, key: AbstractQueryCacheKey, reason: str) -> bool:
        if reason not in _VALID_INVALIDATION_REASONS:
            raise ValueError(
                f"invalid invalidation reason {reason!r}; allowed: "
                f"{sorted(_VALID_INVALIDATION_REASONS)}"
            )
        removed = self._inner.invalidate(key)
        record = InvalidationRecord(
            timestamp=datetime.now(timezone.utc).isoformat(),
            ds_id=key.ds_id,
            key_hash=key.content_hash(),
            reason=reason,
        )
        with self._lock:
            buf = self._history.get(key.ds_id)
            if buf is None:
                buf = deque(maxlen=self._history_max)
                self._history[key.ds_id] = buf
            buf.append(record)
        return removed

    def get_invalidation_history(self, ds_id: str) -> list[InvalidationRecord]:
        with self._lock:
            return list(self._history.get(ds_id, ()))

    def clear_history(self, ds_id: Optional[str] = None) -> None:
        with self._lock:
            if ds_id is None:
                self._history.clear()
            else:
                self._history.pop(ds_id, None)
```

- [ ] **Step 5: Run tests to verify they pass**

```
cd backend && python -m pytest tests/test_vizql_cache_history.py -v
```
Expected: 5 passed.

- [ ] **Step 6: mypy strict on both new modules**

```
cd backend && python -m mypy --strict vizql/cache.py vizql/telemetry.py
```
Expected: `Success: no issues found in 2 source files`.

- [ ] **Step 7: Commit**

```
git add backend/vizql/cache.py backend/vizql/telemetry.py backend/tests/test_vizql_cache_history.py
git commit -m "feat(analyst-pro): HistoryTrackingCache + QueryCategory telemetry (Plan 7e T4)"
```

---

## Task 5 — `QueryBatch` orchestrator (dashboard fan-in dedup)

**Files:**
- Create: `backend/vizql/batch.py`
- Create: `backend/tests/test_vizql_batch.py`

**Why.** Per §IV.10: a dashboard with 10 sheets dispatches 10 queries; the cache dedupes equivalent keys so only distinct uncached queries reach the engine. `QueryBatch` is AskDB's counterpart to `tabquerybatchproc`. It does **not** execute SQL directly — returns a `BatchResult` the router/agent uses to decide which queries still need compilation.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_vizql_batch.py`:

```python
"""Plan 7e T5 — QueryBatch dashboard dedup."""
from __future__ import annotations

from vizql.batch import BatchResult, QueryBatch
from vizql.cache import (
    AbstractQueryCacheKey,
    HistoryTrackingCache,
    InProcessLogicalQueryCache,
    LRUQueryCachePolicy,
    OrderByKey,
)


def _k(i: int) -> AbstractQueryCacheKey:
    return AbstractQueryCacheKey(
        ds_id="ds", relation_tree_hash=f"rel_{i}", predicate_hash=f"pred_{i}",
        projection=("a",), group_bys=(), order_by=(OrderByKey(column="a"),),
        agg_types=("SUM",), dialect="duckdb",
    )


def test_all_misses_all_unique():
    cache = HistoryTrackingCache(InProcessLogicalQueryCache(LRUQueryCachePolicy(1024)))
    keys = [_k(i) for i in range(5)]
    batch = QueryBatch(keys=keys, cache=cache)
    result = batch.check_cache()
    assert result.hits == {}
    assert len(result.misses) == 5
    assert len(result.distinct_misses()) == 5


def test_dedup_10_queries_3_unique():
    cache = HistoryTrackingCache(InProcessLogicalQueryCache(LRUQueryCachePolicy(1024)))
    keys = [_k(i % 3) for i in range(10)]
    batch = QueryBatch(keys=keys, cache=cache)
    result = batch.check_cache()
    assert len(result.distinct_misses()) == 3
    assert len(result.misses) == 10


def test_mixed_hits_and_misses():
    cache = HistoryTrackingCache(InProcessLogicalQueryCache(LRUQueryCachePolicy(1024)))
    cache.put(_k(0), b"cached_zero", size_bytes=11)
    cache.put(_k(1), b"cached_one", size_bytes=10)
    keys = [_k(0), _k(1), _k(2), _k(3)]
    result = QueryBatch(keys=keys, cache=cache).check_cache()
    assert set(result.hits.keys()) == {_k(0), _k(1)}
    assert len(result.distinct_misses()) == 2


def test_publish_stores_results():
    cache = HistoryTrackingCache(InProcessLogicalQueryCache(LRUQueryCachePolicy(1024)))
    batch = QueryBatch(keys=[_k(0), _k(1)], cache=cache)
    batch.check_cache()
    batch.publish({_k(0): b"z0", _k(1): b"z1"}, size_estimator=lambda v: len(v))
    assert cache.get(_k(0)) == b"z0"
    assert cache.get(_k(1)) == b"z1"
```

- [ ] **Step 2: Run test to verify it fails**

```
cd backend && python -m pytest tests/test_vizql_batch.py -v
```
Expected: `ImportError: cannot import name 'QueryBatch' …`.

- [ ] **Step 3: Implement `backend/vizql/batch.py`**

```python
"""Plan 7e — QueryBatch orchestration (Build_Tableau.md §IV.10)."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional

from vizql.cache import AbstractQueryCacheKey, HistoryTrackingCache


@dataclass
class BatchResult:
    """Outcome of a single cache probe across a batch."""
    hits: Dict[AbstractQueryCacheKey, Any] = field(default_factory=dict)
    misses: List[AbstractQueryCacheKey] = field(default_factory=list)

    def distinct_misses(self) -> List[AbstractQueryCacheKey]:
        """Unique miss keys in first-seen order."""
        seen: set[AbstractQueryCacheKey] = set()
        out: List[AbstractQueryCacheKey] = []
        for k in self.misses:
            if k not in seen:
                seen.add(k)
                out.append(k)
        return out


class QueryBatch:
    """Batch cache probe + publish for dashboard fan-in."""

    def __init__(
        self,
        keys: List[AbstractQueryCacheKey],
        cache: HistoryTrackingCache,
    ) -> None:
        self._keys = list(keys)
        self._cache = cache
        self._last: Optional[BatchResult] = None

    def check_cache(self) -> BatchResult:
        result = BatchResult()
        for k in self._keys:
            v = self._cache.get(k)
            if v is None:
                result.misses.append(k)
            else:
                result.hits[k] = v
        self._last = result
        return result

    def publish(
        self,
        results: Dict[AbstractQueryCacheKey, Any],
        size_estimator: Optional[Callable[[Any], int]] = None,
    ) -> None:
        for k, v in results.items():
            size = size_estimator(v) if size_estimator is not None else None
            self._cache.put(k, v, size_bytes=size)
```

- [ ] **Step 4: Run tests to verify they pass**

```
cd backend && python -m pytest tests/test_vizql_batch.py -v
```
Expected: 4 passed.

- [ ] **Step 5: mypy strict**

```
cd backend && python -m mypy --strict vizql/batch.py
```
Expected: `Success`.

- [ ] **Step 6: Commit**

```
git add backend/vizql/batch.py backend/tests/test_vizql_batch.py
git commit -m "feat(analyst-pro): QueryBatch dashboard fan-in dedup (Plan 7e T5)"
```

---

## Task 6 — Config + audit_trail events + `vizql/__init__.py` re-exports

**Files:**
- Modify: `backend/config.py`
- Modify: `backend/audit_trail.py`
- Modify: `backend/vizql/__init__.py`
- Modify: `backend/docs/claude/config-defaults.md`
- Create: `backend/tests/test_vizql_cache_audit.py`

**Why.** Task 7 cannot run without `settings.VIZQL_CACHE_ENABLED` etc. Audit events are required by the spec. Keep all non-tier wiring in one task.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_vizql_cache_audit.py`:

```python
"""Plan 7e T6 — audit_trail vizql cache events."""
from __future__ import annotations

import json

import pytest

from config import settings


def test_config_has_vizql_cache_settings():
    assert settings.VIZQL_CACHE_ENABLED is True
    assert settings.VIZQL_INPROCESS_CACHE_BYTES == 67_108_864
    assert settings.VIZQL_EXTERNAL_CACHE_BYTES == 536_870_912
    assert settings.VIZQL_CACHE_TTL_SECONDS == 3600
    assert settings.VIZQL_HISTORY_TRACKING_ENABLED is True


def test_audit_trail_log_vizql_cache_event(tmp_path, monkeypatch):
    from audit_trail import log_vizql_cache_event
    import audit_trail as _at
    monkeypatch.setattr(_at, "_LOG_DIR", tmp_path)

    log_vizql_cache_event(
        conn_id="conn_x",
        event_type="hit_inprocess",
        key_hash="deadbeef" * 4,
        tier="in_process",
        reason="exact match",
    )

    log_file = tmp_path / "query_decisions.jsonl"
    assert log_file.exists()
    entry = json.loads(log_file.read_text().strip().splitlines()[-1])
    assert entry["event_type"] == "hit_inprocess"
    assert entry["tier"] == "in_process"
    assert entry["key_hash"] == "deadbeef" * 4


def test_audit_trail_rejects_unknown_event_type(tmp_path, monkeypatch, caplog):
    from audit_trail import log_vizql_cache_event
    import audit_trail as _at
    monkeypatch.setattr(_at, "_LOG_DIR", tmp_path)

    with caplog.at_level("WARNING"):
        log_vizql_cache_event(
            conn_id="conn_x", event_type="nonsense",
            key_hash="x", tier="in_process", reason="",
        )
    assert any("unknown event_type" in r.message for r in caplog.records)


def test_log_vizql_batch_event(tmp_path, monkeypatch):
    from audit_trail import log_vizql_batch_event
    import audit_trail as _at
    monkeypatch.setattr(_at, "_LOG_DIR", tmp_path)

    log_vizql_batch_event(
        conn_id="conn_x",
        total=10,
        hits=7,
        misses=3,
        distinct_misses=2,
        total_ms=42.0,
    )
    entry = json.loads((tmp_path / "query_decisions.jsonl").read_text().strip().splitlines()[-1])
    assert entry["event_type"] == "vizql_batch"
    assert entry["hits"] == 7
    assert entry["distinct_misses"] == 2


def test_vizql_package_reexports():
    from vizql import (  # noqa: F401
        AbstractQueryCacheKey,
        ExternalLogicalQueryCache,
        HistoryTrackingCache,
        InProcessLogicalQueryCache,
        LRUQueryCachePolicy,
        QueryBatch,
        QueryCategory,
    )
```

- [ ] **Step 2: Run test to verify it fails**

```
cd backend && python -m pytest tests/test_vizql_cache_audit.py -v
```
Expected: missing settings, missing helpers, missing re-exports.

- [ ] **Step 3: Add settings to `backend/config.py`**

Locate the Query-Intelligence block (near `TURBO_MODE_ENABLED` ~line 160). Append **after** the existing `TURBO_TWIN_WARN_UNENCRYPTED` field:

```python
    # ---- VizQL query cache (Plan 7e, Build_Tableau §IV.10) -----------
    VIZQL_CACHE_ENABLED: bool = Field(default=True)
    VIZQL_INPROCESS_CACHE_BYTES: int = Field(default=67_108_864)     # 64 MiB
    VIZQL_EXTERNAL_CACHE_BYTES: int = Field(default=536_870_912)     # 512 MiB
    VIZQL_CACHE_TTL_SECONDS: int = Field(default=3600)
    VIZQL_HISTORY_TRACKING_ENABLED: bool = Field(default=True)
```

- [ ] **Step 4: Add audit helpers to `backend/audit_trail.py`**

Append after `log_tile_event`:

```python
# ---------------------------------------------------------------------------
# Plan 7e — VizQL cache + batch audit events
# ---------------------------------------------------------------------------

_VALID_VIZQL_CACHE_EVENT_TYPES = frozenset({
    "hit_inprocess",
    "hit_external",
    "miss",
    "compiled_stored",
    "evicted",
    "invalidated",
})

_VALID_VIZQL_CACHE_TIERS = frozenset({"in_process", "external", "both"})


def log_vizql_cache_event(
    conn_id: str,
    event_type: str,
    key_hash: str,
    tier: str,
    reason: str,
) -> None:
    """Record a VizQL cache hit/miss/invalidation."""
    if event_type not in _VALID_VIZQL_CACHE_EVENT_TYPES:
        logger.warning(
            "audit_trail.log_vizql_cache_event: unknown event_type %r — logging anyway",
            event_type,
        )
    if tier not in _VALID_VIZQL_CACHE_TIERS:
        logger.warning(
            "audit_trail.log_vizql_cache_event: unknown tier %r — logging anyway",
            tier,
        )
    entry = {
        "timestamp": _utc_now_iso(),
        "conn_id": conn_id,
        "event_type": event_type,
        "key_hash": key_hash,
        "tier": tier,
        "reason": reason,
    }
    _append_entry(entry)


def log_vizql_batch_event(
    conn_id: str,
    total: int,
    hits: int,
    misses: int,
    distinct_misses: int,
    total_ms: float,
) -> None:
    """Record a dashboard ``QueryBatch`` probe outcome."""
    entry = {
        "timestamp": _utc_now_iso(),
        "conn_id": conn_id,
        "event_type": "vizql_batch",
        "total": int(total),
        "hits": int(hits),
        "misses": int(misses),
        "distinct_misses": int(distinct_misses),
        "total_ms": float(total_ms),
    }
    _append_entry(entry)
```

- [ ] **Step 5: Update `backend/vizql/__init__.py`**

Append to the module (preserve existing imports + the existing `__all__` list; extend it):

```python
# Plan 7e — query cache + batch + telemetry
from .cache import (  # noqa: E402,F401
    AbstractQueryCacheKey,
    OrderByKey,
    LRUQueryCachePolicy,
    InProcessLogicalQueryCache,
    ExternalLogicalQueryCache,
    HistoryTrackingCache,
    InvalidationRecord,
)
from .batch import QueryBatch, BatchResult  # noqa: E402,F401
from .telemetry import QueryCategory  # noqa: E402,F401

__all__ += [
    # Plan 7e
    "AbstractQueryCacheKey", "OrderByKey",
    "LRUQueryCachePolicy", "InProcessLogicalQueryCache",
    "ExternalLogicalQueryCache", "HistoryTrackingCache", "InvalidationRecord",
    "QueryBatch", "BatchResult", "QueryCategory",
]
```

- [ ] **Step 6: Update `backend/docs/claude/config-defaults.md`**

In the "Query Intelligence" table, add five rows immediately below `WATERFALL_ANSWER_BUDGET_MS`:

```
| `VIZQL_CACHE_ENABLED` | `True` |
| `VIZQL_INPROCESS_CACHE_BYTES` | `67_108_864` (64 MiB) |
| `VIZQL_EXTERNAL_CACHE_BYTES` | `536_870_912` (512 MiB) |
| `VIZQL_CACHE_TTL_SECONDS` | `3600` (1 h) |
| `VIZQL_HISTORY_TRACKING_ENABLED` | `True` |
```

- [ ] **Step 7: Run Task 6 tests to verify they pass**

```
cd backend && python -m pytest tests/test_vizql_cache_audit.py -v
```
Expected: 5 passed.

- [ ] **Step 8: Full Plan-7e-so-far regression run**

```
cd backend && python -m pytest tests/test_vizql_cache_key.py tests/test_vizql_cache_inprocess.py tests/test_vizql_cache_external.py tests/test_vizql_cache_history.py tests/test_vizql_batch.py tests/test_vizql_cache_audit.py -v
```
Expected: all green (cumulative 35+ tests).

- [ ] **Step 9: Commit**

```
git add backend/config.py backend/audit_trail.py backend/vizql/__init__.py backend/docs/claude/config-defaults.md backend/tests/test_vizql_cache_audit.py
git commit -m "feat(analyst-pro): VIZQL_* config + audit_trail cache events + package re-exports (Plan 7e T6)"
```

---

## Task 7 — `VizQLTier` in `waterfall_router.py` (between Memory and Turbo)

**Files:**
- Modify: `backend/waterfall_router.py`
- Create: `backend/tests/test_waterfall_vizql_tier.py`

**Why this placement.** Tier order matters. A cache hit that short-circuits `TurboTier` saves the DuckDB query. A cache hit that short-circuits `LiveTier` saves the Anthropic round-trip. Placing VizQL at position 3 (Schema → Memory → **VizQL** → Turbo → Live) preserves:
- SchemaTier's ~7 ms structural answers (still fastest).
- MemoryTier's ChromaDB RAG (answers *similar* past questions — different from VizQL which answers *identical* plans).
- TurboTier remains a fallback execution-accelerator for queries that VizQL did not already cache.

**Context plumbing.** `WaterfallRouter.route()` currently accepts `question, schema_profile, conn_id` (+ optional `additional_filters`, `parameters`). `VisualSpec` is not one of those. Add a `set_context(ctx)` method on `VizQLTier`; the caller (agent layer / query_routes) injects context before calling `router.route(...)`. Public `route()` signature untouched.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_waterfall_vizql_tier.py`:

```python
"""Plan 7e T7 — VizQLTier integration with WaterfallRouter."""
from __future__ import annotations

import asyncio

import pytest

from waterfall_router import VizQLTier, WaterfallRouter
from vizql.cache import (
    AbstractQueryCacheKey,
    HistoryTrackingCache,
    InProcessLogicalQueryCache,
    LRUQueryCachePolicy,
    OrderByKey,
)


def _fake_schema_profile():
    from schema_intelligence import SchemaProfile
    return SchemaProfile(tables=[], schema_hash="sh_123", cache_age_minutes=0)


def _key() -> AbstractQueryCacheKey:
    return AbstractQueryCacheKey(
        ds_id="conn_a", relation_tree_hash="rel_1", predicate_hash="pred_1",
        projection=("amount",), group_bys=(), order_by=(OrderByKey(column="amount"),),
        agg_types=("SUM",), dialect="duckdb",
    )


def test_tier_ordering_vizql_between_memory_and_turbo():
    r = WaterfallRouter.default()
    names = [t.name for t in r._tiers]
    assert names.index("memory") < names.index("vizql") < names.index("turbo") < names.index("live")


def test_can_answer_false_without_vizql_context():
    tier = VizQLTier(
        cache=HistoryTrackingCache(InProcessLogicalQueryCache(LRUQueryCachePolicy(1024))),
    )
    assert asyncio.run(tier.can_answer("any question", _fake_schema_profile(), "conn_a")) is False


def test_can_answer_true_with_vizql_context():
    tier = VizQLTier(
        cache=HistoryTrackingCache(InProcessLogicalQueryCache(LRUQueryCachePolicy(1024))),
    )
    from waterfall_router import VizQLContext
    tier.set_context(VizQLContext(cache_key=_key(), qf=None, dialect="duckdb"))
    assert asyncio.run(tier.can_answer("any", _fake_schema_profile(), "conn_a")) is True


def test_cache_hit_short_circuits_tier_returning_immediately():
    cache = HistoryTrackingCache(InProcessLogicalQueryCache(LRUQueryCachePolicy(10 * 1024)))
    cache.put(_key(), {"rows": [[42]], "columns": ["total"]}, size_bytes=256)

    tier = VizQLTier(cache=cache)
    from waterfall_router import VizQLContext
    tier.set_context(VizQLContext(cache_key=_key(), qf=None, dialect="duckdb"))

    result = asyncio.run(tier.answer("q", _fake_schema_profile(), "conn_a"))
    assert result.hit is True
    assert result.tier_name == "vizql"
    assert result.data["source"] == "vizql_cache"
    assert result.data["rows"] == [[42]]


def test_cache_miss_returns_hit_false_for_waterfall_fallthrough():
    cache = HistoryTrackingCache(InProcessLogicalQueryCache(LRUQueryCachePolicy(1024)))
    tier = VizQLTier(cache=cache)
    from waterfall_router import VizQLContext
    tier.set_context(VizQLContext(cache_key=_key(), qf=None, dialect="duckdb"))

    result = asyncio.run(tier.answer("q", _fake_schema_profile(), "conn_a"))
    assert result.hit is False
    assert result.tier_name == "vizql"


def test_audit_logged_on_hit(tmp_path, monkeypatch):
    import audit_trail as _at
    monkeypatch.setattr(_at, "_LOG_DIR", tmp_path)

    cache = HistoryTrackingCache(InProcessLogicalQueryCache(LRUQueryCachePolicy(1024)))
    cache.put(_key(), {"rows": [], "columns": []}, size_bytes=8)
    tier = VizQLTier(cache=cache)
    from waterfall_router import VizQLContext
    tier.set_context(VizQLContext(cache_key=_key(), qf=None, dialect="duckdb"))
    asyncio.run(tier.answer("q", _fake_schema_profile(), "conn_a"))

    log = (tmp_path / "query_decisions.jsonl").read_text().strip().splitlines()
    assert any('"event_type": "hit_inprocess"' in ln for ln in log)


def test_vizql_disabled_flag_skips_tier(monkeypatch):
    from config import settings
    monkeypatch.setattr(settings, "VIZQL_CACHE_ENABLED", False)
    tier = VizQLTier(
        cache=HistoryTrackingCache(InProcessLogicalQueryCache(LRUQueryCachePolicy(1024))),
    )
    from waterfall_router import VizQLContext
    tier.set_context(VizQLContext(cache_key=_key(), qf=None, dialect="duckdb"))
    assert asyncio.run(tier.can_answer("q", _fake_schema_profile(), "conn_a")) is False
```

- [ ] **Step 2: Run test to verify it fails**

```
cd backend && python -m pytest tests/test_waterfall_vizql_tier.py -v
```
Expected: `ImportError: cannot import name 'VizQLTier' from 'waterfall_router'`.

- [ ] **Step 3: Add `VizQLContext` + `VizQLTier` to `backend/waterfall_router.py`**

Locate the `# LiveTier …` divider (~line 543). Insert this block **immediately above** it:

```python
# ---------------------------------------------------------------------------
# VizQLTier  (Plan 7e — 2-tier query cache between Memory and Turbo)
# ---------------------------------------------------------------------------

from dataclasses import dataclass as _vq_dataclass
from typing import Any as _VQAny

from vizql.cache import (
    AbstractQueryCacheKey,
    ExternalLogicalQueryCache,
    HistoryTrackingCache,
    InProcessLogicalQueryCache,
    LRUQueryCachePolicy,
)


@_vq_dataclass
class VizQLContext:
    """Per-request VizQL plumbing supplied by the agent layer.

    Populated when the user's input was compiled through the VisualSpec →
    LogicalPlan → SQL pipeline (Plans 7a–7d). Free-text NL questions leave
    ``cache_key`` as ``None`` and the tier is skipped.
    """
    cache_key: Optional[AbstractQueryCacheKey]
    qf: Optional[_VQAny]
    dialect: str


class VizQLTier(BaseTier):
    """Tier 3: Tableau-style 2-tier query cache.

    Returns a hit from either the in-process or the external (Redis) cache
    without executing SQL. On miss, returns ``hit=False`` so the router
    falls through to ``TurboTier`` / ``LiveTier``.
    """

    def __init__(
        self,
        cache: Optional[HistoryTrackingCache] = None,
        external: Optional[ExternalLogicalQueryCache] = None,
    ) -> None:
        from config import settings
        if cache is None:
            inproc = InProcessLogicalQueryCache(
                LRUQueryCachePolicy(max_bytes=settings.VIZQL_INPROCESS_CACHE_BYTES),
            )
            cache = HistoryTrackingCache(inproc)
        if external is None:
            external = ExternalLogicalQueryCache(
                policy=LRUQueryCachePolicy(max_bytes=settings.VIZQL_EXTERNAL_CACHE_BYTES),
                ttl_seconds=settings.VIZQL_CACHE_TTL_SECONDS,
            )
        self._cache = cache
        self._external = external
        self._ctx: Optional[VizQLContext] = None

    @property
    def name(self) -> str:
        return "vizql"

    def set_context(self, ctx: VizQLContext) -> None:
        self._ctx = ctx

    def clear_context(self) -> None:
        self._ctx = None

    async def can_answer(
        self,
        question: str,
        schema_profile: SchemaProfile,
        conn_id: str,
    ) -> bool:
        from config import settings
        if not settings.VIZQL_CACHE_ENABLED:
            return False
        if self._ctx is None or self._ctx.cache_key is None:
            return False
        return True

    async def _answer(
        self,
        question: str,
        schema_profile: SchemaProfile,
        conn_id: str,
    ) -> TierResult:
        from audit_trail import log_vizql_cache_event
        assert self._ctx is not None and self._ctx.cache_key is not None
        key = self._ctx.cache_key
        key_hash = key.content_hash()

        # --- Tier A: in-process ---------------------------------------------
        v = self._cache.get(key)
        if v is not None:
            log_vizql_cache_event(
                conn_id=conn_id,
                event_type="hit_inprocess",
                key_hash=key_hash,
                tier="in_process",
                reason="exact key match",
            )
            return _vizql_hit_result(v, key_hash, schema_profile.schema_hash,
                                    source="vizql_cache", age=0)

        # --- Tier B: external (Redis) ---------------------------------------
        v = self._external.get(key)
        if v is not None:
            self._cache.put(key, v)
            log_vizql_cache_event(
                conn_id=conn_id,
                event_type="hit_external",
                key_hash=key_hash,
                tier="external",
                reason="Redis hit, promoted to in-process",
            )
            return _vizql_hit_result(v, key_hash, schema_profile.schema_hash,
                                    source="vizql_cache_external", age=None)

        log_vizql_cache_event(
            conn_id=conn_id,
            event_type="miss",
            key_hash=key_hash,
            tier="both",
            reason="neither tier returned a value",
        )
        return TierResult(
            hit=False,
            tier_name="vizql",
            metadata={"tiers_checked": ["vizql"], "time_ms": 0,
                      "schema_hash": schema_profile.schema_hash,
                      "vizql_key_hash": key_hash},
        )

    def publish_result(
        self,
        key: AbstractQueryCacheKey,
        value: _VQAny,
        size_bytes: Optional[int] = None,
    ) -> None:
        """Called by TurboTier/LiveTier after successful exec."""
        self._cache.put(key, value, size_bytes=size_bytes)
        self._external.put(key, value, size_bytes=size_bytes)

    @property
    def cache(self) -> HistoryTrackingCache:
        return self._cache


def _vizql_hit_result(
    value: _VQAny,
    key_hash: str,
    schema_hash: str,
    source: str,
    age: Optional[int],
) -> TierResult:
    rows = value.get("rows", []) if isinstance(value, dict) else []
    columns = value.get("columns", []) if isinstance(value, dict) else []
    return TierResult(
        hit=True,
        tier_name="vizql",
        data={
            "answer": "VizQL cache hit",
            "confidence": 0.99,
            "source": source,
            "cache_age_seconds": age if age is not None else 0,
            "columns": columns,
            "rows": rows,
        },
        metadata={
            "tiers_checked": ["vizql"],
            "time_ms": 0,
            "schema_hash": schema_hash,
            "vizql_key_hash": key_hash,
        },
        cache_age_seconds=age,
        is_stale=False,
    )
```

- [ ] **Step 4: Wire `VizQLTier` into default `WaterfallRouter` construction**

Add `default()` classmethod inside `class WaterfallRouter` directly below `__init__`:

```python
    @classmethod
    def default(cls) -> "WaterfallRouter":
        """Canonical 5-tier construction (Plan 7e).

        Order: schema → memory → vizql → turbo → live.
        """
        return cls(tiers=[
            SchemaTier(),
            MemoryTier(),
            VizQLTier(),
            TurboTier(),
            LiveTier(),
        ])
```

Update the module-level default tier list (lines ~1208–1212 — the helper that constructs the canonical tier list for `WaterfallRouter`) so it reads:

```python
        SchemaTier(),
        MemoryTier(),
        VizQLTier(),
        TurboTier(),
        LiveTier(),
```

Update the Phase-map docstring at top-of-file (lines 8–13) to reflect the new tier:

```
  Phase 1  (shipped)  — SchemaTier   : structural/metadata questions
  Phase 2  (shipped)  — MemoryTier   : recent-query answer cache (ChromaDB RAG)
  Phase 3  (shipped)  — VizQLTier    : 2-tier LRU cache on VisualSpec plans
  Phase 4  (shipped)  — TurboTier    : pre-computed aggregate cache (DuckDB twin)
  Phase 5  (shipped)  — LiveTier     : full LLM + SQL execution
```

- [ ] **Step 5: Run tier tests**

```
cd backend && python -m pytest tests/test_waterfall_vizql_tier.py -v
```
Expected: 7 passed.

- [ ] **Step 6: Regression run — full waterfall tests**

```
cd backend && python -m pytest tests/ -k "waterfall or vizql" -v
```
Expected: all green. No pre-existing waterfall test regression.

- [ ] **Step 7: mypy strict on new code**

```
cd backend && python -m mypy --strict vizql/cache.py vizql/batch.py vizql/telemetry.py
```
Expected: `Success`.

- [ ] **Step 8: Commit**

```
git add backend/waterfall_router.py backend/tests/test_waterfall_vizql_tier.py
git commit -m "feat(analyst-pro): VizQLTier wedge between Memory and Turbo (Plan 7e T7)"
```

---

## Task 8 — Integration test + roadmap status + plan-complete sign-off

**Files:**
- Create: `backend/tests/test_vizql_cache_integration.py`
- Modify: `docs/analyst_pro_tableau_parity_roadmap.md`

**Why.** End-to-end integration proves: cache keys stable across process boundary (serialisation roundtrip), VizQL tier short-circuits Turbo, parameter change invalidates only the affected queries, 10→3 batch dedup works through the full pipeline.

- [ ] **Step 1: Write the integration test**

Create `backend/tests/test_vizql_cache_integration.py`:

```python
"""Plan 7e T8 — end-to-end VizQL cache integration."""
from __future__ import annotations

import asyncio
import pickle
from unittest.mock import patch

import pytest

from vizql.cache import (
    AbstractQueryCacheKey,
    HistoryTrackingCache,
    InProcessLogicalQueryCache,
    LRUQueryCachePolicy,
    OrderByKey,
)
from vizql.batch import QueryBatch
from waterfall_router import VizQLContext, VizQLTier


def _key(i: int, *, param_region: str = "EMEA") -> AbstractQueryCacheKey:
    return AbstractQueryCacheKey(
        ds_id="conn_a",
        relation_tree_hash=f"rel_{i}",
        predicate_hash=f"pred_{i}",
        projection=("amount",),
        group_bys=(),
        order_by=(OrderByKey(column="amount"),),
        agg_types=("SUM",),
        dialect="duckdb",
        parameter_snapshot=(("region", f'"{param_region}"'),),
    )


def test_roundtrip_inprocess_serialisation_preserves_key_identity():
    """Cache key must be serialisation-safe + hash stable across un/repickle."""
    k = _key(1)
    k2 = pickle.loads(pickle.dumps(k, protocol=5))
    assert k == k2
    assert k.content_hash() == k2.content_hash()


def test_parameter_change_invalidates_only_affected_query():
    """§XIX.1 #4 — param change must not invalidate sibling queries."""
    cache = HistoryTrackingCache(InProcessLogicalQueryCache(LRUQueryCachePolicy(4096)))
    cache.put(_key(1, param_region="EMEA"), b"emea_1", size_bytes=6)
    cache.put(_key(2, param_region="EMEA"), b"emea_2", size_bytes=6)
    cache.put(_key(1, param_region="AMER"), b"amer_1", size_bytes=6)

    new_key = _key(1, param_region="LATAM")
    assert cache.get(new_key) is None
    assert cache.get(_key(1, param_region="EMEA")) == b"emea_1"
    assert cache.get(_key(1, param_region="AMER")) == b"amer_1"

    cache.invalidate(_key(1, param_region="EMEA"), reason="param_change")
    assert cache.get(_key(1, param_region="EMEA")) is None
    assert cache.get(_key(2, param_region="EMEA")) == b"emea_2"


def test_dashboard_10_sheets_3_distinct_only_3_compile_jobs():
    """Dashboard with 10 sheets referencing 3 logical queries ⇒ 3 compile jobs."""
    cache = HistoryTrackingCache(InProcessLogicalQueryCache(LRUQueryCachePolicy(10_000)))
    keys = [_key(i % 3) for i in range(10)]
    batch = QueryBatch(keys=keys, cache=cache)
    result = batch.check_cache()
    assert len(result.distinct_misses()) == 3


def test_vizql_tier_hit_does_not_invoke_downstream():
    """If VizQL caches a value, TurboTier execute path is not reached."""
    cache = HistoryTrackingCache(InProcessLogicalQueryCache(LRUQueryCachePolicy(10_000)))
    cache.put(_key(1), {"rows": [[99]], "columns": ["x"]}, size_bytes=64)

    tier = VizQLTier(cache=cache)
    tier.set_context(VizQLContext(cache_key=_key(1), qf=None, dialect="duckdb"))

    from schema_intelligence import SchemaProfile
    schema = SchemaProfile(tables=[], schema_hash="sh", cache_age_minutes=0)

    result = asyncio.run(tier.answer("q", schema, "conn_a"))
    assert result.hit is True
    assert result.data["rows"] == [[99]]


def test_external_degraded_still_serves_inprocess_hits():
    """Redis down — in-process cache keeps working."""
    cache = HistoryTrackingCache(InProcessLogicalQueryCache(LRUQueryCachePolicy(1024)))
    cache.put(_key(1), {"rows": []}, size_bytes=16)

    with patch("vizql.cache.get_redis", return_value=None):
        tier = VizQLTier(cache=cache)
        tier.set_context(VizQLContext(cache_key=_key(1), qf=None, dialect="duckdb"))
        from schema_intelligence import SchemaProfile
        schema = SchemaProfile(tables=[], schema_hash="sh", cache_age_minutes=0)
        result = asyncio.run(tier.answer("q", schema, "conn_a"))

    assert result.hit is True
    assert result.data["source"] == "vizql_cache"
```

- [ ] **Step 2: Run — expect PASS**

```
cd backend && python -m pytest tests/test_vizql_cache_integration.py -v
```
Expected: 5 passed (no new implementation needed — Tasks 1–7 laid the groundwork).

- [ ] **Step 3: Full Plan-7e regression run**

```
cd backend && python -m pytest tests/ -k "vizql_cache or vizql_batch or waterfall_vizql" -v
```
Expected: 40+ tests green.

- [ ] **Step 4: Full backend pytest run — no pre-existing regression**

```
cd backend && python -m pytest tests/ -q
```
Expected: existing 516+ tests still green (may be 555+ now). Any red is a Plan-7e regression — fix before proceeding. Do **not** mark roadmap shipped while red.

- [ ] **Step 5: mypy strict on every new/modified Plan-7e module**

```
cd backend && python -m mypy --strict vizql/cache.py vizql/batch.py vizql/telemetry.py
```
Expected: `Success: no issues found in 3 source files`.

- [ ] **Step 6: Mark Plan 7e shipped in the roadmap**

Edit `docs/analyst_pro_tableau_parity_roadmap.md`. Replace the `**Task count target:** 8.` line at the end of the "Plan 7e — Query Cache 2-Tier + Integration" section with:

```markdown
**Task count target:** 8.

**Status:** ✅ Shipped — 2026-04-17. 8 tasks. New modules: `backend/vizql/cache.py`,
`backend/vizql/batch.py`, `backend/vizql/telemetry.py`. New tier wired:
`backend/waterfall_router.py :: VizQLTier` between MemoryTier and TurboTier.
Config surface: `VIZQL_CACHE_ENABLED`, `VIZQL_INPROCESS_CACHE_BYTES` (64 MiB),
`VIZQL_EXTERNAL_CACHE_BYTES` (512 MiB), `VIZQL_CACHE_TTL_SECONDS` (3600),
`VIZQL_HISTORY_TRACKING_ENABLED`. Audit events: `log_vizql_cache_event`,
`log_vizql_batch_event`. Redis-backed external tier degrades gracefully via
existing `redis_client.get_redis()`. Plan doc:
`docs/superpowers/plans/2026-04-17-analyst-pro-plan-7e-query-cache-integration.md`.
```

- [ ] **Step 7: Commit the plan-complete marker**

```
git add backend/tests/test_vizql_cache_integration.py docs/analyst_pro_tableau_parity_roadmap.md
git commit -m "feat(analyst-pro): integration tests + mark Plan 7e shipped (Plan 7e T8)"
```

---

## Self-Review Checklist

**Spec coverage:**
- Deliverable 1 (AbstractQueryCacheKey) → **T1** ✓
- Deliverable 2 (LRUQueryCachePolicy) → **T2** ✓
- Deliverable 3 (InProcessLogicalQueryCache) → **T2** ✓
- Deliverable 4 (ExternalLogicalQueryCache) → **T3** ✓
- Deliverable 5 (HistoryTrackingCache) → **T4** ✓
- Deliverable 6 (QueryBatch) → **T5** ✓
- Deliverable 7 (VizQLTier in waterfall) → **T7** ✓
- Deliverable 8 (QueryCategory telemetry) → **T4** ✓
- Deliverable 9 (5 `VIZQL_*` config keys) → **T6** ✓
- Deliverable 10 (tests) → **T1–T8** ✓
- Audit trail hit/miss events → **T6** (helpers) + **T7** (tier calls) ✓
- §XIX.1 anti-pattern #4 parameter invalidation → **T1** + **T8** ✓
- Appendix E.5 cache key composition → **T1** ✓
- §IV.11 QueryCategory enum → **T4** ✓
- Graceful Redis degradation → **T3** + **T8** ✓

**Placeholder scan:** no TBD / TODO / "add error handling" / "similar to Task N" placeholders. Every code step contains the exact code.

**Type consistency:**
- `AbstractQueryCacheKey` fields consistent T1 → T8.
- `OrderByKey(column=..., descending=...)` used consistently.
- `HistoryTrackingCache.invalidate(key, reason=str)` — `reason` required, validated T4.
- `VizQLContext(cache_key, qf, dialect)` — 3-field dataclass consistent T7 + T8.
- `log_vizql_cache_event(conn_id, event_type, key_hash, tier, reason)` — 5-arg signature consistent T6 + T7.

No gaps.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-17-analyst-pro-plan-7e-query-cache-integration.md`. Two execution options:

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, two-stage review between tasks, fast iteration. Best for this plan because tasks have well-defined boundaries and each produces its own green-pytest checkpoint.

**2. Inline Execution** — execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints.

Which approach?
