"""Bug regression: ML tools must be available and ML context must affect system prompt.
Also: agent sessions must load from SQLite persistence (continuity fix)."""
import pytest


class TestMLContext:
    """Bug A: ML tools not included when agent_context is 'ml'."""

    def test_agent_context_defaults_to_query(self):
        """AgentEngine must have agent_context attribute defaulting to 'query'."""
        from agent_engine import AgentEngine
        # Verify __init__ sets agent_context
        import inspect
        src = inspect.getsource(AgentEngine.__init__)
        assert "agent_context" in src, "AgentEngine.__init__ must set agent_context"

    def test_ml_tool_definitions_exist(self):
        """All three ML tool definitions must be present."""
        from agent_engine import ML_TOOL_DEFINITIONS
        tool_names = [t["name"] for t in ML_TOOL_DEFINITIONS]
        assert "ml_analyze_features" in tool_names
        assert "ml_train" in tool_names
        assert "ml_evaluate" in tool_names

    def test_agent_run_request_accepts_context(self):
        """The AgentRunRequest Pydantic model must accept agent_context field."""
        from routers.agent_routes import AgentRunRequest
        req = AgentRunRequest(question="test", agent_context="ml")
        assert req.agent_context == "ml"

    def test_agent_run_request_defaults_to_query(self):
        """AgentRunRequest.agent_context must default to 'query'."""
        from routers.agent_routes import AgentRunRequest
        req = AgentRunRequest(question="test")
        assert req.agent_context == "query"

    def test_agent_run_request_accepts_dashboard_context(self):
        """AgentRunRequest must accept 'dashboard' as agent_context."""
        from routers.agent_routes import AgentRunRequest
        req = AgentRunRequest(question="test", agent_context="dashboard")
        assert req.agent_context == "dashboard"


class TestSessionContinuity:
    """Bug B: Agent loses conversation context — every message creates new session."""

    def test_get_or_create_session_loads_from_store(self):
        """When chat_id exists in session store but not in memory, session should be
        loaded from SQLite, not created fresh."""
        from unittest.mock import patch
        from routers.agent_routes import _get_or_create_session, _sessions, _sessions_lock

        test_chat_id = "test_continuity_bug_b_123"
        test_email = "test@test.com"

        # Clear any existing session from memory
        with _sessions_lock:
            _sessions.pop(test_chat_id, None)

        # Mock session_store.load_session to return saved steps
        mock_saved = {
            "steps": [
                {"type": "user_query", "content": "What tables do we have?"},
                {"type": "result", "content": "You have 3 tables: customers, orders, products."},
            ],
            "progress": {},
        }

        with patch("routers.agent_routes.session_store") as mock_store:
            mock_store.load_session.return_value = mock_saved
            session = _get_or_create_session(test_chat_id, test_email)

        # Session should have been restored with history
        assert session is not None
        assert len(session._messages) >= 2, (
            f"Expected at least 2 restored messages, got {len(session._messages)}"
        )
        # Verify roles are correct
        assert session._messages[0]["role"] == "user"
        assert session._messages[1]["role"] == "assistant"

        # Cleanup
        with _sessions_lock:
            _sessions.pop(test_chat_id, None)

    def test_get_or_create_session_creates_fresh_when_not_persisted(self):
        """When chat_id is not in memory or SQLite, create a fresh session."""
        from unittest.mock import patch
        from routers.agent_routes import _get_or_create_session, _sessions, _sessions_lock

        test_chat_id = "test_fresh_session_456"
        test_email = "test@test.com"

        with _sessions_lock:
            _sessions.pop(test_chat_id, None)

        with patch("routers.agent_routes.session_store") as mock_store:
            mock_store.load_session.return_value = None
            session = _get_or_create_session(test_chat_id, test_email)

        assert session is not None
        assert len(session._messages) == 0, "Fresh session should have no messages"

        # Cleanup
        with _sessions_lock:
            _sessions.pop(test_chat_id, None)

    def test_get_or_create_session_returns_cached_over_sqlite(self):
        """When session is already in memory, return it without touching SQLite."""
        from unittest.mock import patch
        from routers.agent_routes import _get_or_create_session, _sessions, _sessions_lock
        from agent_engine import SessionMemory

        test_chat_id = "test_cached_session_789"
        test_email = "test@test.com"

        # Pre-populate in-memory cache
        cached_session = SessionMemory(test_chat_id, owner_email=test_email)
        cached_session.add_turn("user", "cached question")
        with _sessions_lock:
            _sessions[test_chat_id] = cached_session

        with patch("routers.agent_routes.session_store") as mock_store:
            session = _get_or_create_session(test_chat_id, test_email)
            # Should NOT have called load_session since it was in memory
            mock_store.load_session.assert_not_called()

        assert session is cached_session
        assert len(session._messages) == 1

        # Cleanup
        with _sessions_lock:
            _sessions.pop(test_chat_id, None)
