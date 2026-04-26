"""W1 Task 2 — Hard cap 20/40 replaces heuristic + kills auto-extend."""
from unittest.mock import MagicMock

import pytest

from agent_engine import AgentEngine


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


def test_analytical_cap_is_20_when_flag_on(monkeypatch):
    from config import settings
    monkeypatch.setattr(settings, "GROUNDING_W1_HARDCAP_ENFORCE", True)
    agent = _make_agent()
    cap = agent._classify_workload_cap("why did orders drop last quarter")
    assert cap == 20


def test_dashboard_cap_is_40_when_flag_on(monkeypatch):
    from config import settings
    monkeypatch.setattr(settings, "GROUNDING_W1_HARDCAP_ENFORCE", True)
    agent = _make_agent()
    cap = agent._classify_workload_cap("build a dashboard with 5 tiles for sales")
    assert cap == 40


def test_legacy_heuristic_when_flag_off(monkeypatch):
    from config import settings
    monkeypatch.setattr(settings, "GROUNDING_W1_HARDCAP_ENFORCE", False)
    agent = _make_agent()
    cap = agent._classify_workload_cap("why did orders drop last quarter")
    assert cap in (8, 15, 20)


def test_auto_extend_noop_when_flag_on(monkeypatch):
    from config import settings
    monkeypatch.setattr(settings, "GROUNDING_W1_HARDCAP_ENFORCE", True)
    agent = _make_agent()
    agent._max_tool_calls = 20
    agent._tool_calls = 20
    extended = agent._maybe_extend_budget()
    assert extended is False
    assert agent._max_tool_calls == 20


def test_auto_extend_fires_when_flag_off(monkeypatch):
    from config import settings
    monkeypatch.setattr(settings, "GROUNDING_W1_HARDCAP_ENFORCE", False)
    agent = _make_agent()
    agent._max_tool_calls = 20
    agent._tool_calls = 20
    extended = agent._maybe_extend_budget()
    assert extended is True
    assert agent._max_tool_calls == 30
