"""
Day-2 prerequisite: simultaneous-park test.

Council decision (2026-04-24, locked):
  Day 2 prerequisite: simultaneous-park test (two park sites active in same session)
  must run against the @property shim before ask_user cutover goes live. If the shim
  returns the wrong slot when both sites are active, redesign before proceeding.

This test uses the ParkRegistry directly (not the shim, which ships Day 2).
It verifies that two concurrent parks in the same registry resolve independently
and that cross-vocab resolution is correctly rejected.

Run this file to gate Day-2 go/no-go:
  pytest tests/test_w2_park_simultaneous.py -v
  pytest tests/test_w2_park_simultaneous.py --count=200 -n auto
"""
import asyncio
import pytest

from agent_park import ParkRegistry, park_for_user_response

pytestmark = pytest.mark.asyncio


async def test_simultaneous_parks_independent_resolution():
    """
    W1 cascade park + W2 mismatch park active simultaneously in same registry.

    Each slot resolves independently:
      - Cross-vocab resolve is rejected.
      - Correct resolve delivers to the right slot.
      - Both slots discarded after resolution.
    """
    registry = ParkRegistry()

    w1_slot = registry.arm(
        "w1_cascade",
        frozenset({"retry", "summarize", "change_approach"}),
        "summarize",
    )
    w2_slot = registry.arm(
        "w2_mismatch",
        frozenset({"abort", "station_proxy"}),
        "abort",
    )

    # Cross-resolve: W2 word → W1 slot → must reject
    assert not registry.resolve(w1_slot.park_id, "station_proxy"), \
        "W2 word 'station_proxy' must be rejected by W1 slot"
    assert not registry.resolve(w1_slot.park_id, "abort"), \
        "W2 word 'abort' must be rejected by W1 slot"

    # Cross-resolve: W1 word → W2 slot → must reject
    assert not registry.resolve(w2_slot.park_id, "summarize"), \
        "W1 word 'summarize' must be rejected by W2 slot"
    assert not registry.resolve(w2_slot.park_id, "change_approach"), \
        "W1 word 'change_approach' must be rejected by W2 slot"

    # Both still unresolved
    assert w1_slot.response is None
    assert w2_slot.response is None

    # Correct resolution
    assert registry.resolve(w1_slot.park_id, "retry")
    assert registry.resolve(w2_slot.park_id, "station_proxy")

    assert w1_slot.response == "retry"
    assert w2_slot.response == "station_proxy"
    assert w1_slot.park_id != w2_slot.park_id

    registry.discard(w1_slot.park_id)
    registry.discard(w2_slot.park_id)
    assert registry.get(w1_slot.park_id) is None
    assert registry.get(w2_slot.park_id) is None


async def test_simultaneous_parks_concurrent_wait():
    """
    Two park_for_user_response coroutines run concurrently.
    Each receives its own response; neither interferes with the other.
    """
    registry = ParkRegistry()
    captured_pids: list[str] = []

    # Intercept arm() to capture park_ids in order
    _original_arm = registry.arm

    def _capturing_arm(kind, expected_values, default_on_timeout):
        slot = _original_arm(kind, expected_values, default_on_timeout)
        captured_pids.append(slot.park_id)
        return slot

    registry.arm = _capturing_arm

    async def _resolve_after(park_id: str, response: str, delay: float):
        await asyncio.sleep(delay)
        registry.resolve(park_id, response)

    # Launch two concurrent parks
    task_w1 = asyncio.create_task(
        park_for_user_response(
            registry,
            kind="w1_cascade",
            expected_values=frozenset({"retry", "summarize"}),
            default_on_timeout="summarize",
            deadline_seconds=5.0,
        )
    )
    task_w2 = asyncio.create_task(
        park_for_user_response(
            registry,
            kind="w2_mismatch",
            expected_values=frozenset({"abort", "station_proxy"}),
            default_on_timeout="abort",
            deadline_seconds=5.0,
        )
    )

    # Wait briefly for both to arm, then resolve
    await asyncio.sleep(0.02)

    assert len(captured_pids) == 2, f"Expected 2 park_ids; got {captured_pids}"
    pid_w1, pid_w2 = captured_pids

    # Resolve each with correct vocab
    resolve_w1 = asyncio.create_task(_resolve_after(pid_w1, "retry", 0.05))
    resolve_w2 = asyncio.create_task(_resolve_after(pid_w2, "station_proxy", 0.05))

    results = await asyncio.gather(task_w1, task_w2, resolve_w1, resolve_w2)
    choice_w1, _ = results[0]
    choice_w2, _ = results[1]

    assert choice_w1 == "retry", f"W1 park got {choice_w1!r}"
    assert choice_w2 == "station_proxy", f"W2 park got {choice_w2!r}"


async def test_stale_resolve_does_not_bleed():
    """
    Resolve sent to a discarded park_id does not affect an active slot.
    Prevents stale /respond from prior park satisfying a new park.
    """
    registry = ParkRegistry()

    # First park — resolve and discard
    old_slot = registry.arm("w2_mismatch", frozenset({"abort"}), "abort")
    old_pid = old_slot.park_id
    registry.resolve(old_pid, "abort")
    registry.discard(old_pid)

    # Second park — should not be affected by old_pid resolve
    new_slot = registry.arm("w2_mismatch", frozenset({"abort", "station_proxy"}), "abort")

    # Attempt to resolve new slot using old park_id → must fail
    ok = registry.resolve(old_pid, "station_proxy")
    assert not ok, "Stale park_id must not resolve new slot"
    assert new_slot.response is None

    registry.discard(new_slot.park_id)
