"""AgentEngine attaches PlanCache to planner when flag on."""
from unittest.mock import MagicMock, patch


def test_plan_cache_attached_when_flag_on():
    from agent_engine import AgentEngine
    with patch("agent_engine.settings") as mock_s:
        mock_s.FEATURE_AGENT_MODEL_LADDER = True
        mock_s.FEATURE_AGENT_PLANNER = True
        mock_s.FEATURE_PLAN_CACHE = True
        mock_s.FEATURE_AGENT_HALLUCINATION_ABORT = False
        mock_s.FEATURE_CLAIM_PROVENANCE = False
        mock_s.FEATURE_AUDIT_LEDGER = False
        mock_s.MODEL_LADDER_STEP_EXEC = "h"
        mock_s.MODEL_LADDER_PLAN_EMIT = "s"
        mock_s.MODEL_LADDER_RECOVERY = "o"
        mock_s.PLAN_CACHE_COSINE_THRESHOLD = 0.85
        mock_s.SEMANTIC_REGISTRY_DIR = ".data/semantic_registry"
        engine = AgentEngine.__new__(AgentEngine)
        engine.connection_entry = MagicMock()
        engine.engine = MagicMock()
        engine.email = "u@t"
        # Wave 2 spike-fix: planner attach skips when api_key empty (A1).
        engine.provider = MagicMock(api_key="test-api-key")
        engine._attach_ring8_components()
        assert engine._planner is not None
        assert engine._planner._cache is not None
