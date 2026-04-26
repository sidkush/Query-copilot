def test_scope_fence_in_system_prompt(monkeypatch):
    """scope_fence block appears in rendered system prompt."""
    # Minimal mock to call _build_legacy_system_prompt
    from unittest.mock import MagicMock, patch
    import backend.agent_engine as ae
    with patch.dict('backend.config.settings.__dict__', {
        'FEATURE_AGENT_DASHBOARD': False,
        'FEATURE_ANALYST_TONE': False,
        'FEATURE_PERSONAS': False,
        'FEATURE_VOICE_MODE': False,
        'ML_ENGINE_ENABLED': False,
        'SKILL_LIBRARY_ENABLED': False,
    }, clear=False):
        eng = MagicMock()
        eng._run_question = "how many rides per rider"
        eng._tool_calls = 2
        eng._max_tool_calls = 8
        eng._progress = {}
        eng.agent_context = "query"
        result = ae.AgentEngine._build_legacy_system_prompt(eng, "how many rides per rider", "")
    assert "<scope_fence>" in result
    assert "how many rides per rider" in result
    assert "</scope_fence>" in result
