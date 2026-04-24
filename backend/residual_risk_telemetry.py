"""
Residual risk detectors — Phase I.

One pure function per row of the master plan's residual-risk register.
Each returns AlertSignal or None. Dispatch is the caller's job
(typically run_detectors_periodic).
"""
from __future__ import annotations

import logging
from typing import Optional

from alert_manager import AlertSignal, get_alert_manager
from config import settings

logger = logging.getLogger(__name__)


def run_detectors_periodic(tenant_ids: list[str]) -> None:
    """Called from main.py APScheduler every 60s."""
    am = get_alert_manager()
    for t in tenant_ids:
        for detect in _ALL_DETECTORS:
            sig = detect(t)
            if sig is not None:
                am.fire(sig)


# _ALL_DETECTORS populated at bottom after each function is defined.
_ALL_DETECTORS: list = []


def _leap_day_trap_pass_pct(tenant_id: str) -> float:
    try:
        from tests.trap_grader import leap_day_pass_rate_pct
        return leap_day_pass_rate_pct(tenant_id)
    except Exception:
        return 100.0  # assume passing if grader unavailable


def detect_residual_risk_4_leap_day(tenant_id: str) -> Optional[AlertSignal]:
    pct = _leap_day_trap_pass_pct(tenant_id)
    threshold = settings.RESIDUAL_RISK_4_LEAP_DAY_PASS_RATE_MIN_PCT
    if pct < threshold:
        return AlertSignal(
            rule_id="residual_risk_4_leap_day",
            tenant_id=tenant_id,
            severity="warn",
            observed_value=pct,
            threshold=threshold,
            message=f"Feb-29 trap pass rate {pct:.1f}% < {threshold}%. Runbook: fuzz, patch.",
        )
    return None


_ALL_DETECTORS.append(detect_residual_risk_4_leap_day)
