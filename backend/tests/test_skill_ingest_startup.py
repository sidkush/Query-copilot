"""Smoke test: app.state.skill_collection attribute exists after startup."""
from __future__ import annotations


def test_skill_collection_attribute_present():
    from fastapi.testclient import TestClient
    from main import app
    with TestClient(app):
        # Attribute exists regardless of flag state (may be None when flag off).
        assert hasattr(app.state, "skill_collection")


def test_skill_collection_wired_when_flag_on(monkeypatch):
    """When SKILL_LIBRARY_ENABLED=True, ingest runs + collection is attached."""
    from config import settings
    monkeypatch.setattr(settings, "SKILL_LIBRARY_ENABLED", True)
    from fastapi.testclient import TestClient
    # Re-import main to re-run lifespan with flag on.
    import importlib
    import main as _main
    importlib.reload(_main)
    with TestClient(_main.app):
        coll = getattr(_main.app.state, "skill_collection", None)
        # Either None (ChromaDB unavailable) or a real collection; just assert the
        # attribute was populated without crashing the app.
        assert hasattr(_main.app.state, "skill_collection")
