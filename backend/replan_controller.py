"""Ring 3->4 glue — consume ReplanBudget on ScopeValidator violations
and produce a structured hint that SQL-gen can absorb on its next call.
"""
from __future__ import annotations

from dataclasses import dataclass

from replan_budget import BudgetExceeded, ReplanBudget


@dataclass(frozen=True)
class ReplanHint:
    reason: str            # First violation's rule_id.value
    context: str           # Concatenated violation messages for prompt injection
    original_sql: str


class ReplanController:
    def __init__(self, budget: ReplanBudget):
        self.budget = budget

    def on_violation(self, result, original_sql: str):
        """Return a ReplanHint if budget allows, else None.

        `result` is a ValidatorResult.
        """
        if not result or not result.violations:
            return None
        first = result.violations[0]
        try:
            self.budget.consume(first.rule_id.value)
        except BudgetExceeded:
            return None
        context = "\n".join(
            f"- [{v.rule_id.value}] {v.message}" for v in result.violations
        )
        return ReplanHint(
            reason=first.rule_id.value,
            context=context,
            original_sql=original_sql,
        )
