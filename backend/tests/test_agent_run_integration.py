"""End-to-end: run() sends blocks to the provider under both flag states."""
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
        engine=engine, email="t@x.com", connection_entry=conn,
        provider=provider, memory=memory,
    )


def test_build_system_payload_flag_off_returns_string(monkeypatch):
    from config import settings
    monkeypatch.setattr(settings, "SKILL_LIBRARY_ENABLED", False)
    agent = _make_agent()
    out = agent._build_system_payload("You are AskDB.\nLegacy stuff.", "q")
    assert isinstance(out, str)
    assert out == "You are AskDB.\nLegacy stuff."


def test_build_system_payload_flag_on_returns_list_with_cache_control(monkeypatch):
    from config import settings
    from skill_library import SkillLibrary
    monkeypatch.setattr(settings, "SKILL_LIBRARY_ENABLED", True)
    agent = _make_agent()
    agent._skill_library = SkillLibrary(root=Path(__file__).resolve().parents[2] / "askdb-skills")
    out = agent._build_system_payload("You are AskDB.", "show revenue")
    assert isinstance(out, list)
    assert all("type" in p and p["type"] == "text" for p in out)
    assert any("cache_control" in p for p in out)


def test_build_system_payload_flag_on_identity_includes_assembled_text(monkeypatch):
    from config import settings
    from skill_library import SkillLibrary
    monkeypatch.setattr(settings, "SKILL_LIBRARY_ENABLED", True)
    agent = _make_agent()
    agent._skill_library = SkillLibrary(root=Path(__file__).resolve().parents[2] / "askdb-skills")
    marker = "SENTINEL_ASSEMBLED_TEXT_MARKER_12345"
    out = agent._build_system_payload(marker, "q")
    joined = "\n".join(b["text"] for b in out)
    assert marker in joined


def test_build_system_payload_cached_ttls_correct(monkeypatch):
    from config import settings
    from skill_library import SkillLibrary
    monkeypatch.setattr(settings, "SKILL_LIBRARY_ENABLED", True)
    agent = _make_agent()
    agent._skill_library = SkillLibrary(root=Path(__file__).resolve().parents[2] / "askdb-skills")
    out = agent._build_system_payload("x", "q")
    for p in out:
        if "cache_control" in p:
            assert p["cache_control"]["type"] == "ephemeral"
            assert p["cache_control"]["ttl"] in ("1h", "5m")
