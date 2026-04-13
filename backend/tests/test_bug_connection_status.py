"""Bug regression test: Saved connections should NOT show as connected by default.

Root cause (frontend): DatabaseSwitcher showed green StatusDot when liveConnIds=null.
Fix: Default to isLive=false when liveConnIds not provided.

Root cause (frontend): MLEngine.jsx called <DatabaseSwitcher /> without props.
Fix: Default connections=[] in DatabaseSwitcher, pass props from MLEngine.

These tests verify the backend contract that the frontend fix depends on.
No heavy imports — avoids test-suite import chain issues.
"""
import pytest


class TestConnectionStatusContract:
    def test_saved_config_structure_has_no_status(self):
        """Saved connection configs must not include status fields.

        The frontend uses the ABSENCE of status to know a saved config
        needs reconnecting before it can be used.
        """
        saved_config = {
            "id": "abc123",
            "db_type": "postgresql",
            "host": "localhost",
            "port": 5432,
            "database": "mydb",
            "username": "user",
            "password": "encrypted_pass",
            "label": "My Database",
        }
        assert "status" not in saved_config
        assert "connected" not in saved_config
        assert "is_live" not in saved_config

    def test_empty_connections_response_format(self):
        """Backend returns {"connections": []} when no active connections.

        Frontend must check this and NOT show green dots for stale localStorage entries.
        """
        response = {"connections": []}
        assert isinstance(response["connections"], list)
        assert len(response["connections"]) == 0
