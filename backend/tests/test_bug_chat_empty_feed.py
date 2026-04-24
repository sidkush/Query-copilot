"""Regression guard: agent.run() must emit at least one step whose `type`
matches the frontend STEP_TYPES set so the Chat feed is never empty while
`status=='done'`.

User symptom: "Chat not working. Not even the thinking process is visible now."
Screenshot showed `REASONING · COMPLETE` badge with zero-step pill hidden.
That state happens when `markStepsDone()` fires without any prior `pushStep()`,
i.e. none of the backend-yielded events had a `type` in STEP_TYPES.

This test exercises the happy path (no tier hit, one-turn Claude reply) and
verifies the generator yields events the frontend can actually render.
"""
from __future__ import annotations

from unittest.mock import MagicMock

import pytest

# MUST stay in lockstep with frontend/src/pages/Chat.jsx :: STEP_TYPES
FRONTEND_STEP_TYPES = {
    "thinking", "tool_call", "tool_result", "tier_routing", "tier_hit",
    "plan", "progress", "cached_result", "live_correction",
    "budget_extension", "ask_user",
}


def _make_engine(provider):
    from agent_engine import AgentEngine, SessionMemory

    engine = MagicMock()
    conn = MagicMock()
    conn.db_type = "postgresql"
    conn.engine = MagicMock()
    conn.engine.db = MagicMock()
    conn.engine.db.get_schema_info = MagicMock(return_value={})
    # No schema_profile → waterfall_router branch skipped → reach agent loop.
    conn.schema_profile = None
    conn.conn_id = "c1"
    memory = SessionMemory(chat_id="test-chat", owner_email="t@x.com")
    return AgentEngine(
        engine=engine,
        email="t@x.com",
        connection_entry=conn,
        provider=provider,
        memory=memory,
        waterfall_router=None,
    )


def _text_only_response():
    """Build a ProviderToolResponse that ends the agent loop after one turn."""
    from model_provider import ContentBlock, ProviderToolResponse
    return ProviderToolResponse(
        content_blocks=[ContentBlock(type="text", text="Total is 42.")],
        stop_reason="end_turn",
        usage={"input_tokens": 10, "output_tokens": 5},
    )


def test_agent_run_yields_at_least_one_frontend_visible_step():
    """The feed must never render 'Reasoning · Complete' with zero steps."""
    provider = MagicMock()
    provider.default_model = "claude-haiku-4-5-20251001"
    provider.fallback_model = "claude-sonnet-4-5-20250514"
    provider.complete_with_tools = MagicMock(return_value=_text_only_response())

    agent = _make_engine(provider)

    emitted = list(agent.run("how many rows in trips"))
    types = [getattr(s, "type", type(s).__name__) for s in emitted]
    print(f"\nDEBUG emitted types: {types}")

    visible = [
        s for s in emitted
        if hasattr(s, "type") and s.type in FRONTEND_STEP_TYPES
    ]
    assert visible, (
        "Frontend would render an empty feed: no yielded step had a type in "
        f"STEP_TYPES. Emitted types: {types}"
    )


def test_agent_run_tier_hit_via_route_sync_yields_visible_step(monkeypatch):
    """When waterfall.route_sync hits a tier (turbo/schema/memory), the agent
    returns early. It must still emit a step the frontend can push to the
    feed, otherwise the feed renders empty with only a `Reasoning · Complete`
    badge and the user sees no reasoning trail.

    This exercises the DUAL_RESPONSE_ENABLED=False branch at
    agent_engine.py:2039-2073.
    """
    from config import settings as _cfg
    monkeypatch.setattr(_cfg, "DUAL_RESPONSE_ENABLED", False)

    provider = MagicMock()
    provider.default_model = "claude-haiku-4-5-20251001"
    provider.fallback_model = "claude-sonnet-4-5-20250514"
    # Provider shouldn't even be called if tier hits.
    provider.complete_with_tools = MagicMock(side_effect=AssertionError("tier hit — provider must not be called"))

    # Agent needs a schema_profile truthy to enter the waterfall_router block.
    from agent_engine import AgentEngine, SessionMemory
    engine = MagicMock()
    conn = MagicMock()
    conn.db_type = "postgresql"
    conn.engine = MagicMock()
    conn.engine.db = MagicMock()
    conn.engine.db.get_schema_info = MagicMock(return_value={})
    conn.schema_profile = {"tables": ["trips"]}  # truthy → enters tier check
    conn.conn_id = "c1"

    # Fake waterfall_router — tier hits with a synthesized answer.
    router = MagicMock()
    tier_result = MagicMock()
    tier_result.hit = True
    tier_result.tier_name = "memory"
    tier_result.data = {"answer": "42 trips", "row_count": 42}
    tier_result.metadata = {"time_ms": 10, "tiers_checked": ["schema", "memory"]}
    router.route_sync = MagicMock(return_value=tier_result)

    memory = SessionMemory(chat_id="test-chat", owner_email="t@x.com")
    agent = AgentEngine(
        engine=engine, email="t@x.com", connection_entry=conn,
        provider=provider, memory=memory, waterfall_router=router,
    )

    emitted = list(agent.run("how many trips"))
    types = [getattr(s, "type", type(s).__name__) for s in emitted]
    print(f"\nDEBUG tier-hit emitted types: {types}")

    visible = [
        s for s in emitted
        if hasattr(s, "type") and s.type in FRONTEND_STEP_TYPES
    ]
    assert visible, (
        "Tier hit produced no frontend-visible step. Feed would render empty. "
        f"Emitted: {types}"
    )


def test_agent_result_to_dict_exposes_dispatch_field():
    """Sentinel dict sent as the final SSE event must give the frontend a
    handler to latch onto, otherwise the feed times out empty.

    Chat.jsx latches on one of:
      step.type == "error"
      step.type == "cached_result" and step.content
      step.type == "live_correction"
      step.type == "result"
      step.final_answer or step.sql
    """
    from agent_engine import AgentResult

    # Empty run — no final_answer, no sql, no error
    empty = AgentResult().to_dict()
    has_dispatch = (
        empty.get("type") in {"error", "cached_result", "live_correction", "result"}
        or bool(empty.get("final_answer"))
        or bool(empty.get("sql"))
    )
    assert has_dispatch, (
        "AgentResult.to_dict() would not trigger any frontend step/resolve "
        f"branch — Chat feed stays empty until 35s timeout. Dict was: {empty}"
    )


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
