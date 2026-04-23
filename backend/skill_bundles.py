"""Phase G - skill bundles.

A bundle is a named set of skills that always ship together. Bundles
fire when:
  (a) the user question contains any of the bundle's trigger keywords
      (case-insensitive substring match), OR
  (b) RAG already returned at least one bundle member (co-retrieval
      amplifier - if you got one you probably need the others).

Bundles are purely additive: `resolve_bundles` returns NEW SkillHits
beyond what RAG already produced. Deduplication against `existing` is
caller-side (here, for clarity). The router later passes everything
through `depends_on` closure + cap enforcement.

Priority semantics: priority=1 is best, 3 is worst. `priority_ceiling`
is the WORST priority value a bundle-sourced hit is allowed to have.
Effective priority = min(src.priority, bundle.priority_ceiling) so a
low-priority source skill (pri=3) gets promoted up to the ceiling
(pri=2), while an already-better skill (pri=1) is left untouched.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Mapping

from skill_hit import SkillHit


@dataclass(frozen=True)
class Bundle:
    name: str
    skills: tuple[str, ...]
    trigger_keywords: tuple[str, ...] = ()
    priority_ceiling: int = 2


BUNDLES: tuple[Bundle, ...] = (
    Bundle(
        name="dashboard-build",
        skills=(
            "dashboard-build-protocol",
            "multi-step-planning",
            "session-memory-protocol",
        ),
        trigger_keywords=("dashboard", "dashboards", "tile", "widget"),
        priority_ceiling=2,
    ),
    Bundle(
        name="sql-calculation",
        skills=(
            "calculation-patterns",
            "aggregation-rules",
            "null-handling",
        ),
        trigger_keywords=("sum", "avg", "average", "count", "total", "percentage", "ratio"),
        priority_ceiling=2,
    ),
    Bundle(
        name="chart-styling",
        skills=(
            "chart-formatting",
            "chart-selection",
            "color-system",
        ),
        trigger_keywords=("chart", "color", "palette", "legend", "axis"),
        priority_ceiling=2,
    ),
    Bundle(
        name="join-reasoning",
        skills=(
            "join-intelligence",
            "schema-linking-evidence",
            "schema-profiling",
        ),
        trigger_keywords=("join", "joined", "joining", "foreign key", "fk"),
        priority_ceiling=2,
    ),
)


def resolve_bundles(
    question: str,
    existing: list[SkillHit],
    library_by_name: Mapping[str, SkillHit],
    bundles: Iterable[Bundle] = BUNDLES,
) -> list[SkillHit]:
    """Return NEW hits (not already in `existing`) pulled in by bundles."""
    q_lower = question.lower()
    existing_names = {h.name for h in existing}
    added: list[SkillHit] = []
    added_names: set[str] = set()

    for bundle in bundles:
        fires = False
        if q_lower:
            for kw in bundle.trigger_keywords:
                if kw in q_lower:
                    fires = True
                    break
        if not fires:
            if any(name in existing_names for name in bundle.skills):
                fires = True
        if not fires:
            continue

        for name in bundle.skills:
            if name in existing_names or name in added_names:
                continue
            src = library_by_name.get(name)
            if src is None:
                continue
            effective_priority = min(src.priority, bundle.priority_ceiling)
            added.append(SkillHit(
                name=src.name,
                priority=effective_priority,
                tokens=src.tokens,
                source="bundle",
                content=src.content,
                path=src.path,
                embedder_version=src.embedder_version,
                depends_on=src.depends_on,
            ))
            added_names.add(name)

    return added
