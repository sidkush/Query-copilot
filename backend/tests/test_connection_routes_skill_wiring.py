"""ConnectionEntry instances receive skill_library wiring at creation."""
from __future__ import annotations

from unittest.mock import MagicMock


def test_wire_skill_library_populates_all_three_attrs():
    from routers.connection_routes import _wire_skill_library_to_engine

    app = MagicMock()
    app.state.skill_library = MagicMock(name="skill_lib")
    app.state.skill_collection = MagicMock(name="skill_coll")

    engine = MagicMock()
    entry = MagicMock(engine=engine)
    _wire_skill_library_to_engine(entry, app)

    assert engine._skill_library is app.state.skill_library
    assert engine._skill_collection is app.state.skill_collection
    assert engine._connection_entry_stub is entry


def test_wire_noop_when_app_has_no_library():
    from routers.connection_routes import _wire_skill_library_to_engine
    app = MagicMock()
    app.state.skill_library = None
    app.state.skill_collection = None

    engine = MagicMock()
    entry = MagicMock(engine=engine)
    _wire_skill_library_to_engine(entry, app)
    assert engine._skill_library is None
    assert engine._skill_collection is None


def test_wire_safe_when_entry_engine_missing():
    """Defensive: entry with no engine attribute must not raise."""
    from routers.connection_routes import _wire_skill_library_to_engine
    app = MagicMock()
    entry = MagicMock()
    entry.engine = None
    _wire_skill_library_to_engine(entry, app)  # must not raise
