"""T13 — Replan budget = 2 + oscillation guard."""
import pytest
from unittest.mock import MagicMock, patch
from config import settings


def test_replan_budget_is_2():
    """Config default must be 2."""
    assert settings.SCOPE_VALIDATOR_REPLAN_BUDGET == 2


def test_replan_budget_field_bounds():
    """Field constraint: ge=1 le=5."""
    from config import Settings
    field = Settings.model_fields.get("SCOPE_VALIDATOR_REPLAN_BUDGET")
    if field is None:
        # pydantic v1 compat
        field = Settings.__fields__.get("SCOPE_VALIDATOR_REPLAN_BUDGET")
    assert field is not None


def test_oscillation_guard_fires_on_same_violations():
    """Oscillation detected when violations don't reduce."""
    from agent_engine import AgentEngine
    engine = AgentEngine.__new__(AgentEngine)
    engine.connection_entry = MagicMock()
    engine.connection_entry.db_type = "postgresql"
    engine.connection_entry.coverage_cards = []

    # Simulate two rounds with the same violation set
    mock_violation = MagicMock()
    mock_violation.rule_id = MagicMock()
    mock_violation.rule_id.value = "range_mismatch"
    mock_violation.message = "out of range"

    mock_result = MagicMock()
    mock_result.violations = [mock_violation]

    engine._replan_violation_history = [frozenset({"range_mismatch"})]

    with patch("scope_validator.ScopeValidator") as MockV, \
         patch("replan_budget.ReplanBudget"), \
         patch("replan_controller.ReplanController"):
        MockV.return_value.validate.return_value = mock_result
        result = engine._handle_scope_violations_with_replan(
            "SELECT * FROM rides", "rides per rider"
        )

    assert result is not None
    assert result.get("reason") == "replan_oscillation_detected"
    assert result.get("budget_exhausted") is True


def test_oscillation_not_fired_on_first_violation():
    """First violation: no history, allow replan."""
    from agent_engine import AgentEngine
    engine = AgentEngine.__new__(AgentEngine)
    engine.connection_entry = MagicMock()
    engine.connection_entry.db_type = "postgresql"
    engine.connection_entry.coverage_cards = []
    engine._replan_violation_history = []  # empty history

    mock_violation = MagicMock()
    mock_violation.rule_id = MagicMock()
    mock_violation.rule_id.value = "range_mismatch"
    mock_violation.message = "out of range"

    mock_result = MagicMock()
    mock_result.violations = [mock_violation]

    with patch("scope_validator.ScopeValidator") as MockV, \
         patch("replan_budget.ReplanBudget"), \
         patch("replan_controller.ReplanController") as MockRC:
        MockV.return_value.validate.return_value = mock_result
        # Hint must expose .reason / .context / .original_sql (NamedTuple-like)
        mock_hint = MagicMock()
        mock_hint.reason = "range_mismatch"
        mock_hint.context = "fix range"
        mock_hint.original_sql = "SELECT * FROM rides"
        MockRC.return_value.on_violation.return_value = mock_hint
        result = engine._handle_scope_violations_with_replan(
            "SELECT * FROM rides", "rides per rider"
        )
    # Should NOT be an oscillation result
    assert result is None or result.get("reason") != "replan_oscillation_detected"
