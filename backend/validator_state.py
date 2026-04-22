"""Validator lifecycle state machine — H9.

States:
  pending   → (initial)
  running   → validator is executing rules
  passed    → all enabled rules returned no violations
  violated  → at least one rule returned Violation; replan path taken
  failed    → validator itself crashed (fail-open, but logged)

Legal transitions:
  pending → running
  running → passed | violated | failed
  (terminal states: passed, violated, failed)
"""
from __future__ import annotations

from dataclasses import dataclass, field


class InvalidTransition(RuntimeError):
    pass


_LEGAL_TRANSITIONS = {
    "pending": {"running"},
    "running": {"passed", "violated", "failed"},
    "passed": set(),
    "violated": set(),
    "failed": set(),
}


@dataclass
class ValidatorState:
    state: str = "pending"
    history: list = field(default_factory=lambda: ["pending"])

    def transition(self, new_state: str) -> None:
        allowed = _LEGAL_TRANSITIONS.get(self.state, set())
        if new_state not in allowed:
            raise InvalidTransition(
                f"Cannot move {self.state!r} → {new_state!r}; allowed: {sorted(allowed)}"
            )
        self.state = new_state
        self.history.append(new_state)
