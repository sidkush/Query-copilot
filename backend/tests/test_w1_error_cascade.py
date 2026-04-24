"""W1 Task 3 — consecutive-tool-error counter + checkpoint emission."""
import json
from unittest.mock import MagicMock

import pytest

from agent_engine import AgentEngine, AgentStep


def _make_agent():
    engine = MagicMock()
    conn = MagicMock()
    conn.db_type = "postgresql"
    conn.coverage_cards = []
    provider = MagicMock()
    provider.default_model = "claude-haiku-4-5-20251001"
    provider.fallback_model = "claude-sonnet-4-5-20250514"
    memory = MagicMock()
    return AgentEngine(
        engine=engine, email="t@x.com", connection_entry=conn,
        provider=provider, memory=memory,
    )


def test_counter_initialises_to_zero():
    agent = _make_agent()
    assert agent._consecutive_tool_errors == 0


def test_counter_increments_on_error_result():
    agent = _make_agent()
    agent._update_error_cascade_counter(json.dumps({"error": "boom"}))
    assert agent._consecutive_tool_errors == 1
    agent._update_error_cascade_counter(json.dumps({"error": "boom"}))
    assert agent._consecutive_tool_errors == 2


def test_counter_resets_on_success():
    agent = _make_agent()
    agent._consecutive_tool_errors = 2
    agent._update_error_cascade_counter(json.dumps({"columns": ["x"], "rows": [[1]]}))
    assert agent._consecutive_tool_errors == 0


def test_counter_handles_non_json_payload():
    agent = _make_agent()
    agent._consecutive_tool_errors = 1
    agent._update_error_cascade_counter("not-json")
    assert agent._consecutive_tool_errors == 1


def test_checkpoint_triggered_at_threshold(monkeypatch):
    from config import settings
    monkeypatch.setattr(settings, "GROUNDING_W1_HARDCAP_ENFORCE", True)
    monkeypatch.setattr(settings, "W1_CONSECUTIVE_TOOL_ERROR_THRESHOLD", 3)
    agent = _make_agent()
    for _ in range(3):
        agent._update_error_cascade_counter(json.dumps({"error": "boom"}))
    assert agent._should_fire_error_cascade_checkpoint() is True


def test_checkpoint_not_triggered_when_flag_off(monkeypatch):
    from config import settings
    monkeypatch.setattr(settings, "GROUNDING_W1_HARDCAP_ENFORCE", False)
    agent = _make_agent()
    for _ in range(5):
        agent._update_error_cascade_counter(json.dumps({"error": "boom"}))
    assert agent._should_fire_error_cascade_checkpoint() is False


def test_build_checkpoint_payload():
    agent = _make_agent()
    agent._consecutive_tool_errors = 3
    step = agent._build_error_cascade_step()
    assert step.type == "agent_checkpoint"
    assert "Retry" in step.content
    assert "Change approach" in step.content
    assert "Summarize with what I have" in step.content
