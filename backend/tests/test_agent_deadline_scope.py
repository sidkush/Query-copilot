"""AgentEngine wraps run() in DeadlinePropagator when flag on."""
from unittest.mock import MagicMock, patch

def test_deadline_active_during_run():
    from agent_engine import AgentEngine
    from deadline_propagator import remaining_ms
    engine = AgentEngine.__new__(AgentEngine)
    captured_rem = {"value": None}
    def _snapshot():
        captured_rem["value"] = remaining_ms()
    with patch("agent_engine.settings") as mock_s:
        mock_s.FEATURE_DEADLINE_PROPAGATION = True
        mock_s.AGENT_WALL_CLOCK_TYPICAL_S = 60.0
        engine._run_under_deadline(_snapshot)
    assert captured_rem["value"] is not None
    assert 0 < captured_rem["value"] <= 60_000

def test_no_deadline_when_flag_off():
    from agent_engine import AgentEngine
    from deadline_propagator import remaining_ms
    engine = AgentEngine.__new__(AgentEngine)
    captured_rem = {"value": "sentinel"}
    def _snapshot():
        captured_rem["value"] = remaining_ms()
    with patch("agent_engine.settings") as mock_s:
        mock_s.FEATURE_DEADLINE_PROPAGATION = False
        mock_s.AGENT_WALL_CLOCK_TYPICAL_S = 60.0
        engine._run_under_deadline(_snapshot)
    assert captured_rem["value"] is None
