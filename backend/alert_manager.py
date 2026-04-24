"""
Alert Manager — Phase I stub.

Provides AlertSignal dataclass and get_alert_manager() used by
residual_risk_telemetry detectors.
"""
from __future__ import annotations

import hashlib
import logging
import time
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
        basis = f"{self.rule_id}|{self.tenant_id}|{int(time.time() // 60)}".encode()
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
        self._lock = Lock()

    def fire(self, signal: AlertSignal) -> DispatchResult:
        logger.info("alert fired rule=%s tenant=%s severity=%s", signal.rule_id, signal.tenant_id, signal.severity)
        return DispatchResult(dispatched=True, channel="log")


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
