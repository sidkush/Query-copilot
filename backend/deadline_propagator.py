"""Phase L — DeadlinePropagator.

asyncio contextvar-backed deadline that propagates through every awaitable.
Tools check remaining_ms() before starting work; DB drivers use it as timeout.

Pattern:
    with DeadlinePropagator(wall_clock_s=60.0):
        ... any nested async call can read remaining_ms() / expired() ...

Extends Phase K's StepBudget (per-query cap) with per-call deadline.
"""
from __future__ import annotations
import time
from contextvars import ContextVar
from typing import Optional

DEADLINE: ContextVar = ContextVar("askdb_deadline", default=None)

def remaining_ms() -> Optional[int]:
    d = DEADLINE.get(None)
    if d is None:
        return None
    started, wall_clock_s = d
    elapsed = time.monotonic() - started
    return int((wall_clock_s - elapsed) * 1000)

def expired() -> bool:
    rem = remaining_ms()
    if rem is None:
        return False
    return rem <= 0

class DeadlinePropagator:
    def __init__(self, wall_clock_s: float):
        self._wall_clock_s = wall_clock_s
        self._token = None

    def __enter__(self):
        self._token = DEADLINE.set((time.monotonic(), self._wall_clock_s))
        return self

    def __exit__(self, *exc):
        if self._token is not None:
            DEADLINE.reset(self._token)
