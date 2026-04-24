"""Ring 8 — ModelLadder.

Routes Anthropic model choice by role, not by retry count.
Haiku 4.5 handles step execution (fast, cheap, single-CTE).
Sonnet 4.6 handles plan emission (structured reasoning, no extended-thinking).
Opus 4.7 1M handles recovery when scope validator violates twice consecutively.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class PlanRole(Enum):
    STEP_EXEC = "step_exec"
    PLAN_EMIT = "plan_emit"
    RECOVERY = "recovery"


class LadderUnavailable(RuntimeError):
    pass


@dataclass(frozen=True)
class ModelLadder:
    step_exec: str
    plan_emit: str
    recovery: str

    def select(self, role: PlanRole) -> str:
        if role is PlanRole.STEP_EXEC:
            return self.step_exec
        if role is PlanRole.PLAN_EMIT:
            return self.plan_emit
        if role is PlanRole.RECOVERY:
            return self.recovery
        raise LadderUnavailable(f"unknown role: {role!r}")

    @classmethod
    def from_settings(cls) -> "ModelLadder":
        from config import settings
        return cls(
            step_exec=settings.MODEL_LADDER_STEP_EXEC,
            plan_emit=settings.MODEL_LADDER_PLAN_EMIT,
            recovery=settings.MODEL_LADDER_RECOVERY,
        )
