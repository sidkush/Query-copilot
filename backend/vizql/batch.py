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
