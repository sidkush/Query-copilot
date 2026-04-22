"""Replan budget — H6. Caps how many times a single query can trigger
Ring-3 replan before the validator gives up and returns a warning without
blocking execution.
"""
from __future__ import annotations

from dataclasses import dataclass, field


class BudgetExceeded(RuntimeError):
    """Raised when .consume() is called past the cap."""


@dataclass
class ReplanBudget:
    max_replans: int = 1
    history: list = field(default_factory=list)

    def consume(self, reason: str) -> None:
        if len(self.history) >= self.max_replans:
            raise BudgetExceeded(
                f"Replan budget exhausted ({self.max_replans}); history={self.history}"
            )
        self.history.append(reason)

    def remaining(self) -> int:
        return max(0, self.max_replans - len(self.history))

    def reset(self) -> None:
        self.history = []
