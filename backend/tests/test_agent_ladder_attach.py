"""AgentEngine._attach_ring8_components must assign _model_ladder and _planner when flags on."""
from unittest.mock import MagicMock, patch


def test_ladder_and_planner_attached_when_flags_on():
    from agent_engine import AgentEngine

    with patch("agent_engine.settings") as mock_s:
        mock_s.FEATURE_AGENT_MODEL_LADDER = True
        mock_s.FEATURE_AGENT_PLANNER = True
        mock_s.FEATURE_AGENT_HALLUCINATION_ABORT = False
        mock_s.MODEL_LADDER_STEP_EXEC = "h"
        mock_s.MODEL_LADDER_PLAN_EMIT = "s"
        mock_s.MODEL_LADDER_RECOVERY = "o"

        engine = AgentEngine.__new__(AgentEngine)
        engine.connection_entry = MagicMock()
        engine.engine = MagicMock()
        engine.email = "u@t"
        engine._attach_ring8_components()
        assert engine._model_ladder is not None
        assert engine._planner is not None


def test_components_none_when_flags_off():
    from agent_engine import AgentEngine

    with patch("agent_engine.settings") as mock_s:
        mock_s.FEATURE_AGENT_MODEL_LADDER = False
        mock_s.FEATURE_AGENT_PLANNER = False
        mock_s.FEATURE_AGENT_HALLUCINATION_ABORT = False

        engine = AgentEngine.__new__(AgentEngine)
        engine.connection_entry = MagicMock()
        engine.engine = MagicMock()
        engine.email = "u@t"
        engine._attach_ring8_components()
        assert getattr(engine, "_model_ladder", None) is None
        assert getattr(engine, "_planner", None) is None
