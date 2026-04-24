"""When SafeText blocks text, alert_manager fires llm_confabulation_detected."""
from unittest.mock import MagicMock, patch


def test_confab_alert_fires_on_block():
    from agent_engine import AgentEngine
    from hallucination_abort import SafeText

    engine = AgentEngine.__new__(AgentEngine)
    engine._safe_text = SafeText(known_error_phrases=[])
    engine.connection_entry = MagicMock()
    engine.connection_entry.tenant_id = "t1"

    with patch("agent_engine.settings") as mock_s, \
         patch("agent_engine.alert_manager") as mock_am:
        mock_s.FEATURE_AGENT_HALLUCINATION_ABORT = True
        mock_am.dispatch = MagicMock()
        engine._apply_safe_text("database connectivity issues synthesized here.")
        mock_am.dispatch.assert_called_once()
        call_kwargs = mock_am.dispatch.call_args.kwargs
        assert call_kwargs.get("rule_id") == "llm_confabulation_detected"
