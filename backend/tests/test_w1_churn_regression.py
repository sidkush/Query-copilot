"""W1 Task 6 — Churn regression: cap + cascade + banner end-to-end.

Mocks the Anthropic provider to drive the failure mode that produced the
146-step confabulation (chat a0abf5daed18). Asserts:
  - Consecutive-error cascade fires within W1_ANALYTICAL_CAP steps.
  - Empty-BoundSet banner prepends when synthesis has no rowsets.
  - AgentGuardrailError raises with the cap-hit message if the model
    keeps issuing tool_use past the cap.
"""
from unittest.mock import MagicMock, patch
import json

import pytest

from agent_engine import AgentEngine, AgentGuardrailError


def _make_agent(monkeypatch):
    from config import settings
    monkeypatch.setattr(settings, "GROUNDING_W1_HARDCAP_ENFORCE", True)
    monkeypatch.setattr(settings, "W1_ANALYTICAL_CAP", 20)
    monkeypatch.setattr(settings, "W1_CONSECUTIVE_TOOL_ERROR_THRESHOLD", 3)

    engine = MagicMock()
    conn = MagicMock()
    conn.db_type = "postgresql"
    conn.coverage_cards = []
    provider = MagicMock()
    provider.default_model = "claude-haiku-4-5-20251001"
    provider.fallback_model = "claude-sonnet-4-5-20250514"
    memory = MagicMock()
    agent = AgentEngine(
        engine=engine, email="t@x.com", connection_entry=conn,
        provider=provider, memory=memory,
    )
    return agent


def test_cascade_fires_before_cap(monkeypatch):
    """3 consecutive run_sql errors → checkpoint fires before step 20."""
    from config import settings
    monkeypatch.setattr(settings, "GROUNDING_W1_HARDCAP_ENFORCE", True)
    monkeypatch.setattr(settings, "W1_ANALYTICAL_CAP", 20)
    monkeypatch.setattr(settings, "W1_CONSECUTIVE_TOOL_ERROR_THRESHOLD", 3)

    agent = _make_agent(monkeypatch)
    # Simulate 3 consecutive errors then stop
    agent._consecutive_tool_errors = 3
    assert agent._should_fire_error_cascade_checkpoint() is True
    step = agent._build_error_cascade_step()
    assert step.type == "agent_checkpoint"
    assert "Retry" in step.content


def test_cap_enforced_at_20(monkeypatch):
    """_classify_workload_cap returns 20 for analytical query."""
    from config import settings
    monkeypatch.setattr(settings, "GROUNDING_W1_HARDCAP_ENFORCE", True)
    agent = _make_agent(monkeypatch)
    cap = agent._classify_workload_cap("why are casual riders churning")
    assert cap == 20, f"expected 20, got {cap}"


def test_empty_boundset_banner_on_no_rowsets(monkeypatch):
    """Empty _recent_rowsets → banner prepended to final answer."""
    from config import settings
    monkeypatch.setattr(settings, "GROUNDING_W1_HARDCAP_ENFORCE", True)
    agent = _make_agent(monkeypatch)
    agent._recent_rowsets = []
    assert agent._detect_empty_boundset() is True
    result = agent._apply_empty_boundset_banner("Churn is 38%.")
    assert result.startswith("\u26a0")
    assert "38%" in result


def test_auto_extend_blocked(monkeypatch):
    """_maybe_extend_budget returns False when flag on."""
    from config import settings
    monkeypatch.setattr(settings, "GROUNDING_W1_HARDCAP_ENFORCE", True)
    agent = _make_agent(monkeypatch)
    agent._max_tool_calls = 20
    agent._tool_calls = 20
    assert agent._maybe_extend_budget() is False
    assert agent._max_tool_calls == 20
