"""Flag-gated behaviour verification for AgentEngine skill integration.

Plan 3 T7 scope note: the full rewire of the inline `run()` system-prompt
assembly to consume `_build_system_blocks()` directly is deferred to a
follow-up refactor plan — today, `run()` stays on its legacy flat-string
path for backward compatibility. These tests prove the block path is
callable, serializable, and round-trips through Anthropic-content shape
so downstream callers can opt in when ready.
"""
from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock


def _make_agent():
    from agent_engine import AgentEngine
    engine = MagicMock()
    conn = MagicMock()
    conn.db_type = "postgresql"
    conn.engine = MagicMock()
    conn.engine.db = MagicMock()
    conn.engine.db.get_schema_info = MagicMock(return_value={})
    provider = MagicMock()
    provider.default_model = "claude-haiku-4-5-20251001"
    provider.fallback_model = "claude-sonnet-4-5-20250514"
    memory = MagicMock()
    return AgentEngine(
        engine=engine, email="a@b.com", connection_entry=conn,
        provider=provider, memory=memory,
    )


def test_flag_off_legacy_path_unchanged(monkeypatch):
    from config import settings
    monkeypatch.setattr(settings, "SKILL_LIBRARY_ENABLED", False)
    agent = _make_agent()
    blocks = agent._build_system_blocks(question="hi", prefetch_context="")
    assert len(blocks) == 1
    assert blocks[0].ttl is None


def test_flag_on_blocks_serialize_to_anthropic_content(monkeypatch):
    """When flag on, _build_system_blocks output round-trips through .to_anthropic()."""
    from config import settings
    from skill_library import SkillLibrary
    monkeypatch.setattr(settings, "SKILL_LIBRARY_ENABLED", True)
    agent = _make_agent()
    agent._skill_library = SkillLibrary(root=Path(__file__).resolve().parents[2] / "askdb-skills")

    blocks = agent._build_system_blocks(question="show revenue", prefetch_context="")
    payload = [b.to_anthropic() for b in blocks]

    # Every payload item must be shaped for Anthropic.
    for p in payload:
        assert p["type"] == "text"
        assert isinstance(p["text"], str) and p["text"]
    # Identity block must have cache_control when flag on.
    assert any("cache_control" in p for p in payload)
    # Cached blocks must use ephemeral type.
    for p in payload:
        if "cache_control" in p:
            assert p["cache_control"]["type"] == "ephemeral"
            assert p["cache_control"]["ttl"] in ("1h", "5m")
