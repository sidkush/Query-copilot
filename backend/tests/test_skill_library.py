"""Tests for SkillLibrary loader."""
from __future__ import annotations

from pathlib import Path

import pytest


def test_skill_hit_dataclass_fields():
    from skill_hit import SkillHit

    hit = SkillHit(
        name="llm-error-recovery",
        priority=2,
        tokens=1500,
        source="always_on",
        content="# LLM Error Recovery\n...",
        path=Path("askdb-skills/core/llm-error-recovery.md"),
    )
    assert hit.name == "llm-error-recovery"
    assert hit.priority == 2
    assert hit.source in ("always_on", "deterministic", "rag")


def test_skill_library_loads_all_files():
    """Library must load every .md except MASTER_INDEX."""
    from skill_library import SkillLibrary

    lib = SkillLibrary(root=Path(__file__).resolve().parents[2] / "askdb-skills")
    all_names = lib.all_names()
    assert "llm-error-recovery" in all_names
    assert "security-rules" in all_names
    assert "MASTER_INDEX" not in all_names
    assert len(all_names) >= 48  # Plan 1 delivers 48 skills


def test_skill_library_get_returns_skillhit():
    from skill_library import SkillLibrary
    lib = SkillLibrary(root=Path(__file__).resolve().parents[2] / "askdb-skills")
    hit = lib.get("security-rules")
    assert hit is not None
    assert hit.name == "security-rules"
    assert hit.priority == 1
    assert hit.tokens > 0
    assert "security" in hit.content.lower()


def test_skill_library_get_missing_returns_none():
    from skill_library import SkillLibrary
    lib = SkillLibrary(root=Path(__file__).resolve().parents[2] / "askdb-skills")
    assert lib.get("does-not-exist") is None


def test_always_on_returns_only_priority_1():
    from skill_library import SkillLibrary
    lib = SkillLibrary(root=Path(__file__).resolve().parents[2] / "askdb-skills")
    hits = lib.always_on()
    assert len(hits) >= 3
    for h in hits:
        assert h.priority == 1
        assert h.source == "always_on"


def test_always_on_under_cap():
    """Always-on total must be <= SKILL_ALWAYS_ON_TOKENS_CAP."""
    from skill_library import SkillLibrary
    lib = SkillLibrary(root=Path(__file__).resolve().parents[2] / "askdb-skills")
    total = sum(h.tokens for h in lib.always_on())
    assert total <= 7000, f"always-on tokens {total} over cap"


def test_load_is_idempotent():
    from skill_library import SkillLibrary
    root = Path(__file__).resolve().parents[2] / "askdb-skills"
    lib1 = SkillLibrary(root=root)
    lib2 = SkillLibrary(root=root)
    assert lib1.all_names() == lib2.all_names()
