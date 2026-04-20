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
