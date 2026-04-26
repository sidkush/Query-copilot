def test_scope_fence_in_system_prompt(monkeypatch):
    """scope_fence block appears in rendered system prompt."""
    from unittest.mock import MagicMock
    from config import settings
    import agent_engine as ae

    monkeypatch.setattr(settings, 'FEATURE_AGENT_DASHBOARD', False)
    monkeypatch.setattr(settings, 'FEATURE_ANALYST_TONE', False)
    monkeypatch.setattr(settings, 'FEATURE_PERSONAS', False)
    monkeypatch.setattr(settings, 'FEATURE_STYLE_MATCHING', False)
    monkeypatch.setattr(settings, 'ML_ENGINE_ENABLED', False)
    monkeypatch.setattr(settings, 'SKILL_LIBRARY_ENABLED', False)

    eng = MagicMock()
    eng.SYSTEM_PROMPT = "BASE PROMPT"
    eng._run_question = "how many rides per rider"
    eng._tool_calls = 2
    eng._max_tool_calls = 8
    eng._progress = {}
    eng.agent_context = "query"
    eng.engine = None
    eng._voice_mode = False
    # Return empty strings from helper methods that would otherwise yield MagicMocks
    eng._build_data_coverage_block.return_value = ""
    eng._build_semantic_context.return_value = ""
    eng._build_chart_type_context.return_value = ""
    # DIALECT_HINTS must be a real dict so .get() works
    eng.DIALECT_HINTS = {}

    result = ae.AgentEngine._build_legacy_system_prompt(eng, "how many rides per rider", "")
    assert isinstance(result, str), f"Expected str, got {type(result)}"
    assert "<scope_fence>" in result
    assert "how many rides per rider" in result
    assert "</scope_fence>" in result
