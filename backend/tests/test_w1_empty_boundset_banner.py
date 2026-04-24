"""W1 Task 4 — empty-BoundSet banner prepend at synthesis emit."""
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


def test_empty_when_no_rowsets(monkeypatch):
    from config import settings
    monkeypatch.setattr(settings, "GROUNDING_W1_HARDCAP_ENFORCE", True)
    agent = _make_agent()
    agent._recent_rowsets = []
    assert agent._detect_empty_boundset() is True


def test_empty_when_all_rowsets_zero_rows(monkeypatch):
    from config import settings
    monkeypatch.setattr(settings, "GROUNDING_W1_HARDCAP_ENFORCE", True)
    agent = _make_agent()
    agent._recent_rowsets = [{"query_id": "q1", "rows": []}, {"query_id": "q2", "rows": []}]
    assert agent._detect_empty_boundset() is True


def test_not_empty_when_any_rowset_has_rows(monkeypatch):
    from config import settings
    monkeypatch.setattr(settings, "GROUNDING_W1_HARDCAP_ENFORCE", True)
    agent = _make_agent()
    agent._recent_rowsets = [{"query_id": "q1", "rows": []}, {"query_id": "q2", "rows": [[38]]}]
    assert agent._detect_empty_boundset() is False


def test_detect_returns_false_when_flag_off(monkeypatch):
    from config import settings
    monkeypatch.setattr(settings, "GROUNDING_W1_HARDCAP_ENFORCE", False)
    agent = _make_agent()
    agent._recent_rowsets = []
    assert agent._detect_empty_boundset() is False


def test_apply_banner_prepends_marker():
    agent = _make_agent()
    text = "Churn is approximately 38% based on adoption patterns."
    banner_text = agent._apply_empty_boundset_banner(text)
    assert banner_text.startswith("\u26a0 No query results \u2014 this response is unverified.")
    assert text in banner_text


def test_apply_banner_idempotent():
    agent = _make_agent()
    text = "Already has \u26a0 No query results \u2014 this response is unverified. leading banner"
    result = agent._apply_empty_boundset_banner(text)
    assert result.count("\u26a0 No query results") == 1
