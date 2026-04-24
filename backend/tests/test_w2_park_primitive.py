"""
Race harness for the park_for_user_response primitive.

Council decision (2026-04-24, locked):
  - pytest-asyncio + pytest-xdist; run with --count=200 -n auto for stress
  - Tests must be green before any park site is migrated (Day 2 gate)

Four named race tests:
  1. test_yield_before_flag_set  — resolve arrives before event.wait() entered
  2. test_cancel_during_grace    — cancelled_predicate breaks loop < CANCEL_GRACE_MS
  3. test_vocab_collision        — W2 park rejects W1 vocab word (wrong expected_values)
  4. test_freetext_rejection     — free-text rejected when allow_freetext=False

Run:
  pytest tests/test_w2_park_primitive.py -v
  pytest tests/test_w2_park_primitive.py --count=200 -n auto  (stress)
"""
import asyncio
import time

import pytest

from agent_park import ParkRegistry, ParkSlot, park_for_user_response

pytestmark = pytest.mark.asyncio


# ── 1. test_yield_before_flag_set ────────────────────────────────────────────

async def test_yield_before_flag_set():
    """
    resolve() arrives before park_for_user_response enters its first event.wait().

    In the legacy design, _waiting_for_user was set AFTER yield, so a fast /respond
    could 409. The new primitive checks slot.response at loop entry (not a flag), so
    a pre-loaded response is returned immediately without ever awaiting the event.
    """
    registry = ParkRegistry()

    # Intercept arm() to resolve the slot immediately (simulates pre-await /respond)
    _original_arm = registry.arm

    def _arm_and_presolve(kind, expected_values, default_on_timeout):
        slot = _original_arm(kind, expected_values, default_on_timeout)
        ok = registry.resolve(slot.park_id, "station_proxy")
        assert ok, "Pre-loaded resolve must be accepted"
        return slot

    registry.arm = _arm_and_presolve

    choice, park_id = await park_for_user_response(
        registry,
        kind="w2_mismatch",
        expected_values=frozenset({"abort", "station_proxy"}),
        default_on_timeout="abort",
        deadline_seconds=2.0,
    )

    assert choice == "station_proxy", f"Pre-loaded response must be returned; got {choice!r}"
    assert park_id, "park_id must be non-empty"
    # Slot must be discarded (finally block ran)
    assert registry.get(park_id) is None, "Slot must be discarded after resolution"


# ── 2. test_cancel_during_grace ───────────────────────────────────────────────

async def test_cancel_during_grace():
    """
    cancelled_predicate fires while park_for_user_response is waiting.
    Loop must exit and return default_on_timeout within AGENT_CANCEL_GRACE_MS=2000ms.

    Inner timeout is 1.0s, so the predicate is checked every ≤1s.
    Total elapsed must be < 2.0s.
    """
    registry = ParkRegistry()
    _cancelled = False

    async def _set_cancel_after(delay: float):
        nonlocal _cancelled
        await asyncio.sleep(delay)
        _cancelled = True

    cancel_task = asyncio.create_task(_set_cancel_after(0.05))

    t0 = time.monotonic()
    choice, park_id = await park_for_user_response(
        registry,
        kind="w1_cascade",
        expected_values=frozenset({"retry", "summarize", "change_approach"}),
        default_on_timeout="summarize",
        deadline_seconds=10.0,
        cancelled_predicate=lambda: _cancelled,
    )
    elapsed = time.monotonic() - t0

    await cancel_task
    assert choice == "summarize", f"Cancel must yield default_on_timeout; got {choice!r}"
    assert elapsed < 2.0, f"Must exit within AGENT_CANCEL_GRACE_MS; took {elapsed:.3f}s"
    assert registry.get(park_id) is None, "Slot must be discarded after cancel"


# ── 3. test_vocab_collision ───────────────────────────────────────────────────

async def test_vocab_collision():
    """
    W2 park slot rejects W1 vocab word 'summarize'.

    Legacy design: W1 cascade and W2 mismatch share one _user_response field.
    A response of 'summarize' satisfies the W1 wait AND the W2 wait silently.
    New design: park_id + expected_values gate ensures vocab isolation.
    """
    registry = ParkRegistry()

    # Arm a W2 slot
    w2_slot = registry.arm(
        "w2_mismatch",
        frozenset({"abort", "station_proxy"}),
        "abort",
    )

    # W1 vocab word sent to W2 park_id → must be rejected
    rejected = registry.resolve(w2_slot.park_id, "summarize")
    assert not rejected, "W1 word 'summarize' must be rejected by W2 slot"
    assert w2_slot.response is None, "W2 slot must remain unresolved"

    # Correct W2 word accepted
    accepted = registry.resolve(w2_slot.park_id, "station_proxy")
    assert accepted, "W2 word 'station_proxy' must be accepted"
    assert w2_slot.response == "station_proxy"
    assert w2_slot.consent_basis == "user_act"

    registry.discard(w2_slot.park_id)
    assert registry.get(w2_slot.park_id) is None


# ── 4. test_freetext_rejection ────────────────────────────────────────────────

async def test_freetext_rejection():
    """
    Free-text response rejected when allow_freetext=False (default).
    Free-text accepted when allow_freetext=True.

    Prevents users from injecting arbitrary strings that bypass vocab gate.
    """
    registry = ParkRegistry()

    slot = registry.arm(
        "w2_mismatch",
        frozenset({"abort", "station_proxy"}),
        "abort",
    )

    # Long free-text → rejected
    ok = registry.resolve(
        slot.park_id,
        "I want to use station data instead of rider data please",
        allow_freetext=False,
    )
    assert not ok, "Free-text must be rejected when allow_freetext=False"
    assert slot.response is None

    # Empty string → rejected (not in expected_values)
    ok = registry.resolve(slot.park_id, "", allow_freetext=False)
    assert not ok

    # Vocab word with surrounding whitespace → normalized and accepted
    ok = registry.resolve(slot.park_id, "  station_proxy  ", allow_freetext=False)
    assert ok, "Whitespace-padded vocab word must be accepted after strip"
    assert slot.response == "station_proxy"
    registry.discard(slot.park_id)

    # allow_freetext=True: any non-empty text accepted
    slot2 = registry.arm("ask_user", frozenset({"yes", "no"}), "no")
    ok2 = registry.resolve(
        slot2.park_id,
        "Yes please go ahead with the analysis",
        allow_freetext=True,
    )
    assert ok2, "Free-text must be accepted when allow_freetext=True"
    assert slot2.response == "yes please go ahead with the analysis"
    registry.discard(slot2.park_id)


# ── Bonus: timeout yields default_on_timeout with correct consent_basis ───────

async def test_timeout_yields_default():
    """Deadline exhausted → default_on_timeout returned, consent_basis='timeout_default'."""
    registry = ParkRegistry()

    # Use very short deadline
    choice, park_id = await park_for_user_response(
        registry,
        kind="w2_mismatch",
        expected_values=frozenset({"abort", "station_proxy"}),
        default_on_timeout="abort",
        deadline_seconds=0.05,
    )

    assert choice == "abort"
    assert registry.get(park_id) is None  # slot discarded


async def test_stale_park_id_rejected():
    """resolve() with unknown/stale park_id → False (no slot corruption)."""
    registry = ParkRegistry()
    slot = registry.arm("w2_mismatch", frozenset({"abort"}), "abort")
    registry.discard(slot.park_id)

    ok = registry.resolve(slot.park_id, "abort")
    assert not ok, "Stale park_id must be rejected after discard"
