"""Replan controller — consumes ReplanBudget on Ring-3 violations."""
import pytest

from replan_budget import ReplanBudget
from scope_validator import ValidatorResult, Violation, RuleId
from replan_controller import ReplanController, ReplanHint


def _violation(rule=RuleId.RANGE_MISMATCH, msg="out of range"):
    return Violation(rule_id=rule, message=msg)


def test_first_violation_consumes_budget_and_returns_hint():
    budget = ReplanBudget(max_replans=1)
    ctl = ReplanController(budget=budget)
    result = ValidatorResult(violations=[_violation()])
    hint = ctl.on_violation(result, original_sql="SELECT * FROM x WHERE d < '1900-01-01'")
    assert isinstance(hint, ReplanHint)
    assert hint.reason == "range_mismatch"
    assert budget.remaining() == 0


def test_second_violation_when_budget_exhausted_returns_none():
    budget = ReplanBudget(max_replans=1)
    ctl = ReplanController(budget=budget)
    ctl.on_violation(ValidatorResult(violations=[_violation()]), original_sql="SELECT 1")
    hint = ctl.on_violation(ValidatorResult(violations=[_violation()]), original_sql="SELECT 1")
    assert hint is None


def test_no_violations_returns_none():
    budget = ReplanBudget(max_replans=1)
    ctl = ReplanController(budget=budget)
    hint = ctl.on_violation(ValidatorResult(violations=[]), original_sql="SELECT 1")
    assert hint is None
    assert budget.remaining() == 1


def test_hint_carries_all_violation_messages():
    budget = ReplanBudget(max_replans=1)
    ctl = ReplanController(budget=budget)
    result = ValidatorResult(violations=[
        _violation(RuleId.RANGE_MISMATCH, "rule 1 msg"),
        _violation(RuleId.FANOUT_INFLATION, "rule 2 msg"),
    ])
    hint = ctl.on_violation(result, original_sql="SELECT 1")
    assert "rule 1 msg" in hint.context
    assert "rule 2 msg" in hint.context
