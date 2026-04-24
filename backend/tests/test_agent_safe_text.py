"""Agent final-output stream must pass through SafeText when flag on."""
from unittest.mock import MagicMock, patch


def test_output_containing_hallucinated_error_is_blocked():
    from agent_engine import AgentEngine
    from hallucination_abort import SafeText

    engine = AgentEngine.__new__(AgentEngine)
    engine._safe_text = SafeText(known_error_phrases=["database connection refused"])

    with patch("agent_engine.settings") as mock_s:
        mock_s.FEATURE_AGENT_HALLUCINATION_ABORT = True
        out = engine._apply_safe_text("I'm experiencing database connectivity issues.")
    assert out is None


def test_output_with_no_error_triggers_passes_through():
    from agent_engine import AgentEngine
    from hallucination_abort import SafeText

    engine = AgentEngine.__new__(AgentEngine)
    engine._safe_text = SafeText(known_error_phrases=[])

    with patch("agent_engine.settings") as mock_s:
        mock_s.FEATURE_AGENT_HALLUCINATION_ABORT = True
        out = engine._apply_safe_text("The result has 42 rows.")
    assert out == "The result has 42 rows."


def test_flag_off_means_no_filter():
    from agent_engine import AgentEngine

    engine = AgentEngine.__new__(AgentEngine)
    engine._safe_text = None

    with patch("agent_engine.settings") as mock_s:
        mock_s.FEATURE_AGENT_HALLUCINATION_ABORT = False
        out = engine._apply_safe_text("anything even suspicious")
    assert out == "anything even suspicious"
