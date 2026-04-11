"""
Test for Bug 3.1: No per-user connection limit.

The bug: app.state.connections[email] is unbounded — a single user
can open unlimited connections, exhausting server resources.

The fix: Add MAX_CONNECTIONS_PER_USER config (default 10). Check in
connection_routes.py connect_database() before opening new connections.
"""

import os
import re
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def test_max_connections_config_exists():
    """config.py must define MAX_CONNECTIONS_PER_USER."""
    from config import settings
    assert hasattr(settings, "MAX_CONNECTIONS_PER_USER"), (
        "config.py must define MAX_CONNECTIONS_PER_USER"
    )


def test_max_connections_default_is_reasonable():
    """MAX_CONNECTIONS_PER_USER default should be between 5 and 20."""
    from config import Settings
    field = Settings.model_fields.get("MAX_CONNECTIONS_PER_USER")
    assert field is not None, "MAX_CONNECTIONS_PER_USER field not found"
    default = field.default
    assert 5 <= default <= 20, (
        f"MAX_CONNECTIONS_PER_USER defaults to {default}, "
        f"should be between 5 and 20"
    )


def test_connect_endpoint_checks_limit():
    """connection_routes.py connect_database must check MAX_CONNECTIONS_PER_USER."""
    source_path = os.path.join(
        os.path.dirname(__file__), "..", "routers", "connection_routes.py"
    )
    with open(source_path, "r") as f:
        source = f.read()
    assert "MAX_CONNECTIONS_PER_USER" in source, (
        "connect_database() must check MAX_CONNECTIONS_PER_USER before "
        "allowing new connections"
    )


def test_connect_returns_429_on_limit():
    """The connection limit check must raise HTTP 429."""
    source_path = os.path.join(
        os.path.dirname(__file__), "..", "routers", "connection_routes.py"
    )
    with open(source_path, "r") as f:
        source = f.read()
    # Should have a 429 status code near the MAX_CONNECTIONS check
    assert "429" in source, (
        "Connection limit must return HTTP 429 (Too Many Requests)"
    )


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
