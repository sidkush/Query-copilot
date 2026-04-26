"""Ring 3->4 glue — consume ReplanBudget on ScopeValidator violations
and produce a structured hint that SQL-gen can absorb on its next call.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Tuple

from replan_budget import BudgetExceeded, ReplanBudget

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ReplanHint:
    reason: str            # First violation's rule_id.value
    context: str           # Concatenated violation messages for prompt injection
    original_sql: str
    rule_ids: Tuple[str, ...] = field(default_factory=tuple)  # A16 fold — all rule ids


class ReplanController:
    def __init__(self, budget: ReplanBudget):
        self.budget = budget

    def on_violation(self, result, original_sql: str):
        """Return a ReplanHint if budget allows, else None.

        A16 adversarial fold — multi-violation budget desync fix:
        - Original code consumed budget by ONE (first violation only) but
          discarded the other rule_ids from the audit history. With 3
          simultaneous violations (Rule 2 + 7 + 11), forensics could only
          see Rule 2.
        - New behaviour: consume budget ONCE per replan turn (semantically
          correct — the LLM gets one re-shot per validation round), but
          record ALL rule_ids in `ReplanHint.rule_ids` so audit ledger
          captures the full picture.

        `result` is a ValidatorResult.
        """
        if not result or not result.violations:
            return None
        first = result.violations[0]
        try:
            self.budget.consume(first.rule_id.value)
        except BudgetExceeded:
            logger.info(
                "replan budget exhausted on rule_id=%s with %d concurrent violations",
                first.rule_id.value, len(result.violations),
            )
            return None
        context = "\n".join(
            f"- [{v.rule_id.value}] {v.message}" for v in result.violations
        )
        # A16 fold — preserve all rule_ids for audit forensics.
        all_rule_ids = tuple(v.rule_id.value for v in result.violations)
        return ReplanHint(
            reason=first.rule_id.value,
            context=context,
            original_sql=original_sql,
            rule_ids=all_rule_ids,
        )
