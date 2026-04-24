"""Agent must stop on StepBudget exhaustion."""
from unittest.mock import MagicMock
import pytest


def test_agent_aborts_on_step_cap_exceeded():
    from agent_engine import AgentEngine
    from step_budget import StepBudget, BudgetExceeded

    engine = AgentEngine.__new__(AgentEngine)
    engine._step_budget = StepBudget(max_steps=2, wall_clock_s=60.0, cost_cap_usd=1.0)
    engine._step_budget.consume_step("t", 0.0)
    engine._step_budget.consume_step("t", 0.0)
    # Third consume must raise.
    with pytest.raises(BudgetExceeded):
        engine._step_budget.consume_step("t", 0.0)


def test_agent_assigns_step_budget_on_session_start():
    """New session must initialise _step_budget with config values."""
    from agent_engine import AgentEngine
    from config import settings

    engine = AgentEngine.__new__(AgentEngine)
    engine._init_step_budget()
    assert engine._step_budget.max_steps == settings.AGENT_STEP_CAP
    assert engine._step_budget.wall_clock_s == settings.AGENT_WALL_CLOCK_TYPICAL_S
    assert engine._step_budget.cost_cap_usd == settings.AGENT_COST_CAP_USD
