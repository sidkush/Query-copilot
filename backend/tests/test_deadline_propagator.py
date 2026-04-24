"""DeadlinePropagator — contextvar deadline across nested async calls."""
import asyncio
import time
import pytest
from deadline_propagator import (
    DeadlinePropagator, DEADLINE, remaining_ms, expired,
)

def test_default_no_deadline_returns_none():
    assert DEADLINE.get(None) is None
    assert remaining_ms() is None
    assert expired() is False

def test_set_deadline_via_context_manager():
    with DeadlinePropagator(wall_clock_s=0.1):
        rem = remaining_ms()
        assert rem is not None and rem > 0
    assert DEADLINE.get(None) is None

def test_remaining_ms_decreases_over_time():
    async def _probe():
        with DeadlinePropagator(wall_clock_s=1.0):
            r1 = remaining_ms()
            await asyncio.sleep(0.05)
            r2 = remaining_ms()
            assert r2 < r1
            assert r2 > 0
    asyncio.run(_probe())

def test_deadline_expires():
    async def _probe():
        with DeadlinePropagator(wall_clock_s=0.05):
            await asyncio.sleep(0.1)
            assert expired() is True
    asyncio.run(_probe())

def test_nested_deadline_uses_tightest():
    async def _probe():
        with DeadlinePropagator(wall_clock_s=10.0):
            outer_rem = remaining_ms()
            with DeadlinePropagator(wall_clock_s=0.1):
                inner_rem = remaining_ms()
                assert inner_rem < outer_rem
                assert inner_rem > 0
            restored = remaining_ms()
            assert restored > 5000
    asyncio.run(_probe())
