"""Smoke test: skill_library is attached to app.state after startup."""
from __future__ import annotations


def test_skill_library_on_app_state():
    from fastapi.testclient import TestClient
    from main import app

    with TestClient(app):
        lib = getattr(app.state, "skill_library", None)
        assert lib is not None, "SkillLibrary not attached to app.state"
        from skill_library import SkillLibrary
        assert isinstance(lib, SkillLibrary)
        assert len(lib.all_names()) >= 48
        # T9 wires skill_collection; must exist as attribute even if None.
        assert hasattr(app.state, "skill_collection")
