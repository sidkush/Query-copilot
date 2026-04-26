"""Replan budget — H6 cap of 1 re-plan per query."""
import pytest
from replan_budget import ReplanBudget, BudgetExceeded


def test_fresh_budget_allows_one_replan():
    b = ReplanBudget(max_replans=1)
    assert b.remaining() == 1
    b.consume("rule_fired:range_mismatch")
    assert b.remaining() == 0


def test_second_consume_raises():
    b = ReplanBudget(max_replans=1)
    b.consume("r1")
    with pytest.raises(BudgetExceeded):
        b.consume("r2")


def test_reset_restores_budget():
    b = ReplanBudget(max_replans=1)
    b.consume("x")
    b.reset()
    assert b.remaining() == 1


def test_budget_2_allows_two_replans():
    b = ReplanBudget(max_replans=2)
    assert b.remaining() == 2
    b.consume("rule_fired:range_mismatch")
    assert b.remaining() == 1
    b.consume("rule_fired:fanout_inflation")
    assert b.remaining() == 0
    with pytest.raises(BudgetExceeded):
        b.consume("rule_3")


def test_history_tracks_reasons():
    b = ReplanBudget(max_replans=2)
    b.consume("rule_1")
    b.consume("rule_2")
    assert b.history == ["rule_1", "rule_2"]
