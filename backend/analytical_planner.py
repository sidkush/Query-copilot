"""Ring 8 — AnalyticalPlanner.

Compiles NL → deterministic SQL plan against the populated SemanticRegistry.
At most 3 CTEs per plan (PLANNER_MAX_CTE_COUNT). Registry miss → fallback=True
(caller runs pre-K free-form path).
"""
from __future__ import annotations

import json
import logging
import uuid
from dataclasses import dataclass, field, asdict
from typing import Optional


_logger = logging.getLogger(__name__)
_MAX_CTES = 3
_PLAN_MAX_TOKENS = 2048


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

    def plan(
        self,
        conn_id: str,
        nl: str,
        coverage_cards: list,
        *,
        tenant_id: str,
    ) -> AnalyticalPlan:
        """Emit an AnalyticalPlan. Returns fallback=True on registry miss.

        Wave 2 spike-fix (2026-04-26): tenant_id is now a required keyword arg.
        Previously the planner passed tenant_id="" to the cache, which Wave 2's
        cache hardening (plan_cache.py:65) rejects with ValueError — making
        cache effectively dead. Now the agent threads real tenant_id through
        and cache lookups can hit.
        """
        if not tenant_id:
            raise ValueError("tenant_id must be non-empty (Wave 2 contract)")
        # Phase L — plan cache first (short-circuits Sonnet call on hit).
        if self._cache is not None:
            try:
                hit = self._cache.lookup(conn_id=conn_id, tenant_id=tenant_id, nl=nl)
                if hit is not None:
                    return hit.plan
            except (ValueError, KeyError, json.JSONDecodeError) as exc:
                _logger.warning(
                    "plan_cache.lookup failed (%s): %s; proceeding without cache",
                    type(exc).__name__, exc,
                )
        try:
            candidates = self._registry.list_for_conn(conn_id)
        except (FileNotFoundError, json.JSONDecodeError, KeyError) as exc:
            _logger.warning(
                "registry.list_for_conn(%s) failed (%s): %s; planning without registry",
                conn_id, type(exc).__name__, exc,
            )
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
            # Wave 2 spike-fix: provider exposes complete(), not invoke().
            # Pre-fix planner called .invoke() (which doesn't exist on
            # ModelProvider/AnthropicProvider) → AttributeError → bare except
            # → fallback. Now uses the real provider API (Session 2 Option A).
            resp = self._provider.complete(
                model=self._provider.default_model,
                system=system,
                messages=[{"role": "user", "content": user_msg}],
                max_tokens=_PLAN_MAX_TOKENS,
            )
            content = resp.text
            parsed = json.loads(content)
        except (json.JSONDecodeError, KeyError, ValueError, AttributeError) as exc:
            # JSON parse / shape errors are recoverable (LLM returned bad output).
            # AttributeError caught explicitly so this surface (not the registry
            # one above) doesn't silently re-die if provider contract drifts —
            # the warning log will name the type so the dead-method bug
            # surfaces rather than vanishing into a generic Exception swallow.
            _logger.warning(
                "planner provider response unparseable (%s): %s; falling back",
                type(exc).__name__, exc,
            )
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
                self._cache.store(
                    conn_id=conn_id, tenant_id=tenant_id, nl=nl, plan=final_plan,
                )
            except (ValueError, KeyError, json.JSONDecodeError) as exc:
                _logger.warning(
                    "plan_cache.store failed (%s): %s",
                    type(exc).__name__, exc,
                )
        return final_plan
