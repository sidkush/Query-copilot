"""Ring 8 — StepBudget + DeadlineCtx."""
from __future__ import annotations

import time
from dataclasses import dataclass, field


class BudgetExceeded(RuntimeError):
    """Raised when consume_step would exceed a hard cap."""


@dataclass
class StepBudget:
    max_steps: int
    wall_clock_s: float
    cost_cap_usd: float
    _steps_used: int = field(default=0, init=False)
    _cost_used_usd: float = field(default=0.0, init=False)
    _started_at: float = field(default_factory=time.monotonic, init=False)

    def consume_step(self, kind: str, cost_usd: float) -> None:
        if self._steps_used + 1 > self.max_steps:
            raise BudgetExceeded(
                f"step cap {self.max_steps} exceeded at step {self._steps_used + 1} ({kind})"
            )
        if self._cost_used_usd + cost_usd > self.cost_cap_usd:
            raise BudgetExceeded(
                f"cost cap ${self.cost_cap_usd:.2f} exceeded (would hit "
                f"${self._cost_used_usd + cost_usd:.4f} at step {kind!r})"
            )
        if (time.monotonic() - self._started_at) > self.wall_clock_s:
            raise BudgetExceeded(
                f"wall clock {self.wall_clock_s:.1f}s exceeded"
            )
        self._steps_used += 1
        self._cost_used_usd += cost_usd

    def steps_remaining(self) -> int:
        return max(0, self.max_steps - self._steps_used)

    def cost_remaining_usd(self) -> float:
        return max(0.0, self.cost_cap_usd - self._cost_used_usd)


@dataclass
class DeadlineCtx:
    wall_clock_s: float
    _started_at: float = field(default_factory=time.monotonic, init=False)

    def remaining_ms(self) -> int:
        elapsed = time.monotonic() - self._started_at
        return int((self.wall_clock_s - elapsed) * 1000)

    def expired(self) -> bool:
        return self.remaining_ms() <= 0
