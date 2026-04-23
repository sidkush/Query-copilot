"""Phase G - depends_on DAG resolver.

Skills declare dependencies via frontmatter:

    depends_on:
      - other-skill-name

This module closes that DAG at retrieval time (so if RAG returns
`child` we also ship `parent`) and rejects cycles before they can
poison the cached skill corpus.

Pure, stateless, no ChromaDB or filesystem calls - it operates on the
already-parsed SkillLibrary output.
"""
from __future__ import annotations

import heapq
from collections import defaultdict
from typing import Iterable, Mapping

from skill_hit import SkillHit


class DependsOnCycleError(ValueError):
    """Raised when the depends_on DAG contains a cycle."""


class DependsOnResolver:
    def __init__(self, hits_by_name: Mapping[str, SkillHit]):
        self._hits = dict(hits_by_name)

    def topo_sort(self) -> list[str]:
        """Globally topo-sort every skill. Raises on cycle or missing dep."""
        return self._kahn(self._hits.keys())

    def closure(self, targets: Iterable[str]) -> list[str]:
        """Topo-sorted transitive closure rooted at `targets`.

        Raises KeyError if a target is unknown (callers should pre-filter).
        Raises DependsOnCycleError on a cycle in the closure subgraph.
        Raises ValueError on a missing transitive dep.
        """
        reachable: set[str] = set()
        stack = list(targets)
        while stack:
            n = stack.pop()
            if n not in self._hits:
                raise KeyError(f"unknown skill: {n}")
            if n in reachable:
                continue
            reachable.add(n)
            for dep in self._hits[n].depends_on:
                stack.append(dep)
        return self._kahn(reachable)

    def _kahn(self, subset: Iterable[str]) -> list[str]:
        subset = list(subset)
        subset_set = set(subset)
        indeg: dict[str, int] = defaultdict(int)
        edges: dict[str, list[str]] = defaultdict(list)

        for n in subset:
            indeg.setdefault(n, 0)
            hit = self._hits[n]
            for dep in hit.depends_on:
                if dep not in self._hits:
                    raise ValueError(f"skill {n!r} depends on unknown skill {dep!r}")
                if dep not in subset_set:
                    subset_set.add(dep)
                    indeg.setdefault(dep, 0)
                edges[dep].append(n)
                indeg[n] += 1

        ready: list[str] = [n for n in subset_set if indeg[n] == 0]
        heapq.heapify(ready)
        out: list[str] = []
        while ready:
            n = heapq.heappop(ready)
            out.append(n)
            for child in edges[n]:
                indeg[child] -= 1
                if indeg[child] == 0:
                    heapq.heappush(ready, child)

        if len(out) != len(subset_set):
            remaining = sorted(subset_set - set(out))
            raise DependsOnCycleError(f"cycle detected among: {remaining}")
        return out
