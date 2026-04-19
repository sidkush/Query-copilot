"""AgentEngine._build_system_blocks behaviour under both flag states."""
from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock

import pytest


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
    agent = AgentEngine(
        engine=engine, email="test@example.com", connection_entry=conn,
        provider=provider, memory=memory,
    )
    return agent


def test_flag_off_returns_single_block(monkeypatch):
    from config import settings
    monkeypatch.setattr(settings, "SKILL_LIBRARY_ENABLED", False)
    agent = _make_agent()
    blocks = agent._build_system_blocks(question="hi", prefetch_context="")
    assert len(blocks) == 1
    assert blocks[0].ttl is None
    assert "AskDB" in blocks[0].text


def test_flag_on_returns_cached_blocks(monkeypatch):
    from config import settings
    from skill_library import SkillLibrary
    monkeypatch.setattr(settings, "SKILL_LIBRARY_ENABLED", True)
    agent = _make_agent()
    agent._skill_library = SkillLibrary(root=Path(__file__).resolve().parents[2] / "askdb-skills")
    blocks = agent._build_system_blocks(question="hi", prefetch_context="")
    # At least the identity block must be cached.
    assert any(b.ttl == "1h" for b in blocks)


def test_flag_on_includes_security_rules(monkeypatch):
    from config import settings
    from skill_library import SkillLibrary
    monkeypatch.setattr(settings, "SKILL_LIBRARY_ENABLED", True)
    agent = _make_agent()
    agent._skill_library = SkillLibrary(root=Path(__file__).resolve().parents[2] / "askdb-skills")
    blocks = agent._build_system_blocks(question="hi", prefetch_context="")
    joined = "\n".join(b.text for b in blocks).lower()
    assert "security" in joined or "read-only" in joined
