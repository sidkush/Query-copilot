"""QueryEngine prompt composition honours SKILL_LIBRARY_ENABLED."""
from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock


def _make_qe():
    from query_engine import QueryEngine
    from config import DBType
    db = MagicMock()
    db.db_type = DBType.POSTGRESQL
    db.get_schema_info = MagicMock(return_value={})
    provider = MagicMock()
    provider.default_model = "claude-haiku-4-5-20251001"
    provider.fallback_model = "claude-sonnet-4-5-20250514"
    return QueryEngine(db_connector=db, namespace="test", provider=provider)


def test_query_engine_flag_off(monkeypatch):
    from config import settings
    monkeypatch.setattr(settings, "SKILL_LIBRARY_ENABLED", False)
    qe = _make_qe()
    prompt = qe._build_system_blocks("show revenue")
    assert len(prompt) == 1
    assert prompt[0].ttl is None


def test_query_engine_flag_on_has_cached_blocks(monkeypatch):
    from config import settings
    from skill_library import SkillLibrary
    monkeypatch.setattr(settings, "SKILL_LIBRARY_ENABLED", True)
    qe = _make_qe()
    qe._skill_library = SkillLibrary(root=Path(__file__).resolve().parents[2] / "askdb-skills")
    prompt = qe._build_system_blocks("show revenue")
    assert any(b.ttl in ("1h", "5m") for b in prompt)


def test_build_system_payload_flag_off_returns_string(monkeypatch):
    from config import settings
    monkeypatch.setattr(settings, "SKILL_LIBRARY_ENABLED", False)
    qe = _make_qe()
    out = qe._build_system_payload("You are AskDB.", "q")
    assert isinstance(out, str)
    assert out == "You are AskDB."


def test_build_system_payload_flag_on_returns_list(monkeypatch):
    from config import settings
    from skill_library import SkillLibrary
    monkeypatch.setattr(settings, "SKILL_LIBRARY_ENABLED", True)
    qe = _make_qe()
    qe._skill_library = SkillLibrary(root=Path(__file__).resolve().parents[2] / "askdb-skills")
    out = qe._build_system_payload("MARKER_TEXT_9999", "q")
    assert isinstance(out, list)
    joined = "\n".join(b["text"] for b in out)
    assert "MARKER_TEXT_9999" in joined
