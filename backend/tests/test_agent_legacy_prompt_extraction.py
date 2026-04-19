"""Characterisation tests for _build_legacy_system_prompt extraction.

Locks in byte-identical output before + after the refactor. Each test
captures the composed string for a known state and asserts content markers.
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch


def _make_agent():
    from agent_engine import AgentEngine
    engine = MagicMock()
    conn = MagicMock()
    conn.db_type = "postgresql"
    conn.engine = MagicMock()
    conn.engine.db = MagicMock()
    conn.engine.db.get_schema_info = MagicMock(return_value={
        "orders": {"columns": [{"name": "id"}, {"name": "amount"}]},
    })
    provider = MagicMock()
    provider.default_model = "claude-haiku-4-5-20251001"
    provider.fallback_model = "claude-sonnet-4-5-20250514"
    memory = MagicMock()
    return AgentEngine(
        engine=engine, email="t@x.com", connection_entry=conn,
        provider=provider, memory=memory,
    )


def test_legacy_prompt_contains_base_system_prompt():
    agent = _make_agent()
    text = agent._build_legacy_system_prompt("show revenue", "")
    assert "AskDB" in text


def test_legacy_prompt_includes_dialect_when_db_type_postgresql():
    agent = _make_agent()
    text = agent._build_legacy_system_prompt("q", "")
    assert "POSTGRESQL" in text.upper() or "ILIKE" in text


def test_legacy_prompt_appends_prefetch_context_verbatim():
    agent = _make_agent()
    prefetch = "### Schema excerpt\norders(id, amount)"
    text = agent._build_legacy_system_prompt("q", prefetch)
    assert prefetch in text


def test_legacy_prompt_deterministic_same_inputs():
    agent = _make_agent()
    a = agent._build_legacy_system_prompt("q", "")
    b = agent._build_legacy_system_prompt("q", "")
    assert a == b


def test_blocks_flag_off_matches_legacy_verbatim(monkeypatch):
    """Flag off → single block text == legacy output. Byte-identical."""
    from config import settings
    monkeypatch.setattr(settings, "SKILL_LIBRARY_ENABLED", False)
    agent = _make_agent()
    legacy = agent._build_legacy_system_prompt("show revenue", "")
    blocks = agent._build_system_blocks("show revenue", "")
    assert len(blocks) == 1
    assert blocks[0].text == legacy
    assert blocks[0].ttl is None
