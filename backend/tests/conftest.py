"""
Session-scoped fixture that restores agent_engine.settings to the real config
singleton after each test. Pre-existing tests in this suite replace
`agent_engine.settings` with a MagicMock without cleanup; this autouse fixture
prevents that leak from poisoning subsequent W1 tests.
"""
import pytest


@pytest.fixture(autouse=True)
def _restore_agent_engine_settings():
    from config import settings as real_settings
    import agent_engine as _ae
    _ae.settings = real_settings
    yield
    _ae.settings = real_settings
