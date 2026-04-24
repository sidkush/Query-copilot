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


def _trap_fn_rate_pct(tenant_id: str) -> float:
    """Read trap-grader false-negative rate for tenant's most recent run."""
    try:
        from tests.trap_grader import latest_fn_rate_pct
        return latest_fn_rate_pct(tenant_id)
    except Exception:
        return 0.0


def detect_residual_risk_1_llm_pretraining_fn(tenant_id: str) -> Optional[AlertSignal]:
    rate = _trap_fn_rate_pct(tenant_id)
    threshold = settings.RESIDUAL_RISK_1_TRAP_FN_RATE_MAX_PCT
    if rate > threshold:
        return AlertSignal(
            rule_id="residual_risk_1_llm_pretraining_fn",
            tenant_id=tenant_id,
            severity="warn",
            observed_value=rate,
            threshold=threshold,
            message=f"Trap-suite false-negative rate {rate:.2f}% > {threshold}%. Runbook: add pattern, redeploy.",
        )
    return None


_ALL_DETECTORS.append(detect_residual_risk_1_llm_pretraining_fn)
