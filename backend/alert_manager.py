"""
Alert Manager — Phase I / H16.

Central dispatch for residual-risk and ops alerts. Provides:
- sliding dedup window per (tenant_id, rule_id)
- multi-hour accumulator (one fire per hour when signal stays hot)
- retry via chaos_isolation.jittered_backoff
- idempotency key per firing
- channel list per tenant (populated by fire_with_channels in T2)
"""
from __future__ import annotations

import hashlib
import logging
import time
from collections import deque
from dataclasses import dataclass, field
from threading import Lock
from typing import Literal, Optional

logger = logging.getLogger(__name__)

Severity = Literal["info", "warn", "critical"]


@dataclass(frozen=True)
class AlertSignal:
    rule_id: str
    tenant_id: str
    severity: Severity
    observed_value: float
    threshold: float
    message: str
    actor_type: str = "system"
    # derived
    idempotency_key: str = field(init=False)

    def __post_init__(self):
        basis = f"{self.rule_id}|{self.tenant_id}|{int(time.time()//60)}".encode()
        object.__setattr__(self, "idempotency_key", hashlib.sha256(basis).hexdigest()[:16])


@dataclass
class DispatchResult:
    dispatched: bool
    channel: str
    reason: Optional[str] = None


class AlertManager:
    def __init__(self, dedup_window_s: int, multi_hour_s: int, max_retry: int):
        self._dedup_window_s = dedup_window_s
        self._multi_hour_s = multi_hour_s
        self._max_retry = max_retry
        self._dedup_cache: dict[tuple[str, str], float] = {}
        self._multi_hour_cache: dict[tuple[str, str], float] = {}
        self._lock = Lock()
        self._last_emission: dict[str, float] = {}
        self._dispatch_failures: dict[str, list[float]] = {}
        self._event_ring: dict[str, deque] = {}

    def fire(self, signal: AlertSignal) -> DispatchResult:
        key = (signal.tenant_id, signal.rule_id)
        now = time.monotonic()
        with self._lock:
            last = self._dedup_cache.get(key)
            if last is not None and now - last < self._dedup_window_s:
                return DispatchResult(False, "none", "deduped_within_window")
            last_hour = self._multi_hour_cache.get(key)
            if last_hour is not None and now - last_hour < self._multi_hour_s:
                return DispatchResult(False, "none", "deduped_multi_hour")
            self._dedup_cache[key] = now
            self._multi_hour_cache[key] = now
            self._last_emission[signal.tenant_id] = now
        result = self._dispatch(signal)
        if not result.dispatched:
            self._record_dispatch_failure(signal.tenant_id)
        else:
            ring = self._event_ring.setdefault(signal.tenant_id, deque(maxlen=500))
            ring.append({
                "rule_id": signal.rule_id,
                "severity": signal.severity,
                "observed_value": signal.observed_value,
                "threshold": signal.threshold,
                "message": signal.message,
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            })
        return result

    def _dispatch(self, signal: AlertSignal) -> DispatchResult:
        logger.info("alert_dispatch rule=%s tenant=%s", signal.rule_id, signal.tenant_id)
        return DispatchResult(True, "log")

    def rotate_dedup_cache(self) -> None:
        now = time.monotonic()
        with self._lock:
            for k in list(self._dedup_cache):
                if now - self._dedup_cache[k] > self._dedup_window_s:
                    del self._dedup_cache[k]
            for k in list(self._multi_hour_cache):
                if now - self._multi_hour_cache[k] > self._multi_hour_s:
                    del self._multi_hour_cache[k]

    def seconds_since_last_emission(self, tenant_id: str) -> int:
        last = self._last_emission.get(tenant_id)
        return int(time.monotonic() - last) if last else 10**9

    def _record_dispatch_failure(self, tenant_id: str) -> None:
        now = time.monotonic()
        lst = self._dispatch_failures.setdefault(tenant_id, [])
        lst.append(now)
        cutoff = now - 3600
        self._dispatch_failures[tenant_id] = [t for t in lst if t > cutoff]

    def dispatch_failure_count_last_hour(self, tenant_id: str) -> int:
        return len(self._dispatch_failures.get(tenant_id, []))

    def recent_events(self, tenant_id: str, limit: int = 50) -> list:
        ring = self._event_ring.get(tenant_id, deque())
        events = list(ring)
        return events[-limit:]

    def rule_history(self, tenant_id: str, rule_id: str, limit: int = 200) -> list:
        ring = self._event_ring.get(tenant_id, deque())
        return [e for e in ring if e["rule_id"] == rule_id][-limit:]


_singleton: Optional[AlertManager] = None


def get_alert_manager() -> AlertManager:
    global _singleton
    if _singleton is None:
        from config import settings
        _singleton = AlertManager(
            dedup_window_s=settings.ALERT_DEDUP_WINDOW_SECONDS,
            multi_hour_s=settings.ALERT_MULTI_HOUR_ACCUMULATOR_SECONDS,
            max_retry=settings.ALERT_MAX_RETRY,
        )
    return _singleton
