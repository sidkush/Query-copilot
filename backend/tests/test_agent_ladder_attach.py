"""AgentEngine._attach_ring8_components must assign _model_ladder and _planner when flags on."""
from unittest.mock import MagicMock, patch


def test_ladder_and_planner_attached_when_flags_on():
    from agent_engine import AgentEngine

    with patch("agent_engine.settings") as mock_s:
        mock_s.FEATURE_AGENT_MODEL_LADDER = True
        mock_s.FEATURE_AGENT_PLANNER = True
        mock_s.FEATURE_AGENT_HALLUCINATION_ABORT = False
        mock_s.BENCHMARK_MODE = False
        mock_s.MODEL_LADDER_STEP_EXEC = "h"
        mock_s.MODEL_LADDER_PLAN_EMIT = "s"
        mock_s.MODEL_LADDER_RECOVERY = "o"
        mock_s.MODEL_LADDER_RECOVERY_BENCHMARK = "s"

        engine = AgentEngine.__new__(AgentEngine)
        engine.connection_entry = MagicMock()
        engine.engine = MagicMock()
        engine.email = "u@t"
        # Wave 2 spike-fix: planner attach now skips when api_key empty
        # (adversarial A1). Provider mock with non-empty api_key keeps
        # the attach path live in this test.
        engine.provider = MagicMock(api_key="test-api-key")
        engine._attach_ring8_components()
        assert engine._model_ladder is not None
        assert engine._planner is not None


def test_components_none_when_flags_off():
    from agent_engine import AgentEngine

    with patch("agent_engine.settings") as mock_s:
        mock_s.FEATURE_AGENT_MODEL_LADDER = False
        mock_s.FEATURE_AGENT_PLANNER = False
        mock_s.FEATURE_AGENT_HALLUCINATION_ABORT = False
        mock_s.BENCHMARK_MODE = False

        engine = AgentEngine.__new__(AgentEngine)
        engine.connection_entry = MagicMock()
        engine.engine = MagicMock()
        engine.email = "u@t"
        engine._attach_ring8_components()
        assert getattr(engine, "_model_ladder", None) is None
        assert getattr(engine, "_planner", None) is None


def test_benchmark_mode_coerces_planner_and_ladder_on():
    """BENCHMARK_MODE=True must activate planner + ladder even when feature flags are False.

    This is the eval-only path: production interactive path keeps the flags
    default-False to avoid latency/cost regression, while benchmark runs
    activate the full Ring-8 stack via the env-gated coercion in
    _attach_ring8_components.
    """
    from agent_engine import AgentEngine

    with patch("agent_engine.settings") as mock_s:
        mock_s.FEATURE_AGENT_MODEL_LADDER = False
        mock_s.FEATURE_AGENT_PLANNER = False
        mock_s.FEATURE_AGENT_HALLUCINATION_ABORT = False
        mock_s.BENCHMARK_MODE = True
        mock_s.MODEL_LADDER_STEP_EXEC = "h"
        mock_s.MODEL_LADDER_PLAN_EMIT = "s"
        mock_s.MODEL_LADDER_RECOVERY = "o"
        mock_s.MODEL_LADDER_RECOVERY_BENCHMARK = "s"

        engine = AgentEngine.__new__(AgentEngine)
        engine.connection_entry = MagicMock()
        engine.engine = MagicMock()
        engine.email = "u@t"
        # Wave 2 spike-fix A1: planner attach requires non-empty api_key.
        engine.provider = MagicMock(api_key="test-api-key")
        engine._attach_ring8_components()
        assert engine._model_ladder is not None, "ladder must attach in BENCHMARK_MODE"
        assert engine._planner is not None, "planner must attach in BENCHMARK_MODE"
