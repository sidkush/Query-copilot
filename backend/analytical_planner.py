"""Ring 8 — AnalyticalPlanner.

Compiles NL → deterministic SQL plan against the populated SemanticRegistry.
At most 3 CTEs per plan (PLANNER_MAX_CTE_COUNT). Registry miss → fallback=True
(caller runs pre-K free-form path).
"""
from __future__ import annotations

import json
import uuid
from dataclasses import dataclass, field, asdict
from typing import Optional


_MAX_CTES = 3


class PlannerFallback(RuntimeError):
    """Raised by planner internals when registry lookup fails — converted to fallback=True."""


@dataclass(frozen=True)
class PlanCTE:
    name: str
    description: str
    sql: str
    rowcount_hint: Optional[int] = None


@dataclass(frozen=True)
class AnalyticalPlan:
    plan_id: str
    ctes: list
    fallback: bool
    registry_hits: list = field(default_factory=list)

    def __post_init__(self):
        if len(self.ctes) > _MAX_CTES:
            raise ValueError(f"plan has {len(self.ctes)} CTEs; max {_MAX_CTES}")

    def to_dict(self) -> dict:
        return {
            "plan_id": self.plan_id,
            "ctes": [asdict(c) for c in self.ctes],
            "fallback": self.fallback,
            "registry_hits": list(self.registry_hits),
        }

    @classmethod
    def from_dict(cls, d: dict) -> "AnalyticalPlan":
        return cls(
            plan_id=d["plan_id"],
            ctes=[PlanCTE(**c) for c in d.get("ctes", [])],
            fallback=bool(d["fallback"]),
            registry_hits=list(d.get("registry_hits", [])),
        )


class AnalyticalPlanner:
    def __init__(self, provider, registry):
        self._provider = provider
        self._registry = registry
        self._cache = None

    def plan(self, conn_id: str, nl: str, coverage_cards: list) -> AnalyticalPlan:
        """Emit an AnalyticalPlan. Returns fallback=True on registry miss."""
        # Phase L — plan cache first (short-circuits Sonnet call on hit).
        if self._cache is not None:
            try:
                hit = self._cache.lookup(conn_id=conn_id, tenant_id="", nl=nl)
                if hit is not None:
                    return hit.plan
            except Exception:
                pass
        try:
            candidates = self._registry.list_for_conn(conn_id)
        except Exception:
            candidates = []
        if not candidates:
            return AnalyticalPlan(
                plan_id=str(uuid.uuid4()),
                ctes=[],
                fallback=True,
                registry_hits=[],
            )
        # Build Sonnet system prompt.
        system = (
            "You are an analytical SQL planner. Given a user NL question and a list "
            "of canonical metric/dimension definitions, emit a plan with AT MOST 3 CTEs "
            "that answer the question using the definitions. Return JSON ONLY matching: "
            '{"ctes": [{"name": str, "description": str, "sql": str}], "registry_hits": [str]}. '
            "Each CTE must be a pure SELECT. No CREATE/INSERT/UPDATE. "
            "If you cannot plan within 3 CTEs, return {\"ctes\": [], \"registry_hits\": []}."
        )
        user_msg = json.dumps({
            "nl": nl,
            "coverage_cards": [
                {"table": c.table_name, "rows": c.row_count} for c in (coverage_cards or [])
            ],
            "definitions": [
                v if isinstance(v := getattr(d, "name", None), str) else str(d)
                for d in candidates[:50]
            ],
        })
        try:
            resp = self._provider.invoke(system=system, user=user_msg)
            content = resp.get("content", "")
            parsed = json.loads(content)
        except Exception:
            return AnalyticalPlan(
                plan_id=str(uuid.uuid4()),
                ctes=[],
                fallback=True,
                registry_hits=[],
            )
        raw_ctes = parsed.get("ctes", [])
        if not raw_ctes or len(raw_ctes) > _MAX_CTES:
            return AnalyticalPlan(
                plan_id=str(uuid.uuid4()),
                ctes=[],
                fallback=True,
                registry_hits=[],
            )
        ctes = [
            PlanCTE(
                name=c["name"],
                description=c.get("description", ""),
                sql=c["sql"],
            )
            for c in raw_ctes
        ]
        final_plan = AnalyticalPlan(
            plan_id=str(uuid.uuid4()),
            ctes=ctes,
            fallback=False,
            registry_hits=list(parsed.get("registry_hits", [])),
        )
        # Phase L — write successful plan to cache.
        if self._cache is not None:
            try:
                self._cache.store(conn_id=conn_id, tenant_id="", nl=nl, plan=final_plan)
            except Exception:
                pass
        return final_plan
