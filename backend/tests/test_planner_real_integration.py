"""Regression test for the dead-planner bug discovered 2026-04-26.

Pre-fix: AnalyticalPlanner.plan() called self._registry.list_for_conn()
(method does NOT exist on SemanticRegistry) and self._provider.invoke()
(method does NOT exist on ModelProvider/AnthropicProvider). Both raised
AttributeError, both were silently swallowed by bare except blocks at
analytical_planner.py:73, 77, 109 — planner always returned fallback=True
without ever firing Sonnet.

This file uses REAL SemanticRegistry and a hand-rolled _StubProvider (no
MagicMock) specifically to catch this class of bug: production code calling
methods that don't exist on real classes, hidden by MagicMock auto-attribute
in the existing planner test fixtures.

Companion to MagicMock-truthy ticket (Wave 1) and dead-planner critical
ticket (Wave 2). DO NOT replace the stub with MagicMock — that defeats the
purpose of this test.
"""
from __future__ import annotations

import json
import tempfile
from datetime import datetime, timezone

from analytical_planner import AnalyticalPlanner
from semantic_registry import SemanticRegistry, Definition
from model_provider import ProviderResponse


class _StubProvider:
    """Real-class stub — no MagicMock, no auto-attribute hazard.

    Implements ONLY the method we expect the fixed planner to call
    (provider.complete per Session 2 Option A). Any call to a method this
    stub doesn't define raises AttributeError naturally instead of silently
    returning a MagicMock that satisfies whatever the caller asked for.
    """

    # Planner reads self._provider.default_model when building the complete() call,
    # so the stub must expose this attribute even though we only assert on .complete().
    default_model = "claude-sonnet-4-6-stub"

    def __init__(self, response_text: str):
        self._response_text = response_text
        self.calls: list[dict] = []

    def complete(self, *, model, system, messages, max_tokens, **kwargs):
        self.calls.append({
            "model": model,
            "system": system,
            "messages": messages,
            "max_tokens": max_tokens,
        })
        return ProviderResponse(
            text=self._response_text,
            usage={"input_tokens": 100, "output_tokens": 50},
            stop_reason="end_turn",
        )


def _seed_registry_with_one_definition(root) -> SemanticRegistry:
    """Use SemanticRegistry._save directly to seed without depending on
    list_for_conn or any other method whose existence we are about to test."""
    reg = SemanticRegistry(root=root)
    defn = Definition(
        name="eligible_free_rate",
        definition="Free_Meal_Count_K_12 / Enrollment_K_12",
        valid_from=datetime.now(timezone.utc),
        valid_until=None,
        owner="regression-test",
    )
    reg._save(conn_id="conn-A", entries=[defn])
    return reg


VALID_PLAN_JSON = json.dumps({
    "ctes": [
        {
            "name": "free_rate",
            "description": "compute eligible free rate per school",
            "sql": (
                "SELECT CDSCode, "
                "CAST(Free_Meal_Count_K_12 AS FLOAT) / Enrollment_K_12 AS rate "
                "FROM frpm"
            ),
        }
    ],
    "registry_hits": ["eligible_free_rate"],
})


def test_planner_fires_provider_when_registry_has_candidates():
    """REGRESSION: planner must invoke provider when registry has definitions.

    Pre-fix this test FAILS — provider.calls stays empty because the planner's
    list_for_conn AttributeError is silently swallowed and fallback returns
    without ever reaching the provider call.

    Post-fix this test PASSES — list_for_conn exists on SemanticRegistry,
    planner calls provider.complete() (not the non-existent .invoke()),
    bare except blocks removed so any future AttributeError raises loud.
    """
    with tempfile.TemporaryDirectory() as td:
        registry = _seed_registry_with_one_definition(td)
        provider = _StubProvider(VALID_PLAN_JSON)
        planner = AnalyticalPlanner(provider=provider, registry=registry)

        plan = planner.plan(
            conn_id="conn-A",
            nl="What is the eligible free rate per school?",
            coverage_cards=[],
            tenant_id="regression-test-tenant",
        )

        assert provider.calls, (
            "planner.plan() did NOT invoke provider — dead-planner bug present. "
            "Likely cause:\n"
            "  (1) SemanticRegistry.list_for_conn() missing → bare except at "
            "analytical_planner.py:77 returns fallback without calling provider, OR\n"
            "  (2) planner still calling provider.invoke() (which doesn't exist) "
            "instead of provider.complete()"
        )
        assert not plan.fallback, (
            f"plan returned fallback=True despite registry having 1 candidate "
            f"(plan_id={plan.plan_id}, ctes={len(plan.ctes)})"
        )
        assert plan.ctes, "plan has no CTEs despite provider returning a valid plan"
        assert plan.registry_hits == ["eligible_free_rate"], (
            f"registry_hits not propagated: {plan.registry_hits}"
        )


def test_planner_falls_back_when_registry_empty():
    """Sanity guard: planner returns fallback for empty registry.

    Passes both pre-fix and post-fix (both paths reach a fallback return when
    there are no candidates). Included as a precision check — only the dead-
    planner regression test above is allowed to fire on the actual bug.
    """
    with tempfile.TemporaryDirectory() as td:
        registry = SemanticRegistry(root=td)
        provider = _StubProvider(VALID_PLAN_JSON)
        planner = AnalyticalPlanner(provider=provider, registry=registry)

        plan = planner.plan(
            conn_id="conn-empty",
            nl="any question",
            coverage_cards=[],
            tenant_id="regression-test-tenant",
        )

        assert plan.fallback, "empty registry must yield fallback plan"
        assert not plan.ctes
        assert not provider.calls, (
            "provider should NOT be called when registry is empty — "
            "fallback path must short-circuit before any LLM call"
        )
