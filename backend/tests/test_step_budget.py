"""Unit tests: StepBudget + DeadlineCtx."""
import time
import pytest

from step_budget import StepBudget, DeadlineCtx, BudgetExceeded


def test_fresh_budget_allows_up_to_step_cap():
    b = StepBudget(max_steps=3, wall_clock_s=60.0, cost_cap_usd=1.0)
    b.consume_step("tool_call", cost_usd=0.01)
    b.consume_step("tool_call", cost_usd=0.01)
    b.consume_step("tool_call", cost_usd=0.01)
    assert b.steps_remaining() == 0


def test_step_overflow_raises():
    b = StepBudget(max_steps=1, wall_clock_s=60.0, cost_cap_usd=1.0)
    b.consume_step("t", cost_usd=0.0)
    with pytest.raises(BudgetExceeded) as exc_info:
        b.consume_step("t", cost_usd=0.0)
    assert "step cap 1 exceeded" in str(exc_info.value).lower()


def test_cost_overflow_raises():
    b = StepBudget(max_steps=10, wall_clock_s=60.0, cost_cap_usd=0.05)
    b.consume_step("t", cost_usd=0.03)
    with pytest.raises(BudgetExceeded) as exc_info:
        b.consume_step("t", cost_usd=0.03)
    assert "cost cap" in str(exc_info.value).lower()


def test_deadline_propagation_via_context():
    ctx = DeadlineCtx(wall_clock_s=0.05)
    assert ctx.remaining_ms() > 0
    time.sleep(0.08)
    assert ctx.remaining_ms() <= 0
    assert ctx.expired()


def test_remaining_ms_monotonic_non_increasing():
    ctx = DeadlineCtx(wall_clock_s=1.0)
    r1 = ctx.remaining_ms()
    time.sleep(0.01)
    r2 = ctx.remaining_ms()
    assert r2 <= r1
