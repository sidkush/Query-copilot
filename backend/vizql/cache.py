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
        length when available. Uses pickle only to measure serialized size
        of in-process cache entries — nothing is ever unpickled.
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
