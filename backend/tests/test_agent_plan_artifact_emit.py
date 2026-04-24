"""AgentEngine emits plan_artifact event before any run_sql call."""
from unittest.mock import MagicMock, patch
import pytest


def test_plan_artifact_event_in_stream_when_plan_ready():
    from agent_engine import AgentEngine
    from analytical_planner import AnalyticalPlan, PlanCTE

    engine = AgentEngine.__new__(AgentEngine)
    engine._current_plan = AnalyticalPlan(
        plan_id="p1",
        ctes=[PlanCTE(name="c1", description="x", sql="SELECT 1")],
        fallback=False,
        registry_hits=["trips_row_count"],
    )

    with patch("agent_engine.settings") as mock_s:
        mock_s.PLAN_ARTIFACT_EMIT_BEFORE_FIRST_SQL = True
        events = list(engine._stream_plan_artifact())
    assert len(events) == 1
    ev = events[0]
    assert ev["type"] == "plan_artifact"
    assert ev["plan_id"] == "p1"


def test_no_plan_artifact_event_when_plan_none():
    from agent_engine import AgentEngine

    engine = AgentEngine.__new__(AgentEngine)
    engine._current_plan = None
    with patch("agent_engine.settings") as mock_s:
        mock_s.PLAN_ARTIFACT_EMIT_BEFORE_FIRST_SQL = True
        events = list(engine._stream_plan_artifact())
    assert events == []
