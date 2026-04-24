"""
Park primitive for agent-controlled user interactions.

Threading model:
  ParkRegistry._lock (threading.Lock) guards dict mutations.
  The lock is NEVER held across an await point — only synchronous
  dict reads/writes occur while locked, so the event loop is never blocked.

  ParkSlot.event is asyncio.Event, not threading.Event.
  _park_for_user_response (AgentEngine method) is async def; threading.Event.wait()
  would block the event loop thread. asyncio.Event.wait() does not.
  asyncio.Event() created in a sync thread (arm()) is valid in Python 3.10+; the
  event associates with the running event loop at first wait(), not at construction.

GDPR Art. 7(1) binding:
  Every resolution writes consent_basis ∈ {"user_act", "timeout_default"} to the slot.
  Callers must record this in the tenant audit-ledger sidecar.
  Column names / schema-derived strings go in the sidecar, NOT in ParkSlot — ParkSlot
  stores only {park_id, kind, expected_values, default_on_timeout, event, response,
  consent_basis}.
"""
from __future__ import annotations

import asyncio
import logging
import threading
import uuid
from dataclasses import dataclass
from typing import Callable, Optional

logger = logging.getLogger(__name__)


@dataclass
class ParkSlot:
    park_id: str
    kind: str
    expected_values: frozenset
    default_on_timeout: str
    event: asyncio.Event
    response: Optional[str] = None
    consent_basis: Optional[str] = None  # "user_act" | "timeout_default"


class ParkRegistry:
    """
    Per-session registry of active park slots.

    threading.Lock guards _slots. The lock is NEVER held across an await
    point — all locked operations are synchronous dict accesses only.
    """

    def __init__(self) -> None:
        self._slots: dict[str, ParkSlot] = {}
        self._lock = threading.Lock()

    def arm(
        self,
        kind: str,
        expected_values: frozenset,
        default_on_timeout: str,
    ) -> ParkSlot:
        """Create and register a new park slot. Returns the slot."""
        slot = ParkSlot(
            park_id=str(uuid.uuid4()),
            kind=kind,
            expected_values=frozenset(expected_values),
            default_on_timeout=default_on_timeout,
            event=asyncio.Event(),
        )
        with self._lock:
            self._slots[slot.park_id] = slot
        return slot

    def resolve(
        self,
        park_id: str,
        raw_response: str,
        *,
        allow_freetext: bool = False,
    ) -> bool:
        """
        Attempt to resolve a park slot with a user response.

        Returns True if accepted, False if rejected.
        Rejection causes: unknown park_id, or vocab mismatch when
        allow_freetext=False.

        event.set() is called outside the lock — never hold lock across I/O.
        """
        with self._lock:
            slot = self._slots.get(park_id)
            if slot is None:
                return False
            normalized = raw_response.strip().lower()
            if not allow_freetext and normalized not in slot.expected_values:
                return False
            slot.response = normalized
            slot.consent_basis = "user_act"
        slot.event.set()
        return True

    def discard(self, park_id: str) -> None:
        """Remove a slot from the registry (called in finally block)."""
        with self._lock:
            self._slots.pop(park_id, None)

    def get(self, park_id: str) -> Optional[ParkSlot]:
        with self._lock:
            return self._slots.get(park_id)


async def park_for_user_response(
    registry: ParkRegistry,
    *,
    kind: str,
    expected_values: frozenset,
    default_on_timeout: str,
    deadline_seconds: float,
    cancelled_predicate: Callable[[], bool] = lambda: False,
) -> tuple[str, str]:
    """
    Suspend the calling coroutine until a user response arrives or deadline expires.

    Returns (choice, park_id).
      choice — a value from expected_values if resolved, else default_on_timeout.
      park_id — the slot id; embed in the SSE payload so /respond can correlate.

    consent_basis written to slot: "user_act" | "timeout_default".
    Callers must record this in the tenant audit-ledger sidecar.

    Inner asyncio.wait_for timeout is capped at 1.0s so cancel signals are
    honored within AGENT_CANCEL_GRACE_MS=2000ms (checked at loop top each
    iteration — cancel-first pattern).
    """
    slot = registry.arm(kind, expected_values, default_on_timeout)
    loop = asyncio.get_event_loop()
    deadline = loop.time() + deadline_seconds
    logger.debug("PARK arm kind=%s park_id=%s expected=%s", kind, slot.park_id, sorted(expected_values))
    try:
        while slot.response is None:
            if cancelled_predicate():  # cancel-first: check before awaiting
                break
            remaining = deadline - loop.time()
            if remaining <= 0:
                break
            try:
                await asyncio.wait_for(slot.event.wait(), timeout=min(remaining, 1.0))
            except asyncio.TimeoutError:
                pass
        if slot.response is None:
            slot.response = default_on_timeout
            slot.consent_basis = "timeout_default"
        logger.debug(
            "PARK resolve park_id=%s response=%r consent_basis=%s",
            slot.park_id, slot.response, slot.consent_basis,
        )
        return slot.response, slot.park_id
    finally:
        registry.discard(slot.park_id)
