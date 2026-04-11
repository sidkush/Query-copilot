"""
Test for Bug 2.6: Demo login production guard.

The bug: Demo credentials DemoTest2026! are hardcoded in auth_routes.py.
While there is an env-var check for production, there should also be a
config-level DEMO_ENABLED flag (default False in production).

The fix: Add DEMO_ENABLED config flag. The demo_login endpoint should
check this flag in addition to the env-var guard.
"""

import os
import sys
import re

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def test_demo_enabled_config_flag_exists():
    """config.py must define a DEMO_ENABLED flag."""
    from config import settings
    assert hasattr(settings, "DEMO_ENABLED"), (
        "config.py must define DEMO_ENABLED flag to control demo login availability"
    )


def test_demo_enabled_default_false():
    """DEMO_ENABLED should default to False (opt-in, not opt-out)."""
    from config import Settings
    # Check the field default
    field = Settings.model_fields.get("DEMO_ENABLED")
    assert field is not None, "DEMO_ENABLED field not found in Settings"
    assert field.default is False, (
        f"DEMO_ENABLED defaults to {field.default}, should be False"
    )


def test_demo_login_checks_config_flag():
    """auth_routes.py demo_login must reference DEMO_ENABLED or settings.DEMO_ENABLED."""
    source_path = os.path.join(
        os.path.dirname(__file__), "..", "routers", "auth_routes.py"
    )
    with open(source_path, "r") as f:
        source = f.read()
    assert "DEMO_ENABLED" in source, (
        "demo_login endpoint must check DEMO_ENABLED config flag"
    )


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
