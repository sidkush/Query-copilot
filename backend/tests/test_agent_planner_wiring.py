"""Agent invokes AnalyticalPlanner when FEATURE_AGENT_PLANNER=True."""
from unittest.mock import MagicMock, patch
import pytest


def test_agent_calls_planner_before_first_sql_when_flag_on():
    from agent_engine import AgentEngine
    from analytical_planner import AnalyticalPlan

    engine = AgentEngine.__new__(AgentEngine)
    engine.connection_entry = MagicMock()
    engine.connection_entry.coverage_cards = []
    engine.connection_entry.conn_id = "c1"
    engine.connection_entry.db_type = "sqlite"

    mock_planner = MagicMock()
    mock_planner.plan = MagicMock(return_value=AnalyticalPlan(
        plan_id="p1", ctes=[], fallback=True, registry_hits=[],
    ))
    engine._planner = mock_planner

    import agent_engine as _ae
    _ae.settings = MagicMock()
    _ae.settings.FEATURE_AGENT_PLANNER = True

    plan = engine._maybe_emit_plan(nl="trips")
    mock_planner.plan.assert_called_once()
    assert plan.plan_id == "p1"


def test_agent_skips_planner_when_flag_off():
    from agent_engine import AgentEngine

    engine = AgentEngine.__new__(AgentEngine)
    engine._planner = MagicMock()

    import agent_engine as _ae
    _ae.settings = MagicMock()
    _ae.settings.FEATURE_AGENT_PLANNER = False

    plan = engine._maybe_emit_plan(nl="trips")
    assert plan is None
    engine._planner.plan.assert_not_called()
